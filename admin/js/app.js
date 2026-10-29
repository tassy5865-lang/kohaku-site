import { decryptToken } from './crypto.js';
import { SiteRepo, PublishError } from './github.js';
import { readModels, applyModels, summarizeChanges, rebaseModels, managedImages, PHOTOS } from './site-model.js';
import { validateDocument } from './validate.js';
import { blocksToText, textToBlocks } from './blocks.js';
import { listToText, textToList } from './list.js';
import { formatYen, newGroup, validateGroups, isLinkUrl, MAX_GROUPS } from './price.js';
import { toJpeg, bytesToDataUrl } from './images.js';
import { makePreview } from './preview.js';
import { TEXT_SLOTS } from './text-slots.js';

// 他のサイトの枠に埋め込まれていたら何も表示しない(クリックジャッキング対策)
if (window.top !== window.self) document.documentElement.classList.add('framed');

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

const groupPhotoKey = (g) => `menu-${g.id}`;

function strip(m) { // 下書きには、まだ公開していない写真を入れない
  const c = structuredClone(m);
  for (const k of Object.keys(c.photos)) {
    if (pending[k]) c.photos[k] = structuredClone(original.photos[k]);
    delete c.photos[k].previewSrc;
  }
  for (const g of c.groups) {
    if (!g.photo) continue;
    if (pending[groupPhotoKey(g)]) {
      g.photo = structuredClone(original.groups.find((o) => o.id === g.id)?.photo ?? { src: '', alt: g.photo.alt, width: 0, height: 0 });
    }
    delete g.photo.previewSrc;
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
    h('h2', {}, 'メニューのカテゴリ'),
    h('p', { class: 'small' }, 'カテゴリごとに、見出し・料金の行・写真を編集できます。写真つきのカテゴリは、写真の左右が上から順に自動で入れ替わります。'),
    ...m.groups.map((g, i) => groupCard(g, i)),
    h('div', { class: 'row' },
      addGroupButton('カテゴリを追加(写真なし)', false),
      addGroupButton('カテゴリを追加(写真つき)', true)),
    m.groups.length >= MAX_GROUPS ? h('p', { class: 'small' }, `カテゴリは${MAX_GROUPS}個までです。`) : null,
  );
}

function addGroupButton(label, withPhoto) {
  const b = btn(label, () => { models.groups.push(newGroup(models.groups, withPhoto)); changed(); render(); });
  b.disabled = models.groups.length >= MAX_GROUPS;
  return b;
}

function urlInput(row) {
  const i = input(row.url ?? '', (v) => { row.url = v; i.setAttribute('aria-invalid', String(Boolean(v.trim()) && !isLinkUrl(v))); changed(); },
    { inputmode: 'url', placeholder: 'リンク先(任意) https://…', 'aria-label': 'リンク先のアドレス(任意)' });
  i.setAttribute('aria-invalid', String(Boolean((row.url ?? '').trim()) && !isLinkUrl(row.url)));
  return i;
}

function deleteGroupButton(i) {
  const g = models.groups[i];
  const b = btn('カテゴリを削除', () => {
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = 'もう一度押すと削除します';
      setTimeout(() => { delete b.dataset.armed; b.textContent = 'カテゴリを削除'; }, 4000);
      return;
    }
    delete pending[groupPhotoKey(g)];
    models.groups.splice(i, 1);
    changed();
    render();
  });
  return b;
}

function groupCard(g, i) {
  const m = models;
  const photoToggle = h('input', { type: 'checkbox', checked: Boolean(g.photo) });
  photoToggle.addEventListener('change', () => {
    if (photoToggle.checked) g.photo = { src: '', alt: '', width: 0, height: 0 };
    else { g.photo = null; delete pending[groupPhotoKey(g)]; }
    changed();
    render();
  });
  return h('div', { class: 'card' },
    h('h2', {}, `カテゴリ ${i + 1}${g.title.trim() ? `:${g.title.trim()}` : ''}`),
    h('div', { class: 'row' },
      btn('↑ 上へ', () => { moveItem(m.groups, i, -1); changed(); render(); }),
      btn('↓ 下へ', () => { moveItem(m.groups, i, 1); changed(); render(); }),
      deleteGroupButton(i)),
    field('見出し(カテゴリ名)', input(g.title, (v) => { g.title = v; changed(); })),
    h('label', { class: 'check' }, photoToggle, '写真をつける'),
    g.photo ? h('div', {}, ...photoFields(groupPhotoKey(g), g.photo)) : null,
    field('見出しの下の注記(1行に1つ)', textarea(g.intro.join('\n'), (v) => { g.intro = v.split('\n').filter((s) => s.trim()); changed(); }, 2)),
    ...g.rows.map((r, j) => h('div', { class: 'rowset' },
      h('div', { class: 'row' },
        input(r.name, (v) => { r.name = v; changed(); }, { 'aria-label': 'メニュー名' }),
        yenInput(r),
        btn('↑', () => { moveItem(g.rows, j, -1); changed(); render(); }),
        btn('↓', () => { moveItem(g.rows, j, 1); changed(); render(); }),
        btn('削除', () => { g.rows.splice(j, 1); changed(); render(); })),
      h('div', { class: 'row' }, urlInput(r)))),
    btn('行を追加', () => { g.rows.push({ name: '', yen: '', url: '' }); changed(); render(); }),
    field('一覧の下の注記(1行に1つ)', textarea(g.notes.join('\n'), (v) => { g.notes = v.split('\n').filter((s) => s.trim()); changed(); }, 2)));
}

// 写真の選択欄(サムネイル・差し替え・説明文)。写真タブとメニューのカテゴリで共用する。
function photoFields(key, p) {
  const msg = h('p', { class: 'msg', role: 'alert' });
  const file = h('input', { type: 'file', accept: 'image/*' });
  file.addEventListener('change', async () => {
    msg.textContent = '';
    if (!file.files[0]) return;
    try {
      const { bytes, width, height } = await toJpeg(file.files[0]);
      const path = `images/photo-${key}-${Date.now().toString(36)}.jpg`;
      pending[key] = { path, bytes };
      Object.assign(p, { src: path, width, height, previewSrc: bytesToDataUrl(bytes) });
      changed();
      render();
    } catch (e) {
      msg.textContent = e.message;
      file.value = '';
    }
  });
  const shown = p.previewSrc || (p.src ? `../${p.src}` : '');
  return [
    shown ? h('img', { class: 'thumb', src: shown, alt: '' }) : h('p', { class: 'small' }, 'まだ写真が選ばれていません。'),
    field(p.src ? '写真を差し替える' : '写真を選ぶ', file),
    msg,
  ];
}

function photoPanel() {
  return h('div', {},
    h('p', { class: 'small' }, '写真を選ぶと自動で縮小されます。'),
    ...Object.entries(PHOTOS).map(([k, label]) => h('div', { class: 'card' }, h('h2', {}, label), ...photoFields(k, models.photos[k]))),
    ...models.groups.filter((g) => g.photo).map((g) => h('div', { class: 'card' },
      h('h2', {}, `メニュー:${g.title.trim() || '(名前なし)'}`), ...photoFields(groupPhotoKey(g), g.photo))),
  );
}

function otherTextPanel() {
  const groups = [...new Set(TEXT_SLOTS.map((t) => t.group))];
  return h('div', {},
    h('p', { class: 'small' }, '見出し・ボタンの文字・ご来店の流れ・注意書き・アクセスなど、ほかのタブにない文字をここで直せます。改行したいところは、枠の中で改行してください。'),
    ...groups.map((g) => h('details', { class: 'card' },
      h('summary', {}, h('strong', {}, g)),
      ...TEXT_SLOTS.filter((t) => t.group === g).map((t) => {
        const v = models.texts[t.key];
        const multi = v.includes('\n') || v.length > 40;
        return field(t.label, multi
          ? textarea(v, (x) => { models.texts[t.key] = x; changed(); }, Math.min(8, Math.max(2, v.split('\n').length + 1)))
          : input(v, (x) => { models.texts[t.key] = x; changed(); }));
      }))));
}

function noticePanel() {
  return h('div', {},
    h('h2', {}, 'お知らせ'),
    h('p', { class: 'small' }, '臨時休業や営業日の変更などを、ページの一番上に帯で表示します。空にすると非表示になります。'),
    field('お知らせの文', textarea(models.notice, (v) => { models.notice = v; changed(); }, 4)));
}

function render() {
  const panel = { text: textPanel, other: otherTextPanel, price: pricePanel, photo: photoPanel, notice: noticePanel }[tab];
  $('#panel').replaceChildren(panel());
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
}

// ---------- 公開 ----------
function buildFinal() {
  const html = applyModels(site.html, models);
  return { html, errors: [...validateGroups(models.groups), ...validateDocument(html, rules)] };
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
    // ページに載らなくなった写真(カテゴリごと消した・外した)は、アップロードしない
    const files = [{ path: 'index.html', content: html },
      ...Object.values(pending).filter((p) => html.includes(p.path)).map((p) => ({ path: p.path, content: p.bytes }))];
    // 差し替え・削除で使わなくなった、管理画面が作った画像は同じコミットで消す(手で置いた画像は消さない)
    const stillUsed = managedImages(html);
    for (const old of managedImages(site.html)) if (!stillUsed.has(old)) files.push({ path: old, remove: true });
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
      if (!d.models || shape(d.models) !== shape(original) || !Array.isArray(d.models.groups)) throw new Error('形が違う下書き');
      const note = d.photoKeys?.length ? '(選んだ写真は、もう一度選んでください)' : '';
      if (d.headSha === site.headSha) {
        models = d.models;
        status(`前回の下書きを復元しました${note}`);
      } else if (d.base && shape(d.base) === shape(original) && Array.isArray(d.base.groups)) {
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

// 秘密の鍵はリンクの #k=… で渡される。受け取ったらこの端末に保存し、アドレス欄からは消す。
const KEY_STORE = 'kohaku-admin-key';
function takeKey() {
  const m = /[#&]k=([\w-]{16,})/.exec(location.hash);
  if (m) {
    safe.set(KEY_STORE, m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    return m[1];
  }
  return safe.get(KEY_STORE) || '';
}

async function login(pass) {
  const config = await (await fetch('config.json', { cache: 'no-store' })).json();
  rules = await (await fetch('../tools/rules.json', { cache: 'no-store' })).json();
  const token = await decryptToken(config.box, pass, takeKey());
  repo = new SiteRepo({ owner: config.owner, repo: config.repo, branch: config.branch, token });
  await loadSite();
}

// ---------- 放置したら鍵を手放す ----------
// 30 分操作がなければ、メモリ上の鍵を捨てて入口に戻す。下書きは残るので、入り直せば続きから編集できる。
const IDLE_MS = 30 * 60 * 1000;
let idleTimer;
function lock(message) {
  clearTimeout(idleTimer);
  repo = undefined; site = undefined;
  $('#confirm').close();
  $('#editor').hidden = true;
  $('#login').hidden = false;
  $('#preview').srcdoc = '';
  $('#login-msg').textContent = message;
}
function touch() {
  if (!repo) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lock('しばらく操作がなかったため、安全のためログアウトしました。編集中の内容は残っています。'), IDLE_MS);
}
for (const ev of ['pointerdown', 'keydown', 'input']) document.addEventListener(ev, touch, { passive: true });

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
    touch();
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
