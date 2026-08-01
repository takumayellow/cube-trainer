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
import tempfile

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")   # Windows の cp932 コンソールでも読める

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else (ROOT / "index.html").as_uri()

failures = []

# 写真からの読み取りを試すための合成画像。実機のカメラは CI では動かないので、
# 「写真を選ぶ」側（同じ経路で色を採る）を 6 面ぶん流して確かめる。
STICKER_RGB = {
    "W": (245, 245, 245), "Y": (250, 210, 20), "O": (235, 120, 20),
    "R": (200, 40, 35), "G": (30, 160, 80), "B": (30, 90, 200),
}
FACE_ORDER = ["U", "R", "F", "D", "L", "B"]
FILL = 0.62          # camera.js の枠と同じ割合


def face_image(letters, path, size=360):
    """1 面ぶんの写真。中央 62% の正方形にキューブが写っている状態を作る。"""
    img = Image.new("RGB", (size, size), (18, 18, 20))
    draw = ImageDraw.Draw(img)
    side = size * FILL
    origin = (size - side) / 2
    cell = side / 3
    for i, letter in enumerate(letters):
        x = origin + (i % 3) * cell
        y = origin + (i // 3) * cell
        draw.rectangle([x + 3, y + 3, x + cell - 3, y + cell - 3], fill=STICKER_RGB[letter])
    img.save(path)


def read_net(page):
    """画面の展開図から現在の色を読み出す。"""
    return page.evaluate(
        """() => {
          const out = {};
          for (const s of document.querySelectorAll('.net .sticker')) {
            const face = s.dataset.face;
            (out[face] = out[face] || [])[Number(s.dataset.index)] =
              (s.className.match(/c-([WYOGRB])/) || [])[1];
          }
          return out;
        }"""
    )


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
    page.wait_for_selector(".net .sticker")

    check("54 マスが描画される", page.locator(".net .sticker").count() == 54,
          str(page.locator(".net .sticker").count()))
    check("初期状態は完成と表示", "完成" in page.locator("#status").inner_text())

    check("3D ビューも 54 マス", page.locator("#view3d .sticker").count() == 54,
          str(page.locator("#view3d .sticker").count()))

    page.click("#scramble")
    status = page.locator("#status").inner_text()
    check("スクランブル後も妥当な状態", "妥当" in status, status)
    page.wait_for_selector("#panel h2", timeout=10000)
    check("CFOP パネルが現在地を答える", "いまここ" in page.locator("#panel").inner_text())
    check("対象の駒がハイライトされる", page.locator(".net .sticker.hl").count() > 0)

    # 今やることだけ: 手順が出て、それを回すと状態が進む
    page.wait_for_selector("#panel .alg-list .move", timeout=10000)
    check("今回す手順が出る", page.locator("#panel .alg-list .move").count() > 0)
    goal = page.locator("#panel .goal").inner_text()
    check("やることが 1 行で出る", len(goal) > 0, goal)
    check("一覧はたたまれている", page.locator("#panel details").count() == 1)

    for _ in range(60):
        if "完成" in page.locator("#status").inner_text():
            break
        page.wait_for_selector("#panel button.primary", timeout=10000)
        page.click("#panel button.primary")
    check("案内どおり回すと完成する", "完成" in page.locator("#status").inner_text(),
          page.locator("#status").inner_text())

    page.click("#scramble")
    page.wait_for_selector("#panel h2", timeout=10000)

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
    page.click('.net .sticker[data-face="U"][data-index="0"]')
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

    # 写真から 6 面を読み取る: スクランブルした状態を撮った体で、
    # 完成状態に戻してから読み込み、元のスクランブルに復元されるか
    page.click("#scramble")
    page.wait_for_selector("#panel h2", timeout=10000)
    target = read_net(page)
    page.click("#reset")

    with tempfile.TemporaryDirectory() as tmp:
        shots = []
        for face in FACE_ORDER:
            shot = pathlib.Path(tmp) / f"{face}.png"
            face_image(target[face], shot)
            shots.append(str(shot))

        page.click("#camera-toggle")
        page.wait_for_selector("#camera .cam-title", timeout=5000)
        check("撮る順と持ち方が出る", "U 面" in page.locator("#camera .cam-title").inner_text(),
              page.locator("#camera .cam-title").inner_text())
        for i, shot in enumerate(shots):
            page.set_input_files("#camera input[type=file]", shot)
            if i < len(shots) - 1:
                page.wait_for_function(
                    f"document.querySelector('#camera .cam-progress')"
                    f".textContent.startsWith('{i + 1} /')", timeout=5000)

    page.wait_for_selector("#scan-note:not([hidden])", timeout=5000)
    check("写真 6 枚で元の状態に戻る", read_net(page) == target,
          page.locator("#scan-note").inner_text())
    check("読み取り後は色を塗り直せる状態になる",
          "読み取りました" in page.locator("#scan-note").inner_text())
    check("読み取り後にカメラは閉じる", page.locator("#camera").is_hidden())

    check("コンソールにエラーが出ない", not errors, "; ".join(errors[:3]))
    browser.close()

print("\nすべて通過" if not failures else f"\n{len(failures)} 件が失敗")
sys.exit(0 if not failures else 1)
