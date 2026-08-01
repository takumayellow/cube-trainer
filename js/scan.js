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
 * Depends on: nothing. Pure functions, so the whole thing is testable off-line.
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
  const UNSURE_RATIO = 0.7;  // best/second-best above this and we say so

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

  /**
   * Turn 54 samples into a cube state.
   * @param {Array<[number, number, number]>} samples RGB per sticker, in face
   *   order U R F D L B, nine each, row-major (top-left first).
   * @returns {{state: object, uncertain: Array<{face: string, index: number}>}}
   *   `uncertain` lists the stickers whose second-best colour was nearly as
   *   good — the ones worth a human glance before solving.
   */
  function toState(samples) {
    if (samples.length !== 54) throw new Error(`54 マス分の色が必要です（${samples.length} 個でした）`);

    const points = samples.map(feature);
    const others = points.map((_, i) => i).filter(i => !CENTRES.includes(i));
    const otherPoints = others.map(i => points[i]);

    let seeds = CENTRES.map(i => points[i]);
    let result = null;
    // Re-centring on the clusters found so far absorbs per-face lighting; three
    // rounds is where it stops moving on real photographs.
    for (let round = 0; round < 3; round++) {
      result = assign(otherPoints, seeds, PER_COLOUR - 1);
      seeds = seeds.map((seed, c) => {
        const members = others.filter((_, j) => result.label[j] === c).map(i => points[i]);
        return mean([points[CENTRES[c]], ...members]);
      });
    }

    const names = nameClusters(seeds);
    const state = { U: [], R: [], F: [], D: [], L: [], B: [] };
    for (let c = 0; c < 6; c++) state[FACE_ORDER[c]][4] = names[c];

    const uncertain = [];
    others.forEach((i, j) => {
      const face = FACE_ORDER[Math.floor(i / 9)];
      const index = i % 9;
      state[face][index] = names[result.label[j]];

      const row = result.cost[j].slice().sort((a, b) => a - b);
      if (row[1] > 0 && row[0] / row[1] > UNSURE_RATIO) uncertain.push({ face, index });
    });

    return { state, uncertain };
  }

  // ── sampling pixels ───────────────────────────────────────────────────────

  /**
   * The median colour of a patch — median, not mean, so one glare highlight or
   * the black gap between stickers cannot drag the answer.
   */
  function patchColour(data, width, x0, y0, w, h) {
    const channels = [[], [], []];
    const stepX = Math.max(1, Math.floor(w / 12));
    const stepY = Math.max(1, Math.floor(h / 12));
    for (let y = y0; y < y0 + h; y += stepY) {
      for (let x = x0; x < x0 + w; x += stepX) {
        const p = (y * width + x) * 4;
        channels[0].push(data[p]);
        channels[1].push(data[p + 1]);
        channels[2].push(data[p + 2]);
      }
    }
    return channels.map(list => {
      list.sort((a, b) => a - b);
      return list[Math.floor(list.length / 2)];
    });
  }

  /**
   * Nine colours out of a square region of a canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x: number, y: number, size: number}} box the 3x3 area on screen
   */
  function sampleFace(ctx, box) {
    const { x, y, size } = box;
    const img = ctx.getImageData(x, y, size, size);
    const cell = size / 3;
    const inset = cell * 0.25;            // stay off the sticker edges
    const side = Math.max(1, Math.round(cell - inset * 2));

    const out = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out.push(patchColour(img.data, size,
          Math.round(c * cell + inset), Math.round(r * cell + inset), side, side));
      }
    }
    return out;
  }

  /** The largest centred square that fits, at `fill` of the shorter side. */
  function frameBox(width, height, fill) {
    const size = Math.round(Math.min(width, height) * (fill || 0.62));
    return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
  }

  window.Scan = {
    FACE_ORDER, INSTRUCTIONS, LETTERS,
    rgbToHsv, feature, toState, sampleFace, frameBox, patchColour,
  };
})();
