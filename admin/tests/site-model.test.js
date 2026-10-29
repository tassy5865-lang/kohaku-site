import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readModels, applyModels, summarizeChanges, rebaseModels } from '../js/site-model.js';
import { applyMeta } from '../js/meta.js';

const grp = (m, id) => m.groups.find((g) => g.id === id);
const live = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
// 店主が管理画面で編集するので、中身を決め打ちするテストは固定のスナップショット(2026-10-23時点)で行う
const html = readFileSync(new URL('./fixtures/index.snapshot.html', import.meta.url), 'utf8');
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/>\s+</g, '><').trim();

test('read → apply is lossless on the real index.html (modulo whitespace between tags)', () => {
  for (const page of [html, live]) {
    const m = readModels(page);
    assert.equal(norm(applyModels(page, m)), norm(page));
  }
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

test('texts: every slot is read, edited text lands only in its own spot, empty text is allowed', () => {
  const m = readModels(html);
  assert.equal(m.texts['hero-tag'], '脳の休息と巡りを変えるサロン');
  assert.equal(m.texts['hero-copy-1'], '心と身体をほどく、');
  const b = structuredClone(m);
  b.texts['hero-tag'] = '新しい\n<b>サブ</b>';
  const out = applyModels(html, b);
  assert.match(out, /<p class="hero__tag"><!--edit:t-hero-tag-->新しい<br>&lt;b&gt;サブ&lt;\/b&gt;<!--\/edit:t-hero-tag--><\/p>/);
  assert.equal(readModels(out).texts['hero-tag'], '新しい\n<b>サブ</b>');
  assert.ok(summarizeChanges(m, b).includes('文字: トップ'));
  // 見出し・ボタンなど他の文字は変わらない
  assert.equal(readModels(out).texts['nav-about'], m.texts['nav-about']);
});

test('texts: the live page has a marker for every slot and lossless round trip', () => {
  const m = readModels(live);
  assert.ok(Object.keys(m.texts).length >= 70);
  assert.equal(norm(applyModels(live, m)), norm(live));
});

test('meta: title and descriptions are read, escaped on write, and touch nothing else', () => {
  const m = readModels(html);
  assert.match(m.meta.title, /^琥珀\(こはく\)\|/);
  assert.ok(m.meta.title.includes('アロマ&よもぎ蒸し'));
  const b = structuredClone(m);
  b.meta.title = '新しい "題" & <b>';
  b.meta.description = '説明\n文';
  const out = applyMeta(html, b.meta);
  assert.match(out, /<title>新しい "題" &amp; &lt;b&gt;<\/title>/);
  assert.match(out, /<meta name="description" content="説明 文">/);
  assert.equal(readModels(out).meta.title, '新しい "題" & <b>');
  assert.equal(out.replace(/<title>.*<\/title>/, '').replace(/<meta name="description"[^>]*>/, ''), html.replace(/<title>.*<\/title>/, '').replace(/<meta name="description"[^>]*>/, ''));
  assert.ok(summarizeChanges(m, b).some((x) => x.includes('タイトル')));
  assert.equal(norm(applyModels(live, readModels(live))), norm(live));
});
