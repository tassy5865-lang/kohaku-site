import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDocument } from '../js/validate.js';
import { readModels, applyModels } from '../js/site-model.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const rules = JSON.parse(readFileSync(new URL('../../tools/rules.json', import.meta.url), 'utf8'));

test('the real page passes', () => {
  assert.deepEqual(validateDocument(html, rules), []);
});

test('a price in a bad format is rejected with the row name', () => {
  const m = readModels(html);
  m.groups.pair.rows[0].yen = '1万';
  const errs = validateDocument(applyModels(html, m), rules);
  assert.ok(errs.some((e) => e.includes('料金の形式が正しくありません') && e.includes('よもぎ蒸し')), errs.join('\n'));
});

test('empty price is rejected', () => {
  const m = readModels(html);
  m.groups.body.rows[0].yen = '';
  assert.ok(validateDocument(applyModels(html, m), rules).length > 0);
});

test('forbidden words are named', () => {
  const m = readModels(html);
  m.about[0].text = 'これで疲れが改善します';
  const errs = validateDocument(applyModels(html, m), rules);
  assert.ok(errs.some((e) => e.includes('改善')), errs.join('\n'));
});

test('a phone-number-like string is rejected', () => {
  const m = readModels(html);
  m.notice = 'お問い合わせは 079-123-4567 まで';
  assert.ok(validateDocument(applyModels(html, m), rules).some((e) => e.includes('電話番号')));
});

test('removing a required phrase is reported', () => {
  const m = readModels(html);
  m.about = m.about.filter((b) => !b.text.includes('12年目')); // 「12年目」は自己紹介にしかない
  const errs = validateDocument(applyModels(html, m), rules);
  assert.ok(errs.some((e) => e.includes('12年目')), errs.join('\n'));
});

test('a photo without alt text is rejected', () => {
  const m = readModels(html);
  m.photos.about.alt = '';
  assert.ok(validateDocument(applyModels(html, m), rules).some((e) => e.includes('説明文')));
});

test('a price card with no price is rejected', () => {
  const m = readModels(html);
  m.card.price = 'abc';
  assert.ok(validateDocument(applyModels(html, m), rules).some((e) => e.includes('料金の形式')));
});
