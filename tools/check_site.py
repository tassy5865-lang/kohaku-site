#!/usr/bin/env python3
"""琥珀サイトの静的検査。python tools/check_site.py で実行する。"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

RULES = json.loads((ROOT / "tools" / "rules.json").read_text(encoding="utf-8"))
MUST_CONTAIN = RULES["mustContain"]
MUST_LINK = RULES["mustLink"]
MUST_NOT_CONTAIN = RULES["mustNotContain"]
FORBIDDEN_RE = [(f["pattern"], f["label"]) for f in RULES["forbiddenRe"]]
SECTION_IDS = RULES["sectionIds"]
YEN_RE = re.compile(r"^¥\d{1,3}(,\d{3})*$")


class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.h1 = 0
        self.ids = set()
        self.imgs = []
        self.links = []
        self.jsonld = []
        self._in_jsonld = False
        self.text = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "h1":
            self.h1 += 1
        if tag == "img":
            self.imgs.append(a)
        if tag in ("a", "link") and "href" in a:
            self.links.append((tag, a))
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in_jsonld = True
        elif tag in ("script", "style"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag == "script" and self._in_jsonld:
            self._in_jsonld = False
        elif tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._in_jsonld:
            self.jsonld.append(data)
        elif not self._skip:
            self.text.append(data)


def main():
    errors = []
    for name in ("index.html", "styles.css", "main.js"):
        if not (ROOT / name).exists():
            errors.append(f"ファイルがありません: {name}")
    if errors:
        return report(errors)

    raw = INDEX.read_text(encoding="utf-8")
    scan = Scan()
    scan.feed(raw)
    text = re.sub(r"\s+", "", "".join(scan.text))
    squashed = lambda s: re.sub(r"\s+", "", s)

    for s in MUST_CONTAIN:
        if squashed(s) not in text:
            errors.append(f"本文にありません: {s}")
    for url in MUST_LINK:
        if url not in raw:
            errors.append(f"リンクがありません: {url}")
    for s in MUST_NOT_CONTAIN:
        if s in raw:
            errors.append(f"載せてはいけない語があります: {s}")
    for sid in SECTION_IDS:
        if sid not in scan.ids:
            errors.append(f"セクションidがありません: #{sid}")
    for pat, label in FORBIDDEN_RE:
        m = re.search(pat, raw)
        if m:
            errors.append(f"{label}: {m.group(0)}")
    rows = [(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", n)).strip(), y.strip()) for n, y in
            re.findall(r'<span class="name">(.*?)</span><span class="yen">(.*?)</span>', raw)]
    if not rows:
        errors.append("料金表の行がありません")
    for name, yen in rows:
        if not name:
            errors.append("名前が空の料金行があります")
        if not YEN_RE.match(yen):
            errors.append(f"料金の形式が正しくありません: {name} → {yen}")
    ids = re.findall(r'id="([^"]+)"', raw)
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f"idが重複: {dup}")
    for ref in re.findall(r'aria-controls="([^"]+)"', raw):
        if ref not in ids:
            errors.append(f"aria-controls の参照先がありません: {ref}")
    heads = [int(x) for x in re.findall(r"<h([1-6])", raw)]
    for a, b in zip(heads, heads[1:]):
        if b > a + 1:
            errors.append(f"見出し階層が飛んでいます: h{a} → h{b}")
    if re.search(r"<(title|meta)[^>]*>[^<]*&(?!amp;|#)", raw) or re.search(r"<title>[^<]*&(?!amp;|#)", raw):
        errors.append("title / meta の & が &amp; になっていません")
    if 'class="nav-toggle"' in raw and "role=" not in raw.split('class="sticky-cta"')[-1][:80]:
        errors.append("固定CTAに role がありません")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "main.js").read_text(encoding="utf-8")
    for needle, why in [
        (".js .nav-toggle", "JSなしでは「メニュー」ボタンを出さない"),
        (".js .nav {", "JSなしではナビを常時表示する(JS有効時だけ折りたたむ)"),
        ("visibility: hidden", "隠れた固定CTAにキーボードフォーカスが入らないようにする"),
        ("@media print", "印刷時に本文が消えないようにする"),
    ]:
        if needle not in css:
            errors.append(f"styles.css: {why}")
    if "threshold: 0.12" in js:
        errors.append("main.js: 背の高い要素が表示されない恐れ(threshold を 0 に)")
    for color in ("#8a9a7b", "#c08a3e"):
        for m in re.finditer(r"([^{}]+)\{([^}]*)\}", css):
            sel, body = m.group(1).strip(), m.group(2)
            if re.search(r"(^|;|\s)color:\s*(var\(--sage\)|var\(--amber\)|%s)" % color, body):
                errors.append(f"styles.css: 文字色に低コントラストの色: {sel}")
    if "--publish" in sys.argv:
        for needle in ('rel="canonical"', 'property="og:url"', 'property="og:image"', '"url"'):
            if needle not in raw:
                errors.append(f"公開前に必要: {needle}")
    if scan.h1 != 1:
        errors.append(f"h1は1つだけ(現在 {scan.h1})")

    for img in scan.imgs:
        if img.get("alt") is None:
            errors.append(f"altがない画像: {img.get('src')}")
        src = img.get("src", "")
        if src and not src.startswith("http") and not (ROOT / src).exists():
            errors.append(f"画像ファイルがありません: {src}")
    for tag, a in scan.links:
        href = a["href"]
        if href.startswith("http://"):
            errors.append(f"http:// のリンクは使えません(https:// にしてください): {href}")
        if href.startswith("http"):
            if tag == "a" and ("noopener" not in a.get("rel", "") or a.get("target") != "_blank"):
                errors.append(f"外部リンクに target=_blank rel=noopener がありません: {href}")
        elif href.startswith("#"):
            if href[1:] and href[1:] not in scan.ids:
                errors.append(f"存在しないアンカー: {href}")
        elif href and not (ROOT / href).exists():
            errors.append(f"ファイルがありません: {href}")

    if not scan.jsonld:
        errors.append("JSON-LD がありません")
    for block in scan.jsonld:
        try:
            data = json.loads(block)
            if data.get("@type") != "HealthAndBeautyBusiness":
                errors.append("JSON-LD の @type が HealthAndBeautyBusiness ではありません")
            if "天神町2丁目176-10" not in json.dumps(data, ensure_ascii=False):
                errors.append("JSON-LD に住所がありません")
        except json.JSONDecodeError as e:
            errors.append(f"JSON-LD が壊れています: {e}")

    return report(errors)


def report(errors):
    if errors:
        print(f"NG {len(errors)}件")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: すべての検査に合格")
    return 0


if __name__ == "__main__":
    sys.exit(main())
