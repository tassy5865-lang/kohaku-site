import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePreview } from '../js/preview.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('preview has no scripts, no intro overlay, and a base href', () => {
  const p = makePreview(html);
  assert.ok(!/<script\b/i.test(p));
  assert.ok(!p.includes('class="intro"'));
  assert.match(p, /<head>\s*<base href="\.\.\/">/);
  assert.ok(p.includes('<h1>'));
});
