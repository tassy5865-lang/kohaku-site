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
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'), 'the page itself carries a CSP');
  assert.ok(!/Content-Security-Policy/.test(p), 'the preview drops it (its sandbox has no origin for self)');
});
