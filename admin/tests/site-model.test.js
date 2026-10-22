import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readModels, applyModels, summarizeChanges, rebaseModels } from '../js/site-model.js';

const grp = (m, id) => m.groups.find((g) => g.id === id);
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/>\s+</g, '><').trim();

test('read → apply is lossless on the real index.html (modulo whitespace between tags)', () => {
  const m = readModels(html);
  assert.equal(norm(applyModels(html, m)), norm(html));
});

test('real page is parsed into the expected shape', () => {
  const m = readModels(html);
  assert.equal(m.notice, '');
  assert.ok(m.about.length > 10);
  assert.equal(m.card.price, '¥7,500');
  assert.equal(grp(m, 'pair').rows.length, 2);
  assert.equal(grp(m, 'rose').rows.length, 3);
  assert.equal(m.faq.length, 7);
  assert.equal(m.photos['hero-l'].src, 'images/salon-clock.jpg');
});

test('editing a price changes only that row and nothing outside the regions', () => {
  const m = readModels(html);
  grp(m, 'pair').rows[0].yen = '6500';
  const out = applyModels(html, m);
  assert.match(out, /<span class="name">よもぎ蒸し<\/span><span class="yen">¥6,500<\/span>/);
  // 領域の外は 1 文字も変わらない(JSON-LD・GA4・フッター)
  const outside = (s) => s.replace(/<!--edit:([^>]*?)-->[\s\S]*?<!--\/edit:\1-->/g, '').replace(/<img[^>]*>/g, '');
  assert.equal(outside(out), outside(html));
});

test('notice: text becomes an announce band, empty removes it', () => {
  const m = readModels(html);
  m.notice = '10/20は臨時休業です\n<script>x</script>';
  const out = applyModels(html, m);
  assert.match(out, /<div class="announce" role="status"><p>10\/20は臨時休業です<br>&lt;script&gt;x&lt;\/script&gt;<\/p><\/div>/);
  assert.equal(readModels(out).notice, '10/20は臨時休業です\n<script>x</script>');
  m.notice = '   ';
  assert.equal(norm(applyModels(out, m)), norm(html));
});

test('photo: preview uses previewSrc, publish uses src', () => {
  const m = readModels(html);
  m.photos.about = { ...m.photos.about, src: 'images/new.jpg', previewSrc: 'data:image/jpeg;base64,AAAA', alt: '新しい説明' };
  const pub = applyModels(html, m);
  assert.equal(readModels(pub).photos.about.src, 'images/new.jpg');
  assert.equal(readModels(pub).photos.about.alt, '新しい説明');
  assert.match(applyModels(html, m, { preview: true }), /data:image\/jpeg;base64,AAAA/);
});

test('summarizeChanges names what changed', () => {
  const a = readModels(html);
  const b = structuredClone(a);
  assert.deepEqual(summarizeChanges(a, b), []);
  grp(b, 'rose').rows[0].yen = '¥5,900';
  b.faq.pop();
  b.photos.access.alt = 'x';
  const s = summarizeChanges(a, b);
  assert.ok(s.some((x) => x.includes('フェイシャルコース')));
  assert.ok(s.some((x) => x.includes('よくある質問')));
  assert.ok(s.some((x) => x.includes('写真')));
});

test('rebaseModels: keeps my edits, takes others\' edits, latest wins only on a real clash', () => {
  const base = readModels(html);
  const mine = structuredClone(base);
  grp(mine, 'rose').rows[0].yen = '¥5,900';   // 自分だけが変更
  mine.notice = '自分のお知らせ';             // 両方が変更
  mine.faq.pop();                            // 自分だけが変更
  const latest = structuredClone(base);
  grp(latest, 'pair').rows[0].yen = '¥7,000'; // 相手だけが変更
  latest.notice = '相手のお知らせ';
  const r = rebaseModels(base, mine, latest);
  assert.equal(grp(r.models, 'rose').rows[0].yen, '¥5,900');
  assert.equal(grp(r.models, 'pair').rows[0].yen, '¥7,000');
  assert.equal(r.models.faq.length, base.faq.length - 1);
  assert.equal(r.models.notice, '相手のお知らせ');
  assert.deepEqual(r.clashed, ['お知らせ']);
});

test('rebaseModels: no clash reports nothing', () => {
  const base = readModels(html);
  const r = rebaseModels(base, structuredClone(base), structuredClone(base));
  assert.deepEqual(r.clashed, []);
  assert.deepEqual(r.models, base);
});
