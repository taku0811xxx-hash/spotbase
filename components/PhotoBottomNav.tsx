"use client";

// 「ここトレ！」(photoモード)専用: Instagram風の下部固定ナビゲーションバー。
// ヘッダーにあった「＋ 写真を投稿」「マイページ」ボタンをここへ移動し、
// 「ホーム(ギャラリー)」「地図から探す」も合わせてタブとして並べる。
// 白背景+上部の薄いボーダー、画面最下部にfixed配置し、iOSのホームバーと
// 重ならないようenv(safe-area-inset-bottom)分のpaddingを必ず確保する。
//
// 各ページ(app/page.tsx, app/map/page.tsx, app/mypage/page.tsx)側は、
// このバーの高さ分だけスクロール領域の下端にpadding-bottomを確保しておくこと
// (PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASSを参照)。
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Home, Map, PlusCircle, User } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

// Capacitorのwebpath(blob: URL等)から実際のFileオブジェクトを取り出す。
// PhotoUploadModal側のEXIF解析・アップロード処理はFileを前提にしているため。
async function webPathToFile(webPath: string, fileName: string): Promise<File> {
  const res = await fetch(webPath);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

// バー自体の高さ(約64px) + セーフエリア分、コンテンツ側で確保すべき下部余白のクラス。
// 各ページのスクロール領域の末尾に付与する。
export const PHOTO_BOTTOM_NAV_SAFE_PADDING_CLASS = "pb-[calc(64px+env(safe-area-inset-bottom))]";

type Props = {
  // ログイン状態などを確認し、投稿フローに進んでよければtrueを返す
  // (falseの場合はログインモーダル表示など呼び出し元に委ねる)
  onRequestUpload: () => boolean;
  // 端末の写真アルバムで画像が選択されたときに呼ばれる(キャンセル時は呼ばれない)
  onFilesSelected: (files: File[]) => void;
};

export default function PhotoBottomNav({ onRequestUpload, onFilesSelected }: Props) {
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleNewPhotoSpotClick() {
    if (!onRequestUpload()) return;

    // アプリ(Capacitor)環境では、<input type="file">だとiOSの仕様で
    // 「写真を撮影/ライブラリ」の選択肢(アクションシート)が出てしまうため、
    // Capacitor Cameraプラグインでソースをライブラリに固定して直接開く。
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          source: CameraSource.Photos,
          resultType: CameraResultType.Uri,
          quality: 90,
        });
        if (!photo.webPath) return;
        const file = await webPathToFile(photo.webPath, `photo-${Date.now()}.jpeg`);
        onFilesSelected([file]);
      } catch {
        // ユーザーがライブラリ選択をキャンセルした場合はここに来る。
        // 元の画面にとどまるだけでよいので何もしない。
      }
      return;
    }

    // Webブラウザ環境では従来通り<input type="file">を使う
    fileInputRef.current?.click();
  }

  const itemClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-[10px] font-semibold transition-colors ${
      active ? "text-orange-600" : "text-gray-400 hover:text-gray-600"
    }`;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[9999] bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      aria-label="下部ナビゲーション"
    >
      <div className="flex items-stretch max-w-2xl mx-auto">
        <Link href="/" className={itemClass(pathname === "/")}>
          <Home size={22} strokeWidth={pathname === "/" ? 2.5 : 2} />
          ホーム
        </Link>
        <Link href="/map" className={itemClass(pathname === "/map")}>
          <Map size={22} strokeWidth={pathname === "/map" ? 2.5 : 2} />
          地図
        </Link>
        <button onClick={handleNewPhotoSpotClick} className={itemClass(false)}>
          <PlusCircle size={26} strokeWidth={2} className="text-orange-500" />
          投稿
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) onFilesSelected(Array.from(files));
            e.target.value = "";
          }}
        />
        <Link href="/mypage" className={itemClass(pathname === "/mypage")}>
          <User size={22} strokeWidth={pathname === "/mypage" ? 2.5 : 2} />
          マイページ
        </Link>
      </div>
    </nav>
  );
}
