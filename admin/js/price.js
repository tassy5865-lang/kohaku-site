import { toInline, fromInline, escapeAttr, unescapeHtml } from './text.js';

// 入力を「¥10,000」形式に整える。価格として読めなければ null。
export function formatYen(input) {
  const s = String(input).normalize('NFKC').replace(/[¥,\s円]/g, '');
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  if (n <= 0) return null;
  return '¥' + n.toLocaleString('en-US');
}

export const MAX_GROUPS = 10;
const URL_RE = /^https:\/\/[^\s"'<>]+$/;
export const isLinkUrl = (u) => URL_RE.test(String(u).trim()) && String(u).trim().length <= 2000;

export function parseGroup(html) {
  const h = String(html);
  const title = /<h3>([\s\S]*?)<\/h3>/.exec(h);
  const ulStart = h.indexOf('<ul');
  const ulEnd = h.indexOf('</ul>');
  if (ulStart < 0 || ulEnd < 0) throw new Error('料金表の形が想定と違います');
  const fines = (s) => [...s.matchAll(/<p class="fine">([\s\S]*?)<\/p>/g)].map((m) => fromInline(m[1]));
  const rows = [...h.slice(ulStart, ulEnd).matchAll(/<span class="name">([\s\S]*?)<\/span><span class="yen">([\s\S]*?)<\/span>/g)]
    .map((m) => {
      const link = /<a\s[^>]*href="([^"]*)"/.exec(m[1]);
      return {
        name: fromInline(m[1]).replace(/\s+/g, ' ').trim(),
        yen: fromInline(m[2]).trim(),
        url: link ? unescapeHtml(link[1]).trim() : '',
      };
    });
  return {
    title: title ? fromInline(title[1]) : '',
    intro: fines(h.slice(0, ulStart)),
    rows,
    notes: fines(h.slice(ulEnd + 5)),
  };
}

function groupLines(g) {
  const lines = [];
  if (g.title.trim()) lines.push(`<h3>${toInline(g.title)}</h3>`);
  for (const t of g.intro.filter((s) => s.trim())) lines.push(`<p class="fine">${toInline(t)}</p>`);
  lines.push('<ul class="price-list">');
  for (const r of g.rows) {
    const yen = formatYen(r.yen) ?? r.yen.trim(); // 読めない値はそのまま残し、公開前検査で止める
    const url = String(r.url ?? '').trim();
    const name = url
      ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${toInline(r.name)}</a>`
      : toInline(r.name);
    lines.push(`  <li><span class="name">${name}</span><span class="yen">${toInline(yen)}</span></li>`);
  }
  lines.push('</ul>');
  for (const t of g.notes.filter((s) => s.trim())) lines.push(`<p class="fine">${toInline(t)}</p>`);
  return lines;
}

export function renderGroup(g, { indent = '          ', closeIndent = indent } = {}) {
  return `\n${indent}${groupLines(g).join(`\n${indent}`)}\n${closeIndent}`;
}

// ---------- カテゴリ(料金表のかたまり)の一覧 ----------
// 各カテゴリ: { id, photo: null | {src, alt, width, height}, title, intro, rows: [{name, yen, url}], notes }
// 写真つきのカテゴリは、写真の左右を並び順で自動的に交互にする。
export function parseGroups(html) {
  const h = String(html);
  const starts = [...h.matchAll(/<div class="price-group[^"]*"[^>]*>/g)];
  const used = new Set();
  return starts.map((m, i) => {
    const block = h.slice(m.index + m[0].length, i + 1 < starts.length ? starts[i + 1].index : h.length);
    const g = parseGroup(block);
    const img = /<img\b[^>]*\sdata-photo="([^"]+)"[^>]*>/.exec(block);
    const dataGroup = /\sdata-group="([^"]+)"/.exec(m[0]);
    let id = dataGroup ? dataGroup[1] : (img ? img[1].replace(/^menu-/, '') : `c${i + 1}`);
    while (used.has(id)) id += 'x';
    used.add(id);
    let photo = null;
    if (img) {
      const attr = (n) => { const a = new RegExp(`\\s${n}="([^"]*)"`).exec(img[0]); return a ? a[1] : ''; };
      photo = { src: attr('src'), alt: unescapeHtml(attr('alt')), width: Number(attr('width')) || 0, height: Number(attr('height')) || 0 };
    }
    return { id, photo, ...g };
  });
}

export function renderGroups(groups, { indent = '        ', closeIndent = indent, preview = false } = {}) {
  let photoIdx = 0;
  const blocks = groups.map((g) => {
    const i1 = indent + '  ';
    const i2 = indent + '    ';
    const out = [];
    if (g.photo) {
      const p = g.photo;
      const cls = `price-group price-group--photo${photoIdx++ % 2 ? ' price-group--alt' : ''}`;
      const src = preview && p.previewSrc ? p.previewSrc : p.src;
      const size = `${p.width ? ` width="${p.width}"` : ''}${p.height ? ` height="${p.height}"` : ''}`;
      out.push(`${indent}<div class="${cls}" data-group="${escapeAttr(g.id)}">`);
      out.push(`${i1}<figure class="menu-photo"><img data-photo="menu-${escapeAttr(g.id)}" src="${escapeAttr(src)}"${size} loading="lazy" alt="${escapeAttr(p.alt)}"></figure>`);
      out.push(`${i1}<div>`);
      for (const l of groupLines(g)) out.push(`${i2}${l}`);
      out.push(`${i1}</div>`);
    } else {
      out.push(`${indent}<div class="price-group" data-group="${escapeAttr(g.id)}">`);
      for (const l of groupLines(g)) out.push(`${i1}${l}`);
    }
    out.push(`${indent}</div>`);
    return out.join('\n');
  });
  return `\n${blocks.join('\n\n')}\n${closeIndent}`;
}

export function newGroup(groups, withPhoto) {
  const ids = new Set(groups.map((g) => g.id));
  let id = `g${Date.now().toString(36)}`;
  while (ids.has(id)) id += 'x';
  return {
    id,
    photo: withPhoto ? { src: '', alt: '', width: 0, height: 0 } : null,
    title: '',
    intro: [],
    rows: [{ name: '', yen: '', url: '' }],
    notes: [],
  };
}

// カテゴリ単位の公開前検査。メッセージはそのまま画面に出す。
export function validateGroups(groups) {
  const errs = [];
  if (groups.length < 1) errs.push('カテゴリが1つもありません(最低1つは残してください)');
  if (groups.length > MAX_GROUPS) errs.push(`カテゴリは${MAX_GROUPS}個までです(今は${groups.length}個)`);
  groups.forEach((g, i) => {
    const label = g.title.trim() ? `「${g.title.trim()}」` : `${i + 1}番目のカテゴリ`;
    if (!g.title.trim()) errs.push(`${label}の名前が空です`);
    if (!g.rows.length) errs.push(`${label}に料金の行がありません`);
    if (g.photo && !g.photo.src) errs.push(`${label}の写真が選ばれていません(「写真をつける」を外すこともできます)`);
    for (const r of g.rows) {
      const u = String(r.url ?? '').trim();
      if (u && !isLinkUrl(u)) errs.push(`リンクは https:// で始まるアドレスにしてください: ${label}の「${r.name.trim() || '名前なし'}」→「${u}」`);
    }
  });
  return errs;
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
