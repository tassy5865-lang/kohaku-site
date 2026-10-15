import { toBase64 } from './b64.js';

export function fitSize(w, h, max = 1600) {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

export function bytesToDataUrl(bytes) {
  return 'data:image/jpeg;base64,' + toBase64(bytes);
}

const MAX_FILE = 30 * 1024 * 1024;

// ブラウザ専用。写真を縮小して JPEG にする(向きは EXIF に従って補正)。
export async function toJpeg(file, { max = 1600, quality = 0.82 } = {}) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('写真のファイルを選んでください。');
  if (file.size > MAX_FILE) throw new Error('写真が大きすぎます(30MB まで)。');
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('この写真は読み込めませんでした。JPEG か PNG の写真を選んでください。');
  }
  const { width, height } = fitSize(bmp.width, bmp.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('写真を変換できませんでした。別の写真でお試しください。');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}
