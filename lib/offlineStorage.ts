// IndexedDB を使用したオフラインストレージ管理
// 下書きデータと画像を保存し、オンライン復帰時に自動同期

interface StoredDraft {
  id: string;
  recordId: string;
  data: Record<string, unknown>; // NewDispatchRecordInput相当
  images: { [key: string]: string }; // base64 エンコードされた画像
  savedAt: number;
  syncedAt?: number;
  syncing?: boolean;
}

let db: IDBDatabase | null = null;
const DB_NAME = "spotbase-drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

/**
 * IndexedDB を初期化
 */
export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open IndexedDB", request.error);
      reject(request.error);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("recordId", "recordId", { unique: false });
        store.createIndex("syncedAt", "syncedAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
  });
}

/**
 * 下書きをローカルに保存
 */
export async function saveDraftLocal(draft: StoredDraft): Promise<void> {
  if (!db) await initDB();
  if (!db) throw new Error("Failed to initialize IndexedDB");

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(draft);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * ローカルから下書きを取得
 */
export async function getDraftLocal(recordId: string): Promise<StoredDraft | null> {
  if (!db) await initDB();
  if (!db) throw new Error("Failed to initialize IndexedDB");

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("recordId");
    const request = index.get(recordId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * すべての下書きをローカルから取得
 */
export async function getAllDraftsLocal(): Promise<StoredDraft[]> {
  if (!db) await initDB();
  if (!db) throw new Error("Failed to initialize IndexedDB");

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * ローカルから下書きを削除
 */
export async function deleteDraftLocal(id: string): Promise<void> {
  if (!db) await initDB();
  if (!db) throw new Error("Failed to initialize IndexedDB");

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * 画像を Base64 文字列に変換
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Base64 文字列を Blob に変換
 */
export async function base64ToBlob(base64: string): Promise<Blob> {
  const res = await fetch(base64);
  return res.blob();
}

/**
 * オンライン・オフラインイベントのリスナーをセットアップ
 */
export function setupSyncListener(
  onSync: (drafts: StoredDraft[]) => Promise<void>
): void {
  // オンライン復帰時に同期を試みる
  window.addEventListener("online", async () => {
    console.log("Back online. Attempting to sync drafts...");
    try {
      const drafts = await getAllDraftsLocal();
      const unsynced = drafts.filter((d) => !d.syncedAt);

      if (unsynced.length > 0) {
        await onSync(unsynced);
      }
    } catch (err) {
      console.error("Error syncing drafts:", err);
    }
  });

  // オフライン状態を検知
  window.addEventListener("offline", () => {
    console.log("Connection lost. Working offline.");
  });
}

/**
 * 自動同期（一定期間ごと）
 */
export function startAutoSync(
  interval: number = 30000, // デフォルト 30秒
  onSync?: (drafts: StoredDraft[]) => Promise<void>
): () => void {
  const intervalId = setInterval(async () => {
    if (!navigator.onLine) return;

    try {
      const drafts = await getAllDraftsLocal();
      const unsynced = drafts.filter((d) => !d.syncedAt);

      if (unsynced.length > 0 && onSync) {
        await onSync(unsynced);
      }
    } catch (err) {
      console.error("Error in auto sync:", err);
    }
  }, interval);

  // クリーンアップ関数を返す
  return () => clearInterval(intervalId);
}
