"""スマホ版（app.html）の動作確認（Playwright）。

    python test/app_smoke.py [URL]      既定はローカルの app.html

スマホの画面幅で実際にタップし、次を確かめる（公開後は URL を渡して本番も確認する）:
  - 4 つのタブが出て、どの画面も横にはみ出さない（390 / 360 px）
  - スクランブル → 「次の一手」を L3 で 1 手ずつタップしていくと、本当に完成する
  - 使ったテクニックが「辞典」に残る
  - 「最短」を自動再生すると完成する
  - 「画面で回す」で 3D キューブとムーブパッドが出て、押した手が反映される
  - 写真 6 枚から読み取った状態がそのまま判定に渡る
  - コンソールエラーが出ない
"""
import pathlib
import sys
import tempfile

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")   # Windows の cp932 コンソールでも読める

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else (ROOT / "app.html").as_uri()

STICKER_RGB = {
    "W": (245, 245, 245), "Y": (250, 210, 20), "O": (235, 120, 20),
    "R": (200, 40, 35), "G": (30, 160, 80), "B": (30, 90, 200),
}
FACE_ORDER = ["U", "R", "F", "D", "L", "B"]
FILL = 0.68          # mobile/scanner.js の枠と同じ割合

failures = []


def check(name, ok, detail=""):
    if ok:
        print(f"ok    {name}")
    else:
        failures.append(name)
        print(f"FAIL  {name}" + (f" — {detail}" if detail else ""))


def face_image(letters, path, size=480, aspect=1.0):
    """1 面ぶんの写真。中央の正方形の 68% にキューブが写っている状態を作る。"""
    width, height = round(size * aspect), size
    img = Image.new("RGB", (width, height), (18, 18, 20))
    draw = ImageDraw.Draw(img)
    square = min(width, height)
    side = square * FILL
    ox, oy = (width - side) / 2, (height - side) / 2
    cell = side / 3
    for i, letter in enumerate(letters):
        x = ox + (i % 3) * cell
        y = oy + (i // 3) * cell
        draw.rectangle([x + 4, y + 4, x + cell - 4, y + cell - 4], fill=STICKER_RGB[letter])
    img.save(path)


def store_state(page):
    return page.evaluate("() => Store.state")


def no_overflow(page, width):
    return page.evaluate("() => document.documentElement.scrollWidth") <= width


def coach_settled(page):
    """「次の一手」が判定を終えるまで待つ。"""
    page.wait_for_function(
        """() => document.querySelector('.bigmove, .finished, .card.done, .peek, .hint .error')"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 390, "height": 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
    page = context.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(URL)
    page.evaluate("() => localStorage.clear()")
    page.goto(URL + "#coach")
    page.reload()
    page.wait_for_selector(".fnet .st")

    # ── 画面の骨組み ─────────────────────────────────────────────────────────
    tabs = page.locator(".tabbar [data-tab]").all_inner_texts()
    check("タブが 4 つ", len(tabs) == 4, str(tabs))
    check("展開図が 54 マス", page.locator(".fnet .st").count() == 54)
    check("最初は「はじめる」カード", page.locator(".card.done").inner_text().startswith("はじめる"))

    # ── 次の一手: L3 でタップし続けると完成する ─────────────────────────────
    page.locator(".card.done .btn.primary").click()            # スクランブル
    coach_settled(page)
    check("スクランブル手順が出る", page.locator(".card.scramble .chip").count() == 20)
    check("目標が出る", len(page.locator(".goal").inner_text()) > 0)
    check("場所のヒントが出る", page.locator(".kv dd").first.inner_text() != "")
    page.locator('.seg.levels [data-level="3"]').click()

    taps = 0
    stuck = False
    redone = False
    for _ in range(600):
        coach_settled(page)
        if page.locator(".card.done").count():
            break
        if page.locator(".hint .error").count():
            stuck = True
            break
        if page.locator(".finished").count():
            if not redone:
                # 最後の 1 手を戻してやり直しても、テクニックは 1 回と数える
                redone = True
                counts = page.evaluate("() => Store.used().map(u => u.count)")
                page.get_by_role("button", name="1手戻す").click()
                coach_settled(page)
                page.locator(".bigmove").click()
                page.wait_for_selector(".finished")
                check("完成した手を戻してやり直しても二重に数えない",
                      page.evaluate("() => Store.used().map(u => u.count)") == counts)
            page.locator(".finished .btn").click()
            continue
        page.locator(".bigmove").click()
        taps += 1
    check("L3 で 1 手ずつ進めると完成する", page.evaluate("() => Store.isSolved()"),
          f"{taps} タップ, stuck={stuck}")
    check("完成カードが出る", "完成しました" in page.locator(".card.done").inner_text())
    print(f"      （{taps} 手で完成）")

    # ── 辞典 ────────────────────────────────────────────────────────────────
    page.locator("#tab-gloss").click()
    used = page.locator(".entry.used").count()
    check("辞典に使ったテクニックが残る", used >= 3, f"{used} 件")
    page.locator(".entry .entry-head").first.click()
    check("辞典の項目が開く", page.locator(".entry-body").count() == 1)
    check("辞典 390px ではみ出さない", no_overflow(page, 390))

    # ── 最短: 自動再生で完成する ─────────────────────────────────────────────
    page.evaluate("() => Store.scramble()")
    page.locator("#tab-short").click()
    page.wait_for_selector("#short-next", timeout=20000)
    head = page.locator(".head p").inner_text()
    check("最短手順の手数と時間が出る", "手" in head and "ms" in head, head)
    page.locator(".chips .chip").nth(3).click()
    check("手順チップで途中へ飛べる", page.locator(".chip.now").inner_text()
          == page.locator(".chips .chip").nth(3).inner_text())
    page.locator("#short-auto").click()
    page.wait_for_function("() => Store.isSolved()", timeout=30000)
    check("自動再生で完成する", page.evaluate("() => Store.isSolved()"))
    page.wait_for_selector(".bigbox.done")
    check("最短 390px ではみ出さない", no_overflow(page, 390))

    # ── 画面で回す: 3D キューブとムーブパッド ────────────────────────────────
    page.locator("#tab-coach").click()
    page.locator(".head-actions .btn").click()                  # 崩す
    coach_settled(page)
    page.locator('[data-mode="sim"]').click()
    check("3D キューブが出る", page.locator(".cube3d .sticker").count() == 54)
    check("ムーブパッドが 18 個", page.locator(".pad .btn").count() == 18)
    next_move = page.locator(".pad .btn.next")
    check("案内中の手がパッドで光る", next_move.count() == 1)
    version = page.evaluate("() => Store.version")
    next_move.click()
    # 1 手で終わる案内なら、進んだ先は「完了」の行になる
    page.wait_for_selector(".chip.past, .finished")
    check("光っている手を押すと 1 手進む",
          page.locator(".chip.past, .finished").count() == 1
          and page.evaluate("() => Store.version") == version + 1)

    before = store_state(page)
    page.locator('.pad [data-move="D2"]').click()
    coach_settled(page)
    after = store_state(page)
    check("ほかの手を押すとキューブが変わる", before != after)
    shown = page.evaluate(
        """() => {
          const out = {};
          for (const s of document.querySelectorAll('.cube3d .sticker')) {
            (out[s.dataset.face] = out[s.dataset.face] || [])[Number(s.dataset.index)] =
              (s.className.match(/c-([WYOGRB])/) || [])[1];
          }
          return out;
        }"""
    )
    check("3D キューブが今の状態を映す", shown == after)
    check("次の一手 390px ではみ出さない", no_overflow(page, 390))
    page.locator('[data-mode="real"]').click()

    # ── 読み取り: 写真 6 枚 → 確認 → 判定 ───────────────────────────────────
    target = page.evaluate("() => { const c = new Cube(); c.scramble(25); return c.getState(); }")
    page.locator("#tab-scan").click()
    page.wait_for_selector(".cam-step")
    with tempfile.TemporaryDirectory() as tmp:
        for i, face in enumerate(FACE_ORDER):
            path = pathlib.Path(tmp) / f"{face}.png"
            # 縦長・横長の写真が混ざっても中央の正方形から読むことを確かめる
            face_image(target[face], path, aspect=[1.0, 0.75, 1.33][i % 3])
            page.set_input_files("#scan-file", str(path))
            if i < 5:
                page.wait_for_function(
                    "(n) => (document.querySelector('.cam-step') || {}).textContent"
                    "?.startsWith(n + ' / 6')", arg=i + 2)
    page.wait_for_selector("#scan-accept")
    title = page.locator(".head h1").inner_text()
    check("6 面撮ると確認画面になる", title.startswith("読み取り完了"), title)
    check("読み取り 390px ではみ出さない", no_overflow(page, 390))
    page.locator("#scan-accept").click()
    page.wait_for_selector("#tab-coach.on")
    check("読み取った状態が判定に渡る", store_state(page) == target)

    # ── 手で塗る: 壊した状態は判定に進めない ────────────────────────────────
    page.locator("#tab-scan").click()
    page.get_by_role("button", name="手で塗る").click()
    page.locator('.fnet .st[data-face="U"][data-index="0"]').click()
    colour = page.evaluate("() => Store.state.U[0]")
    other = next(c for c in "WYGBOR" if c != colour)
    page.locator(f'.swatch[data-colour="{other}"]').click()
    check("ありえない塗り分けは判定ボタンが押せない",
          page.locator("#scan-accept").is_disabled())

    # ── 360px 幅 ────────────────────────────────────────────────────────────
    page.set_viewport_size({"width": 360, "height": 740})
    for tab in ["coach", "scan", "short", "gloss"]:
        page.locator(f"#tab-{tab}").click()
        page.wait_for_timeout(300)
        check(f"{tab} 360px ではみ出さない", no_overflow(page, 360),
              str(page.evaluate("() => document.documentElement.scrollWidth")))

    page.locator("#tab-coach").click()
    page.wait_for_timeout(300)
    check("コンソールエラーなし", not errors, "; ".join(errors[:5]))
    browser.close()

print()
if failures:
    print(f"{len(failures)} 件失敗")
    sys.exit(1)
print("すべて成功")
