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

  window.MoveWords = { describe, inverse };
})();
