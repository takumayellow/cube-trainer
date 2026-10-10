/**
 * mobile/store.js — the one cube every tab of the phone app looks at
 *
 * Coach, scanner and the shortest-solution player all turn the same cube, so
 * it lives here, along with what has to survive switching tabs: the undo
 * history, the scramble that was just applied (so it can be copied onto a real
 * cube), the techniques used so far, and the hint level.
 *
 * Every change says where it came from. A tab that made the change itself
 * already knows what happened; any other source means its picture is stale.
 *
 * The cube and the preferences are kept in localStorage, so closing the tab
 * mid-solve does not throw the solve away. Storage that is blocked or holds
 * something unexpected is ignored: the app then simply starts fresh.
 *
 * Depends on: cube.js, cubie.js, net.js (colour letters)
 */

(function () {
  'use strict';

  const KEY = 'cube-trainer:mobile:v1';
  const MAX_UNDO = 200;
  const MAX_USED = 40;
  const SCRAMBLE_LEN = 20;
  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const STAGES = ['cross', 'f2l', 'oll', 'pll'];

  const cube = new Cube();
  const listeners = new Set();
  let history = [];
  let version = 0;
  let scramble = null;          // moves of the last scramble, until anything else turns the cube
  let used = [];                // techniques finished this solve, oldest first
  let current = null;           // the technique of the job on screen now
  let prefs = { level: 2, mode: 'real' };

  // ── persistence ───────────────────────────────────────────────────────────

  const wellFormed = state => !!state && typeof state === 'object'
    && FACES.every(f => Array.isArray(state[f]) && state[f].length === 9
                        && state[f].every(c => Net.COLOURS.includes(c)));

  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  /** A technique as stored, or null if it is not one. Only known fields survive. */
  function cleanTechnique(t) {
    if (!t || typeof t !== 'object' || !text(t.name, 80)) return null;
    return {
      stage: STAGES.includes(t.stage) ? t.stage : 'f2l',
      name: text(t.name, 80),
      jp: text(t.jp, 80),
      moves: text(t.moves, 400),
      does: text(t.does, 400),
      when: text(t.when, 400),
      count: Number.isInteger(t.count) && t.count > 0 ? Math.min(t.count, 999) : 1,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      if (wellFormed(saved.state) && Cubie.validate(saved.state).ok) cube.setState(saved.state);
      if (Array.isArray(saved.used)) {
        used = saved.used.slice(0, MAX_USED).map(cleanTechnique).filter(Boolean);
      }
      prefs = {
        level: [0, 1, 2, 3].includes(saved.level) ? saved.level : prefs.level,
        mode: ['real', 'sim'].includes(saved.mode) ? saved.mode : prefs.mode,
      };
    } catch { /* blocked or corrupt storage: start fresh */ }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ state: cube.getState(), used, ...prefs }));
    } catch { /* private mode or full: the app still works, it just forgets */ }
  }

  // ── changes ───────────────────────────────────────────────────────────────

  function emit(source) {
    version += 1;
    save();
    for (const fn of listeners) fn(source);
  }

  function change(fn, source) {
    history = history.concat([cube.getState()]).slice(-MAX_UNDO);
    fn();
    if (source !== 'scramble') scramble = null;
    emit(source);
  }

  /** A new solve: what was used on the last one no longer applies. */
  function fresh() {
    used = [];
    current = null;
  }

  const Store = {
    get state() { return cube.getState(); },
    get version() { return version; },
    isSolved: () => cube.isSolved(),

    /** Turn one face. */
    apply(move, source) { change(() => cube.applyMove(move), source); },

    /** Put the cube in a given state within the same solve (stepping through a solution). */
    setState(state, source) { change(() => cube.setState(state), source); },

    /** A cube from somewhere else — a scan or a hand-painted net — starts a new solve. */
    load(state, source) {
      change(() => { fresh(); cube.setState(state); }, source);
    },

    /** Mix the cube up and remember how, so the same mix can be done by hand. */
    scramble() {
      let moves = [];
      change(() => { fresh(); cube.reset(); moves = cube.scramble(SCRAMBLE_LEN); }, 'scramble');
      scramble = moves;
      return moves;
    },

    reset() { change(() => { fresh(); cube.reset(); }, 'reset'); },

    canUndo: () => history.length > 0,

    undo() {
      if (!history.length) return false;
      const prev = history[history.length - 1];
      history = history.slice(0, -1);
      cube.setState(prev);
      scramble = null;
      emit('undo');
      return true;
    },

    scrambleMoves: () => (scramble ? scramble.slice() : null),

    // ── techniques ─────────────────────────────────────────────────────────

    used: () => used.slice(),

    /** Count a finished job's technique; the latest moves replace older ones. */
    record(technique) {
      const t = cleanTechnique(technique);
      if (!t) return;
      const before = used.find(u => u.name === t.name);
      const merged = { ...t, count: before ? before.count + 1 : 1 };
      used = used.filter(u => u.name !== t.name).concat([merged]).slice(-MAX_USED);
      save();
    },

    /** Take back one count of a technique (its finishing move was undone). */
    unrecord(technique) {
      const name = technique && technique.name;
      const before = used.find(u => u.name === name);
      if (!before) return;
      used = before.count > 1
        ? used.map(u => (u === before ? { ...u, count: u.count - 1 } : u))
        : used.filter(u => u !== before);
      save();
    },

    current: () => current,
    setCurrent(technique) { current = technique ? cleanTechnique(technique) : null; },

    // ── preferences ────────────────────────────────────────────────────────

    prefs: () => ({ ...prefs }),
    setPrefs(next) {
      prefs = { ...prefs, ...next };
      save();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  load();
  window.Store = Store;
})();
