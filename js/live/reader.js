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
  // Under the club's lights, a face shown again came 0.013 and 0.016 away, with
  // its centre sticker 0.050 and 0.002 away. The only two different faces of
  // the photo fixtures closer than NEAR_D (0.017) had centres 0.136 apart, so a
  // view also counts as a repeat when it is this close and so is its centre.
  const NEAR_D = 0.03;
  const CENTRE_D = 0.1;
  // Stickers the read may recolour to make a real cube. A good read of the
  // photo fixtures needs 0 to 2; the two reads that went wrong at the club
  // needed 11 and 16 (a face taken twice under different light, a washed-out
  // face). Past this, one face is shown again instead.
  const MAX_CORRECTED = 4;
  // After this many faces shown again in a row, the read is taken as it is,
  // so a cube that really is hard to see does not keep the player waiting.
  const MAX_REJECTS = 2;
  // When a read is turned down, two shots closer than this are taken for one
  // face shown twice. Different faces of the photo fixtures stay above 0.017
  // but a few come within 0.05; the club's twice-shown faces were 0.013-0.021.
  const TWIN_D = 0.03;
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
    if (count === 0) return { dir: null, text: 'どの面からでも大丈夫です。面をカメラに向けてください' };
    // `text` is said with the way to turn the cube (Overlay.wholeWords) in front
    if (count <= 3) return { dir: 'left', text: '隣の面を見せてください' };
    if (count === 4) return { dir: 'down', text: '上の面を見せてください' };
    if (count === 5) return { dir: 'flip', text: '残りの面を見せてください' };
    return { dir: null, text: '6 面そろいました' };
  }

  function create() {
    let shots = [];          // {colours, centre}
    let rejects = 0;         // reads turned down in a row for needing too many corrections

    /** Index of the taken face this view repeats, or -1. */
    function repeatOf(colours) {
      for (let k = 0; k < shots.length; k++) {
        for (let q = 0; q < 4; q++) {
          const d = meanDist(turnNine(colours, q), shots[k].colours);
          if (d < DUP_D) return k;
          if (d < NEAR_D && dist2(Scan.feature(colours[4]), Scan.feature(shots[k].colours[4])) < CENTRE_D) return k;
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

      clear() { shots = []; rejects = 0; },

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
        if (solvable && (read.corrected.length <= MAX_CORRECTED || rejects >= MAX_REJECTS)) {
          rejects = 0;
          return { ok: true, read };
        }
        if (solvable) {
          // A cube came out, but only by recolouring many stickers: retake the face
          // that needed most of them (the weakest one when it is a tie).
          rejects += 1;
          // Two shots this alike are most likely one face shown twice: take the later again.
          let pair = null;
          for (let i = 0; i < shots.length; i++) {
            for (let j = i + 1; j < shots.length; j++) {
              const d = Math.min(...[0, 1, 2, 3].map(q => meanDist(turnNine(shots[j].colours, q), shots[i].colours)));
              if (d < TWIN_D && (!pair || d < pair.d)) pair = { d, later: j };
            }
          }
          const per = read.placement.map(p => read.corrected.filter(c => c.face === p.face).length
            + (p.face === read.weakest ? 0.5 : 0));
          const retake = pair ? pair.later : per.indexOf(Math.max(...per));
          return { ok: false, retake, corrected: read.corrected.length,
                   text: '読み取りのあやしい面を 1 つ外しました。チップに無い面を見せてください' };
        }
        const retake = Math.max(0, read.placement.findIndex(p => p.face === read.weakest));
        return { ok: false, retake, text: '色の読み取りが合いません。光るチップの面を、もう一度見せてください' };
      },
    };
  }

  window.Reader = { create, hint, DUP_D, MAX_CORRECTED };
})();
