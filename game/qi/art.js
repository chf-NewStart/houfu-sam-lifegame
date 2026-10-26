/* Qi's pixel art, as the app draws it (Qi/Views/PixelArt.swift, ChessArt.swift): the pond
   palette, the stone slab floating on pixel water, pebbles for black and shells for white
   (from the old web Qi page's own SVG paths), the chess pieces carved from the same two
   materials, the octagon ripple, and the rail's little pixel icons. */

export const C = {
  background: '#051113', panel: '#0b1e21', raised: '#10292c', hairline: 'rgba(153,242,214,.12)',
  green: '#51e68e', gold: '#e8b04a', cyan: '#45c7ff', rust: '#c76b4f', danger: '#eb6666',
  water: '#0b3036', waterLight: '#124249', waterDark: '#08272d',
  slab: '#5b716c', slabLight: '#70837d', slabDark: '#455d59', slabEdge: '#8da39c', slabShadow: '#203b39',
  gridLine: '#183e3d', star: '#284f4b', label: '#a9b9b3',
  ripple: '#9af3d6', rippleFaint: '#c1f8eb', mint: '#51e68e',
};

// ── Stones ────────────────────────────────────────────────────────────────────

const PEBBLE_OUTLINE = 'M-11-18H4V-16H11V-13H15V-8H18V5H16V12H10V16H3V18H-10V16H-15V11H-18V-4H-16V-12H-11Z';
const SHELL_OUTLINE = 'M-4 18H4V16H8V13H12V9H15V4H18V-5H16V-10H12V-13H7V-16H3V-18H-3V-16H-8V-13H-12V-10H-15V-5H-18V4H-15V9H-12V13H-8V16H-4Z';
const layers = (list) => list.map((l) => ({ ...l, path: new Path2D(l.d) }));
const PEBBLE = layers([
  { d: PEBBLE_OUTLINE, fill: '#020706', opacity: 0.72, dy: 2 },
  { d: PEBBLE_OUTLINE, fill: '#101917', stroke: '#050908' },
  { d: 'M-12-12L-3-16 9-13 3-6-10-5Z', fill: '#52645e' },
  { d: 'M4-5L14-8 15 7 6 11Z', fill: '#283832' },
  { d: 'M-10-11h3v3h-3z', fill: '#829b92' },
  { d: 'M-13 8h7v3h-7z', fill: '#17241f' },
]);
const SHELL = layers([
  { d: SHELL_OUTLINE, fill: '#4b3927', opacity: 0.55, dy: 2 },
  { d: SHELL_OUTLINE, fill: '#eadfc6', stroke: '#6f5a40' },
  { d: 'M0 14L-15-3M0 14L-11-11M0 14L-5-16M0 14L5-16M0 14L11-11M0 14L15-3', stroke: '#a58e68' },
  { d: 'M-5 14H5V17H-5Z', fill: '#b59c74' },
  { d: 'M-12-6h4v3h-4z', fill: '#fff6df' },
  { d: 'M9-5h4v3H9z', fill: '#e7cbbb' },
  { d: 'M-13 1h3v3h-3z', fill: '#bfd7cf' },
]);

/** A stone centred at (x, y), `diameter` across (the symbol is 40 units). */
export function drawStone(ctx, black, x, y, diameter, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const k = diameter / 40;
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 2;
  for (const l of black ? PEBBLE : SHELL) {
    ctx.save();
    ctx.globalAlpha = opacity * (l.opacity ?? 1);
    if (l.dy) ctx.translate(0, l.dy);
    if (l.fill) { ctx.fillStyle = l.fill; ctx.fill(l.path); }
    if (l.stroke) { ctx.strokeStyle = l.stroke; ctx.stroke(l.path); }
    ctx.restore();
  }
  ctx.restore();
}

// ── The pond ──────────────────────────────────────────────────────────────────

/** Notched-corner rectangle, like the web page's slab. */
export function slabPath(x, y, w, h, notch) {
  const p = new Path2D();
  const X = x + w, Y = y + h;
  p.moveTo(x + notch, y); p.lineTo(X - notch, y); p.lineTo(X - notch, y + notch); p.lineTo(X, y + notch);
  p.lineTo(X, Y - notch); p.lineTo(X - notch, Y - notch); p.lineTo(X - notch, Y); p.lineTo(x + notch, Y);
  p.lineTo(x + notch, Y - notch); p.lineTo(x, Y - notch); p.lineTo(x, y + notch); p.lineTo(x + notch, y + notch);
  p.closePath();
  return p;
}

/** The pond under every board: pixel water, and the stone slab floating on it with its
    shadow, specks and edge. `inset` is the water left showing around the slab. */
export function drawPond(ctx, side, inset) {
  const px = Math.max(2, side / 96);
  const tile = px * 8;
  ctx.fillStyle = C.water;
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = C.waterLight;
  for (let y = 0; y < side; y += tile) {
    for (let x = 0; x < side; x += tile) {
      ctx.fillRect(x, y, px * 3, px * 3);
      ctx.fillRect(x + px * 5, y + px * 5, px * 3, px * 3);
    }
  }
  ctx.fillStyle = C.waterDark;
  for (let y = 0; y < side; y += tile) for (let x = 0; x < side; x += tile) ctx.fillRect(x + px * 3, y + px * 5, px * 2, px * 3);

  const w = side - 2 * inset;
  const notch = px * 2;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = C.slabShadow;
  ctx.fill(slabPath(inset, inset + px * 2, w, w, notch));
  ctx.restore();
  const slab = slabPath(inset, inset, w, w, notch);
  ctx.fillStyle = C.slab;
  ctx.fill(slab);
  ctx.save();
  ctx.clip(slab);
  const st = px * 7;
  ctx.fillStyle = C.slabLight;
  for (let y = inset; y < inset + w - px; y += st) {
    for (let x = inset; x < inset + w - px; x += st) {
      ctx.fillRect(x, y, px * 3, px);
      ctx.fillRect(x + px * 5, y + px * 3, px * 2, px * 2);
    }
  }
  ctx.fillStyle = C.slabDark;
  for (let y = inset; y < inset + w - px; y += st) {
    for (let x = inset; x < inset + w - px; x += st) {
      ctx.fillRect(x + px * 3, y + px, px * 2, px);
      ctx.fillRect(x, y + px * 3, px * 2, px);
    }
  }
  ctx.restore();
  ctx.strokeStyle = C.slabEdge;
  ctx.lineWidth = Math.max(1, px * 0.9);
  ctx.stroke(slab);
}

/** A pixel octagon (the web page's ripple shape) of the given half-size. */
export function octagon(x, y, r, stretchX = 1, scaleY = 1) {
  const a = r * 0.42, rx = r * stretchX, ax = a * stretchX;
  const ry = r * scaleY, ay = a * scaleY;
  const p = new Path2D();
  p.moveTo(x - ax, y - ry); p.lineTo(x + ax, y - ry); p.lineTo(x + rx, y - ay); p.lineTo(x + rx, y + ay);
  p.lineTo(x + ax, y + ry); p.lineTo(x - ax, y + ry); p.lineTo(x - rx, y + ay); p.lineTo(x - rx, y - ay);
  p.closePath();
  return p;
}

// ── Chess pieces ──────────────────────────────────────────────────────────────

/* Pixel art carved from the Go stones' materials: Black from the dark river pebble, White
   from the cream shell. Classic king, queen and bishop; the rook is a stone lantern with a
   lit window, the pawn a little cairn of pebbles, the knight a seahorse (海马). 20×20 masks:
   '#' body, '+' a light accent, '-' a dark accent, 'x' an engraving, 'o' the lantern's glow.
   The outline and the rim light (top left) / shade (bottom right) come from the mask. */
export const MASKS = [null,
  ['....................', '....................', '....................', '....................', '....................',
   '........####........', '.......##+###.......', '.......######.......', '........####........', '....................',
   '......########......', '.....##+#######.....', '......########......', '....................', '....................',
   '.....##########.....', '....############....', '....###-##-#####....', '....................', '....................'],
  ['....................', '..........#.#.......', '.........#####......', '........#######.....', '......####x####.....',
   '....####...#####....', '...###.....#####-...', '..........######-...', '.........#######-...', '........########-...',
   '........#######-....', '.........######-....', '..........#####.....', '...........###......', '.........###........',
   '.....##########.....', '....############....', '....###-##-#####....', '....................', '....................'],
  ['....................', '.........##.........', '.........##.........', '........####........', '.......######.......',
   '......###x####......', '......##x#####......', '......########......', '.......######.......', '........####........',
   '.......######.......', '........####........', '........####........', '.......######.......', '......########......',
   '.....##########.....', '....############....', '....###-##-#####....', '....................', '....................'],
  ['....................', '.........##.........', '........####........', '...##..........##...', '...##############...',
   '....############....', '....................', '......########......', '......#oooooo#......', '......#oooooo#......',
   '......########......', '.....##########.....', '........####........', '........####........', '.......######.......',
   '.....##########.....', '....############....', '....###-##-#####....', '....................', '....................'],
  ['....................', '.....#...##...#.....', '.....##..##..##.....', '.....###.##.###.....', '.....#+########.....',
   '......########......', '.......######.......', '........####........', '........####........', '.......######.......',
   '........####........', '........####........', '.......######.......', '......########......', '.....##########.....',
   '....############....', '....############....', '....###-##-#####....', '....................', '....................'],
  ['.........##.........', '.......######.......', '.......######.......', '.........##.........', '.....##########.....',
   '....#+##########....', '.....##########.....', '......########......', '.......######.......', '.......######.......',
   '........####........', '.......######.......', '........####........', '.......######.......', '......########......',
   '.....##########.....', '....############....', '....###-##-#####....', '....................', '....................'],
];
const PEBBLE_M = { outline: '#050908', body: '#18241f', light: '#52645e', shade: '#0c1411', accentLight: '#829b92',
  accentDark: '#283832', engrave: '#050908', glow: '#9af3d6', shadow: '#020706', shadowOpacity: 0.72 };
const SHELL_M = { outline: '#6f5a40', body: '#eadfc6', light: '#fff6df', shade: '#cdb894', accentLight: '#fff6df',
  accentDark: '#a58e68', engrave: '#6f5a40', glow: '#e8b04a', shadow: '#4b3927', shadowOpacity: 0.55 };

const sprites = new Map();
/** One piece as a 20×21 canvas (its shadow one cell lower), drawn once. */
function sprite(piece, withShadow) {
  const key = piece * 2 + (withShadow ? 1 : 0);
  if (sprites.has(key)) return sprites.get(key);
  const n = 20, m = piece > 0 ? SHELL_M : PEBBLE_M;
  const rows = MASKS[Math.abs(piece)];
  const solid = (r, c) => r >= 0 && r < n && c >= 0 && c < n && rows[r][c] !== '.';
  const canvas = makeCanvas(n, n + 1);
  const ctx = canvas.getContext('2d');
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let color = null;
      if (solid(r, c)) {
        const ch = rows[r][c];
        color = ch === '+' ? m.accentLight : ch === '-' ? m.accentDark : ch === 'x' ? m.engrave : ch === 'o' ? m.glow
          : (!solid(r - 1, c) || !solid(r, c - 1)) ? m.light : (!solid(r + 1, c) || !solid(r, c + 1)) ? m.shade : m.body;
      } else {
        let near = false;
        for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (solid(r + dr, c + dc)) { near = true; break; }
        if (near) color = m.outline;
      }
      if (color) cells.push([r, c, color]);
    }
  }
  if (withShadow) {
    ctx.globalAlpha = m.shadowOpacity;
    ctx.fillStyle = m.shadow;
    for (const [r, c] of cells) ctx.fillRect(c, r + 1, 1, 1);
    ctx.globalAlpha = 1;
  }
  for (const [r, c, color] of cells) { ctx.fillStyle = color; ctx.fillRect(c, r, 1, 1); }
  sprites.set(key, canvas);
  return canvas;
}

/** Draws `piece` (signed: positive White) filling the square at (x, y) of side `size`.
    `upsideDown` turns it to face a player across the table. */
export function drawPiece(ctx, piece, x, y, size, { upsideDown = false, opacity = 1, shadow = true } = {}) {
  const kind = Math.abs(piece);
  if (kind < 1 || kind > 6) return;
  const img = sprite(piece, shadow);
  const k = size / 20;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x + size / 2, y + size / 2);
  if (upsideDown) ctx.rotate(Math.PI);
  ctx.drawImage(img, -size / 2, -size / 2, size, 21 * k);
  ctx.restore();
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** A small canvas element showing one stone or piece, for status lines and pickers. */
export function glyph(kind, value, px = 18) {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = Math.round(px * dpr);
  c.height = Math.round(px * dpr);
  c.style.width = px + 'px';
  c.style.height = px + 'px';
  c.className = 'glyph';
  const ctx = c.getContext('2d');
  if (kind === 'stone') drawStone(ctx, value === 1, c.width / 2, c.height / 2, c.width * 0.9);
  else drawPiece(ctx, value, 0, 0, c.width);
  return c;
}

// ── Pixel icons ───────────────────────────────────────────────────────────────

/* The rail's icons as 11×11 masks, drawn as crisp SVG squares in the text colour. */
const ICONS = {
  back: ['.......##..', '......##...', '.....##....', '....##.....', '...##......', '..##.......', '...##......', '....##.....', '.....##....', '......##...', '.......##..'],
  help: ['...#####...', '..##...##..', '..##...##..', '.......##..', '......##...', '.....##....', '.....##....', '...........', '.....##....', '.....##....', '...........'],
  sound: ['.....#.....', '....##..#..', '...###...#.', '#####.#..#.', '#####..#.#.', '#####..#.#.', '#####..#.#.', '#####.#..#.', '...###...#.', '....##..#..', '.....#.....'],
  mute: ['.....#.....', '....##.....', '...###.....', '#####.#...#', '#####..#.#.', '#####...#..', '#####..#.#.', '#####.#...#', '...###.....', '....##.....', '.....#.....'],
  pass: ['...........', '..#.#.#....', '..#.#.#.#..', '..#.#.#.#..', '..#######..', '.########..', '#.#######..', '.########..', '..######...', '...####....', '...........'],
  undo: ['...#.......', '..##.......', '.#########.', '..##......#', '...#......#', '..........#', '..........#', '.........#.', '...######..', '...........', '...........'],
  flag: ['.#.........', '.#######...', '.########..', '.#######...', '.######....', '.#######...', '.#.........', '.#.........', '.#.........', '.#.........', '###........'],
  bulb: ['...#####...', '..#.....#..', '.#.......#.', '.#...#...#.', '.#..#....#.', '..#.....#..', '...#...#...', '...#####...', '...#####...', '....###....', '...........'],
  scope: ['.....#.....', '...#####...', '..#..#..#..', '.#...#...#.', '.#.......#.', '#####.#####', '.#.......#.', '.#...#...#.', '..#..#..#..', '...#####...', '.....#.....'],
  plus: ['###########', '#.........#', '#....#....#', '#....#....#', '#....#....#', '#.#######.#', '#....#....#', '#....#....#', '#....#....#', '#.........#', '###########'],
  cube: ['.....#.....', '...##.##...', '.##.....##.', '#.##...##.#', '#...###...#', '#....#....#', '#....#....#', '#....#....#', '.##..#..##.', '...#.#.#...', '.....#.....'],
  board: ['###########', '#.#.#.#.#.#', '###########', '#.#.#.#.#.#', '###########', '#.#.#.#.#.#', '###########', '#.#.#.#.#.#', '###########', '#.#.#.#.#.#', '###########'],
  check: ['...........', '..........#', '.........##', '........##.', '#......##..', '##....##...', '.##..##....', '..####.....', '...##......', '...........', '...........'],
  play: ['.##........', '.####......', '.######....', '.########..', '.#########.', '.#########.', '.########..', '.######....', '.####......', '.##........', '...........'],
  pause: ['...........', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '.###...###.', '...........'],
  start: ['...........', '##.....##..', '##....###..', '##...####..', '##..#####..', '##.######..', '##..#####..', '##...####..', '##....###..', '##.....##..', '...........'],
  prev: ['...........', '......##...', '.....###...', '....####...', '...#####...', '..######...', '...#####...', '....####...', '.....###...', '......##...', '...........'],
  next: ['...........', '...##......', '...###.....', '...####....', '...#####...', '...######..', '...#####...', '...####....', '...###.....', '...##......', '...........'],
  end: ['...........', '..##.....##', '..###....##', '..####...##', '..#####..##', '..######.##', '..#####..##', '..####...##', '..###....##', '..##.....##', '...........'],
  replay: ['...#####...', '..#.....#..', '.#...#...#.', '#....#....#', '#....#....#', '#....###..#', '#.........#', '##.......#.', '###.....#..', '...#####...', '...........'],
  globe: ['...#####...', '..#..#..#..', '.#..#.#..#.', '#...#.#...#', '###########', '#...#.#...#', '###########', '#...#.#...#', '.#..#.#..#.', '..#..#..#..', '...#####...'],
  share: ['.....#.....', '....###....', '...#.#.#...', '.....#.....', '.....#.....', '.....#.....', '.###.#.###.', '.#.......#.', '.#.......#.', '.#########.', '...........'],
  close: ['...........', '.##.....##.', '..##...##..', '...##.##...', '....###....', '....###....', '...##.##...', '..##...##..', '.##.....##.', '...........', '...........'],
  draw: ['...........', '...#####...', '..#.....#..', '.#.#####.#.', '.#.......#.', '.#.#####.#.', '..#.....#..', '...#####...', '...........', '...........', '...........'],
  face: ['....#......', '...###.....', '..#.#.#....', '....#......', '....#......', '...........', '......#....', '......#....', '....#.#.#..', '.....###...', '......#....'],
  again: ['...#####...', '..#.....#..', '.#.......#.', '#.........#', '#.........#', '#.....#####', '#......###.', '.#......#..', '..#........', '...#####...', '...........'],
  leaf: ['........###', '.....#####.', '...######.#', '..#####.#..', '.####.#....', '.###.#.....', '.##.#......', '.#.#.......', '..#........', '.#.........', '#..........'],
  lizard: ['...........', '.##........', '####.......', '.###.......', '..####.....', '...######..', '....#######', '...#..##..#', '..#..#..#..', '.........#.', '...........'],
  copy: ['...........', '...#######.', '...#.....#.', '.#######.#.', '.#.....#.#.', '.#.....#.#.', '.#.....#.#.', '.#.....###.', '.#.....#...', '.#######...', '...........'],
  door: ['.#######...', '.#.....#...', '.#.....#...', '.#.....#..#', '.#...#.#.##', '.#.....####', '.#.....#.##', '.#.....#..#', '.#.....#...', '.#.....#...', '.#######...'],
};

export function icon(name, cls = 'ic') {
  const rows = ICONS[name];
  if (!rows) return '';
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') rects += `M${x} ${y}h1v1h-1z`;
  });
  return `<svg class="${cls}" viewBox="0 0 11 11" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="${rects}"/></svg>`;
}
