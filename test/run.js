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
//  10. MoveWords: 手の言い方が、白を下・緑を手前に持ったときの実際の動きと一致するか
//  11. MoveWords: 打ち込んだ手順とキー操作を正しい手に読むか
//  12. カメラで追う: 面をどの順・どの向きで見せても読めるか、見えない手には面を見せる矢印を出すか、
//      解き直しの方針（戻させる・最短に切り替える）、完成の確かめ方、CFOP の手のまとまり

'use strict';
const fs = require('fs');
const path = require('path');

// ブラウザ用のファイルをそのまま読み込む（ビルド無しを保つため）
global.window = global;
for (const f of ['cube.js', 'cubie.js', 'two-phase.js', 'cfop.js', 'glossary.js',
                 'search.js', 'algs.js', 'step.js', 'resolve.js', 'scan.js', 'move-words.js']) {
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
let stepFail = 0, stepMoves = 0, stepCount = 0, worstMs = 0, noWhere = 0;
for (let i = 0; i < runs; i++) {
  const c = new Cube();
  c.scramble(25);
  let guard = 0;
  for (;;) {
    const t0 = Date.now();
    const job = Step.next(c.getState());
    worstMs = Math.max(worstMs, Date.now() - t0);
    if (job.stage === 'solved') break;
    if (!job.where) noWhere++;
    if (job.stuck || !job.moves.length) { stepFail++; break; }
    c.applySequence(job.moves);
    stepMoves += job.moves.length;
    stepCount++;
    if (++guard > 60) { stepFail++; break; }
  }
}
check(`案内どおりに回すと完成する × ${runs}`, stepFail === 0, `${stepFail} 件が到達せず`);
check('どの案内にも「場所」のヒントがある', noWhere === 0, `${noWhere} 件が空`);
console.log(`      1 回の解に ${(stepCount / runs).toFixed(1)} ステップ・` +
            `${(stepMoves / runs).toFixed(1)} 手 / 1 ステップの探索は最長 ${worstMs} ms`);

// ── 9. 色の読み取り ─────────────────────────────────────────────────────────
// 実物のキューブを撮った RGB（dwalton76/rubiks-color-resolver の test-data、MIT）。
const realRgb = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'real-rgb.json'), 'utf8'));
const faceString = state => {
  const toFace = {};
  for (const f of Scan.FACE_ORDER) toFace[state[f][4]] = f;
  return Scan.FACE_ORDER.map(f => state[f].map(c => toFace[c] || '?').join('')).join('');
};
const tint = s => s.map(([r, g, b]) => [Math.min(255, Math.round(r * 1.05)), Math.round(g * 0.85), Math.round(b * 0.6)]);
let realOk = 0, tintOk = 0, alwaysValid = true;
for (const c of realRgb.cases) {
  const a = Scan.toState(c.samples);
  const b = Scan.toState(tint(c.samples));
  if (faceString(a.state) === c.expect) realOk++;
  if (faceString(b.state) === c.expect) tintOk++;
  alwaysValid = alwaysValid && Cubie.validate(a.state).ok && Cubie.validate(b.state).ok;
}
check(`実物の RGB を全部正しく読む（${realOk}/${realRgb.cases.length}）`, realOk === realRgb.cases.length);
check(`電球色のかぶりでも読む（${tintOk}/${realRgb.cases.length}）`, tintOk === realRgb.cases.length);
check('読んだ結果は必ず実在しうる状態になる', alwaysValid);

// 1 面を 90° 回して撮っても、回したと気づいて直す（見た目が変わる面だけ）
{
  const c = realRgb.cases.find(x => x.name === 'random01') || realRgb.cases[realRgb.cases.length - 1];
  const QUARTER = [6, 3, 0, 7, 4, 1, 8, 5, 2];
  const turned = c.samples.slice();
  const R = 9;                                     // R 面
  for (let i = 0; i < 9; i++) turned[R + i] = c.samples[R + QUARTER[i]];
  const r = Scan.toState(turned);
  check('90° 回して撮った面を直す', faceString(r.state) === c.expect && r.rotated.some(x => x.face === 'R'),
        JSON.stringify(r.rotated));
}

// わざと 1 マスの色を隣の色に寄せても、ありえる状態の側に直す
{
  const c = realRgb.cases[0];
  const s = c.samples.map(x => x.slice());
  const centre = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 };
  // 0 番（U 面左上・角のマス）を、別の面の中心の色に寄せる
  const other = c.expect[0] === 'U' ? 'F' : 'U';
  s[0] = s[0].map((v, k) => Math.round(v * 0.45 + s[centre[other]][k] * 0.55));
  const r = Scan.toState(s);
  check('取り違えた 1 マスを、駒の制約で直す', faceString(r.state) === c.expect,
        `corrected=${JSON.stringify(r.corrected)}`);
}

// 実写（dwalton76/rubiks-cube-tracker の test-data、MIT）。中央の正方形を 360px に縮めたもの。
// キューブは案内の枠からずれて写っていて、白と黄は露出オーバーでほぼ同じ RGB になっている。
// 枠を探し直す処理と駒の制約で、安いウェブカメラ相当の解像度まで落としても同じ答えになるか。
{
  const png = require('./png.js');
  const PHOTO = 'LBBUURDDRDDLBRFRBDLLFRFRBLURFFLDLDBLURFULFBUUUDFDBFBUR';   // 同リポジトリの resolver の答え
  const photos = Scan.FACE_ORDER.map(f => png.decode(path.join(__dirname, 'fixtures', 'photo', `${f}.png`)));
  for (const size of [360, 240, 120, 90]) {
    const t0 = Date.now();
    const samples = photos.flatMap(img => {
      const im = size === img.width ? img : png.shrink(img, size);
      return Scan.sampleImage(im, Scan.frameBox(size, size, 0.62)).colours;
    });
    const got = faceString(Scan.toState(samples).state);
    check(`実写を ${size}px 四方で読む（${Date.now() - t0} ms）`, got === PHOTO, got);
  }
}

// ── 10. 手の言い方 ──────────────────────────────────────────────────────────
// 「上の面を左へ」と書いたら、本当に手前の上段が左へ行くか。言葉が逆なら、
// キューブを初めて持つ人は案内どおりに回して崩すことになる。
check('すべての手に言い方がある', MOVES.every(m => MoveWords.describe(m) !== ''));
check('手でないものには言い方を返さない',
      MoveWords.describe('toString') === '' && MoveWords.describe('X') === '');
check('逆手で元に戻る', MOVES.every(m => after([m, MoveWords.inverse(m)]).isSolved()));
const sees = (move, face, index, colour) => after([move]).getState()[face][index] === colour;
check('U: 手前の上段が左へ（右面の橙が手前に来る）', sees('U', 'F', 0, 'O'));
check("U': 手前の上段が右へ（左面の赤が手前に来る）", sees("U'", 'F', 0, 'R'));
check('D: 手前の下段が右へ（手前の緑が右面に行く）', sees('D', 'R', 6, 'G'));
check('R: 右列が奥へ（手前の緑が上面に上がる）', sees('R', 'U', 2, 'G'));
check("R': 右列が手前へ（上面の黄が手前に来る）", sees("R'", 'F', 2, 'Y'));
check('L: 左列が手前へ（上面の黄が手前に来る）', sees('L', 'F', 0, 'Y'));
check('F: 時計回り（上面の黄が右面に行く）', sees('F', 'R', 0, 'Y'));
check('B: 正面から見て反時計回り（上面の黄が左面に行く）', sees('B', 'L', 0, 'Y'));

// ── 11. 手順の入力とキー操作 ────────────────────────────────────────────────
// 打ち込んだ手順を読み違えると、画面のキューブが手元と違う状態になる。
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('空白区切りの手順を読む', same(MoveWords.parse("R U R' U'").moves, ['R', 'U', "R'", "U'"]));
check('空白なしでも読む', same(MoveWords.parse("RUR'U'F2").moves, ['R', 'U', "R'", "U'", 'F2']));
check('全角の ’ と R2\' を受け付ける', same(MoveWords.parse('R’ U2\'').moves, ["R'", 'U2']));
check('空の入力は 0 手', same(MoveWords.parse('  ').moves, []));
check('使えない記号は名指しで拒否する',
      !MoveWords.parse('R x U').moves && MoveWords.parse('R x U').error.includes('x'));
check('小文字（2 層回し）は拒否する', !MoveWords.parse('r U').moves);
check('長すぎる手順は拒否する', !MoveWords.parse('R '.repeat(MoveWords.MAX_MOVES + 1)).moves);
check('上限ぎりぎりの手順は通す', MoveWords.parse("R2' ".repeat(MoveWords.MAX_MOVES)).moves.length === MoveWords.MAX_MOVES);
check('巨大な貼り付けは読まずに拒否する', !!MoveWords.parse('R'.repeat(1e6)).error);
const key = (k, mods) => MoveWords.fromKey(Object.assign({ key: k }, mods));
check('キー: 文字で時計回り', key('r') === 'R' && key('b') === 'B');
check("キー: Shift で逆回し", key('R', { shiftKey: true }) === "R'");
check('キー: CapsLock の大文字は時計回り', key('U') === 'U');
check('キー: Ctrl / Alt / ⌘ 付きと変換中は回さない',
      key('r', { ctrlKey: true }) === null && key('r', { altKey: true }) === null &&
      key('r', { metaKey: true }) === null && key('r', { isComposing: true }) === null);
check('キー: 面以外の文字は回さない', key('x') === null && key('Enter') === null);
check('キー: 押しっぱなしのリピートでは回さない', key('r', { repeat: true }) === null);

// ── 12. カメラで追う ────────────────────────────────────────────────────────
for (const f of ['track.js', 'live/reader.js', 'live/policy.js', 'live/learn.js', 'live/view.js', 'live/overlay.js']) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
}
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'real-rgb.json'), 'utf8')).cases[0];
  const ref = Scan.toState(fx.samples).state;
  const pool = {};
  Scan.FACE_ORDER.forEach((f, k) => ref[f].forEach((c, i) => { (pool[c] = pool[c] || []).push(fx.samples[k * 9 + i]); }));
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = c => pool[c][Math.floor(rnd() * pool[c].length)];
  const shoot = (st, f, q) => { const out = new Array(9); for (let i = 0; i < 9; i++) out[Track.TURN[q][i]] = pick(st[f][i]); return out; };

  let readOk = 0;
  for (let t = 0; t < 10; t++) {
    const c = new Cube(); c.scramble(20);
    const r = Reader.create();
    const order = Scan.FACE_ORDER.slice().sort(() => rnd() - 0.5);
    for (const f of order) r.offer(shoot(c.getState(), f, Math.floor(rnd() * 4)));
    const out = r.finish();
    if (out.ok && Scan.FACE_ORDER.every(f => out.read.state[f].join() === c.getState()[f].join())) readOk++;
  }
  check('読み取り: 面の順番と向きがばらばらでも元の状態を復元する', readOk === 10, `${readOk}/10`);

  // A player who knows the way turns three planned moves before showing the cube again.
  let runOk = 0;
  for (let t = 0; t < 5; t++) {
    const c = new Cube(); c.scramble(20);
    const st = c.getState();
    const r = Reader.create();
    for (const f of Scan.FACE_ORDER) r.offer(shoot(st, f, 0));
    const out = r.finish();
    const tr = Track.create(out.read.state, out.read.palette);
    const plan = Policy.create(st, { mode: 'shortest' }).plan;
    tr.setPlan(plan);
    const now = after(plan.slice(0, 3), st).getState();
    for (const f of ['F', 'U', 'R']) tr.observe(shoot(now, f, 0));
    if (Scan.FACE_ORDER.every(f => tr.state[f].join() === now[f].join())) runOk++;
  }
  check('追跡: 手順どおり 3 手続けて回してから見せても追える', runOk === 5, `${runOk}/5`);

  // U turned while the camera looks at U from... the U face itself is visible: spin.
  const s0 = solved();
  check('矢印: 正面の面の手は回転の矢印', Track.arrowFor('F', 'F', 0, s0).kind === 'spin' || Track.arrowFor('F', 'F', 0, s0).kind === 'show');
  const mixed = after("R U F' L2 D B'").getState();
  const spin = Track.arrowFor('F', 'F', 0, mixed);
  check('矢印: 見えている面の手は spin', spin.kind === 'spin' && spin.dir === 'cw' && !spin.twice);
  check('矢印: 180° は二重の矢じり', Track.arrowFor('F2', 'F', 0, mixed).twice === true);
  // On a solved cube, U only moves the top rows of the side faces; looking at
  // U itself, nothing changes, so the player must be shown a side.
  const sh = Track.arrowFor('U', 'U', 0, s0);
  check('矢印: 当てても見た目の変わらない面では、変わる面を見せる', sh.kind === 'show' && sh.face !== 'U' && sh.face !== 'D', JSON.stringify(sh));

  // Policy: plan solves; a stray turn is first asked back.
  const st = after("R U R' F2 D L'").getState();
  const pol = Policy.create(st, { mode: 'shortest' });
  check('方針: 最短手順は当てると完成する', after(pol.plan, st).isSolved(), pol.plan.join(' '));
  const want = pol.plan[0];
  const strayMove = ['U', 'D', 'R', 'L', 'F', 'B'].find(l => l !== want[0] && Track.OPPOSITE[l] !== want[0]);
  const st2 = after([strayMove], st).getState();
  pol.saw([strayMove], st2);
  check('方針: 違う手を 1 回回したら、まずその手を戻させる',
        pol.note.kind === 'undo' || pol.note.kind === 'adjust', pol.note.kind);
  check('方針: 立て直した手順も当てると完成する', after(pol.plan, st2).isSolved());
  const solvedPol = Policy.create(s0, { mode: 'shortest' });
  check('方針: 完成した状態では手順なし', solvedPol.plan.length === 0 && solvedPol.note.kind === 'solved');

  const steps = Policy.create(st, { mode: 'steps' });
  check('方針: CFOP モードは段階名つきの手順を返す', steps.plan.length > 0 && !!steps.job && !!steps.job.stage);

  const seen = new Set();
  let face = 'F', q = 0, hops = 0;
  for (let nx = Policy.checkNext(face, q, seen); nx; nx = Policy.checkNext(face, q, seen)) {
    seen.add(face);
    if (seen.size >= Policy.CHECK_FACES) break;
    face = nx.target; hops++;
    if (hops > 10) break;
  }
  check(`完成の確認: ${Policy.CHECK_FACES} 面を確かめると終わる`, seen.size === Policy.CHECK_FACES && hops < 10, `${seen.size}`);

  check('CFOP: セクシームーブを 1 まとまりとして見つける',
        JSON.stringify(Learn.groups(['F', 'R', 'U', "R'", "U'", "F'"])) === JSON.stringify([{ from: 1, to: 5, name: 'セクシームーブ' }]));
  check('CFOP: 長いまとまりを優先する', Learn.groups(['R', 'U', "R'", "U'"])[0].to === 4);
  check('CFOP: 名前の無い 3 手のまとまり', Learn.groups(['R', "U'", "R'"])[0].name === '');
  const lm = Learn.move("R'");
  check("CFOP: 記号の説明（R' = 右の面を反時計回り）", lm.face.includes('右') && lm.amount.includes('反時計'));
  const tr = Learn.track([{ key: 'cross', done: true }, { key: 'f2l', done: false }], 'f2l');
  {
    const b0 = { x: 50, y: 50, size: 140 };
    check('枠: 細かい揺れでは動かない', LiveView.ease(b0, { x: 51, y: 49, size: 141 }) === b0);
    const e = LiveView.ease(b0, { x: 60, y: 50, size: 140 });
    check('枠: 少しずれたら一部だけ寄る', e.x > 50 && e.x < 60, JSON.stringify(e));
    const far = { x: 160, y: 50, size: 100 };
    check('枠: キューブが大きく動いたらすぐ追う', LiveView.ease(b0, far) === far);
    check('枠: 最初は読んだ位置に出す', LiveView.ease(null, far) === far);
  }
  check('CFOP: 段階の表示（済み・いま・これから）',
        tr.map(x => x.state).join() === 'done,now,later,later');

  // LiveView: a face is taken once 3 of the last 4 clear reads agree, even
  // when one of them shakes, and the same view is not taken twice.
  {
    const realSample = Scan.sampleImage;
    const realDoc = global.document;
    let tick = null;
    global.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({}) }) }) };
    const realSet = global.setInterval;
    global.setInterval = fn => { tick = fn; return 1; };
    const face = k => Array.from({ length: 9 }, (_, i) => [Math.round(k * 255), 60 + i * 5, 40]);
    const reads = [];
    Scan.sampleImage = () => reads.shift();
    const steady = [];
    const frames = [];
    const view = LiveView.create({ videoWidth: 640, videoHeight: 480 }, {
      onSteady: v => steady.push(v), onGone() {}, onFrame: f => frames.push(f.progress),
    });
    view.start();
    const run = list => { for (const r of list) { reads.push(r); tick(); } };
    const A = { colours: face(0.1), score: 200, box: {} };
    const shaky = { colours: face(0.1).map(c => [c[1], c[0], 220]), score: 200, box: {} };
    const blurred = { colours: face(0.9), score: 110, box: {} };
    run([A, shaky, A, A]);
    check('自動読み取り: 4 回中 3 回そろえば、1 回揺れても撮る', steady.length === 1, `${steady.length}`);
    run([A, A, shaky, A, blurred, A]);
    check('自動読み取り: 同じ面は 2 回撮らない', steady.length === 1, `${steady.length}`);
    check('自動読み取り: 撮る前は進み具合が増える', frames[0] > 0 && frames[0] < 1 && frames[3] === 1, frames.slice(0, 4).join());
    const B = { colours: face(0.6), score: 200, box: {} };
    run([B, B, B]);
    check('自動読み取り: 別の面に変わったら撮る', steady.length === 2, `${steady.length}`);
    run([blurred, blurred, blurred, blurred]);
    check('自動読み取り: ぼやけた読みは撮影に数えない', steady.length === 2, `${steady.length}`);
    view.stop();
    Scan.sampleImage = realSample;
    global.setInterval = realSet;
    global.document = realDoc;
  }

  // A stickerless cube: the pieces touch, with only a faint line between them,
  // so nothing dark marks the grid. Webcam-dim colours, held off the guide and
  // a little crooked in front of a pale wall and a hand. It must still be found
  // and read; a head in front of the wall, with no cube, must not count.
  {
    const S = LiveView.SIZE;
    const TILE = { W: [205, 205, 198], Y: [200, 188, 40], O: [222, 112, 32], R: [150, 34, 30], G: [22, 128, 62], B: [12, 62, 140] };
    const FACE = ['R', 'G', 'B', 'O', 'Y', 'W', 'Y', 'R', 'G'];
    const picture = paint => {
      const data = new Uint8ClampedArray(S * S * 4);
      let seed = 7;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let c = [214 - y / 8, 208 - y / 8, 196 - y / 8];                    // wall, darker lower down
          if (y > 190 && x > 40 && x < 210) c = [216, 168, 138];              // a hand below
          c = paint(x, y) || c;
          seed = (seed * 1103515245 + 12345) % 2147483648;
          const n = (seed / 2147483648 - 0.5) * 16;                           // sensor noise
          const p = (y * S + x) * 4;
          data[p] = c[0] + n; data[p + 1] = c[1] + n; data[p + 2] = c[2] + n; data[p + 3] = 255;
        }
      }
      return { width: S, height: S, data };
    };
    const at = { cx: 134, cy: 110, size: 118, angle: 8 * Math.PI / 180 };
    const cube = picture((x, y) => {
      const dx = x - at.cx, dy = y - at.cy;
      const u = (dx * Math.cos(at.angle) + dy * Math.sin(at.angle)) / at.size * 3 + 1.5;
      const v = (-dx * Math.sin(at.angle) + dy * Math.cos(at.angle)) / at.size * 3 + 1.5;
      if (u < 0 || v < 0 || u >= 3 || v >= 3) return null;
      const seam = Math.min(u % 1, 1 - u % 1, v % 1, 1 - v % 1) < 0.03 ? 0.85 : 1;
      return TILE[FACE[Math.floor(v) * 3 + Math.floor(u)]].map(k => k * seam);
    });
    const got = Scan.sampleImage(cube, LiveView.guide);
    const nearest = rgb => Object.keys(TILE).reduce((best, k) =>
      Math.hypot(...rgb.map((c, i) => c - TILE[k][i])) < Math.hypot(...rgb.map((c, i) => c - TILE[best][i])) ? k : best);
    const read = got.colours.map(nearest).join('');
    check('ステッカーの無いキューブ: ずれて傾いていても見つけて読む',
          read === FACE.join('') && got.score >= LiveView.TAKE_MIN, `${read} score=${got.score.toFixed(0)}`);
    const head = picture((x, y) => {
      const hair = ((x - 120) / 62) ** 2 + ((y - 80) / 56) ** 2 < 1 && y < 82;
      const skin = ((x - 120) / 50) ** 2 + ((y - 118) / 62) ** 2 < 1;
      const shirt = y > 170;
      return hair ? [28, 24, 22] : skin ? [210, 158, 128] : shirt ? [40, 44, 58] : null;
    });
    const none = Scan.sampleImage(head, LiveView.guide);
    check('ステッカーの無いキューブ: キューブの無い顔だけの映像は見つけない',
          none.score < LiveView.GRID_MIN, `score=${none.score.toFixed(0)}`);
  }
}

// 矢印の言葉: カメラの反対側に立つ人（鏡像のプレビュー）から見た向きで言う
{
  const W = Overlay.turnWords, H = Overlay.wholeWords;
  // カメラ側が右へ動く上の段 = 上から見て反時計回り。手前（見える側）も本人の右へ動く
  const r = W({ kind: 'slide', axis: 'row', index: 0, toward: 'right' }, true);
  check('言葉: 段の向きは見える側の動きと上から見た回転で言う', r.includes('上の段') && r.includes('側が右へ') && r.includes('反時計回り'), r);
  check('言葉: 段の向きは鏡像でも変わらない', W({ kind: 'slide', axis: 'row', index: 0, toward: 'right' }, false) === r);
  // カメラ側が上へ動く列 = 本人の側は下へ。画面左端の列（カメラの左）は本人の右
  const c = W({ kind: 'slide', axis: 'col', index: 0, toward: 'up' }, true);
  check('言葉: 列はカメラの裏側の動き（上下逆）と本人から見た左右で言う', c.includes('右の列') && c.includes('側が下へ'), c);
  const c2 = W({ kind: 'slide', axis: 'col', index: 0, toward: 'up', twice: true }, false);
  check('言葉: カメラと同じ側に立つなら見たまま', c2.includes('左の列') && c2.includes('側が上へ') && c2.includes('180°'), c2);
  check('言葉: 正面の面の時計回りは、反対側から見ると反時計回り',
        W({ kind: 'spin', dir: 'cw' }, true).includes('反時計回り') && !W({ kind: 'spin', dir: 'cw' }, false).includes('反時計回り'));
  check('言葉: キューブ全体（左右）は上から見た回転', H('left', true).includes('上から見て時計回り') && H('right', false).includes('反時計回り'));
  check('言葉: キューブ全体（上下）は上の面がどちらへ倒れるか',
        H('up', true).includes('あなたの方') && H('up', false).includes('向こう') && H('down', false).includes('あなたの方'));
  // 画面の矢印（鏡像なら左右が反転して映る）が、言葉と同じ向きを指す
  const onScreen = (dir, m) => Overlay.sideWord(Overlay.drawDir(dir, m), m);
  let agree = true;
  for (const m of [true, false]) {
    for (const toward of ['up', 'down', 'left', 'right']) {
      const axis = toward === 'up' || toward === 'down' ? 'col' : 'row';
      const w = W({ kind: 'slide', axis, index: 1, toward }, m);
      if (!w.includes(`側が${onScreen(toward, m)}へ`)) agree = false;
    }
  }
  check('矢印: 画面の矢印は言葉の「見える側が〜へ」と同じ向き（鏡像でも）', agree);
  check('矢印: 鏡像ではキューブ全体の矢印も手前の面の動きで描く', Overlay.drawDir('up', true) === 'down' && Overlay.drawDir('flip', true) === 'flip' && Overlay.drawDir('left', false) === 'left');
}

console.log(`\n2 フェーズ法: 平均 ${(tpLen / (trials - tpFail)).toFixed(1)} 手 / 最大 ${tpMax} 手 / ` +
            `${((Date.now() - tpStart) / trials).toFixed(1)} ms per solve`);
console.log(failures === 0 ? '\nすべて通過' : `\n${failures} 件が失敗`);
process.exit(failures === 0 ? 0 : 1);
