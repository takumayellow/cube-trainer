// 色の読み取り精度の計測。
//
//   node test/scan_bench.js [ランダム状態の数]     既定 300
//
// 1. 実物のキューブを実際のカメラで撮った RGB（test/fixtures/real-rgb.json、10 個）を
//    そのまま読む。照明のかぶり・暗さ・ノイズ（低解像度カメラのセンサーノイズ相当）を
//    重ねたものも読む。
// 2. 実物の色の分布から、ランダムな状態の 54 マスを作って読む。スクランブルした
//    状態ほど辺と角の色の組み合わせが散るので、制約の効き方を広く見られる。
//
// 出す数字: キューブ全体を正しく読めた割合 / 平均の誤マス数 / 「あり得る状態」になった割合。

'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
for (const f of ['cube.js', 'cubie.js', 'resolve.js', 'scan.js']) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
}

const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'real-rgb.json'), 'utf8'));

// 再現できる乱数（結果を比べられるように）
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

/** 読んだ状態を、面の名前（中心の色で決まる）の 54 文字にする。 */
function asFaceString(state) {
  const toFace = {};
  for (const f of FACES) toFace[state[f][4]] = f;
  return FACES.map(f => state[f].map(c => toFace[c] || '?').join('')).join('');
}

function score(samples, expect) {
  const read = Scan.toState(samples);
  const got = asFaceString(read.state);
  let wrong = 0;
  for (let i = 0; i < 54; i++) if (got[i] !== expect[i]) wrong++;
  return { wrong, valid: Cubie.validate(read.state).ok, read };
}

// ── 劣化のかけ方 ─────────────────────────────────────────────────────────────
const CONDITIONS = {
  'そのまま': s => s,
  '電球色': s => s.map(([r, g, b]) => [clamp(r * 1.05), clamp(g * 0.85), clamp(b * 0.6)]),
  '昼光色(青)': s => s.map(([r, g, b]) => [clamp(r * 0.8), clamp(g * 0.92), clamp(b * 1.1)]),
  '薄暗い': s => s.map(c => c.map(v => clamp(v * 0.45))),
  'ノイズσ12': s => s.map(c => c.map(v => clamp(v + 12 * gauss()))),
  'ノイズσ25': s => s.map(c => c.map(v => clamp(v + 25 * gauss()))),
  // 面ごとに明るさが違う（撮るたびに向きが変わり、光の当たり方が変わる）
  '面ごとの明るさ': s => {
    const k = FACES.map(() => 0.55 + 0.6 * rand());
    return s.map((c, i) => c.map(v => clamp(v * k[Math.floor(i / 9)])));
  },
  '薄暗い+電球色+ノイズ': s => s.map(([r, g, b]) =>
    [clamp(r * 0.55 + 15 * gauss()), clamp(g * 0.45 + 15 * gauss()), clamp(b * 0.3 + 15 * gauss())]),
};

function runReal() {
  console.log('\n## 実物のキューブの RGB（10 個）');
  const rows = [];
  for (const [cond, f] of Object.entries(CONDITIONS)) {
    let ok = 0, wrong = 0, valid = 0;
    for (const c of real.cases) {
      const r = score(f(c.samples), c.expect);
      if (r.wrong === 0) ok++;
      wrong += r.wrong;
      valid += r.valid ? 1 : 0;
    }
    rows.push([cond, ok, wrong / real.cases.length, valid]);
  }
  for (const [cond, ok, w, v] of rows) {
    console.log(`  ${cond.padEnd(14)}  全正解 ${ok}/10  誤マス平均 ${w.toFixed(2)}  あり得る状態 ${v}/10`);
  }
  return rows;
}

// 実データから色ごとの RGB の見本を集める（面＝色の対応は expect と中心から取る）
function palette() {
  const pool = {};
  for (const c of real.cases) {
    for (let i = 0; i < 54; i++) {
      const key = `${c.name}:${c.expect[i]}`;
      (pool[key] = pool[key] || []).push(c.samples[i]);
    }
  }
  return pool;
}

function randomState(n) {
  const cube = new Cube();
  const moves = Object.keys(Cube._MOVES);
  for (let i = 0; i < n; i++) cube.applyMove(moves[Math.floor(rand() * moves.length)]);
  return cube.getState();
}

function runSynthetic(count) {
  console.log(`\n## 実物の色の分布で作ったランダム状態（${count} 個 × 条件）`);
  const pool = palette();
  const out = [];
  for (const [cond, f] of Object.entries(CONDITIONS)) {
    let ok = 0, wrong = 0, valid = 0;
    for (let t = 0; t < count; t++) {
      const src = real.cases[t % real.cases.length];
      const state = randomState(25);
      const toFace = {};
      for (const face of FACES) toFace[state[face][4]] = face;
      const expect = FACES.map(face => state[face].map(c => toFace[c]).join('')).join('');
      // その実物で同じ面の色だったマスから 1 つ選ぶ（同じカメラ・同じ照明の色）
      const samples = expect.split('').map(face => {
        const list = pool[`${src.name}:${face}`];
        return list[Math.floor(rand() * list.length)].slice();
      });
      const r = score(f(samples), expect);
      if (r.wrong === 0) ok++;
      wrong += r.wrong;
      valid += r.valid ? 1 : 0;
    }
    out.push([cond, ok, wrong / count, valid]);
    console.log(`  ${cond.padEnd(14)}  全正解 ${(100 * ok / count).toFixed(1)}%  誤マス平均 ${(wrong / count).toFixed(2)}  あり得る状態 ${(100 * valid / count).toFixed(1)}%`);
  }
  return out;
}

if (require.main === module) {
  runReal();
  runSynthetic(Number(process.argv[2] || 300));
}

module.exports = { runReal, runSynthetic, score, asFaceString, CONDITIONS, real };
