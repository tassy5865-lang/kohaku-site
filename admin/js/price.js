import { toInline, fromInline } from './text.js';

// 入力を「¥10,000」形式に整える。価格として読めなければ null。
export function formatYen(input) {
  const s = String(input).normalize('NFKC').replace(/[¥,\s円]/g, '');
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  if (n <= 0) return null;
  return '¥' + n.toLocaleString('en-US');
}

export function parseGroup(html) {
  const h = String(html);
  const title = /<h3>([\s\S]*?)<\/h3>/.exec(h);
  const ulStart = h.indexOf('<ul');
  const ulEnd = h.indexOf('</ul>');
  if (ulStart < 0 || ulEnd < 0) throw new Error('料金表の形が想定と違います');
  const fines = (s) => [...s.matchAll(/<p class="fine">([\s\S]*?)<\/p>/g)].map((m) => fromInline(m[1]));
  const rows = [...h.slice(ulStart, ulEnd).matchAll(/<span class="name">([\s\S]*?)<\/span><span class="yen">([\s\S]*?)<\/span>/g)]
    .map((m) => ({ name: fromInline(m[1]).replace(/\s+/g, ' ').trim(), yen: fromInline(m[2]).trim() }));
  return {
    title: title ? fromInline(title[1]) : '',
    intro: fines(h.slice(0, ulStart)),
    rows,
    notes: fines(h.slice(ulEnd + 5)),
  };
}

export function renderGroup(g, { indent = '          ', closeIndent = indent } = {}) {
  const lines = [];
  if (g.title.trim()) lines.push(`<h3>${toInline(g.title)}</h3>`);
  for (const t of g.intro.filter((s) => s.trim())) lines.push(`<p class="fine">${toInline(t)}</p>`);
  lines.push('<ul class="price-list">');
  for (const r of g.rows) {
    const yen = formatYen(r.yen) ?? r.yen.trim(); // 読めない値はそのまま残し、公開前検査で止める
    lines.push(`  <li><span class="name">${toInline(r.name)}</span><span class="yen">${toInline(yen)}</span></li>`);
  }
  lines.push('</ul>');
  for (const t of g.notes.filter((s) => s.trim())) lines.push(`<p class="fine">${toInline(t)}</p>`);
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}

export function parseCard(html) {
  const h = String(html);
  const badge = /<span class="badge">([\s\S]*?)<\/span>/.exec(h);
  const title = /<h3>([\s\S]*?)<\/h3>/.exec(h);
  const time = /<p>([\s\S]*?)<\/p>/.exec(h);
  const price = /<p class="price">(?:<s>通常\s*([^<]*)<\/s>)?([^<]*)<\/p>/.exec(h);
  return {
    badge: badge ? fromInline(badge[1]) : '',
    title: title ? fromInline(title[1]) : '',
    time: time ? fromInline(time[1]) : '',
    regular: price && price[1] ? price[1].trim() : '',
    price: price ? price[2].trim() : '',
  };
}

export function renderCard(c, { indent = '          ', closeIndent = '        ' } = {}) {
  const lines = [];
  if (c.badge.trim()) lines.push(`<span class="badge">${toInline(c.badge)}</span>`);
  lines.push(`<h3>${toInline(c.title)}</h3>`);
  if (c.time.trim()) lines.push(`<p>${toInline(c.time)}</p>`);
  const price = formatYen(c.price) ?? c.price.trim();
  const regular = c.regular.trim() ? (formatYen(c.regular) ?? c.regular.trim()) : '';
  lines.push(`<p class="price">${regular ? `<s>通常 ${toInline(regular)}</s>` : ''}${toInline(price)}</p>`);
  return `\n${indent}${lines.join(`\n${indent}`)}\n${closeIndent}`;
}
