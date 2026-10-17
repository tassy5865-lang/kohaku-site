import { decryptToken } from './crypto.js';
import { SiteRepo, PublishError } from './github.js';
import { readModels, applyModels, summarizeChanges, rebaseModels, GROUPS, PHOTOS } from './site-model.js';
import { validateDocument } from './validate.js';
import { blocksToText, textToBlocks } from './blocks.js';
import { listToText, textToList } from './list.js';
import { formatYen } from './price.js';
import { toJpeg, bytesToDataUrl } from './images.js';
import { makePreview } from './preview.js';

const $ = (s) => document.querySelector(s);
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

let repo, site, models, original, rules, tab = 'text';
const pending = {}; // photo key → {path, bytes}
const DRAFT_KEY = 'kohaku-admin-draft';
let previewTimer;

const safe = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 下書きが保存できなくても編集は続けられる */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 同上 */ } },
};

function status(text) { $('#status').textContent = text; }

function strip(m) { // 下書きには、まだ公開していない写真を入れない
  const c = structuredClone(m);
  for (const k of Object.keys(c.photos)) {
    if (pending[k]) c.photos[k] = structuredClone(original.photos[k]);
    delete c.photos[k].previewSrc;
  }
  return c;
}

function changed() {
  schedulePreview();
  safe.set(DRAFT_KEY, JSON.stringify({
    headSha: site.headSha, base: strip(original), models: strip(models), photoKeys: Object.keys(pending),
  }));
  const n = summarizeChanges(original, models).length;
  status(n ? `未公開の変更が ${n} か所あります` : '変更はありません');
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    try { $('#preview').srcdoc = makePreview(applyModels(site.html, models, { preview: true })); }
    catch (e) { status(e.message); }
  }, 250);
}

// ---------- パネル ----------
function field(label, control, hint) {
  return h('label', {}, label, control, hint ? h('span', { class: 'small' }, hint) : null);
}
function textarea(value, onInput, rows = 6) {
  const t = h('textarea', { rows: String(rows), value });
  t.addEventListener('input', () => onInput(t.value));
  return t;
}
function input(value, onInput, extra = {}) {
  const i = h('input', { type: 'text', value, ...extra });
  i.addEventListener('input', () => onInput(i.value));
  return i;
}
function moveItem(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
const btn = (label, fn) => h('button', { class: 'btn', type: 'button', onclick: fn }, label);

function textPanel() {
  const m = models;
  return h('div', {},
    h('h2', {}, '自己紹介'),
    field('文章', textarea(blocksToText(m.about), (v) => { m.about = textToBlocks(v); changed(); }, 18),
      '段落は空行で区切ります。「## 」で始めた行は見出しになります。'),
    h('h2', {}, '「こんな不調、ありませんか?」'),
    field('チェックリスト', textarea(listToText(m.worriesList), (v) => { m.worriesList = textToList(v); changed(); }, 8), '1項目ごとに空行で区切ります。'),
    field('説明文', textarea(blocksToText(m.worriesLead), (v) => { m.worriesLead = textToBlocks(v).filter((b) => b.kind === 'p'); changed(); }, 10)),
    h('h2', {}, 'サロンのこだわり'),
    field('項目', textarea(listToText(m.kodawari), (v) => { m.kodawari = textToList(v); changed(); }, 12), '1項目ごとに空行で区切ります。'),
    h('h2', {}, 'よくある質問'),
    ...m.faq.map((f, i) => h('div', { class: 'card' },
      field('質問', input(f.q, (v) => { f.q = v; changed(); })),
      field('答え', textarea(f.a, (v) => { f.a = v; changed(); }, 4)),
      h('div', { class: 'row' },
        btn('↑', () => { moveItem(m.faq, i, -1); changed(); render(); }),
        btn('↓', () => { moveItem(m.faq, i, 1); changed(); render(); }),
        btn('削除', () => { m.faq.splice(i, 1); changed(); render(); })))),
    btn('質問を追加', () => { m.faq.push({ q: '', a: '' }); changed(); render(); }),
  );
}

function yenInput(row) {
  const i = input(row.yen, (v) => { row.yen = v; i.setAttribute('aria-invalid', String(!formatYen(v))); changed(); }, { inputmode: 'numeric', 'aria-label': '金額' });
  i.classList.add('yen');
  i.addEventListener('blur', () => {
    const f = formatYen(i.value);
    if (f && f !== i.value) { row.yen = f; i.value = f; i.setAttribute('aria-invalid', 'false'); changed(); }
  });
  i.setAttribute('aria-invalid', String(!formatYen(row.yen)));
  return i;
}

function pricePanel() {
  const m = models;
  const c = m.card;
  return h('div', {},
    h('h2', {}, '初回限定メニュー'),
    h('div', { class: 'card' },
      field('ラベル(空にすると非表示)', input(c.badge, (v) => { c.badge = v; changed(); })),
      field('メニュー名', input(c.title, (v) => { c.title = v; changed(); })),
      field('時間', input(c.time, (v) => { c.time = v; changed(); })),
      field('通常価格(空にすると非表示)', input(c.regular, (v) => { c.regular = v; changed(); }, { inputmode: 'numeric' })),
      field('今回の価格', input(c.price, (v) => { c.price = v; changed(); }, { inputmode: 'numeric' }))),
    ...Object.entries(GROUPS).map(([k, label]) => {
      const g = m.groups[k];
      return h('div', { class: 'card' },
        h('h2', {}, label),
        field('見出し', input(g.title, (v) => { g.title = v; changed(); })),
        field('見出しの下の注記(1行に1つ)', textarea(g.intro.join('\n'), (v) => { g.intro = v.split('\n').filter((s) => s.trim()); changed(); }, 2)),
        ...g.rows.map((r, i) => h('div', { class: 'row' },
          input(r.name, (v) => { r.name = v; changed(); }, { 'aria-label': 'メニュー名' }),
          yenInput(r),
          btn('↑', () => { moveItem(g.rows, i, -1); changed(); render(); }),
          btn('↓', () => { moveItem(g.rows, i, 1); changed(); render(); }),
          btn('削除', () => { g.rows.splice(i, 1); changed(); render(); }))),
        btn('行を追加', () => { g.rows.push({ name: '', yen: '' }); changed(); render(); }),
        field('一覧の下の注記(1行に1つ)', textarea(g.notes.join('\n'), (v) => { g.notes = v.split('\n').filter((s) => s.trim()); changed(); }, 2)));
    }),
  );
}

function photoPanel() {
  return h('div', {},
    h('p', { class: 'small' }, '写真を選ぶと自動で縮小されます。説明文は、目の見えない方や写真が表示されないときに読み上げられます。'),
    ...Object.entries(PHOTOS).map(([k, label]) => {
      const p = models.photos[k];
      const msg = h('p', { class: 'msg', role: 'alert' });
      const file = h('input', { type: 'file', accept: 'image/*' });
      file.addEventListener('change', async () => {
        msg.textContent = '';
        if (!file.files[0]) return;
        try {
          const { bytes, width, height } = await toJpeg(file.files[0]);
          const path = `images/photo-${k}-${Date.now().toString(36)}.jpg`;
          pending[k] = { path, bytes };
          Object.assign(p, { src: path, width, height, previewSrc: bytesToDataUrl(bytes) });
          changed();
          render();
        } catch (e) {
          msg.textContent = e.message;
          file.value = '';
        }
      });
      return h('div', { class: 'card' },
        h('h2', {}, label),
        h('img', { class: 'thumb', src: p.previewSrc || `../${p.src}`, alt: '' }),
        field('写真を差し替える', file),
        field('説明文', input(p.alt, (v) => { p.alt = v; changed(); })),
        msg);
    }),
  );
}

function noticePanel() {
  return h('div', {},
    h('h2', {}, 'お知らせ'),
    h('p', { class: 'small' }, '臨時休業や営業日の変更などを、ページの一番上に帯で表示します。空にすると非表示になります。'),
    field('お知らせの文', textarea(models.notice, (v) => { models.notice = v; changed(); }, 4)));
}

function render() {
  const panel = { text: textPanel, price: pricePanel, photo: photoPanel, notice: noticePanel }[tab];
  $('#panel').replaceChildren(panel());
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
}

// ---------- 公開 ----------
function buildFinal() {
  const html = applyModels(site.html, models);
  return { html, errors: validateDocument(html, rules) };
}

function openConfirm() {
  let built;
  try { built = buildFinal(); } catch (e) { status(e.message); return; }
  const list = summarizeChanges(original, models);
  $('#confirm-list').replaceChildren(...(list.length ? list : ['(変更はありません)']).map((t) => h('li', {}, t)));
  $('#confirm-errors').replaceChildren(...built.errors.map((e) => h('div', {}, e)));
  $('#confirm-ok').disabled = built.errors.length > 0 || list.length === 0;
  $('#confirm').showModal();
}

async function publish() {
  const ok = $('#confirm-ok');
  ok.disabled = true;
  status('公開しています…');
  try {
    const { html, errors } = buildFinal();
    if (errors.length) throw new Error(errors[0]);
    const files = [{ path: 'index.html', content: html }, ...Object.values(pending).map((p) => ({ path: p.path, content: p.bytes }))];
    // 差し替えで使わなくなった、管理画面が作った画像は同じコミットで消す(手で置いた画像は消さない)
    for (const k of Object.keys(pending)) {
      const old = original.photos[k].src;
      if (/^images\/photo-[\w-]+-[a-z0-9]+\.jpg$/.test(old) && !html.includes(old)) files.push({ path: old, remove: true });
    }
    const summary = summarizeChanges(original, models).join('、');
    await repo.commit({ headSha: site.headSha, treeSha: site.treeSha, files, message: `管理画面から更新: ${summary}` });
  } catch (e) {
    $('#confirm-errors').replaceChildren(h('div', {}, e.message));
    status(e instanceof PublishError ? e.message : '公開できませんでした。内容を確認してください。');
    ok.disabled = false;
    return;
  }
  // ここから先は公開済み。読み込み直しに失敗しても「公開できなかった」とは言わない。
  $('#confirm').close();
  safe.del(DRAFT_KEY);
  for (const k of Object.keys(pending)) delete pending[k];
  try {
    await loadSite();
    status('公開しました。反映まで 1〜2 分ほどかかります。');
  } catch {
    status('公開しました(反映まで 1〜2 分ほどかかります)。続けて編集する場合は、ページを読み込み直してください。');
    $('#publish').disabled = true;
  }
}

async function loadSite() {
  site = await repo.load();
  original = readModels(site.html);
  models = structuredClone(original);
  const raw = safe.get(DRAFT_KEY);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      const shape = (m) => JSON.stringify(Object.keys(m).sort());
      if (!d.models || shape(d.models) !== shape(original)) throw new Error('形が違う下書き');
      const note = d.photoKeys?.length ? '(選んだ写真は、もう一度選んでください)' : '';
      if (d.headSha === site.headSha) {
        models = d.models;
        status(`前回の下書きを復元しました${note}`);
      } else if (d.base && shape(d.base) === shape(original)) {
        const r = rebaseModels(d.base, d.models, original);
        models = r.models;
        status(r.clashed.length
          ? `ほかの変更と重なった所は新しい内容にしました: ${r.clashed.join('、')}。それ以外の下書きは復元しました${note}`
          : `ほかの変更を取り込んで、前回の下書きを復元しました${note}`);
      }
    } catch { safe.del(DRAFT_KEY); /* 壊れた下書きは捨てる */ }
  }
  render();
  schedulePreview();
}

async function login(pass) {
  const config = await (await fetch('config.json', { cache: 'no-store' })).json();
  rules = await (await fetch('../tools/rules.json', { cache: 'no-store' })).json();
  const token = await decryptToken(config.box, pass);
  repo = new SiteRepo({ owner: config.owner, repo: config.repo, branch: config.branch, token });
  await loadSite();
}

$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#login-msg');
  msg.textContent = '確認しています…';
  try {
    await login($('#pass').value);
    $('#pass').value = '';
    $('#login').hidden = true;
    $('#editor').hidden = false;
    msg.textContent = '';
  } catch (e) {
    msg.textContent = e.message || 'うまくいきませんでした。';
  }
});
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => { tab = b.dataset.tab; render(); });
}
$('#publish').addEventListener('click', openConfirm);
$('#confirm-cancel').addEventListener('click', () => $('#confirm').close());
$('#confirm-ok').addEventListener('click', publish);
