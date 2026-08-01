/**
 * cube.js — Rubik's Cube state model
 *
 * Lifted from takumayellow/rubik-solver (web/cube-solver.js), whose move table
 * is covered by a piece-integrity test over every three-move sequence. The
 * solver that lived alongside it is not needed here.
 */
'use strict';

class Cube {
  constructor() {
    this._state = this._solvedState();
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  _solvedState() {
    return {
      // 白を下、緑を手前に持った標準の配置。CFOP はクロスを底面に作るので、
      // この向きだと画面と手元のキューブが同じ「白クロス・上面は黄色」になる。
      U: Array(9).fill('Y'),
      D: Array(9).fill('W'),
      F: Array(9).fill('G'),
      B: Array(9).fill('B'),
      L: Array(9).fill('R'),
      R: Array(9).fill('O'),
    };
  }

  _clone(state) {
    return {
      U: state.U.slice(),
      D: state.D.slice(),
      F: state.F.slice(),
      B: state.B.slice(),
      L: state.L.slice(),
      R: state.R.slice(),
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  getState() {
    return this._clone(this._state);
  }

  /** Replace the state wholesale. Nothing is checked here — see Cubie.validate. */
  setState(state) {
    this._state = this._clone(state);
  }

  reset() {
    this._state = this._solvedState();
  }

  isSolved() {
    const s = this._state;
    for (const face of ['U', 'D', 'F', 'B', 'L', 'R']) {
      const f = s[face];
      for (let i = 1; i < 9; i++) {
        if (f[i] !== f[0]) return false;
      }
    }
    return true;
  }

  applyMove(move) {
    const fn = Cube._MOVES[move];
    if (!fn) throw new Error('Unknown move: ' + move);
    fn(this._state);
    return this;
  }

  applySequence(moves) {
    for (const m of moves) this.applyMove(m);
    return this;
  }

  scramble(numMoves = 20) {
    const base = ['R', 'L', 'U', 'D', 'F', 'B'];
    const suffixes = ['', "'", '2'];
    const applied = [];
    let lastBase = null;
    for (let i = 0; i < numMoves; i++) {
      let b;
      do {
        b = base[Math.floor(Math.random() * base.length)];
      } while (b === lastBase);
      lastBase = b;
      const s = suffixes[Math.floor(Math.random() * suffixes.length)];
      const m = b + s;
      applied.push(m);
      this.applyMove(m);
    }
    return applied;
  }

  // ─── Move table ──────────────────────────────────────────────────────────────
  // Face indices (reading order, row-major):
  //  0 1 2
  //  3 4 5
  //  6 7 8
  //
  // Face orientations when looking at each face from outside:
  //   U face: looking down from above
  //   D face: looking up from below
  //   F face: looking toward you (front)
  //   B face: looking toward you from behind
  //   L face: looking toward you from the left
  //   R face: looking toward you from the right

  static _rotateFaceCW(f) {
    // Rotate a face 90° clockwise (looking at it from outside)
    return [
      f[6], f[3], f[0],
      f[7], f[4], f[1],
      f[8], f[5], f[2],
    ];
  }

  static _rotateFaceCCW(f) {
    return [
      f[2], f[5], f[8],
      f[1], f[4], f[7],
      f[0], f[3], f[6],
    ];
  }

  static _rotateFace180(f) {
    return [f[8], f[7], f[6], f[5], f[4], f[3], f[2], f[1], f[0]];
  }
}

// ─── Move implementations ────────────────────────────────────────────────────
// Each move mutates the state in-place.

Cube._MOVES = {};

(function buildMoves() {
  const M = Cube._MOVES;
  const CW = Cube._rotateFaceCW;
  const CCW = Cube._rotateFaceCCW;
  const F180 = Cube._rotateFace180;

  // Helper: apply a cyclic 4-group permutation on sticker indices across faces.
  // cycle = [[face, idx], [face, idx], [face, idx], [face, idx]]
  // direction: 1 = forward (a→b→c→d→a reversed for CW), -1 = backward
  function cycle4(s, quads) {
    // quads is array of 4 [face, idx] pairs — values shift: [0]→[1]→[2]→[3]→[0]
    const tmp = s[quads[3][0]][quads[3][1]];
    s[quads[3][0]][quads[3][1]] = s[quads[2][0]][quads[2][1]];
    s[quads[2][0]][quads[2][1]] = s[quads[1][0]][quads[1][1]];
    s[quads[1][0]][quads[1][1]] = s[quads[0][0]][quads[0][1]];
    s[quads[0][0]][quads[0][1]] = tmp;
  }

  function cycleRow(s, quads) {
    // quads = [[f,i0,i1,i2], ...] — 3 stickers per group, shift group forward
    const t0 = s[quads[3][0]][quads[3][1]];
    const t1 = s[quads[3][0]][quads[3][2]];
    const t2 = s[quads[3][0]][quads[3][3]];
    s[quads[3][0]][quads[3][1]] = s[quads[2][0]][quads[2][1]];
    s[quads[3][0]][quads[3][2]] = s[quads[2][0]][quads[2][2]];
    s[quads[3][0]][quads[3][3]] = s[quads[2][0]][quads[2][3]];
    s[quads[2][0]][quads[2][1]] = s[quads[1][0]][quads[1][1]];
    s[quads[2][0]][quads[2][2]] = s[quads[1][0]][quads[1][2]];
    s[quads[2][0]][quads[2][3]] = s[quads[1][0]][quads[1][3]];
    s[quads[1][0]][quads[1][1]] = s[quads[0][0]][quads[0][1]];
    s[quads[1][0]][quads[1][2]] = s[quads[0][0]][quads[0][2]];
    s[quads[1][0]][quads[1][3]] = s[quads[0][0]][quads[0][3]];
    s[quads[0][0]][quads[0][1]] = t0;
    s[quads[0][0]][quads[0][2]] = t1;
    s[quads[0][0]][quads[0][3]] = t2;
  }

  // ── U move (CW looking from top) ──────────────────────────────────────────
  // U face rotates CW. Top rows of F, L, B, R cycle.
  // Looking down at the U face, the front is at the bottom of the view, so a
  // clockwise quarter turn carries the front edge to the left:
  //   F[0,1,2] → L[0,1,2] → B[0,1,2] → R[0,1,2] → F[0,1,2]
  // (No reversal for U — the top rows all read left-to-right in their own face reference.)
  // This must match the direction of the U-face rotation itself (CW sends U[7]→U[3],
  // i.e. the F-side sticker to the L side); mixing the two directions produces a
  // permutation that is not a real face turn and silently corrupts the cube.

  M['U'] = function(s) {
    s.U = CW(s.U);
    // F[0,1,2] → L[0,1,2] → B[0,1,2] → R[0,1,2] → F[0,1,2]
    cycleRow(s, [['F',0,1,2], ['L',0,1,2], ['B',0,1,2], ['R',0,1,2]]);
  };

  M["U'"] = function(s) {
    s.U = CCW(s.U);
    cycleRow(s, [['R',0,1,2], ['B',0,1,2], ['L',0,1,2], ['F',0,1,2]]);
  };

  M['U2'] = function(s) { M['U'](s); M['U'](s); };

  // ── D move (CW looking from bottom) ───────────────────────────────────────
  // D face rotates CW (from below). Bottom rows of F, L, B, R cycle.
  // Seen from below the front edge travels to the right (mirror of U):
  //   F[6,7,8] → R[6,7,8] → B[6,7,8] → L[6,7,8] → F[6,7,8]
  // Matches the D-face rotation (CW sends D[1]→D[5], the F-side sticker to the R side).

  M['D'] = function(s) {
    s.D = CW(s.D);
    // D CW (from below): F bottom goes to R bottom, R→B, B→L, L→F
    cycleRow(s, [['F',6,7,8], ['R',6,7,8], ['B',6,7,8], ['L',6,7,8]]);
  };

  M["D'"] = function(s) {
    s.D = CCW(s.D);
    cycleRow(s, [['L',6,7,8], ['B',6,7,8], ['R',6,7,8], ['F',6,7,8]]);
  };

  M['D2'] = function(s) { M['D'](s); M['D'](s); };

  // ── F move (CW looking at front) ──────────────────────────────────────────
  // F face CW. Adjacent: U bottom row, R left col, D top row, L right col
  // CW: U[6,7,8] → R[0,3,6] → D[2,1,0] → L[8,5,2]
  //     (with reversals due to orientation changes)
  //
  // Let's verify: F CW = front face turns clockwise.
  //   U bottom row [6,7,8]: left-to-right → goes to R left col [0,3,6]: top-to-bottom ✓
  //   R left col [0,3,6]: top-to-bottom → goes to D top row [2,1,0]: right-to-left ✓
  //   D top row [2,1,0]: right-to-left → goes to L right col [8,5,2]: bottom-to-top ✓
  //   L right col [8,5,2]: bottom-to-top → goes to U bottom row [6,7,8]: left-to-right ✓

  M['F'] = function(s) {
    s.F = CW(s.F);
    const [u6, u7, u8] = [s.U[6], s.U[7], s.U[8]];
    const [r0, r3, r6] = [s.R[0], s.R[3], s.R[6]];
    const [d2, d1, d0] = [s.D[2], s.D[1], s.D[0]];
    const [l8, l5, l2] = [s.L[8], s.L[5], s.L[2]];
    // U bottom → R left col
    s.R[0] = u6; s.R[3] = u7; s.R[6] = u8;
    // R left col → D top row (reversed)
    s.D[2] = r0; s.D[1] = r3; s.D[0] = r6;
    // D top row (reversed) → L right col
    s.L[8] = d2; s.L[5] = d1; s.L[2] = d0;
    // L right col → U bottom row
    s.U[6] = l8; s.U[7] = l5; s.U[8] = l2;
  };

  M["F'"] = function(s) {
    s.F = CCW(s.F);
    const [u6, u7, u8] = [s.U[6], s.U[7], s.U[8]];
    const [r0, r3, r6] = [s.R[0], s.R[3], s.R[6]];
    const [d0, d1, d2] = [s.D[0], s.D[1], s.D[2]];
    const [l2, l5, l8] = [s.L[2], s.L[5], s.L[8]];
    // Reverse of F: U←R, R←D, D←L, L←U
    s.U[6] = r0; s.U[7] = r3; s.U[8] = r6;
    s.R[0] = d2; s.R[3] = d1; s.R[6] = d0;
    s.D[2] = l8; s.D[1] = l5; s.D[0] = l2;
    s.L[2] = u8; s.L[5] = u7; s.L[8] = u6;
  };

  M['F2'] = function(s) { M['F'](s); M['F'](s); };

  // ── B move (CW looking at back face from outside) ─────────────────────────
  // B face CW (from outside back). Adjacent: U top row, L left col, D bottom row, R right col
  // B CW: U[2,1,0] → L[0,3,6] → D[6,7,8] → R[8,5,2]
  //   U top row right-to-left → L left col top-to-bottom
  //   L left col top-to-bottom → D bottom row left-to-right
  //   D bottom row left-to-right → R right col bottom-to-top
  //   R right col bottom-to-top → U top row right-to-left

  M['B'] = function(s) {
    s.B = CW(s.B);
    const [u2, u1, u0] = [s.U[2], s.U[1], s.U[0]];
    const [l0, l3, l6] = [s.L[0], s.L[3], s.L[6]];
    const [d6, d7, d8] = [s.D[6], s.D[7], s.D[8]];
    const [r8, r5, r2] = [s.R[8], s.R[5], s.R[2]];
    // U top (right-to-left) → L left col (top-to-bottom)
    s.L[0] = u2; s.L[3] = u1; s.L[6] = u0;
    // L left col → D bottom row
    s.D[6] = l0; s.D[7] = l3; s.D[8] = l6;
    // D bottom row → R right col (bottom-to-top)
    s.R[8] = d6; s.R[5] = d7; s.R[2] = d8;
    // R right col (bottom-to-top) → U top (right-to-left)
    s.U[2] = r8; s.U[1] = r5; s.U[0] = r2;
  };

  M["B'"] = function(s) {
    s.B = CCW(s.B);
    const [u0, u1, u2] = [s.U[0], s.U[1], s.U[2]];
    const [l0, l3, l6] = [s.L[0], s.L[3], s.L[6]];
    const [d6, d7, d8] = [s.D[6], s.D[7], s.D[8]];
    const [r2, r5, r8] = [s.R[2], s.R[5], s.R[8]];
    // Reverse: U←R, R←D, D←L, L←U
    s.U[0] = l6; s.U[1] = l3; s.U[2] = l0;
    s.L[0] = d6; s.L[3] = d7; s.L[6] = d8;
    s.D[6] = r8; s.D[7] = r5; s.D[8] = r2;
    s.R[2] = u0; s.R[5] = u1; s.R[8] = u2;
  };

  M['B2'] = function(s) { M['B'](s); M['B'](s); };

  // ── R move (CW looking at right face from outside) ────────────────────────
  // R face CW. Adjacent: U right col, B left col, D right col, F right col
  // R CW: U right col [2,5,8] → B left col [6,3,0] → D right col [2,5,8] → F right col [2,5,8]
  //   (B is "upside down" relative to U/D/F, so its left col reverses)
  //
  // Let's verify:
  //   U[2,5,8] top-to-bottom → F[2,5,8] top-to-bottom ✓ (F right col = what was U right col)
  //   Wait — standard R CW:
  //     F right col → U right col → B left col (reversed) → D right col → F right col
  //   Specifically:
  //     F[2,5,8] → U[2,5,8] → B[6,3,0] (B's "left" when viewed from behind = index 2,5,8 but reversed orientation)
  //                                       Actually B[0,3,6] is left col when facing B from outside.
  //                                       But since B is "behind", when F right goes up through U and around to B,
  //                                       it enters B's right col from B's perspective.
  //   Standard verified R CW permutation:
  //     U[2]←F[2], U[5]←F[5], U[8]←F[8]  (F right → U right)
  //     B[0]←U[8], B[3]←U[5], B[6]←U[2]  (U right → B left reversed)
  //     D[2]←B[6], D[5]←B[3], D[8]←B[0]  (B left reversed → D right)
  //     F[2]←D[2], F[5]←D[5], F[8]←D[8]  (D right → F right)

  M['R'] = function(s) {
    s.R = CW(s.R);
    const [f2, f5, f8] = [s.F[2], s.F[5], s.F[8]];
    const [u2, u5, u8] = [s.U[2], s.U[5], s.U[8]];
    const [b0, b3, b6] = [s.B[0], s.B[3], s.B[6]];
    const [d2, d5, d8] = [s.D[2], s.D[5], s.D[8]];
    // F right → U right
    s.U[2] = f2; s.U[5] = f5; s.U[8] = f8;
    // U right → B left (reversed: U[2]→B[6], U[5]→B[3], U[8]→B[0])
    s.B[0] = u8; s.B[3] = u5; s.B[6] = u2;
    // B left reversed → D right (B[0]→D[8], B[3]→D[5], B[6]→D[2])
    s.D[2] = b6; s.D[5] = b3; s.D[8] = b0;
    // D right → F right
    s.F[2] = d2; s.F[5] = d5; s.F[8] = d8;
  };

  M["R'"] = function(s) {
    s.R = CCW(s.R);
    const [f2, f5, f8] = [s.F[2], s.F[5], s.F[8]];
    const [u2, u5, u8] = [s.U[2], s.U[5], s.U[8]];
    const [b0, b3, b6] = [s.B[0], s.B[3], s.B[6]];
    const [d2, d5, d8] = [s.D[2], s.D[5], s.D[8]];
    // Reverse: F←U, U←B(rev), B←D, D←F
    s.F[2] = u2; s.F[5] = u5; s.F[8] = u8;
    s.U[2] = b6; s.U[5] = b3; s.U[8] = b0;
    s.B[0] = d8; s.B[3] = d5; s.B[6] = d2;
    s.D[2] = f2; s.D[5] = f5; s.D[8] = f8;
  };

  M['R2'] = function(s) { M['R'](s); M['R'](s); };

  // ── L move (CW looking at left face from outside) ─────────────────────────
  // L face CW. Adjacent: U left col, F left col, D left col, B right col
  // L CW: U[0,3,6] → B[8,5,2] → D[0,3,6] → F[0,3,6]
  //   F left → D left: F[0,3,6]→D[0,3,6]
  //   U left → F left: U[0,3,6]→F[0,3,6]
  //   B right (reversed) → U left: B[8,5,2]→U[0,3,6]
  //   D left → B right (reversed): D[0,3,6]→B[8,5,2]
  //
  // Standard L CW:
  //   F[0,3,6] → U[0,3,6]  (F left → U left)
  //   U[0,3,6] → B[8,5,2]  (U left → B right reversed)
  //   B[8,5,2] → D[0,3,6]  (B right reversed → D left? wait...)
  //   Actually standard: B right col when viewed from outside back is [2,5,8].
  //   But for L, U left going around to back enters B's right side.
  //   Verified L CW:
  //     U[0]←B[8], U[3]←B[5], U[6]←B[2]  (B right reversed → U left)
  //     F[0]←U[0], F[3]←U[3], F[6]←U[6]  (U left → F left)
  //     D[0]←F[0], D[3]←F[3], D[6]←F[6]  (F left → D left)
  //     B[2]←D[6], B[5]←D[3], B[8]←D[0]  (D left → B right reversed)

  M['L'] = function(s) {
    s.L = CW(s.L);
    const [u0, u3, u6] = [s.U[0], s.U[3], s.U[6]];
    const [f0, f3, f6] = [s.F[0], s.F[3], s.F[6]];
    const [d0, d3, d6] = [s.D[0], s.D[3], s.D[6]];
    const [b2, b5, b8] = [s.B[2], s.B[5], s.B[8]];
    // B right reversed → U left
    s.U[0] = b8; s.U[3] = b5; s.U[6] = b2;
    // U left → F left
    s.F[0] = u0; s.F[3] = u3; s.F[6] = u6;
    // F left → D left
    s.D[0] = f0; s.D[3] = f3; s.D[6] = f6;
    // D left → B right reversed
    s.B[2] = d6; s.B[5] = d3; s.B[8] = d0;
  };

  M["L'"] = function(s) {
    s.L = CCW(s.L);
    const [u0, u3, u6] = [s.U[0], s.U[3], s.U[6]];
    const [f0, f3, f6] = [s.F[0], s.F[3], s.F[6]];
    const [d0, d3, d6] = [s.D[0], s.D[3], s.D[6]];
    const [b2, b5, b8] = [s.B[2], s.B[5], s.B[8]];
    // Reverse: U←F, F←D, D←B(rev), B(rev)←U
    s.U[0] = f0; s.U[3] = f3; s.U[6] = f6;
    s.F[0] = d0; s.F[3] = d3; s.F[6] = d6;
    s.D[0] = b8; s.D[3] = b5; s.D[6] = b2;
    s.B[2] = u6; s.B[5] = u3; s.B[8] = u0;
  };

  M['L2'] = function(s) { M['L'](s); M['L'](s); };

})();

window.Cube = Cube;
