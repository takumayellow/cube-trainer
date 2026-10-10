/**
 * mobile/shortest.js — 「最短」: the two-phase solution, played back a move at a time
 *
 * Not a lesson: the answer a computer finds, usually around 20 moves, for when
 * the point is to see how short it can be or to just get the cube back. The
 * solution is fixed when it is found; stepping through it, jumping to any move
 * or letting it play on its own all put the cube at that point of it, so the
 * net — or the cube in hand, turned along with it — always matches the move
 * shown next.
 *
 * Any other change to the cube makes the solution stale, and it is searched for
 * again the next time this tab is opened.
 *
 * Depends on: store.js, ui.js, two-phase.js, cubie.js, move-words.js
 */

(function () {
  'use strict';

  const { el, button, header, faceNet, moveChips, wholeFace } = UI;

  const BUDGET_MS = 8000;
  const AUTO_MS = 700;

  let root = null;
  let sol = null;            // { start, moves, ms } — null when not searched, moves null when none found
  let at = 0;                // moves of the solution already turned
  let known = -1;            // Store.version the solution and `at` belong to
  let own = false;
  let busy = false;
  let auto = null;
  let generation = 0;

  function solve() {
    stopAuto();
    sol = null;
    at = 0;
    const state = Store.state;
    if (Store.isSolved() || !Cubie.validate(state).ok) { known = Store.version; draw(); return; }
    busy = true;
    draw();
    const mine = ++generation;
    // Let the "searching" frame paint before the search takes the thread.
    setTimeout(() => {
      if (mine !== generation) return;
      const t0 = performance.now();
      let moves = null;
      try { moves = TwoPhaseSolver.solve(state, { budgetMs: BUDGET_MS }); } catch (e) { console.error(e); }
      sol = { start: state, moves, ms: Math.round(performance.now() - t0) };
      busy = false;
      known = Store.version;
      draw();
    }, 30);
  }

  /** Put the cube at move `k` of the solution. */
  function jump(k) {
    if (!sol || !sol.moves) return;
    const target = Math.max(0, Math.min(sol.moves.length, k));
    if (target === at) return;
    const cube = new Cube();
    cube.setState(sol.start);
    cube.applySequence(sol.moves.slice(0, target));
    own = true;
    try { Store.setState(cube.getState(), 'shortest'); } finally { own = false; }
    at = target;
    known = Store.version;
    if (at >= sol.moves.length) stopAuto();
    draw();
  }

  const forward = () => jump(at + 1);
  const backward = () => jump(at - 1);

  function toggleAuto() {
    if (auto) { stopAuto(); draw(); return; }
    if (!sol || !sol.moves) return;
    if (at >= sol.moves.length) jump(0);
    auto = setInterval(forward, AUTO_MS);
    draw();
  }

  function stopAuto() {
    clearInterval(auto);
    auto = null;
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  function draw() {
    if (!root) return;
    root.textContent = '';
    const state = Store.state;

    if (busy) {
      root.appendChild(header('最短手順', '2 フェーズ法 · 探索中'));
      root.appendChild(faceNet(state, { size: 60 }));
      root.appendChild(el('p', 'goal center', '最短手順を探しています…'));
      return;
    }

    if (!sol) {
      const verdict = Cubie.validate(state);
      root.appendChild(header('最短手順', '2 フェーズ法'));
      root.appendChild(faceNet(state, { size: 60 }));
      const card = el('div', 'card');
      card.appendChild(el('p', verdict.ok ? null : 'error', verdict.ok
        ? 'そろっています。崩すと、ここに最短の戻し方が出ます。'
        : `この色の並びは実物では作れません: ${verdict.reason}`));
      card.appendChild(button('スクランブル', 'primary', () => Store.scramble()));
      root.appendChild(card);
      return;
    }

    if (!sol.moves) {
      root.appendChild(header('最短手順', `2 フェーズ法 · ${sol.ms} ms で見つからず`));
      root.appendChild(faceNet(state, { size: 60 }));
      const card = el('div', 'card');
      card.appendChild(el('p', null, '時間内に手順が見つかりませんでした。'));
      card.appendChild(button('もう一度探す', 'primary', solve));
      root.appendChild(card);
      return;
    }

    const total = sol.moves.length;
    const done = at >= total;
    const next = done ? null : sol.moves[at];
    root.appendChild(header('最短手順', `2 フェーズ法 · ${total} 手 · 探索 ${sol.ms} ms`));
    root.appendChild(faceNet(state, { size: 60, highlight: next ? wholeFace(next[0]) : [] }));

    const tap = el('button', 'bigmove');
    tap.type = 'button';
    tap.id = 'short-next';
    tap.disabled = done;
    const words = el('span', 'bigtext');
    if (done) {
      tap.append(el('span', 'bigbox done', '✓'));
      words.append(el('span', 'count', `${total} 手でそろいました`),
                   el('span', 'note', '「最初から」でもう一度見られます'));
    } else {
      tap.append(el('span', 'bigbox', next));
      words.append(el('span', 'count', `${at + 1} / ${total} 手目`),
                   el('span', 'desc', MoveWords.describe(next)),
                   el('span', 'note', 'タップで 1 手進む'));
    }
    tap.appendChild(words);
    tap.addEventListener('click', forward);
    root.appendChild(tap);

    const bar = el('div', 'progress');
    const fill = el('i');
    fill.style.width = `${(at / total) * 100}%`;
    bar.appendChild(fill);
    root.appendChild(bar);

    root.appendChild(moveChips(sol.moves, at, i => { stopAuto(); jump(i); }));
    root.appendChild(el('p', 'note', '手順のどこをタップしても、その手の直前の状態に移ります。'));

    const row = el('div', 'btns three');
    const prev = button('戻る', null, () => { stopAuto(); backward(); });
    prev.disabled = at === 0;
    const play = button(auto ? '一時停止' : done ? '最初から' : '自動で進める', 'primary', toggleAuto);
    play.id = 'short-auto';
    const step = button('進める', null, () => { stopAuto(); forward(); });
    step.disabled = done;
    row.append(prev, play, step);
    root.appendChild(row);
  }

  // ── tab life cycle ────────────────────────────────────────────────────────

  window.Shortest = {
    mount(node) {
      root = node;
      if (known !== Store.version || (!sol && !busy)) solve();
      else draw();
    },
    unmount() {
      stopAuto();
      root = null;
      // A search still waiting for its turn would block whatever tab is next
      // for up to BUDGET_MS. Drop it; mount() searches again.
      if (busy) { generation += 1; busy = false; }
    },
    onChange() {
      if (own) return;
      stopAuto();
      sol = null;              // another tab turned the cube: this solution no longer applies
      if (root) solve();
    },
    onKey(ev) {
      if (ev.key === ' ' || ev.key === 'ArrowRight') { ev.preventDefault(); stopAuto(); forward(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stopAuto(); backward(); }
    },
  };
})();
