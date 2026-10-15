// 一度だけ実行する。index.html に編集範囲の目印と data-photo を入れる。
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../index.html', import.meta.url);
let html = readFileSync(FILE, 'utf8');
if (html.includes('<!--edit:')) { console.log('すでに目印があります'); process.exit(0); }

const re = (s) => ({ re: new RegExp(s) });
// anchor は文字列(完全一致)か { re }(正規表現)。where: 'before' | 'after'
const REGIONS = [
  { key: 'about', start: ['<p>はじめまして。', 'before'], end: ['そう思っていただける場所でありたいと<br>思っています</p>', 'after'] },
  { key: 'worries-list', start: ['<ul class="checklist checklist--box">', 'after'], end: ['<li>気持ちまで疲れているように感じる</li>', 'after'] },
  { key: 'worries-lead', start: ['<p class="lead lead--serif">「年齢だから仕方ない」', 'before'], end: ['健康づくりとしてのケアを始めてみませんか？</p>', 'after'] },
  { key: 'kodawari-points', start: ['<ul class="points">', 'after'], end: ['<li>他にも空間ごとの香りの違いなど、お客様が五感を楽しむを意識しています。</li>', 'after'] },
  { key: 'faq', start: ['<h2>よくある質問</h2>', 'after'], end: ['妊活中の方は低温期に行います。</p></details>', 'after'] },
  { key: 'price-card', start: ['<div class="price-card">', 'after'], end: ['<p class="price"><s>通常 ¥12,000</s>¥10,000</p>', 'after'] },
  { key: 'menu-rose', start: ['<h3>至福のローズフェイシャルコース</h3>', 'before'], end: ['※B(頭ほぐし35分)は、サロンで用意した上衣に着替えていただきます。</p>', 'after'] },
  { key: 'menu-body', start: ['<h3>アロマボディトリートメント</h3>', 'before'], end: [re('¥14,000</span></li>\\s*</ul>'), 'after'] },
  { key: 'menu-course', start: ['<h3>香りに包まれて全身満たされるコース</h3>', 'before'], end: [re('¥18,600</span></li>\\s*</ul>'), 'after'] },
  { key: 'menu-pair', start: ['<h3>ペア蒸し</h3>', 'before'], end: [re('¥18,000</span></li>\\s*</ul>'), 'after'] },
];

function find(h, anchor, from = 0) {
  if (typeof anchor === 'string') {
    const i = h.indexOf(anchor, from);
    if (i < 0) throw new Error(`見つかりません: ${anchor}`);
    if (from === 0 && h.indexOf(anchor, i + 1) >= 0) throw new Error(`複数あります: ${anchor}`);
    return [i, i + anchor.length];
  }
  const g = new RegExp(anchor.re.source, 'g');
  g.lastIndex = from;
  const m = g.exec(h);
  if (!m) throw new Error(`見つかりません: ${anchor.re}`);
  return [m.index, m.index + m[0].length];
}

for (const r of REGIONS) {
  const [s0, s1] = find(html, r.start[0]);
  const startAt = r.start[1] === 'before' ? s0 : s1;
  const [e0, e1] = find(html, r.end[0], startAt);
  const endAt = r.end[1] === 'before' ? e0 : e1;
  if (endAt < startAt) throw new Error(`範囲が逆です: ${r.key}`);
  html = html.slice(0, startAt) + `<!--edit:${r.key}-->` + html.slice(startAt, endAt) + `<!--/edit:${r.key}-->` + html.slice(endAt);
}

// お知らせ帯(空)。<main> の直後。
if (!/<main>/.test(html)) throw new Error('<main> がありません');
html = html.replace(/(<main>)/, '$1\n    <!--edit:notice--><!--/edit:notice-->');

// 写真
const PHOTOS = [
  ['hero-l', 'src="images/salon-clock.jpg"'],
  ['hero-r', 'src="images/salon-hero.jpg"'],
  ['about', 'src="images/owner-steam.jpg"'],
  ['kodawari-1', 'src="images/salon-herb-plate.jpg" loading="lazy"'],
  ['kodawari-2', 'src="images/salon-herbs-hands.jpg" loading="lazy"'],
  ['menu-rose', 'src="images/salon-herb-plate.jpg" width="900"'],
  ['menu-body', 'src="images/salon-curtain.jpg"'],
  ['menu-pair', 'src="images/salon-herbs-hands.jpg" width="675"'],
  ['access', 'src="images/salon-exterior.jpg"'],
];
for (const [key, snippet] of PHOTOS) {
  const i = html.indexOf(snippet);
  if (i < 0 || html.indexOf(snippet, i + 1) >= 0) throw new Error(`写真の特定に失敗: ${key}`);
  const tagStart = html.lastIndexOf('<img', i);
  html = html.slice(0, tagStart + 4) + ` data-photo="${key}"` + html.slice(tagStart + 4);
}

writeFileSync(FILE, html);
console.log('目印を入れました');
