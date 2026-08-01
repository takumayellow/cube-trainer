/**
 * cfop.js — where is this cube in a CFOP solve, and what is the next job?
 *
 * CFOP goes Cross -> F2L -> OLL -> PLL. This reads a cube and answers three
 * questions: which of those four stages is unfinished, which pieces the next
 * one is about, and what kind of situation those pieces are in.
 *
 * The cross is assumed to go on D. Its colour is read from the D centre, so a
 * cube scanned with white on the bottom gets a white cross and one scanned with
 * yellow on the bottom gets a yellow one — nothing here is hard-coded.
 *
 * Depends on: cube.js, cubie.js
 */

(function () {
  'use strict';

  // Corner slot indices (see cubie.js): DFR, DRB, DBL, DLF.
  // Middle edge slot indices:            FR,  BR,  BL,  FL.
  const SLOTS = [
    { key: 'FR', label: '前右', faces: ['F', 'R'], corner: 4, edge: 8 },
    { key: 'RB', label: '右奥', faces: ['R', 'B'], corner: 7, edge: 11 },
    { key: 'BL', label: '奥左', faces: ['B', 'L'], corner: 6, edge: 10 },
    { key: 'LF', label: '左前', faces: ['L', 'F'], corner: 5, edge: 9 },
  ];

  // Cross edge slots: DR, DF, DL, DB.
  const CROSS_EDGES = [
    { key: 'DF', label: '手前', edge: 5 },
    { key: 'DR', label: '右',   edge: 4 },
    { key: 'DB', label: '奥',   edge: 7 },
    { key: 'DL', label: '左',   edge: 6 },
  ];

  const U_CORNERS = [0, 1, 2, 3];      // URF, UFL, ULB, UBR
  const U_EDGES   = [0, 1, 2, 3];      // UR, UF, UL, UB

  const cornerSolved = (p, i) => p.cp[i] === i && p.co[i] === 0;
  const edgeSolved   = (p, i) => p.ep[i] === i && p.eo[i] === 0;

  const cornerAt = (p, piece) => Array.prototype.indexOf.call(p.cp, piece);
  const edgeAt   = (p, piece) => Array.prototype.indexOf.call(p.ep, piece);

  /** Facelet positions of a piece currently sitting in slot `slot`. */
  const cornerFacelets = slot => Cubie.CORNER_FACELETS[slot].map(([f, i]) => ({ face: f, index: i }));
  const edgeFacelets   = slot => Cubie.EDGE_FACELETS[slot].map(([f, i]) => ({ face: f, index: i }));

  const FACES = ['U', 'D', 'F', 'B', 'L', 'R'];

  /** One colour all over, judged against the centre. */
  const faceIsUniform = (state, f) => state[f].every(c => c === state[f][4]);

  /** A single-coloured U face is exactly what OLL finishes. */
  const ollDone = state => faceIsUniform(state, 'U');
  const solved  = state => FACES.every(f => faceIsUniform(state, f));

  /** Where a piece is, in the terms the advice below is written in. */
  function whereCorner(pieces, home) {
    const at = cornerAt(pieces, home);
    if (U_CORNERS.includes(at)) return { at, place: 'up' };
    return { at, place: at === home ? 'home' : 'other' };
  }

  function whereEdge(pieces, home) {
    const at = edgeAt(pieces, home);
    if (U_EDGES.includes(at)) return { at, place: 'up' };
    return { at, place: at === home ? 'home' : 'other' };
  }

  /**
   * What kind of F2L situation is this slot in, and what does that mean?
   * Only claims that follow from the piece positions alone are made here; the
   * case-by-case recognition (F2L 41 ケース) comes later.
   */
  /** A piece below the U layer is either in its own slot or in someone else's. */
  const where = loc => (loc.place === 'home' ? 'このスロット' : '別のスロット');

  function slotSituation(pieces, slot) {
    const corner = whereCorner(pieces, slot.corner);
    const edge   = whereEdge(pieces, slot.edge);
    const cornerOk = cornerSolved(pieces, slot.corner);
    const edgeOk   = edgeSolved(pieces, slot.edge);

    if (cornerOk && edgeOk) {
      return { corner, edge, done: true, kind: 'solved', headline: '完成', advice: '' };
    }
    if (corner.place === 'up' && edge.place === 'up') {
      return {
        corner, edge, done: false, kind: 'pair',
        headline: 'F2L ペア挿入（角 + 辺の 2 個同時）',
        advice: '角と辺がどちらも上段にある。上段でペアの形を作ってから 1 回で落とすと、'
              + '角と辺が同時に入る。初心者法のように「角 → 辺」と 2 回に分けると手数が倍になる。',
      };
    }
    if (corner.place !== 'up' && edge.place !== 'up') {
      return {
        corner, edge, done: false, kind: 'both-stuck',
        headline: '角も辺も下段にある',
        advice: `角は${where(corner)}、辺は${where(edge)}に入っている（位置か向きが違う）。`
              + 'どちらか一方を上段に出してからペアを作り直す。出すときは R U R\' や R U\' R\' のように、'
              + '既に完成した部分を壊さない形で。',
      };
    }
    if (corner.place === 'up') {
      return {
        corner, edge, done: false, kind: 'edge-stuck',
        headline: '辺だけが下段にある',
        advice: `辺が${where(edge)}に入っている。まず辺を上段に出し、角と合流させてから 1 回で入れる。`,
      };
    }
    return {
      corner, edge, done: false, kind: 'corner-stuck',
      headline: '角だけが下段にある',
      advice: `角が${where(corner)}に入っている（位置か向きが違う）。`
            + '角を上段に出してから、辺と合流させて入れる。',
    };
  }

  /**
   * Read a cube.
   * @returns {object} stages with their progress, the current stage, the pieces
   *   the next job is about, and — for F2L — what situation they are in.
   */
  function analyse(state) {
    const pieces = Cubie.fromFacelets(state);

    const cross = CROSS_EDGES.map(e => ({ ...e, done: edgeSolved(pieces, e.edge) }));
    const crossDone = cross.every(e => e.done);

    const slots = SLOTS.map(s => ({
      ...s,
      done: cornerSolved(pieces, s.corner) && edgeSolved(pieces, s.edge),
      situation: slotSituation(pieces, s),
    }));
    const f2lDone = crossDone && slots.every(s => s.done);

    const oll = f2lDone && ollDone(state);
    const pll = solved(state);

    const stages = [
      { key: 'cross', label: 'クロス', done: crossDone },
      { key: 'f2l',   label: 'F2L',    done: f2lDone, slots },
      { key: 'oll',   label: 'OLL',    done: oll },
      { key: 'pll',   label: 'PLL',    done: pll },
    ];

    if (pll)        return finish(stages, 'solved', '完成', '揃っています。', []);
    if (!crossDone) return crossJob(stages, pieces, cross);
    if (!f2lDone)   return f2lJob(stages, slots);
    if (!oll)       return finish(stages, 'oll', 'OLL（上面をそろえる）',
      '上の面を 1 色にそろえる段階。まずは 2-look（辺の向き → 角の向き）で十分に速い。', ollHighlight(state));
    return finish(stages, 'pll', 'PLL（上段を入れ替える）',
      '上の面はそろっているので、あとは上段の駒を正しい位置へ入れ替えるだけ。', ollHighlight(state));
  }

  function finish(stages, current, label, detail, highlight, extra) {
    return { stages, current, label, detail, highlight, ...(extra || {}) };
  }

  function crossJob(stages, pieces, cross) {
    const next = cross.find(e => !e.done);
    const at = edgeAt(pieces, next.edge);
    return finish(stages, 'cross', 'クロス（底面の十字）',
      `${next.label}の辺がまだ。底面の色と側面の色が両方そろって初めて完成なので、`
      + '側面の色が中心と合っているかまで見る。',
      edgeFacelets(at).concat(edgeFacelets(next.edge)),
      { crossTarget: next });
  }

  // Which remaining slot to point at. Pairs already in the U layer go in with
  // no preparation, so they come first; a slot with both pieces buried is the
  // most work and comes last. Order within a rank is the fixed slot order.
  const EFFORT = { pair: 0, 'corner-stuck': 1, 'edge-stuck': 1, 'both-stuck': 2 };

  function f2lJob(stages, slots) {
    const remaining = slots.filter(s => !s.done);
    const next = remaining.reduce((a, b) =>
      EFFORT[b.situation.kind] < EFFORT[a.situation.kind] ? b : a);
    const s = next.situation;
    const done = 4 - remaining.length;
    return finish(stages, 'f2l', `F2L（${done + 1} 組目 / ${next.label}スロット）`, s.advice,
      cornerFacelets(s.corner.at).concat(edgeFacelets(s.edge.at)),
      { slot: next, remaining });
  }

  /** The whole U layer — that is what OLL and PLL work on. */
  function ollHighlight(state) {
    return state.U.map((_, i) => ({ face: 'U', index: i }));
  }

  window.CFOP = { SLOTS, CROSS_EDGES, analyse };
})();
