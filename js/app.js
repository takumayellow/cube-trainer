/**
 * app.js — the screen
 *
 * Holds one cube, one mode (learn with CFOP / show the shortest solution) and
 * redraws everything from that state. Nothing here knows how to solve or how to
 * judge a phase; it asks the other modules and lays out the answer.
 */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const MAX_UNDO = 100;
  const SCRAMBLE_LEN = 25;
  const PER_FACE = 9;
  const MAX_SEQ = 400;          // a pasted essay is a typo, not a sequence

  // Where a sticker sits on its face, for talking about a doubtful colour.
  const SPOT = ['左上', '上', '右上', '左', '中央', '右', '左下', '下', '右下'];

  const cube = new Cube();
  const history = [];
  let mode = 'cfop';
  let paint = null;             // colour letter while painting, null otherwise
  let solution = null;          // the shortest-mode moves; dropped when the cube changes
  let step = 0;
  let view3d = null;            // the CSS 3D cube, built on first draw
  let generation = 0;           // which redraw a late answer belongs to
  let camera = null;            // the running scanner, or null while closed

  // Building the search tables takes about 0.35 s. Do it in the background so
  // the first press of the solve button does not pay for it.
  setTimeout(() => {
    try { TwoPhaseSolver.init(); } catch { /* solve() builds them again */ }
  }, 0);

  // ── state changes ─────────────────────────────────────────────────────────

  /**
   * Change the cube, remembering the state to come back to.
   * @param {boolean} [keepSolution] true while stepping through a solution the
   *   moves came from — any other change makes that solution stale.
   */
  function mutate(fn, keepSolution) {
    history.push(cube.getState());
    if (history.length > MAX_UNDO) history.shift();
    fn();
    if (!keepSolution) { solution = null; step = 0; }
    refresh();
  }

  function undo() {
    const prev = history.pop();
    if (!prev) return;
    cube.setState(prev);
    solution = null;
    step = 0;
    refresh();
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  function refresh() {
    const state = cube.getState();
    const verdict = Cubie.validate(state);
    const mine = ++generation;

    const status = $('status');
    status.textContent = verdict.ok
      ? (cube.isSolved() ? '完成しています。' : '妥当な状態です。')
      : `この状態は実物のキューブでは作れません: ${verdict.reason}`;
    status.className = verdict.ok ? 'status ok' : 'status ng';

    let report = null;
    if (verdict.ok) {
      try { report = CFOP.analyse(state); } catch { report = null; }
    }

    draw(state, highlightFor(report));

    const panel = $('panel');
    panel.textContent = '';
    if (!verdict.ok) {
      panel.appendChild(el('p', 'error', '状態を直すと、ここに解き方が出ます。'));
      return;
    }
    if (mode === 'shortest') {
      drawShortest(panel, report);
      return;
    }

    // Working out the next turns is a search, and a search can take a moment.
    // The cube is drawn first so it never freezes mid-move, and the answer is
    // dropped in when it arrives — unless the cube has moved on since.
    panel.appendChild(el('p', 'note', '手を探しています…'));
    setTimeout(() => {
      if (mine !== generation) return;
      let job = null;
      try { job = Step.next(state); } catch (err) { console.error(err); }
      panel.textContent = '';
      if (!job) {
        panel.appendChild(el('p', 'error', 'この状態の手順を出せませんでした。'));
        return;
      }
      drawJob(panel, job);
      draw(state, job.highlight);
    }, 0);
  }

  /** Both pictures of the same cube, always the same highlights. */
  function draw(state, highlight) {
    Net.render($('net'), state, { highlight, onClick: paint ? paintCell : null });
    if (!view3d) view3d = Cube3D.create($('view3d'), { size: 170 });
    view3d.render(state, { highlight });
  }

  function highlightFor(report) {
    if (mode === 'shortest' && solution && step < solution.length) {
      const face = solution[step][0];        // light up the whole face to turn next
      return Array.from({ length: PER_FACE }, (_, i) => ({ face, index: i }));
    }
    return report && mode === 'cfop' ? report.highlight : [];
  }

  function paintCell(face, index) {
    if (index === 4) {
      $('status').textContent = '中心の色は面の基準なので変更できません。';
      $('status').className = 'status ng';
      return;
    }
    mutate(() => {
      const s = cube.getState();
      s[face][index] = paint;
      cube.setState(s);
    });
  }

  // ── CFOP panel ────────────────────────────────────────────────────────────

  /**
   * One job, for this cube, now. Everything else — the other slots, the rest of
   * the technique list — is either shown as a chip or folded away, because the
   * thing being answered is "what do I turn next", not "what is CFOP".
   */
  function drawJob(panel, job) {
    panel.appendChild(progressBar({ stages: job.stages, current: job.stage }));

    panel.appendChild(el('h2', null, `いまここ: ${job.title}`));
    panel.appendChild(el('p', 'goal', job.goal));

    if (job.stuck) {
      panel.appendChild(el('p', 'error', job.why));
    } else if (job.moves.length) {
      panel.appendChild(moveChips(job.moves, 0));
      panel.appendChild(jobControls(job));
      if (job.why) panel.appendChild(el('p', 'advice', job.why));
      if (job.partial) {
        panel.appendChild(el('p', 'note',
          'これは下ごしらえです。回すと、続きの手順がここに出ます。'));
      }
    } else {
      panel.appendChild(el('p', 'advice', job.why || ''));
    }

    if (job.name) panel.appendChild(techniqueCard(job));

    const stage = job.stage === 'solved' ? 'pll' : job.stage;
    const more = el('details');
    more.appendChild(el('summary', null, `${stage.toUpperCase()} で使うテクニック一覧（参考）`));
    more.appendChild(glossaryTable(Glossary.forStage(stage)));
    panel.appendChild(more);
  }

  /** The technique being used, named — the reason to learn CFOP rather than guess. */
  function techniqueCard(job) {
    const card = el('div', 'technique');
    const head = el('div', 'technique-head');
    head.appendChild(el('strong', null, job.name));
    if (job.jp) head.appendChild(el('span', 'jp', job.jp));
    card.appendChild(head);
    card.appendChild(el('p', 'advice', job.does));
    return card;
  }

  function jobControls(job) {
    const row = el('div', 'row');
    const all = el('button', 'primary', `この手順を回す（${job.moves.length} 手）`);
    all.onclick = () => mutate(() => cube.applySequence(job.moves));
    row.appendChild(all);

    const one = el('button', null, `1 手だけ（${job.moves[0]}）`);
    one.onclick = () => mutate(() => cube.applyMove(job.moves[0]));
    row.appendChild(one);
    return row;
  }

  function progressBar(report) {
    const bar = el('div', 'progress');
    for (const s of report.stages) {
      const chip = el('div', 'stage' + (s.done ? ' done' : '') +
                             (s.key === report.current ? ' current' : ''));
      chip.appendChild(el('span', 'stage-name', s.label));
      if (s.key === 'f2l') {
        const slots = el('span', 'slot-dots');
        for (const slot of s.slots) {
          const dot = el('span', 'dot' + (slot.done ? ' filled' : ''));
          dot.title = `${slot.label}スロット: ${slot.done ? '完成' : slot.situation.headline}`;
          slots.appendChild(dot);
        }
        chip.appendChild(slots);
      } else {
        chip.appendChild(el('span', 'stage-mark', s.done ? '✓' : '—'));
      }
      bar.appendChild(chip);
    }
    return bar;
  }

  function glossaryTable(entries) {
    const table = el('table', 'grid');
    const head = el('tr');
    for (const h of ['名称', '手順', '何をするか', '使う場面']) head.appendChild(el('th', null, h));
    table.appendChild(head);
    for (const e of entries) {
      const tr = el('tr');
      const name = el('td');
      name.appendChild(el('strong', null, e.name));
      name.appendChild(el('div', 'jp', e.jp));
      tr.appendChild(name);
      tr.appendChild(el('td', 'alg', e.moves));
      tr.appendChild(el('td', null, e.does));
      tr.appendChild(el('td', null, e.when));
      table.appendChild(tr);
    }
    return table;
  }

  // ── shortest panel ────────────────────────────────────────────────────────

  function drawShortest(panel, report) {
    panel.appendChild(el('p', 'advice',
      '2 フェーズ法が機械にとっての最短に近い手順を返します（ランダムな状態で平均 21 手）。'
      + '人間が覚えられる構造にはなっていないので、揃えたいときだけ使ってください。'));

    panel.appendChild(solveButton());

    if (!solution) {
      if (cube.isSolved()) panel.appendChild(el('p', 'note', '完成しているので手順はありません。'));
      return;
    }

    panel.appendChild(el('h3', null, `${solution.length} 手（${step} / ${solution.length} まで実行）`));
    panel.appendChild(moveChips(solution, step));
    panel.appendChild(stepControls());

    if (report && report.current !== 'solved') {
      panel.appendChild(el('p', 'note',
        `ちなみに CFOP で見ると、この状態は「${report.label}」です。`));
    }
  }

  function solveButton() {
    const btn = el('button', 'primary', solution ? '解き直す' : '最短手順を求める');
    btn.onclick = () => {
      btn.disabled = true;
      btn.textContent = '探索中…';
      // The search is synchronous, so let the label repaint before it starts.
      setTimeout(() => {
        try {
          solution = TwoPhaseSolver.solve(cube.getState());
        } catch (err) {
          solution = null;
          console.error(err);
        }
        step = 0;
        refresh();
      }, 0);
    };
    return btn;
  }

  /** The moves themselves, with the one to turn next picked out. */
  function moveChips(moves, at) {
    const list = el('div', 'alg-list');
    moves.forEach((m, i) => {
      list.appendChild(el('span', 'move' + (i < at ? ' past' : i === at ? ' next' : ''), m));
    });
    return list;
  }

  function stepControls() {
    const controls = el('div', 'row');
    const done = step >= solution.length;

    const next = el('button', null, '次の 1 手');
    next.disabled = done;
    next.onclick = () => mutate(() => {
      cube.applyMove(solution[step]);
      step += 1;
    }, true);

    const all = el('button', null, '最後まで進める');
    all.disabled = done;
    all.onclick = () => mutate(() => {
      cube.applySequence(solution.slice(step));
      step = solution.length;
    }, true);

    controls.appendChild(next);
    controls.appendChild(all);
    return controls;
  }

  // ── controls ──────────────────────────────────────────────────────────────

  function buildPalette() {
    const box = $('palette');
    for (const c of Net.COLOURS) {
      const b = el('button', `swatch c-${c}`);
      b.title = Net.COLOUR_NAMES[c];
      b.onclick = () => {
        paint = c;
        for (const other of box.children) other.classList.toggle('picked', other === b);
        refresh();
      };
      box.appendChild(b);
    }
  }

  function buildMoveButtons() {
    const box = $('moves');
    for (const face of ['U', 'D', 'L', 'R', 'F', 'B']) {
      const group = el('div', 'move-group');
      for (const suffix of ['', "'", '2']) {
        const m = face + suffix;
        const b = el('button', 'move-btn', m);
        b.onclick = () => mutate(() => cube.applyMove(m));
        group.appendChild(b);
      }
      box.appendChild(group);
    }
  }

  function applySequence() {
    const raw = $('seq').value.trim();
    const err = $('seq-error');
    err.hidden = true;
    if (!raw) return;
    const moves = raw.replace(/’/g, "'").split(/\s+/);
    if (moves.length > MAX_SEQ) {
      err.textContent = `手順が長すぎます（${moves.length} 手）。${MAX_SEQ} 手までにしてください。`;
      err.hidden = false;
      return;
    }
    const unknown = moves.filter(m => !Object.prototype.hasOwnProperty.call(Cube._MOVES, m));
    if (unknown.length) {
      err.textContent = `使えない記号があります: ${unknown.join(' ')}（U D L R F B に ' か 2 を付けた形）`;
      err.hidden = false;
      return;
    }
    mutate(() => cube.applySequence(moves));
    $('seq').value = '';
  }

  /** Painting mode, from anywhere — the scanner turns it on when it is unsure. */
  function setPaint(on) {
    $('palette').hidden = !on;
    $('paint-hint').hidden = !on;
    $('edit-toggle').classList.toggle('on', on);
    $('edit-toggle').textContent = on ? '塗るのをやめる' : '色を塗る';
    paint = on ? Net.COLOURS[0] : null;
    if (on) $('palette').children[0].classList.add('picked');
    refresh();
  }

  // ── reading the cube with the camera ──────────────────────────────────────

  function closeCamera() {
    if (camera) camera.stop();
    camera = null;
    $('camera').textContent = '';
    $('camera').hidden = true;
    $('camera-toggle').classList.remove('on');
    $('camera-toggle').textContent = 'カメラで読み取る';
  }

  function openCamera() {
    $('camera').hidden = false;
    $('camera-toggle').classList.add('on');
    $('camera-toggle').textContent = '読み取りをやめる';
    camera = Camera.create($('camera'), { onState: takeScan, onClose: closeCamera });
    camera.start();
  }

  /**
   * A photographed cube is a guess, so say how good a guess it was. Doubtful
   * stickers are named one by one and painting is switched on, because the
   * cheapest fix for a misread orange is one click — far cheaper than a solve
   * that quietly answers for a cube nobody is holding.
   */
  function takeScan(state, uncertain) {
    closeCamera();
    mutate(() => cube.setState(state));

    const note = $('scan-note');
    const verdict = Cubie.validate(state);
    if (!verdict.ok) {
      note.textContent = '読み取った色ではキューブとして成立しません。展開図で塗り直してください。';
    } else if (uncertain.length) {
      const spots = uncertain.map(u => `${u.face} 面の${SPOT[u.index]}`).join('、');
      note.textContent = `読み取りました。色に自信がないマスが ${uncertain.length} 個あります: ${spots}。`
        + '実物と見比べて、違っていれば塗り直してください。';
    } else {
      note.textContent = '読み取りました。実物と見比べて、違っていれば塗り直してください。';
    }
    note.hidden = false;
    if (!verdict.ok || uncertain.length) setPaint(true);
  }

  function setMode(next) {
    mode = next;
    $('tab-cfop').classList.toggle('active', mode === 'cfop');
    $('tab-shortest').classList.toggle('active', mode === 'shortest');
    refresh();
  }

  buildPalette();
  buildMoveButtons();

  $('edit-toggle').onclick = () => setPaint($('palette').hidden);
  $('camera-toggle').onclick = () => (camera ? closeCamera() : openCamera());
  $('scramble').onclick = () => mutate(() => cube.scramble(SCRAMBLE_LEN));
  $('reset').onclick = () => mutate(() => cube.reset());
  $('undo').onclick = undo;
  $('apply-seq').onclick = applySequence;
  $('seq').onkeydown = (ev) => { if (ev.key === 'Enter') applySequence(); };
  $('tab-cfop').onclick = () => setMode('cfop');
  $('tab-shortest').onclick = () => setMode('shortest');

  refresh();
})();
