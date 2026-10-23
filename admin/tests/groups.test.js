import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGroups, renderGroups, newGroup, validateGroups, MAX_GROUPS } from '../js/price.js';
import { readModels, applyModels, summarizeChanges, rebaseModels, managedImages } from '../js/site-model.js';
import { validateDocument } from '../js/validate.js';

const html = readFileSync(new URL('./fixtures/index.menu4.html', import.meta.url), 'utf8');
const rules = JSON.parse(readFileSync(new URL('../../tools/rules.json', import.meta.url), 'utf8'));
const grp = (m, id) => m.groups.find((g) => g.id === id);
const ids = (m) => m.groups.map((g) => g.id);

test('the real page has the four categories with stable ids', () => {
  const m = readModels(html);
  assert.deepEqual(ids(m), ['body', 'rose', 'course', 'pair']);
  assert.deepEqual(m.groups.map((g) => Boolean(g.photo)), [true, true, false, true]);
  assert.equal(grp(m, 'rose').photo.src, 'images/salon-herb-plate.jpg');
  assert.ok(m.groups.every((g) => g.rows.every((r) => r.url === '')));
});

test('photo categories alternate left/right by order, photo-less ones are skipped', () => {
  const m = readModels(html);
  const cls = (out) => [...out.matchAll(/<div class="(price-group[^"]*)" data-group="([^"]+)"/g)].map((x) => [x[2], x[1]]);
  assert.deepEqual(cls(applyModels(html, m)), [
    ['body', 'price-group price-group--photo'],
    ['rose', 'price-group price-group--photo price-group--alt'],
    ['course', 'price-group'],
    ['pair', 'price-group price-group--photo'],
  ]);
  m.groups.splice(0, 1); // ボディを消すと、ローズが先頭(通常)、ペアが alt になる
  assert.deepEqual(cls(applyModels(html, m)).map((x) => x[1].includes('--alt')), [false, false, true]);
});

test('reordering moves a category and keeps its photo marker', () => {
  const m = readModels(html);
  [m.groups[2], m.groups[3]] = [m.groups[3], m.groups[2]];
  const out = applyModels(html, m);
  assert.deepEqual(ids(readModels(out)), ['body', 'rose', 'pair', 'course']);
  assert.equal(readModels(out).groups[2].photo.src, 'images/salon-herbs-hands.jpg');
});

test('add a photo-less category and a photo category, then read them back', () => {
  const m = readModels(html);
  const a = newGroup(m.groups, false);
  Object.assign(a, { title: 'ヘッドスパ', intro: ['新メニューです。'], rows: [{ name: '30分', yen: '4000', url: '' }] });
  const b = newGroup([...m.groups, a], true);
  Object.assign(b, { title: 'ブライダル', rows: [{ name: '全身', yen: '¥20,000', url: '' }] });
  Object.assign(b.photo, { src: 'images/photo-menu-x-abc.jpg', alt: '花', width: 800, height: 600 });
  m.groups.push(a, b);
  assert.notEqual(a.id, b.id);
  const out = applyModels(html, m);
  const back = readModels(out);
  assert.deepEqual(ids(back), ['body', 'rose', 'course', 'pair', a.id, b.id]);
  assert.equal(grp(back, a.id).photo, null);
  assert.equal(grp(back, a.id).rows[0].yen, '¥4,000');
  assert.equal(grp(back, b.id).photo.src, 'images/photo-menu-x-abc.jpg');
  assert.match(out, new RegExp(`data-photo="menu-${b.id}"`));
  assert.match(out, /price-group--photo price-group--alt" data-group="g/); // 4 枚目の写真は alt
  assert.deepEqual(validateDocument(out, rules), []);
});

test('a row link renders as a new-tab link and round-trips; the name stays the visible text', () => {
  const m = readModels(html);
  grp(m, 'pair').rows[0].url = 'https://example.com/a?x=1&y="2"';
  const out = applyModels(html, m);
  assert.match(out, /<span class="name"><a href="https:\/\/example\.com\/a\?x=1&amp;y=&quot;2&quot;" target="_blank" rel="noopener">よもぎ蒸し<\/a><\/span><span class="yen">¥6,000<\/span>/);
  const back = grp(readModels(out), 'pair').rows[0];
  assert.deepEqual(back, { name: 'よもぎ蒸し', yen: '¥6,000', url: 'https://example.com/a?x=1&y="2"' });
  assert.deepEqual(validateDocument(out, rules), []); // リンク付きの行も料金検査を通る
});

test('validateGroups: names, rows, photo, link scheme, count', () => {
  const m = readModels(html);
  assert.deepEqual(validateGroups(m.groups), []);
  const g = newGroup(m.groups, true);
  g.rows = [];
  const errs = validateGroups([...m.groups, g]);
  assert.ok(errs.some((e) => e.includes('名前が空')));
  assert.ok(errs.some((e) => e.includes('料金の行がありません')));
  assert.ok(errs.some((e) => e.includes('写真が選ばれていません')));
  const bad = readModels(html);
  for (const u of ['http://example.com', 'javascript:alert(1)', 'example.com', 'https://a b.com', 'https://x.com/"onclick=']) {
    grp(bad, 'pair').rows[0].url = u;
    assert.ok(validateGroups(bad.groups).some((e) => e.includes('https://')), u);
  }
  grp(bad, 'pair').rows[0].url = '  https://ok.example.com/p  ';
  assert.deepEqual(validateGroups(bad.groups), []);
  assert.ok(validateGroups([]).some((e) => e.includes('1つもありません')));
  const many = Array.from({ length: MAX_GROUPS + 1 }, (_, i) => ({ ...structuredClone(grp(m, 'course')), id: `c${i}` }));
  assert.ok(validateGroups(many).some((e) => e.includes('個まで')));
});

test('summarizeChanges names added/removed categories, order, photos and new links', () => {
  const a = readModels(html);
  const b = structuredClone(a);
  b.groups.splice(2, 1); // course を削除
  const n = newGroup(b.groups, false);
  n.title = '新カテゴリ';
  b.groups.push(n);
  grp(b, 'pair').rows[0].url = 'https://example.com/p';
  grp(b, 'rose').photo.src = 'images/photo-menu-rose-zz.jpg';
  const s = summarizeChanges(a, b);
  assert.ok(s.includes('カテゴリを削除: 全身満たされるトータルコース'), s.join('|'));
  assert.ok(s.includes('カテゴリを追加: 新カテゴリ'));
  assert.ok(s.includes('料金: ペア蒸し'));
  assert.ok(s.some((x) => x.startsWith('写真: メニュー(フェイシャルコース)')));
  assert.ok(s.includes('リンク: よもぎ蒸し → https://example.com/p'));
  const c = structuredClone(a);
  [c.groups[0], c.groups[1]] = [c.groups[1], c.groups[0]];
  assert.deepEqual(summarizeChanges(a, c), ['カテゴリの並び順']);
});

test('rebaseModels: edits to different categories merge, my added category survives', () => {
  const base = readModels(html);
  const mine = structuredClone(base);
  grp(mine, 'rose').rows[0].yen = '¥5,900';
  const added = newGroup(mine.groups, false);
  added.title = '追加';
  mine.groups.push(added);
  const latest = structuredClone(base);
  grp(latest, 'pair').rows[0].yen = '¥7,000';
  const r = rebaseModels(base, mine, latest);
  assert.deepEqual(r.clashed, []);
  assert.equal(grp(r.models, 'rose').rows[0].yen, '¥5,900');
  assert.equal(grp(r.models, 'pair').rows[0].yen, '¥7,000');
  assert.deepEqual(ids(r.models), [...ids(base), added.id]);
});

test('rebaseModels: deleting a category that someone else edited is reported and keeps theirs', () => {
  const base = readModels(html);
  const mine = structuredClone(base);
  mine.groups = mine.groups.filter((g) => g.id !== 'pair');
  const latest = structuredClone(base);
  grp(latest, 'pair').rows[0].yen = '¥7,000';
  const r = rebaseModels(base, mine, latest);
  assert.ok(grp(r.models, 'pair'));
  assert.deepEqual(r.clashed, ['カテゴリを削除: ペア蒸し']);
  // 相手が触っていなければ、削除がそのまま通る
  const r2 = rebaseModels(base, mine, structuredClone(base));
  assert.equal(grp(r2.models, 'pair'), undefined);
  assert.deepEqual(r2.clashed, []);
});

test('managedImages: only admin-made photos; a removed category frees its photo for deletion', () => {
  const m = readModels(html);
  const g = newGroup(m.groups, true);
  Object.assign(g, { title: 'x', rows: [{ name: 'a', yen: '1000', url: '' }] });
  Object.assign(g.photo, { src: 'images/photo-menu-gabc-k3j.jpg', alt: 'a', width: 1, height: 1 });
  m.groups.push(g);
  const withPhoto = applyModels(html, m);
  assert.deepEqual([...managedImages(withPhoto)], ['images/photo-menu-gabc-k3j.jpg']);
  assert.equal(managedImages(html).size, 0); // 手で置いた salon-*.jpg は対象外
  const back = readModels(withPhoto);
  back.groups = back.groups.filter((x) => x.id !== g.id);
  assert.equal(managedImages(applyModels(withPhoto, back)).size, 0);
});

test('parseGroups tolerates a hand-edited block without data-group', () => {
  const gs = parseGroups('<div class="price-group"><h3>A</h3><ul class="price-list"><li><span class="name">x</span><span class="yen">¥1,000</span></li></ul></div><div class="price-group"><h3>B</h3><ul class="price-list"></ul></div>');
  assert.deepEqual(gs.map((g) => g.id), ['c1', 'c2']);
  assert.ok(renderGroups(gs).includes('data-group="c1"'));
});
