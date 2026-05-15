import { writeFileSync } from 'fs';

/**
 * Generates a premium minimal dark app icon as requested.
 * 1. 1024x1024 PNG
 * 2. Deep navy background (#060a14 ~ #0d1832)
 * 3. Rounded corner plus (+) cross stroke in white
 * 4. Subtle blue glow ring behind
 */

function createGeminiIcon() {
  const size = 1024;
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  // Configuration
  const bgColors = {
    top: [6, 10, 20],      // #060a14 approx
    bottom: [13, 24, 50]   // #0d1832 approx
  };

  const glowColor = [30, 80, 200]; // Blue glow
  const glowRadius = size * 0.28;
  const glowSigma = size * 0.1;

  const crossW = size * 0.12;
  const crossH = size * 0.5;
  const cornerR = size * 0.04;
  const strokeWidth = size * 0.015;

  function distToRoundedRect(px, py, w, h, r) {
    const dx = Math.max(Math.abs(px) - (w / 2) + r, 0);
    const dy = Math.max(Math.abs(py) - (h / 2) + r, 0);
    return Math.sqrt(dx * dx + dy * dy) - r;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // 1. Background Gradient
      const t = y / size;
      const r = Math.round(bgColors.top[0] * (1 - t) + bgColors.bottom[0] * t);
      const g = Math.round(bgColors.top[1] * (1 - t) + bgColors.bottom[1] * t);
      const b = Math.round(bgColors.top[2] * (1 - t) + bgColors.bottom[2] * t);

      pixels[i] = r;
      pixels[i+1] = g;
      pixels[i+2] = b;
      pixels[i+3] = 255;

      // 2. Glow Ring (behind cross)
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const glowIntensity = Math.exp(-Math.pow(dist - glowRadius, 2) / (2 * Math.pow(glowSigma, 2))) * 0.4;
      
      pixels[i] = Math.min(255, pixels[i] + glowColor[0] * glowIntensity);
      pixels[i+1] = Math.min(255, pixels[i+1] + glowColor[1] * glowIntensity);
      pixels[i+2] = Math.min(255, pixels[i+2] + glowColor[2] * glowIntensity);

      // 3. Rounded Plus Shape (Stroke Only)
      // Vertical bar
      const d1 = distToRoundedRect(x - cx, y - cy, crossW, crossH, cornerR);
      // Horizontal bar
      const d2 = distToRoundedRect(x - cx, y - cy, crossH, crossW, cornerR);
      
      const dPlus = Math.min(d1, d2);
      
      // Antialiasing for the stroke
      const edge = Math.abs(dPlus);
      if (edge < strokeWidth / 2 + 1) {
        let alpha = 1.0;
        if (edge > strokeWidth / 2 - 1) {
          alpha = 1.0 - (edge - (strokeWidth / 2 - 1)) / 2;
        }
        
        if (alpha > 0) {
          pixels[i] = Math.round(pixels[i] * (1 - alpha) + 255 * alpha);
          pixels[i+1] = Math.round(pixels[i+1] * (1 - alpha) + 255 * alpha);
          pixels[i+2] = Math.round(pixels[i+2] * (1 - alpha) + 255 * alpha);
        }
      }
    }
  }

  return encodePNG(size, size, pixels);
}

// Minimal PNG encoder (copied from gen-icons.mjs)
function encodePNG(w, h, rgba) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w * 4; x++) {
      raw[y * (1 + w * 4) + 1 + x] = rgba[y * w * 4 + x];
    }
  }

  const deflated = deflateStore(raw);
  const idat = deflated;
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
  const maxBlock = 65535;
  const numBlocks = Math.ceil(data.length / maxBlock) || 1;
  const out = new Uint8Array(2 + numBlocks * 5 + data.length + 4);
  out[0] = 0x78; out[1] = 0x01;
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

const png = createGeminiIcon();
writeFileSync('public/app-icon-gemini.png', png);
console.log('Successfully generated public/app-icon-gemini.png (' + png.length + ' bytes)');
