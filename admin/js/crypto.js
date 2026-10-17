import { toBase64, fromBase64 } from './b64.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

// 鍵は「パスワード + 秘密」から作る。秘密はリンクの # 以降だけにあり、リポジトリには載らない。
async function deriveKey(pass, secret, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret ? `${pass}\u0000${secret}` : pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptToken(token, pass, iter = 600000, secret = '') {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, secret, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token)));
  return { v: secret ? 2 : 1, iter, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decryptToken(box, pass, secret = '') {
  if (box.v === 2 && !secret) throw new Error('この端末ではまだ鍵が登録されていません。教えられた管理画面のリンク(# つき)から開いてください。');
  try {
    const key = await deriveKey(pass, box.v === 2 ? secret : '', fromBase64(box.salt), box.iter);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(box.iv) }, key, fromBase64(box.ct));
    return dec.decode(pt);
  } catch {
    throw new Error(box.v === 2 ? 'パスワードか、管理画面のリンクが違います' : 'パスワードが違います');
  }
}
