/**
 * step.js — the one job in front of you, and the turns that do it
 *
 * A method sheet tells you all 78 cases at once. That is the opposite of what
 * is useful while holding a cube: what you want is the next thing to do, for
 * the cube you are actually holding, with the moves written out.
 *
 * So nothing here is looked up. The cross and F2L are searched for — shortest
 * first, with the parts you have already built added to the goal so the answer
 * can never wreck them. OLL and PLL are handed to algs.js, which tries its
 * technique list against the cube and reports the one that fits, by name.
 *
 * When a full answer is out of reach in the time available, the job is cut in
 * half instead of guessed at: "get this piece up to the top first" is still a
 * true instruction, and it is followed by the real one on the next redraw.
 *
 * Depends on: cube.js, cubie.js, cfop.js, search.js, algs.js
 */

(function () {
  'use strict';

  const CROSS = CFOP.CROSS_EDGES;
  const SLOTS = CFOP.SLOTS;

  // Search budgets. The cross runs over all six faces, F2L over the slot's two
  // faces plus U, which is what a hand does anyway. These are ceilings, not
  // costs: nearly every step answers in a few milliseconds, and the numbers are
  // set so that even the worst case — every budget exhausted in turn — stays
  // near a second rather than the several seconds a per-slot budget would give.
  const CROSS_DEPTH = 6, CROSS_MS = 500;
  const LIFT_DEPTH  = 6, LIFT_MS  = 400;
  const F2L_DEPTH   = 8;
  const F2L_QUICK_MS = 100;     // per slot, shallow pass
  const F2L_TOTAL_MS = 600;     // shared by every remaining slot, deep pass

  const cornerFacelets = slot => Cubie.CORNER_FACELETS[slot].map(([f, i]) => ({ face: f, index: i }));
  const edgeFacelets   = slot => Cubie.EDGE_FACELETS[slot].map(([f, i]) => ({ face: f, index: i }));

  const facesToMoves = faces =>
    [...new Set(faces)].flatMap(f => ['', "'", '2'].map(s => f + s));

  /** Where a piece sits, in words — the cube is in front of them, so say it plainly. */
  function edgePlace(at, home) {
    if (at === home) return 'すでに正しい場所にあるが、向きが逆さま';
    if (at < 4) return '上段にある';
    if (at < 8) return '底面の別の場所にある';
    return '中段（側面のまん中）にはさまっている';
  }

  function cornerPlace(at, home) {
    if (at === home) return 'すでに正しい場所にあるが、向きが違う';
    if (at < 4) return '上段にある';
    return '下段の別のスロットに入っている';
  }

  // ── cross ─────────────────────────────────────────────────────────────────

  /**
   * The cheapest cross edge to do next — found rather than chosen, by asking
   * for any sequence that solves one more of them without losing the ones
   * already in place. Shortest-first search means the easy edge comes out on
   * top by itself.
   */
  function crossJob(state, pieces) {
    const solved = CROSS.filter(e => Search.edgesHome(pieces, [e.edge]));
    const done = solved.map(e => e.edge);
    const before = done.length;

    const keep = st => Search.edgesHome(st, done);
    const start = { cp: pieces.cp, co: pieces.co, ep: pieces.ep, eo: pieces.eo };

    const progress = st => keep(st)
      && CROSS.filter(e => Search.edgesHome(st, [e.edge])).length > before;

    const hit = Search.find(start, { goal: progress, maxDepth: CROSS_DEPTH, budgetMs: CROSS_MS });
    if (hit.moves) return crossResult(state, pieces, start, hit.moves, before);

    // Out of reach in one go: bring the next edge up to the top, which is what
    // a human does first anyway, and solve it from there on the next redraw.
    const target = CROSS.find(e => !Search.edgesHome(pieces, [e.edge]));
    const lift = Search.find(start, {
      goal: st => keep(st) && Search.edgeInU(st, target.edge),
      maxDepth: LIFT_DEPTH, budgetMs: LIFT_MS,
    });
    const at = Search.edgeSlot(pieces, target.edge);
    return {
      stage: 'cross',
      title: `クロス（${before + 1} 本目 / ${target.label}）`,
      goal: `${target.label}の辺をまず上段へ出す`,
      moves: lift.moves || [],
      why: `${target.label}の辺は${edgePlace(at, target.edge)}。`
         + 'いきなり入れようとすると他の辺を崩すので、まず上段へ出してから入れる。',
      partial: true,
      highlight: edgeFacelets(at).concat(edgeFacelets(target.edge)),
      stuck: !lift.moves,
    };
  }

  function crossResult(state, pieces, start, moves, before) {
    const after = Search.applySequence(start, moves);
    const gained = CROSS.filter(e => Search.edgesHome(after, [e.edge])
                                 && !Search.edgesHome(pieces, [e.edge]));
    // One sequence can seat two edges at once, and saying "1 本目" while two go
    // home is the kind of small lie that makes someone stop trusting the panel.
    const labels = gained.map(e => e.label).join('・');
    const nth = gained.length === 1 ? `${before + 1} 本目`
      : `${before + 1}〜${before + gained.length} 本目`;
    const rest = CROSS.length - before - gained.length;
    const places = gained.map(e =>
      `${e.label}の辺は${edgePlace(Search.edgeSlot(pieces, e.edge), e.edge)}`).join('、');
    return {
      stage: 'cross',
      title: `クロス（${nth} / ${labels}）`,
      goal: gained.length === 1 ? `${labels}の辺を底面に入れる`
        : `${labels}の辺を ${gained.length} 本まとめて底面に入れる`,
      moves,
      why: `${places}。`
         + `底面の色と側面の色が両方そろって初めて 1 本完成。あと ${rest} 本。`,
      highlight: gained.flatMap(e =>
        edgeFacelets(Search.edgeSlot(pieces, e.edge)).concat(edgeFacelets(e.edge))),
      done: before + gained.length,
      total: CROSS.length,
    };
  }

  // ── F2L ───────────────────────────────────────────────────────────────────

  const CROSS_SLOTS = CROSS.map(e => e.edge);

  /** The pair to do next: whichever one the search can finish in fewest moves. */
  function f2lJob(state, pieces) {
    const start = { cp: pieces.cp, co: pieces.co, ep: pieces.ep, eo: pieces.eo };
    const solvedSlots = SLOTS.filter(s => slotDone(pieces, s));
    const keep = st => Search.edgesHome(st, CROSS_SLOTS)
      && solvedSlots.every(s => slotDone(st, s));
    const remaining = SLOTS.filter(s => !slotDone(pieces, s));

    // Shallow pass over every slot first: an eight-move search costs a quarter
    // of a second, and doing four of those to find out that one of them was
    // three moves is a quarter of a second wasted four times over. The cheap
    // pass answers the common cases and answers them optimally. The deep pass
    // shares one budget between the slots left, so four hard pairs cost the
    // same wait as one — a search that runs out of time falls through to the
    // lift below, which is slower advice but still true advice.
    let best = null;
    for (const [depth, budget] of [[5, F2L_QUICK_MS],
                                   [F2L_DEPTH, Math.ceil(F2L_TOTAL_MS / remaining.length)]]) {
      for (const slot of remaining) {
        const hit = Search.find(start, {
          moves: facesToMoves(slot.faces.concat('U')),
          goal: st => keep(st) && slotDone(st, slot),
          maxDepth: depth, budgetMs: budget,
        });
        if (hit.moves && (!best || hit.moves.length < best.moves.length)) {
          best = { slot, moves: hit.moves };
        }
      }
      if (best) break;
    }
    if (best) return f2lResult(pieces, best.slot, best.moves, solvedSlots.length);

    // Every remaining pair is stuck under something. Lift one out, which is
    // the move a human makes here too, and pair it up on the next redraw.
    const slot = remaining[0];
    const lift = Search.find(start, {
      goal: st => keep(st) && Search.cornerInU(st, slot.corner) && Search.edgeInU(st, slot.edge),
      maxDepth: LIFT_DEPTH, budgetMs: LIFT_MS,
    });
    return {
      stage: 'f2l',
      title: `F2L（${solvedSlots.length + 1} 組目 / ${slot.label}スロット）`,
      goal: `${slot.label}の角と辺を上段へ取り出す`,
      moves: lift.moves || [],
      why: pairWhy(pieces, slot) + '上段に 2 つそろえてから、ペアを組んで 1 回で入れる。',
      partial: true,
      highlight: pairHighlight(pieces, slot),
      stuck: !lift.moves,
    };
  }

  function f2lResult(pieces, slot, moves, doneCount) {
    return {
      stage: 'f2l',
      title: `F2L（${doneCount + 1} 組目 / ${slot.label}スロット）`,
      goal: `${slot.label}の角と辺を 2 個同時に入れる`,
      moves,
      why: pairWhy(pieces, slot)
         + '角と辺を上段でペアにしてから落とすと、2 個が 1 回で入る。',
      highlight: pairHighlight(pieces, slot),
      done: doneCount,
      total: SLOTS.length,
    };
  }

  const slotDone = (st, slot) => Search.cornersHome(st, [slot.corner])
                              && Search.edgesHome(st, [slot.edge]);

  function pairWhy(pieces, slot) {
    const c = Search.cornerSlot(pieces, slot.corner);
    const e = Search.edgeSlot(pieces, slot.edge);
    return `角は${cornerPlace(c, slot.corner)}、辺は${edgePlace(e, slot.edge)}。`;
  }

  function pairHighlight(pieces, slot) {
    return cornerFacelets(Search.cornerSlot(pieces, slot.corner))
      .concat(edgeFacelets(Search.edgeSlot(pieces, slot.edge)));
  }

  // ── OLL / PLL ─────────────────────────────────────────────────────────────

  const U_FACE = () => Array.from({ length: 9 }, (_, i) => ({ face: 'U', index: i }));

  function algJob(pieces, stage) {
    const start = { cp: pieces.cp, co: pieces.co, ep: pieces.ep, eo: pieces.eo };
    const step = stage === 'oll' ? Algs.ollStep(start) : Algs.pllStep(start);
    if (!step) {
      return {
        stage,
        title: stage === 'oll' ? 'OLL（上面をそろえる）' : 'PLL（上段を入れ替える）',
        goal: '手持ちの手順では届かない形',
        moves: [],
        why: '覚えている手順の組み合わせでは届かない形。上段を適当に 1 手順まわして形を変える。',
        highlight: U_FACE(),
        stuck: true,
      };
    }
    return {
      stage,
      title: stage === 'oll' ? 'OLL（上面をそろえる）' : 'PLL（上段を入れ替える）',
      goal: step.goal,
      moves: step.moves,
      why: step.when,
      name: step.name,
      jp: step.jp,
      does: step.does,
      partial: !step.closes,
      highlight: U_FACE(),
    };
  }

  // ── the answer ────────────────────────────────────────────────────────────

  /**
   * What to do now, for this cube.
   * @returns {object} `moves` is the sequence to turn; `partial` marks a job
   *   that only sets up the real one, so the panel can say so instead of
   *   pretending the stage is about to close.
   */
  function next(state) {
    const pieces = Cubie.fromFacelets(state);
    const analysis = CFOP.analyse(state);

    if (analysis.current === 'solved') {
      return {
        stage: 'solved', title: '完成', goal: 'そろっています', moves: [],
        why: 'スクランブルするか、色を塗って別の状態から始められる。',
        highlight: [], stages: analysis.stages,
      };
    }
    const job = analysis.current === 'cross' ? crossJob(state, pieces)
      : analysis.current === 'f2l' ? f2lJob(state, pieces)
      : algJob(pieces, analysis.current);
    return { ...job, stages: analysis.stages };
  }

  window.Step = { next, crossJob, f2lJob, algJob };
})();
