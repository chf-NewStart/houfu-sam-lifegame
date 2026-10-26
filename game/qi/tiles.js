/* 麻将 tiles in the app's pixel style (Qi/Views/MahjongTiles.swift): a bone face on a jade back,
   notched pixel corners, the classic faces (dots, bamboo, the characters as 16 × 16 pixel
   glyphs inside a margin of bone) and, for players who don't read the characters, a small
   pixel number in the corner. A tile is a 16 × 22 grid of pixels: the face 19 rows, the jade
   back showing under it 3. Each tile is drawn once into a small canvas and reused. */
import { GLYPHS } from './glyphs.js?v=10';
import { rank, suit } from './mahjong.js?v=10';

export const COLORS = {
  ivory: '#efe7d2', ivoryShade: '#d6cbb0', ivoryLight: '#fffaee', outline: '#14201c',
  jade: '#1f7a5c', jadeDark: '#134d3a', jadeLight: '#3fae86',
  navy: '#1d2a55', red: '#c23a2b', green: '#23824a', blue: '#2459b0',
};
const C = COLORS;
export const ASPECT = 16 / 22;
const U = 6;                       // canvas pixels per tile pixel in the cached sprites

/** Draws a character's 16 × 16 mask in a square at (x, y), `size` across. */
export function glyph(ctx, ch, x, y, size, color) {
  const rows = GLYPHS[ch];
  if (!rows) return;
  const cell = size / 16;
  ctx.fillStyle = color;
  for (let r = 0; r < 16; r++) {
    const bits = parseInt(rows.slice(r * 4, r * 4 + 4), 16);
    for (let c = 0; c < 16; c++) if (bits & (1 << (15 - c))) ctx.fillRect(x + c * cell, y + r * cell, cell + 0.02, cell + 0.02);
  }
}

const TINY = {
  1: ['.x.', 'xx.', '.x.', '.x.', 'xxx'], 2: ['xx.', '..x', '.x.', 'x..', 'xxx'], 3: ['xx.', '..x', '.x.', '..x', 'xx.'],
  4: ['x.x', 'x.x', 'xxx', '..x', '..x'], 5: ['xxx', 'x..', 'xx.', '..x', 'xx.'], 6: ['.xx', 'x..', 'xxx', 'x.x', 'xxx'],
  7: ['xxx', '..x', '.x.', '.x.', '.x.'], 8: ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'], 9: ['xxx', 'x.x', 'xxx', '..x', 'xx.'],
  E: ['xxx', 'x..', 'xx.', 'x..', 'xxx'], S: ['.xx', 'x..', '.x.', '..x', 'xx.'], W: ['x.x', 'x.x', 'x.x', 'xxx', 'x.x'], N: ['x.x', 'xxx', 'xxx', 'x.x', 'x.x'],
};
function tiny(ctx, text, x, y, cell, color) {
  ctx.fillStyle = color;
  [...text].forEach((ch, k) => {
    const rows = TINY[ch];
    if (!rows) return;
    rows.forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === 'x') ctx.fillRect(x + (k * 4 + i) * cell, y + j * cell, cell, cell); });
  });
}

const indexMark = (t) => (t < 27 ? String(rank(t)) : t < 31 ? 'ESWN'[t - 27] : null);
const indexColor = (t) => [C.red, C.blue, C.green, C.navy][suit(t)];

/** The tile's body: jade back under a bone face (or all jade, face down), notched corners. */
function body(ctx, u, back) {
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * u, y * u, w * u, h * u); };
  const notched = (x, y, w, h, c) => { px(x + 1, y, w - 2, h, c); px(x, y + 1, w, h - 2, c); };
  notched(0, 0, 16, 22, C.outline);
  notched(1, 1, 14, 20, C.jade);
  px(1, 20, 14, 1, C.jadeDark);
  if (back) {
    px(2, 2, 12, 1, C.jadeLight);
    ctx.globalAlpha = 0.7; px(2, 3, 1, 15, C.jadeLight); ctx.globalAlpha = 1;
    px(13, 4, 1, 15, C.jadeDark);
    ctx.globalAlpha = 0.5; px(4, 5, 2, 2, C.jadeLight); ctx.globalAlpha = 1;
    return;
  }
  notched(1, 1, 14, 18, C.ivory);
  px(2, 1, 12, 1, C.ivoryLight);
  px(1, 2, 1, 16, C.ivoryLight);
  px(2, 18, 12, 1, C.ivoryShade);
  px(14, 2, 1, 16, C.ivoryShade);
}

/** The pictures, on a grid of half tile-pixels (32 × 44), inside a margin of bone: the content
    box is x 5…27, y 5…35. */
function face(ctx, t, ox, oy, u) {
  const h = u / 2;
  const half = (x, y, w, ht, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x * h, oy + y * h, w * h, ht * h); };
  const at = (fx, fy) => [5 + fx * 22, 5 + fy * 30];
  const r = rank(t);
  switch (suit(t)) {
    case 0:
      glyph(ctx, '一二三四五六七八九'[r - 1], ox + 10 * h, oy + 4.5 * h, 12 * h, C.navy);
      glyph(ctx, '萬', ox + 8 * h, oy + 18 * h, 16 * h, C.red);
      break;
    case 1:
      if (r === 1) ring(half);
      else {
        const d = r >= 7 ? 5 : 6;
        for (const [fx, fy, c] of dots(r)) { const [x, y] = at(fx, fy); dot(half, Math.round(x - d / 2), Math.round(y - d / 2), d, c); }
      }
      break;
    case 2:
      if (r === 1) bird(ctx, ox + 5.5 * h, oy + 9 * h, 1.5 * h);
      else {
        const [list, length, width] = sticks(r);
        for (const [fx, fy, c, l] of list) { const [x, y] = at(fx, fy); const len = l || length; stick(ctx, half, Math.round(x - width / 2), Math.round(y - len / 2), width, len, c); }
      }
      break;
    default:
      if (r === 7) {
        // 白: the white dragon, a blue frame.
        half(7, 8, 18, 2, C.blue); half(7, 30, 18, 2, C.blue); half(7, 10, 2, 20, C.blue); half(23, 10, 2, 20, C.blue);
        ctx.globalAlpha = 0.55;
        half(11, 12, 10, 1, C.blue); half(11, 27, 10, 1, C.blue); half(11, 13, 1, 14, C.blue); half(20, 13, 1, 14, C.blue);
        ctx.globalAlpha = 1;
      } else {
        glyph(ctx, '東南西北中發'[r - 1], ox + 6 * h, oy + 10 * h, 20 * h, r === 5 ? C.red : r === 6 ? C.green : C.navy);
      }
  }
}

function dots(n) {
  const b = C.blue, g = C.green, r = C.red;
  switch (n) {
    case 2: return [[0.5, 0.22, g], [0.5, 0.78, b]];
    case 3: return [[0.18, 0.14, b], [0.5, 0.5, r], [0.82, 0.86, g]];
    case 4: return [[0.25, 0.22, b], [0.75, 0.22, g], [0.25, 0.78, g], [0.75, 0.78, b]];
    case 5: return [[0.2, 0.17, b], [0.8, 0.17, g], [0.5, 0.5, r], [0.2, 0.83, g], [0.8, 0.83, b]];
    case 6: return [[0.27, 0.13, g], [0.73, 0.13, g], [0.27, 0.55, r], [0.73, 0.55, r], [0.27, 0.87, r], [0.73, 0.87, r]];
    case 7: return [[0.15, 0.08, g], [0.5, 0.2, g], [0.85, 0.32, g], [0.27, 0.64, r], [0.73, 0.64, r], [0.27, 0.9, r], [0.73, 0.9, r]];
    case 8: return [0.1, 0.37, 0.63, 0.9].flatMap((y) => [[0.27, y, b], [0.73, y, b]]);
    default: return [[0.13, b], [0.5, r], [0.87, g]].flatMap(([y, c]) => [[0.15, y, c], [0.5, y, c], [0.85, y, c]]);
  }
}
function dot(half, x, y, d, color) {
  const r = d / 2;
  for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
    const dx = i + 0.5 - r, dy = j + 0.5 - r;
    if (dx * dx + dy * dy <= r * r + 0.6) half(x + i, y + j, 1, 1, color);
  }
  half(x + r - 0.5, y + r - 0.5, 1, 1, C.ivory);
  half(x + 1, y + 1, 1, 1, 'rgba(255,250,238,.8)');
}
function ring(half) {
  for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
    const dx = i - 9.5, dy = j - 9.5, d = Math.hypot(dx, dy);
    const c = d > 10 ? null : d > 8.4 ? C.green : d > 6.8 ? C.ivory : d > 4.6 ? C.blue : d > 2.6 ? C.red : d > 1.2 ? C.ivory : C.green;
    if (c) half(6 + i, 10 + j, 1, 1, c);
  }
}
function sticks(n) {
  const g = C.green, r = C.red, b = C.blue;
  switch (n) {
    case 2: return [[[0.5, 0.25, g], [0.5, 0.75, b]], 12, 3];
    case 3: return [[[0.5, 0.25, g], [0.25, 0.75, b], [0.75, 0.75, b]], 12, 3];
    case 4: return [[[0.27, 0.25, g], [0.73, 0.25, b], [0.27, 0.75, b], [0.73, 0.75, g]], 12, 3];
    case 5: return [[[0.2, 0.22, g], [0.8, 0.22, b], [0.5, 0.5, r], [0.2, 0.78, b], [0.8, 0.78, g]], 11, 3];
    case 6: return [[0.25, 0.75].flatMap((y) => [[0.18, y, g], [0.5, y, g], [0.82, y, b]]), 12, 3];
    case 7: return [[[0.5, 0.12, r, 7]].concat([0.48, 0.84].flatMap((y) => [[0.18, y, g], [0.5, y, g], [0.82, y, b]])), 9, 3];
    case 8: return [[0.25, 0.75].flatMap((y) => [[0.12, y, g], [0.37, y, g], [0.63, y, b], [0.88, y, b]]), 12, 2];
    default: return [[0.15, 0.5, 0.85].flatMap((y) => [[0.18, y, g], [0.5, y, r], [0.82, y, b]]), 8, 3];
  }
}
function stick(ctx, half, x, y, w, h, color) {
  half(x, y + 1, w, h - 2, color);
  half(x - 0.5, y, w + 1, 1, color);
  half(x - 0.5, y + h - 1, w + 1, 1, color);
  half(x, y + 1, 1, h - 2, 'rgba(255,255,255,.3)');
  half(x, Math.floor(y + (h - 1) / 2), w, 1, 'rgba(0,0,0,.35)');
}
/** 一条 is a bird (the sparrow, 幺鸡): green body and tail, red crest and breast. */
function bird(ctx, x0, y0, cell) {
  const rows = ['......rr......', '.....rggr.....', '.....gkgg.....', '....ygggg.....', '.....gggg.....', '....rrggg..g..', '...rrrgggggg..',
    '...rrggggbgg..', '....rgggbbgg..', '.....ggbbgg...', '......gggg....', '......g..g....', '.....gg.gg....', '....bbbbbbb...'];
  const colors = { r: C.red, g: C.green, b: C.blue, k: C.outline, y: '#d99a2b' };
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (colors[ch]) { ctx.fillStyle = colors[ch]; ctx.fillRect(x0 + i * cell, y0 + j * cell, cell, cell); } }));
}

const cache = new Map();
/** A tile as a 16 × 22 sprite (×6): face up, face down (`t` null or −1), dimmed (claimed), with
    the corner number or not. */
export function sprite(t, { index = false, dim = false } = {}) {
  const back = t == null || t < 0;
  const key = back ? 'back' : `${t}:${index ? 1 : 0}:${dim ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = 16 * U;
  c.height = 22 * U;
  const ctx = c.getContext('2d');
  body(ctx, U, back);
  if (!back) {
    if (dim) ctx.globalAlpha = 0.45;
    face(ctx, t, 0, 0, U);
    const mark = index && indexMark(t);
    if (mark) {
      const cell = U * 0.5, w = (mark.length * 4 - 1) * cell;
      const x = 15 * U - w - U * 0.3, y = 1.1 * U;
      ctx.fillStyle = 'rgba(239,231,210,.92)';
      ctx.fillRect(x - cell / 2, y - cell / 2, w + cell, 6 * cell);
      tiny(ctx, mark, x, y, cell, indexColor(t));
    }
    ctx.globalAlpha = 1;
  }
  cache.set(key, c);
  return c;
}

/** Draws a tile into `rect` on a canvas (crisp, pixel by pixel). */
export function drawTile(ctx, t, x, y, w, opts) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite(t, opts), x, y, w, w / ASPECT);
}

const faces = new Map();
/** The face alone (14 × 18 tile-pixels of bone and its picture), a texture for the 3D tiles. */
export function faceOnly(t, index) {
  const key = `${t}:${index ? 1 : 0}`;
  if (faces.has(key)) return faces.get(key);
  const u = 12;
  const c = document.createElement('canvas');
  c.width = 14 * u;
  c.height = 18 * u;
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.ivory;
  ctx.fillRect(0, 0, c.width, c.height);
  face(ctx, t, -u, -u, u);
  if (index && t < 31) {
    const mark = t < 27 ? String(rank(t)) : 'ESWN'[t - 27];
    const cell = u * 0.5, w = (mark.length * 4 - 1) * cell;
    tiny(ctx, mark, c.width - w - u * 0.5, u * 0.3, cell, indexColor(t));
  }
  faces.set(key, c);
  return c;
}

const urls = new Map();
/** A tile as an image URL, for buttons. */
export function tileURL(t, opts = {}) {
  const key = `${t}:${opts.index ? 1 : 0}`;
  if (!urls.has(key)) urls.set(key, sprite(t, opts).toDataURL());
  return urls.get(key);
}

export const NAMES = {
  en(t) {
    if (t < 0) return 'hidden tile';
    const r = rank(t);
    return ['', '', '', ''][0] + (suit(t) === 0 ? `${r} character` : suit(t) === 1 ? `${r} dot` : suit(t) === 2 ? `${r} bamboo`
      : ['East', 'South', 'West', 'North', 'Red dragon', 'Green dragon', 'White dragon'][r - 1]);
  },
  zh(t) {
    if (t < 0) return '暗牌';
    const r = rank(t), n = '一二三四五六七八九';
    return suit(t) === 0 ? `${n[r - 1]}万` : suit(t) === 1 ? `${n[r - 1]}筒` : suit(t) === 2 ? `${n[r - 1]}条` : ['东风', '南风', '西风', '北风', '红中', '发财', '白板'][r - 1];
  },
  short(t, zh) { if (zh) return NAMES.zh(t); return t >= 0 && t < 27 ? `${rank(t)}${'cdb'[suit(t)]}` : NAMES.en(t); },
};
