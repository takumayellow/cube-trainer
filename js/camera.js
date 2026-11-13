/**
 * camera.js — reading the cube in your hand with the camera
 *
 * Typing 54 stickers is the worst part of using a solver, so this takes six
 * photographs instead. The screen shows one face at a time, in the order the
 * cube can be turned without putting it down (U → R → F → D → L → B), with the
 * way to hold it written out, because a photograph of the right face held the
 * wrong way up produces a state that is valid and wrong.
 *
 * The preview box is square and the video is cropped to fill it, so what is on
 * screen is exactly the centred square of the frame. That is the same square
 * scan.js samples — the guide grid is not an approximation of where the colours
 * are read, it is where they are read.
 *
 * Each shot averages a short burst of frames, and the grid is looked for near
 * the guide rather than trusted blindly (Scan.locateGrid), so a cheap webcam
 * and a cube held a little off-centre still give steady colours. A camera that
 * faces the user (a laptop or monitor webcam) is shown mirrored, the way people
 * expect to see themselves; the pixels read are the unmirrored ones.
 *
 * If the camera is unavailable (no permission, no device, or a page served over
 * plain http), the same flow runs off picked image files, one per face.
 *
 * Depends on: scan.js
 */

(function () {
  'use strict';

  const FILL = 0.62;               // guide square, as a fraction of the preview
  const WORK = 480;                // the square is read at most this many pixels across
  const BURST = 5;                 // frames averaged per shot
  const BURST_GAP = 60;            // ms between them
  const LIVE_EVERY = 250;          // ms between live colour previews
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  /**
   * Build the capture UI inside `root`.
   * @param {HTMLElement} root
   * @param {{onState: function(object): void, onClose: function(): void}} opts
   *   `onState` receives everything Scan.toState returns — the state, and the
   *   stickers that were close calls or were inferred from the pieces — so the
   *   caller can point at them instead of claiming the read was certain.
   */
  function create(root, opts) {
    const faces = Scan.FACE_ORDER;
    const shots = [];                 // RGB samples per captured face, in order
    let stream = null;
    let live = false;
    let busy = false;
    let timer = null;

    root.textContent = '';
    const stage = el('div', 'cam-stage');
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    const guide = el('div', 'cam-guide');
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const cell = el('div', 'cam-cell');
      cell.appendChild(el('span', 'cam-dot'));
      cells.push(cell);
      guide.appendChild(cell);
    }
    guide.style.width = `${FILL * 100}%`;
    guide.style.height = `${FILL * 100}%`;
    stage.append(video, guide);

    const title = el('p', 'cam-title');
    const hold = el('p', 'hint');
    const progress = el('p', 'cam-progress');
    const error = el('p', 'error');
    error.hidden = true;

    const shoot = el('button', 'primary', '撮る');
    const back = el('button', null, '1 面戻る');
    const quit = el('button', null, 'やめる');
    const pick = el('input');
    pick.type = 'file';
    pick.accept = 'image/*';
    pick.hidden = true;
    const pickBtn = el('button', null, '写真を選ぶ');
    pickBtn.addEventListener('click', () => pick.click());

    const row = el('div', 'row');
    row.append(shoot, pickBtn, back, quit);
    root.append(title, hold, stage, progress, error, row, pick);

    // ── flow ────────────────────────────────────────────────────────────────

    function draw() {
      const face = faces[shots.length];
      const info = Scan.INSTRUCTIONS[face];
      title.textContent = `${info.title} を撮ります`;
      hold.textContent = info.hold;
      progress.textContent = `${shots.length} / 6 面`;
      back.disabled = shots.length === 0;
      shoot.disabled = !live || busy;
    }

    function fail(message) {
      error.textContent = message;
      error.hidden = false;
    }

    const clearError = () => { error.hidden = true; };

    /** One face captured from any square-croppable source. */
    function take(colours) {
      shots.push(colours);
      clearError();
      if (shots.length === faces.length) finish();
      else draw();
    }

    function finish() {
      let read;
      try {
        read = Scan.toState(shots.flat());
      } catch (e) {
        shots.length = 0;
        draw();
        fail(`色を読み取れませんでした: ${e.message}`);
        return;
      }
      close();
      opts.onState(read);
    }

    shoot.addEventListener('click', () => {
      if (!live) return fail('カメラが動いていません。「写真を選ぶ」を使ってください。');
      if (!video.videoWidth) return fail('カメラの映像がまだ届いていません。少し待ってから撮ってください。');
      busy = true;
      draw();
      sampleBurst(video, BURST).then(colours => {
        busy = false;
        if (live) take(colours);
      }, () => {
        busy = false;
        if (!live) return;                  // closed while shooting
        draw();
        fail('カメラの映像が途切れました。もう一度撮ってください。');
      });
    });

    back.addEventListener('click', () => {
      shots.pop();
      clearError();
      draw();
    });

    quit.addEventListener('click', () => {
      close();
      opts.onClose();
    });

    pick.addEventListener('change', () => {
      const file = pick.files && pick.files[0];
      pick.value = '';                       // same file twice must still fire
      if (!file) return;
      loadImage(file).then(
        img => take(sampleSquare(img, img.naturalWidth, img.naturalHeight, FILL)),
        () => fail('画像を読み込めませんでした。別のファイルを試してください。'));
    });

    // ── the camera itself ───────────────────────────────────────────────────

    async function start() {
      draw();
      if (!canStream()) {
        stage.classList.add('off');
        fail('この環境ではカメラを使えません。「写真を選ぶ」で 1 面ずつ読み込めます。');
        return;
      }
      try {
        const s = await openStream();
        if (closed) { s.getTracks().forEach(t => t.stop()); return; }   // closed while asking
        stream = s;
      } catch (e) {
        if (closed) return;
        stage.classList.add('off');
        fail(`カメラを使えませんでした（${e.name}）。「写真を選ぶ」で 1 面ずつ読み込めます。`);
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch (e) {
        fail('映像を再生できませんでした。画面をタップしてからもう一度お試しください。');
      }
      const mirrored = isMirrored(stream);
      stage.classList.toggle('mirror', mirrored);
      live = true;
      draw();
      timer = setInterval(() => showLive(mirrored), LIVE_EVERY);
    }

    // Leaving the page (another tab, the home screen) must turn the camera off,
    // and coming back turns it on again.
    let closed = false, paused = false;
    function onVisibility() {
      if (document.hidden) {
        if (live) { paused = true; stop(); }
      } else if (paused && !closed) {
        paused = false;
        start();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    /** Done with this scanner for good. */
    function close() {
      closed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    }

    /** What the camera would read right now, as a dot in each guide cell. */
    function showLive(mirrored) {
      if (!live || busy || !video.videoWidth) return;
      const colours = sampleSquare(video, video.videoWidth, video.videoHeight, FILL);
      colours.forEach((rgb, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const shown = mirrored ? row * 3 + (2 - col) : i;   // the preview is flipped, the pixels are not
        cells[shown].firstChild.style.background = `rgb(${rgb.join(',')})`;
      });
    }

    /** Release the camera. A preview left running keeps the light on. */
    function stop() {
      live = false;
      if (timer) clearInterval(timer);
      timer = null;
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
    }

    return { start, stop: close };
  }

  // ── pieces the phone app's scanner shares ───────────────────────────────

  /**
   * Sample the centred square of `source` — the square the preview shows — at
   * the guide drawn over it.
   * @param {CanvasImageSource} source  a playing <video> or a loaded <img>
   * @param {number} width   the source's own pixel size
   * @param {number} height
   * @param {number} fill    guide side as a fraction of the square
   * @returns {Array} nine RGB samples, in sticker order
   */
  function sampleSquare(source, width, height, fill) {
    const side = Math.min(width, height);
    const out = Math.min(side, WORK);           // downscaling averages pixels: less noise, less work
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, out, out);
    return Scan.sampleFace(ctx, Scan.frameBox(out, out, fill));
  }

  /**
   * One shot from a playing video: `frames` frames a moment apart, averaged
   * sticker by sticker. Sensor noise differs frame to frame; the cube does not.
   * @returns {Promise<Array>} nine RGB samples
   */
  async function sampleBurst(video, frames, fill) {
    const shots = [];
    for (let i = 0; i < frames; i++) {
      if (i) await new Promise(r => setTimeout(r, BURST_GAP));
      if (!video.videoWidth) break;
      shots.push(sampleSquare(video, video.videoWidth, video.videoHeight, fill || FILL));
    }
    if (!shots.length) throw new Error('no frames');
    return shots[0].map((_, s) => [0, 1, 2].map(k =>
      Math.round(shots.reduce((sum, shot) => sum + shot[s][k], 0) / shots.length)));
  }

  /**
   * Whether to show the preview mirrored: yes for a camera that faces the
   * user. When the camera does not say which way it faces, a desktop webcam
   * faces the user and a phone gave us the rear camera we asked for.
   */
  function isMirrored(stream) {
    const track = stream && stream.getVideoTracks()[0];
    const settings = track && track.getSettings ? track.getSettings() : {};
    if (settings.facingMode === 'user') return true;
    if (settings.facingMode === 'environment') return false;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return !touch;
  }

  const canStream = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  /** The rear camera, square-ish and sharp enough to tell orange from red. */
  const openStream = () => navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false,
  });

  /** A picked image file, decoded. Rejects when it is not an image after all. */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
      img.src = url;
    });
  }

  window.Camera = { create, FILL, BURST, sampleSquare, sampleBurst, isMirrored, canStream, openStream, loadImage };
})();
