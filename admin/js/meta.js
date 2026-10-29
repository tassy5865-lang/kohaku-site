import { escapeHtml, escapeAttr, unescapeHtml } from './text.js';

// 検索結果・ブラウザのタブ・SNS共有に出る文字。コメントの目印は属性や <title> の中に置けないので、
// 場所を決まった形で探す。ページ側の形を変えたら、ここの正規表現も直す。
export const META_FIELDS = [
  { key: 'title', label: 'ブラウザのタブ・検索結果のタイトル', hint: '検索結果の見出しになります。30文字前後が目安です。', multi: false,
    re: /(<title>)([^<]*)(<\/title>)/, enc: escapeHtml },
  { key: 'description', label: '検索結果に出る説明文', hint: '検索結果のタイトルの下に出ます。100文字前後が目安です。', multi: true,
    re: /(<meta name="description" content=")([^"]*)(">)/, enc: escapeAttr },
  { key: 'ogTitle', label: 'LINE・SNSで共有したときのタイトル', hint: '', multi: false,
    re: /(<meta property="og:title" content=")([^"]*)(">)/, enc: escapeAttr },
  { key: 'ogDescription', label: 'LINE・SNSで共有したときの説明文', hint: '', multi: true,
    re: /(<meta property="og:description" content=")([^"]*)(">)/, enc: escapeAttr },
];

function find(html, f) {
  const all = html.match(new RegExp(f.re.source, 'g')) ?? [];
  if (all.length !== 1) throw new Error(`ページの設定が見つかりません: ${f.label}`);
  return f.re.exec(html);
}

export function readMeta(html) {
  const out = {};
  for (const f of META_FIELDS) out[f.key] = unescapeHtml(find(html, f)[2]);
  return out;
}

export function applyMeta(html, meta) {
  let out = html;
  for (const f of META_FIELDS) {
    const m = find(out, f);
    const v = String(meta[f.key]).replace(/\s+/g, ' ').trim();
    out = out.slice(0, m.index) + m[1] + f.enc(v) + m[3] + out.slice(m.index + m[0].length);
  }
  return out;
}
