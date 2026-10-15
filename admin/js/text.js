export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function unescapeHtml(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
// 1 か所のテキスト(改行を含む)→ HTML。改行は <br>。
export function toInline(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map(escapeHtml).join('<br>');
}
// HTML → テキスト。<br> は改行、その他のタグは取り除く。
export function fromInline(html) {
  return unescapeHtml(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
}
