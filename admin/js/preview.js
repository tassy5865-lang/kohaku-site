// 管理画面のプレビュー用。スクリプト(GA4・オープニング動画)を外し、相対パスが ../ から解決されるようにする。
// ページ自身のCSP(meta)も外す: プレビューは origin のない sandbox 内なので 'self' が合わず画像・CSSが止まる。管理画面側のCSPは引き続き効く。
export function makePreview(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi, '')
    .replace(/<div class="intro"[\s\S]*?<\/video>\s*<\/div>/, '')
    .replace(/<head>/i, '<head><base href="../">');
}
