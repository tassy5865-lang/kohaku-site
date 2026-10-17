// 使い方(田代さん用。ご自身のターミナルで実行する。チャットや共有画面には出さない):
//   $env:KOHAKU_TOKEN="github_pat_..."; $env:KOHAKU_PASS="node tools/gen-passphrase.mjs で作ったもの"; node tools/make-config.mjs
// 鍵は「パスワード + 秘密」から作る。秘密はリポジトリに載せず、管理画面のリンクの # 以降で店主に渡す。
// トークンだけ更新して今のリンクを使い続けたいときは、同じ秘密を KOHAKU_KEY で渡す(前回表示されたリンクの k= の値)。
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { encryptToken } from '../admin/js/crypto.js';

const token = process.env.KOHAKU_TOKEN;
const pass = process.env.KOHAKU_PASS;
if (!token || !pass) { console.error('KOHAKU_TOKEN と KOHAKU_PASS を環境変数で指定してください'); process.exit(1); }
if (pass.length < 16) { console.error('パスフレーズは 16 文字以上にしてください(tools/gen-passphrase.mjs で作れます)'); process.exit(1); }
if (new Set(pass).size < 8) { console.error('同じ文字の繰り返しが多すぎます。ランダムな言葉や文字を組み合わせてください'); process.exit(1); }

const secret = process.env.KOHAKU_KEY || randomBytes(16).toString('base64url');
if (!/^[\w-]{16,}$/.test(secret)) { console.error('KOHAKU_KEY は英数字と - _ の 16 文字以上にしてください'); process.exit(1); }

const box = await encryptToken(token, pass, 600000, secret);
const config = { owner: 'tassy5865-lang', repo: 'kohaku-site', branch: 'main', box };
writeFileSync(new URL('../admin/config.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log('admin/config.json を作成しました(コミット・push してください)');
console.log('');
console.log('店主に渡す管理画面のリンク(パスワードとは別の経路で渡すこと。この画面は他の人に見せない):');
console.log(`https://tassy5865-lang.github.io/kohaku-site/admin/#k=${secret}`);
