/**
 * live/view.js — watch the camera and report steady views of one cube face.
 *
 * Every TICK ms the centre square of the video is shrunk to SIZE pixels and
 * read with Scan.sampleImage. A face counts as "in view" while the grid score
 * stays above GRID_MIN; it is "steady" once STEADY_TICKS reads in a row agree
 * sticker by sticker. Steady views come out averaged, so a single noisy frame
 * does not decide anything.
 *
 * Depends on: window.Scan.
 */
'use strict';

(function () {
  const TICK = 150;          // ms between reads
  const SIZE = 240;          // px the centre square is read at (about 7 ms a read)
  const FILL = 0.62;         // guide square, as a fraction of the preview
  const GRID_MIN = 100;      // grid score of a face in view (faces score ~200, clutter < 40)
  const STEADY_TICKS = 4;    // reads that must agree: 0.6 s
  const STEADY_D = 0.004;    // largest per-sticker change between agreeing reads
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
   *   face leaves; onFrame({box, score, inView, size}) every read, for drawing
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
    let reported = false;    // this steady view has already been sent

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
      if (handlers.onFrame) handlers.onFrame({ box: got.box, score: got.score, inView, size: SIZE });
      if (!inView) {
        missing += 1;
        recent = [];
        if (missing === GONE_TICKS) { reported = false; handlers.onGone(); }
        return;
      }
      missing = 0;
      if (recent.length && farthest(recent[recent.length - 1].colours, got.colours) > STEADY_D) {
        recent = [];
        reported = false;    // it moved: the next steady view is a new one
      }
      recent.push(got);
      if (recent.length > STEADY_TICKS) recent.shift();
      if (recent.length === STEADY_TICKS && !reported) {
        reported = true;
        handlers.onSteady({ colours: average(recent.map(r => r.colours)), box: got.box, size: SIZE });
      }
    }

    return {
      start() { if (!timer) timer = setInterval(tick, TICK); },
      stop() { clearInterval(timer); timer = null; recent = []; missing = 0; reported = false; },
      /** Forget the current steady view, so it is reported again once steady. */
      again() { recent = []; reported = false; },
    };
  }

  window.LiveView = { create, farthest, FILL, SIZE, GRID_MIN, guide: Scan.frameBox(SIZE, SIZE, FILL) };
})();
