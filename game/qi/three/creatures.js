/* The creatures of the 3D Go board and the Gomoku garden (the app's Qi/Engine/GoCreatures.swift,
   Qi/Scene3D/Creatures3D.swift and Garden3D.swift). Every group of connected stones is one
   animal whose body passes over all its stones, grown move by move as the group grew: Black's
   are black snakes, low over their pebbles, winding, with jade diamonds and glowing mint marks;
   White's are ivory dragons floating in waves over their shells, antlers and whiskers, golden
   spines and mane, short clawed legs. A group likely to be captured lies flat and grey; one
   with a single liberty left breathes a puff (气) over it. On the Gomoku board Black grows
   tomatoes and White cucumbers, ripening as their lines grow, joined by vines. */
import * as THREE from './three.js?v=6';
import { VoxelModel, Noise, color } from './voxels.js?v=6';

// ── Where the bodies go ───────────────────────────────────────────────────────

export const neighbors = (p, size) => {
  const r = Math.floor(p / size), c = p % size, out = [];
  if (r > 0) out.push(p - size);
  if (c > 0) out.push(p - 1);
  if (c < size - 1) out.push(p + 1);
  if (r < size - 1) out.push(p + size);
  return out;
};
const adjacent = (a, b, size) => Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs((a % size) - (b % size)) === 1;

function groups(board, size) {
  const seen = new Set(), out = [];
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || seen.has(i)) continue;
    const g = new Set([i]), stack = [i];
    seen.add(i);
    while (stack.length) {
      const p = stack.pop();
      for (const q of neighbors(p, size)) if (board[q] === board[i] && !seen.has(q)) { seen.add(q); g.add(q); stack.push(q); }
    }
    out.push(g);
  }
  return out;
}

/** A walk through every stone of `group`: a path visiting each once when one can be found
    quickly, otherwise the longest path with folds out to the stones off it. */
function walkThrough(group, size, board, preferredHead) {
  if (group.size <= 1) return [...group];
  const nbrs = new Map([...group].map((p) => [p, neighbors(p, size).filter((q) => group.has(q))]));
  const air = (p) => neighbors(p, size).filter((q) => board[q] === 0).length;
  let budget = 6000;
  const hamiltonian = (start) => {
    const path = [start], used = new Set([start]);
    const extend = () => {
      if (path.length === group.size) return true;
      if (--budget <= 0) return false;
      const free = (q) => nbrs.get(q).filter((x) => !used.has(x)).length;
      const options = nbrs.get(path[path.length - 1]).filter((q) => !used.has(q)).sort((a, b) => free(a) - free(b) || a - b);
      for (const q of options) {
        path.push(q); used.add(q);
        if (extend()) return true;
        path.pop(); used.delete(q);
      }
      return false;
    };
    return extend() ? path : null;
  };
  const dark = [...group].filter((p) => (Math.floor(p / size) + (p % size)) % 2 === 0).length;
  if (Math.abs(dark * 2 - group.size) <= 1) {
    let starts = [...group].sort((a, b) => nbrs.get(a).length - nbrs.get(b).length || a - b);
    if (preferredHead != null && group.has(preferredHead)) starts = [preferredHead, ...starts.filter((s) => s !== preferredHead)];
    for (const s of starts.slice(0, 8)) {
      const path = hamiltonian(s);
      if (path) return preferredHead == null && air(path[path.length - 1]) > air(path[0]) ? path.reverse() : path;
      if (budget <= 0) break;
    }
  }
  const bfs = (s) => {
    const parent = new Map([[s, s]]), queue = [s];
    for (let k = 0; k < queue.length; k++) for (const q of nbrs.get(queue[k])) if (!parent.has(q)) { parent.set(q, queue[k]); queue.push(q); }
    return { far: queue[queue.length - 1], parent };
  };
  const a = preferredHead != null && group.has(preferredHead) ? preferredHead : bfs(Math.min(...group)).far;
  const { far: b, parent } = bfs(a);
  let spine = [b];
  while (spine[spine.length - 1] !== a) spine.push(parent.get(spine[spine.length - 1]));
  spine.reverse();
  if (preferredHead == null && air(spine[spine.length - 1]) > air(spine[0])) spine.reverse();
  const children = new Map();
  for (const [q, p] of parent) if (q !== p) { if (!children.has(p)) children.set(p, []); children.get(p).push(q); }
  const onSpine = new Set(spine), walk = [];
  const fold = (p) => {
    for (const q of (children.get(p) || []).slice().sort((x, y) => x - y)) {
      if (onSpine.has(q)) continue;
      walk.push(q); fold(q); walk.push(p);
    }
  };
  for (const p of spine) { walk.push(p); fold(p); }
  const inWalk = new Set(walk);
  for (const s of [...group].sort((x, y) => x - y)) if (!inWalk.has(s)) walk.push(s);
  return walk;
}

/** The creatures for a game, grown move by move through its positions, so going forward they
    grow and going back they shrink. */
export class GoCreatures {
  constructor(size) { this.size = size; this.creatures = []; }

  update(board) {
    const size = this.size, next = [];
    for (const g of groups(board, size)) {
      const color = board[[...g][0]];
      const inside = this.creatures.filter((c) => c.color === color && c.walk.every((p) => g.has(p))).sort((a, b) => b.walk.length - a.walk.length);
      const covered = new Set(inside.flatMap((c) => c.walk));
      if (inside.length === 1) {
        const old = inside[0];
        const added = [...g].filter((p) => !covered.has(p));
        if (!added.length) { next.push(old); continue; }
        if (added.length === 1) { next.push({ color, walk: this.grow(old.walk, added[0]) }); continue; }
      }
      const head = inside.length ? inside[0].walk[0] : null;
      let walk = walkThrough(g, size, board, covered.size ? head : null);
      if (head != null && walk[walk.length - 1] === head) walk = walk.reverse();
      next.push({ color, walk });
    }
    this.creatures = next;
  }

  grow(walk, s) {
    const size = this.size;
    if (adjacent(walk[0], s, size)) return [s, ...walk];
    if (adjacent(walk[walk.length - 1], s, size)) return [...walk, s];
    const i = walk.findIndex((p) => adjacent(p, s, size));
    if (i >= 0) return [...walk.slice(0, i + 1), s, ...walk.slice(i)];
    return [...walk, s];
  }

  static grown(size, boards) { const c = new GoCreatures(size); for (const b of boards) c.update(b); return c; }
}

/** One animal per group of two or more stones, its mood from the ownership estimate. */
export function animalsFor(board, size, creatures, ownership) {
  if (!creatures) return [];
  const out = [];
  for (const c of creatures.creatures) {
    if (c.walk.length < 2 || !c.walk.every((p) => board[p] === c.color)) continue;
    const stones = [...new Set(c.walk)];
    let mood = 0;
    if (ownership && ownership.length === board.length) {
      const sign = c.color === 1 ? 1 : -1;
      const v = stones.reduce((s, p) => s + ownership[p] * sign, 0) / stones.length;
      mood = v < -0.25 ? -1 : (v > 0.5 ? 1 : 0);
    }
    const libs = new Set();
    for (const p of stones) for (const q of neighbors(p, size)) if (board[q] === 0) libs.add(q);
    out.push({ black: c.color === 1, walk: c.walk, mood, breath: libs.size === 1 ? [...libs][0] : null,
      key: `${c.color}:${c.walk.join(',')}:${mood}:${libs.size === 1 ? [...libs][0] : ''}` });
  }
  return out;
}

// ── The animals in voxels ─────────────────────────────────────────────────────

export const PER_CELL = 16;
const AGE = { hatchling: 0, young: 1, adult: 2, elder: 3 };
const ageOf = (stones) => (stones <= 2 ? 0 : stones <= 4 ? 1 : stones < 10 ? 2 : 3);
const SCALE = [0.68, 0.84, 1, 1.14];
const PALETTES = {
  snake: { back: 0x16231d, scale: 0x3fae80, belly: 0x9ed6bb, spine: 0x9af3d6, eye: 0xd8ff6a, horn: 0x829b92, tongue: 0xe04a62 },
  snakeDying: { back: 0x35403b, scale: 0x5b6b63, belly: 0x77847c, spine: 0x7d8a84, eye: 0x1c2220, horn: 0x5c6460, tongue: 0x5c6460 },
  dragon: { back: 0xe2d2ac, scale: 0xeedfbc, belly: 0xc7ab74, spine: 0xe8b04a, eye: 0xffcf4a, horn: 0xbe9c60, tongue: 0xd9485e },
  // Dying, the head still reads: dark antlers against the grey, the eyes a dim amber.
  dragonDying: { back: 0xa39d90, scale: 0xbab4a6, belly: 0x8c8679, spine: 0xb3a682, eye: 0xa07a36, horn: 0x5f5447, tongue: 0x9a9488 },
};

const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
};
function horizontal(d) { const l = Math.hypot(d[0], d[2]); return l > 1e-4 ? [d[0] / l, 0, d[2] / l] : [0, 0, 1]; }
function boardPoint(i, size, top) { const h = (size - 1) / 2; return [((i % size) - h) * PER_CELL, top * PER_CELL, (Math.floor(i / size) - h) * PER_CELL]; }

/** One animal along `walk` (head first). `vigor`: how safe its group is (−1 lost … +1 safe). */
export function animal(kind, walk, size, top, vigor, breath) {
  const dying = vigor < -0.25;
  const pal = PALETTES[kind + (dying ? 'Dying' : '')];
  const age = ageOf(new Set(walk).size);
  const v = new VoxelModel();
  const line = centerline(kind, walk, size, top, dying, age);
  const radius = (kind === 'snake' ? 2.9 : 3.1) * SCALE[age];
  body(v, line, kind, radius, pal, age);
  const d = horizontal(V3.sub(line[0], line[Math.min(4, line.length - 1)]));
  if (kind === 'snake') snakeHead(v, line[0], d, SCALE[age], age, pal, dying);
  else {
    // A great dragon's head grows more than its body, so it isn't lost among the coils.
    dragonHead(v, line[0], d, SCALE[age] * (age === AGE.elder ? 1.22 : 1), age, pal, dying);
    if (age > AGE.hatchling) legs(v, line, radius, pal, top * PER_CELL, age === AGE.young ? 1 : 2);
  }
  const puffColor = kind === 'snake' ? 0xc8fbe9 : 0xfff1c8;
  if (breath != null) puff(v, boardPoint(breath, size, top), puffColor);
  const glow = new Set(dying ? [] : [pal.eye, pal.spine, puffColor]);
  return { model: v, glow };
}

function centerline(kind, walk, size, top, dying, age) {
  const traversals = new Map(), seen = new Map();
  const key = (a, b) => Math.min(a, b) * 4096 + Math.max(a, b);
  for (let k = 0; k < walk.length - 1; k++) { const e = key(walk[k], walk[k + 1]); traversals.set(e, (traversals.get(e) || 0) + 1); }
  const stoneTop = 4;
  const P = (i) => boardPoint(i, size, top);
  let pts = [];
  for (let k = 0; k < walk.length; k++) {
    let p = P(walk[k]);
    let offset = [0, 0, 0], lanes = 0, lift = 0;
    for (const seg of [k - 1, k]) {
      if (seg < 0 || seg >= walk.length - 1) continue;
      const edge = key(walk[seg], walk[seg + 1]);
      if (traversals.get(edge) <= 1) continue;
      const dir = horizontal(V3.sub(P(walk[seg + 1]), P(walk[seg])));
      offset = V3.add(offset, V3.mul([dir[2], 0, -dir[0]], 3.2));
      lanes++;
      if ((seen.get(edge) || 0) > 0) lift = 2.5;
    }
    if (k < walk.length - 1) { const e = key(walk[k], walk[k + 1]); seen.set(e, (seen.get(e) || 0) + 1); }
    if (lanes) p = V3.add(p, V3.mul(offset, 1 / lanes));
    const wave = k % 2 === 0 ? 1 : -1;
    if (kind === 'snake') {
      if (k > 0 && k < walk.length - 1) {
        const d = horizontal(V3.sub(P(walk[k + 1]), P(walk[k - 1])));
        p = V3.add(p, V3.mul([d[2], 0, -d[0]], 1.6 * wave));
      }
      p[1] += stoneTop + (dying ? 0.5 : 2.2) + lift;
    } else {
      p[1] += stoneTop + (dying ? 0.8 : (2.5 + 3.5 * SCALE[age]) + 2.2 * SCALE[age] * wave) + lift;
    }
    pts.push(p);
  }
  if (walk.length >= 2) {
    const h = horizontal(V3.sub(pts[0], pts[1])), t = horizontal(V3.sub(pts[pts.length - 1], pts[pts.length - 2]));
    pts.unshift(V3.add(V3.add(pts[0], V3.mul(h, 5)), [0, kind === 'dragon' && !dying ? 1.5 : 0, 0]));
    pts.push(V3.sub(V3.add(pts[pts.length - 1], V3.mul(t, 7)), [0, kind === 'dragon' ? 1.5 : 0.5, 0]));
  } else {
    pts = [P(walk[0]), V3.add(P(walk[0]), [1, 0, 0])];
  }
  return resample(catmullRom(pts, 8), 0.5);
}

function body(v, line, kind, radius, pal, age) {
  let arc = 0;
  const total = (line.length - 1) * 0.5;
  line.forEach((c, i) => {
    if (i > 0) arc += V3.len(V3.sub(c, line[i - 1]));
    const u = arc / Math.max(total, 0.5);
    const r = radius * profile(kind, u, total);
    const a0 = arc;
    v.ball(c, r, (x, y, z) => {
      const dy = y + 0.5 - c[1];
      if (dy < -r * 0.38) return pal.belly;
      if (kind === 'snake') {
        const along = (a0 / 7) % 1;
        const across = Math.abs(x + 0.5 - c[0]) + Math.abs(z + 0.5 - c[2]);
        const diamond = Math.abs(along - 0.5) * 2 * 3.2 + across * 0.55;
        return dy > -0.5 && diamond < 2.6 ? pal.scale : pal.back;
      }
      return Math.floor((a0 + (x + z) * 0.25) / 2.4) % 2 === 0 ? pal.scale : pal.back;
    });
    const back = [c[0], c[1] + r + 0.4, c[2]];
    if (u > 0.1 && u < 0.9 && (kind === 'snake' || age > AGE.hatchling) && Math.floor(arc * 2) % 8 === 0) {
      v.set(Math.floor(back[0]), Math.floor(back[1]), Math.floor(back[2]), pal.spine);
      if (kind === 'dragon') v.set(Math.floor(back[0]), Math.floor(back[1]) + 1, Math.floor(back[2]), pal.spine);
    }
  });
  if (kind === 'dragon' && line.length > 4) {
    const tip = line[line.length - 1], d = horizontal(V3.sub(tip, line[line.length - 4]));
    for (let k = 0; k < (age === AGE.hatchling ? 2 : 4); k++) {
      v.ball(V3.add(V3.add(tip, V3.mul(d, k)), [0, k * 0.6, 0]), (1.4 - k * 0.25) * SCALE[age], pal.spine);
    }
  }
}

function profile(kind, u, length) {
  const neck = Math.min(0.3, 5 / Math.max(length, 5));
  if (u < neck) return 0.82 + 0.18 * (u / neck);
  const taper = kind === 'snake' ? 0.62 : 0.66;
  if (u > taper) return Math.max(0.28, 1 - (u - taper) / (1 - taper) * 0.72);
  return 1;
}

function snakeHead(v, p, d, k, age, pal, dying) {
  const side = [d[2], 0, -d[0]];
  const base = V3.add(p, [0, dying ? 0 : 0.5 * k, 0]);
  const put = (q, c) => v.set(Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2]), c);
  const at = (t, a, b) => V3.add(V3.add(V3.add(base, V3.mul(d, t)), V3.mul(side, a)), [0, b, 0]);
  if (age === AGE.elder) {
    // The cobra's hood, spread behind the head, its pale spectacle mark on the back.
    for (let t = -7; t <= -1.5; t += 0.5) {
      const w = 6.2 * Math.sin((t + 7) / 5.5 * Math.PI * 0.9) + 1.5;
      for (let a = -w; a <= w; a += 0.5) {
        for (let b = -1.2; b <= 1.2; b += 0.5) {
          const mark = Math.abs(Math.abs(a) - 2.4) < 0.9 && Math.abs(t + 4) < 1.2 && b > 0.5;
          put(at(t, a, 1.6 + b + Math.abs(a) * 0.12), mark ? pal.spine : (b > 0.5 ? pal.scale : pal.back));
        }
      }
    }
  }
  for (let t = -2 * k; t <= 7 * k; t += 0.5) {
    const w = (3.9 - Math.max(0, t / k) * 0.33) * k, h = (2.5 - Math.max(0, t / k) * 0.14) * k;
    for (let a = -w; a <= w; a += 0.5) {
      for (let b = -h; b <= h; b += 0.5) {
        if ((a * a) / (w * w) + (b * b) / (h * h) > 1) continue;
        const c = b < -h * 0.4 ? pal.belly : (b > h * 0.45 && Math.abs(a) < w * 0.55 && t > 0 && t < 5 * k ? pal.scale : pal.back);
        put(at(t, a, b), c);
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (let e = 0; e < (age === AGE.hatchling ? 3 : 2); e++) {
      put(at(2.2 * k + e * 0.8, sx * 3.6 * k, 1.4 * k), pal.eye);
      if (age === AGE.hatchling) put(at(2.6 * k + e * 0.5, sx * 3.4 * k, 2.1 * k), pal.eye);
    }
  }
  if (dying || age === AGE.hatchling) return;
  for (let t = 0; t < 4; t++) put(at(7.5 * k + t, 0, -0.6), pal.tongue);
  for (const sx of [-1, 1]) put(at(7.5 * k + 4, sx * 1.1, -0.6), pal.tongue);
}

function dragonHead(v, p, d, k, age, pal, dying) {
  const side = [d[2], 0, -d[0]];
  const base = V3.add(p, [0, dying ? 1.0 * k : 1.5 * k, 0]);
  const put = (q, c) => v.set(Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2]), c);
  const at = (t, a, b) => V3.add(V3.add(V3.add(base, V3.mul(d, t)), V3.mul(side, a)), [0, b, 0]);
  const snout = age === AGE.hatchling ? 6 : 10;
  v.ball(base, 4.4 * k, (x, y) => (y + 0.5 < base[1] - 2.2 * k ? pal.belly : pal.back));
  for (let t = 2; t <= snout; t += 0.5) {
    const w = (2.9 - (t - 2) * 0.12) * k, h = (2.2 - (t - 2) * 0.08) * k;
    for (let a = -w; a <= w; a += 0.5) {
      for (let b = -0.6; b <= h; b += 0.5) put(at(t * k, a, b), b > h - 0.6 ? pal.scale : pal.back);
      put(at((t - 0.5) * k, a * 0.85, (-1.8 - (t - 2) * 0.12) * k), pal.belly);
    }
  }
  for (const sx of [-1, 0, 1]) put(at((snout + 0.5) * k, sx, 1.6 * k), pal.spine);
  for (const sx of [-1, 1]) {
    for (let e = 0; e < (age === AGE.hatchling ? 3 : 2); e++) put(at((2.5 + e * 0.7) * k, sx * 3.6 * k, 1.8 * k), pal.eye);
    if (age === AGE.hatchling) put(at(2.9 * k, sx * 3.5 * k, 2.5 * k), pal.eye);
    if (age === AGE.hatchling) { put(at(-0.5, sx * 2 * k, 4.3 * k), pal.horn); continue; }
    for (let e = 0; e < 3; e++) put(at((1.6 + e) * k, sx * 3.3 * k, 3.1 * k), pal.spine);
    // Antlers: up and back, with a tine forward (two on an elder); a dying dragon's droop.
    let q = at(-1, sx * 2.4 * k, 3.8 * k);
    const length = age === AGE.young ? 4 : (age === AGE.elder ? 10 : 8);
    const rise = dying ? 0.55 : 0.85;
    for (let i = 0; i < length; i++) {
      put(q, pal.horn);
      if (i === 3 || (age === AGE.elder && i === 7)) {
        for (let j = 1; j <= 3; j++) put(V3.add(V3.add(V3.add(q, V3.mul(d, j * 0.8)), [0, j * 0.7 * rise, 0]), V3.mul(side, sx * 0.5)), pal.horn);
      }
      q = V3.add(V3.add(V3.add(q, V3.mul(d, -0.8)), [0, rise, 0]), V3.mul(side, sx * 0.35));
    }
    // Whiskers trailing back in a long curve (hanging lower when dying).
    const whisker = age === AGE.young ? 8 : (age === AGE.elder ? 22 : 16);
    const sag = dying ? 1.6 : 1;
    for (let i = 0; i < whisker; i++) {
      const t = i / 15;
      put(at((9 - t * 13) * k, sx * (3 + t * 5.5) * k, (0.2 - t * 2.4 * sag + t * t * 1.6) * k), pal.spine);
    }
    for (let i = 0; i < (age === AGE.young ? 2 : (age === AGE.elder ? 5 : 4)); i++) {
      v.ball(at(-(3 + i * 1.2) * k, sx * (2.8 + i * 0.4) * k, (2.6 - i * 0.5) * k), 1.3 * k, pal.spine);
    }
  }
}

function legs(v, line, radius, pal, floor, pairs) {
  const total = (line.length - 1) * 0.5;
  const spots = total > 34 && pairs > 1 ? [0.24, 0.6] : [0.42];
  for (const f of spots) {
    const i = Math.min(line.length - 2, Math.floor(f * (line.length - 1)));
    const p = line[i], t = horizontal(V3.sub(line[i + 1], p));
    const side = [t[2], 0, -t[0]];
    for (const sx of [-1, 1]) {
      const hip = V3.add(p, V3.mul(side, sx * radius * 0.6));
      const knee = V3.sub(V3.add(V3.add(p, V3.mul(side, sx * (radius + 2.6))), [0, -1.5, 0]), V3.mul(t, 1.5));
      const foot = V3.add([knee[0] + side[0] * sx, floor + 4.6, knee[2] + side[2] * sx], t);
      for (const [a, b] of [[hip, knee], [knee, foot]]) {
        const n = Math.floor(V3.len(V3.sub(b, a)) / 0.5) + 1;
        for (let k = 0; k <= n; k++) v.ball(V3.add(a, V3.mul(V3.sub(b, a), k / n)), 1.25, pal.back);
      }
      for (let k = -1; k <= 1; k++) {
        const dir = horizontal(V3.add(V3.mul(side, sx), V3.mul(t, k * 0.9)));
        const claw = V3.add(foot, V3.mul(dir, 1.8));
        v.set(Math.floor(claw[0]), Math.floor(claw[1]), Math.floor(claw[2]), pal.spine);
        const tip = V3.add(claw, dir);
        v.set(Math.floor(tip[0]), Math.floor(tip[1]) - 1, Math.floor(tip[2]), pal.spine);
      }
    }
  }
}

function puff(v, p, c) {
  for (let k = 0; k < 3; k++) v.ball(V3.add(p, [k * 0.8, 5 + k * 3.2, -k * 0.6]), 1.6 + k * 0.5, c);
}

function catmullRom(p, samples) {
  if (p.length < 2) return p;
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

function resample(p, step) {
  if (p.length < 2) return p;
  const out = [p[0]];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const len = V3.len(V3.sub(b, a));
    if (len <= 0) continue;
    let s = step - carry;
    while (s <= len) { out.push(V3.add(a, V3.mul(V3.sub(b, a), s / len))); s += step; }
    carry = len - (s - step);
  }
  if (V3.len(V3.sub(out[out.length - 1], p[p.length - 1])) > step * 0.3) out.push(p[p.length - 1]);
  return out;
}

// ── The garden ────────────────────────────────────────────────────────────────

/** The longest line through each stone (1 for a lone stone), its direction, and every run of
    two or more. */
export function gardenLines(board, n) {
  const longest = new Map(), runs = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = board[r * n + c];
      if (!v) continue;
      if (!longest.has(r * n + c)) longest.set(r * n + c, { length: 1, dr: 0, dc: 1 });
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const pr = r - dr, pc = c - dc;
        if (pr >= 0 && pc >= 0 && pc < n && board[pr * n + pc] === v) continue;
        const run = [];
        let rr = r, cc = c;
        while (rr >= 0 && rr < n && cc >= 0 && cc < n && board[rr * n + cc] === v) { run.push(rr * n + cc); rr += dr; cc += dc; }
        if (run.length < 2) continue;
        runs.push(run);
        for (const p of run) if (run.length > (longest.get(p) ? longest.get(p).length : 1)) longest.set(p, { length: run.length, dr, dc });
      }
    }
  }
  return { longest, runs };
}
export const stage = (length) => (Math.min(5, length) - 1) / 4;

const sphere = new THREE.SphereGeometry(1, 24, 16);
function glossy(hex, shine, emissive) {
  return new THREE.MeshPhongMaterial({ color: color(hex), specular: new THREE.Color(shine, shine, shine), shininess: 42, emissive: emissive ? color(emissive) : 0 });
}
function matteM(hex) { return new THREE.MeshLambertMaterial({ color: color(hex) }); }
function mix(a, b, t) {
  const ch = (v, s) => (v >> s) & 0xff;
  const m = (s) => Math.round(ch(a, s) * (1 - t) + ch(b, s) * t) << s;
  return m(16) | m(8) | m(0);
}

/** A tomato: green and small alone, red and fat in a long line, glowing in a five. */
export function tomato(t) {
  const node = new THREE.Group();
  const r = 0.24 + 0.15 * t;
  const body = new THREE.Mesh(sphere, glossy(t >= 1 ? 0xe8402e : mix(0xa9d65e, 0xd0342c, Math.min(1, t * 1.6)), 0.6, t >= 1 ? 0x4a1006 : 0));
  body.scale.set(r, r * 0.86, r);
  body.position.y = r * 0.86;
  node.add(body);
  const c = calyx(r * 1.4);
  c.position.y = r * 1.72 - 0.01;
  node.add(c);
  return node;
}

/** A cucumber lying along its line (local z): bumpy, pale and short alone, long and dark in a
    long line, a yellow flower still on a prize one. */
export function cucumber(t, seed) {
  const node = new THREE.Group();
  const r = 0.15 + 0.08 * t, half = 0.3 + 0.17 * t;
  const body = new THREE.Mesh(sphere, glossy(mix(0xc4e88a, 0x3f8a36, t), 0.3, t >= 1 ? 0x0c2a08 : 0));
  body.scale.set(r, r * 0.9, half);
  body.position.y = r * 0.9;
  node.add(body);
  const bump = matteM(0xd2eba8);
  const count = Math.floor(6 + 10 * t);
  for (let k = 0; k < count; k++) {
    const u = (k + 0.5) / count * 2 - 1;
    const a = Noise.hash(k, seed, 0, 4) * Math.PI * 0.9 + 0.05;
    const ring = Math.sqrt(1 - u * u);
    const dot = new THREE.Mesh(sphere, bump);
    dot.scale.setScalar(r * 0.12);
    dot.position.set(Math.cos(a) * r * ring, r * 0.9 + Math.sin(a) * r * 0.9 * ring, u * half * 0.92);
    node.add(dot);
  }
  if (t >= 0.75) {
    const flower = new THREE.Mesh(sphere, glossy(0xf2c84a, 0.3));
    flower.scale.setScalar(r * 0.42);
    flower.position.set(0, r * 0.95, half + r * 0.18);
    node.add(flower);
  }
  return node;
}

function calyx(size) {
  const node = new THREE.Group();
  const leaf = matteM(0x3f7a2e);
  for (let k = 0; k < 5; k++) {
    const holder = new THREE.Group();
    holder.rotation.set(0, k * 2 * Math.PI / 5, -0.18);
    const l = new THREE.Mesh(new THREE.BoxGeometry(size * 0.55, size * 0.05, size * 0.16), leaf);
    l.position.x = size * 0.27;
    holder.add(l);
    node.add(holder);
  }
  const s = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.05, size * 0.05, size * 0.22, 8), matteM(0x5d8a3a));
  s.position.y = size * 0.1;
  node.add(s);
  return node;
}

/** A vine from one fruit to the next along a line, with a leaf halfway. */
export function vine(a, b, black, seed) {
  const node = new THREE.Group();
  const stem = matteM(black ? 0x4a7a2c : 0x3d6e2a);
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mid = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.05, 0));
  for (const [u, w] of [[A, mid], [mid, B]]) {
    const len = u.distanceTo(w);
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, len, 8), stem);
    piece.position.copy(u).add(w).multiplyScalar(0.5);
    piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), w.clone().sub(u).normalize());
    node.add(piece);
  }
  const d = B.clone().sub(A).normalize();
  const side = new THREE.Vector3(d.z, 0, -d.x);
  const leaf = new THREE.Mesh(sphere, matteM(0x4f8f3a));
  leaf.scale.set(0.13, 0.025, 0.065);
  leaf.position.copy(mid).add(side.clone().multiplyScalar(0.1 * (seed % 2 === 0 ? 1 : -1))).add(new THREE.Vector3(0, 0.01, 0));
  leaf.rotation.y = Math.atan2(d.x, d.z) + 0.6;
  node.add(leaf);
  if (!black) {
    for (let k = 0; k < 6; k++) {
      const a2 = k * 1.1;
      const curl = new THREE.Mesh(sphere, stem);
      curl.scale.setScalar(0.012);
      curl.position.copy(mid).sub(side.clone().multiplyScalar(0.08)).add(new THREE.Vector3(Math.cos(a2) * 0.035, 0.03 + k * 0.012, Math.sin(a2) * 0.035));
      node.add(curl);
    }
  }
  return node;
}
