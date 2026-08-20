/**
 * クライアントサイド画像圧縮ユーティリティ
 * HTML5 Canvas API を使用して、ブラウザで画像をリサイズ・圧縮
 */

export interface CompressionOptions {
  maxWidth?: number; // デフォルト: 1920px
  maxHeight?: number; // デフォルト: 1920px
  quality?: number; // デフォルト: 0.8 (0-1)
  format?: "webp" | "jpeg" | "png"; // デフォルト: "webp"
  maxSizeKB?: number; // デフォルト: 500KB
}

export interface CompressionResult {
  file: File;
  originalSize: number; // バイト数
  compressedSize: number; // バイト数
  ratio: number; // 圧縮率 (0-1)
  format: string; // 実際に使用されたフォーマット
  width: number; // 圧縮後の幅
  height: number; // 圧縮後の高さ
}

/**
 * 画像ファイルをCanvas経由でリサイズ・圧縮
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.8,
    format = "webp",
    maxSizeKB = 500,
  } = options;

  // 元のサイズを記録
  const originalSize = file.size;

  // 画像を読み込む
  const img = await loadImage(file);

  // リサイズ後のサイズを計算
  const { width, height } = calculateDimensions(
    img.width,
    img.height,
    maxWidth,
    maxHeight
  );

  // Canvas に描画してリサイズ
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context を取得できません");
  }

  // 画像を描画（スムージング有効）
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  // 圧縮フォーマットを決定（WebP非対応環境ではJPEGにフォールバック）
  const actualFormat = await selectSupportedFormat(format);

  // Blob を取得
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Blob の作成に失敗しました"));
        } else {
          resolve(blob);
        }
      },
      `image/${actualFormat}`,
      quality
    );
  });

  // 圧縮後のサイズ
  let compressedSize = blob.size;

  // maxSizeKB に収まらない場合は品質を下げて再圧縮
  if (compressedSize > maxSizeKB * 1024) {
    const lowerQuality = Math.max(0.5, quality - 0.1);
    const resultBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Blob の作成に失敗しました"));
          } else {
            resolve(blob);
          }
        },
        `image/${actualFormat}`,
        lowerQuality
      );
    });
    compressedSize = resultBlob.size;
  }

  // File に変換
  const compressedFile = new File([blob], file.name, {
    type: `image/${actualFormat}`,
    lastModified: Date.now(),
  });

  return {
    file: compressedFile,
    originalSize,
    compressedSize,
    ratio: compressedSize / originalSize,
    format: actualFormat,
    width,
    height,
  };
}

/**
 * 複数の画像を圧縮
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = {}
): Promise<CompressionResult[]> {
  return Promise.all(files.map((file) => compressImage(file, options)));
}

/**
 * 画像ファイルを読み込んで HTMLImageElement を返す
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

/**
 * 元の寸法から、最大幅・高さに収まるようにリサイズした寸法を計算
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;

  // 幅が最大を超えている場合
  if (width > maxWidth) {
    const ratio = maxWidth / width;
    width = maxWidth;
    height = Math.round(height * ratio);
  }

  // 高さが最大を超えている場合
  if (height > maxHeight) {
    const ratio = maxHeight / height;
    height = maxHeight;
    width = Math.round(width * ratio);
  }

  return { width, height };
}

/**
 * ブラウザが対応しているフォーマットを選択
 * WebP が非対応の場合は JPEG にフォールバック
 */
async function selectSupportedFormat(
  preferredFormat: "webp" | "jpeg" | "png"
): Promise<"webp" | "jpeg" | "png"> {
  // WebP サポート判定
  if (preferredFormat === "webp") {
    const isSupported = await isWebPSupported();
    if (isSupported) {
      return "webp";
    }
    // WebP 非対応の場合は JPEG にフォールバック
    return "jpeg";
  }

  return preferredFormat;
}

/**
 * ブラウザがWebPをサポートしているか判定
 */
function isWebPSupported(): Promise<boolean> {
  return new Promise((resolve) => {
    const webp = new Image();
    webp.onload = webp.onerror = () => {
      resolve(webp.height === 2);
    };
    webp.src =
      "data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoBIAEACAA0JaACdLoB+AEADwABEQABIAEA";
  });
}

/**
 * ファイルサイズをMB/KBで表示
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 圧縮率をパーセンテージで返す
 */
export function getCompressionPercentage(ratio: number): number {
  return Math.round((1 - ratio) * 100);
}
