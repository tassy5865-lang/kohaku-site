import { toInline, fromInline } from './text.js';

export function parseFaq(html) {
  return [...String(html).matchAll(/<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)]
    .map((m) => ({ q: fromInline(m[1]), a: fromInline(m[2]) }));
}
export function renderFaq(items, { indent = '        ', closeIndent = '      ' } = {}) {
  const valid = items.filter((i) => i.q.trim() || i.a.trim());
  if (!valid.length) return '';
  const lines = valid.map((i) => `<details><summary>${toInline(i.q)}</summary><p>${toInline(i.a)}</p></details>`);
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}
