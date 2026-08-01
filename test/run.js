// cube-trainer の回帰テスト。
//
//   node test/run.js [試行回数]        既定 200
//
// 検証内容:
//   1. 状態モデル: 手順を当てても駒が壊れない
//   2. Cubie: 実物にありえない状態をはじく
//   3. 2 フェーズ法: 返した手順を当て直して本当に完成するか
//   4. CFOP: フェーズ判定が正しい局面を正しく答えるか
//   5. Glossary: 載せている手順が、書いてある種類の手順として成立しているか
//      （OLL 手順なら第 2 層を壊さない、PLL 手順なら上面を壊さない、など）

'use strict';
const fs = require('fs');
const path = require('path');

// ブラウザ用のファイルをそのまま読み込む（ビルド無しを保つため）
global.window = global;
for (const f of ['cube.js', 'cubie.js', 'two-phase.js', 'cfop.js', 'glossary.js']) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
}

const MOVES = Object.keys(Cube._MOVES);
const solved = () => new Cube().getState();
const after = (moves, from) => {
  const c = new Cube();
  if (from) c._state = JSON.parse(JSON.stringify(from));
  c.applySequence(typeof moves === 'string' ? moves.split(/\s+/).filter(Boolean) : moves);
  return c;
};

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`ok    ${name}`);
};

// ── 1. 状態モデル ────────────────────────────────────────────────────────────
check('位数 (R U) = 105', order(['R', 'U']) === 105);
check("位数 (R U R' U') = 6", order(['R', 'U', "R'", "U'"]) === 6);
function order(seq) {
  const c = new Cube();
  let n = 0;
  do { c.applySequence(seq); n++; } while (!c.isSolved() && n < 500);
  return n;
}

// ── 2. 妥当性の検証 ──────────────────────────────────────────────────────────
const trials = Number(process.argv[2] || 200);
let badValid = 0;
for (let i = 0; i < trials; i++) {
  const c = new Cube();
  c.scramble(25);
  if (!Cubie.validate(c.getState()).ok) badValid++;
}
check(`実際に回した状態は妥当と判定される × ${trials}`, badValid === 0, `${badValid} 件を誤って拒否`);

const flipped = solved();
[flipped.U[1], flipped.B[1]] = [flipped.B[1], flipped.U[1]];   // 辺 1 個だけ裏返す
check('辺 1 個だけの反転をはじく', !Cubie.validate(flipped).ok);

const twisted = solved();
[twisted.U[8], twisted.R[0], twisted.F[2]] = [twisted.R[0], twisted.F[2], twisted.U[8]]; // 角 1 個ねじる
check('角 1 個だけのねじれをはじく', !Cubie.validate(twisted).ok);

const swapped = solved();
[swapped.U[1], swapped.U[7]] = [swapped.U[7], swapped.U[1]];
[swapped.B[1], swapped.F[1]] = [swapped.F[1], swapped.B[1]];   // 辺 2 個だけ入れ替え
check('2 個だけの入れ替えをはじく', !Cubie.validate(swapped).ok);

const wrongCount = solved();
wrongCount.U[0] = 'R';
check('色の枚数が合わない状態をはじく', !Cubie.validate(wrongCount).ok);

// ── 3. 2 フェーズ法 ──────────────────────────────────────────────────────────
const initStart = Date.now();
TwoPhaseSolver.init();
console.log(`\n2 フェーズ法の表の生成: ${Date.now() - initStart} ms`);

let tpFail = 0, tpLen = 0, tpMax = 0;
const tpStart = Date.now();
for (let i = 0; i < trials; i++) {
  const c = new Cube();
  c.scramble(25);
  const state = c.getState();
  const sol = TwoPhaseSolver.solve(state);
  if (!sol || !after(sol, state).isSolved()) { tpFail++; continue; }
  tpLen += sol.length;
  tpMax = Math.max(tpMax, sol.length);
}
check(`2 フェーズ法: ランダム 25 手 × ${trials} を解く`, tpFail === 0, `${tpFail} 件が未完成`);
check('2 フェーズ法: 完成状態では手順が空', TwoPhaseSolver.solve(solved()).length === 0);

// ── 4. CFOP のフェーズ判定 ───────────────────────────────────────────────────
const phaseOf = (moves) => CFOP.analyse(after(moves).getState()).current;

check('完成状態 → solved', phaseOf('') === 'solved');
check("U だけ回す → pll（第 2 層も上面も無傷）", phaseOf('U') === 'pll');
check("Sexy move → f2l（クロスは壊れない）", phaseOf("R U R' U'") === 'f2l');
check('R 単発 → cross（底面の辺が動く）', phaseOf('R') === 'cross');
check("Sune → oll（第 2 層は無傷、上面は崩れる）", phaseOf("R U R' U R U2 R'") === 'oll');
check('T-perm → pll（上面は 1 色のまま）', phaseOf("R U R' U' R' F R2 U' R' U' R U R' F'") === 'pll');

const crossReport = CFOP.analyse(after('R').getState());   // 底面の辺 DR が上へ出る
check('クロスが欠けていればクロスを最優先で指す', crossReport.current === 'cross');
check('クロスの対象駒がハイライトされる', crossReport.highlight.length > 0);

// F2L: 完成状態から FR スロットだけを開ける
const openFR = after("R U R'");
const frReport = CFOP.analyse(openFR.getState());
check('スロットを 1 つ開けたら F2L と判定', frReport.current === 'f2l');
check('開いたスロットを対象にする', frReport.slot && frReport.slot.key === 'FR',
      frReport.slot ? frReport.slot.key : 'なし');
console.log(`      F2L の状況: ${frReport.slot ? frReport.slot.situation.kind : '-'} / ${frReport.label}`);

const solvedReport = CFOP.analyse(solved());
check('完成状態では 4 段階すべて完了', solvedReport.stages.every(s => s.done));

// ── 5. Glossary に載せた手順の性質 ───────────────────────────────────────────
// 「OLL 手順」は第 2 層まで（クロス + F2L）を壊さない。「PLL 手順」はそれに加えて上面を壊さない。
// 書いてある分類が本当かどうかを、判定器そのもので確かめる。
for (const e of Glossary.ENTRIES) {
  if (!/^[URFDLB'2 ]+$/.test(e.moves)) continue;         // 「局面による」は対象外
  const cur = CFOP.analyse(after(e.moves).getState()).current;
  if (e.stage === 'oll') {
    check(`${e.name}: OLL 手順（第 2 層を壊さない）`, cur === 'oll' || cur === 'pll' || cur === 'solved', cur);
  } else if (e.stage === 'pll') {
    check(`${e.name}: PLL 手順（上面も壊さない）`, cur === 'pll' || cur === 'solved', cur);
  }
}

// 位数で性質を確かめる（入れ替え 2 組なら 2 回、3 巡なら 3 回で戻る）
const seq = s => s.split(/\s+/);
check("Sexy move は 6 回で戻る", order(seq("R U R' U'")) === 6);
check('Sledgehammer と Hedgeslammer は逆手順', after("R' F R F' F R' F' R").isSolved());
check('T-perm は 2 回で戻る', order(seq("R U R' U' R' F R2 U' R' U' R U R' F'")) === 2);
check('Y-perm は 2 回で戻る', order(seq("F R U' R' U' R U R' F' R U R' U' R' F R F'")) === 2);
check('Ua-perm は 3 回で戻る（辺 3 巡）', order(seq("R U' R U R U R U' R' U' R2")) === 3);
check('角そろえ (CPLL) は 3 回で戻る（角 3 巡）', order(seq("R' F R' B2 R F' R' B2 R2")) === 3);

console.log(`\n2 フェーズ法: 平均 ${(tpLen / (trials - tpFail)).toFixed(1)} 手 / 最大 ${tpMax} 手 / ` +
            `${((Date.now() - tpStart) / trials).toFixed(1)} ms per solve`);
console.log(failures === 0 ? '\nすべて通過' : `\n${failures} 件が失敗`);
process.exit(failures === 0 ? 0 : 1);
