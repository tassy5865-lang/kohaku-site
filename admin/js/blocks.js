import { toInline, fromInline } from './text.js';

export function parseBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<(p|h3)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    out.push({ kind: m[1] === 'h3' ? 'h' : 'p', text: fromInline(m[2]) });
  }
  return out;
}

export function renderBlocks(blocks, { indent = '          ', closeIndent = indent, pClass = '' } = {}) {
  if (!blocks.length) return '';
  const open = pClass ? `<p class="${pClass}">` : '<p>';
  const lines = blocks.map((b) => (b.kind === 'h' ? `<h3>${toInline(b.text)}</h3>` : `${open}${toInline(b.text)}</p>`));
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}

export function blocksToText(blocks) {
  return blocks.map((b) => (b.kind === 'h' ? `## ${b.text}` : b.text)).join('\n\n');
}

export function textToBlocks(text) {
  return String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    .map((s) => (s.startsWith('## ') ? { kind: 'h', text: s.slice(3).trim() } : { kind: 'p', text: s }));
}
