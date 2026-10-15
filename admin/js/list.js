import { toInline, fromInline } from './text.js';

export function parseList(html) {
  return [...String(html).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => fromInline(m[1]));
}
export function renderList(items, { indent = '          ', closeIndent = indent } = {}) {
  if (!items.length) return '';
  return `\n${indent}${items.map((t) => `<li>${toInline(t)}</li>`).join(`\n${indent}`)}\n${closeIndent}`;
}
export function listToText(items) {
  return items.join('\n\n');
}
export function textToList(text) {
  return String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
}
