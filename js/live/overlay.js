/**
 * live/overlay.js — draw on top of the camera picture.
 *
 * Coordinates come in the read square (LiveView.SIZE pixels across) and are
 * scaled to the overlay canvas. The overlay is mirrored together with the
 * video when the preview is, so arrows always sit on the picture they belong
 * to; words about directions are worked out separately (see `sideWord`).
 */
'use strict';

(function () {
  const LAYER = '#ffd43b';     // turning one layer
  const WHOLE = '#4dd4ff';     // turning the whole cube
  const OK = '#51cf66';
  const DIM = 'rgba(255,255,255,0.55)';

  const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function head(ctx, x, y, angle, size) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * Math.cos(angle - 0.5), y - size * Math.sin(angle - 0.5));
    ctx.lineTo(x - size * Math.cos(angle + 0.5), y - size * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();
  }

  function line(ctx, x0, y0, x1, y1, colour, width, heads) {
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const angle = Math.atan2(y1 - y0, x1 - x0);
    head(ctx, x1, y1, angle, width * 3);
    if (heads > 1) {
      const back = width * 3.2;
      head(ctx, x1 - back * Math.cos(angle), y1 - back * Math.sin(angle), angle, width * 3);
    }
  }

  function arc(ctx, cx, cy, r, cw, colour, width, heads) {
    const span = Math.PI * 1.4;
    const start = -Math.PI / 2 - (cw ? span / 2 : -span / 2);
    const end = start + (cw ? span : -span);
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end, !cw);
    ctx.stroke();
    const tangent = end + (cw ? Math.PI / 2 : -Math.PI / 2);
    head(ctx, cx + r * Math.cos(end), cy + r * Math.sin(end), tangent, width * 3);
    if (heads > 1) {
      const back = end - (cw ? 0.35 : -0.35);
      head(ctx, cx + r * Math.cos(back), cy + r * Math.sin(back), tangent - (cw ? 0.35 : -0.35), width * 3);
    }
  }

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

  /** One layer turn, as Track.arrowFor describes it (kinds 'slide' and 'spin'). */
  function move(canvas, box, size, arrow) {
    const ctx = canvas.getContext('2d');
    const b = place(canvas, box, size);
    const width = Math.max(4, b.s / 28);
    const heads = arrow.twice ? 2 : 1;
    if (arrow.kind === 'spin') {
      arc(ctx, b.x + b.s / 2, b.y + b.s / 2, b.s * 0.42, arrow.dir === 'cw', LAYER, width, heads);
      return;
    }
    if (arrow.kind !== 'slide') return;
    const [dx, dy] = VEC[arrow.toward];
    const mid = (arrow.index + 0.5) / 3;
    const reach = b.s * 0.62;
    const cx = b.x + (arrow.axis === 'col' ? b.s * mid : b.s / 2);
    const cy = b.y + (arrow.axis === 'row' ? b.s * mid : b.s / 2);
    line(ctx, cx - dx * reach, cy - dy * reach, cx + dx * reach, cy + dy * reach, LAYER, width, heads);
  }

  /**
   * Turn the whole cube: `dir` is where the front of the cube should travel
   * on screen ('up' | 'down' | 'left' | 'right'), or 'flip' for upside down.
   */
  function whole(canvas, box, size, dir) {
    const ctx = canvas.getContext('2d');
    const b = place(canvas, box, size);
    const width = Math.max(5, b.s / 22);
    const cx = b.x + b.s / 2;
    const cy = b.y + b.s / 2;
    if (dir === 'flip') {
      line(ctx, cx - b.s * 0.2, cy - b.s * 0.55, cx - b.s * 0.2, cy + b.s * 0.55, WHOLE, width, 2);
      line(ctx, cx + b.s * 0.2, cy - b.s * 0.55, cx + b.s * 0.2, cy + b.s * 0.55, WHOLE, width, 2);
      return;
    }
    const [dx, dy] = VEC[dir];
    const reach = b.s * 0.75;
    ctx.globalAlpha = 0.9;
    line(ctx, cx - dx * reach * 0.6, cy - dy * reach * 0.6, cx + dx * reach, cy + dy * reach, WHOLE, width, 1);
    ctx.globalAlpha = 1;
  }

  /** Words for a screen direction, as the player sees the preview. */
  function sideWord(dir, mirrored) {
    const d = mirrored && (dir === 'left' || dir === 'right') ? BACK[dir] : dir;
    return { up: '上', down: '下', left: '左', right: '右' }[d];
  }

  window.Overlay = { clear, grid, move, whole, sideWord, BACK };
})();
