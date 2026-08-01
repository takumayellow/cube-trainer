"""ブラウザでの動作確認（Playwright）。

    python test/ui_smoke.py [URL]      既定はローカルの index.html

ページを開いて実際にクリックし、次を確かめる（公開後は URL を渡して本番も確認する）:
  - コンソールエラーが出ない / 54 マスが描画される
  - スクランブル後に CFOP パネルがフェーズを答える
  - 最短手順を求めて最後まで進めると、本当に完成状態になる
  - 色を塗って壊した状態は「作れません」と拒否される
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else (ROOT / "index.html").as_uri()

failures = []


def check(name, ok, detail=""):
    if ok:
        print(f"ok    {name}")
    else:
        failures.append(name)
        print(f"FAIL  {name}" + (f" — {detail}" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector(".sticker")

    check("54 マスが描画される", page.locator(".sticker").count() == 54,
          str(page.locator(".sticker").count()))
    check("初期状態は完成と表示", "完成" in page.locator("#status").inner_text())

    page.click("#scramble")
    status = page.locator("#status").inner_text()
    check("スクランブル後も妥当な状態", "妥当" in status, status)
    check("CFOP パネルが現在地を答える", "いまここ" in page.locator("#panel").inner_text())
    check("対象の駒がハイライトされる", page.locator(".sticker.hl").count() > 0)

    page.click("#tab-shortest")
    page.click("button.primary")
    page.wait_for_selector(".alg-list .move", timeout=30000)
    moves = page.locator(".alg-list .move").count()
    check("最短手順が返る（30 手以内）", 0 < moves <= 30, f"{moves} 手")

    page.click("text=最後まで進める")
    page.wait_for_function("document.getElementById('status').textContent.includes('完成')",
                           timeout=10000)
    check("手順どおり進めると完成する", "完成" in page.locator("#status").inner_text())

    # 色を塗って壊す: 上面の 1 マスだけ別の色にすると枚数が合わなくなる
    page.click("#tab-cfop")
    page.click("#edit-toggle")
    page.click(".swatch.c-R")
    page.click('.sticker[data-face="U"][data-index="0"]')
    status = page.locator("#status").inner_text()
    check("ありえない状態を拒否する", "作れません" in status, status)

    page.click("#undo")
    check("1 つ戻すで復帰する", "作れません" not in page.locator("#status").inner_text())

    # 手順入力: Object.prototype 由来の名前を手順として通さない
    page.fill("#seq", "toString")
    page.click("#apply-seq")
    check("手順でない文字列をはじく", page.locator("#seq-error").is_visible())
    page.fill("#seq", "R U R' U'")
    page.click("#apply-seq")
    check("正しい手順は適用される", page.locator("#seq-error").is_hidden())

    check("コンソールにエラーが出ない", not errors, "; ".join(errors[:3]))
    browser.close()

print("\nすべて通過" if not failures else f"\n{len(failures)} 件が失敗")
sys.exit(0 if not failures else 1)
