import { getRegion, setRegion, getPhoto, setPhoto } from './regions.js';
import { parseBlocks, renderBlocks } from './blocks.js';
import { parseList, renderList } from './list.js';
import { parseFaq, renderFaq } from './faq.js';
import { parseCard, renderCard, parseGroups, renderGroups } from './price.js';
import { toInline, fromInline } from './text.js';

export const PHOTOS = {
  'hero-l': 'トップ(左)',
  'hero-r': 'トップ(右)',
  about: '自己紹介',
  'kodawari-1': 'こだわり(1枚目)',
  'kodawari-2': 'こだわり(2枚目)',
  access: 'アクセス',
};

function parseNotice(html) {
  const m = /<p>([\s\S]*?)<\/p>/.exec(html);
  return m ? fromInline(m[1]) : '';
}
function renderNotice(text) {
  return text.trim() ? `<div class="announce" role="status"><p>${toInline(text.trim())}</p></div>` : '';
}

export function readModels(html) {
  const photos = {};
  for (const k of Object.keys(PHOTOS)) photos[k] = getPhoto(html, k);
  return {
    notice: parseNotice(getRegion(html, 'notice')),
    about: parseBlocks(getRegion(html, 'about')),
    worriesList: parseList(getRegion(html, 'worries-list')),
    worriesLead: parseBlocks(getRegion(html, 'worries-lead')),
    kodawari: parseList(getRegion(html, 'kodawari-points')),
    faq: parseFaq(getRegion(html, 'faq')),
    card: parseCard(getRegion(html, 'price-card')),
    groups: parseGroups(getRegion(html, 'menu-groups')),
    photos,
  };
}

export function applyModels(html, m, { preview = false } = {}) {
  let out = html;
  out = setRegion(out, 'notice', renderNotice(m.notice));
  out = setRegion(out, 'about', renderBlocks(m.about, { indent: '          ' }));
  out = setRegion(out, 'worries-list', renderList(m.worriesList, { indent: '          ' }));
  out = setRegion(out, 'worries-lead', renderBlocks(m.worriesLead, { indent: '        ', pClass: 'lead lead--serif' }));
  out = setRegion(out, 'kodawari-points', renderList(m.kodawari, { indent: '            ', closeIndent: '          ' }));
  out = setRegion(out, 'faq', renderFaq(m.faq, { indent: '        ', closeIndent: '      ' }));
  out = setRegion(out, 'price-card', renderCard(m.card, { indent: '          ', closeIndent: '        ' }));
  out = setRegion(out, 'menu-groups', renderGroups(m.groups, { indent: '        ', closeIndent: '        ', preview }));
  for (const k of Object.keys(PHOTOS)) {
    const p = m.photos[k];
    out = setPhoto(out, k, { ...p, src: preview && p.previewSrc ? p.previewSrc : p.src });
  }
  return out;
}

// 管理画面が作った写真ファイル(手で置いた画像は含めない)。ページから外れたものは公開時に消す。
export const managedImages = (html) => new Set(html.match(/images\/photo-[\w-]+-[a-z0-9]+\.jpg/g) ?? []);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 下書き(mine)を、別の変更が入った最新(latest)に載せ替える。base は下書きを始めた時点の状態。
// 自分だけが触った領域は下書きを、誰も触っていない領域は最新を、両方が違う内容に変えた領域は最新を使う。
export function rebaseModels(base, mine, latest) {
  const out = structuredClone(latest);
  const clash = structuredClone(base);
  let clashed = false;
  const pick = (get, set) => {
    const b = get(base), m = get(mine), l = get(latest);
    if (same(b, m)) return;                       // 自分は触っていない
    if (same(b, l) || same(m, l)) set(out, m);    // 相手が触っていない(または同じ変更)
    else { set(clash, m); clashed = true; }       // 両方が違う内容に変更
  };
  for (const k of Object.keys(latest)) {
    if (k === 'photos') {
      for (const s of Object.keys(latest[k])) pick((o) => o[k][s], (o, v) => { o[k][s] = v; });
    } else if (k === 'groups') {
      if (rebaseGroups(base.groups, mine.groups, latest.groups, out, clash)) clashed = true;
    } else {
      pick((o) => o[k], (o, v) => { o[k] = v; });
    }
  }
  return { models: out, clashed: clashed ? summarizeChanges(base, clash) : [] };
}

// メニューのカテゴリは、id ごとに合流させる(別々のカテゴリを直していても衝突にしない)。
function rebaseGroups(base, mine, latest, out, clash) {
  const find = (arr, id) => arr.find((g) => g.id === id);
  const ids = (arr) => arr.map((g) => g.id);
  let clashed = false;
  let result = structuredClone(latest);
  const clashed_ = structuredClone(base);
  const put = (arr, g) => { const i = arr.findIndex((x) => x.id === g.id); if (i >= 0) arr[i] = structuredClone(g); else arr.push(structuredClone(g)); };
  const drop = (arr, id) => { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); };
  for (const b of base) {
    const m = find(mine, b.id);
    const l = find(latest, b.id);
    if (!m) {                                                     // 自分が削除した
      if (!l) continue;
      if (same(b, l)) drop(result, b.id);
      else { drop(clashed_, b.id); clashed = true; }              // 相手が編集したカテゴリを、自分は削除した
    } else if (!l) {                                              // 相手が削除した
      if (!same(b, m)) { put(clashed_, m); clashed = true; }
    } else if (!same(b, m)) {                                     // 自分が編集した
      if (same(b, l) || same(m, l)) put(result, m);
      else { put(clashed_, m); clashed = true; }
    }
  }
  for (const m of mine) if (!find(base, m.id) && !find(result, m.id)) result.push(structuredClone(m)); // 自分が追加した
  if (same(ids(base), ids(latest))) {                             // 並び順は、相手が動かしていなければ自分の順にする
    const order = ids(mine).filter((id) => find(result, id));
    result = [...order.map((id) => find(result, id)), ...result.filter((g) => !order.includes(g.id))];
  }
  out.groups = result;
  clash.groups = clashed_;
  return clashed;
}
const photoKey = (g) => (g.photo ? `${g.photo.src}|${g.photo.alt}` : null);
const linkKeys = (groups) => groups.flatMap((g) => g.rows.filter((r) => r.url?.trim()).map((r) => ({ k: JSON.stringify([g.id, r.name, r.url.trim()]), name: r.name, url: r.url.trim() })));
function summarizeGroups(before, after) {
  const out = [];
  const a = new Map(before.map((g) => [g.id, g]));
  const b = new Map(after.map((g) => [g.id, g]));
  for (const g of before) if (!b.has(g.id)) out.push(`カテゴリを削除: ${g.title || '(名前なし)'}`);
  for (const g of after) if (!a.has(g.id)) out.push(`カテゴリを追加: ${g.title || '(名前なし)'}${g.photo ? '(写真つき)' : ''}`);
  for (const g of after) {
    const o = a.get(g.id);
    if (!o) continue;
    if (!same({ ...o, photo: null }, { ...g, photo: null })) out.push(`料金: ${g.title || '(名前なし)'}`);
    if (photoKey(o) !== photoKey(g)) out.push(`写真: メニュー(${g.title || '名前なし'})`);
  }
  const common = (arr, other) => arr.filter((g) => other.has(g.id)).map((g) => g.id);
  if (!same(common(before, b), common(after, a))) out.push('カテゴリの並び順');
  const had = new Set(linkKeys(before).map((x) => x.k));
  for (const l of linkKeys(after)) if (!had.has(l.k)) out.push(`リンク: ${l.name || '名前なし'} → ${l.url}`);
  return out;
}
export function summarizeChanges(before, after) {
  const out = [];
  if (!same(before.notice, after.notice)) out.push('お知らせ');
  if (!same(before.about, after.about)) out.push('自己紹介の文章');
  if (!same(before.worriesList, after.worriesList)) out.push('「こんな不調」のチェックリスト');
  if (!same(before.worriesLead, after.worriesLead)) out.push('「こんな不調」の説明文');
  if (!same(before.kodawari, after.kodawari)) out.push('サロンのこだわり');
  if (!same(before.faq, after.faq)) out.push('よくある質問');
  if (!same(before.card, after.card)) out.push('初回限定メニュー');
  out.push(...summarizeGroups(before.groups, after.groups));
  for (const [k, label] of Object.entries(PHOTOS)) {
    const a = before.photos[k];
    const b = after.photos[k];
    if (a.src !== b.src || a.alt !== b.alt) out.push(`写真: ${label}`);
  }
  return out;
}
