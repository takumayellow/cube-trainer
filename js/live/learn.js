/**
 * live/learn.js — what the CFOP mode says next to the arrows, so that solving
 * along teaches the notation and the four stages as a side effect.
 *
 * Faces are named by their centre colour as well as their letter: the player
 * holds the cube any way round, so "R" alone would not say which face is meant.
 *
 * Depends on: window.MoveWords.
 */
'use strict';

(function () {
  const FACE = {
    U: { word: '上', colour: '黄' },
    D: { word: '下', colour: '白' },
    F: { word: '前', colour: '緑' },
    B: { word: '後ろ', colour: '青' },
    R: { word: '右', colour: 'オレンジ' },
    L: { word: '左', colour: '赤' },
  };

  const GRIP = '白を下、緑を手前に持ったときの向きで書いています。';

  const RULE = '記号の文字は回す面です（U 上・D 下・R 右・L 左・F 前・B 後ろ）。'
    + '文字だけならその面を正面から見て時計回りに 90°、\' が付くと反時計回りに 90°、2 が付くと 180° 回します。';

  const STAGES = [
    {
      key: 'cross', label: 'クロス',
      does: '白い面の辺 4 つを、側面の色も合わせて十字にそろえる。ここが土台になる。',
    },
    {
      key: 'f2l', label: 'F2L',
      does: '下 2 段を仕上げる。角と辺を上段でペアにしてから、4 か所のすき間へ 1 組ずつ入れる。',
    },
    {
      key: 'oll', label: 'OLL',
      does: '上面を黄色 1 色にする。上段のパーツの向きだけをそろえ、位置はまだ気にしない。',
    },
    {
      key: 'pll', label: 'PLL',
      does: '上段のパーツの位置を入れ替えて完成させる。上面の黄色は崩さない。',
    },
  ];

  /** One move, read aloud: the letter, the face it means, and what to do. */
  function move(m) {
    const f = FACE[m[0]];
    if (!f) return null;
    const amount = m.endsWith('2') ? '180°' : m.endsWith("'") ? '反時計回りに 90°' : '時計回りに 90°';
    return {
      notation: m,
      face: `${m[0]} = ${f.word}の面（中心が${f.colour}）`,
      turn: m.endsWith('2') ? '2 が付いているので 180°' : m.endsWith("'") ? "' が付いているので反時計回りに 90°" : '文字だけなので時計回りに 90°',
      amount,
      words: MoveWords.describe(m),
    };
  }

  /**
   * The stage track: each stage with done / now / later.
   * @param {Array<{key: string, done: boolean}>} progress from Step.next(...).stages
   * @param {string} current the stage the plan belongs to
   */
  function track(progress, current) {
    const done = new Map((progress || []).map(s => [s.key, s.done]));
    return STAGES.map(s => ({
      ...s,
      state: s.key === current ? 'now' : done.get(s.key) ? 'done' : 'later',
    }));
  }

  // Short runs that recur inside the algorithms. Seeing them as one unit is how
  // algorithms are usually learnt: four moves to remember become one name.
  const TRIGGERS = [
    { moves: ['R', 'U', "R'", "U'"], name: 'セクシームーブ' },
    { moves: ["L'", "U'", 'L', 'U'], name: '左のセクシームーブ' },
    { moves: ["R'", 'F', 'R', "F'"], name: 'スレッジハンマー' },
    { moves: ['R', 'U', "R'"], name: '' },
    { moves: ['R', "U'", "R'"], name: '' },
    { moves: ["L'", "U'", 'L'], name: '' },
    { moves: ["L'", 'U', 'L'], name: '' },
  ];

  /**
   * Split moves into triggers and single moves, longest trigger first.
   * @returns {Array<{from: number, to: number, name: string}>} one entry per
   *   trigger found; `to` is exclusive. Moves outside every entry stand alone.
   */
  function groups(moves) {
    const out = [];
    let i = 0;
    while (i < moves.length) {
      const t = TRIGGERS.find(g => g.moves.every((m, k) => moves[i + k] === m));
      if (t) { out.push({ from: i, to: i + t.moves.length, name: t.name }); i += t.moves.length; } else i += 1;
    }
    return out;
  }

  const stageInfo = key => STAGES.find(s => s.key === key) || null;

  window.Learn = { move, track, groups, stageInfo, TRIGGERS, STAGES, FACE, RULE, GRIP };
})();
