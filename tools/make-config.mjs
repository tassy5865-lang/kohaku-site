// 使い方(田代さん用。トークンとパスワードは環境変数で渡し、履歴に残さない):
//   $env:KOHAKU_TOKEN="github_pat_..."; $env:KOHAKU_PASS="16文字以上のパスフレーズ"; node tools/make-config.mjs
import { writeFileSync } from 'node:fs';
import { encryptToken } from '../admin/js/crypto.js';

const token = process.env.KOHAKU_TOKEN;
const pass = process.env.KOHAKU_PASS;
if (!token || !pass) { console.error('KOHAKU_TOKEN と KOHAKU_PASS を環境変数で指定してください'); process.exit(1); }
if (pass.length < 16) { console.error('パスフレーズは 16 文字以上にしてください'); process.exit(1); }

if (new Set(pass).size < 8) { console.error('同じ文字の繰り返しが多すぎます。ランダムな言葉や文字を組み合わせてください'); process.exit(1); }
const box = await encryptToken(token, pass);
const config = { owner: 'tassy5865-lang', repo: 'kohaku-site', branch: 'main', box };
writeFileSync(new URL('../admin/config.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log('admin/config.json を作成しました');
