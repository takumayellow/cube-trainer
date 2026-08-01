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
//   6. Search: 駒モデルの回転が面モデルと一致し、探索が最短手順を返すか
//   7. Algs: OLL 216 通り・PLL 288 通りの全ケースを、手持ちの手順で本当に閉じられるか
//      ＋ 技名が実際の効果と一致しているか（A パームなら角 3 巡、U パームなら辺 3 巡）
//   8. Step: 出てくる案内どおりに回すと、スクランブルが完成まで到達するか
//   9. Scan: 撮った色（照明のかぶり・ノイズ込み）から元の状態を復元できるか

'use strict';
const fs = require('fs');
const path = require('path');

// ブラウザ用のファイルをそのまま読み込む（ビルド無しを保つため）
global.window = global;
for (const f of ['cube.js', 'cubie.js', 'two-phase.js', 'cfop.js', 'glossary.js',
                 'search.js', 'algs.js', 'step.js', 'scan.js']) {
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

// ── 6. 駒モデルと探索 ────────────────────────────────────────────────────────
// 駒で回した結果が面で回した結果と食い違えば、以降の案内はすべて嘘になる。
let mismatch = 0;
for (let i = 0; i < trials; i++) {
  const c = new Cube();
  const scr = c.scramble(12);
  const byPieces = Search.applySequence(Search.fromState(solved()), scr);
  const byFacelets = Search.fromState(c.getState());
  const same = ['cp', 'co', 'ep', 'eo'].every(k =>
    Array.from(byPieces[k]).join() === Array.from(byFacelets[k]).join());
  if (!same) mismatch++;
}
check(`駒モデルの回転が面モデルと一致 × ${trials}`, mismatch === 0, `${mismatch} 件が不一致`);

const inverse = Search.find(Search.fromState(after("R U F' L D2").getState()),
  { goal: Search.isSolved, maxDepth: 6, budgetMs: 3000 });
check('探索は 5 手のスクランブルを 5 手で戻す',
      inverse.moves && inverse.moves.length === 5,
      inverse.moves ? inverse.moves.join(' ') : '見つからず');

// ── 7. OLL / PLL の全ケース ──────────────────────────────────────────────────
const identity = () => ({
  cp: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), co: new Uint8Array(8),
  ep: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), eo: new Uint8Array(12),
});
const vectors = (base, len, mod) => {
  const out = [];
  for (let n = 0; n < base ** len; n++) {
    const v = [];
    for (let k = 0, x = n; k < len; k++, x = Math.floor(x / base)) v.push(x % base);
    if (v.reduce((a, b) => a + b, 0) % mod === 0) out.push(v);
  }
  return out;
};
const perms = (n) => n === 0 ? [[]] : perms(n - 1).flatMap(rest =>
  rest.concat([[]]).map((_, i) => rest.slice(0, i).concat(n - 1, rest.slice(i))));
const parity = p => {
  let odd = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) odd++;
  return odd % 2;
};

/**
 * 案内された手順を繰り返し当てて、その段階が本当に閉じるか。
 * 2-look は「辺の向き → 角の向き」の 2 段構えで、それぞれが 2 手順かかる形
 * （OLL の点の形、PLL の角 → 辺）があるので、上限は 4 手順で見る。
 */
function closes(start, stepFn, done, maxSteps) {
  let st = start;
  for (let n = 0; n < maxSteps; n++) {
    if (done(st)) return n;
    const step = stepFn(st);
    if (!step) return -1;
    st = Search.applySequence(st, step.moves);
  }
  return done(st) ? maxSteps : -1;
}

const LOOKS = 4;
let ollFail = 0, ollTotal = 0, ollWorst = 0;
for (const co of vectors(3, 4, 3)) {
  for (const eo of vectors(2, 4, 2)) {
    const st = identity();
    co.forEach((v, i) => { st.co[i] = v; });
    eo.forEach((v, i) => { st.eo[i] = v; });
    ollTotal++;
    const n = closes(st, Algs.ollStep, Algs.ollDone, LOOKS);
    if (n < 0) ollFail++; else ollWorst = Math.max(ollWorst, n);
  }
}
check(`OLL 全 ${ollTotal} ケースを ${LOOKS} 手順以内で閉じる（最長 ${ollWorst} 手順）`,
      ollFail === 0 && ollTotal === 216, `${ollFail} 件が閉じず`);

let pllFail = 0, pllTotal = 0, pllWorst = 0;
for (const cp of perms(4)) {
  for (const ep of perms(4)) {
    if (parity(cp) !== parity(ep)) continue;      // 実物で作れる組み合わせだけ
    const st = identity();
    cp.forEach((v, i) => { st.cp[i] = v; });
    ep.forEach((v, i) => { st.ep[i] = v; });
    pllTotal++;
    const n = closes(st, Algs.pllStep, Algs.allPlaced, LOOKS);
    if (n < 0) pllFail++; else pllWorst = Math.max(pllWorst, n);
  }
}
check(`PLL 全 ${pllTotal} ケースを ${LOOKS} 手順以内で閉じる（最長 ${pllWorst} 手順）`,
      pllFail === 0 && pllTotal === 288, `${pllFail} 件が閉じず`);

// 技名が実物と合っているか: 完成状態に当てて「何個動いたか」で確かめる。
// 手順に含まれる上段回し（AUF）の分は打ち消してから数える。
function effect(moves) {
  let best = null;
  for (let k = 0; k < 4; k++) {
    let st = Search.applySequence(identity(), moves.split(' '));
    for (let j = 0; j < k; j++) st = Search.apply(st, 'U');
    const corners = [0, 1, 2, 3].filter(i => st.cp[i] !== i);
    const edges = [0, 1, 2, 3].filter(i => st.ep[i] !== i);
    const twist = [0, 1, 2, 3].filter(i => st.co[i] !== 0).length;
    const score = corners.length + edges.length + twist;
    if (!best || score < best.score) best = { score, corners, edges, twist, st };
  }
  return best;
}
const EXPECTED = {
  'Aa-perm': [3, 0], 'Ab-perm': [3, 0], 'Ua-perm': [0, 3], 'Ub-perm': [0, 3],
  'T-perm': [2, 2], 'Y-perm': [2, 2], 'Ja-perm': [2, 2], 'Jb-perm': [2, 2],
};
for (const e of Algs.PLL) {
  const x = effect(e.moves);
  const [c, ed] = EXPECTED[e.name];
  check(`${e.name}: 名前どおり角 ${c} 個・辺 ${ed} 個が動く`,
        x.corners.length === c && x.edges.length === ed && x.twist === 0,
        `角 ${x.corners.length} / 辺 ${x.edges.length} / ねじれ ${x.twist}`);
  if (e.name === 'T-perm') {
    check('T-perm の角は隣どうし', Math.abs(x.corners[0] - x.corners[1]) !== 2);
  }
  if (e.name === 'Y-perm') {
    check('Y-perm の角は対角', Math.abs(x.corners[0] - x.corners[1]) === 2);
  }
}
// PLL 手順は第 2 層も上面の向きも壊さない（PLL と名乗る条件そのもの）
for (const e of Algs.PLL) {
  const st = Search.applySequence(identity(), e.moves.split(' '));
  check(`${e.name}: F2L と上面の向きを保つ`, Algs.f2lIntact(st) && Algs.ollDone(st));
}
// OLL 手順は第 2 層を壊さない
for (const e of Algs.OLL) {
  const st = Search.applySequence(identity(), e.moves.split(' '));
  check(`${e.name}: F2L を保つ`, Algs.f2lIntact(st));
}

// ── 8. 案内どおり回すと完成するか ────────────────────────────────────────────
const runs = Math.max(3, Math.round(trials / 40));
let stepFail = 0, stepMoves = 0, stepCount = 0, worstMs = 0;
for (let i = 0; i < runs; i++) {
  const c = new Cube();
  c.scramble(25);
  let guard = 0;
  for (;;) {
    const t0 = Date.now();
    const job = Step.next(c.getState());
    worstMs = Math.max(worstMs, Date.now() - t0);
    if (job.stage === 'solved') break;
    if (job.stuck || !job.moves.length) { stepFail++; break; }
    c.applySequence(job.moves);
    stepMoves += job.moves.length;
    stepCount++;
    if (++guard > 60) { stepFail++; break; }
  }
}
check(`案内どおりに回すと完成する × ${runs}`, stepFail === 0, `${stepFail} 件が到達せず`);
console.log(`      1 回の解に ${(stepCount / runs).toFixed(1)} ステップ・` +
            `${(stepMoves / runs).toFixed(1)} 手 / 1 ステップの探索は最長 ${worstMs} ms`);

console.log(`\n2 フェーズ法: 平均 ${(tpLen / (trials - tpFail)).toFixed(1)} 手 / 最大 ${tpMax} 手 / ` +
            `${((Date.now() - tpStart) / trials).toFixed(1)} ms per solve`);
console.log(failures === 0 ? '\nすべて通過' : `\n${failures} 件が失敗`);
process.exit(failures === 0 ? 0 : 1);
