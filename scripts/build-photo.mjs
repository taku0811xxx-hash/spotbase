// 「ここトレ！」(NEXT_PUBLIC_APP_MODE=photo) の Capacitor/iOS 向け静的書き出しビルド。
//
// next.config.ts はSpotBase本体(サーバー機能あり)向けの設定を常に置いておきたいため、
// このスクリプトが next.config.photo.ts を一時的に next.config.ts へ差し替えてビルドし、
// 終了後(成功・失敗問わず)に必ず元へ戻す。
//
// また `output: 'export'` は以下と共存できないため、ビルド中だけ一時退避する:
//   - app/api/**            (Firebase Admin SDK 等を使うサーバー専用 Route Handler)
//   - app/pin/[pinId]       (generateStaticParams 未実装の動的ルート)
//   - app/dispatch/[id]     (同上)
// これらはSpotBase本体専用の画面/APIであり、「ここトレ！」では使用しない。
import { existsSync } from "node:fs";
import { rename, cp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const swaps = [
  { from: "next.config.ts", to: "next.config.ts.spotbase-bak" },
  { from: "next.config.photo.ts", to: "next.config.ts", copy: true },
];

const excluded = [
  "app/api",
  "app/pin",
  "app/dispatch",
  "app/admin",
  "app/tools",
];

// iOS(cap sync)時だけ package.json の dependencies から外すプラグイン。
// バックグラウンド位置情報追跡はSpotBase本体(pro)の出動記録専用で、「ここトレ！」の
// iOSバイナリには含めない(App Store審査 Guideline 2.3.1(a) 対応)。
// package.json自体はpro側で必要なため、sync中だけ書き換えて必ず元に戻す。
const PHOTO_IOS_EXCLUDED_PLUGINS = ["@capacitor-community/background-geolocation"];

// app/ 配下にリネームして残すと(例: app/api.excluded)Next.jsがそれも
// 1つのルートセグメントとして扱ってしまう(アンダースコア始まりのprivate folder以外は
// 全てルーティング対象になる仕様のため)。そのため app/ の外の一時ディレクトリへ完全に退避する。
const STAGING_DIR = ".build-photo-tmp";
const moved = [];
let packageJsonBackup = null;

async function moveAside(targetPath) {
  if (!existsSync(targetPath)) return;
  const dest = path.join(STAGING_DIR, targetPath.replace(/[\\/[\]]/g, "_"));
  await mkdir(STAGING_DIR, { recursive: true });
  await rename(targetPath, dest);
  moved.push({ path: targetPath, dest });
}

async function restoreAll() {
  if (packageJsonBackup !== null) {
    await writeFile("package.json", packageJsonBackup);
    packageJsonBackup = null;
  }
  // next.config.ts を退避元(SpotBase用)に戻す
  if (existsSync("next.config.ts.spotbase-bak")) {
    await rm("next.config.ts", { force: true });
    await rename("next.config.ts.spotbase-bak", "next.config.ts");
  }
  // 退避したディレクトリを元の場所へ戻す
  for (const { path: originalPath, dest } of moved.reverse()) {
    if (existsSync(dest)) {
      await rm(originalPath, { recursive: true, force: true });
      await rename(dest, originalPath);
    }
  }
  await rm(STAGING_DIR, { recursive: true, force: true });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} が終了コード ${code} で失敗しました`));
    });
  });
}

async function main() {
  process.env.NEXT_PUBLIC_APP_MODE = "photo";

  // next.config.ts を退避し、next.config.photo.ts の内容を next.config.ts として使う
  await rename("next.config.ts", "next.config.ts.spotbase-bak");
  await cp("next.config.photo.ts", "next.config.ts");

  for (const path of excluded) {
    await moveAside(path);
  }

  await run("npx", ["next", "build", "--webpack"]);

  if (process.argv.includes("--sync")) {
    await syncIosWithoutExcludedPlugins();
  }
}

// package.jsonから除外プラグインを一時的に外して `cap sync ios` を実行し、終了後に復元する。
// (Capacitor CLIはpackage.jsonのdependenciesからプラグインを検出し、ios/App/CapApp-SPM/Package.swift
// を再生成するため、外した状態でsyncすれば iOS側の依存・バイナリから完全に消える)
async function syncIosWithoutExcludedPlugins() {
  const original = await readFile("package.json", "utf8");
  const pkg = JSON.parse(original);
  for (const name of PHOTO_IOS_EXCLUDED_PLUGINS) {
    delete pkg.dependencies?.[name];
    delete pkg.devDependencies?.[name];
  }
  packageJsonBackup = original;
  await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
  await run("npx", ["cap", "sync", "ios"]);
}

// Ctrl+C等で中断された場合もSpotBase本体の設定/ファイル構成を壊れたまま残さない
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await restoreAll();
    process.exit(1);
  });
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  exitCode = 1;
  console.error(`[build-photo] ビルド失敗: ${err.message}`);
} finally {
  await restoreAll();
}
process.exit(exitCode);
