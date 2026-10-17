import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dir = new URL('../js/', import.meta.url);
const sources = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? '';
const directive = (name) => (new RegExp(`(?:^|; )${name} ([^;]*)`).exec(csp) || [])[1];

test('CSP: scripts only from this site, no eval, no plugins, network only to GitHub', () => {
  assert.equal(directive('default-src'), "'none'");
  assert.equal(directive('script-src'), "'self'");
  assert.equal(directive('connect-src'), "'self' https://api.github.com");
  assert.equal(directive('object-src'), "'none'");
  assert.equal(directive('form-action'), "'none'");
  assert.equal(directive('frame-src'), 'about:', 'プレビュー(srcdoc)の表示に必要');
  assert.ok(!/unsafe-eval|\*/.test(csp));
});

test('the admin page has no inline script or event-handler attributes', () => {
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(page));
  assert.ok(!/\son[a-z]+\s*=/i.test(page));
  assert.ok(/<meta name="referrer" content="no-referrer">/.test(page));
  assert.ok(/<iframe[^>]*\bsandbox=""/.test(page), 'プレビューは sandbox="" のまま');
});

test('admin code never uses HTML-injection or dynamic-code sinks', () => {
  for (const [name, src] of sources) {
    assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/.test(src), `${name} に危険な書き出しがあります`);
  }
});

test('the token is never written to storage or the console', () => {
  for (const [name, src] of sources) {
    assert.ok(!/(localStorage|sessionStorage)\.setItem\([^)]*token/i.test(src), name);
    assert.ok(!/console\.(log|info|debug)\([^)]*token/i.test(src), name);
  }
  const app = sources.find(([n]) => n === 'app.js')[1];
  assert.ok(!/safe\.set\([^)]*token/i.test(app));
});
