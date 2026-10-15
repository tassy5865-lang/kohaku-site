import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, bytesToDataUrl } from '../js/images.js';

test('fitSize shrinks the long side to max and keeps the ratio', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(3000, 4000), { width: 1200, height: 1600 });
});
test('fitSize never enlarges', () => {
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});
test('bytesToDataUrl', () => {
  assert.equal(bytesToDataUrl(new Uint8Array([1, 2, 3])), 'data:image/jpeg;base64,AQID');
});
