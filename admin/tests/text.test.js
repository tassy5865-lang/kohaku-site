import test from 'node:test';
import assert from 'node:assert/strict';
import { toInline, fromInline, escapeAttr } from '../js/text.js';
import { toBase64, fromBase64 } from '../js/b64.js';

test('toInline escapes markup and converts newlines to <br>', () => {
  assert.equal(toInline('a<b>&c\nd'), 'a&lt;b&gt;&amp;c<br>d');
});
test('script tags become inert text', () => {
  assert.ok(!toInline('<script>alert(1)</script>').includes('<script'));
});
test('fromInline is the inverse of toInline', () => {
  const s = 'こんにちは<&>"\n二行目';
  assert.equal(fromInline(toInline(s)), s);
});
test('fromInline strips unknown tags but keeps text', () => {
  assert.equal(fromInline('<s>通常</s>価格'), '通常価格');
});
test('escapeAttr escapes quotes', () => {
  assert.equal(escapeAttr('a"b'), 'a&quot;b');
});
test('base64 round trip with large input', () => {
  const u = new Uint8Array(100000).map((_, i) => i % 256);
  assert.deepEqual(fromBase64(toBase64(u)), u);
});
