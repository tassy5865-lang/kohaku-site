import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = JSON.parse(readFileSync(new URL('../../tools/rules.json', import.meta.url), 'utf8'));

test('rules.json has the expected keys', () => {
  for (const k of ['mustContain', 'mustNotContain', 'mustLink', 'forbiddenRe', 'sectionIds']) {
    // mustContain は空でもよい(必須語を課さない運用)
    assert.ok(Array.isArray(rules[k]) && (k === 'mustContain' || rules[k].length > 0), k);
  }
});

test('店主が編集する料金欄の値を必須語にしていない', () => {
  for (const s of ['¥10,000', '¥12,000', '100分']) assert.ok(!rules.mustContain.includes(s), `固定していないこと: ${s}`);
  assert.ok(!('prices' in rules) && !('rows' in rules));
});

test('forbidden patterns compile', () => {
  for (const f of rules.forbiddenRe) new RegExp(f.pattern);
});
