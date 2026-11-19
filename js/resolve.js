/**
 * resolve.js — the most likely cube that can actually exist
 *
 * A camera reads 54 colours, but a real cube is not 54 independent colours.
 * It is 8 corners and 12 edges, each present exactly once, and three rules
 * hold no matter how it was scrambled: the corner twists add up to a multiple
 * of three, the edge flips to a multiple of two, and corners and edges are
 * permuted with the same parity. Of all colourings, only one in twelve of the
 * piece arrangements is reachable at all.
 *
 * So instead of naming each sticker and then complaining that the result is
 * impossible, this takes a cost for every (sticker, colour) pair and finds the
 * cheapest arrangement of pieces that obeys every rule:
 *
 *   1. For each slot and each piece, the cheapest way to turn it into the slot.
 *   2. The cheapest one-to-one placement of pieces into slots (Hungarian method),
 *      plus every single swap of it, so both permutation parities are on hand.
 *   3. For each placement, the cheapest twists (or flips) whose sum is legal —
 *      a small dynamic programme over "sum so far, modulo 3 (or 2)".
 *   4. Corners and edges of the same parity, cheapest pair.
 *
 * A misread orange next to red, which on its own makes a corner that does not
 * exist, is corrected here because the real corner it belongs to is cheaper.
 *
 * Depends on: cubie.js
 */

(function () {
  'use strict';

  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
  const sticker = ([face, idx]) => FACE_INDEX[face] * 9 + idx;

  // Slot -> sticker positions (0..53), and piece -> the faces it shows.
  const CORNER_STICKERS = Cubie.CORNER_FACELETS.map(t => t.map(sticker));
  const EDGE_STICKERS = Cubie.EDGE_FACELETS.map(t => t.map(sticker));
  const CORNER_PIECES = Cubie.CORNER_FACELETS.map(t => t.map(([f]) => FACE_INDEX[f]));
  const EDGE_PIECES = Cubie.EDGE_FACELETS.map(t => t.map(([f]) => FACE_INDEX[f]));

  // ── assignment ────────────────────────────────────────────────────────────

  /**
   * Minimum-cost perfect matching on a square matrix (Hungarian method with
   * potentials, O(n^3)). @returns {number[]} row -> column
   */
  function hungarian(cost) {
    const n = cost.length;
    const INF = Infinity;
    const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(n + 1).fill(INF);
      const used = new Array(n + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = INF, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const rowToCol = new Array(n);
    for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
    return rowToCol;
  }

  function parity(perm) {
    let inv = 0;
    for (let i = 0; i < perm.length; i++)
      for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) inv++;
    return inv % 2;
  }

  // ── one family of pieces (corners, or edges) ──────────────────────────────

  /**
   * table[slot][piece][turn]: cost of `piece` sitting in `slot` turned by
   * `turn`. Turn k means the slot's sticker j shows the piece's face (j+k)%n —
   * the same convention as Cubie.fromFacelets, so the orientation sums agree.
   */
  function pieceCosts(cost, slots, pieces) {
    const n = slots[0].length;
    return slots.map(st => pieces.map(faces => {
      const out = [];
      for (let k = 0; k < n; k++) {
        let c = 0;
        for (let j = 0; j < n; j++) c += cost[st[j]][faces[(j + k) % n]];
        out.push(c);
      }
      return out;
    }));
  }

  /** Cheapest legal turns for a fixed placement: their sum must be 0 mod n. */
  function bestTurns(table, perm, n) {
    let dp = new Array(n).fill(Infinity);
    dp[0] = 0;
    const back = [];
    for (let s = 0; s < perm.length; s++) {
      const next = new Array(n).fill(Infinity);
      const from = new Array(n).fill(null);
      for (let m = 0; m < n; m++) {
        if (dp[m] === Infinity) continue;
        for (let k = 0; k < n; k++) {
          const c = dp[m] + table[s][perm[s]][k];
          const t = (m + k) % n;
          if (c < next[t]) { next[t] = c; from[t] = [m, k]; }
        }
      }
      back.push(from);
      dp = next;
    }
    const turns = new Array(perm.length);
    let m = 0;
    for (let s = perm.length - 1; s >= 0; s--) {
      const [prev, k] = back[s][m];
      turns[s] = k;
      m = prev;
    }
    return { cost: dp[0], turns };
  }

  /**
   * The cheapest legal arrangement of this family for each permutation parity.
   * @returns {[{cost, perm, turns}, {cost, perm, turns}]} index = parity
   */
  function bestByParity(table, n) {
    const size = table.length;
    const flat = table.map(row => row.map(turns => Math.min(...turns)));
    const base = hungarian(flat);
    const candidates = [base];
    for (let a = 0; a < size; a++) {
      for (let b = a + 1; b < size; b++) {
        const swapped = base.slice();
        swapped[a] = base[b];
        swapped[b] = base[a];
        candidates.push(swapped);
      }
    }
    const best = [null, null];
    for (const perm of candidates) {
      const par = parity(perm);
      const { cost, turns } = bestTurns(table, perm, n);
      if (!best[par] || cost < best[par].cost) best[par] = { cost, perm, turns };
    }
    return best;
  }

  // ── the entry point ───────────────────────────────────────────────────────

  /**
   * @param {number[][]} cost  cost[sticker][face] for the 54 stickers in face
   *   order U R F D L B (row-major), against faces in the same order. Lower is
   *   likelier. Centres are ignored: they name the faces.
   * @returns {{faces: number[], cost: number}} faces[sticker] = face index,
   *   for a cube that passes every Cubie.validate rule.
   */
  function resolve(cost) {
    const corners = bestByParity(pieceCosts(cost, CORNER_STICKERS, CORNER_PIECES), 3);
    const edges = bestByParity(pieceCosts(cost, EDGE_STICKERS, EDGE_PIECES), 2);
    const par = corners[0].cost + edges[0].cost <= corners[1].cost + edges[1].cost ? 0 : 1;
    const c = corners[par], e = edges[par];

    const faces = new Array(54).fill(-1);
    for (let f = 0; f < 6; f++) faces[f * 9 + 4] = f;
    const place = (slots, pieces, pick, n) => {
      slots.forEach((st, s) => {
        const piece = pieces[pick.perm[s]];
        st.forEach((pos, j) => { faces[pos] = piece[(j + pick.turns[s]) % n]; });
      });
    };
    place(CORNER_STICKERS, CORNER_PIECES, c, 3);
    place(EDGE_STICKERS, EDGE_PIECES, e, 2);
    return { faces, cost: c.cost + e.cost };
  }

  window.Resolve = { resolve, hungarian, FACES };
})();
