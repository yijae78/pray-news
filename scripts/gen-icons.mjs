// PNG 아이콘 생성 스크립트 (SVG → Canvas → PNG)
// Node.js에서 실행: node scripts/gen-icons.mjs

import { writeFileSync } from 'fs';

// 간단한 PNG 생성 (순수 JS, 외부 의존성 없음)
function createPNG(size) {
  // BMP-like raw RGBA → PNG
  const canvas = size;
  const pixels = new Uint8Array(canvas * canvas * 4);

  const cx = canvas / 2, cy = canvas / 2;
  const r = canvas * 0.46; // 둥근 사각형 반경

  for (let y = 0; y < canvas; y++) {
    for (let x = 0; x < canvas; x++) {
      const i = (y * canvas + x) * 4;

      // 둥근 사각형 마스크
      const margin = canvas * 0.04;
      const cornerR = canvas * 0.2;
      const inRect = x >= margin && x < canvas - margin && y >= margin && y < canvas - margin;

      if (!inRect) { pixels[i+3] = 0; continue; }

      // 배경 그라디언트 (다크)
      const t = (x + y) / (canvas * 2);
      const bgR = Math.round(15 + t * 10);
      const bgG = Math.round(15 + t * 5);
      const bgB = Math.round(19 + t * 16);

      pixels[i] = bgR;
      pixels[i+1] = bgG;
      pixels[i+2] = bgB;
      pixels[i+3] = 255;

      // 십자가
      const crossCx = canvas * 0.5, crossCy = canvas * 0.38;
      const crossW = canvas * 0.12, crossH = canvas * 0.42;
      const crossArmW = canvas * 0.34, crossArmH = canvas * 0.1;
      const crossArmY = crossCy - crossH * 0.2;

      const inVert = Math.abs(x - crossCx) < crossW / 2 && y > crossCy - crossH / 2 && y < crossCy + crossH / 2;
      const inHoriz = Math.abs(y - crossArmY) < crossArmH / 2 && x > crossCx - crossArmW / 2 && x < crossCx + crossArmW / 2;

      if (inVert || inHoriz) {
        const gt = (x + y) / (canvas * 2);
        pixels[i] = Math.round(124 + gt * 40);
        pixels[i+1] = Math.round(110 + gt * 30);
        pixels[i+2] = Math.round(240 + gt * 10);
        pixels[i+3] = 255;
      }

      // 하단 라인들
      const lineY1 = canvas * 0.73, lineY2 = canvas * 0.8, lineY3 = canvas * 0.86;
      const lineH = canvas * 0.028;

      for (const [ly, lw, lo] of [[lineY1, 0.54, 0.6], [lineY2, 0.42, 0.35], [lineY3, 0.33, 0.2]]) {
        if (Math.abs(y - ly) < lineH && Math.abs(x - cx) < canvas * lw / 2) {
          pixels[i] = Math.round(124 * lo);
          pixels[i+1] = Math.round(110 * lo);
          pixels[i+2] = Math.round(240 * lo);
          pixels[i+3] = 255;
        }
      }
    }
  }

  return encodePNG(canvas, canvas, pixels);
}

// Minimal PNG encoder (no dependencies)
function encodePNG(w, h, rgba) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];

  // IHDR
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data (filter byte 0 per row)
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter none
    for (let x = 0; x < w * 4; x++) {
      raw[y * (1 + w * 4) + 1 + x] = rgba[y * w * 4 + x];
    }
  }

  // Deflate (store-only, no compression for simplicity)
  const deflated = deflateStore(raw);

  // IDAT
  const idat = deflated;

  // IEND
  const iend = new Uint8Array(0);

  function makeChunk(type, data) {
    const len = data.length;
    const chunk = new Uint8Array(4 + 4 + len + 4);
    new DataView(chunk.buffer).setUint32(0, len);
    chunk[4] = type.charCodeAt(0);
    chunk[5] = type.charCodeAt(1);
    chunk[6] = type.charCodeAt(2);
    chunk[7] = type.charCodeAt(3);
    chunk.set(data, 8);
    const crc = crc32(chunk.subarray(4, 8 + len));
    new DataView(chunk.buffer).setUint32(8 + len, crc);
    return chunk;
  }

  const chunks = [
    new Uint8Array(sig),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', iend),
  ];

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result;
}

function deflateStore(data) {
  // zlib header + store blocks
  const maxBlock = 65535;
  const numBlocks = Math.ceil(data.length / maxBlock) || 1;
  const out = new Uint8Array(2 + numBlocks * 5 + data.length + 4);
  out[0] = 0x78; out[1] = 0x01; // zlib header
  let pos = 2;
  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlock;
    const end = Math.min(start + maxBlock, data.length);
    const len = end - start;
    const isLast = i === numBlocks - 1;
    out[pos++] = isLast ? 1 : 0;
    out[pos++] = len & 0xFF;
    out[pos++] = (len >> 8) & 0xFF;
    out[pos++] = (~len) & 0xFF;
    out[pos++] = ((~len) >> 8) & 0xFF;
    out.set(data.subarray(start, end), pos);
    pos += len;
  }
  // adler32
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  new DataView(out.buffer).setUint32(pos, adler);
  pos += 4;
  return out.subarray(0, pos);
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 192x192 생성
const png192 = createPNG(192);
writeFileSync('public/icon-192.png', png192);
console.log('Generated icon-192.png (' + png192.length + ' bytes)');

// 512x512 생성
const png512 = createPNG(512);
writeFileSync('public/icon-512.png', png512);
console.log('Generated icon-512.png (' + png512.length + ' bytes)');
