// 管理画面のパスワードを作る。紛らわしい文字(0/O、1/l/I)を除いた 20 文字、約 99 ビット。
//   node tools/gen-passphrase.mjs
import { randomInt } from 'node:crypto';

const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
console.log(Array.from({ length: 5 }, group).join('-'));
