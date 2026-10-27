/* The 3D Go and Gomoku board (the app's Qi/Scene3D/Grid3D.swift): stones drop in with a
   ripple and lift out when captured, animals fade from one shape into the next as their
   groups grow, and a captured animal flashes and bursts into its own voxels (a big one with a
   golden shockwave). On the Gomoku garden, fruits swell as their lines grow, joined by vines. */
import * as THREE from './three.js?v=13';
import { voxelMesh, Noise, color } from './voxels.js?v=13';
import { THEMES, buildBoard, goFace, pebble, shell, ring, glow, matte } from './world.js?v=13';
import { animal, gardenLines, stage, tomato, daikon, vine, PER_CELL } from './creatures.js?v=13';

const VOX = 1 / PER_CELL;
let pebbleGeo = null, shellGeo = null;
function stoneGeometries() {
  if (!pebbleGeo) { pebbleGeo = pebble().geometry(VOX); shellGeo = shell().geometry(VOX); }
  return [pebbleGeo, shellGeo];
}
const stoneMaterials = () => [new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true }), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true })];

/** Runs `f(t)` for t from 0 to 1 over `ms` (after `delay` ms) on the view's frame loop. */
export function tween(view, ms, f, { delay = 0, done = null } = {}) {
  const start = performance.now() + delay;
  view.animate((now) => {
    if (now < start) return true;
    const t = Math.min(1, (now - start) / ms);
    f(t);
    if (t >= 1 && done) done();
    return t < 1;
  });
}
export function setOpacity(obj, o) {
  obj.traverse((n) => {
    if (!n.material) return;
    for (const m of Array.isArray(n.material) ? n.material : [n.material]) { m.transparent = true; m.opacity = o; }
  });
}

/** Two rings spreading from where a stone lands, like the 2D board's ripples. */
export function spreadingRing(view, parent, x, y, z, r0, r1, width, hex, delay, ms, opacity) {
  const mesh = ring(r0, width, hex, opacity);
  mesh.position.set(x, y, z);
  mesh.visible = false;
  parent.add(mesh);
  tween(view, ms, (t) => {
    mesh.visible = true;
    const r = r0 + (r1 - r0) * (1 - (1 - t) * (1 - t));
    mesh.geometry.dispose();
    mesh.geometry = new THREE.RingGeometry(Math.max(0.001, r - width / 2), r + width / 2, 72);
    mesh.material.opacity = opacity * (1 - t);
  }, { delay, done: () => { parent.remove(mesh); mesh.geometry.dispose(); } });
}

export class Grid3DScene {
  constructor(view) {
    this.view = view;
    this.scene = new THREE.Scene();
    this.world = new THREE.Group();
    this.pieces = new THREE.Group();
    this.markers = new THREE.Group();
    this.vines = new THREE.Group();
    this.scene.add(this.world, this.pieces, this.markers, this.vines);
    this.theme = null;
    this.size = 0;
    this.stars = '';
    this.span = 10;
    this.top = 0.3;
    this.stones = new Map();
    this.animals = new Map();
    this.shown = null;
    this.fade = 300;
  }

  /** Shows `s`, animating from what was shown before. Returns true when the board was built
      afresh (a new theme or size), so the camera can be placed again. */
  show(s, theme) {
    const rebuilt = theme !== this.theme || s.size !== this.size || s.stars.join() !== this.stars;
    if (rebuilt) this.build(theme, s);
    const animate = this.shown != null;
    this.updateStones(s, animate);
    this.updateAnimals(s, animate);
    this.updateMarkers(s);
    this.shown = s;
    this.view.render();
    return rebuilt;
  }

  build(theme, s) {
    this.theme = theme;
    this.size = s.size;
    this.stars = s.stars.join();
    this.top = THEMES[theme].top;
    for (const g of [this.world, this.pieces, this.vines]) g.clear();
    this.stones.clear();
    this.animals.clear();
    const margin = s.size >= 15 ? 0.75 : 0.8;
    this.span = s.size - 1 + 2 * margin;
    const face = goFace(theme, s.size, margin, s.stars.map((i) => [Math.floor(i / s.size), i % s.size]));
    buildBoard(theme, this.world, this.scene, this.span, face);
    this.shown = null;
  }

  point(i) { const h = (this.size - 1) / 2; return [(i % this.size) - h, this.top, Math.floor(i / this.size) - h]; }

  /** The board point nearest a point on the surface, if it's on the board. */
  boardPoint(p) {
    const h = (this.size - 1) / 2;
    const c = Math.round(p.x + h), r = Math.round(p.z + h);
    return r >= 0 && c >= 0 && r < this.size && c < this.size ? [r, c] : null;
  }

  // Stones

  updateStones(s, animate) {
    const lines = s.garden ? gardenLines(s.board, s.size) : null;
    const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const look = (i) => {
      const l = lines && lines.longest.get(i);
      if (!l) return 0;
      return Math.min(5, l.length) * 8 + Math.max(0, DIRS.findIndex(([a, b]) => a === l.dr && b === l.dc));
    };
    const water = this.theme === 'water' ? -0.05 : 0;
    for (const [i, e] of [...this.stones]) {
      if (s.board[i] === e.color) continue;
      this.stones.delete(i);
      if (animate) {
        const y0 = e.node.position.y;
        tween(this.view, 300, (t) => { setOpacity(e.node, 1 - t); e.node.position.y = y0 + 0.25 * t; }, { done: () => this.pieces.remove(e.node) });
      } else this.pieces.remove(e.node);
    }
    s.board.forEach((v, i) => {
      if (!v) return;
      const dead = s.dead.has(i);
      const p = this.point(i);
      const rest = [p[0], this.top + water, p[2]];
      const lk = look(i);
      const entry = this.stones.get(i);
      if (entry) {
        if (entry.look === lk) { setOpacity(entry.node, dead ? 0.4 : 1); return; }
        // A fruit whose line grew: the bigger one swells into its place.
        this.pieces.remove(entry.node);
        const node = this.stone(v, i, lines);
        node.position.set(...rest);
        this.pieces.add(node);
        this.stones.set(i, { color: v, look: lk, node });
        if (animate) { node.scale.setScalar(0.8); tween(this.view, 350, (t) => node.scale.setScalar(0.8 + 0.2 * (1 - (1 - t) * (1 - t)))); }
        return;
      }
      const node = this.stone(v, i, lines);
      this.pieces.add(node);
      this.stones.set(i, { color: v, look: lk, node });
      if (animate && i === s.last) {
        node.position.set(rest[0], rest[1] + 0.9, rest[2]);
        setOpacity(node, 0);
        tween(this.view, 200, (t) => { setOpacity(node, Math.min(1, t * 2.5)); node.position.y = rest[1] + 0.9 * (1 - t * t); });
        this.ripple(rest, 200);
      } else {
        node.position.set(...rest);
        setOpacity(node, dead ? 0.4 : 1);
      }
    });
    // Vines along every line of two or more.
    this.vines.clear();
    if (lines) {
      for (const run of lines.runs) {
        for (let k = 0; k < run.length - 1; k++) {
          const a = this.point(run[k]), b = this.point(run[k + 1]);
          this.vines.add(vine([a[0], a[1] + 0.06, a[2]], [b[0], b[1] + 0.06, b[2]], s.board[run[k]] === 1));
        }
      }
    }
  }

  /** A stone, or on the vegetable patch a tomato or a daikon as grown as its longest line. */
  stone(v, i, lines) {
    const l = lines && lines.longest.get(i);
    let node;
    if (l) {
      const t = stage(l.length);
      node = v === 1 ? tomato(t) : daikon(t);
      if (v === 2) node.rotation.y = Math.atan2(l.dc, l.dr);
    } else {
      const [p, s] = stoneGeometries();
      node = new THREE.Mesh(v === 1 ? p : s, stoneMaterials());
      if (v === 1) node.rotation.y = Noise.hash(i, 3) * 6.28;
    }
    node.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    return node;
  }

  ripple(p, after) {
    for (const [delay, hex, width] of [[after, 0x9af3d6, 0.05], [after + 150, 0xc1f8eb, 0.035]]) {
      spreadingRing(this.view, this.markers, p[0], this.top + 0.02, p[2], 0.34, 1.3, width, hex, delay, 1100, 0.8);
    }
  }

  // Animals

  updateAnimals(s, animate) {
    const wanted = new Map(s.animals.map((a) => [a.key, a]));
    for (const [k, e] of [...this.animals]) {
      if (wanted.has(k)) continue;
      this.animals.delete(k);
      const captured = e.animal.walk.every((p) => s.board[p] === 0);
      if (animate && captured) this.die(e.node, e.model, new Set(e.animal.walk).size);
      else if (animate) tween(this.view, this.fade * 0.8, (t) => setOpacity(e.node, 1 - t), { done: () => this.pieces.remove(e.node) });
      else this.pieces.remove(e.node);
    }
    const top = this.top + (this.theme === 'water' ? -0.05 : 0);
    for (const a of s.animals) {
      if (this.animals.has(a.key)) continue;
      const vigor = a.mood < 0 ? -1 : (a.mood > 0 ? 1 : 0);
      const { model, glow: lit } = animal(a.black ? 'snake' : 'dragon', a.walk, this.size, top, vigor, a.breath);
      const node = voxelMesh(model, VOX, lit);
      if (!node) continue;
      node.receiveShadow = true;
      this.pieces.add(node);
      this.animals.set(a.key, { node, model, animal: a });
      if (animate) { setOpacity(node, 0); tween(this.view, this.fade, (t) => setOpacity(node, t), { delay: this.fade * 0.4, done: () => setOpacity(node, 1) }); }
    }
  }

  /** A captured group's animal flashes, rears up and bursts into its own voxels, which tumble
      and fall away. A big one (five stones or more) sends a golden shockwave too. */
  die(node, model, stones) {
    const y0 = node.position.y;
    tween(this.view, 220, (t) => {
      node.position.y = y0 + 0.3 * t;
      const k = (1 - Math.abs(t * 2 - 1)) * 0.6;
      for (const m of node.material) if (m.emissive) m.emissive.setRGB(k, k * 0.86, k * 0.6);
    }, { done: () => this.pieces.remove(node) });

    const cells = [];
    model.forEach((x, y, z, c) => cells.push([(x + 0.5) * VOX, (y + 0.5) * VOX, (z + 0.5) * VOX, c]));
    if (!cells.length) return;
    const big = stones >= 5;
    const count = Math.min(cells.length, big ? 320 : 120);
    const stride = Math.max(1, Math.floor(cells.length / count));
    const picked = [];
    for (let i = 0; i < cells.length; i += stride) picked.push(cells[i]);
    const centre = picked.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / picked.length);
    const cube = new THREE.BoxGeometry(VOX * 1.5, VOX * 1.5, VOX * 1.5);
    const materials = new Map();
    picked.forEach((p, k) => {
      if (!materials.has(p[3])) materials.set(p[3], new THREE.MeshLambertMaterial({ color: color(p[3]), transparent: true }));
      const shard = new THREE.Mesh(cube, materials.get(p[3]).clone());
      const start = [p[0], p[1] + 0.3, p[2]];
      shard.position.set(...start);
      shard.visible = false;
      this.pieces.add(shard);
      const r = (i) => Noise.hash(k, i, 0, stones);
      let out = [p[0] - centre[0], 0, p[2] - centre[2]];
      const len = Math.hypot(out[0], out[2]);
      const dir = len > 0.01 ? [out[0] / len, 0, out[2] / len] : [r(1) - 0.5, 0, r(2) - 0.5];
      const reach = (big ? 1.3 : 0.8) * (0.4 + r(3));
      const rise = 0.35 + 0.6 * r(4) * (big ? 1.4 : 1);
      const flight = 750 + 500 * r(5);
      const fall = this.top + 0.03 - (p[1] + 0.3);
      const spin = [r(6) * 8, r(7) * 8, r(8) * 4];
      tween(this.view, flight, (u) => {
        shard.visible = true;
        shard.position.set(start[0] + dir[0] * reach * u, start[1] + rise * 4 * u * (1 - u) + fall * u * u, start[2] + dir[2] * reach * u);
        shard.rotation.set(spin[0] * u, spin[1] * u, spin[2] * u);
        shard.material.opacity = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
      }, { delay: 200, done: () => this.pieces.remove(shard) });
    });
    if (big) {
      const reach = 0.4 * Math.min(9, 4 + Math.floor(stones / 2));
      for (const [delay, hex, width] of [[180, 0xe8b04a, 0.08], [320, 0xfff1c8, 0.05]]) {
        spreadingRing(this.view, this.markers, centre[0], this.top + 0.04, centre[2], 0.4, reach, width, hex, delay, 900, 0.9);
      }
    }
  }

  // Markers

  updateMarkers(s) {
    for (const m of this.markers.children.filter((c) => c.name === 'marker')) this.markers.remove(m);
    const add = (n) => { n.name = 'marker'; this.markers.add(n); };
    if (s.last != null && s.board[s.last]) {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.13), glow(0x51e68e));
      const p = this.point(s.last);
      const covered = s.animals.some((a) => a.walk.includes(s.last));
      dot.position.set(p[0], this.top + (covered ? 0.95 : 0.32), p[2]);
      add(dot);
    }
    for (const [i, hex] of Object.entries(s.rings)) {
      const r = ring(0.4, 0.06, hex);
      const p = this.point(Number(i));
      r.position.set(p[0], this.top + 0.03, p[2]);
      add(r);
    }
    for (const i of s.dead) {
      const p = this.point(i);
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), glow(0xeb6666));
        bar.position.set(p[0], this.top + 0.34, p[2]);
        bar.rotation.y = a;
        add(bar);
      }
    }
    if (s.territory) {
      s.territory.forEach((o, i) => {
        if (!o || (s.board[i] !== 0 && !s.dead.has(i))) return;
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), matte(o === 1 ? 0x101917 : 0xeadfc6));
        const p = this.point(i);
        cube.position.set(p[0], this.top + 0.05, p[2]);
        add(cube);
      });
    }
    if (s.winLine && s.winLine.length >= 2) {
      const ends = s.winLine.slice().sort((a, b) => a - b);
      const a = new THREE.Vector3(...this.point(ends[0])), b = new THREE.Vector3(...this.point(ends[ends.length - 1]));
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, a.distanceTo(b) + 0.4), glow(0xe8b04a));
      bar.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.42, 0));
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
      add(bar);
    }
  }
}
