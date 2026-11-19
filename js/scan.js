/**
 * scan.js — from camera pixels to sticker colours
 *
 * Reading colours off a photo is not a threshold problem. Room light shifts
 * every hue, a white sticker under a warm lamp is yellower than a yellow one
 * under a cold one, and orange versus red is close even in good light.
 *
 * What is known for certain is the shape of the answer: six colours, exactly
 * nine stickers each, and the six centres are one of each. So the classifier
 * never asks "what colour is this sticker" on its own. It clusters all 54
 * samples at once, seeded by the centres, under a hard capacity of nine — then
 * names the clusters by matching all six against reference colours at once, so
 * a global colour cast moves every cluster together and cancels out.
 *
 * Depends on: resolve.js (and through it cubie.js). Pure functions, so the
 * whole thing is testable off-line.
 */

(function () {
  'use strict';

  const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const LETTERS = ['W', 'Y', 'O', 'R', 'G', 'B'];

  // Which way to hold the cube for each face. Left and right never change:
  // only tilt, so the grid on screen lands on the facelets in this order.
  const INSTRUCTIONS = {
    U: { title: 'U 面（上）', hold: '上面をカメラに向け、奥の面が上に来るように傾ける' },
    R: { title: 'R 面（右）', hold: '右面をカメラに向け、上面が上のまま' },
    F: { title: 'F 面（手前）', hold: '手前の面をカメラに向け、上面が上のまま' },
    D: { title: 'D 面（下）', hold: '底面をカメラに向け、手前の面が上に来るように傾ける' },
    L: { title: 'L 面（左）', hold: '左面をカメラに向け、上面が上のまま' },
    B: { title: 'B 面（奥）', hold: '奥の面をカメラに向け、上面が上のまま' },
  };

  // Reference colours as HSV. Only their relative arrangement matters: the
  // naming step fits all six clusters to all six references at once.
  const REFERENCE = {
    W: [0, 0.04, 0.95],
    Y: [55, 0.80, 0.95],
    O: [25, 0.90, 0.85],
    R: [0, 0.85, 0.75],
    G: [140, 0.80, 0.60],
    B: [215, 0.85, 0.60],
  };

  const V_WEIGHT = 0.2;      // brightness is the least trustworthy axis
  const CENTRES = [4, 13, 22, 31, 40, 49];
  const PER_COLOUR = 9;
  const UNSURE_GAP = 2.0;    // cost gap to the runner-up below this and we say so
  const ROTATE_MARGIN = 6.0; // a turned face must fit this much better to be believed

  // ── colour space ──────────────────────────────────────────────────────────

  function rgbToHsv(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return [(h + 360) % 360, max === 0 ? 0 : d / max, max];
  }

  /**
   * Hue and saturation as a point on a disc, brightness as a weak third axis.
   * White lands near the origin, the six colours spread around the rim, and a
   * dim photo moves points inward rather than into another colour.
   */
  function feature(rgb) {
    return featureFromHsv(rgbToHsv(rgb));
  }

  function featureFromHsv([h, s, v]) {
    const a = h * Math.PI / 180;
    return [s * Math.cos(a), s * Math.sin(a), V_WEIGHT * v];
  }

  const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

  const mean = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);

  // ── constrained assignment ────────────────────────────────────────────────

  /**
   * Put every point in a cluster, at most `capacity` per cluster.
   *
   * Confident points choose first (the ones whose best cluster beats their
   * second best by the widest margin), then pairs are swapped for as long as a
   * swap lowers the total. Capacity is preserved by construction, so the result
   * always has exactly nine of each colour — which is the whole point.
   */
  function assign(points, seeds, capacity) {
    const cost = points.map(p => seeds.map(s => dist2(p, s)));
    const margin = (row) => {
      const sorted = row.slice().sort((a, b) => a - b);
      return sorted[1] - sorted[0];
    };
    const order = points.map((_, i) => i).sort((a, b) => margin(cost[b]) - margin(cost[a]));

    const room = seeds.map(() => capacity);
    const label = new Array(points.length).fill(-1);
    for (const i of order) {
      let best = -1;
      for (let c = 0; c < seeds.length; c++) {
        if (room[c] > 0 && (best < 0 || cost[i][c] < cost[i][best])) best = c;
      }
      label[i] = best;
      room[best] -= 1;
    }

    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = label[i], b = label[j];
          if (a === b) continue;
          if (cost[i][b] + cost[j][a] < cost[i][a] + cost[j][b] - 1e-12) {
            label[i] = b;
            label[j] = a;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return { label, cost };
  }

  /** Every way to hand out six names, so the best overall fit wins. */
  function permutations(n) {
    if (n === 0) return [[]];
    const out = [];
    for (const rest of permutations(n - 1)) {
      for (let i = 0; i <= rest.length; i++) {
        out.push(rest.slice(0, i).concat(n - 1, rest.slice(i)));
      }
    }
    return out;
  }
  const PERMS = permutations(6);

  function nameClusters(seeds) {
    const refs = LETTERS.map(c => featureFromHsv(REFERENCE[c]));
    let best = null, bestCost = Infinity;
    for (const perm of PERMS) {
      let total = 0;
      for (let c = 0; c < 6; c++) total += dist2(seeds[c], refs[perm[c]]);
      if (total < bestCost) { bestCost = total; best = perm; }
    }
    return best.map(i => LETTERS[i]);
  }

  // ── the entry point ───────────────────────────────────────────────────────

  // Rotating a face's nine stickers a quarter turn clockwise, as seen from
  // outside the face: new[r][c] = old[2-c][r].
  const QUARTER = [6, 3, 0, 7, 4, 1, 8, 5, 2];

  function rotateFace(samples, face, quarters) {
    const out = samples.slice();
    for (let q = 0; q < quarters; q++) {
      const base = face * 9;
      const block = out.slice(base, base + 9);
      for (let i = 0; i < 9; i++) out[base + i] = block[QUARTER[i]];
    }
    return out;
  }

  /**
   * Capacity-constrained clustering, then the cheapest legal cube under those
   * clusters, then the clusters re-estimated from that cube. Returns the costs
   * as well, so callers can say how sure each sticker is.
   */
  /** Nine-per-colour clusters seeded by the six centres; position plays no part. */
  function clusterSeeds(points) {
    const others = points.map((_, i) => i).filter(i => !CENTRES.includes(i));
    const otherPoints = others.map(i => points[i]);

    let seeds = CENTRES.map(i => points[i]);
    for (let round = 0; round < 3; round++) {
      const result = assign(otherPoints, seeds, PER_COLOUR - 1);
      seeds = seeds.map((seed, c) => {
        const members = others.filter((_, j) => result.label[j] === c).map(i => points[i]);
        return mean([points[CENTRES[c]], ...members]);
      });
    }
    return seeds;
  }

  function readOnce(points) {
    let seeds = clusterSeeds(points);
    let solved = null, cost = null;
    for (let round = 0; round < 2; round++) {
      cost = costMatrix(points, seeds);
      solved = Resolve.resolve(cost);
      seeds = seeds.map((_, c) => mean(points.filter((__, i) => solved.faces[i] === c)));
    }
    return { faces: solved.faces, total: solved.cost, cost, seeds };
  }

  /**
   * Squared distance to each cluster, scaled by how spread that cluster is, so
   * a tight colour (white) and a loose one (orange under a lamp) are judged
   * on the same footing.
   */
  function costMatrix(points, seeds) {
    const sigma = spreads(points, seeds);
    return points.map(p => costRow(p, seeds, sigma));
  }

  const costRow = (p, seeds, sigma) => seeds.map((s, c) => dist2(p, s) / sigma[c] + Math.log(sigma[c]));

  function spreads(points, seeds) {
    const spread = seeds.map(() => 0);
    const near = points.map(p => {
      let best = 0;
      for (let c = 1; c < seeds.length; c++) if (dist2(p, seeds[c]) < dist2(p, seeds[best])) best = c;
      return best;
    });
    const counts = seeds.map(() => 0);
    points.forEach((p, i) => { spread[near[i]] += dist2(p, seeds[near[i]]); counts[near[i]] += 1; });
    const floor = 1e-3;
    return spread.map((s, c) => Math.max(floor, s / Math.max(1, counts[c])));
  }

  /**
   * Turn 54 samples into a cube state.
   * @param {Array<[number, number, number]>} samples RGB per sticker, in face
   *   order U R F D L B, nine each, row-major (top-left first).
   * @returns {{state: object, uncertain: Array<{face: string, index: number}>,
   *   corrected: Array<{face: string, index: number, from: string}>,
   *   rotated: Array<{face: string, quarters: number}>, weakest: string}}
   *   `state` always passes Cubie.validate. `corrected` lists the stickers
   *   whose nearest colour would have made an impossible cube and that were
   *   read as the colour the possible cube needs instead; `uncertain` the
   *   close calls worth a glance; `rotated` the faces that were evidently
   *   photographed turned and were read turned back; `weakest` the face whose
   *   colours fitted worst — the one to photograph again if anything is off.
   */
  function toState(samples, opts) {
    const tryTurns = !(opts && opts.turns === false);
    if (samples.length !== 54) throw new Error(`54 マス分の色が必要です（${samples.length} 個でした）`);

    let current = samples.slice();
    let read = readOnce(current.map(feature));
    const turns = [0, 0, 0, 0, 0, 0];
    // A face held a quarter turn off still gives nine plausible colours, but
    // its edges and corners stop matching their neighbours. Try each face at
    // each turn and keep a turn only when the whole cube fits clearly better.
    for (let pass = 0; pass < (tryTurns ? 3 : 0); pass++) {
      let best = null;
      for (let f = 0; f < 6; f++) {
        for (let q = 1; q < 4; q++) {
          const trial = rotateFace(current, f, q);
          const r = readOnce(trial.map(feature));
          if (!best || r.total < best.read.total) best = { f, q, trial, read: r };
        }
      }
      if (best.read.total >= read.total - ROTATE_MARGIN) break;
      current = best.trial;
      read = best.read;
      turns[best.f] = (turns[best.f] + best.q) % 4;
    }

    const names = nameClusters(read.seeds);
    const state = { U: [], R: [], F: [], D: [], L: [], B: [] };
    const uncertain = [], corrected = [];
    const faceCost = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 54; i++) {
      const face = FACE_ORDER[Math.floor(i / 9)];
      const index = i % 9;
      const pick = read.faces[i];
      state[face][index] = names[pick];
      if (CENTRES.includes(i)) continue;

      const row = read.cost[i];
      faceCost[Math.floor(i / 9)] += row[pick];
      let nearest = 0;
      for (let c = 1; c < 6; c++) if (row[c] < row[nearest]) nearest = c;
      if (nearest !== pick) {
        corrected.push({ face, index, from: names[nearest] });
        continue;
      }
      const others = row.filter((_, c) => c !== pick);
      const second = Math.min(...others);
      if (second - row[pick] < UNSURE_GAP) uncertain.push({ face, index });
    }
    let weakest = 0;
    for (let f = 1; f < 6; f++) if (faceCost[f] > faceCost[weakest]) weakest = f;

    return {
      state, uncertain, corrected,
      rotated: turns.map((q, f) => ({ face: FACE_ORDER[f], quarters: q })).filter(r => r.quarters),
      weakest: FACE_ORDER[weakest],
      palette: { seeds: read.seeds, sigma: spreads(current.map(feature), read.seeds), names },
    };
  }

  // ── any order, any turn ───────────────────────────────────────────────────

  // Which face each centre colour sits on, holding white down and green front.
  const FACE_OF = { Y: 'U', O: 'R', G: 'F', W: 'D', R: 'L', B: 'B' };

  /** The ways to name six clusters, cheapest first. */
  function rankNamings(seeds) {
    const refs = LETTERS.map(c => featureFromHsv(REFERENCE[c]));
    return PERMS.map(perm => {
      let total = 0;
      for (let c = 0; c < 6; c++) total += dist2(seeds[c], refs[perm[c]]);
      return { names: perm.map(i => LETTERS[i]), total };
    }).sort((a, b) => a.total - b.total);
  }

  const turnNine = (nine, quarters) => {
    let out = nine;
    for (let q = 0; q < quarters; q++) out = QUARTER.map(i => out[i]);
    return out;
  };

  /**
   * Read a cube from six photographed faces taken in any order, each held at
   * any of the four turns.
   *
   * The centre colours say which face each photo is; the turn of each photo is
   * whichever of the 4^6 combinations gives the cheapest legal cube, since a
   * face held the wrong way round leaves its corners and edges disagreeing with
   * their neighbours.
   * @param {Array<Array<[number, number, number]>>} shots six lists of nine
   *   RGB samples, each row-major as the camera saw it.
   * @returns the result of toState, plus `placement`: for each shot, the face
   *   it is and how many clockwise quarter turns took it to the cube's layout.
   */
  function toStateAnyOrder(shots) {
    if (!Array.isArray(shots) || shots.length !== 6 || shots.some(s => !s || s.length !== 9)) {
      throw new Error('6 面ぶん、各 9 マスの色が必要です');
    }
    const points = shots.flat().map(feature);
    const seeds = clusterSeeds(points);
    const sigma = spreads(points, seeds);
    const rows = points.map(p => costRow(p, seeds, sigma));

    let best = null;
    rankNamings(seeds).slice(0, 2).forEach((naming, rank) => {
      // The runner-up naming (usually red and orange swapped) has to earn its
      // place: on a cube with little scrambling both namings fit equally well.
      const handicap = rank * ROTATE_MARGIN;
      const faceOf = naming.names.map(c => FACE_ORDER.indexOf(FACE_OF[c]));
      // Resolve wants column f to be face f; shot k's cluster belongs to face faceOf[k].
      const cols = rows.map(r => {
        const out = new Array(6);
        for (let k = 0; k < 6; k++) out[faceOf[k]] = r[k];
        return out;
      });
      const turned = [];
      for (let k = 0; k < 6; k++) {
        const nine = cols.slice(k * 9, k * 9 + 9);
        turned.push([0, 1, 2, 3].map(q => turnNine(nine, q)));
      }
      const cost = new Array(54);
      const q = [0, 0, 0, 0, 0, 0];
      for (let code = 0; code < 4096; code++) {
        for (let k = 0; k < 6; k++) {
          q[k] = (code >> (2 * k)) & 3;
          const block = turned[k][q[k]];
          for (let i = 0; i < 9; i++) cost[faceOf[k] * 9 + i] = block[i];
        }
        const total = Resolve.resolve(cost).cost + handicap;
        if (!best || total < best.total) best = { total, faceOf, turns: q.slice() };
      }
    });

    const samples = new Array(54);
    for (let k = 0; k < 6; k++) {
      const nine = turnNine(shots[k], best.turns[k]);
      for (let i = 0; i < 9; i++) samples[best.faceOf[k] * 9 + i] = nine[i];
    }
    const read = toState(samples, { turns: false });
    read.placement = shots.map((_, k) => ({ face: FACE_ORDER[best.faceOf[k]], quarters: best.turns[k] }));
    return read;
  }

  /** What centre colour a lone photo shows, judged against the reference colours. */
  function guessColour(rgb) {
    const p = feature(rgb);
    let best = null;
    for (const c of LETTERS) {
      const d = dist2(p, featureFromHsv(REFERENCE[c]));
      if (!best || d < best.d) best = { c, d };
    }
    return best.c;
  }

  /**
   * Cost of each of the six colours for each sample, under a palette from a
   * finished read. Lower is better; the columns follow `palette.names`.
   */
  function costRows(samples, palette) {
    return samples.map(rgb => costRow(feature(rgb), palette.seeds, palette.sigma));
  }

  const SPOT = ['左上', '上', '右上', '左', '中央', '右', '左下', '下', '右下'];
  const spots = list => list.map(u => `${u.face} 面の${SPOT[u.index]}`).join('、');

  /**
   * What a read did, in sentences for the person holding the cube: faces
   * turned back, stickers inferred from the pieces, close calls, and which
   * face to photograph again if anything still looks wrong.
   * @param {ReturnType<typeof toState>} read
   * @returns {string[]}
   */
  function describe(read) {
    const out = [];
    for (const r of read.rotated) {
      out.push(`${r.face} 面は ${r.quarters * 90}° 回った向きで撮れていたので、向きを直して読みました。`);
    }
    if (read.corrected.length) {
      out.push(`${read.corrected.length} マス（${spots(read.corrected)}）は、見えた色のままだと実物にない駒になるので、`
        + 'ほかのマスとの組み合わせから色を決めました（橙の枠）。');
    }
    if (read.uncertain.length) {
      out.push(`${read.uncertain.length} マス（${spots(read.uncertain)}）は色が際どいです（赤い枠）。`);
    }
    if (read.corrected.length + read.uncertain.length >= 3) {
      out.push(`実物と違うところがあれば、${read.weakest} 面を明るい所で撮り直すと直りやすいです。`);
    }
    return out;
  }

  // ── sampling pixels ───────────────────────────────────────────────────────

  /**
   * The colour of a patch: the mean of the middle half of the pixels, ranked
   * by brightness. Dropping the darkest quarter keeps the black gap between
   * stickers out; dropping the brightest keeps a glare highlight out; averaging
   * what is left over every pixel (rather than a median of a few) is what lets
   * a noisy low-resolution webcam give a steady colour.
   */
  function patchColour(data, width, x0, y0, w, h) {
    const stepX = Math.max(1, Math.floor(w / 24));
    const stepY = Math.max(1, Math.floor(h / 24));
    const px = [];
    for (let y = y0; y < y0 + h; y += stepY) {
      for (let x = x0; x < x0 + w; x += stepX) {
        const p = (y * width + x) * 4;
        px.push([data[p], data[p + 1], data[p + 2], data[p] + data[p + 1] + data[p + 2]]);
      }
    }
    px.sort((a, b) => a[3] - b[3]);
    const lo = Math.floor(px.length / 4);
    const hi = Math.max(lo + 1, Math.ceil(px.length * 3 / 4));
    const sum = [0, 0, 0];
    for (let i = lo; i < hi; i++) for (let k = 0; k < 3; k++) sum[k] += px[i][k];
    return sum.map(v => Math.round(v / (hi - lo)));
  }

  /** Brightest channel at a pixel, clamped to the image. Stickers are bright, the plastic is not. */
  function peak(img, x, y) {
    const xi = Math.min(img.width - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(img.height - 1, Math.max(0, Math.round(y)));
    const p = (yi * img.width + xi) * 4;
    const d = img.data;
    return Math.max(d[p], d[p + 1], d[p + 2]);
  }

  /**
   * How much `box` looks like a 3x3 cube face: bright, even sticker cores
   * against dark lines where the gaps between stickers should be.
   */
  function gridScore(img, box) {
    const { x, y, size } = box;
    const cell = size / 3;
    let core = 0, coreN = 0, spread = 0, gap = 0, gapN = 0;
    const N = 4;                                   // samples per cell side
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const vals = [];
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            vals.push(peak(img, x + (c + 0.3 + 0.4 * j / (N - 1)) * cell,
                                y + (r + 0.3 + 0.4 * i / (N - 1)) * cell));
          }
        }
        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        core += m; coreN += 1;
        spread += Math.sqrt(vals.reduce((a, v) => a + (v - m) * (v - m), 0) / vals.length);
      }
    }
    // the two inner lines each way, sampled along their length
    for (const k of [1, 2]) {
      for (let t = 0.1; t < 3; t += 0.2) {
        gap += peak(img, x + k * cell, y + t * cell) + peak(img, x + t * cell, y + k * cell);
        gapN += 2;
      }
    }
    return core / coreN - gap / gapN - spread / coreN;
  }

  /**
   * Nudge the guide square onto the cube actually in the picture. People do
   * not hold a cube exactly in the guide, and a low-resolution camera cannot
   * spare the pixels lost when every sample sits a little off-centre. Tries
   * sizes and offsets around `box` and keeps the one that looks most like a
   * 3x3 grid — but only when it is clearly better than the guide as drawn.
   */
  function locateGrid(img, box) {
    const base = gridScore(img, box);
    let best = { box, score: base };
    const cx0 = box.x + box.size / 2, cy0 = box.y + box.size / 2;
    const tryBox = (size, cx, cy) => {
      const b = { x: cx - size / 2, y: cy - size / 2, size };
      if (b.x < 0 || b.y < 0 || b.x + size > img.width || b.y + size > img.height) return;
      const sc = gridScore(img, b);
      if (sc > best.score) best = { box: b, score: sc };
    };
    // coarse: sizes 55%..115% of the guide, centre within a third of it
    for (let k = 0.55; k <= 1.151; k += 0.05) {
      const size = box.size * k;
      for (let dy = -0.3; dy <= 0.301; dy += 0.05) {
        for (let dx = -0.3; dx <= 0.301; dx += 0.05) tryBox(size, cx0 + dx * box.size, cy0 + dy * box.size);
      }
    }
    // fine: around the coarse winner
    const c = best.box;
    const ccx = c.x + c.size / 2, ccy = c.y + c.size / 2;
    for (let k = -0.04; k <= 0.041; k += 0.02) {
      for (let dy = -0.025; dy <= 0.026; dy += 0.0125) {
        for (let dx = -0.025; dx <= 0.026; dx += 0.0125) {
          tryBox(c.size * (1 + k), ccx + dx * box.size, ccy + dy * box.size);
        }
      }
    }
    const margin = 8;                   // in brightness levels: a real grid scores far above this
    if (best.score < base + margin) return { box, moved: false, score: base };
    const b = best.box;
    return { box: { x: Math.round(b.x), y: Math.round(b.y), size: Math.round(b.size) }, moved: true, score: best.score };
  }

  /**
   * Nine colours out of an image.
   * @param {{data: Uint8ClampedArray, width: number, height: number}} img
   *   RGBA pixels, as ImageData has them
   * @param {{x: number, y: number, size: number}} box the guide square
   * @param {{locate?: boolean}} [opts] locate (default true): look for the
   *   cube near the guide instead of trusting it
   * @returns {{colours: Array<[number, number, number]>, box: object}}
   */
  function sampleImage(img, box, opts) {
    const found = (!opts || opts.locate !== false) ? locateGrid(img, box) : { box, score: gridScore(img, box) };
    const where = found.box;
    const { x, y, size } = where;
    const cell = size / 3;
    const inset = cell * 0.25;            // stay off the sticker edges
    const side = Math.max(1, Math.round(cell - inset * 2));
    const colours = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        colours.push(patchColour(img.data, img.width,
          Math.round(x + c * cell + inset), Math.round(y + r * cell + inset), side, side));
      }
    }
    return { colours, box: where, score: found.score };
  }

  /**
   * Nine colours out of a canvas, around the guide square `box`.
   * @param {CanvasRenderingContext2D} ctx
   */
  function sampleFace(ctx, box, opts) {
    const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    return sampleImage(img, box, opts).colours;
  }

  /** The largest centred square that fits, at `fill` of the shorter side. */
  function frameBox(width, height, fill) {
    const size = Math.round(Math.min(width, height) * (fill || 0.62));
    return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
  }

  window.Scan = {
    FACE_ORDER, INSTRUCTIONS, LETTERS,
    rgbToHsv, feature, toState, toStateAnyOrder, costRows, guessColour, FACE_OF, describe, sampleFace, sampleImage, locateGrid, frameBox, patchColour,
  };
})();
