import test from 'node:test';
import assert from 'node:assert/strict';
import { SiteRepo, PublishError } from '../js/github.js';
import { toBase64 } from '../js/b64.js';

function fakeGithub(opts = {}) {
  const st = { head: 'c1', commits: { c1: { tree: 't1', parent: null } }, blobs: {}, trees: {}, n: 1, files: { 'index.html': '<html>旧</html>' }, calls: [] };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const f = async (url, init = {}) => {
    const method = init.method || 'GET';
    const path = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : null;
    st.calls.push(`${method} ${path}`);
    if (opts.status) return json(opts.status, { message: 'x' });
    if (method === 'GET' && path === '/git/ref/heads/main') return json(200, { object: { sha: st.head } });
    let m;
    if (method === 'GET' && (m = path.match(/^\/git\/commits\/(.+)$/))) return json(200, { tree: { sha: st.commits[m[1]].tree } });
    if (method === 'GET' && path.startsWith('/contents/')) {
      const name = decodeURIComponent(path.slice('/contents/'.length));
      return json(200, { content: toBase64(new TextEncoder().encode(st.files[name])), encoding: 'base64' });
    }
    if (method === 'POST' && path === '/git/blobs') { const id = `b${++st.n}`; st.blobs[id] = body.content; return json(201, { sha: id }); }
    if (method === 'POST' && path === '/git/trees') { const id = `t${++st.n}`; st.trees[id] = body; return json(201, { sha: id }); }
    if (method === 'POST' && path === '/git/commits') { const id = `c${++st.n}`; st.commits[id] = { tree: body.tree, parent: body.parents[0], message: body.message }; return json(201, { sha: id }); }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      if (body.force !== false) throw new Error('force must be false');
      if (st.commits[body.sha].parent !== st.head) return json(422, { message: 'Update is not a fast forward' });
      st.head = body.sha;
      return json(200, {});
    }
    return json(404, { message: 'not found ' + path });
  };
  return { st, f };
}

test('load returns head, tree and decoded html', async () => {
  const { f } = fakeGithub();
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  const s = await repo.load();
  assert.deepEqual({ headSha: s.headSha, treeSha: s.treeSha, html: s.html }, { headSha: 'c1', treeSha: 't1', html: '<html>旧</html>' });
});

test('commit puts html and image into one commit', async () => {
  const { st, f } = fakeGithub();
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  const s = await repo.load();
  const out = await repo.commit({
    ...s,
    files: [{ path: 'index.html', content: '<html>新</html>' }, { path: 'images/a.jpg', content: new Uint8Array([1, 2, 3]) }],
    message: '管理画面から更新',
  });
  assert.equal(st.head, out.headSha);
  const tree = Object.values(st.trees)[0];
  assert.equal(tree.base_tree, 't1');
  assert.deepEqual(tree.tree.map((t) => t.path).sort(), ['images/a.jpg', 'index.html']);
  assert.equal(st.commits[st.head].message, '管理画面から更新');
  assert.equal(st.calls.filter((c) => c === 'POST /git/commits').length, 1);
});

test('a concurrent change is reported as CONFLICT and nothing is overwritten', async () => {
  const { st, f } = fakeGithub();
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  const s = await repo.load();
  st.commits.cX = { tree: 'tX', parent: 'c1' };
  st.head = 'cX'; // 田代さんが push した
  await assert.rejects(
    () => repo.commit({ ...s, files: [{ path: 'index.html', content: 'x' }], message: 'm' }),
    (e) => e instanceof PublishError && e.code === 'CONFLICT' && /読み込み直して/.test(e.message),
  );
  assert.equal(st.head, 'cX');
});

test('401 is AUTH with a message about the expired token', async () => {
  const { f } = fakeGithub({ status: 401 });
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: f });
  await assert.rejects(() => repo.load(), (e) => e.code === 'AUTH' && /期限/.test(e.message));
});

test('a network failure is NETWORK', async () => {
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 't', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(() => repo.load(), (e) => e.code === 'NETWORK' && /通信/.test(e.message));
});

test('the token is only sent as a bearer header', async () => {
  const { f } = fakeGithub();
  let seen;
  const spy = async (url, init) => { seen = { url, init }; return f(url, init); };
  const repo = new SiteRepo({ owner: 'o', repo: 'r', token: 'SECRET', fetchImpl: spy });
  await repo.load();
  assert.ok(!seen.url.includes('SECRET'));
  assert.equal(seen.init.headers.Authorization, 'Bearer SECRET');
});
