/**
 * move-words.js — a move, said the way you would say it with the cube in hand
 *
 * "R'" means nothing to someone holding a cube for the first time. "Turn the
 * right face towards you" does. Every direction is for the standard grip the
 * whole app uses — white down, green facing you — and the B moves say which
 * way they look from the front, because nobody turns the cube round to check.
 *
 * Shared by the PC screen and the phone app.
 */

(function () {
  'use strict';

  const WORDS = {
    U: '上の面を左へ回す',        "U'": '上の面を右へ回す',        U2: '上の面を半回転',
    D: '下の面を右へ回す',        "D'": '下の面を左へ回す',        D2: '下の面を半回転',
    R: '右の面を奥へ回す',        "R'": '右の面を手前へ回す',      R2: '右の面を半回転',
    L: '左の面を手前へ回す',      "L'": '左の面を奥へ回す',        L2: '左の面を半回転',
    F: '前の面を時計回りに回す',  "F'": '前の面を反時計回りに回す', F2: '前の面を半回転',
    B: '後ろの面を反時計回りに回す（正面から見て）',
    "B'": '後ろの面を時計回りに回す（正面から見て）',
    B2: '後ろの面を半回転',
  };

  /** The words for one move, or '' for something that is not a move. */
  const describe = move => (Object.prototype.hasOwnProperty.call(WORDS, move) ? WORDS[move] : '');

  /** The move that undoes `move`. */
  const inverse = move => (move.endsWith("'") ? move[0] : move.endsWith('2') ? move : move + "'");

  const MAX_MOVES = 400;        // a pasted essay is a typo, not a sequence
  const MAX_CHARS = MAX_MOVES * 4;   // "R2' " is the longest a move gets

  /**
   * Typed moves, with or without spaces ("R U R' U'" or "RUR'U'").
   * Returns { moves } or { error } — the error names what could not be read.
   */
  function parse(raw) {
    const text = String(raw).replace(/[’′]/g, "'").trim();
    if (text.length > MAX_CHARS) {
      return { error: `手順が長すぎます。${MAX_MOVES} 手までにしてください。` };
    }
    const moves = [];
    const unknown = [];
    const token = /([UDLRFB])(2'|'2|2|')?|\S/g;
    let m;
    while ((m = token.exec(text)) !== null) {
      if (!m[1]) unknown.push(m[0]);
      else moves.push(m[1] + (m[2] ? (m[2].includes('2') ? '2' : "'") : ''));
    }
    if (unknown.length) {
      return { error: `使えない記号があります: ${[...new Set(unknown)].join(' ')}（U D L R F B に ' か 2 を付けた形）` };
    }
    if (moves.length > MAX_MOVES) {
      return { error: `手順が長すぎます（${moves.length} 手）。${MAX_MOVES} 手までにしてください。` };
    }
    return { moves };
  }

  /**
   * The move a key press asks for: the face letter turns it clockwise, with
   * Shift the other way. Shortcuts (Ctrl, Alt, ⌘), IME input and a held-down
   * key's repeats turn nothing.
   */
  function fromKey(ev) {
    if (ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing) return null;
    const k = typeof ev.key === 'string' && ev.key.length === 1 ? ev.key.toUpperCase() : '';
    if (!k || !'UDLRFB'.includes(k)) return null;
    return ev.shiftKey ? k + "'" : k;
  }

  window.MoveWords = { describe, inverse, parse, fromKey, MAX_MOVES };
})();
