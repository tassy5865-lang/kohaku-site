import { escapeAttr, unescapeHtml } from './text.js';

const open = (k) => `<!--edit:${k}-->`;
const close = (k) => `<!--/edit:${k}-->`;

function locate(html, key) {
  const a = html.indexOf(open(key));
  if (a < 0) throw new Error(`編集範囲の目印がありません: ${key}`);
  if (html.indexOf(open(key), a + 1) >= 0) throw new Error(`編集範囲の目印が重複しています: ${key}`);
  const start = a + open(key).length;
  const end = html.indexOf(close(key), start);
  if (end < 0) throw new Error(`編集範囲の目印が閉じていません: ${key}`);
  return [start, end];
}

export function getRegion(html, key) {
  const [s, e] = locate(html, key);
  return html.slice(s, e);
}
export function setRegion(html, key, inner) {
  const [s, e] = locate(html, key);
  return html.slice(0, s) + inner + html.slice(e);
}

function findImg(html, key) {
  const tags = [...html.matchAll(/<img\b[^>]*>/g)].filter((m) => m[0].includes(`data-photo="${key}"`));
  if (tags.length !== 1) throw new Error(`写真の目印がありません: ${key}`);
  return tags[0];
}
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : '';
};
function withAttr(tag, name, value) {
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, (_, a, b) => a + value + b);
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end}`);
}
export function getPhoto(html, key) {
  const tag = findImg(html, key)[0];
  return {
    src: attr(tag, 'src'),
    alt: unescapeHtml(attr(tag, 'alt')),
    width: Number(attr(tag, 'width')) || 0,
    height: Number(attr(tag, 'height')) || 0,
  };
}
export function setPhoto(html, key, { src, alt, width, height }) {
  const m = findImg(html, key);
  let tag = m[0];
  tag = withAttr(tag, 'src', escapeAttr(src));
  tag = withAttr(tag, 'alt', escapeAttr(alt));
  if (width) tag = withAttr(tag, 'width', String(width));
  if (height) tag = withAttr(tag, 'height', String(height));
  return html.slice(0, m.index) + tag + html.slice(m.index + m[0].length);
}
