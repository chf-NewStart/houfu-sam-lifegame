/* Chess in 3D (the app's Qi/Scene3D/Chess3D.swift and Chess3DBoard.swift): the same silhouettes
   as the pixel pieces, carved smooth from their 20×20 masks: turned on a lathe (the round
   pieces), stacked blocks (the lantern rook, its window lit), cut out and rounded (the
   seahorse knight), the king's bold cross and the queen's coronet as separate parts; a real
   set's height order, pawn lowest, king highest. Black is the river pebble, White the shell.
   Moves hop from square to square, captured pieces sink away, and the board shows the same
   marks as the 2D board. */
import * as THREE from './three.js?v=8';
import { color } from './voxels.js?v=8';
import { THEMES, buildBoard, chessFace, ring, glow } from './world.js?v=8';
import { tween, setOpacity, spreadingRing } from './grid3d.js?v=8';
import { MASKS } from '../art.js?v=8';

export const SPAN = 8 + 2 * 0.45;
const HEIGHT = [0, 0.56, 0.78, 0.86, 0.72, 0.98, 1.1];
const PEBBLE = { body: 0x18241f, glow: 0x9af3d6, engrave: 0x050908 };
const SHELL = { body: 0xeadfc6, glow: 0xe8b04a, engrave: 0x6f5a40 };

function material(hex, black, lit = false) {
  if (lit) return new THREE.MeshBasicMaterial({ color: color(hex) });
  const s = black ? 0.42 : 0.28;
  return new THREE.MeshPhongMaterial({ color: color(hex), specular: new THREE.Color(s, s, s), shininess: black ? 50 : 30 });
}

const models = new Map();
/** A carved piece standing on y = 0, cached by piece. */
export function carved(piece) {
  if (!models.has(piece)) models.set(piece, build(Math.abs(piece), piece < 0));
  const m = models.get(piece).clone();
  m.traverse((n) => { if (n.isMesh) { n.material = Array.isArray(n.material) ? n.material.map((x) => x.clone()) : n.material.clone(); } });
  return m;
}

function build(kind, black) {
  const rows = MASKS[kind];
  const m = black ? PEBBLE : SHELL;
  const n = 20;
  let base = n - 1;
  while (base > 0 && !rows[base].includes('#') && !/[^.]/.test(rows[base])) base--;
  let topRow = 0;
  while (topRow < n && !/[^.]/.test(rows[topRow])) topRow++;
  const unit = 1 / n;
  const rise = HEIGHT[kind] / (base - topRow + 1);
  const solid = (r, c) => r >= 0 && r < n && c >= 0 && c < n && rows[r][c] !== '.';
  const node = new THREE.Group();
  const stone = material(m.body, black);
  const accent = material(m.glow, black, true);

  /** The half-width of the run through the middle of row r (0 if the middle is empty). */
  const radius = (r) => {
    if (!solid(r, 9) && !solid(r, 10)) return 0;
    let a = 9, b = 10;
    while (solid(r, a - 1)) a--;
    while (solid(r, b + 1)) b++;
    if (!solid(r, 9)) a = 10;
    if (!solid(r, 10)) b = 9;
    return Math.max(9.5 - a, b + 1 - 9.5) * unit;
  };
  const add = (geo, mat, x, y, z) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); node.add(mesh); return mesh; };

  if (kind === 4) {
    // Stone lantern: a block per run of equal rows, its window lit on four sides.
    let r = base;
    while (r >= topRow) {
      const w = radius(r);
      let r2 = r;
      while (r2 - 1 >= topRow && radius(r2 - 1) === w && rows[r2 - 1].includes('o') === rows[r].includes('o')) r2--;
      const h = (r - r2 + 1) * rise, y0 = (base - r) * rise;
      if (w > 0) {
        add(new THREE.BoxGeometry(w * 2, h, w * 2), stone, 0, y0 + h / 2, 0);
        if (rows[r].includes('o')) {
          for (let k = 0; k < 4; k++) {
            const a = k * Math.PI / 2;
            const pane = add(new THREE.BoxGeometry(w * 1.45, h * 0.86, 0.01), accent, Math.sin(a) * (w + 0.004), y0 + h / 2, Math.cos(a) * (w + 0.004));
            pane.rotation.y = a;
          }
        }
      } else if (r < base) {
        add(new THREE.BoxGeometry(0.12, h, 0.12), stone, 0, y0 + h / 2, 0);
      }
      r = r2 - 1;
    }
    // The roof's upturned corners.
    let eaves = -1;
    for (let rr = topRow; rr <= base; rr++) if (solid(rr, 3) && !solid(rr, 9)) { eaves = rr; break; }
    if (eaves >= 0) {
      const roofW = radius(eaves + 1);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        add(new THREE.BoxGeometry(0.07, rise * 2.2, 0.07), stone, Math.sin(a) * roofW * 1.3, (base - eaves) * rise + rise * 0.6, Math.cos(a) * roofW * 1.3);
      }
    }
  } else if (kind === 2) {
    // The seahorse, cut from the mask and rounded at the edges, on a turned base.
    const cut = base - 3;
    node.add(lathe(cut + 1, base, base, radius, rise, stone));
    const shape = outline(topRow, cut, solid, unit, rise, base);
    if (shape) {
      // Rounded at the edges, like the app's chamfered cut-out (a bevel no wider than the
      // smoothed outline's steps, so it never folds over itself).
      // Rounded at the edges, like the app's chamfered cut-out.
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.008, bevelSegments: 3, curveSegments: 4 });
      g.translate(0, 0, -0.1);
      const p = new THREE.Mesh(g, stone);
      node.add(p);
      let er = -1, ec = -1;
      for (let rr = topRow; rr <= cut; rr++) { const c = rows[rr].indexOf('x'); if (c >= 0) { er = rr; ec = c; break; } }
      if (er >= 0) for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.022, 12, 8), accent, (ec + 0.5 - 10) * unit, (base - er) * rise + rise / 2, side * 0.135);
    }
  } else {
    const crown = kind === 6 ? topRow + 3 : (kind === 5 ? topRow + 2 : topRow - 1);
    const from = Math.max(topRow, crown + 1);
    node.add(lathe(from, base, base, radius, rise, stone));
    const bodyTop = (base - from + 1) * rise;
    if (kind === 6) {
      // A bold cross: as wide as the mask's, deep enough to read from any side.
      add(new THREE.BoxGeometry(2 * unit * 1.15, rise * 4.2, 0.085), stone, 0, bodyTop + rise * 2.1, 0);
      add(new THREE.BoxGeometry(6 * unit, rise * 1.6, 0.085), stone, 0, bodyTop + rise * 2.6, 0);
    } else if (kind === 5) {
      // The coronet: a ring of points and a pearl on top.
      const ringR = radius(crown + 2) * 1.05;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const point = add(new THREE.ConeGeometry(unit * 0.9, rise * 3, 10), stone, Math.sin(a) * ringR, bodyTop + rise * 1.4, Math.cos(a) * ringR);
        point.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      }
      add(new THREE.SphereGeometry(unit * 1.3, 16, 12), accent, 0, bodyTop + rise * 2.4, 0);
    } else if (kind === 3) {
      // The mitre's slit, cut across the front and back.
      const r = rows.findIndex((row) => row.includes('x'));
      if (r >= 0) {
        for (const side of [-1, 1]) {
          const slit = add(new THREE.BoxGeometry(unit * 3.2, unit * 0.8, 0.02), material(m.engrave, black), -unit * 0.6, (base - r) * rise + rise * 0.2, side * (radius(r) - 0.006));
          slit.rotation.set(0, side < 0 ? Math.PI : 0, 0.75);
        }
      }
      add(new THREE.SphereGeometry(unit * 1.2, 16, 12), stone, 0, bodyTop + unit * 0.4, 0);
    } else if (kind === 1) {
      add(new THREE.SphereGeometry(radius(topRow + 1) * 1.02, 24, 16), stone, 0, bodyTop - rise * 1.6, 0);
    }
  }
  node.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return node;
}

/** A body turned from the mask rows: each row's half-width, softened between rows so the
    pixel steps become curves, revolved in 40 segments. */
function lathe(fromRow, toRow, base, radius, rise, mat) {
  let profile = [];
  for (let r = toRow; r >= fromRow; r--) {
    let w = radius(r);
    if (w === 0) {
      const below = r < toRow ? radius(r + 1) : 0, above = r > fromRow ? radius(r - 1) : 0;
      w = Math.max(0.03, Math.min(below, above) * 0.5);
    }
    const y0 = (base - r) * rise;
    profile.push([w, y0 + rise * 0.15], [w, y0 + rise * 0.85]);
  }
  for (let pass = 0; pass < 2; pass++) {
    const s = profile.map((p) => p.slice());
    for (let i = 1; i < profile.length - 1; i++) s[i][0] = profile[i - 1][0] * 0.25 + profile[i][0] * 0.5 + profile[i + 1][0] * 0.25;
    profile = s;
  }
  const top = profile[profile.length - 1];
  profile.unshift([profile[0][0], 0]);
  profile.unshift([0, 0]);
  profile.push([0, top[1] + rise * 0.15]);
  const g = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 40);
  return new THREE.Mesh(g, mat);
}

/** The outline of the mask rows as a smoothed shape in the x-y plane (squares). */
function outline(fromRow, toRow, solid, unit, rise, base) {
  const edges = new Map();
  const k = (c, r) => c * 100 + r;
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = 0; c < 20; c++) {
      if (!solid(r, c)) continue;
      if (!solid(r - 1, c) || r === fromRow) edges.set(k(c, r), [c + 1, r]);
      if (!solid(r, c + 1)) edges.set(k(c + 1, r), [c + 1, r + 1]);
      if (!solid(r + 1, c) || r === toRow) edges.set(k(c + 1, r + 1), [c, r + 1]);
      if (!solid(r, c - 1)) edges.set(k(c, r + 1), [c, r]);
    }
  }
  if (!edges.size) return null;
  let start = null;
  for (const key of edges.keys()) {
    const c = Math.floor(key / 100), r = key % 100;
    if (!start || r < start[1] || (r === start[1] && c < start[0])) start = [c, r];
  }
  let loop = [], p = start, guard = 0;
  do {
    loop.push(p);
    const q = edges.get(k(p[0], p[1]));
    if (!q) break;
    p = q;
  } while ((p[0] !== start[0] || p[1] !== start[1]) && ++guard < 2000);
  // The pixel steps become a smooth outline: each edge's midpoint (a staircase becomes a
  // slope), then Chaikin corner cutting.
  loop = loop.map((a, i) => { const b = loop[(i + 1) % loop.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
  for (let pass = 0; pass < 3; pass++) {
    const out = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    loop = out;
  }
  const shape = new THREE.Shape();
  loop.forEach(([x, y], i) => {
    const px = (x - 10) * unit, py = (base + 1 - y) * rise;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  });
  shape.closePath();
  return shape;
}

// ── The board ─────────────────────────────────────────────────────────────────

export class Chess3DScene {
  constructor(view) {
    this.view = view;
    this.scene = new THREE.Scene();
    this.world = new THREE.Group();
    this.pieces = new THREE.Group();
    this.marks = new THREE.Group();
    this.scene.add(this.world, this.pieces, this.marks);
    this.theme = null;
    this.top = 0.3;
    this.nodes = new Map();
    this.shown = null;
  }

  show(s, theme) {
    const rebuilt = theme !== this.theme;
    if (rebuilt) this.build(theme);
    const old = this.shown;
    if (old && s.plies === old.plies + 1 && s.last) this.animateMove(s.last, old.board);
    this.reconcile(s.board);
    this.updateMarks(s);
    this.shown = s;
    this.view.render();
    return rebuilt;
  }

  build(theme) {
    this.theme = theme;
    this.top = THEMES[theme].top;
    this.world.clear();
    this.pieces.clear();
    this.nodes.clear();
    buildBoard(theme, this.world, this.scene, SPAN, chessFace(theme, 0.45));
    this.shown = null;
  }

  position(sq) { return [(sq & 7) - 3.5, this.top, (sq >> 3) - 3.5]; }

  /** The square a tap landed on: the piece touched, or the square under the point. */
  square(p, name) {
    if (name) return Number(name.slice(6));
    const c = Math.floor(p.x + 4), r = Math.floor(p.z + 4);
    return r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : null;
  }

  /** A move hops from its square to the next; whatever it takes sinks away. Castling moves
      the rook too. */
  animateMove(move, before) {
    const mover = this.nodes.get(move.from);
    if (!mover) return;
    const victim = this.nodes.get(move.to);
    if (victim) { this.nodes.delete(move.to); this.sink(victim.node); }
    else if (Math.abs(before[move.from]) === 1 && (move.to & 7) !== (move.from & 7)) {
      const sq = (move.from & ~7) | (move.to & 7);
      const ep = this.nodes.get(sq);
      if (ep) { this.nodes.delete(sq); this.sink(ep.node); }
    }
    this.nodes.delete(move.from);
    this.nodes.set(move.to, { piece: before[move.from], node: mover.node });
    this.hop(mover.node, move.to);
    if (Math.abs(before[move.from]) === 6 && Math.abs((move.to & 7) - (move.from & 7)) === 2) {
      const rank = move.from & ~7;
      const [rf, rt] = (move.to & 7) === 6 ? [rank + 7, rank + 5] : [rank, rank + 3];
      const rook = this.nodes.get(rf);
      if (rook) { this.nodes.delete(rf); this.nodes.set(rt, rook); this.hop(rook.node, rt); }
    }
  }

  hop(node, sq) {
    node.name = 'piece:' + sq;
    const end = this.position(sq), start = node.position.clone();
    tween(this.view, 260, (t) => {
      const e = t * t * (3 - 2 * t);
      node.position.set(start.x + (end[0] - start.x) * e, end[1] + 0.32 * Math.sin(Math.PI * t), start.z + (end[2] - start.z) * e);
    });
    spreadingRing(this.view, this.marks, end[0], this.top + 0.02, end[2], 0.32, 0.9, 0.045, 0x9af3d6, 260, 900, 1);
  }

  sink(node) {
    node.name = '';
    const y0 = node.position.y;
    tween(this.view, 300, (t) => { setOpacity(node, 1 - t); node.position.y = y0 - 0.25 * t; }, { delay: 180, done: () => this.pieces.remove(node) });
  }

  /** Every piece where the board says, without animation (new games, take-backs, promotions,
      replay jumps). */
  reconcile(board) {
    for (const [sq, e] of [...this.nodes]) if (board[sq] !== e.piece) { this.pieces.remove(e.node); this.nodes.delete(sq); }
    for (let sq = 0; sq < 64; sq++) {
      if (!board[sq] || this.nodes.has(sq)) continue;
      const node = carved(board[sq]);
      node.name = 'piece:' + sq;
      node.position.set(...this.position(sq));
      // Knights look across the board, towards the side's right.
      if (Math.abs(board[sq]) === 2) node.rotation.y = board[sq] > 0 ? 0 : Math.PI;
      this.pieces.add(node);
      this.nodes.set(sq, { piece: board[sq], node });
    }
  }

  updateMarks(s) {
    for (const m of this.marks.children.filter((c) => c.name === 'mark')) this.marks.remove(m);
    const mark = (mesh) => { mesh.name = 'mark'; this.marks.add(mesh); return mesh; };
    const tile = (sq, hex, alpha, lift = 0.012) => {
      const p = this.position(sq);
      const t = mark(new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ color: color(hex), transparent: true, opacity: alpha, depthWrite: false })));
      t.rotation.x = -Math.PI / 2;
      t.position.set(p[0], this.top + lift, p[2]);
    };
    const frame = (sq, hex) => {
      const p = this.position(sq);
      for (const [dx, dz, w, l] of [[0, -0.44, 0.92, 0.06], [0, 0.44, 0.92, 0.06], [-0.44, 0, 0.06, 0.92], [0.44, 0, 0.06, 0.92]]) {
        mark(new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, l), glow(hex))).position.set(p[0] + dx, this.top + 0.016, p[2] + dz);
      }
    };
    if (s.last) for (const sq of [s.last.from, s.last.to]) tile(sq, 0xe8b04a, 0.3);
    if (s.check != null) tile(s.check, 0xeb6666, 0.55, 0.014);
    if (s.selected != null) frame(s.selected, 0x51e68e);
    for (const t of s.targets) {
      if (s.board[t]) frame(t, 0x51e68e);
      else { const p = this.position(t); mark(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.2), glow(0x51e68e))).position.set(p[0], this.top + 0.016, p[2]); }
    }
    if (s.coach != null) {
      const p = this.position(s.coach);
      mark(ring(0.44, 0.06, s.coachColor)).position.set(p[0], this.top + 0.02, p[2]);
      if (s.coachFrom != null) {
        const q = this.position(s.coachFrom);
        mark(ring(0.44, 0.04, s.coachColor, 0.45)).position.set(q[0], this.top + 0.02, q[2]);
      }
    }
  }
}
