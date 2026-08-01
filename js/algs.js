/**
 * algs.js — the last two stages, by name
 *
 * OLL and PLL are where CFOP stops being intuitive and starts being memorised.
 * The usual way to teach that is a wall of 57 + 21 pictures. This does the
 * opposite: it tries the algorithms it knows against the cube in front of you
 * and reports the one that works, so you are shown a single technique, by name,
 * with what it does — and nothing else.
 *
 * Recognition is by simulation, never by pattern-matching a picture. A cube is
 * only ever told to turn something that has been played out to the finish first,
 * so a misremembered entry cannot produce wrong advice; it simply never matches.
 *
 * When no single algorithm finishes the stage, a chain of two is searched for —
 * which is exactly 2-look OLL / 2-look PLL, the way it is normally learnt. Only
 * the first of the two is shown; the second appears once the first is done.
 *
 * Depends on: search.js
 */

(function () {
  'use strict';

  const AUF = ['', 'U', "U'", 'U2'];

  const OLL = [
    {
      name: 'EOLL（辺の向き）', jp: '線 → 十字', moves: "F R U R' U' F'",
      does: '上面の辺の向きをそろえて十字を作る。角の向きは変わるが、それは次の手順で直すので気にしない。',
      when: '上面に黄色い線が横に見えているとき。点しか見えないときは、これを 2 回に分けて使う。',
    },
    {
      name: 'EOLL（辺の向き・L 字）', jp: 'かぎ形 → 十字', moves: "F U R U' R' F'",
      does: '同じく辺の向きをそろえる。L 字（かぎ形）に対応する向き。',
      when: '上面の辺 2 本が左と奥のように直角に見えているとき。',
    },
    {
      name: 'Sune', jp: 'スーン（OLL 27）', moves: "R U R' U R U2 R'",
      does: '上面の角 3 つを時計回りにねじる。1 手順で角の向きがそろう形。',
      when: '十字ができていて、上を向いている角が 1 つだけのとき。',
    },
    {
      name: 'Antisune', jp: 'アンチスーン（OLL 26）', moves: "R U2 R' U' R U' R'",
      does: '上面の角 3 つを反時計回りにねじる。Sune の逆向き。',
      when: 'Sune の鏡の形。上を向いている角が 1 つで、向きが逆のとき。',
    },
    {
      name: 'H（ダブルスーン）', jp: 'OLL 21', moves: "R U R' U R U' R' U R U2 R'",
      does: '上面の角 4 つすべての向きを直す。',
      when: '上を向いている角がなく、左右が対称に見えるとき。',
    },
    {
      name: 'Pi', jp: 'OLL 22', moves: "R U2 R2 U' R2 U' R2 U2 R",
      does: '上面の角 4 つの向きを直す。H とは崩れ方が違う形。',
      when: '上を向いている角がなく、左右非対称のとき。',
    },
    {
      name: 'U 型（OLL 23）', jp: 'ヘッドライト', moves: "R2 D R' U2 R D' R' U2 R'",
      does: '上を向いている角 2 つを残したまま、残り 2 つの向きを直す。辺の向きは変えない。',
      when: '十字ができていて、同じ色の角 2 つが並んで見えている（ヘッドライト）とき。',
    },
    {
      name: 'T 型（OLL 33）', jp: 'Sexy + Sledgehammer', moves: "R U R' U' R' F R F'",
      does: 'Sexy move（R U R\' U\'）と Sledgehammer（R\' F R F\'）をつないだ形。'
          + '辺 2 本と角 2 つの向きをまとめて直す。',
      when: '上面に十字がまだなく、T の形に見えるとき。CFOP で最初に覚える組み合わせ技。',
    },
  ];

  const PLL = [
    {
      name: 'T-perm', jp: 'T パーム', moves: "R U R' U' R' F R2 U' R' U' R U R' F'",
      does: '隣り合う角 2 つを入れ替え、同時に辺 2 つを入れ替える。角と辺を 1 手順で片付ける。',
      when: '角 2 つが隣どうしで入れ替わり、辺も 2 つ入れ替わっているとき。',
    },
    {
      name: 'Y-perm', jp: 'Y パーム', moves: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
      does: '向かい合う角 2 つを入れ替え、同時に辺 2 つを入れ替える。',
      when: '入れ替わっている角が対角にあるとき（T-perm では届かない形）。',
    },
    {
      name: 'Ja-perm', jp: 'J パーム（a）', moves: "R' U L' U2 R U' R' U2 R L",
      does: '隣り合う角 2 つと、隣り合う辺 2 つを入れ替える。T-perm と入れ替わる向きが違う。',
      when: '角 2 つと辺 2 つが、同じ側で入れ替わっているとき。',
    },
    {
      name: 'Jb-perm', jp: 'J パーム（b）', moves: "R U R' F' R U R' U' R' F R2 U' R'",
      does: 'Ja の鏡。隣り合う角 2 つと辺 2 つを入れ替える。',
      when: 'Ja の反対向きの形のとき。',
    },
    {
      name: 'Aa-perm', jp: 'A パーム（a）', moves: "R' F R' B2 R F' R' B2 R2",
      does: '角 3 つだけを回す。辺には触らない。',
      when: '辺は合っていて角だけずれているとき。2-look PLL の 1 手目もこれ。',
    },
    {
      name: 'Ab-perm', jp: 'A パーム（b）', moves: "R B' R F2 R' B R F2 R2",
      does: 'Aa の逆回り。角 3 つだけを回す。',
      when: 'Aa と逆向きに角がずれているとき。',
    },
    {
      name: 'Ua-perm', jp: 'U パーム（a）', moves: "R U' R U R U R U' R' U' R2",
      does: '上段の辺 3 つを反時計回りに回す。角には触らない。',
      when: '角は全部正しく、辺だけが 3 つずれているとき。',
    },
    {
      name: 'Ub-perm', jp: 'U パーム（b）', moves: "R2 U R U R' U' R' U' R' U R'",
      does: 'Ua の逆回り。上段の辺 3 つを時計回りに回す。',
      when: 'Ua と逆向きに辺がずれているとき。',
    },
  ];

  // ── what counts as done ───────────────────────────────────────────────────

  const U_CORNERS = [0, 1, 2, 3];
  const U_EDGES = [0, 1, 2, 3];

  const f2lIntact = st => Search.cornersHome(st, [4, 5, 6, 7])
                       && Search.edgesHome(st, [4, 5, 6, 7, 8, 9, 10, 11]);

  const edgesOriented  = st => U_EDGES.every(i => st.eo[i] === 0);
  const cornersOriented = st => U_CORNERS.every(i => st.co[i] === 0);
  const ollDone = st => edgesOriented(st) && cornersOriented(st);

  /** True if some number of U turns finishes it — the final AUF is free. */
  function upToAUF(st, test) {
    let cur = st;
    for (let k = 0; k < 4; k++) {
      if (test(cur)) return k;
      cur = Search.apply(cur, 'U');
    }
    return -1;
  }

  const cornersPlaced = st => upToAUF(st, s => U_CORNERS.every(i => s.cp[i] === i)) >= 0;
  const allPlaced = st => upToAUF(st, Search.isSolved) >= 0;

  // ── trying the book against the cube ──────────────────────────────────────

  /**
   * The shortest chain of at most `maxSteps` algorithms that reaches `goal`,
   * each allowed a U turn in front of it to line the case up (AUF).
   *
   * Breadth-first, so a one-algorithm answer always wins over a two.
   * @returns {Array<{entry: object, pre: string, moves: string[]}>|null}
   */
  function chain(start, db, goal, maxSteps) {
    let frontier = [{ st: start, path: [] }];
    for (let depth = 0; depth < maxSteps; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const entry of db) {
          const alg = entry.moves.split(' ');
          for (const pre of AUF) {
            const moves = pre ? [pre, ...alg] : alg;
            const after = Search.applySequence(node.st, moves);
            if (!f2lIntact(after)) continue;      // never break what is already built
            const path = [...node.path, { entry, pre, moves }];
            if (goal(after)) return path;
            next.push({ st: after, path });
          }
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Turns the U layer to the finish line once everything is in place. */
  function finalAUF(st) {
    const k = upToAUF(st, Search.isSolved);
    if (k <= 0) return [];
    return [['', 'U', 'U2', "U'"][k]];
  }

  // ── the two stages ────────────────────────────────────────────────────────

  function ollStep(st) {
    const one = chain(st, OLL, ollDone, 1);
    if (one) return present(st, one, '上の面を 1 色にそろえる', ollDone, false);

    // 2-look: the edges first, because every corner algorithm assumes the cross.
    const done = edgesOriented(st);
    const goal = done ? ollDone : edgesOriented;
    const label = done ? '角の向きをそろえる' : 'まず辺の向きだけそろえる（上面に十字を作る）';
    const two = chain(st, OLL, goal, 2);
    return two ? present(st, two, label, ollDone, false) : null;
  }

  function pllStep(st) {
    const one = chain(st, PLL, allPlaced, 1);
    if (one) return present(st, one, '上段を正しい位置へ入れ替える', allPlaced, true);

    const goal = cornersPlaced(st) ? allPlaced : cornersPlaced;
    const label = cornersPlaced(st) ? '残りの辺を入れ替える' : 'まず角の位置だけそろえる';
    const two = chain(st, PLL, goal, 2);
    return two ? present(st, two, label, allPlaced, true) : null;
  }

  /**
   * Only ever the first algorithm of the chain: the point is to be told one
   * thing to do. Whether that one thing finishes the stage is decided by playing
   * it out — `closes` is measured, not assumed, so a two-step case can never be
   * announced as if it were done.
   */
  function present(st, path, goal, stageDone, closeWithAUF) {
    const first = path[0];
    let moves = first.moves.slice();
    const after = Search.applySequence(st, moves);
    const closes = stageDone(after);
    if (closes && closeWithAUF) moves = moves.concat(finalAUF(after));
    return {
      goal,
      moves,
      closes,
      name: first.entry.name,
      jp: first.entry.jp,
      does: first.entry.does,
      when: first.entry.when,
      pre: first.pre,
    };
  }

  window.Algs = {
    OLL, PLL, ollStep, pllStep,
    f2lIntact, ollDone, edgesOriented, cornersPlaced, allPlaced, chain, upToAUF,
  };
})();
