import { toBase64, fromBase64 } from './b64.js';

export class PublishError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class SiteRepo {
  constructor({ owner, repo, branch = 'main', token, fetchImpl }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.f = fetchImpl || ((...a) => fetch(...a));
  }

  async #api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await this.f(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new PublishError('NETWORK', '通信できませんでした。電波の良い場所で、もう一度お試しください。何も変更されていません。');
    }
    if (res.status === 403 && (res.headers?.get?.('x-ratelimit-remaining') === '0' || res.headers?.get?.('retry-after'))) {
      throw new PublishError('RATE', 'アクセスが集中しています。10分ほど待ってから、もう一度お試しください。何も変更されていません。');
    }
    if (res.status === 401 || res.status === 403) {
      throw new PublishError('AUTH', '管理画面の鍵の有効期限が切れています。田代さんに連絡してください。');
    }
    if (!res.ok) {
      const conflict = method === 'PATCH' && (res.status === 422 || res.status === 409);
      if (conflict) {
        throw new PublishError('CONFLICT', 'ほかの変更が先に入っていました。ページを読み込み直して、もう一度ログインしてください。編集中の内容は引き継がれます(何も上書きしていません)。');
      }
      throw new PublishError('OTHER', `うまくいきませんでした(${res.status})。しばらくしてからもう一度お試しください。`);
    }
    return res.json();
  }

  async load(path = 'index.html') {
    const ref = await this.#api(`/git/ref/heads/${this.branch}`);
    const headSha = ref.object.sha;
    const commit = await this.#api(`/git/commits/${headSha}`);
    const file = await this.#api(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${headSha}`);
    return { headSha, treeSha: commit.tree.sha, html: new TextDecoder().decode(fromBase64(file.content)) };
  }

  async commit({ headSha, treeSha, files, message }) {
    const entries = [];
    for (const f of files) {
      if (f.remove) { // 使わなくなった画像を同じコミットで消す
        entries.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const bytes = typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content;
      const blob = await this.#api('/git/blobs', { method: 'POST', body: { content: toBase64(bytes), encoding: 'base64' } });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await this.#api('/git/trees', { method: 'POST', body: { base_tree: treeSha, tree: entries } });
    const commit = await this.#api('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [headSha] } });
    await this.#api(`/git/refs/heads/${this.branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    return { headSha: commit.sha };
  }
}
