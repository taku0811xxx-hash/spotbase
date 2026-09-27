// 「ここトレ！」(photoモード)専用: iOSアプリ(Capacitor)環境で端末の写真ライブラリを
// 複数選択(multiple selection)付きで直接開くためのユーティリティ。
//
// <input type="file">はiOS標準の仕様で「写真を撮影/ライブラリ」のアクションシートが
// 出てしまい、@capacitor/camera の Camera.getPhoto は1枚しか選べないため、
// 複数選択に対応した @capawesome/capacitor-file-picker の pickImages を使う。
import { FilePicker } from "@capawesome/capacitor-file-picker";

// FilePickerが返すwebPath(blob: URL等)から実際のFileオブジェクトを取り出す。
// PhotoUploadModal側のEXIF解析・アップロード処理はFileを前提にしているため。
async function webPathToFile(webPath: string, fileName: string, mimeType?: string): Promise<File> {
  const res = await fetch(webPath);
  const blob = await res.blob();
  return new File([blob], fileName, { type: mimeType || blob.type || "image/jpeg" });
}

// 写真ライブラリを開き、選択された画像をFile配列として返す。
// ユーザーがキャンセルした場合やエラー時は空配列を返す(呼び出し元は何もしなければよい)。
export async function pickPhotosFromLibrary(): Promise<File[]> {
  try {
    const result = await FilePicker.pickImages({ limit: 0 });
    const files = await Promise.all(
      result.files.map((f, i) =>
        f.webPath ? webPathToFile(f.webPath, f.name || `photo-${Date.now()}-${i}.jpeg`, f.mimeType) : null
      )
    );
    return files.filter((f): f is File => f !== null);
  } catch {
    // ユーザーがライブラリ選択をキャンセルした場合はここに来る
    return [];
  }
}
