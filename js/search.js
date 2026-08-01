/**
 * search.js — "what do I turn, right now"
 *
 * The cross and F2L have no algorithm sheet worth memorising: you look at where
 * the piece is and work it out. So this works it out — a depth-first search over
 * turns, deepening one move at a time, so the first answer it finds is the
 * shortest one.
 *
 * Two things keep it fast enough to run on every redraw. The goal is always one
 * piece (or one pair) rather than the whole cube, and F2L is searched with only
 * the three faces that slot lives on, which is what a human uses anyway.
 *
 * Pieces, not stickers: turning a facelet state is 54 writes, turning a piece
 * state is 20. Move tables are derived from cube.js at first use, so there is
 * only ever one definition of what a turn does.
 *
 * Depends on: cube.js, cubie.js
 */

(function () {
  'use strict';

  const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
  const ALL_MOVES = FACES.flatMap(f => ['', "'", '2'].map(s => f + s));

  // Turns of the same axis commute, so R L and L R are the same sequence twice.
  // Allowing only one order of each pair cuts the branching factor for free.
  const AXIS = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
  const RANK = { U: 0, D: 1, L: 0, R: 1, F: 0, B: 1 };

  let TABLES = null;

  /** What each turn does, as piece permutations. Built once, from cube.js. */
  function tables() {
    if (TABLES) return TABLES;
    TABLES = {};
    for (const m of ALL_MOVES) {
      const cube = new Cube();
      cube.applyMove(m);
      const p = Cubie.fromFacelets(cube.getState());
      TABLES[m] = { cp: Array.from(p.cp), co: Array.from(p.co), ep: Array.from(p.ep), eo: Array.from(p.eo) };
    }
    return TABLES;
  }

  const blank = () => ({
    cp: new Uint8Array(8), co: new Uint8Array(8),
    ep: new Uint8Array(12), eo: new Uint8Array(12),
  });

  function fromState(state) {
    const p = Cubie.fromFacelets(state);
    return { cp: p.cp, co: p.co, ep: p.ep, eo: p.eo };
  }

  /** Write `src` turned by `m` into `dst`; `dst` must not be `src`. */
  function applyInto(src, m, dst) {
    const t = tables()[m];
    if (!t) throw new Error('Unknown move: ' + m);
    for (let i = 0; i < 8; i++) {
      const j = t.cp[i];
      dst.cp[i] = src.cp[j];
      dst.co[i] = (src.co[j] + t.co[i]) % 3;
    }
    for (let i = 0; i < 12; i++) {
      const j = t.ep[i];
      dst.ep[i] = src.ep[j];
      dst.eo[i] = (src.eo[j] + t.eo[i]) % 2;
    }
    return dst;
  }

  function apply(st, m) {
    return applyInto(st, m, blank());
  }

  function applySequence(st, moves) {
    let cur = st;
    for (const m of moves) cur = apply(cur, m);
    return cur;
  }

  // ── goal tests ────────────────────────────────────────────────────────────

  const cornersHome = (st, slots) => slots.every(i => st.cp[i] === i && st.co[i] === 0);
  const edgesHome   = (st, slots) => slots.every(i => st.ep[i] === i && st.eo[i] === 0);
  const cornerSlot  = (st, piece) => Array.prototype.indexOf.call(st.cp, piece);
  const edgeSlot    = (st, piece) => Array.prototype.indexOf.call(st.ep, piece);

  /** Corner slots 0-3 and edge slots 0-3 are the U layer. */
  const cornerInU = (st, piece) => cornerSlot(st, piece) < 4;
  const edgeInU   = (st, piece) => edgeSlot(st, piece) < 4;

  const isSolved = st => cornersHome(st, [0, 1, 2, 3, 4, 5, 6, 7])
                      && edgesHome(st, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  // ── the search ────────────────────────────────────────────────────────────

  const TIME_CHECK_MASK = 8191;   // how often to look at the clock

  /**
   * Shortest sequence from `start` to a state `goal` accepts.
   *
   * @param {object} start piece state
   * @param {{moves?: string[], maxDepth?: number, budgetMs?: number,
   *          goal: (st: object) => boolean}} opts
   * @returns {{moves: string[]|null, timedOut: boolean}} `moves` is null when no
   *   sequence exists within maxDepth — `timedOut` says whether that is a proof
   *   (false) or just where we ran out of time (true).
   */
  function find(start, opts) {
    const moves = opts.moves || ALL_MOVES;
    const maxDepth = opts.maxDepth == null ? 8 : opts.maxDepth;
    const goal = opts.goal;
    const deadline = Date.now() + (opts.budgetMs == null ? 300 : opts.budgetMs);

    if (goal(start)) return { moves: [], timedOut: false };

    const scratch = [];
    for (let d = 0; d <= maxDepth; d++) scratch.push(blank());
    const path = new Array(maxDepth);
    let nodes = 0;
    let expired = false;
    let found = null;

    function step(st, depth, limit, prevFace) {
      for (const m of moves) {
        const face = m[0];
        if (face === prevFace) continue;
        if (prevFace && AXIS[face] === AXIS[prevFace] && RANK[face] < RANK[prevFace]) continue;

        if ((nodes++ & TIME_CHECK_MASK) === 0 && Date.now() > deadline) {
          expired = true;
          return false;
        }

        const next = applyInto(st, m, scratch[depth]);
        path[depth] = m;

        if (depth + 1 === limit) {
          if (goal(next)) { found = path.slice(0, limit); return true; }
        } else if (step(next, depth + 1, limit, face)) {
          return true;
        }
        if (expired) return false;
      }
      return false;
    }

    for (let limit = 1; limit <= maxDepth; limit++) {
      if (step(start, 0, limit, null)) return { moves: found, timedOut: false };
      if (expired) return { moves: null, timedOut: true };
    }
    return { moves: null, timedOut: false };
  }

  window.Search = {
    ALL_MOVES, tables, fromState, apply, applyInto, applySequence, find,
    cornersHome, edgesHome, cornerSlot, edgeSlot, cornerInU, edgeInU, isSolved,
  };
})();
