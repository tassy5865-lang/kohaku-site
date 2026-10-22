import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRegion, getPhoto } from '../js/regions.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const REGIONS = ['notice', 'about', 'worries-list', 'worries-lead', 'kodawari-points', 'faq', 'price-card', 'menu-groups'];
const PHOTOS = ['hero-l', 'hero-r', 'about', 'kodawari-1', 'kodawari-2', 'menu-rose', 'menu-body', 'menu-pair', 'access'];

test('every edit region exists exactly once', () => {
  for (const k of REGIONS) assert.doesNotThrow(() => getRegion(html, k), k);
});
test('every photo key exists and has alt text', () => {
  for (const k of PHOTOS) assert.ok(getPhoto(html, k).alt.length > 0, k);
});
test('notice region is empty by default', () => {
  assert.equal(getRegion(html, 'notice'), '');
});
test('regions hold what we expect', () => {
  assert.match(getRegion(html, 'about'), /はじめまして/);
  assert.match(getRegion(html, 'menu-groups'), /フェイシャルコース/);
  assert.match(getRegion(html, 'menu-groups'), /ペア蒸し/);
  assert.match(getRegion(html, 'faq'), /予約は必要ですか/);
});
