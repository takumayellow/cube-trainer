/**
 * glossary.js — the names, and what the thing named actually does
 *
 * Turning without a name for what you are doing is how people plateau. Every
 * technique the app mentions is listed here with its usual name, the moves, and
 * — the part most tables leave out — what it does to the cube and when it
 * applies.
 *
 * The algorithms are the common public ones; the wording is this project's own.
 * Per-case automatic recognition (F2L 41 / OLL 57 / PLL 21) comes later; for
 * now this is the reference shown next to whichever stage you are in.
 */

(function () {
  'use strict';

  const ENTRIES = [
    // ── triggers: not solutions, but the parts every solution is built from ──
    {
      stage: 'trigger', name: 'Sexy move', jp: 'セクシームーブ', moves: "R U R' U'",
      does: '右前の角を持ち上げて戻す。単体ではそろわないが、6 回繰り返すと元に戻る。'
          + 'F2L・OLL・PLL の多くの手順がこれを部品にしている。',
      when: '手順の中の部品として。まずこの 4 手を体に入れると、他が「その組み合わせ」に見えてくる。',
    },
    {
      stage: 'trigger', name: 'Sledgehammer', jp: 'スレッジハンマー', moves: "R' F R F'",
      does: '右前の角を反対回りに持ち上げて戻す。Sexy move の鏡のような役割。',
      when: 'F2L で角の向きが Sexy move と逆のとき、OLL の Dot / L 型の部品として。',
    },
    {
      stage: 'trigger', name: 'Hedgeslammer', jp: 'ヘッジスラマー', moves: "F R' F' R",
      does: 'Sledgehammer の逆手順。崩した形を戻す向き。',
      when: 'Sledgehammer で作った形を元に戻したいとき。',
    },

    // ── cross ────────────────────────────────────────────────────────────────
    {
      stage: 'cross', name: 'クロスの完成条件', jp: 'cross', moves: '—',
      does: '底面の辺 4 本を、底の色だけでなく側面の色も中心に合わせて入れる。'
          + '側面が合っていないクロスは、そのあとの F2L がすべてずれる。',
      when: '最初。ここだけは手順を覚えるのではなく、自分で道筋を見つけて解く場所。',
    },
    {
      stage: 'cross', name: '上段から直接落とす', jp: 'direct insert',
      moves: 'F2 / R2 / B2 / L2',
      does: '上段の辺を、側面の色が中心と合う位置まで U で運んでから、その面を 180° 回して底へ落とす。1 手で入る。',
      when: '底面の色が上を向いている辺のとき。',
    },
    {
      stage: 'cross', name: '向きが逆の辺', jp: 'flipped cross edge', moves: '（局面による）',
      does: '底面の色が横を向いている辺は 180° では入らない（回すと色が逆になる）。'
          + '上段で向きを変えてから入れるので 3 手かかる。',
      when: '底面の色が側面を向いているとき。180° で入れようとしていないか確かめる。',
    },

    // ── F2L ──────────────────────────────────────────────────────────────────
    {
      stage: 'f2l', name: 'ペア挿入（基本形）', jp: 'F2L basic insert', moves: "U R U' R'",
      does: '上段で角と辺のペアを作り、そのまま 1 回でスロットに落とす。'
          + '角と辺の 2 個が同時に入るのがこの解き方の要点。',
      when: '対象の角も辺も上段にあるとき。角の色が右を向いていれば R 側、左を向いていれば '
          + "U' F' U F の形になる。",
    },
    {
      stage: 'f2l', name: 'スロットから出す', jp: 'pair extraction', moves: "R U R' / R U' R'",
      does: 'スロットに入ってしまった角や辺を、完成部分を壊さずに上段へ追い出す。',
      when: '角か辺が下段に埋まっていて、位置か向きが違うとき。出してから作り直すほうが速い。',
    },
    {
      stage: 'f2l', name: 'キーホール', jp: 'keyhole', moves: '（局面による）',
      does: '別のまだ空いているスロットを「鍵穴」として通し、角だけを短い手数で入れる。'
          + '入るのは角 1 個だが、手数が少ない。',
      when: 'そのスロットの辺がまだ上段にあり、通り道になる未完成スロットがあるとき。',
    },
    {
      stage: 'f2l', name: 'マルチスロッティング', jp: 'multislotting', moves: '（局面による）',
      does: '1 つの手順の途中で次のペアも一緒に動かし、2 組 4 個をまとめて片付ける。',
      when: '次のペアが特定の位置に揃っているときだけ。狙って作るものではなく、見えたら取るもの。',
    },

    // ── OLL ──────────────────────────────────────────────────────────────────
    {
      stage: 'oll', name: '辺の向きそろえ', jp: 'EOLL / 2-look OLL 前半', moves: "F R U R' U' F'",
      does: '上面の辺の向きだけをそろえる。点 → 線 → 十字 と進む。',
      when: '2-look OLL の 1 手目。点なら 2 回、線・L 字なら 1 回で十字になる。',
    },
    {
      stage: 'oll', name: 'Sune', jp: 'スーン（OLL #27）', moves: "R U R' U R U2 R'",
      does: '上面の角 3 つを時計回りにねじる。角が 1 つだけ上を向いている状態から一発でそろう。',
      when: '十字ができていて、上を向いている角が 1 つのとき。',
    },
    {
      stage: 'oll', name: 'Antisune', jp: 'アンチスーン（OLL #26）', moves: "R U2 R' U' R U' R'",
      does: 'Sune の逆向き。上面の角 3 つを反時計回りにねじる。',
      when: 'Sune の鏡の形のとき。この 2 つだけで角の向きは全部処理できる（2-look）。',
    },

    // ── PLL ──────────────────────────────────────────────────────────────────
    {
      stage: 'pll', name: 'T-perm', jp: 'T パーム', moves: "R U R' U' R' F R2 U' R' U' R U R' F'",
      does: '隣り合う角 2 つを入れ替え、同時に手前と右の辺 2 つを入れ替える。'
          + '角と辺を 1 手順で片付けるので使用頻度が高い。',
      when: '角 2 つが隣どうしで入れ替わっていて、辺も 2 つ入れ替わっているとき。',
    },
    {
      stage: 'pll', name: 'Ua-perm', jp: 'U パーム（a）', moves: "R U' R U R U R U' R' U' R2",
      does: '上段の辺 3 つを反時計回りに回す。角には触らない。',
      when: '角は全部正しく、辺だけが 3 つ回っているとき。逆回りは Ub。',
    },
    {
      stage: 'pll', name: 'Y-perm', jp: 'Y パーム', moves: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
      does: '対角の角 2 つを入れ替え、同時に辺 2 つを入れ替える。',
      when: '入れ替わっている角が向かい合っているとき（T-perm では届かない形）。',
    },
    {
      stage: 'pll', name: '角そろえ（2-look 前半）', jp: 'CPLL', moves: "R' F R' B2 R F' R' B2 R2",
      does: '角の位置だけをそろえる（辺は無視）。2-look PLL の 1 手目。',
      when: 'そろっている角のペアを手前以外に置いてから使う。角 4 つが揃えば残りは辺だけ。',
    },
  ];

  const forStage = stage => ENTRIES.filter(e => e.stage === stage || e.stage === 'trigger');

  window.Glossary = { ENTRIES, forStage };
})();
