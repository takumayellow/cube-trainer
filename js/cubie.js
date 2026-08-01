/**
 * cubie.js — facelet colours <-> pieces, and "is this cube even possible?"
 *
 * The facelet model (cube.js) stores six faces of nine colours. Almost every
 * question worth asking is about pieces instead: which corner is in this slot,
 * and how is it turned. This translates between the two, and uses that same
 * translation to reject cubes that no amount of turning could produce.
 *
 * Depends on: cube.js
 */

(function () {
  'use strict';

  const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];

  // Slot -> its stickers. The order within an entry defines orientation:
  // twist 0/1/2 for corners, flip 0/1 for edges.
  // Corners are URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB — clockwise seen from
  // outside the corner, U/D sticker first.
  const CORNER_FACELETS = [
    [['U', 8], ['R', 0], ['F', 2]],
    [['U', 6], ['F', 0], ['L', 2]],
    [['U', 0], ['L', 0], ['B', 2]],
    [['U', 2], ['B', 0], ['R', 2]],
    [['D', 2], ['F', 8], ['R', 6]],
    [['D', 0], ['L', 8], ['F', 6]],
    [['D', 6], ['B', 8], ['L', 6]],
    [['D', 8], ['R', 8], ['B', 6]],
  ];
  // Edges are UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR. Indices 8-11 are
  // the middle-layer four. U/D sticker first, or the F/B sticker in the middle.
  const EDGE_FACELETS = [
    [['U', 5], ['R', 1]], [['U', 7], ['F', 1]], [['U', 3], ['L', 1]], [['U', 1], ['B', 1]],
    [['D', 5], ['R', 7]], [['D', 1], ['F', 7]], [['D', 3], ['L', 7]], [['D', 7], ['B', 7]],
    [['F', 5], ['R', 3]], [['F', 3], ['L', 5]], [['B', 5], ['L', 3]], [['B', 3], ['R', 5]],
  ];

  const CORNER_FACES = CORNER_FACELETS.map(t => t.map(([f]) => f));
  const EDGE_FACES   = EDGE_FACELETS.map(t => t.map(([f]) => f));

  // Human names, in slot order, for anything that has to be said out loud.
  const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
  const EDGE_NAMES   = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB',
                        'FR', 'FL', 'BL', 'BR'];

  /** Which face is each colour? Read off the centres, never hard-coded. */
  function colourMap(state) {
    const map = {};
    for (const f of FACE_NAMES) map[state[f][4]] = f;
    return map;
  }

  /** Which piece are these faces, and how far is it turned in its slot? */
  function locate(table, seen, n) {
    for (let piece = 0; piece < table.length; piece++) {
      for (let shift = 0; shift < n; shift++) {
        let hit = true;
        for (let k = 0; k < n && hit; k++) hit = table[piece][(k + shift) % n] === seen[k];
        if (hit) return { piece, shift };
      }
    }
    return null;
  }

  /**
   * @returns {{cp: Uint8Array, co: Uint8Array, ep: Uint8Array, eo: Uint8Array}}
   *   cp[i]/co[i]: the corner in slot i and its twist; ep[i]/eo[i] likewise.
   * @throws if a slot holds no piece the cube has.
   */
  function fromFacelets(state) {
    const toFace = colourMap(state);

    const cp = new Uint8Array(8), co = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      const seen = CORNER_FACELETS[i].map(([f, idx]) => toFace[state[f][idx]]);
      const found = locate(CORNER_FACES, seen, 3);
      if (!found) throw new Error(`${CORNER_NAMES[i]} の位置にある角が、キューブに存在しない色の組み合わせです`);
      cp[i] = found.piece;
      co[i] = found.shift;
    }

    const ep = new Uint8Array(12), eo = new Uint8Array(12);
    for (let i = 0; i < 12; i++) {
      const seen = EDGE_FACELETS[i].map(([f, idx]) => toFace[state[f][idx]]);
      const found = locate(EDGE_FACES, seen, 2);
      if (!found) throw new Error(`${EDGE_NAMES[i]} の位置にある辺が、キューブに存在しない色の組み合わせです`);
      ep[i] = found.piece;
      eo[i] = found.shift;
    }
    return { cp, co, ep, eo };
  }

  function inversions(a) {
    let n = 0;
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) n++;
    return n;
  }

  function duplicates(a) {
    return new Set(a).size !== a.length;
  }

  /**
   * Can this cube exist? Colour counts and piece identity are the easy half;
   * the rest are the three invariants a physical cube can never break — you
   * cannot twist one corner, flip one edge, or swap just two pieces.
   *
   * @returns {{ok: boolean, reason?: string}}
   */
  function validate(state) {
    const centres = FACE_NAMES.map(f => state[f][4]);
    if (duplicates(centres)) return { ok: false, reason: '中心の色が重複しています（6 面が別の色である必要があります）' };

    const count = {};
    for (const f of FACE_NAMES) for (const c of state[f]) count[c] = (count[c] || 0) + 1;
    for (const c of centres) {
      if (count[c] !== 9) return { ok: false, reason: `${c} の面が ${count[c] || 0} マスしかありません（各色 9 マス必要です）` };
    }
    for (const c of Object.keys(count)) {
      if (!centres.includes(c)) return { ok: false, reason: `どの面の中心でもない色 ${c} が使われています` };
    }

    let pieces;
    try {
      pieces = fromFacelets(state);
    } catch (err) {
      return { ok: false, reason: err.message };
    }
    if (duplicates(Array.from(pieces.cp))) return { ok: false, reason: '同じ角が 2 か所にあります' };
    if (duplicates(Array.from(pieces.ep))) return { ok: false, reason: '同じ辺が 2 か所にあります' };

    let twist = 0;
    for (const t of pieces.co) twist += t;
    if (twist % 3 !== 0) return { ok: false, reason: '角のねじれの合計が合いません（実物のキューブでは角 1 個だけをねじることはできません）' };

    let flip = 0;
    for (const f of pieces.eo) flip += f;
    if (flip % 2 !== 0) return { ok: false, reason: '辺の向きの合計が合いません（辺 1 個だけを裏返すことはできません）' };

    if (inversions(Array.from(pieces.cp)) % 2 !== inversions(Array.from(pieces.ep)) % 2) {
      return { ok: false, reason: '駒の並びが合いません（2 個だけを入れ替えることはできません）' };
    }
    return { ok: true };
  }

  window.Cubie = {
    CORNER_FACELETS, EDGE_FACELETS, CORNER_NAMES, EDGE_NAMES,
    colourMap, fromFacelets, validate,
  };
})();
