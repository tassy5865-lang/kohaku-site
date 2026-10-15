import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptToken, decryptToken } from '../js/crypto.js';

test('round trip', async () => {
  const box = await encryptToken('github_pat_abc', 'correct horse', 1000);
  assert.equal(await decryptToken(box, 'correct horse'), 'github_pat_abc');
});
test('wrong password gives a Japanese error, not a crash', async () => {
  const box = await encryptToken('t', 'right', 1000);
  await assert.rejects(() => decryptToken(box, 'wrong'), /パスワードが違います/);
});
test('each encryption uses a fresh salt and iv', async () => {
  const a = await encryptToken('t', 'p', 1000);
  const b = await encryptToken('t', 'p', 1000);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});
test('the box does not contain the token', async () => {
  const box = await encryptToken('github_pat_SECRET', 'p', 1000);
  assert.ok(!JSON.stringify(box).includes('SECRET'));
});
