import { unescapeHtml } from './text.js';

const YEN_RE = /^¥\d{1,3}(,\d{3})*$/;
const squash = (s) => s.replace(/\s+/g, '');

function visibleText(html) {
  return unescapeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' '),
  );
}

export function validateDocument(html, rules) {
  const errs = [];
  const text = squash(visibleText(html));

  for (const s of rules.mustContain) {
    if (!text.includes(squash(s))) errs.push(`本文に必要な文言がありません: 「${s}」`);
  }
  for (const url of rules.mustLink) {
    if (!html.includes(url)) errs.push(`必要なリンクがありません: ${url}`);
  }
  for (const s of rules.mustNotContain) {
    if (html.includes(s)) errs.push(`載せられない語が含まれています: 「${s}」`);
  }
  for (const f of rules.forbiddenRe) {
    const m = new RegExp(f.pattern).exec(html);
    if (m) errs.push(`${f.label}が含まれています: 「${m[0]}」(効能・口コミ・電話番号は載せない方針です)`);
  }
  for (const id of rules.sectionIds) {
    if (!html.includes(`id="${id}"`)) errs.push(`セクションがありません: #${id}`);
  }

  const rows = [...html.matchAll(/<span class="name">([\s\S]*?)<\/span><span class="yen">([\s\S]*?)<\/span>/g)];
  if (!rows.length) errs.push('料金表の行がありません');
  for (const m of rows) {
    const name = unescapeHtml(m[1]).replace(/\s+/g, ' ').trim();
    const yen = unescapeHtml(m[2]).trim();
    if (!name) errs.push('名前が空の料金行があります');
    if (!YEN_RE.test(yen)) errs.push(`料金の形式が正しくありません: 「${name}」→「${yen}」(例: ¥10,000)`);
  }
  const price = /<p class="price">(?:<s>通常\s*([^<]*)<\/s>)?([^<]*)<\/p>/.exec(html);
  if (price) {
    if (!YEN_RE.test(unescapeHtml(price[2]).trim())) errs.push(`料金の形式が正しくありません: 初回限定メニュー →「${price[2].trim()}」(例: ¥10,000)`);
    if (price[1] && !YEN_RE.test(unescapeHtml(price[1]).trim())) errs.push(`料金の形式が正しくありません: 初回限定メニューの通常価格 →「${price[1].trim()}」`);
  }

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const alt = /\salt="([^"]*)"/.exec(m[0]);
    if (!alt || !alt[1].trim()) {
      const src = /\ssrc="([^"]*)"/.exec(m[0]);
      errs.push(`写真に説明文(代替テキスト)がありません: ${src ? src[1] : ''}`);
    }
  }
  if ((html.match(/<h1\b/g) || []).length !== 1) errs.push('h1 が 1 つではありません');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const d of new Set(ids.filter((i) => ids.filter((x) => x === i).length > 1))) errs.push(`id が重複しています: ${d}`);
  return errs;
}
