import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readModels, applyModels, summarizeChanges } from '../js/site-model.js';

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
  assert.equal(m.card.price, '¥10,000');
  assert.equal(m.groups.pair.rows.length, 4);
  assert.equal(m.groups.rose.rows.length, 4);
  assert.equal(m.faq.length, 7);
  assert.equal(m.photos['hero-l'].src, 'images/salon-clock.jpg');
});

test('editing a price changes only that row and nothing outside the regions', () => {
  const m = readModels(html);
  m.groups.pair.rows[0].yen = '6500';
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
  b.groups.rose.rows[0].yen = '¥5,900';
  b.faq.pop();
  b.photos.access.alt = 'x';
  const s = summarizeChanges(a, b);
  assert.ok(s.some((x) => x.includes('ローズフェイシャル')));
  assert.ok(s.some((x) => x.includes('よくある質問')));
  assert.ok(s.some((x) => x.includes('写真')));
});
