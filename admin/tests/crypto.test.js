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

test('with a secret: password alone cannot open the box, password + secret can', async () => {
  const secret = 'AbCdEfGhIjKlMnOp-_QrSt';
  const box = await encryptToken('github_pat_abc', 'pw', 1000, secret);
  assert.equal(box.v, 2);
  assert.equal(await decryptToken(box, 'pw', secret), 'github_pat_abc');
  await assert.rejects(() => decryptToken(box, 'pw', 'x'.repeat(22)), /パスワードか、管理画面のリンクが違います/);
  await assert.rejects(() => decryptToken(box, 'wrong', secret), /パスワードか/);
});
test('a box made with a secret asks for the link when the secret is missing', async () => {
  const box = await encryptToken('t', 'pw', 1000, 'S'.repeat(22));
  await assert.rejects(() => decryptToken(box, 'pw'), /リンク/);
});
test('the secret is not stored in the box', async () => {
  const secret = 'UNIQUESECRET1234567890';
  const box = await encryptToken('t', 'pw', 1000, secret);
  assert.ok(!JSON.stringify(box).includes(secret));
});
test('old boxes (v1, no secret) still open', async () => {
  const box = await encryptToken('t', 'pw', 1000);
  assert.equal(box.v, 1);
  assert.equal(await decryptToken(box, 'pw', 'ignored-secret-value'), 't');
});
