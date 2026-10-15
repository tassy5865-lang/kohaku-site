import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegion, setRegion, getPhoto, setPhoto } from '../js/regions.js';

const html = '<main><!--edit:a-->old<!--/edit:a--><p>keep $& this</p><img src="images/x.jpg" width="10" height="20" data-photo="p1" alt="旧"></main>';

test('getRegion returns inner text', () => {
  assert.equal(getRegion(html, 'a'), 'old');
});
test('setRegion replaces only the region and keeps $ patterns literal', () => {
  const out = setRegion(html, 'a', 'new $& $1');
  assert.equal(getRegion(out, 'a'), 'new $& $1');
  assert.ok(out.includes('<p>keep $& this</p>'));
});
test('missing marker throws a Japanese message', () => {
  assert.throws(() => getRegion(html, 'zzz'), /編集範囲の目印がありません: zzz/);
});
test('duplicated marker throws', () => {
  const dup = html + '<!--edit:a--><!--/edit:a-->';
  assert.throws(() => getRegion(dup, 'a'), /重複/);
});
test('unclosed marker throws', () => {
  assert.throws(() => getRegion('<!--edit:a-->x', 'a'), /閉じ/);
});
test('getPhoto / setPhoto read and write attributes', () => {
  assert.deepEqual(getPhoto(html, 'p1'), { src: 'images/x.jpg', alt: '旧', width: 10, height: 20 });
  const out = setPhoto(html, 'p1', { src: 'images/y.jpg', alt: 'a"b', width: 30, height: 40 });
  assert.deepEqual(getPhoto(out, 'p1'), { src: 'images/y.jpg', alt: 'a"b', width: 30, height: 40 });
  assert.ok(out.includes('data-photo="p1"'));
});
test('missing photo key throws', () => {
  assert.throws(() => getPhoto(html, 'nope'), /写真の目印がありません: nope/);
});
