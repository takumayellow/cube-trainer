// テスト用の最小の PNG 読み込み（8 bit の RGB / RGBA、インターレース無しだけ）。
// 写真の読み取りをブラウザ無しで確かめるために使う。
'use strict';
const fs = require('fs');
const zlib = require('zlib');

function decode(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error(`${file}: 8 bit・インターレース無しだけ読めます`);
      type = body[9];
    } else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = { 2: 3, 6: 4 }[type];
  if (!bpp) throw new Error(`${file}: RGB か RGBA だけ読めます（color type ${type}）`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = line[x * bpp]; out[o + 1] = line[x * bpp + 1]; out[o + 2] = line[x * bpp + 2];
      out[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { data: out, width, height };
}

/** 面積平均で縮小する（安いウェブカメラの低い解像度の代わり）。 */
function shrink(img, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const k = img.width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      let n = 0;
      for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) {
        for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
          const p = (yy * img.width + xx) * 4;
          acc[0] += img.data[p]; acc[1] += img.data[p + 1]; acc[2] += img.data[p + 2]; n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = acc[0] / n; out[o + 1] = acc[1] / n; out[o + 2] = acc[2] / n; out[o + 3] = 255;
    }
  }
  return { data: out, width: size, height: size };
}

module.exports = { decode, shrink };
