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
 * If the camera is unavailable (no permission, no device, or a page served over
 * plain http), the same flow runs off picked image files, one per face.
 *
 * Depends on: scan.js
 */

(function () {
  'use strict';

  const FILL = 0.62;               // guide square, as a fraction of the preview
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  /**
   * Build the capture UI inside `root`.
   * @param {HTMLElement} root
   * @param {{onState: function(object, Array): void, onClose: function(): void}} opts
   *   `onState` receives the read state and the list of stickers whose colour
   *   was a close call, so the caller can point at them instead of claiming
   *   the read was certain.
   */
  function create(root, opts) {
    const faces = Scan.FACE_ORDER;
    const shots = [];                 // RGB samples per captured face, in order
    let stream = null;
    let live = false;

    root.textContent = '';
    const stage = el('div', 'cam-stage');
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    const guide = el('div', 'cam-guide');
    for (let i = 0; i < 9; i++) guide.appendChild(el('div', 'cam-cell'));
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
      shoot.disabled = !live;
    }

    function fail(message) {
      error.textContent = message;
      error.hidden = false;
    }

    const clearError = () => { error.hidden = true; };

    /** One face captured from any square-croppable source. */
    function take(source, width, height) {
      const side = Math.min(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, side, side);

      shots.push(Scan.sampleFace(ctx, Scan.frameBox(side, side, FILL)));
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
      stop();
      opts.onState(read.state, read.uncertain);
    }

    shoot.addEventListener('click', () => {
      if (!live) return fail('カメラが動いていません。「写真を選ぶ」を使ってください。');
      if (!video.videoWidth) return fail('カメラの映像がまだ届いていません。少し待ってから撮ってください。');
      take(video, video.videoWidth, video.videoHeight);
    });

    back.addEventListener('click', () => {
      shots.pop();
      clearError();
      draw();
    });

    quit.addEventListener('click', () => {
      stop();
      opts.onClose();
    });

    pick.addEventListener('change', () => {
      const file = pick.files && pick.files[0];
      pick.value = '';                       // same file twice must still fire
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        take(img, img.naturalWidth, img.naturalHeight);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        fail('画像を読み込めませんでした。別のファイルを試してください。');
      };
      img.src = url;
    });

    // ── the camera itself ───────────────────────────────────────────────────

    async function start() {
      draw();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        stage.classList.add('off');
        fail('この環境ではカメラを使えません。「写真を選ぶ」で 1 面ずつ読み込めます。');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
      } catch (e) {
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
      live = true;
      draw();
    }

    /** Release the camera. A preview left running keeps the light on. */
    function stop() {
      live = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
    }

    return { start, stop };
  }

  window.Camera = { create, FILL };
})();
