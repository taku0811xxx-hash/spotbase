// 「ここトレ！」(photoモード)専用の永続ストレージヘルパー。
// これまでwindow.localStorageを直接使っていたが、iOSのWKWebViewの
// localStorageは低ストレージ時にOSが自動的にクリアしてしまうことがある。
// @capacitor/preferences はネイティブ側ではUserDefaults(iOS)/SharedPreferences(Android)
// に保存されるため、そうした自動クリーンアップの影響を受けにくい。
// Web(ブラウザ)実行時は内部的にlocalStorageへフォールバックするため、
// 呼び出し側の書き方は変えずにこのモジュール経由に差し替えるだけでよい。
//
// 注意(重要): Preferences.get/setはCapacitorのネイティブブリッジを毎回
// 往復する。ギャラリーには写真の枚数だけLikeSaveButtons(=usePhotoInteractions)が
// マウントされるが、それらは全員"kokotore_likes"等の同じ3つのグローバルキーを
// 読みに行くため、キャッシュ無しだと写真の枚数だけ同一キーへのPreferences.get
// が連発される(Xcodeコンソールに大量の重複ログが出ていたのはこれが原因)。
// メモリ内キャッシュ+同時リクエストの合流(inflight)で、同一キーへの実ブリッジ
// 呼び出しを1回に抑える。
import { Preferences } from "@capacitor/preferences";

const memoryCache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = (async (): Promise<T> => {
    try {
      const { value } = await Preferences.get({ key });
      // valueがnull(未保存)の場合は安全にfallbackへ倒す
      const parsed = value ? (JSON.parse(value) as T) : fallback;
      memoryCache.set(key, parsed);
      return parsed;
    } catch {
      memoryCache.set(key, fallback);
      return fallback;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  // 書き込み時点でキャッシュも即座に更新しておく(次のreadJsonが古い値を
  // 返さないようにするため。ネイティブ側への反映を待つ必要はない)。
  memoryCache.set(key, value);
  try {
    await Preferences.set({ key, value: JSON.stringify(value) });
  } catch {
    // 無視(ストレージ書き込みに失敗しても致命的ではないため)
  }
}
