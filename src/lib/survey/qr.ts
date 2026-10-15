/**
 * A small QR code maker (byte mode, error correction level M, versions 1-10,
 * i.e. up to 213 bytes). Written in-house so the project needs no extra
 * package. Used for the 研修アンケート links the company prints or shows.
 *
 * qrMatrix(text) -> rows of booleans (true = dark module), without the quiet zone.
 * qrSvg(text)    -> an SVG string with the quiet zone included.
 */

// [EC codewords per block, blocks in group 1, data codewords per block (group 1),
//  blocks in group 2, data codewords per block (group 2)] for level M.
const BLOCKS: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const MAX_VERSION = 10;

function dataCapacity(version: number): number {
  const [, g1, d1, g2, d2] = BLOCKS[version];
  return g1 * d1 + g2 * d2;
}

// --- Reed-Solomon over GF(256), polynomial 0x11D ---
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const rem = new Array<number>(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < ecLen; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

// --- Bits ---
function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function buildCodewords(bytes: number[], version: number): number[] {
  const capacity = dataCapacity(version);
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const totalBits = capacity * 8;
  push(0, Math.min(4, totalBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    data.push(v);
  }
  for (let pad = 0xec; data.length < capacity; pad = pad === 0xec ? 0x11 : 0xec) data.push(pad);

  // Split into blocks, add error correction, interleave.
  const [ecLen, g1, d1, g2, d2] = BLOCKS[version];
  const blocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < g1 + g2; i++) {
    const size = i < g1 ? d1 : d2;
    blocks.push(data.slice(offset, offset + size));
    offset += size;
  }
  const ecBlocks = blocks.map((block) => rsRemainder(block, ecLen));
  const out: number[] = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) for (const block of blocks) if (i < block.length) out.push(block[i]);
  for (let i = 0; i < ecLen; i++) for (const block of ecBlocks) out.push(block[i]);
  return out;
}

// --- Matrix ---
type Grid = { size: number; dark: boolean[][]; fixed: boolean[][] };

function newGrid(version: number): Grid {
  const size = 17 + 4 * version;
  return {
    size,
    dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    fixed: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFixed(g: Grid, r: number, c: number, dark: boolean) {
  g.dark[r][c] = dark;
  g.fixed[r][c] = true;
}

function drawFinder(g: Grid, top: number, left: number) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = top + dr;
      const c = left + dc;
      if (r < 0 || c < 0 || r >= g.size || c >= g.size) continue;
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      setFixed(g, r, c, dark);
    }
  }
}

function drawAlignment(g: Grid, version: number) {
  const pos = ALIGNMENT[version];
  for (const cr of pos) {
    for (const cc of pos) {
      if ((cr === 6 && cc === 6) || (cr === 6 && cc === pos[pos.length - 1]) || (cr === pos[pos.length - 1] && cc === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFixed(g, cr + dr, cc + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }
}

function formatBits(mask: number): number {
  // level M = 00, then 3 mask bits -> 5 data bits
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  return (version << 12) | rem;
}

function drawFormat(g: Grid, mask: number) {
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const n = g.size;
  // around the top-left finder
  for (let i = 0; i <= 5; i++) setFixed(g, i, 8, bit(i));
  setFixed(g, 7, 8, bit(6));
  setFixed(g, 8, 8, bit(7));
  setFixed(g, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) setFixed(g, 8, 14 - i, bit(i));
  // the other two copies
  for (let i = 0; i < 8; i++) setFixed(g, 8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) setFixed(g, n - 15 + i, 8, bit(i));
  setFixed(g, n - 8, 8, true); // the always-dark module
}

function drawVersion(g: Grid, version: number) {
  if (version < 7) return;
  const bits = versionBits(version);
  const n = g.size;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = (i % 3) + n - 11;
    setFixed(g, a, b, dark);
    setFixed(g, b, a, dark);
  }
}

function buildFunctionPatterns(version: number): Grid {
  const g = newGrid(version);
  const n = g.size;
  drawFinder(g, 0, 0);
  drawFinder(g, 0, n - 7);
  drawFinder(g, n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    setFixed(g, 6, i, i % 2 === 0);
    setFixed(g, i, 6, i % 2 === 0);
  }
  drawAlignment(g, version);
  drawFormat(g, 0); // reserve the areas; real bits are written after masking
  drawVersion(g, version);
  return g;
}

function placeData(g: Grid, codewords: number[]) {
  const n = g.size;
  const bits: boolean[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push(((cw >>> i) & 1) === 1);
  let k = 0;
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const r = upward ? n - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = right - dc;
        if (g.fixed[r][c]) continue;
        g.dark[r][c] = k < bits.length ? bits[k] : false;
        k++;
      }
    }
    upward = !upward;
  }
}

function maskApplies(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function penalty(dark: boolean[][]): number {
  const n = dark.length;
  let score = 0;
  // runs of 5+ in rows and columns
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const cur = pass === 0 ? dark[a][b] : dark[b][a];
        const prev = pass === 0 ? dark[a][b - 1] : dark[b - 1][a];
        if (cur === prev) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }
  // 2x2 blocks
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = dark[r][c];
      if (v === dark[r][c + 1] && v === dark[r + 1][c] && v === dark[r + 1][c + 1]) score += 3;
    }
  }
  // finder-like patterns
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b + 11 <= n; b++) {
        let m1 = true;
        let m2 = true;
        for (let k = 0; k < 11; k++) {
          const v = pass === 0 ? dark[a][b + k] : dark[b + k][a];
          if (v !== pat1[k]) m1 = false;
          if (v !== pat2[k]) m2 = false;
        }
        if (m1) score += 40;
        if (m2) score += 40;
      }
    }
  }
  // dark proportion
  let darkCount = 0;
  for (const row of dark) for (const v of row) if (v) darkCount++;
  const percent = (darkCount * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = utf8Bytes(text);
  let version = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    const headerBits = 4 + (v <= 9 ? 8 : 16);
    if (Math.ceil((headerBits + bytes.length * 8) / 8) <= dataCapacity(v)) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error("qr_text_too_long");

  const codewords = buildCodewords(bytes, version);
  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = buildFunctionPatterns(version);
    placeData(g, codewords);
    for (let r = 0; r < g.size; r++) {
      for (let c = 0; c < g.size; c++) {
        if (!g.fixed[r][c] && maskApplies(mask, r, c)) g.dark[r][c] = !g.dark[r][c];
      }
    }
    drawFormat(g, mask);
    const score = penalty(g.dark);
    if (score < bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best!.dark;
}

/** An SVG string (dark modules only on a white square) with a 4-module quiet zone. */
export function qrSvg(text: string, pixelSize = 160): string {
  const matrix = qrMatrix(text);
  const quiet = 4;
  const total = matrix.length + quiet * 2;
  const rects: string[] = [];
  for (let r = 0; r < matrix.length; r++) {
    let c = 0;
    while (c < matrix.length) {
      if (!matrix[r][c]) {
        c++;
        continue;
      }
      let end = c;
      while (end < matrix.length && matrix[r][end]) end++;
      rects.push(`M${c + quiet} ${r + quiet}h${end - c}v1h-${end - c}z`);
      c = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${total}" height="${total}" fill="#fff"/><path d="${rects.join("")}" fill="#000"/></svg>`;
}
