/**
 * track.js — follow a real cube through the camera while it is being solved.
 *
 * The camera sees one face at a time. Every steady view is matched against a
 * small set of guesses about the cube (a beam): the cube as last believed,
 * and the cube after each one- and two-move turn of it. Guesses that keep
 * explaining what the camera sees survive; the cheapest is "the cube now".
 * A turn the plan did not ask for is simply a different guess winning, so a
 * wrong turn costs nothing but a new plan — the player never has to undo it
 * or start over.
 *
 * Also works out where to draw the turn on the picture: which row or column
 * moves and which way, or which way to rotate the whole cube to bring the
 * turning layer into view.
 *
 * Depends on: window.Cube, window.Cubie, window.Scan.
 */
'use strict';

(function () {
  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
  const QUARTER = [6, 3, 0, 7, 4, 1, 8, 5, 2];
  const MOVES = Object.keys(Cube._MOVES);

  const BEAM = 24;            // guesses kept between views
  const MOVE_COST = 3.0;      // a turn nobody asked for must explain the view this much better
  const PLANNED_COST = 1.0;   // the turn the plan asked for is the likely one
  const LOST_COST = 4.0;      // per sticker, on average: no guess explains the view
  const DECAY = 0.7;          // older views count for less than the latest
  // The face in front stays in front while its layer turns, so a turned view of
  // it is far more often a turn of that layer than the whole cube spun in the hand.
  const SPIN_COST = 4.0;
  const PLANNED_RUN = 6;      // planned moves in a row the tracker also tries

  // ── geometry ──────────────────────────────────────────────────────────────

  /** perm[q][i]: which camera position shows face index i when the face is seen turned q quarters. */
  const TURN = [0, 1, 2, 3].map(q => {
    let idx = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let k = 0; k < q; k++) idx = QUARTER.map(i => idx[i]);
    return idx;
  });

  const apply = (state, moves) => {
    const c = new Cube();
    c._state = c._clone(state);
    for (const m of moves) c.applyMove(m);
    return c._state;
  };
  const keyOf = s => FACES.map(f => s[f].join('')).join('');

  /** Where each sticker goes under a move: dest[move][face][i] = [face, i]. */
  const DEST = {};
  for (const m of MOVES) {
    const ids = {};
    FACES.forEach((f, k) => { ids[f] = Array.from({ length: 9 }, (_, i) => k * 9 + i); });
    const after = apply(ids, [m]);
    const dest = {};
    FACES.forEach(f => { dest[f] = new Array(9); });
    FACES.forEach(f => after[f].forEach((id, i) => {
      dest[FACES[Math.floor(id / 9)]][id % 9] = [f, i];
    }));
    DEST[m] = dest;
  }

  /** The middle sticker of face `f` along the edge it shares with `g`: 1 top, 3 left, 5 right, 7 bottom. */
  function edgeToward(f, g) {
    for (const pair of Cubie.EDGE_FACELETS) {
      if (pair[0][0] === f && pair[1][0] === g) return pair[0][1];
      if (pair[1][0] === f && pair[0][0] === g) return pair[1][1];
    }
    return -1;
  }

  const SIDE = { 1: 'up', 3: 'left', 5: 'right', 7: 'down' };

  /** Which way the camera sees face `f`'s edge toward `g`, when the face shows turned `quarters`. */
  function screenSide(f, g, quarters) {
    const i = edgeToward(f, g);
    return i < 0 ? null : SIDE[TURN[quarters][i]];
  }

  /**
   * How to draw `move` on face `face`, seen turned `quarters` on camera.
   * @returns {{kind: 'spin', dir: 'cw'|'ccw', twice: boolean}
   *   | {kind: 'slide', axis: 'row'|'col', index: number, toward: 'up'|'down'|'left'|'right', twice: boolean}
   *   | {kind: 'show', toward: string, face: string}} `show` means the
   *   turning layer cannot be seen: rotate the whole cube so `toward` comes
   *   to face the camera, then the move can be drawn.
   * With `state` (the cube as believed), a turn that would leave this face
   * looking the same — the top of a cube whose top is one colour, say — is
   * also `show`: the camera could not tell it happened.
   */
  function arrowFor(move, face, quarters, state) {
    const layer = move[0];
    const twice = move.endsWith('2');
    if (state && layer !== OPPOSITE[face] && unseen(state, move, face)) {
      const sides = FACES.filter(g => g !== face && g !== OPPOSITE[face] && !unseen(state, move, g));
      const side = sides.find(g => screenSide(face, g, quarters) === 'up') || sides[0];
      if (side) return { kind: 'show', toward: screenSide(face, side, quarters), face: side };
    }
    if (layer === face) {
      return { kind: 'spin', dir: move.endsWith("'") ? 'ccw' : 'cw', twice };
    }
    if (layer === OPPOSITE[face]) {
      // Bring a side into view; any neighbour works, the one on top reads naturally.
      const side = FACES.find(g => g !== face && g !== layer && screenSide(face, g, quarters) === 'up')
        || FACES.find(g => g !== face && g !== layer);
      return { kind: 'show', toward: screenSide(face, side, quarters), face: side };
    }
    // The layer's stickers on this face leave across the edge toward their new face.
    const dest = DEST[twice ? layer : move][face];
    const moving = [];
    let to = null;
    for (let i = 0; i < 9; i++) {
      if (dest[i][0] !== face) { moving.push(TURN[quarters][i]); to = dest[i][0]; }
    }
    const rows = new Set(moving.map(p => Math.floor(p / 3)));
    const cols = new Set(moving.map(p => p % 3));
    const axis = rows.size === 1 ? 'row' : 'col';
    const index = axis === 'row' ? [...rows][0] : [...cols][0];
    const toward = screenSide(face, to, quarters);
    return { kind: 'slide', axis, index, toward, twice };
  }

  /** True when `move` leaves face `f` of `state` looking exactly as it did. */
  function unseen(state, move, f) {
    const after = apply(state, [move]);
    return after[f].every((c, i) => c === state[f][i]);
  }

  /** Which way to rotate the whole cube so that face `target` comes to the camera. */
  function showFace(face, quarters, target) {
    if (target === face) return null;
    if (target === OPPOSITE[face]) return { toward: 'flip' };
    return { toward: screenSide(face, target, quarters) };
  }

  // ── matching ──────────────────────────────────────────────────────────────

  /**
   * Turn camera samples into per-sticker costs, rebased so the best colour of
   * each sticker costs nothing. Columns follow LETTER_ORDER.
   */
  function viewCosts(rgb9, palette) {
    const raw = Scan.costRows(rgb9, palette);
    const order = Scan.LETTERS.map(c => palette.names.indexOf(c));
    return raw.map(row => {
      const lo = Math.min(...row);
      return order.map(k => row[k] - lo);
    });
  }

  const LETTER_INDEX = {};
  Scan.LETTERS.forEach((c, k) => { LETTER_INDEX[c] = k; });

  /**
   * The face a view shows (from its centre) and its cheapest turn for `state`.
   * `held` is the turn the same face was last seen at, if it never left view.
   */
  function fit(state, costs, held) {
    let centre = 0;
    for (let k = 1; k < 6; k++) if (costs[4][k] < costs[4][centre]) centre = k;
    const face = Scan.FACE_OF[Scan.LETTERS[centre]];
    let best = null;
    for (let q = 0; q < 4; q++) {
      let total = 0;
      for (let i = 0; i < 9; i++) total += costs[TURN[q][i]][LETTER_INDEX[state[face][i]]];
      if (held && held.face === face && held.quarters !== q) total += SPIN_COST;
      if (!best || total < best.cost) best = { face, quarters: q, cost: total };
    }
    return best;
  }

  /**
   * Make a tracker.
   * @param {object} state the cube as read
   * @param {object} palette from Scan.toState / toStateAnyOrder
   */
  function create(state, palette) {
    let beam = [{ state, key: keyOf(state), score: 0, moves: [] }];
    let lastQuarters = {};
    let held = null;
    let plan = [];
    let doubt = null;          // key of an unplanned guess waiting for a second view

    function expand(planned) {
      const out = new Map();
      const add = (s, score, moves) => {
        const k = keyOf(s);
        const old = out.get(k);
        if (!old || score < old.score) out.set(k, { state: s, key: k, score, moves });
      };
      for (const h of beam) {
        add(h.state, h.score * DECAY, []);
        for (const m of MOVES) {
          const s1 = apply(h.state, [m]);
          const c1 = m === planned[0] ? PLANNED_COST : MOVE_COST;
          add(s1, h.score * DECAY + c1, [m]);
          for (const m2 of MOVES) {
            if (m2[0] === m[0]) continue;
            const c2 = m === planned[0] && m2 === planned[1] ? PLANNED_COST : MOVE_COST;
            add(apply(s1, [m2]), h.score * DECAY + c1 + c2, [m, m2]);
          }
        }
        // A player who knows the way turns several planned moves before showing the cube again.
        let s = h.state;
        for (let k = 0; k < Math.min(planned.length, PLANNED_RUN); k++) {
          s = apply(s, [planned[k]]);
          if (k >= 2) add(s, h.score * DECAY + (k + 1) * PLANNED_COST, planned.slice(0, k + 1));
        }
        // ... or got the first of them wrong and carried on with the rest.
        for (const m of MOVES) {
          if (m === planned[0]) continue;
          let t = apply(h.state, [m]);
          for (let k = 1; k < Math.min(planned.length, PLANNED_RUN); k++) {
            t = apply(t, [planned[k]]);
            if (k >= 2) add(t, h.score * DECAY + MOVE_COST + k * PLANNED_COST, [m].concat(planned.slice(1, k + 1)));
          }
        }
      }
      return [...out.values()];
    }

    return {
      get state() { return beam[0].state; },
      get palette() { return palette; },
      /** The moves the player is expected to make next (first one matters most). */
      setPlan(moves) { plan = moves.slice(); },

      /**
       * Take one steady view of a face.
       * @param {Array<[number, number, number]>} rgb9 nine colours as the camera sees them
       * @returns {{face: string, quarters: number, moves: string[], lost: boolean}}
       *   `moves` is what the player turned since the last view, as best the
       *   tracker can tell; `lost` means nothing near the believed cube looks
       *   like this, and the player should show the cube's faces again;
       *   `doubt` means the view needs turns the plan did not ask for, so nothing
       *   is taken from it and the next view decides.
       */
      observe(rgb9) {
        const costs = viewCosts(rgb9, palette);
        const candidates = expand(plan);
        for (const c of candidates) {
          const f = fit(c.state, costs, held);
          c.view = f;
          c.score += f.cost;
        }
        candidates.sort((a, b) => a.score - b.score);
        const top = candidates[0];
        const lost = top.view.cost / 9 > LOST_COST;
        if (lost) {
          return { face: top.view.face, quarters: lastQuarters[top.view.face] || 0, moves: [], lost: true };
        }
        // A turn the plan did not ask for, seen in a single view, may be a
        // washed-out or half-turned view rather than a turn: change nothing and
        // look once more. Only one view in a row is held back, so a player who
        // keeps turning is never left behind.
        const planned = top.moves.every((m, k) => m === plan[k]);
        if (!planned && doubt === null) {
          doubt = top.key;
          return { face: top.view.face, quarters: top.view.quarters, moves: [], lost: false, doubt: true };
        }
        doubt = null;
        const face = top.view.face;
        // A face of one colour fits every turn equally; keep the turn we last saw.
        const uniform = top.state[face].every(c => c === top.state[face][0]);
        const quarters = uniform && face in lastQuarters ? lastQuarters[face] : top.view.quarters;
        lastQuarters[face] = quarters;
        held = { face, quarters };
        beam = candidates.slice(0, BEAM).map(c => ({
          state: c.state, key: c.key, score: c.score - top.score, moves: [],
        }));
        return { face, quarters, moves: top.moves, lost: false };
      },

      /** The cube left the camera (no face in view): its turn in the hand may change. */
      release() { held = null; },

      /** Start again from a freshly read cube, keeping nothing of the old guesses. */
      reset(newState, newPalette) {
        beam = [{ state: newState, key: keyOf(newState), score: 0, moves: [] }];
        if (newPalette) palette = newPalette;
        lastQuarters = {};
        held = null;
        plan = [];
        doubt = null;
      },
    };
  }

  window.Track = { create, arrowFor, showFace, fit, viewCosts, TURN, OPPOSITE, FACES };
})();
