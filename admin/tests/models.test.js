import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, renderBlocks, blocksToText, textToBlocks } from '../js/blocks.js';
import { parseList, renderList, listToText, textToList } from '../js/list.js';
import { parseFaq, renderFaq } from '../js/faq.js';
import { parseGroup, renderGroup, parseCard, renderCard } from '../js/price.js';

const norm = (s) => s.replace(/\r\n/g, '\n').replace(/>\s+</g, '><').trim();

test('blocks: parse / render round trip', () => {
  const html = '\n  <p>はじめまして。<br>田代です。</p>\n  <h3>理由</h3>\n  <p>仕事に、家事に。</p>\n';
  const blocks = parseBlocks(html);
  assert.deepEqual(blocks, [
    { kind: 'p', text: 'はじめまして。\n田代です。' },
    { kind: 'h', text: '理由' },
    { kind: 'p', text: '仕事に、家事に。' },
  ]);
  assert.equal(norm(renderBlocks(blocks, { indent: '  ', closeIndent: '' })), norm(html));
});
test('blocks: text form uses blank lines and "## " headings', () => {
  const blocks = textToBlocks('一行目\n二行目\n\n## 見出し\n\n本文');
  assert.deepEqual(blocks, [
    { kind: 'p', text: '一行目\n二行目' },
    { kind: 'h', text: '見出し' },
    { kind: 'p', text: '本文' },
  ]);
  assert.equal(blocksToText(blocks), '一行目\n二行目\n\n## 見出し\n\n本文');
});
test('blocks: pClass is applied and markup is escaped', () => {
  const out = renderBlocks([{ kind: 'p', text: '<b>&' }], { pClass: 'lead lead--serif' });
  assert.match(out, /<p class="lead lead--serif">&lt;b&gt;&amp;<\/p>/);
});
test('blocks: empty input renders nothing', () => {
  assert.equal(renderBlocks([]), '');
  assert.deepEqual(textToBlocks('  \n\n  '), []);
});

test('list: round trip with <br> inside items', () => {
  const html = '<li>一つ目<br>続き</li><li>二つ目</li>';
  const items = parseList(html);
  assert.deepEqual(items, ['一つ目\n続き', '二つ目']);
  assert.equal(norm(renderList(items, { indent: '', closeIndent: '' })), html);
  assert.deepEqual(textToList(listToText(items)), items);
});

test('faq: round trip', () => {
  const html = '<details><summary>予約は必要ですか?</summary><p>完全予約制です。</p></details><details><summary>Q2</summary><p>A2</p></details>';
  const items = parseFaq(html);
  assert.deepEqual(items, [{ q: '予約は必要ですか?', a: '完全予約制です。' }, { q: 'Q2', a: 'A2' }]);
  assert.equal(norm(renderFaq(items, { indent: '', closeIndent: '' })), html);
});

const GROUP = `<h3>ペア蒸し</h3>
          <p class="fine">2名様分の料金です。</p>
          <ul class="price-list">
            <li><span class="name">よもぎ蒸し</span><span class="yen">¥6,000</span></li>
            <li><span class="name">まこも蒸し</span><span class="yen">¥12,000</span></li>
          </ul>
          <p class="fine">※注記</p>`;
test('price group: parse', () => {
  assert.deepEqual(parseGroup(GROUP), {
    title: 'ペア蒸し',
    intro: ['2名様分の料金です。'],
    rows: [{ name: 'よもぎ蒸し', yen: '¥6,000', url: '' }, { name: 'まこも蒸し', yen: '¥12,000', url: '' }],
    notes: ['※注記'],
  });
});
test('price group: render round trip', () => {
  assert.equal(norm(renderGroup(parseGroup(GROUP), { indent: '', closeIndent: '' })), norm(GROUP));
});
test('price group: yen are normalized on render, bad ones are kept verbatim for validation', () => {
  const out = renderGroup({ title: 't', intro: [], notes: [], rows: [{ name: 'a', yen: '10000' }, { name: 'b', yen: '1万' }] });
  assert.match(out, /<span class="yen">¥10,000<\/span>/);
  assert.match(out, /<span class="yen">1万<\/span>/);
});

const CARD = `<span class="badge">初回限定</span>
          <h3>アロマ × まこも蒸し</h3>
          <p>100分</p>
          <p class="price"><s>通常 ¥12,000</s>¥10,000</p>`;
test('price card: parse / render', () => {
  const c = parseCard(CARD);
  assert.deepEqual(c, { badge: '初回限定', title: 'アロマ × まこも蒸し', time: '100分', regular: '¥12,000', price: '¥10,000' });
  assert.equal(norm(renderCard(c, { indent: '', closeIndent: '' })), norm(CARD));
});
test('price card: no regular price drops the <s>', () => {
  const out = renderCard({ badge: '', title: 't', time: '60分', regular: '', price: '9000' });
  assert.ok(!out.includes('<s>') && !out.includes('badge'));
  assert.match(out, /<p class="price">¥9,000<\/p>/);
});
