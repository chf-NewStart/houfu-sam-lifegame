/* The 3D Mahjong table (the app's Qi/Scene3D/Mahjong3D.swift): an automatic table (麻将机) on the
   board's material, carved tiles (bone faces with the pixel pictures, jade backs), each seat's
   river, its wall of 17 stacks of two that shrinks as the hand draws from it, its hand standing
   and its melds laid down, and the square plate in the middle with its dome for the dice.
   Between hands it resets the way the machine does: the tiles sink into the middle, the walls
   rise out of the table, the dice tumble under the dome. Units: a tile is 0.5 wide. */
import * as THREE from './three.js?v=6';
import { color, bitmap, fill, texture } from './voxels.js?v=6';
import { THEMES, buildBoard } from './world.js?v=6';
import { tween, setOpacity } from './grid3d.js?v=6';
import { faceOnly } from '../tiles.js?v=6';
import * as M from '../mahjong.js?v=6';

const W = 0.5, L = 0.69, T = 0.36;
export const SPAN = 13.2;
const RESET = 3400;

/** The table's cloth: dark, a faint pixel weave. */
function felt(theme) {
  const n = 128;
  const ctx = bitmap(n, n);
  const [base, weave] = { wood: [0x2a1a0d, 0x332012], steel: [0x1a2023, 0x20272b], sky: [0x0b1030, 0x111840], soil: [0x2b2116, 0x33281b], water: [0x0b3036, 0x124249] }[theme] || [0x0a2a2c, 0x0f3436];
  fill(ctx, 0, 0, n, n, base);
  for (let y = 0; y < n; y += 4) for (let x = ((y / 4) % 2) * 2; x < n; x += 4) fill(ctx, x, y, 2, 2, weave);
  return ctx;
}

let sideMat = null, backMat = null;
const faceMats = new Map();
function materials() {
  if (!sideMat) {
    const ctx = bitmap(8, 16);
    fill(ctx, 0, 0, 8, 9, 0xe9dfc6);
    fill(ctx, 0, 9, 8, 7, 0x1f7a5c);
    sideMat = new THREE.MeshPhongMaterial({ map: texture(ctx), specular: new THREE.Color(0.25, 0.25, 0.25), shininess: 30 });
    backMat = new THREE.MeshPhongMaterial({ color: color(0x1f7a5c), specular: new THREE.Color(0.35, 0.35, 0.35), shininess: 30 });
  }
  return [sideMat, backMat];
}
function faceMat(tile, index) {
  const key = `${tile}:${index}`;
  if (!faceMats.has(key)) {
    const t = new THREE.CanvasTexture(faceOnly(tile, index));
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    faceMats.set(key, new THREE.MeshPhongMaterial({ map: t, specular: new THREE.Color(0.3, 0.3, 0.3), shininess: 30 }));
  }
  return faceMats.get(key);
}
const tileGeo = new THREE.BoxGeometry(W * 0.97, T, L * 0.98);

/** A tile lying face up, its face's foot toward +z (a hidden tile lies face down). */
function tileNode(tile, index) {
  const [side, back] = materials();
  const up = tile != null && tile >= 0 ? faceMat(tile, index) : back;
  // BoxGeometry's faces: +x, −x, +y (the face), −y (the back), +z, −z.
  const mesh = new THREE.Mesh(tileGeo, [side, side, up, back, side, side]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function seatFrame(seat, me) {
  const g = new THREE.Group();
  g.rotation.y = ((seat - me + 4) % 4) * Math.PI / 2;
  return g;
}

/** The dealer's two dice (MahjongModel.dice). */
function dice(g) {
  if (!g.isOpenView) return [3, 4];
  let s = BigInt(g.dealer);
  for (const x of g.wall.slice(0, 12)) s = (s * 37n + BigInt(x + 1)) & ((1n << 64n) - 1n);
  const rng = new M.SplitMix(s);
  return [rng.below(6) + 1, rng.below(6) + 1];
}

function pips(n) {
  const ctx = bitmap(7, 7);
  fill(ctx, 0, 0, 7, 7, 0xefe7d2);
  const spots = { 1: [[3, 3]], 2: [[1, 1], [5, 5]], 3: [[1, 1], [3, 3], [5, 5]], 4: [[1, 1], [5, 1], [1, 5], [5, 5]], 5: [[1, 1], [5, 1], [3, 3], [1, 5], [5, 5]], 6: [[1, 1], [5, 1], [1, 3], [5, 3], [1, 5], [5, 5]] }[n];
  for (const [x, y] of spots) fill(ctx, x, y, 1, 1, n === 1 || n === 4 ? 0xc23a2b : 0x1d2a55);
  return new THREE.MeshLambertMaterial({ map: texture(ctx), emissive: new THREE.Color(0.25, 0.25, 0.25) });
}
/** Euler angles that bring the face carrying `n` pips to the top (pips on front, right, back,
    left, top, bottom = 1…6, as the app has them). */
const UPRIGHT = { 1: [-Math.PI / 2, 0, 0], 2: [0, 0, Math.PI / 2], 3: [Math.PI / 2, 0, 0], 4: [0, 0, -Math.PI / 2], 5: [0, 0, 0], 6: [Math.PI, 0, 0] };

export class Mahjong3DScene {
  constructor(view) {
    this.view = view;
    this.scene = new THREE.Scene();
    this.world = new THREE.Group();
    this.tiles = new THREE.Group();
    this.machine = new THREE.Group();
    this.scene.add(this.world, this.tiles, this.machine);
    this.theme = null;
    this.top = 0.3;
    this.shownKey = '';
    this.resetID = null;
  }

  static key(t) { const g = t.game; return `${t.me} ${t.open} ${t.index} ${g.dealer} ${g.wall.slice(0, 6)} ${g.steps.length} ${g.wallLeft} ${g.phase}`; }

  /** Shows `table` ({game, me, open, index, reset}); true when built anew. */
  show(table, theme) {
    const rebuilt = theme !== this.theme;
    if (rebuilt) this.build(theme);
    const key = Mahjong3DScene.key(table);
    const r = table.reset;
    if (r && r.id !== this.resetID && performance.now() - r.start < RESET) {
      this.resetID = r.id;
      this.runReset(table, r);
      this.shownKey = key;
      return rebuilt;
    }
    if (!r && this.resetID != null) { this.skipReset(table); return rebuilt; }
    if ((!r || this.resetID === r.id) && (key !== this.shownKey || rebuilt)) {
      if (!r || performance.now() - r.start >= RESET - 450) { this.lay(table, this.tiles); this.shownKey = key; }
    }
    this.view.render();
    return rebuilt;
  }

  build(theme) {
    this.theme = theme;
    this.top = THEMES[theme].top;
    this.world.clear();
    buildBoard(theme, this.world, this.scene, SPAN, felt(theme));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(4 * W, 0.05, 4 * W), new THREE.MeshPhongMaterial({ color: color(0x061a1c), specular: new THREE.Color(0.5, 0.5, 0.5), shininess: 50 }));
    plate.position.set(0, this.top + 0.025, 0);
    plate.receiveShadow = true;
    this.world.add(plate);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.8, 36, 18), new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 + 0.1, specular: new THREE.Color(1, 1, 1), shininess: 90, depthWrite: false }));
    dome.position.set(0, this.top + 0.05, 0);
    dome.scale.set(1, 0.62, 1);
    dome.renderOrder = 20;
    this.world.add(dome);
  }

  lay(table, root) {
    root.clear();
    const g = table.game, top = this.top, y = top + T / 2;
    for (let seat = 0; seat < 4; seat++) {
      const frame = seatFrame(seat, table.me);
      root.add(frame);
      // The river: six to a row, starting at the plate's edge.
      g.rivers[seat].forEach((rv, i) => {
        if (rv.claimed) return;
        const n = tileNode(rv.tile, table.index);
        n.position.set(((i % 6) - 2.5) * W, y, 1.12 + L / 2 + Math.floor(i / 6) * L);
        frame.add(n);
      });
      // The hand stands at the seat (its face toward it); it lies down face up at the end.
      const drawn = g.turn === seat && g.phase !== 'over' && g.drawn != null ? [g.drawn] : [];
      const hand = g.handWithoutDrawn(seat).concat(drawn);
      const lying = table.open || g.phase === 'over';
      const count = hand.length + g.melds[seat].reduce((s, md) => s + M.meldTiles(md).length, 0) * 0.9 + 1;
      let x = -count * W / 2;
      hand.forEach((tile, i) => {
        const shown = seat === table.me || lying ? tile : null;
        const n = tileNode(shown, table.index);
        if (i === hand.length - 1 && drawn.length) x += 0.25 * W;
        if (lying) n.position.set(x + W / 2, y, 5.75);
        else { n.rotation.x = Math.PI / 2 - 0.12; n.position.set(x + W / 2, top + L / 2, 5.8); }
        frame.add(n);
        x += W;
      });
      // The melds lie face up beside the hand (a concealed kong's two ends face down).
      x += W * 0.6;
      for (const md of g.melds[seat]) {
        M.meldTiles(md).forEach((tile, i) => {
          const hidden = md.kind === 'hiddenKong' && (i === 0 || i === 3);
          const n = tileNode(hidden ? null : tile, table.index);
          n.scale.setScalar(0.9);
          n.position.set(x + W * 0.45, top + T * 0.45, 5.75);
          frame.add(n);
          x += W * 0.9;
        });
        x += W * 0.25;
      }
    }
    this.layWall(table, root);
    this.view.render();
  }

  /** The wall's stacks still there: the dealer's dice say whose wall is broken and where; the
      hand draws from there, kongs from the other end. `whole`: every stack (the walls rising). */
  layWall(table, root, whole = false) {
    const g = table.game, top = this.top;
    const [a, b] = dice(g);
    const roll = a + b;
    const owner = (g.dealer + roll - 1) % 4;
    for (let k = 0; k < 4; k++) {
      const frame = seatFrame((owner - k + 8) % 4, table.me);
      root.add(frame);
      for (let slot = 0; slot < 17; slot++) {
        const p = (k * 17 + slot - roll + 68) % 68;
        for (let layer = 0; layer < 2; layer++) {
          const index = 2 * p + layer;
          if (!whole && !(index >= g.front && index < g.back)) continue;
          const n = tileNode(null, false);
          n.position.set((8 - slot) * W + 0.35, top + T / 2 + (1 - layer) * T, 4.55);
          frame.add(n);
        }
      }
    }
  }

  /** Plays the reset from where it is (the screen may have come up partway through it). */
  runReset(table, reset) {
    const id = reset.id;
    this.machine.clear();
    // 1. The old hand sinks into the plate.
    const old = new THREE.Group();
    this.machine.add(old);
    const sinking = [];
    this.tiles.updateMatrixWorld(true);
    for (const frame of [...this.tiles.children]) {
      for (const n of [...frame.children]) {
        n.updateMatrixWorld(true);
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        n.matrixWorld.decompose(pos, q, s);
        const c = n.clone();
        c.position.copy(pos); c.quaternion.copy(q); c.scale.copy(s);
        old.add(c);
        sinking.push({ c, from: pos.clone(), s0: s.x, delay: Math.random() * 200 });
      }
    }
    this.tiles.clear();
    for (const sk of sinking) {
      tween(this.view, 450, (t) => {
        sk.c.position.lerpVectors(sk.from, new THREE.Vector3(0, this.top - 0.6, 0), t);
        sk.c.scale.setScalar(sk.s0 * (1 - 0.7 * t));
      }, { delay: sk.delay, done: () => old.remove(sk.c) });
    }
    const walls = new THREE.Group(), diceGroup = new THREE.Group();
    this.machine.add(walls, diceGroup);
    const elapsed = () => performance.now() - reset.start;
    const at = (ms, f) => setTimeout(() => { if (this.resetID === id) f(); }, Math.max(0, ms - elapsed()));
    // 3. The walls rise out of the table.
    at(1750, () => {
      this.layWall(table, walls, true);
      walls.children.forEach((frame) => frame.children.forEach((n, i) => {
        const y1 = n.position.y;
        n.position.y = y1 - 1.2;
        tween(this.view, 420, (t) => { n.position.y = y1 - 1.2 * (1 - t); }, { delay: (i % 34) * 8 });
      }));
      this.view.render();
    });
    // 4. The dice tumble under the dome, still by 2.9 s.
    at(2300, () => this.throwDice(reset.dice, diceGroup));
    // 5. The deal: the walls and dice go, the new hand comes.
    at(RESET - 450, () => {
      for (const grp of [walls, diceGroup]) tween(this.view, 300, (t) => setOpacity(grp, 1 - t), { done: () => this.machine.remove(grp) });
      this.lay(table, this.tiles);
      setOpacity(this.tiles, 0);
      tween(this.view, 350, (t) => setOpacity(this.tiles, t));
    });
  }

  /** The reset was skipped: the new hand at once. */
  skipReset(table) {
    this.resetID = null;
    this.machine.clear();
    this.lay(table, this.tiles);
    setOpacity(this.tiles, 1);
    this.shownKey = Mahjong3DScene.key(table);
  }

  throwDice(faces, group) {
    const geo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
    // BoxGeometry order +x, −x, +y, −y, +z, −z ← pips right 2, left 4, top 5, bottom 6, front 1, back 3.
    const mats = [2, 4, 5, 6, 1, 3].map(pips);
    faces.forEach((face, i) => {
      const n = new THREE.Mesh(geo, mats);
      n.castShadow = true;
      const x = i === 0 ? -0.26 : 0.26, z = i === 0 ? 0.08 : -0.08, y0 = this.top + 0.25;
      n.position.set(x, y0, z);
      group.add(n);
      const up = UPRIGHT[face];
      const spin = [9, 6, 7];
      tween(this.view, 600, (t) => {
        n.rotation.set(spin[0] * t, spin[1] * t, spin[2] * t);
        n.position.y = y0 + 0.18 * Math.sin(Math.PI * t);
      }, { done: () => {
        const from = n.rotation.clone();
        tween(this.view, 120, (t) => n.rotation.set(from.x + (up[0] - from.x) * t, from.y + (up[1] - from.y) * t, from.z + (up[2] - from.z) * t));
      } });
    });
  }
}
