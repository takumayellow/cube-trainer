/**
 * live/overlay.js — draw on top of the camera picture.
 *
 * Coordinates come in the read square (LiveView.SIZE pixels across) and are
 * scaled to the overlay canvas. The overlay is mirrored together with the
 * video when the preview is, so arrows always sit on the picture they belong
 * to; words about directions are worked out separately (see `sideWord`).
 *
 * A mirrored preview means a webcam facing the player, who holds the cube
 * between themself and the camera and sees the side facing away from it. Every
 * straight arrow then shows how the player's own side moves — the opposite of
 * the side the camera sees — so the arrow, the words and the hands agree.
 */
'use strict';

(function () {
  const LAYER = '#ffd43b';     // turning one layer
  const WHOLE = '#4dd4ff';     // turning the whole cube
  const OK = '#51cf66';
  const DIM = 'rgba(255,255,255,0.55)';

  const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };

  /** The screen direction to draw, in camera pixels: the player's side when `mirrored`. */
  const drawDir = (dir, mirrored) => (mirrored && BACK[dir] ? BACK[dir] : dir);

  const SHADE = 'rgba(0,0,0,0.6)';  // rim under every arrow, so it stands out on any sticker

  function headPath(ctx, x, y, angle, size) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(angle - 0.5), y - size * Math.sin(angle - 0.5));
    ctx.lineTo(x - size * Math.cos(angle + 0.5), y - size * Math.sin(angle + 0.5));
    ctx.closePath();
  }

  /** A filled arrow head with a dark rim. */
  function head(ctx, x, y, angle, size, colour) {
    ctx.save();
    ctx.lineJoin = 'round';
    headPath(ctx, x, y, angle, size);
    ctx.strokeStyle = SHADE;
    ctx.lineWidth = Math.max(3, size / 5);
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.restore();
  }

  /** Stroke the path `trace` draws twice: a dark rim, then the colour on top. */
  function stroke(ctx, trace, colour, width) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = SHADE;
    ctx.lineWidth = width + Math.max(3, width * 0.6);
    trace();
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    trace();
    ctx.stroke();
    ctx.restore();
  }

  function line(ctx, x0, y0, x1, y1, colour, width, heads) {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const size = width * 3;
    // stop the shaft inside the head, so its round end does not poke out
    const ex = x1 - Math.cos(angle) * size * 0.6;
    const ey = y1 - Math.sin(angle) * size * 0.6;
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ex, ey); }, colour, width);
    head(ctx, x1, y1, angle, size, colour);
    if (heads > 1) {
      const back = size * 0.9;
      head(ctx, x1 - back * Math.cos(angle), y1 - back * Math.sin(angle), angle, size, colour);
    }
  }

  function arc(ctx, cx, cy, r, cw, colour, width, heads) {
    const span = Math.PI * 1.45;
    const start = -Math.PI / 2 - (cw ? span / 2 : -span / 2);
    const end = start + (cw ? span : -span);
    const size = width * 3;
    const stop = end - (cw ? 1 : -1) * (size * 0.6) / r;
    stroke(ctx, () => { ctx.beginPath(); ctx.arc(cx, cy, r, start, stop, !cw); }, colour, width);
    const tangent = end + (cw ? Math.PI / 2 : -Math.PI / 2);
    head(ctx, cx + r * Math.cos(end), cy + r * Math.sin(end), tangent, size, colour);
    if (heads > 1) {
      const step = (cw ? 1 : -1) * (size * 0.9) / r;
      head(ctx, cx + r * Math.cos(end - step), cy + r * Math.sin(end - step), tangent - step, size, colour);
    }
  }

  /** A rounded label (such as "180°") centred on (x, y); `mirrored` keeps the text readable on a flipped canvas. */
  function badge(ctx, x, y, text, colour, px, mirrored) {
    ctx.save();
    if (mirrored) { ctx.translate(2 * x, 0); ctx.scale(-1, 1); }
    ctx.font = `bold ${px}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + px * 0.9;
    const h = px * 1.45;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SHADE;
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + px * 0.05);
    ctx.restore();
  }

  /** Tint cells of the square: `cells` lists [column, row] pairs (0..2). */
  function tint(ctx, b, angle, cells, fill, edge) {
    ctx.save();
    ctx.translate(b.x + b.s / 2, b.y + b.s / 2);
    ctx.rotate(angle || 0);
    ctx.translate(-b.s / 2, -b.s / 2);
    const u = b.s / 3;
    ctx.fillStyle = fill;
    for (const [c, r] of cells) ctx.fillRect(c * u, r * u, u, u);
    const xs = cells.map(c => c[0]);
    const ys = cells.map(c => c[1]);
    const x0 = Math.min(...xs) * u;
    const y0 = Math.min(...ys) * u;
    ctx.lineWidth = Math.max(3, b.s / 45);
    ctx.strokeStyle = edge;
    ctx.strokeRect(x0, y0, (Math.max(...xs) + 1) * u - x0, (Math.max(...ys) + 1) * u - y0);
    ctx.restore();
  }

  const ALL = [0, 1, 2].flatMap(r => [0, 1, 2].map(c => [c, r]));

  /** The canvas box of the read square `box`, scaled from `size` pixels. */
  function place(canvas, box, size) {
    const k = canvas.width / size;
    return { x: box.x * k, y: box.y * k, s: box.size * k };
  }

  function clear(canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * The 3×3 outline where the face was found; `state` 'seen' | 'steady' | 'idle'.
   * `progress` (0..1) fills a bar under it while a view is about to be taken.
   */
  function grid(canvas, box, size, state, progress) {
    const ctx = canvas.getContext('2d');
    const b = place(canvas, box, size);
    ctx.save();
    // the outline follows the cube when it is held a little crooked
    ctx.translate(b.x + b.s / 2, b.y + b.s / 2);
    ctx.rotate(box.angle || 0);
    ctx.translate(-b.s / 2, -b.s / 2);
    ctx.strokeStyle = state === 'steady' ? OK : state === 'seen' ? '#fff' : DIM;
    ctx.lineWidth = state === 'idle' ? 2 : 3;
    ctx.setLineDash(state === 'idle' ? [8, 8] : []);
    for (let k = 0; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo((b.s * k) / 3, 0);
      ctx.lineTo((b.s * k) / 3, b.s);
      ctx.moveTo(0, (b.s * k) / 3);
      ctx.lineTo(b.s, (b.s * k) / 3);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (progress > 0) {
      const h = Math.max(6, b.s / 24);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, b.s + h, b.s, h);
      ctx.fillStyle = OK;
      ctx.fillRect(0, b.s + h, b.s * progress, h);
    }
    ctx.restore();
  }

  const LAYER_FILL = 'rgba(255,212,59,0.30)';
  const WHOLE_FILL = 'rgba(77,212,255,0.20)';

  /** One layer turn, as Track.arrowFor describes it (kinds 'slide' and 'spin'). */
  function move(canvas, box, size, arrow, mirrored) {
    const ctx = canvas.getContext('2d');
    const b = place(canvas, box, size);
    const width = Math.max(5, b.s / 22);
    const heads = arrow.twice ? 2 : 1;
    const px = Math.max(13, b.s / 9);
    if (arrow.kind === 'spin') {
      tint(ctx, b, box.angle, ALL, LAYER_FILL, LAYER);
      arc(ctx, b.x + b.s / 2, b.y + b.s / 2, b.s * 0.36, arrow.dir === 'cw', LAYER, width, heads);
      if (arrow.twice) badge(ctx, b.x + b.s / 2, b.y + b.s / 2, '180°', LAYER, px, mirrored);
      return;
    }
    if (arrow.kind !== 'slide') return;
    const [dx, dy] = VEC[drawDir(arrow.toward, mirrored)];
    const cells = [0, 1, 2].map(k => (arrow.axis === 'row' ? [k, arrow.index] : [arrow.index, k]));
    tint(ctx, b, box.angle, cells, LAYER_FILL, LAYER);
    const mid = (arrow.index + 0.5) / 3;
    const reach = b.s * 0.62;
    const cx = b.x + (arrow.axis === 'col' ? b.s * mid : b.s / 2);
    const cy = b.y + (arrow.axis === 'row' ? b.s * mid : b.s / 2);
    // the back of the layer runs the other way: draw it as a belt wrapping round
    // the cube, on the outer side of an edge layer so it stays off the stickers
    const off = b.s / 3 * 0.42;
    const out = arrow.index === 0 ? -1 : 1;
    const [ox, oy] = arrow.axis === 'row' ? [0, out * off] : [out * off, 0];
    belt(ctx, cx - dx * reach, cy - dy * reach, cx + dx * reach, cy + dy * reach, ox, oy, LAYER, width, heads);
    if (arrow.twice) badge(ctx, cx - dx * reach * 0.5, cy - dy * reach * 0.5, '180°', LAYER, px, mirrored);
  }

  /**
   * A wrap-round arrow: the front run from (x0,y0) to (x1,y1), then a curl over
   * the edge and a faint dashed return along the far side, offset by (ox,oy).
   * It shows that the side of the cube facing away travels the opposite way.
   */
  function belt(ctx, x0, y0, x1, y1, ox, oy, colour, width, heads) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    const k = Math.hypot(ox, oy) * 1.5;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = width * 0.7;
    ctx.beginPath();
    ctx.moveTo(x1 - dx * width, y1 - dy * width);
    ctx.bezierCurveTo(x1 + dx * k, y1 + dy * k, x1 + ox + dx * k, y1 + oy + dy * k, x1 + ox, y1 + oy);
    ctx.stroke();
    ctx.setLineDash([width * 1.6, width * 1.4]);
    ctx.beginPath();
    ctx.moveTo(x1 + ox, y1 + oy);
    ctx.lineTo(x0 + ox + dx * width * 2, y0 + oy + dy * width * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    head(ctx, x0 + ox, y0 + oy, Math.atan2(-dy, -dx), width * 2.2, colour);
    ctx.restore();
    line(ctx, x0, y0, x1, y1, colour, width, heads);
  }

  const ROT = { true: '時計回り', false: '反時計回り' };

  /**
   * The turn in words from where the player stands. A mirrored preview means a
   * webcam facing the player: the player is behind the cube and sees the side
   * facing away from the camera, which moves the other way to the picture.
   * Up/down and "seen from above" read the same from both sides, so the words
   * lean on them. `toward` and `dir` are in camera pixels (not mirrored).
   */
  function turnWords(a, mirrored) {
    const amount = a.twice ? '180°' : '90°';
    const word = { up: '上', down: '下', left: '左', right: '右' };
    if (a.kind === 'spin') {
      const cw = (a.dir === 'cw') !== mirrored;
      const which = mirrored ? 'カメラに向けた面（あなたの反対側）' : 'カメラに向けた面';
      return `${which}を、あなたから見て${ROT[cw]}に ${amount} 回してください`;
    }
    if (a.kind !== 'slide') return '';
    if (a.axis === 'row') {
      const name = ['上', '真ん中', '下'][a.index];
      // camera side to the camera's right = turning anticlockwise seen from above;
      // the player's own side then moves to the player's right, either way round
      return `${name}の段を、あなたから見える側が${word[a.toward]}へ動くように ${amount} 回してください（上から見て${ROT[a.toward === 'left']}）`;
    }
    const cols = mirrored ? ['右', '真ん中', '左'] : ['左', '真ん中', '右'];
    const near = mirrored ? BACK[a.toward] : a.toward;
    return `${cols[a.index]}の列を、あなたから見える側が${word[near]}へ動くように ${amount} 回してください`;
  }

  /** Turning the whole cube (`dir` as in `whole`) in the player's words. */
  function wholeWords(dir, mirrored) {
    if (dir === 'flip') return 'キューブ全体を上下ひっくり返して、反対側の面をカメラに向けてください';
    if (dir === 'left' || dir === 'right') {
      return `キューブ全体を、上から見て${ROT[dir === 'left']}に 90° 回してください`;
    }
    // the camera side going up tips the top away from the camera
    const toPlayer = (dir === 'up') === mirrored;
    return `キューブ全体を、上の面が${toPlayer ? 'あなたの方' : '向こう（カメラの方）'}へ倒れるように 90° 回してください`;
  }

  /**
   * Turn the whole cube: `dir` is where the front of the cube should travel
   * on screen ('up' | 'down' | 'left' | 'right'), or 'flip' for upside down.
   */
  function whole(canvas, box, size, dir, mirrored) {
    const ctx = canvas.getContext('2d');
    const b = place(canvas, box, size);
    const width = Math.max(5, b.s / 24);
    const cx = b.x + b.s / 2;
    const cy = b.y + b.s / 2;
    tint(ctx, b, box.angle, ALL, WHOLE_FILL, WHOLE);
    if (dir === 'flip') {
      line(ctx, cx - b.s * 0.2, cy - b.s * 0.55, cx - b.s * 0.2, cy + b.s * 0.55, WHOLE, width, 2);
      line(ctx, cx + b.s * 0.2, cy - b.s * 0.55, cx + b.s * 0.2, cy + b.s * 0.55, WHOLE, width, 2);
      badge(ctx, cx, cy, '180°', WHOLE, Math.max(13, b.s / 9), mirrored);
      return;
    }
    const [dx, dy] = VEC[drawDir(dir, mirrored)];
    const reach = b.s * 0.7;
    // one arrow per row (or column): every piece goes the same way
    for (const k of [-1, 0, 1]) {
      const x = cx + (dy ? k * b.s / 3 : 0);
      const y = cy + (dx ? k * b.s / 3 : 0);
      const far = k === 0 ? 1.15 : 0.95;
      line(ctx, x - dx * reach * 0.55, y - dy * reach * 0.55, x + dx * reach * far, y + dy * reach * far,
           WHOLE, k === 0 ? width * 1.2 : width * 0.8, 1);
    }
  }

  /** Words for a screen direction, as the player sees the preview. */
  function sideWord(dir, mirrored) {
    const d = mirrored && (dir === 'left' || dir === 'right') ? BACK[dir] : dir;
    return { up: '上', down: '下', left: '左', right: '右' }[d];
  }

  window.Overlay = { clear, grid, move, whole, sideWord, turnWords, wholeWords, drawDir, BACK };
})();
