// 管理画面のプレビュー用。スクリプト(GA4・オープニング動画)を外し、相対パスが ../ から解決されるようにする。
export function makePreview(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<div class="intro"[\s\S]*?<\/video>\s*<\/div>/, '')
    .replace(/<head>/i, '<head><base href="../">');
}
