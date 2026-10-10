/**
 * mobile/scanner.js — 「読み取り」: six photographs, then a look before solving
 *
 * The same six-face flow as the PC screen, laid out for a phone held upright:
 * a square preview the width of the screen, the guide grid on top of it, and
 * one big shutter under the thumb. The guide is drawn at exactly the square
 * camera.js samples, so lining the cube up with it is all the aiming there is.
 *
 * After the sixth face nothing is solved yet. The read cube is shown with the
 * close calls ringed in red; tapping a sticker and then a colour fixes it, and
 * only a cube that can physically exist can be handed to the coach.
 *
 * 「手で塗る」 skips the camera and opens the same review on the cube as it is
 * now, for a scan that went wrong on one sticker or a cube typed in by hand.
 *
 * Depends on: store.js, ui.js, scan.js, camera.js, cubie.js, net.js
 */

(function () {
  'use strict';

  const { el, button, header, faceNet } = UI;

  const FILL = 0.68;                // guide side, as a fraction of the preview square
  const CENTRES = 4;
  const HOME = new Cube().getState();   // a face's centre never moves, so its colour names the face

  let root = null;
  let phase = 'shoot';             // 'shoot' | 'review'
  let shots = [];                  // nine RGB samples per captured face
  let state = null;                // the cube under review
  let flagged = [];
  let selected = null;
  let painted = false;             // review opened by 「手で塗る」 rather than the camera
  let message = '';
  let stream = null;
  let live = false;
  let video = null;
  let token = 0;                   // bumps whenever the camera should not be running

  // ── camera ────────────────────────────────────────────────────────────────

  async function startCamera() {
    const mine = ++token;
    if (!Camera.canStream()) {
      fail('この環境ではカメラを使えません。「写真から」で 1 面ずつ読み込めます。');
      return;
    }
    let s;
    try {
      s = await Camera.openStream();
    } catch (e) {
      if (mine === token) fail(`カメラを使えませんでした（${e.name}）。「写真から」で 1 面ずつ読み込めます。`);
      return;
    }
    // Left the tab, or reached review, while permission was being asked.
    if (mine !== token || !video) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s;
    video.srcObject = s;
    try { await video.play(); } catch { /* autoplay refused: the first tap starts it */ }
    if (mine !== token) return;
    live = true;
    draw();
  }

  /** Release the camera. A preview left running keeps the light on. */
  function stopCamera() {
    token += 1;
    live = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  function fail(text) {
    message = text;
    if (root) draw();
  }

  // ── capture ───────────────────────────────────────────────────────────────

  function take(source, width, height) {
    shots = shots.concat([Camera.sampleSquare(source, width, height, FILL)]);
    message = '';
    if (shots.length === 6) finish();
    else draw();
  }

  function shoot() {
    if (!live || !video || !video.videoWidth) {
      fail('カメラの映像がまだ届いていません。少し待つか、「写真から」を使ってください。');
      return;
    }
    take(video, video.videoWidth, video.videoHeight);
  }

  function pickFile(input) {
    const file = input.files && input.files[0];
    input.value = '';                     // the same file twice must still fire
    if (!file) return;
    Camera.loadImage(file).then(
      img => take(img, img.naturalWidth, img.naturalHeight),
      () => fail('画像を読み込めませんでした。別のファイルを試してください。'));
  }

  function finish() {
    let read;
    try {
      read = Scan.toState(shots.flat());
    } catch (e) {
      shots = [];
      fail(`色を読み取れませんでした: ${e.message}`);
      return;
    }
    stopCamera();
    state = read.state;
    flagged = read.uncertain;
    selected = null;
    painted = false;
    phase = 'review';
    draw();
  }

  function paintByHand() {
    stopCamera();
    state = Store.state;
    flagged = [];
    selected = null;
    painted = true;
    message = '';
    phase = 'review';
    draw();
  }

  function restart() {
    shots = [];
    state = null;
    flagged = [];
    selected = null;
    message = '';
    phase = 'shoot';
    draw();
    startCamera();
  }

  /** Go back to a face already shot: it and every face after it are taken again. */
  function retakeFrom(i) {
    shots = shots.slice(0, i);
    message = '';
    draw();
  }

  // ── review ────────────────────────────────────────────────────────────────

  function paint(colour) {
    if (!selected) return;
    const { face, index } = selected;
    state = { ...state, [face]: state[face].map((c, i) => (i === index ? colour : c)) };
    flagged = flagged.filter(s => !(s.face === face && s.index === index));
    selected = null;
    draw();
  }

  function accept() {
    if (!Cubie.validate(state).ok) return;
    Store.load(state, 'scan');
    phase = 'shoot';
    shots = [];
    state = null;
    Main.go('coach');
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  function draw() {
    if (!root) return;
    root.textContent = '';
    if (phase === 'review') drawReview();
    else drawShoot();
  }

  function drawShoot() {
    const face = Scan.FACE_ORDER[shots.length];
    const info = Scan.INSTRUCTIONS[face];
    root.appendChild(header('読み取り', 'カメラで 6 面を撮る'));
    root.appendChild(faceChips());

    const stage = el('div', 'cam' + (live ? '' : ' off'));
    if (!video) {
      video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('playsinline', '');
    }
    stage.appendChild(video);
    const guide = el('div', 'cam-guide');
    guide.style.inset = `${((1 - FILL) / 2) * 100}%`;
    for (let i = 0; i < 9; i++) guide.appendChild(el('i'));
    stage.appendChild(guide);
    if (!live) stage.appendChild(el('p', 'cam-off', 'カメラ待ち'));
    root.appendChild(stage);
    root.appendChild(el('p', 'note center', '枠の中がそのまま読み取り範囲です'));

    root.appendChild(el('p', 'cam-step', `${shots.length + 1} / 6 面目 · ${info.title}`));
    root.appendChild(el('p', 'cam-hold', info.hold));
    if (message) root.appendChild(el('p', 'error', message));

    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.id = 'scan-file';
    file.hidden = true;
    file.addEventListener('change', () => pickFile(file));

    const row = el('div', 'shutter-row');
    const shutter = el('button', 'shutter');
    shutter.type = 'button';
    shutter.id = 'shutter';
    shutter.setAttribute('aria-label', '撮る');
    shutter.disabled = !live;
    shutter.addEventListener('click', shoot);
    row.append(button('写真から', 'small', () => file.click()), shutter,
               button('手で塗る', 'small', paintByHand));
    root.append(row, file);
  }

  function faceChips() {
    const row = el('div', 'face-chips');
    Scan.FACE_ORDER.forEach((face, i) => {
      const done = i < shots.length;
      const chip = el(done ? 'button' : 'span',
        'face-chip' + (done ? ' done' : i === shots.length ? ' now' : ''));
      chip.appendChild(el('i', `c-${HOME[face][CENTRES]}`));
      chip.appendChild(el('span', null, face));
      if (done) {
        chip.type = 'button';
        chip.title = `${face} 面から撮り直す`;
        chip.addEventListener('click', () => retakeFrom(i));
      }
      row.appendChild(chip);
    });
    return row;
  }

  function drawReview() {
    const verdict = Cubie.validate(state);
    const title = painted ? '手で塗る'
      : flagged.length ? `読み取り完了 · ${flagged.length} マスが際どい` : '読み取り完了 · 問題なし';
    root.appendChild(header(title, painted ? 'マスを選んで色を押す' : '赤い枠のマスを確かめてください'));

    root.appendChild(faceNet(state, {
      size: 78, flagged, selected,
      onCell: (face, index) => {
        if (index === CENTRES) return;      // centres fix the colour scheme; they never move
        selected = { face, index };
        draw();
      },
    }));

    const palette = el('div', 'palette');
    for (const colour of Net.COLOURS) {
      const b = el('button', `swatch c-${colour}`);
      b.type = 'button';
      b.dataset.colour = colour;
      b.title = Net.COLOUR_NAMES[colour] || colour;
      b.setAttribute('aria-label', b.title);
      b.disabled = !selected;
      b.addEventListener('click', () => paint(colour));
      palette.appendChild(b);
    }
    root.appendChild(palette);
    root.appendChild(el('p', 'note center',
      selected ? `${selected.face} 面のマスを何色にするか選んでください`
               : 'マスをタップすると色を直せます（中央のマスは固定）'));

    if (!verdict.ok) root.appendChild(el('p', 'error', `このままでは解けません: ${verdict.reason}`));

    const row = el('div', 'btns stack');
    const go = button('この状態で判定する', 'primary', accept);
    go.id = 'scan-accept';
    go.disabled = !verdict.ok;
    row.append(go, button('最初から撮り直す', null, restart));
    root.appendChild(row);
  }

  // ── tab life cycle ────────────────────────────────────────────────────────

  window.Scanner = {
    mount(node) {
      root = node;
      draw();
      if (phase === 'shoot') startCamera();
    },
    unmount() {
      stopCamera();
      root = null;
    },
    onChange() {},
  };
})();
