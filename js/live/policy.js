/**
 * live/policy.js — decide what the player should turn next, and say why.
 *
 * The tracker reports the turns it saw. Each one either follows the plan, or
 * it does not. A turn off the plan is answered in the gentlest way that still
 * gets the cube solved:
 *
 *   1. the right layer turned the wrong amount → finish or back off that layer;
 *   2. a different layer → turn it back first, then carry on with the plan;
 *   3. too far off (several stray turns, or undoing costs much more than a
 *      fresh start) → drop the plan and solve from where the cube is now.
 *
 * Every decision comes with a short note for the screen, so the player always
 * knows which of these is happening.
 *
 * Depends on: window.Cube, window.TwoPhaseSolver, window.Step, window.MoveWords, window.Track.
 */
'use strict';

(function () {
  const MAX_UNDO = 2;        // stray turns we still ask to be turned back
  const UNDO_SLACK = 2;      // undoing may cost this many turns more than a fresh plan
  const SOLVE_BUDGET = 150;  // ms for a fresh shortest plan

  const AMOUNT = { '': 1, '2': 2, "'": 3 };
  const SUFFIX = ['', '', '2', "'"];
  const amountOf = m => AMOUNT[m.slice(1)];
  const moveOf = (layer, n) => (((n % 4) + 4) % 4 === 0 ? null : layer + SUFFIX[((n % 4) + 4) % 4]);

  const apply = (state, moves) => {
    const c = new Cube();
    c._state = c._clone(state);
    for (const m of moves) c.applyMove(m);
    return c;
  };

  /**
   * @param {object} state the cube as read
   * @param {{mode?: 'shortest'|'steps'}} [opts] shortest: fewest turns;
   *   steps: one CFOP stage at a time, the way people learn it
   */
  function create(state, opts) {
    let mode = (opts && opts.mode) || 'shortest';
    let cube = state;
    let plan = [];
    let undo = 0;            // how many turns at the head of `plan` only take back strays
    let stage = null;        // steps mode: the stage the plan belongs to
    let job = null;          // steps mode: Step.next's answer the plan came from
    let note = null;

    function fresh(s) {
      job = null;
      stage = null;
      if (apply(s, []).isSolved()) return [];
      if (mode === 'steps') {
        job = Step.next(s);
        // A shape the known algorithms do not reach: turn the top once and look again.
        if (!job.moves.length) job = { ...job, moves: ['U'] };
        stage = job.title || null;
        return job.moves.slice();
      }
      return TwoPhaseSolver.solve(s, { budgetMs: SOLVE_BUDGET })
        || TwoPhaseSolver.solve(s, { budgetMs: SOLVE_BUDGET * 10 }) || [];
    }

    function replan(kind, text) {
      if (apply(cube, []).isSolved()) { solvedNote(); return; }
      plan = fresh(cube);
      undo = 0;
      note = { kind, text: text.replace('{n}', String(plan.length)) };
    }

    function solvedNote() {
      plan = [];
      undo = 0;
      note = { kind: 'solved', text: '完成です！' };
    }

    /** One turn the player made. */
    function take(m) {
      cube = apply(cube, [m])._state;
      if (apply(cube, []).isSolved()) { solvedNote(); return; }
      const want = plan[0];
      if (want === m) {
        plan.shift();
        if (undo > 0) {
          undo -= 1;
          note = undo === 0
            ? { kind: 'back', text: '戻せました。予定の手順に戻ります' }
            : { kind: 'undo', text: `あと ${undo} 手戻してください` };
        } else {
          note = { kind: 'plan', text: '予定どおりです' };
        }
        if (!plan.length) replan('plan', mode === 'steps' ? '次の段階へ進みます（{n} 手）' : '予定どおりです');
        return;
      }
      if (want && want[0] === m[0]) {
        // Same layer, wrong amount: the rest of that layer's turn is what's left.
        const rest = moveOf(m[0], amountOf(want) - amountOf(m));
        plan[0] = rest;
        note = { kind: 'adjust', text: `同じ列をもう少し: ${MoveWords.describe(rest) || rest}` };
        return;
      }
      // A different layer: take it back first, unless that has become the long way round.
      const back = MoveWords.inverse(m);
      const viaUndo = 1 + plan.length;
      const restart = fresh(cube);
      if (undo + 1 > MAX_UNDO || viaUndo > restart.length + UNDO_SLACK) {
        plan = restart;
        undo = 0;
        note = { kind: 'restart', text: `ずれが大きいので、ここからの${mode === 'steps' ? '手順' : '最短手順'}に切り替えました（${plan.length} 手）` };
        return;
      }
      plan.unshift(back);
      undo += 1;
      note = { kind: 'undo', text: `さっきの手を戻してください（${MoveWords.describe(back) || back}）` };
    }

    replan('start', mode === 'steps' ? 'CFOP の段階ごとに進めます（{n} 手）' : '最短手順で進めます（{n} 手）');

    return {
      get plan() { return plan.slice(); },
      get note() { return note; },
      get state() { return cube; },
      get mode() { return mode; },
      get stage() { return stage; },
      get undoing() { return undo; },
      /** Steps mode: the job being worked on, or null. */
      get job() { return job; },
      /**
       * Steps mode: how far into the job's moves the player is, or -1 when the
       * plan has left them (a stray to take back, or a partial turn).
       */
      get at() {
        if (!job) return -1;
        const k = job.moves.length - plan.length;
        return k >= 0 && plan.every((m, i) => m === job.moves[k + i]) ? k : -1;
      },

      /** Turns the tracker saw, oldest first. `now` is the tracker's cube after them. */
      saw(moves, now) {
        for (const m of moves) take(m);
        // The tracker is the authority on the cube; if we disagree, trust it and plan again.
        if (now && Object.keys(now).some(f => now[f].join('') !== cube[f].join(''))) {
          cube = now;
          replan('restart', 'キューブの状態を読み直しました。ここからの手順（{n} 手）');
        }
      },

      /** Switch between shortest and step-by-step; plans again from here. */
      setMode(next) {
        mode = next;
        replan('start', mode === 'steps' ? 'CFOP の段階ごとに進めます（{n} 手）' : '最短手順で進めます（{n} 手）');
      },

      /** The cube was read again from scratch. */
      reset(newState, text) {
        cube = newState;
        replan('restart', text || '読み直した状態からの手順です（{n} 手）');
      },
    };
  }

  // A solved belief is only as good as the faces behind it: a turn of a layer
  // the camera could not see goes unnoticed. Four faces seen in one colour
  // leave at most one edge unseen, and one edge cannot be wrong on its own.
  const CHECK_FACES = 4;

  /**
   * Where to look next while confirming a cube believed solved.
   * @param {string} face the face in view
   * @param {number} quarters its turn on camera
   * @param {Set<string>} checked faces already seen in one colour
   * @returns {{target: string, dir: 'up'|'down'|'left'|'right'|'flip'} | null}
   *   `dir` is the way to rotate the whole cube; null once enough faces are seen.
   */
  function checkNext(face, quarters, checked) {
    if (checked.size >= CHECK_FACES) return null;
    const left = Track.FACES.filter(f => f !== face && !checked.has(f));
    const target = left.find(f => f !== Track.OPPOSITE[face]) || left[0];
    if (!target) return null;
    const how = Track.showFace(face, quarters, target);
    const BACK = { up: 'down', down: 'up', left: 'right', right: 'left', flip: 'flip' };
    return { target, dir: BACK[how.toward] };
  }

  window.Policy = { create, checkNext, CHECK_FACES, MAX_UNDO, UNDO_SLACK };
})();
