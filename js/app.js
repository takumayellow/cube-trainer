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

  const cube = new Cube();
  const history = [];
  let mode = 'cfop';
  let paint = null;             // colour letter while painting, null otherwise
  let solution = null;          // the shortest-mode moves; dropped when the cube changes
  let step = 0;

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

    const status = $('status');
    status.textContent = verdict.ok
      ? (cube.isSolved() ? '完成しています。' : '妥当な状態です。')
      : `この状態は実物のキューブでは作れません: ${verdict.reason}`;
    status.className = verdict.ok ? 'status ok' : 'status ng';

    let report = null;
    if (verdict.ok) {
      try { report = CFOP.analyse(state); } catch { report = null; }
    }

    Net.render($('net'), state, {
      highlight: highlightFor(report),
      onClick: paint ? paintCell : null,
    });

    const panel = $('panel');
    panel.textContent = '';
    if (!verdict.ok) {
      panel.appendChild(el('p', 'error', '状態を直すと、ここに解き方が出ます。'));
      return;
    }
    (mode === 'cfop' ? drawCfop : drawShortest)(panel, report);
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

  function drawCfop(panel, report) {
    panel.appendChild(progressBar(report));

    panel.appendChild(el('h2', null, `いまここ: ${report.label}`));
    if (report.detail) panel.appendChild(el('p', 'advice', report.detail));

    if (report.current === 'f2l') panel.appendChild(slotTable(report));

    const stage = report.current === 'solved' ? 'pll' : report.current;
    panel.appendChild(el('h3', null, 'この段階で使うテクニック'));
    panel.appendChild(glossaryTable(Glossary.forStage(stage)));
    panel.appendChild(el('p', 'note',
      'いまはフェーズの判定までです。F2L 41 ケースや OLL 57 / PLL 21 の自動認識（この形だから'
      + 'このケース、という見分け方の提示）はこれから足していきます。'));
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

  function slotTable(report) {
    const wrap = el('div');
    wrap.appendChild(el('h3', null, '4 つのスロットの状況'));
    const table = el('table', 'grid');
    const head = el('tr');
    for (const h of ['スロット', '状態', '次の一手の考え方']) head.appendChild(el('th', null, h));
    table.appendChild(head);

    for (const slot of report.stages.find(s => s.key === 'f2l').slots) {
      const tr = el('tr', slot.key === report.slot.key ? 'target' : (slot.done ? 'muted' : ''));
      tr.appendChild(el('td', null, `${slot.label}（${slot.key}）`));
      tr.appendChild(el('td', null, slot.done ? '完成' : slot.situation.headline));
      tr.appendChild(el('td', null, slot.done ? '' : slot.situation.advice));
      table.appendChild(tr);
    }
    wrap.appendChild(table);
    wrap.appendChild(el('p', 'note',
      '光っているのが、いま狙っているスロットの角と辺です。手を動かすとこの表もその場で変わります。'));
    return wrap;
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
    panel.appendChild(moveChips());
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

  function moveChips() {
    const list = el('div', 'alg-list');
    solution.forEach((m, i) => {
      list.appendChild(el('span', 'move' + (i < step ? ' past' : i === step ? ' next' : ''), m));
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
    const unknown = moves.filter(m => !Object.prototype.hasOwnProperty.call(Cube._MOVES, m));
    if (unknown.length) {
      err.textContent = `使えない記号があります: ${unknown.join(' ')}（U D L R F B に ' か 2 を付けた形）`;
      err.hidden = false;
      return;
    }
    mutate(() => cube.applySequence(moves));
    $('seq').value = '';
  }

  function setMode(next) {
    mode = next;
    $('tab-cfop').classList.toggle('active', mode === 'cfop');
    $('tab-shortest').classList.toggle('active', mode === 'shortest');
    refresh();
  }

  buildPalette();
  buildMoveButtons();

  $('edit-toggle').onclick = () => {
    const on = $('palette').hidden;
    $('palette').hidden = !on;
    $('paint-hint').hidden = !on;
    $('edit-toggle').classList.toggle('on', on);
    $('edit-toggle').textContent = on ? '塗るのをやめる' : '色を塗る';
    paint = on ? Net.COLOURS[0] : null;
    if (on) $('palette').children[0].classList.add('picked');
    refresh();
  };
  $('scramble').onclick = () => mutate(() => cube.scramble(SCRAMBLE_LEN));
  $('reset').onclick = () => mutate(() => cube.reset());
  $('undo').onclick = undo;
  $('apply-seq').onclick = applySequence;
  $('seq').onkeydown = (ev) => { if (ev.key === 'Enter') applySequence(); };
  $('tab-cfop').onclick = () => setMode('cfop');
  $('tab-shortest').onclick = () => setMode('shortest');

  refresh();
})();
