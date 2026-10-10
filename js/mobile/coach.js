/**
 * mobile/coach.js — 「次の一手」: one job at a time, one turn at a time
 *
 * The PC screen hands over a whole sequence. On a phone, held in one hand with
 * the cube in the other, that is too much: here the job is fixed while it is
 * being done and walked through a move at a time — tap after each turn, and
 * the cube on screen turns with you.
 *
 * How much is given away is the hint level: L0 says only where to look, L1
 * lights the pieces, L2 says how to recognise the case, L3 gives the moves.
 * Below L3 the moves are one tap away for this job only, so peeking does not
 * quietly turn the training wheels back on for good.
 *
 * Without a real cube, 「画面で回す」 swaps the net for the 3D cube and adds a
 * move pad. Pressing the move the job asks for counts as doing it; any other
 * move changes the cube, and the job is worked out again for what is there.
 *
 * Depends on: store.js, ui.js, step.js, cfop.js, glossary.js, cube3d.js, move-words.js
 */

(function () {
  'use strict';

  const { el, button, header, faceNet, moveChips, wholeFace } = UI;

  const LEVELS = [['L0', '場所'], ['L1', '駒'], ['L2', '見分け'], ['L3', '手順']];
  const PAD_FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
  const PAD_SUFFIX = ['', "'", '2'];
  const RETHINK_MS = 250;      // pad presses come in bursts; judge once they stop

  let root = null;
  let job = null;              // the job being done, fixed until it is finished
  let pos = 0;                 // moves of `job` already turned
  let peek = false;            // moves shown below L3, for this job only
  let invalid = null;          // reason the cube on screen cannot exist
  let searching = false;
  let known = -1;              // Store.version the picture belongs to
  let generation = 0;
  let timer = null;
  let own = false;             // inside a change this tab made itself
  let sim = null;              // { box, view } — the 3D cube, kept so its angle survives redraws

  // ── judging ───────────────────────────────────────────────────────────────

  function judge(delay) {
    clearTimeout(timer);
    const mine = ++generation;
    job = null;
    pos = 0;
    peek = false;
    invalid = null;
    searching = true;
    Store.setCurrent(null);
    draw();
    // The search can take a moment; let the "searching" frame paint first.
    timer = setTimeout(() => {
      if (mine !== generation) return;
      const state = Store.state;
      const verdict = Cubie.validate(state);
      if (!verdict.ok) {
        invalid = verdict.reason;
      } else {
        try { job = Step.next(state); } catch (err) { console.error(err); invalid = '手順を出せませんでした'; }
      }
      searching = false;
      known = Store.version;
      Store.setCurrent(techniqueOf(job));
      if (root) draw();
    }, delay || 0);
  }

  /** The named technique a job uses, in the shape the dictionary keeps. */
  function techniqueOf(j) {
    if (!j || j.stage === 'solved' || j.stuck || !j.moves.length) return null;
    const moves = j.moves.join(' ');
    if (j.name) {
      return { stage: j.stage, name: j.name, jp: j.jp || '', does: j.does || '', when: j.why || '', moves };
    }
    const name = j.stage === 'cross' ? 'クロスの完成条件'
      : j.partial ? 'スロットから出す' : 'ペア挿入（基本形）';
    const entry = Glossary.ENTRIES.find(e => e.name === name) || {};
    return { stage: j.stage, name, jp: entry.jp || '', does: entry.does || '', when: entry.when || '', moves };
  }

  /** A change made here: the picture is already right, so no re-judging. */
  function ownChange(fn) {
    own = true;
    try { fn(); } finally { own = false; }
    known = Store.version;
    draw();
  }

  const finished = () => !!job && job.moves.length > 0 && pos >= job.moves.length;

  function advance() {
    if (!job || job.stuck || finished()) return;
    const move = job.moves[pos];
    ownChange(() => {
      pos += 1;
      Store.apply(move, 'coach');
      if (finished()) Store.record(techniqueOf(job));
    });
  }

  function back() {
    if (pos > 0 && !finished()) {
      ownChange(() => { pos -= 1; Store.undo(); });
    } else {
      // Taking back the move that finished a job takes back the finish too,
      // or doing it again would count the technique twice.
      if (finished()) Store.unrecord(techniqueOf(job));
      Store.undo();            // across jobs: the listener re-judges
    }
  }

  /** A pad press. The asked-for move is the job progressing; anything else is a new cube. */
  function turn(move) {
    if (job && !job.stuck && !finished() && job.moves[pos] === move) advance();
    else Store.apply(move, 'pad');
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  function draw() {
    if (!root) return;
    const prefs = Store.prefs();
    const state = Store.state;
    root.textContent = '';

    root.appendChild(header('次の一手', '白を下・緑を手前',
      [button('崩す', 'small', () => Store.scramble())]));
    root.appendChild(modeSwitch(prefs.mode));

    const mix = Store.scrambleMoves();
    if (mix) root.appendChild(scrambleCard(mix));

    if (invalid) {
      root.appendChild(phases(null));
      const card = el('div', 'card');
      card.appendChild(el('p', 'error', `この色の並びは実物のキューブでは作れません: ${invalid}`));
      card.appendChild(el('p', 'note', '読み取りか塗り分けを直すと、ここに手順が出ます。'));
      root.appendChild(card);
      root.appendChild(actions());
      return;
    }

    root.appendChild(phases(state));

    if (searching || !job) {
      root.appendChild(el('p', 'phase-label', '判定中'));
      root.appendChild(el('p', 'goal', '手を探しています…'));
      root.appendChild(cubeView(state, [], prefs));
      return;
    }

    if (job.stage === 'solved' && !finished()) {
      root.appendChild(solvedCard());
      root.appendChild(cubeView(state, [], prefs));
      if (prefs.mode === 'sim') root.appendChild(pad(null));
      root.appendChild(footLink());
      return;
    }

    root.appendChild(el('p', 'phase-label', job.title));
    root.appendChild(el('p', 'goal', job.goal));
    root.appendChild(cubeView(state, highlight(prefs.level), prefs));
    // On screen the pad is the hands, so it sits right under the cube it turns.
    if (prefs.mode === 'sim') root.appendChild(pad(prefs.level >= 3 || peek ? job.moves[pos] : null));
    root.appendChild(levelSwitch(prefs.level));
    root.appendChild(hintCard(prefs.level));

    const tech = Store.current();
    if (tech) root.appendChild(techniqueCard(tech));
    root.appendChild(actions());
    root.appendChild(footLink());
  }

  function highlight(level) {
    if (level < 1 || finished()) return [];
    return pos === 0 ? job.highlight : wholeFace(job.moves[pos][0]);
  }

  function modeSwitch(mode) {
    const seg = el('div', 'seg two');
    for (const [key, label] of [['real', '実物で回す'], ['sim', '画面で回す']]) {
      const b = el('button', mode === key ? 'on' : '', label);
      b.type = 'button';
      b.dataset.mode = key;
      b.addEventListener('click', () => { Store.setPrefs({ mode: key }); draw(); });
      seg.appendChild(b);
    }
    return seg;
  }

  function scrambleCard(moves) {
    const card = el('div', 'card scramble');
    card.appendChild(el('p', 'card-title', `崩した手順（${moves.length} 手）`));
    card.appendChild(moveChips(moves, -1));
    card.appendChild(el('p', 'note',
      'そろったキューブを白を下・緑を手前に持ち、この順に回すと画面と同じ状態になります。'));
    return card;
  }

  function phases(state) {
    const row = el('div', 'phases');
    let report = null;
    if (state) { try { report = CFOP.analyse(state); } catch { report = null; } }
    const stages = report ? report.stages
      : [{ key: 'cross', label: 'クロス' }, { key: 'f2l', label: 'F2L', slots: [] },
         { key: 'oll', label: 'OLL' }, { key: 'pll', label: 'PLL' }];
    for (const s of stages) {
      const chip = el('div', 'phase' + (s.done ? ' done' : '')
                              + (report && s.key === report.current ? ' current' : ''));
      chip.appendChild(el('span', 'phase-name', s.key === 'cross' ? 'Cross' : s.label));
      if (s.key === 'f2l') {
        const dots = el('span', 'dots');
        for (const slot of s.slots || []) dots.appendChild(el('i', slot.done ? 'filled' : ''));
        chip.appendChild(dots);
      } else {
        chip.appendChild(el('span', 'mark', s.done ? '✓' : '—'));
      }
      row.appendChild(chip);
    }
    return row;
  }

  function cubeView(state, lit, prefs) {
    if (prefs.mode !== 'sim') return faceNet(state, { size: 78, highlight: lit, dim: true });
    if (!sim) {
      const box = el('div', 'sim-view');
      const size = Math.max(120, Math.min(180, Math.floor((window.innerWidth - 120) / 1.6)));
      sim = { box, view: Cube3D.create(box, { size }) };
    }
    sim.view.render(state, { highlight: lit });
    const wrap = el('div', 'sim-wrap');
    wrap.append(sim.box, el('p', 'note center', 'ドラッグで向きを変えられます'));
    return wrap;
  }

  function levelSwitch(level) {
    const seg = el('div', 'seg levels');
    LEVELS.forEach(([code, label], i) => {
      const b = el('button', i === level ? 'on' : '');
      b.type = 'button';
      b.dataset.level = String(i);
      b.append(el('b', null, code), el('span', null, label));
      b.addEventListener('click', () => { Store.setPrefs({ level: i }); draw(); });
      seg.appendChild(b);
    });
    return seg;
  }

  function hintCard(level) {
    const card = el('div', 'card hint');
    if (job.stuck) {
      card.appendChild(el('p', 'error', job.why));
      card.appendChild(el('p', 'note', '上段を何回か回して形を変えてから、もう一度判定してください。'));
      return card;
    }
    const rows = el('dl', 'kv');
    rows.append(el('dt', null, '場所'), el('dd', null, job.where || job.title));
    if (level >= 2) rows.append(el('dt', null, '見分け'), el('dd', null, job.why));
    card.appendChild(rows);

    if (finished()) card.appendChild(finishedRow());
    else if (level >= 3 || peek) card.appendChild(stepSection());
    else {
      const more = button(`手順を見る（${job.moves.length} 手）`, 'ghost', () => { peek = true; draw(); });
      more.classList.add('peek');
      card.appendChild(more);
    }
    return card;
  }

  function stepSection() {
    const move = job.moves[pos];
    const box = el('div', 'step');
    const tap = el('button', 'bigmove');
    tap.type = 'button';
    tap.setAttribute('aria-label', `${move} を回したら押す`);
    const big = el('span', 'bigbox', move);
    const words = el('span', 'bigtext');
    words.append(
      el('span', 'count', `${pos + 1} / ${job.moves.length} 手目`),
      el('span', 'desc', MoveWords.describe(move)),
      el('span', 'note', '回したら画面をタップ'));
    tap.append(big, words);
    tap.addEventListener('click', advance);
    box.appendChild(tap);
    box.appendChild(moveChips(job.moves, pos));
    if (job.partial) {
      box.appendChild(el('p', 'note', 'これは下ごしらえです。回し終えると、続きの手順が出ます。'));
    }
    return box;
  }

  function finishedRow() {
    const row = el('div', 'finished');
    row.appendChild(el('span', null, `✓ ${job.goal}`));
    row.appendChild(button('次の判定へ', 'small', () => judge()));
    return row;
  }

  function techniqueCard(tech) {
    const card = el('div', 'card tech');
    const text = el('div');
    text.appendChild(el('span', 'card-label', 'テクニック'));
    text.appendChild(el('strong', null, tech.name));
    if (tech.jp) text.appendChild(el('span', 'jp', tech.jp));
    card.appendChild(text);
    card.appendChild(button('辞典で読む', 'link', () => Main.go('gloss', { open: tech.name })));
    return card;
  }

  function solvedCard() {
    const card = el('div', 'card done');
    const count = Store.used().length;
    if (count) {
      card.appendChild(el('p', 'card-title', '完成しました'));
      card.appendChild(el('p', null, `今回使ったテクニック ${count} つは「辞典」に残っています。`));
      const row = el('div', 'btns');
      row.append(button('もう一度スクランブル', 'primary', () => Store.scramble()),
                 button('辞典を見る', null, () => Main.go('gloss')));
      card.appendChild(row);
    } else {
      card.appendChild(el('p', 'card-title', 'はじめる'));
      card.appendChild(el('p', null,
        '手元のキューブを読み取るか、画面のキューブを崩して始めます。'
        + 'キューブが手元になければ「画面で回す」で、画面の中だけで解けます。'));
      const row = el('div', 'btns');
      row.append(button('スクランブル', 'primary', () => Store.scramble()),
                 button('読み取る', null, () => Main.go('scan')));
      card.appendChild(row);
    }
    return card;
  }

  function pad(next) {
    const grid = el('div', 'pad');
    for (const suffix of PAD_SUFFIX) {
      for (const face of PAD_FACES) {
        const move = face + suffix;
        const b = button(move, move === next ? 'next' : null, () => turn(move));
        b.dataset.move = move;
        b.title = MoveWords.describe(move);
        grid.appendChild(b);
      }
    }
    return grid;
  }

  function actions() {
    const row = el('div', 'btns');
    const undo = button('1手戻す', null, back);
    undo.disabled = !Store.canUndo();
    row.append(undo, button('撮り直して判定', null, () => Main.go('scan')));
    return row;
  }

  function footLink() {
    const a = el('a', 'foot-link', 'PC 版で開く（展開図の塗り分け・手順の入力）');
    a.href = 'index.html';
    return a;
  }

  // ── tab life cycle ────────────────────────────────────────────────────────

  window.Coach = {
    mount(node) {
      root = node;
      if (known !== Store.version || (!job && !invalid && !searching)) judge();
      else draw();
    },
    unmount() {
      root = null;
      // A pending judgement would still write the shared "current" technique.
      if (searching) { clearTimeout(timer); generation += 1; searching = false; }
    },
    onChange(source) {
      if (own) return;
      if (!root) return;               // judged again on the next mount
      judge(source === 'pad' ? RETHINK_MS : 0);
    },
    onKey(ev) {
      if (ev.key === ' ' || ev.key === 'ArrowRight') { ev.preventDefault(); advance(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); back(); }
    },
  };
})();
