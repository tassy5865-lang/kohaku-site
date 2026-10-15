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
