import test from 'node:test';
import assert from 'node:assert/strict';
import { formatYen } from '../js/price.js';

test('formats common inputs', () => {
  assert.equal(formatYen('10000'), '¥10,000');
  assert.equal(formatYen('¥10,000'), '¥10,000');
  assert.equal(formatYen('１０，０００'), '¥10,000');
  assert.equal(formatYen('10,000円'), '¥10,000');
  assert.equal(formatYen(' ￥6000 '), '¥6,000');
});
test('rejects what cannot be a price', () => {
  for (const bad of ['', '1万', '-500', '0', 'abc', '12.5', '¥']) assert.equal(formatYen(bad), null, bad);
});
