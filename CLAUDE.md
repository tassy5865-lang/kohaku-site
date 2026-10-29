# 琥珀(こはく)サイト

姫路の女性専用・完全予約制サロン「琥珀」の公開用ホームページ。ビルド不要の静的サイト。

## 構成
- `index.html` — 本文は静的HTML。`<head>` に JSON-LD(HealthAndBeautyBusiness)。住所・説明を変えたら JSON-LD も更新する
- `styles.css` / `main.js` — 見た目と補助動作(ナビ開閉・固定CTA・フェード)。JSなしでも全文が読める
- `images/` — `owner-steam.jpg`、`herbs.jpg`、`og-image.png`。`tools/prepare_images.py` で元画像から再生成できる(要Pillow)
- `tools/check_site.py` — 料金・リンク・必須文言・alt・JSON-LD の検査。変更後は `python tools/check_site.py`

- オープニング動画: `images/opening.mp4`(縦・スマホ)/`images/opening-wide.mp4`(横・PC)。8秒を1回再生→フェードアウト→サイト表示、ボタンなし。そのブラウザで初回のみ(localStorage `kohaku-intro`、使えなければsessionStorage)。再生が始まらなければ5秒でスキップ。画面比で自動切替(`index.html` の `#intro`、`main.js` 末尾)

## ルール
- 料金・メニューは `アロマサロン琥珀　メニュー.png`(店主のメニュー表)を正とする(2026-10-04に予約サイト基準から変更。予約サイトの表示とは差がある)。変更したら `check_site.py` の `PRICES`・`ROWS` と `index.html` の両方を直す
- 屋号の表記は「琥珀(こはく)」(店主が自分で書いた自己紹介文の「アロマサロン琥珀」「琥珀サロン」は、原文のまま載せている)。商標 ® を付ける語は仕様どおり
- 電話番号・口コミ・効能の断定は載せない。お客様の顔や背中が写る写真は、本人の掲載許可がない限り使わない
- 元画像(日本語ファイル名のスクリーンショット・メニュー画像)はこのフォルダに残す。削除・リネームは OneDrive 同期の事故を避けるため git で行う
- 設計書: `docs/superpowers/specs/2026-10-03-kohaku-salon-site-design.md`

## 公開前に未確認のこと
- (解決済み 2026-10-11・ユーザー申告)店主・田代真弓さんの掲載了承。ポートフォリオ掲載も了承済み。note記事の内容を含む範囲は未確認
- 元の1枚目の写真(施術中・背中が写る)は掲載許可が未確認のため使っていない
- (解決済み)料金は税込、ペア蒸しは2名分、駐車場は1台のみ。いずれも掲載済み
- 公開URL: `https://tassy5865-lang.github.io/kohaku-site/`(2026-10-15 に専用リポジトリへ分離。`canonical`・`og:url`・`og:image`・JSON-LD の `url` は設定済み)

## 管理画面(admin/)
- URL: `https://tassy5865-lang.github.io/kohaku-site/admin/`。店主がパスワードで入り、文章・料金メニュー・写真・お知らせを編集して公開する
- 編集できる範囲は `index.html` の `<!--edit:KEY-->…<!--/edit:KEY-->` と `data-photo="KEY"`。**この目印を消さない。領域を増やすときは `admin/js/site-model.js` も直す**
- メニューのカテゴリ(料金表のかたまり)は `<!--edit:menu-groups-->` の中に `<div class="price-group" data-group="ID">` が並ぶ。管理画面で追加・削除・並べ替えができ(最大10、最低1)、`admin/js/price.js` の `parseGroups`/`renderGroups` が全体を書き直す。**`data-group` の ID と、写真つきの `data-photo="menu-ID"` は消さない。** 写真つきのカテゴリは、写真の左右(`price-group--alt`)を並び順で自動的に交互にする。カテゴリごと消したときは、管理画面が作った写真(`images/photo-*-*.jpg`)を同じコミットで削除する(手で置いた画像は消さない)
- 料金の行には、任意で外部リンクを付けられる(`<span class="name"><a href="https://…" target="_blank" rel="noopener">名前</a></span>`)。`https://` のみ。`check_site.py` が `http://` を弾く
- 保存は GitHub Git Data API で `index.html` と画像を 1 コミット。トークンは `admin/config.json` にパスワードで暗号化して置く(fine-grained PAT、このリポジトリの Contents のみ、有効90日)
- トークンの作成・更新: 新しいトークンを作り、ご自身のターミナル(チャット・画面共有に出さない)で `node tools/gen-passphrase.mjs` のパスワードと `KOHAKU_TOKEN` `KOHAKU_PASS` を環境変数に入れて `node tools/make-config.mjs` → `admin/config.json` をコミット・push。表示される `…/admin/#k=…` のリンクを、パスワードとは**別の経路**で店主に渡す(鍵は「パスワード+リンクの秘密」から作る。暗号文は公開リポジトリにあるので、秘密がないと総当たりできない)。トークン更新でリンクを変えたくないときは `KOHAKU_KEY`(リンクの `k=` の値)を同じにして実行する。店主はリンクを1回開けばその端末に保存され、以後はパスワードだけで入れる。`config.json` が v1(秘密なし)の間は、この保護は効いていない。
- 見出し・ボタン・ご来店の流れ・注意書き・アクセス・フッターなどの小さな文字は `<!--edit:t-KEY-->…<!--/edit:t-KEY-->`(中身は文字と <br> のみ)で囲み、管理画面の「見出し・その他の文字」タブで直す。一覧は `admin/js/text-slots.js`。**文字を足すときは、index.html に目印を付け、text-slots.js にも1行足す**(片方だけだとエラー)。JSON-LD・リンク先アドレスは対象外。タイトルと説明文(`<title>`・description・og:title・og:description)は属性内にコメントを置けないため、`admin/js/meta.js` の正規表現で読み書きする(同タブの先頭。ページ側の形を変えたら meta.js も直す)
- 検査ルールは `tools/rules.json`(`check_site.py` と管理画面の公開前検査が共有)。必須語・禁止語を変えるときはここだけ直す
- テスト: `npm test`(依存パッケージなし、Node 20+)。CI(GitHub Actions)は `workflow` 権限が無く未設置
- セキュリティ(2026-10-29): `index.html` の `<head>` に CSP の meta(GA4 のみ外部許可)と referrer を入れてある。`check_site.py` が CSP の有無と script-src の広がりを検査する。外部サービスを足すときは CSP の許可先も足す。管理画面のプレビューは sandbox で `self` が合わないため、`preview.js` が CSP を外して表示する
