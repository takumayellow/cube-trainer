/**
 * live/view.js — watch the camera and report steady views of one cube face.
 *
 * Every TICK ms the centre square of the video is shrunk to SIZE pixels and
 * read with Scan.sampleImage, which looks for the cube anywhere near the guide
 * (off-centre, nearer or farther, a little crooked). A face counts as "in view"
 * while the grid score stays above GRID_MIN. It is "steady" once STEADY_NEED
 * of the last STEADY_TICKS clear reads (score TAKE_MIN or more) agree sticker
 * by sticker, so one shaky or blurred frame neither blocks nor decides a read.
 * Steady views come out averaged over the reads that agreed.
 *
 * Depends on: window.Scan.
 */
'use strict';

(function () {
  const TICK = 150;          // ms between reads
  const SIZE = 240;          // px the centre square is read at (about 35 ms a read)
  const FILL = 0.62;         // guide square, as a fraction of the preview
  // Grid scores measured at SIZE: the photo fixtures (stickers on black
  // plastic) score 424..537, and 218..309 one cell off; webcam frames of a
  // stickerless cube held up to the camera score 140..260, a face or the room
  // with no cube at most 78. Hand shake moves a sticker by up to 0.009;
  // another face differs by more than 0.5.
  const GRID_MIN = 100;      // a face is in view
  const TAKE_MIN = 130;      // a read clear enough to take
  const STEADY_TICKS = 4;    // reads looked at
  const STEADY_NEED = 3;     // of them, how many must agree: 0.45 s when nothing shakes
  const STEADY_D = 0.015;    // largest per-sticker change between agreeing reads
  const GONE_TICKS = 2;      // reads without a face before it counts as gone
  // The square drawn over the cube. The grid search lands on a slightly
  // different size and place every read even when the cube holds still, and
  // now and then on a wrong place altogether for one read. So the square
  // stays where it is while the median of the last few reads is within
  // SETTLE_LOCK of a side, and otherwise moves half the way there; a read
  // more than half a side away is followed only when the read before it
  // agrees (the cube itself moved), never on one stray read. Measured on
  // hand-held sequences with one read in seven landing 25 px off: the square
  // moves 0.9 px a read instead of 2.1 (8.1 raw), and catches up with a real
  // move within about four reads.
  const SETTLE_KEEP = 3;      // reads the median is taken over
  const SETTLE_LOCK = 0.06;   // of a side: closer than this, the square stays put
  const SETTLE_SNAP = 0.5;    // of a side: farther than this, a jump
  const SETTLE_AGREE = 0.15;  // of a side: two far reads this close make a real jump
  const SETTLE_EASE = 0.5;    // share of the way to the median each read
  const SETTLE_TURN = 2 * Math.PI / 180;

  const centreOf = b => [b.x + b.size / 2, b.y + b.size / 2, b.size, b.angle || 0];
  const boxOf = c => {
    const out = { x: c[0] - c[2] / 2, y: c[1] - c[2] / 2, size: c[2] };
    return Math.abs(c[3]) > 0.5 * Math.PI / 180 ? { ...out, angle: c[3] } : out;
  };
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const median = list => { const s = [...list].sort((p, q) => p - q); return s[s.length >> 1]; };

  /**
   * Where to draw the square after a read.
   * @param {{shown: object, seen: number[][]}|null} prev what settle returned last time
   * @param {{x: number, y: number, size: number, angle?: number}} box the latest read
   * @returns {{shown: object, seen: number[][]}} `shown` is the square to draw
   */
  function settle(prev, box) {
    const c = centreOf(box);
    if (!prev || !prev.shown) return { shown: box, seen: [c] };
    const seen = [...prev.seen, c].slice(-SETTLE_KEEP);
    const s = centreOf(prev.shown);
    if (apart(c, s) > SETTLE_SNAP * s[2]) {
      const last = prev.seen[prev.seen.length - 1];
      if (last && apart(c, last) < SETTLE_AGREE * c[2]) return { shown: box, seen: [last, c] };
      return { shown: prev.shown, seen };
    }
    const near = seen.filter(p => apart(p, s) <= SETTLE_SNAP * s[2]);
    const t = [0, 1, 2, 3].map(k => median(near.map(p => p[k])));
    if (apart(t, s) < SETTLE_LOCK * s[2] && Math.abs(t[2] - s[2]) < SETTLE_LOCK * s[2]
        && Math.abs(t[3] - s[3]) < SETTLE_TURN) return { shown: prev.shown, seen };
    return { shown: boxOf(s.map((v, k) => v + (t[k] - v) * SETTLE_EASE)), seen };
  }

  const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

  /** Largest per-sticker colour distance between two nine-colour reads, in Scan feature space. */
  function farthest(a, b) {
    let worst = 0;
    for (let i = 0; i < 9; i++) worst = Math.max(worst, dist2(Scan.feature(a[i]), Scan.feature(b[i])));
    return worst;
  }

  function average(reads) {
    return reads[0].map((_, i) => [0, 1, 2].map(c =>
      Math.round(reads.reduce((s, r) => s + r[i][c], 0) / reads.length)));
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {{onSteady: Function, onGone: Function, onFrame?: Function}} handlers
   *   onSteady({colours, box, size}) once per steady view; onGone() when the
   *   face leaves; onFrame({box, score, inView, held, size, progress}) every read,
   *   for drawing — held is true for a read that lost the grid while the
   *   square is still kept where it was — progress (0..1) is how close the view is to being taken
   */
  function create(video, handlers) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const guide = Scan.frameBox(SIZE, SIZE, FILL);
    let timer = null;
    let recent = [];
    let missing = 0;
    let sent = null;         // colours of the last steady view sent, until the face changes
    let placed = null;       // what settle() returned last, for drawing the square

    function read() {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      const side = Math.min(w, h);
      ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
      return Scan.sampleImage(ctx.getImageData(0, 0, SIZE, SIZE), guide);
    }

    function tick() {
      const got = read();
      if (!got) return;
      const inView = got.score >= GRID_MIN;
      // A read or two without the grid keeps the square where it was, so it
      // does not blink off and jump back while the cube is turned in the hand.
      if (inView) placed = settle(placed, got.box);
      const frame = { box: placed ? placed.shown : got.box, score: got.score, inView, size: SIZE, progress: 0 };
      if (!inView) {
        missing += 1;
        recent = [];
        if (missing >= GONE_TICKS) placed = null;
        frame.held = !!placed;       // still drawn where it was, arrow and all
        if (missing === GONE_TICKS) { sent = null; handlers.onGone(); }
        if (handlers.onFrame) handlers.onFrame(frame);
        return;
      }
      missing = 0;
      if (got.score >= TAKE_MIN) {
        recent = [...recent, got].slice(-STEADY_TICKS);
        const agree = recent.filter(r => farthest(r.colours, got.colours) <= STEADY_D);
        // a view already sent is not sent again; one stray frame does not change that
        const same = sent && farthest(sent, got.colours) <= STEADY_D;
        frame.progress = same ? 1 : Math.min(1, agree.length / STEADY_NEED);
        if (agree.length >= STEADY_NEED && !same) {
          sent = average(agree.map(r => r.colours));
          handlers.onSteady({ colours: sent, box: got.box, size: SIZE });
        }
      }
      if (handlers.onFrame) handlers.onFrame(frame);
    }

    return {
      start() { if (!timer) timer = setInterval(tick, TICK); },
      stop() { clearInterval(timer); timer = null; recent = []; missing = 0; sent = null; placed = null; },
      /** Forget the current steady view, so it is reported again once steady. */
      again() { recent = []; sent = null; },
    };
  }

  window.LiveView = { create, farthest, settle, FILL, SIZE, TICK, GRID_MIN, TAKE_MIN, STEADY_NEED, STEADY_D, guide: Scan.frameBox(SIZE, SIZE, FILL) };
})();
