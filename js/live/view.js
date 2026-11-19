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
  const SIZE = 240;          // px the centre square is read at (about 7 ms a read)
  const FILL = 0.62;         // guide square, as a fraction of the preview
  // Measured on the photo fixtures moved about as a hand holds them (shifted,
  // nearer, farther, turned 12°): the right grid scores 128..227, median 212;
  // a grid one cell off scores 62..178, median 142. Hand shake moves a sticker
  // by up to 0.009; another face differs by more than 0.5.
  const GRID_MIN = 80;       // a face is in view (clutter scores < 40)
  const TAKE_MIN = 140;      // a read clear enough to take
  const STEADY_TICKS = 4;    // reads looked at
  const STEADY_NEED = 3;     // of them, how many must agree: 0.45 s when nothing shakes
  const STEADY_D = 0.015;    // largest per-sticker change between agreeing reads
  const GONE_TICKS = 2;      // reads without a face before it counts as gone

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
   *   face leaves; onFrame({box, score, inView, size, progress}) every read,
   *   for drawing — progress (0..1) is how close the view is to being taken
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
      const frame = { box: got.box, score: got.score, inView, size: SIZE, progress: 0 };
      if (!inView) {
        missing += 1;
        recent = [];
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
      stop() { clearInterval(timer); timer = null; recent = []; missing = 0; sent = null; },
      /** Forget the current steady view, so it is reported again once steady. */
      again() { recent = []; sent = null; },
    };
  }

  window.LiveView = { create, farthest, FILL, SIZE, TICK, GRID_MIN, TAKE_MIN, STEADY_NEED, STEADY_D, guide: Scan.frameBox(SIZE, SIZE, FILL) };
})();
