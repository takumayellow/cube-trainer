/**
 * live/reader.js — collect the six faces from steady views, in any order and
 * any turn, then work out the cube.
 *
 * No shutter: a steady view of a face not seen yet is taken as it is. A view
 * that matches a face already taken (at any of its four turns) is ignored and
 * reported, so showing the same face twice does no harm.
 *
 * Depends on: window.Scan, window.TwoPhaseSolver.
 */
'use strict';

(function () {
  // Mean per-sticker distance (Scan feature space) below which a view repeats a
  // taken face. Measured on the photo fixtures: a face shown again with its
  // brightness off by 8% stays under 0.009; two different faces, even a red and
  // an orange face of a solved cube, stay above 0.017.
  const DUP_D = 0.012;
  const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const meanDist = (a, b) => {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += dist2(Scan.feature(a[i]), Scan.feature(b[i]));
    return sum / 9;
  };
  const QUARTER = [6, 3, 0, 7, 4, 1, 8, 5, 2];
  const turnNine = (nine, q) => {
    let out = nine;
    for (let k = 0; k < q; k++) out = QUARTER.map(i => out[i]);
    return out;
  };

  /**
   * Which way to turn the whole cube after `count` faces, to bring an unseen
   * face round. Any order works; this one visits all six without thinking.
   */
  function hint(count) {
    if (count === 0) return { dir: null, text: 'どの面からでも大丈夫です。面を枠に合わせてください' };
    if (count <= 3) return { dir: 'left', text: 'キューブ全体を矢印の向きに 90° 回して、隣の面を見せてください' };
    if (count === 4) return { dir: 'down', text: 'キューブを手前に倒して、上の面を見せてください' };
    if (count === 5) return { dir: 'flip', text: 'ひっくり返して、残りの面を見せてください' };
    return { dir: null, text: '6 面そろいました' };
  }

  function create() {
    let shots = [];          // {colours, centre}

    /** Index of the taken face this view repeats, or -1. */
    function repeatOf(colours) {
      for (let k = 0; k < shots.length; k++) {
        for (let q = 0; q < 4; q++) {
          if (meanDist(turnNine(colours, q), shots[k].colours) < DUP_D) return k;
        }
      }
      return -1;
    }

    return {
      get count() { return shots.length; },
      get shots() { return shots.slice(); },

      /**
       * Offer a steady view. `force` takes it even if it looks like a taken
       * face (the player says it is a different one).
       * @returns {{kind: 'new'|'repeat'|'full', index: number}}
       */
      offer(colours, force) {
        if (shots.length >= 6) return { kind: 'full', index: -1 };
        const k = force ? -1 : repeatOf(colours);
        if (k >= 0) return { kind: 'repeat', index: k };
        shots = [...shots, { colours, centre: Scan.guessColour(colours[4]) }];
        return { kind: 'new', index: shots.length - 1 };
      },

      /** Throw away one taken face (the player tapped it to take it again). */
      drop(index) {
        shots = shots.filter((_, k) => k !== index);
      },

      clear() { shots = []; },

      /**
       * Work out the cube from six faces.
       * @returns {{ok: true, read: object} | {ok: false, retake: number, text: string}}
       *   when the faces do not make a solvable cube, `retake` is the face
       *   least sure of, to be shown again.
       */
      finish() {
        const read = Scan.toStateAnyOrder(shots.map(s => s.colours));
        let solvable = false;
        try { solvable = !!TwoPhaseSolver.solve(read.state, { budgetMs: 300 }); } catch (e) { solvable = false; }
        if (solvable) return { ok: true, read };
        const retake = Math.max(0, read.placement.findIndex(p => p.face === read.weakest));
        return { ok: false, retake, text: '色の読み取りが合いません。光るチップの面を、もう一度見せてください' };
      },
    };
  }

  window.Reader = { create, hint, DUP_D };
})();
