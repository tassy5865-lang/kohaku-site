import { getRegion, setRegion, getPhoto, setPhoto } from './regions.js';
import { parseBlocks, renderBlocks } from './blocks.js';
import { parseList, renderList } from './list.js';
import { parseFaq, renderFaq } from './faq.js';
import { parseCard, renderCard, parseGroup, renderGroup } from './price.js';
import { toInline, fromInline } from './text.js';

export const GROUPS = {
  rose: 'ローズフェイシャル',
  body: 'アロマボディトリートメント',
  course: 'コース',
  pair: 'ペア蒸し',
};
export const PHOTOS = {
  'hero-l': 'トップ(左)',
  'hero-r': 'トップ(右)',
  about: '自己紹介',
  'kodawari-1': 'こだわり(1枚目)',
  'kodawari-2': 'こだわり(2枚目)',
  'menu-rose': 'メニュー(ローズ)',
  'menu-body': 'メニュー(ボディ)',
  'menu-pair': 'メニュー(ペア蒸し)',
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
  const groups = {};
  for (const k of Object.keys(GROUPS)) groups[k] = parseGroup(getRegion(html, `menu-${k}`));
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
    groups,
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
  for (const k of Object.keys(GROUPS)) {
    out = setRegion(out, `menu-${k}`, renderGroup(m.groups[k], { indent: '          ', closeIndent: '          ' }));
  }
  for (const k of Object.keys(PHOTOS)) {
    const p = m.photos[k];
    out = setPhoto(out, k, { ...p, src: preview && p.previewSrc ? p.previewSrc : p.src });
  }
  return out;
}

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
    if (k === 'groups' || k === 'photos') {
      for (const s of Object.keys(latest[k])) pick((o) => o[k][s], (o, v) => { o[k][s] = v; });
    } else {
      pick((o) => o[k], (o, v) => { o[k] = v; });
    }
  }
  return { models: out, clashed: clashed ? summarizeChanges(base, clash) : [] };
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
  for (const [k, label] of Object.entries(GROUPS)) {
    if (!same(before.groups[k], after.groups[k])) out.push(`料金: ${label}`);
  }
  for (const [k, label] of Object.entries(PHOTOS)) {
    const a = before.photos[k];
    const b = after.photos[k];
    if (a.src !== b.src || a.alt !== b.alt) out.push(`写真: ${label}`);
  }
  return out;
}
