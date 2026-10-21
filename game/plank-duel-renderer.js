/* Plank Plank Plank!, side on: a duel on a plank over the water (or lava, or the street), you on
   the left with the round's weapon, your friend (or the rival) on the right. A port of the app's
   DuelView (PlankPilot/Views/DuelView.swift): the same pixels, drawn at half resolution and scaled
   up with nearest-neighbour, so the browser and the app look alike. */
import { kitForRound } from './plank-duel-engine.js?v=1';

const BODY = 26;   // toes to head front, in cells: everyone fights in a forearm plank

const SPRITES = {
  face: ['  hhhhhh  ', ' hhsssshh ', ' hssssssh ', 'sswsswssss', 'ssbssbssss', 'ssssspssss',
    ' ssm msss ', '  smmmss  ', '   ssss   '],
  goat: ['hh      hh', ' hh    hh ', '  wwwwww  ', ' wwewwwew ', ' wwwwwwww ',
    '  wwwwww  ', '   wnnw   ', '   wwww   ', '    gg    ', '    gg    '],
  golem: ['  rrrrrr  ', ' rrrrrrrr ', 'rrlrrrrlrr', 'rryrrrryrr', 'rrrrrrrrrr',
    'rrrllllrrr', 'rrrrrrrrrr', ' rrrrrrrr ', '  rr  rr  ', '          '],
  yeti: ['  ffffff  ', ' ffffffff ', 'ffbbbbbbff', 'fbebbbbebf', 'fbbbbbbbbf',
    'fbbmmmmbbf', 'ffbbbbbbff', ' ffffffff ', '  ffffff  ', '          '],
  crab: [' e      e ', ' e      e ', '  rrrrrr  ', ' rrrrrrrr ', 'rrrwrrwrrr',
    'rrrrrrrrrr', 'rrrmmmmrrr', ' rrrrrrrr ', '  r r r r ', '          '],
  robot: ['    a     ', '    a     ', ' gggggggg ', ' gvvvvvvg ', ' gvcvvcvg ',
    ' gvvvvvvg ', ' gggggggg ', ' gggmmggg ', ' gggggggg ', '          '],
};

const hex = (n, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
const shade = n => ((Math.floor(((n >> 16) & 255) * 0.72) << 16) | (Math.floor(((n >> 8) & 255) * 0.72) << 8) | Math.floor((n & 255) * 0.72));
const trunc = (a, b) => a % b;   // Swift's truncatingRemainder

/**
 * Draws one frame. `ctx`: a 2D context whose transform maps CSS pixels onto a half-resolution
 * bitmap; `match`: a DuelMatch (the host's own, or the guest's mirrored view); `time`: seconds of
 * animation; `insets`: { left, right } CSS pixels to keep the plank's ends clear of; `sound(kit, blocked)`
 * is called on the frame a blow lands.
 */
export class DuelRenderer {
  constructor() {
    this.wasLanding = [false, false];
    this.time = 0;
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  draw(ctx, match, { width, height, time = 0, insets = { left: 0, right: 0 }, sound = () => {} }) {
    this.ctx = ctx;
    this.time = this.reducedMotion ? 0 : time;
    this.sound = sound;
    ctx.imageSmoothingEnabled = false;
    // The app's cell is height / 72 (it is always landscape); a portrait phone also needs the two
    // fighters (about 60 cells together) to fit across.
    const cell = Math.max(3, Math.round(Math.min(height / 72, width / 120)));
    const l = {
      width, height, cell, ground: Math.round(height * 0.6), water: Math.round(height * 0.86),
      plankLeft: Math.round(Math.max(width * 0.07, insets.left + cell * 7)),
      plankRight: Math.round(Math.min(width * 0.93, width - insets.right - cell * 7)),
      spacing: cell * 3,
    };
    const place = match.place;
    this.backdrop(place, l);
    this.water(place, l);
    this.plank(place, l, match);

    // Both fighters plank head to head; the clash point slides along the plank, and losing
    // ground pushes you back until your toes leave the end.
    const falling = match.falling ? { loser: match.falling.loser, t: match.elapsed - match.falling.since } : null;
    const r = match.line, reach = l.spacing + cell * BODY;
    const clash = width / 2 - (r > 0 ? r * (width / 2 - reach - l.plankLeft) : r * (l.plankRight - width / 2 - reach));
    const feet = [clash - l.spacing, clash + l.spacing];
    const drops = [0, 0];
    if (falling) {
      const t = falling.t, side = falling.loser;
      feet[side] += (side === 0 ? -1 : 1) * Math.min(1, Math.max(0, t - 0.2) / 0.4) * cell * 6;
      drops[side] = t < 0.3 ? 0 : Math.pow((t - 0.3) * 3.2, 2) * cell * 6;
    }
    for (let side = 0; side < 2; side++) {
      if (drops[side] > l.water - l.ground + cell * 4) continue;   // under the surface
      this.fighter(side, match, feet[side], l.ground + drops[side], cell, drops[side] > 0,
        falling ? falling.loser !== side : false);
    }
    const clashing = [0, 1].some(side => match.sides[side].striking
      || (match.versusCPU && side === 1 && ['jab', 'lunge', 'press'].includes(match.move)));
    if (!falling && clashing && !this.reducedMotion) {
      for (let k = 0; k < 5; k++) {
        const a = this.time * 23 + k * 1.7;
        this.fill(k % 2 === 0 ? 0xfff4dc : 0xffd65c, clash + Math.cos(a) * cell * 2.5 - cell / 2,
          l.ground - cell * 9 + Math.sin(a * 1.3) * cell * 2, cell, cell);
      }
    }
    if (falling && falling.t > 0.75) {
      const toes = feet[falling.loser] + (falling.loser === 0 ? -1 : 1) * cell * BODY;
      this.splash(place, toes, l.water, falling.t - 0.75, cell);
    }
  }

  fill(color, x, y, w, h, alpha = 1) {
    this.ctx.fillStyle = hex(color, alpha);
    this.ctx.fillRect(x, y, w, h);
  }

  // MARK: Backdrops

  backdrop(place, l) {
    const bands = {
      river: [0x6fb8e0, 0x86c6e8, 0x9fd3ee, 0xb9e1f2], volcano: [0x1d0a12, 0x2e0f17, 0x45151c, 0x5f1e20],
      fjord: [0x0a1228, 0x0f1a36, 0x152446, 0x1c2f58], pier: [0xff8a66, 0xff9f6f, 0xffb877, 0xffd38c],
      rooftops: [0x0e1226, 0x141a33, 0x1b2342, 0x232c50],
    }[place];
    const bandH = Math.ceil(l.ground / bands.length);
    bands.forEach((color, i) => this.fill(color, 0, i * bandH, l.width, bandH + 1));
    const c = l.cell, t = this.time;
    switch (place) {
      case 'river':
        this.fill(0xfff4c2, l.width * 0.78, l.height * 0.08, c * 8, c * 8);
        this.clouds(l, 0xffffff);
        this.mountains(l, 0x7d8fb0, 0.18, 1, 0xf4f8ff);
        this.mountains(l, 0x5b6d90, 0.3, 2, null);
        break;
      case 'volcano': {
        const cx = l.width * 0.62;
        for (let row = 0; row < 14; row++) {
          const y = l.height * 0.14 + row * c * 3, half = row * c * 3 + c * 4;
          this.fill(0x150a0d, cx - half, y, half * 2, c * 3 + 1);
        }
        this.fill(0xff7a2f, cx - c * 4, l.height * 0.14 - c, c * 8, c * 2);
        for (let k = 0; k < 5; k++) {
          const p = trunc(t * 0.25 + k * 0.2, 1), s = c * (3 + p * 5);
          this.fill(0x4a3438, cx - s / 2 + Math.sin(k * 2) * c * 4, l.height * 0.12 - p * l.height * 0.12 - s, s, s, 0.7 * (1 - p));
        }
        this.mountains(l, 0x2a1218, 0.34, 3, null);
        break;
      }
      case 'fjord':
        this.stars(l);
        for (let x = 0; x < l.width; x += c * 2) {   // aurora ribbons
          const y = l.height * 0.12 + Math.sin(x * 0.012 + t * 0.4) * c * 6;
          this.fill(0x5ff0b0, x, y, c * 2, c * 5, 0.35);
          this.fill(0x8a7dff, x, y + c * 6, c * 2, c * 3, 0.25);
        }
        this.mountains(l, 0x9ec3de, 0.22, 4, 0xeef8ff);
        this.mountains(l, 0x6c94b8, 0.34, 5, null);
        break;
      case 'pier': {
        const sun = c * 18;   // the sun setting into the sea
        this.fill(0xfff0a0, l.width * 0.7 - sun / 2, l.ground - sun * 0.7, sun, sun * 0.7);
        this.fill(0xffe07a, l.width * 0.7 - sun * 0.7, l.ground - sun * 0.45, sun * 1.4, sun * 0.45);
        this.fill(0x3a6fa8, 0, l.ground - c * 3, l.width, c * 3);
        this.clouds(l, 0xffd9c4);
        break;
      }
      case 'rooftops': {
        this.stars(l);
        let x = 0, i = 0;
        while (x < l.width) {
          const w = c * (10 + (i * 7) % 9), top = l.height * (0.16 + ((i * 5) % 7) * 0.035);
          this.fill(i % 2 === 0 ? 0x1f2540 : 0x262d4c, x, top, w, l.ground - top);
          for (let wy = top + c * 3; wy < l.ground - c * 2; wy += c * 4) {
            for (let wx = x + c * 2; wx < x + w - c * 2; wx += c * 4) {
              if ((Math.trunc(wx / c) * 31 + Math.trunc(wy / c) * 17 + i) % 3 === 0) this.fill(0xffd65c, wx, wy, c * 2, c * 2, 0.8);
            }
          }
          x += w + c; i++;
        }
        break;
      }
    }
  }

  mountains(l, color, peak, seed, snow) {
    const step = l.cell * 3;
    for (let x = 0; x < l.width; x += step) {
      const n = Math.sin(x * 0.011 + seed * 3.1) * 0.5 + Math.sin(x * 0.027 + seed) * 0.3 + Math.sin(x * 0.053 + seed * 7) * 0.2;
      const top = Math.round(l.height * (peak + 0.12 * (1 - n)) / step) * step;
      this.fill(color, x, top, step, l.ground - top);
      if (snow != null && n > 0.45) this.fill(snow, x, top, step, step * 2);
    }
  }

  clouds(l, color) {
    for (let i = 0; i < 4; i++) {
      const x = (trunc(i * 0.31 + this.time * 0.008, 1.2) - 0.1) * l.width;
      const y = l.height * (0.06 + (i % 2) * 0.08);
      this.fill(color, x, y, l.cell * 16, l.cell * 3, 0.85);
      this.fill(color, x + l.cell * 3, y - l.cell * 2, l.cell * 8, l.cell * 2, 0.85);
    }
  }

  stars(l) {
    for (let i = 0; i < 40; i++) {
      const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * l.width, y = (Math.sin(i * 311.7) * 0.5 + 0.5) * l.ground * 0.8;
      const on = this.reducedMotion || (Math.trunc(this.time * 2) + i) % 7 !== 0;
      this.fill(0xdfe8ff, x, y, l.cell, l.cell, on ? 0.8 : 0.3);
    }
  }

  // MARK: The water and the plank

  water(place, l) {
    const [far, deep, surface, foam] = {
      river: [0x3f5272, 0x1f5d93, 0x2f78b8, 0xd8f0ff], volcano: [0x2a1015, 0xc23b12, 0xff6a1f, 0xffd65c],
      fjord: [0x2b4a6a, 0x0c2440, 0x16385e, 0xe6f4ff], pier: [0x3a6fa8, 0x24507e, 0x3a6fa8, 0xfff0d0],
      rooftops: [0x0b0d14, 0x101219, 0x1a1d26, 0x3a3f52],
    }[place];
    const c = l.cell, t = this.time;
    this.fill(far, 0, l.ground, l.width, l.water - l.ground);
    if (place === 'river') {   // a waterfall behind the plank
      for (let i = 0; i < 4; i++) {
        const x = l.width / 2 - c * 6 + i * c * 3, flow = Math.trunc(t * 12 + i * 3) % 4;
        this.fill(i % 2 === 0 ? 0xd8f0ff : 0xa9d8f5, x, l.height * 0.3, c * 3, l.water - l.height * 0.3);
        this.fill(0xffffff, x, l.ground + flow * c * 4, c * 3, c * 2, 0.7);
      }
    }
    this.fill(deep, 0, l.water, l.width, l.height - l.water);
    for (let x = 0; x < l.width; x += c * 2) {
      const wave = Math.round(Math.sin(x * 0.05 + t * 3) * c);
      this.fill(surface, x, l.water + wave, c * 2, c * 3);
      if (Math.trunc(x / (c * 2) + t * 4) % 9 === 0) this.fill(foam, x, l.water + wave - c, c * 2, c);
    }
    if (place === 'volcano') {
      for (let k = 0; k < 6; k++) {
        const p = trunc(t * 0.7 + k * 0.17, 1);
        this.fill(0xffd65c, l.width * (0.1 + k * 0.16), l.water - p * c * 6, c * 2, c * 2, 1 - p);
      }
    }
    if (place === 'rooftops') {   // the street far below
      for (let k = 0; k < 8; k++) {
        const x = trunc(t * 0.15 + k / 8, 1) * l.width;
        this.fill(k % 2 === 0 ? 0xff5a5a : 0xfff4dc, x, l.water + c * 4, c * 2, c);
      }
    }
  }

  /** A log, a stone beam, an ice beam, pier boards or a crane girder; its end flashes red when someone is close to it. */
  plank(place, l, match) {
    const c = l.cell, x0 = l.plankLeft, x1 = l.plankRight, y = l.ground, w = x1 - x0;
    switch (place) {
      case 'river':
        for (const x of [x0 + c * 2, x1 - c * 8]) { this.fill(0x6b6f7a, x, y + c * 3, c * 6, l.water - y); this.fill(0x8a8e99, x, y + c * 3, c * 6, c * 2); }
        this.fill(0x8a5a30, x0, y, w, c * 4); this.fill(0xb07a44, x0, y, w, c);
        for (let x = x0 + c * 6; x < x1; x += c * 14) this.fill(0x6a4424, x, y + c * 2, c * 3, c);
        this.fill(0xd8b276, x0, y, c * 2, c * 4); this.fill(0xd8b276, x1 - c * 2, y, c * 2, c * 4);
        break;
      case 'volcano':
        for (const x of [x0 + c * 3, x1 - c * 9]) this.fill(0x2d2428, x, y + c * 3, c * 6, l.water - y);
        this.fill(0x5a4a4e, x0, y, w, c * 4); this.fill(0x6e5c60, x0, y, w, c);
        for (let x = x0 + c * 9; x < x1; x += c * 17) this.fill(0xff7a2f, x, y + c * 2, c * 4, c, 0.8);
        break;
      case 'fjord':
        for (const x of [x0 + c * 3, x1 - c * 9]) this.fill(0x9ec3de, x, y + c * 3, c * 6, l.water - y);
        this.fill(0xcfe8f5, x0, y, w, c * 4); this.fill(0xf2fbff, x0, y, w, c);
        for (let x = x0 + c * 5; x < x1; x += c * 11) this.fill(0x8fb8d8, x, y + c * 2, c * 5, c);
        break;
      case 'pier':
        for (let x = x0 + c * 2; x < x1; x += c * 18) this.fill(0x6a4424, x, y + c * 3, c * 3, l.water - y);
        this.fill(0x8a5a30, x0, y, w, c * 3);
        for (let x = x0; x < x1; x += c * 6) this.fill(0xb07a44, x, y, c * 5, c);
        break;
      case 'rooftops':
        for (const x of [x0 + c * 6, x1 - c * 7]) this.fill(0x3a3f52, x, 0, c, y);
        this.fill(0x7a8090, x0, y, w, c); this.fill(0x5a6070, x0 + c, y + c, w - c * 2, c * 2); this.fill(0x7a8090, x0, y + c * 3, w, c);
        for (let x = x0 + c * 2; x < x1; x += c * 6) this.fill(0x353946, x, y + c * 2, c, c);
        break;
    }
    if (match.falling) return;
    for (let side = 0; side < 2; side++) {
      const toward = side === 0 ? match.line : -match.line;
      if (toward <= 0.55) continue;
      const blink = this.reducedMotion || Math.trunc(this.time * 8) % 2 === 0;
      this.fill(0xff4a4a, side === 0 ? x0 : x1 - c * 3, y - c, c * 3, c * 5, blink ? 0.9 : 0.4);
    }
  }

  // MARK: Fighters

  look(side, match) {
    if (side === 0 || !match.versusCPU) {
      return { shirt: side === 0 ? 0x6dccae : 0xb47dca, belt: 0x2a3550, pants: 0x3b4a6b, shoes: 0x1b2236,
        head: null, colors: {}, kit: kitForRound(match.round) };
    }
    const rival = {
      river: { shirt: 0xe6e1d4, belt: 0xbdb5a3, pants: 0xd5cfc0, shoes: 0x5a4a3a, head: SPRITES.goat,
        colors: { h: 0x8a7a66, w: 0xf2efe6, e: 0x2a2a2a, n: 0xd99a9a, g: 0xcfcac0 }, weapon: 0x8a6a44, weaponTip: 0xb08a5a, weaponLength: 9, hilt: null },
      volcano: { shirt: 0x3b3236, belt: 0xff7a2f, pants: 0x2d2428, shoes: 0x1b1416, head: SPRITES.golem,
        colors: { r: 0x3b3236, l: 0xff7a2f, y: 0xffd65c }, weapon: 0x4a3c40, weaponTip: 0xff7a2f, weaponWidth: 2, weaponLength: 6, hilt: null },
      fjord: { shirt: 0xeef6ff, belt: 0xcfe0f0, pants: 0xe2eef9, shoes: 0x8fb8e8, head: SPRITES.yeti,
        colors: { f: 0xeef6ff, b: 0x8fb8e8, e: 0x1b2a44, m: 0x1b2a44 }, weapon: 0xbfe6ff, weaponTip: 0xffffff, weaponLength: 8, hilt: 0x8fb8e8 },
      pier: { shirt: 0xe0523e, belt: 0xb63a2a, pants: 0xe0523e, shoes: 0x8a2418, head: SPRITES.crab,
        colors: { r: 0xe0523e, e: 0x222222, w: 0xffffff, m: 0x8a2418 }, weapon: 0xe0523e, weaponTip: 0xff8a6a, weaponWidth: 2, weaponLength: 5, hilt: null },
      rooftops: { shirt: 0x9aa6b8, belt: 0x5a6577, pants: 0x7a8698, shoes: 0x3a4250, head: SPRITES.robot,
        colors: { g: 0x9aa6b8, v: 0x223044, c: 0x5ff0ff, a: 0xffd65c, m: 0x5a6577 }, weapon: 0x5ff0ff, weaponTip: 0xe0ffff, weaponLength: 8, hilt: 0x5a6577 },
    }[match.place];
    return { weaponWidth: 1, weaponLength: 7, hilt: 0xffd65c, kit: null, ...rival };
  }

  pose(side, match, cheering) {
    if (cheering) return 'cheer';
    const flurry = rate => Math.trunc(this.time * rate) % 2 === 0 ? 'raised' : 'thrust';
    if (match.versusCPU && side === 1) {
      switch (match.move) {
        case 'windup': return 'windup';
        case 'lunge': return 'lunge';
        case 'jab': return this.reducedMotion ? 'thrust' : flurry(5);
        case 'press': return this.reducedMotion ? 'thrust' : flurry(3);
        case 'breather': return 'tired';
        default: return 'guarding';
      }
    }
    const state = match.sides[side];
    if (match.elapsed < state.staggeredUntil) return 'recoil';
    if (state.exhausted) return 'tired';
    if (state.blocking) return 'block';
    if (state.striking) return this.reducedMotion ? 'thrust' : flurry(7);
    return 'guarding';
  }

  /** A pixel fighter in a forearm plank, head toward the rival. The weapon hand lifts to strike; to block, people bring the weapon up before the face. */
  fighter(side, match, front, groundY, c, flailing, cheering) {
    const look = this.look(side, match);
    const f = side === 0 ? 1 : -1;
    const cpu = match.versusCPU && side === 1;
    const pose = flailing ? 'recoil' : this.pose(side, match, cheering);
    let slide = pose === 'lunge' ? 3 : pose === 'thrust' ? 1 : pose === 'recoil' ? -2 : 0;
    const landing = !flailing && (pose === 'thrust' || pose === 'lunge');
    if (landing && !this.wasLanding[side]) this.sound(look.kit || 'gloves', match.sides[1 - side].blocking);
    this.wasLanding[side] = landing;
    const rivalPose = flailing ? 'guarding' : this.pose(1 - side, match, false);
    const beingHit = !flailing && match.sides[1 - side].striking && !match.sides[side].blocking && (rivalPose === 'thrust' || rivalPose === 'lunge');
    if (beingHit) slide -= 0.9;
    const toes = front - f * c * BODY + f * c * slide;
    const px = x => toes + f * x * c;
    const py = y => groundY - y * c;
    const box = (color, x0, x1, y0, y1, alpha = 1) => {
      const a = px(x0), b = px(x1);
      this.fill(color, Math.round(Math.min(a, b)), Math.round(py(y1)), Math.ceil(Math.abs(b - a)), Math.ceil((y1 - y0) * c), alpha);
    };
    const line = (color, from, to, thick) => {
      const steps = Math.max(1, Math.trunc(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) * 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t;
        box(color, x - thick / 2, x + thick / 2, y - thick / 2, y + thick / 2);
      }
    };
    const hipY = pose === 'tired' ? 2.6 : pose === 'windup' ? 6.5 : 4.6;
    const shoulder = [19.5, 7.2];
    box(look.shoes, 0, 2.5, 0, 1.5);
    line(look.pants, [1.5, 1.6], [12, hipY], 2.2);
    line(look.belt, [11.5, hipY], [13, hipY + 0.4], 3);
    line(look.shirt, [13, hipY + 0.4], shoulder, 3.2);
    const swordUp = ['raised', 'thrust', 'lunge', 'windup', 'cheer'].includes(pose);
    const shieldUp = pose === 'block';
    const nearGuards = shieldUp && look.kit != null;
    const farGuards = shieldUp && look.kit !== 'sword' && look.kit !== 'pan';
    const far = shade(look.shirt);
    if (!flailing) {
      if (!farGuards) {
        line(far, [shoulder[0] + 0.6, shoulder[1]], [shoulder[0] + 0.6, 0.8], 1.8);
        box(far, shoulder[0], shoulder[0] + 5.5, 0, 1.4);
      }
      if (!swordUp && !nearGuards) {
        line(look.shirt, [shoulder[0] - 0.4, shoulder[1]], [shoulder[0] - 0.4, 0.8], 1.8);
        box(look.shirt, shoulder[0] - 1.2, shoulder[0] + 4.3, 0, 1.4);
      }
    } else {
      const up = Math.trunc(this.time * 10) % 2 === 0 ? 2 : 0;
      line(look.shirt, shoulder, [shoulder[0] + 2, 13 + up], 1.8);
    }
    let hand = [shoulder[0] + 4, 1];
    let dir = [1, 0.08];
    switch (pose) {
      case 'raised': case 'cheer': hand = [21, 14]; dir = [0.3, 1]; break;
      case 'thrust': case 'lunge': hand = [25.5, 9]; dir = [1, 0]; break;
      case 'windup': hand = [16, 13.5]; dir = [-0.45, 1]; break;
      case 'recoil': case 'tired': dir = [1, -0.05]; break;
    }
    if (['hammer', 'pan', 'pillow'].includes(look.kit) && (pose === 'thrust' || pose === 'lunge')) dir = [1, -0.75];
    if (look.kit === 'pan') {
      if (['raised', 'cheer', 'windup'].includes(pose)) { hand = [22.8, 16.8]; dir = [0.25, 1]; }
      else if (pose === 'thrust' || pose === 'lunge') { hand = [25.0, 16.0]; dir = [0.9, -0.45]; }
    }
    if (nearGuards) {
      switch (look.kit) {
        case 'sword': hand = [26.8, 5.2]; dir = [0.12, 1]; break;
        case 'gloves': hand = [26.2, 12.4]; break;
        case 'hammer': hand = [26.6, 6.0]; break;
        case 'pan': hand = [27.2, 4.4]; break;
        case 'pillow': hand = [26.8, 5.0]; break;
      }
    }
    if (look.kit && (pose === 'thrust' || pose === 'lunge') && match.sides[1 - side].blocking) hand = [hand[0] - 1.2, hand[1]];
    if (!flailing && (swordUp || nearGuards)) line(look.shirt, [shoulder[0] - 0.4, shoulder[1]], hand, swordUp ? 2.3 : 1.8);
    if (!flailing && farGuards) {
      const farHand = look.kit === 'gloves' ? [26.2, 8.6] : look.kit === 'hammer' ? [26.6, 11] : look.kit === 'pillow' ? [26.8, 12.4] : [25.5, 8.5];
      line(far, shoulder, farHand, 1.8);
    }
    // Head, lifted a little to watch the rival.
    const headBox = c * 6.4;
    const hx = Math.min(px(20), px(20 + 6.4)), hy = py(12.4);
    if (look.head) {
      this.sprite(look.head, hx - c * 0.4, hy - c * 0.4, headBox + c * 0.8, look.colors);
    } else {
      this.fill(side === 0 ? 0x9ceae2 : 0xd9c5ff, hx - c * 0.4, hy - c * 0.4, headBox + c * 0.8, headBox + c * 0.8);
      this.sprite(SPRITES.face, hx, hy, headBox,
        { h: side === 1 ? 0xb47dca : 0x6dccae, s: 0xe5b087, w: 0xfff8df, b: 0x15213b, p: 0xf48796, m: 0x713757 });
    }
    if (beingHit) {
      this.fill(0xff5a4a, hx - c * 0.4, hy - c * 0.4, headBox + c * 0.8, headBox + c * 0.8, 0.35);
      this.fill(0xffffff, hx, hy, headBox, headBox, 0.22);
    }
    if (flailing) return;
    if (look.kit) {
      this.kit(look.kit, side, match, pose, hand, dir, shoulder, shieldUp, swordUp, box, line, px, py, c);
      return;
    }
    // A rival's own weapon: lying on the plank, or swung from a one-arm plank.
    const length = look.weaponLength * 1.3 * (pose === 'lunge' ? 1.25 : 1), width = look.weaponWidth * 1.6;
    const norm = Math.hypot(dir[0], dir[1]);
    line(0x14182a, hand, [hand[0] + dir[0] / norm * length, hand[1] + dir[1] / norm * length], width + 0.9);
    for (let k = 0; k < Math.trunc(length); k++) {
      const t = k + 1, x = hand[0] + dir[0] / norm * t, y = hand[1] + dir[1] / norm * t;
      box(k === Math.trunc(length) - 1 ? look.weaponTip : look.weapon, x - width / 2, x + width / 2, y - width / 2, y + width / 2);
    }
    if (look.hilt != null) box(look.hilt, hand[0] - 0.6, hand[0] + 0.6, hand[1] - 1.2, hand[1] + 1.2);
    if ((pose === 'thrust' || pose === 'lunge') && !this.reducedMotion) {
      for (let k = 0; k < 3; k++) box(0xffffff, hand[0] + length + 1, hand[0] + length + 2, hand[1] + (k - 1) * 2, hand[1] + (k - 1) * 2 + 1, 0.45);
    }
    if (!this.reducedMotion && Math.trunc(this.time * 1.3 + side) % 3 === 0) box(0x8fd3ff, 20.5, 21.3, 12.6, 13.8);
    if (match.elapsed < match.sides[side].staggeredUntil && !this.reducedMotion) {
      for (let k = 0; k < 3; k++) {
        const a = this.time * 6 + k * 2.1;
        this.fill(0xffd65c, hx + headBox / 2 + Math.cos(a) * c * 4.5 - c / 2, hy - c * 1.5 + Math.sin(a) * c * 1.5, c, c);
      }
    }
    if (cpu && match.cpuWindingUp && (this.reducedMotion || Math.trunc(this.time * 10) % 2 === 0)) {
      this.bang(hx + headBox / 2, hy - c * 8, c);
    }
    if (cpu && match.move === 'breather') {
      const t = trunc(this.time * 1.5, 1);
      box(0xffffff, 27 + t * 4, 28.6 + t * 4, 8 + t * 2, 9.6 + t * 2, 0.8 * (1 - t));
    }
  }

  /** The round's kit, big and outlined so it reads from the floor. */
  kit(kit, side, match, pose, hand, dir, shoulder, shieldUp, swordUp, box, line, px, py, c) {
    const ink = 0x14182a;
    const obox = (color, x0, x1, y0, y1) => { box(ink, x0 - 0.45, x1 + 0.45, y0 - 0.45, y1 + 0.45); box(color, x0, x1, y0, y1); };
    const oline = (color, a, b, thick) => { line(ink, a, b, thick + 0.9); line(color, a, b, thick); };
    const norm = Math.max(0.001, Math.hypot(dir[0], dir[1])), ux = dir[0] / norm, uy = dir[1] / norm;
    const resting = !swordUp && !shieldUp;
    let tip = [hand[0] + ux * 10, hand[1] + uy * 10];
    switch (kit) {
      case 'sword': {
        const len = pose === 'lunge' ? 12 : 10;
        tip = [hand[0] + ux * len, hand[1] + uy * len];
        oline(0xe8eef6, hand, tip, 1.6);
        line(0xffffff, [hand[0] + ux * 2, hand[1] + uy * 2], [tip[0] - ux, tip[1] - uy], 0.5);
        if (Math.abs(ux) > Math.abs(uy)) obox(0xffd65c, hand[0] - 0.5, hand[0] + 0.5, hand[1] - 1.8, hand[1] + 1.8);
        else obox(0xffd65c, hand[0] - 1.8, hand[0] + 1.8, hand[1] - 0.5, hand[1] + 0.5);
        break;
      }
      case 'gloves': {
        const glove = side === 0 ? 0xe0402f : 0x3b6fe0, far = shade(glove);
        const drawGlove = (color, x, y) => {
          const x0 = x - 2.0, x1 = x + 2.4, y0 = y - 1.9, y1 = y + 1.9;
          box(ink, x0 - 0.45, x1 + 0.45, y0 + 0.6, y1 - 0.6); box(ink, x0 + 0.6, x1 - 0.6, y0 - 0.45, y1 + 0.45);
          box(0xf4f0e6, x0 - 1.5, x0 + 0.2, y - 1.3, y + 1.3);
          box(ink, x0 - 1.5, x0 - 1.1, y - 1.3, y + 1.3);
          box(color, x0, x1, y0 + 0.6, y1 - 0.6); box(color, x0 + 0.6, x1 - 0.6, y0, y1);
          box(shade(color), x0 + 0.6, x1 - 1.2, y1 - 1.0, y1 - 0.3);
          box(ink, x1 - 1.2, x1 - 0.8, y1 - 1.2, y1 - 0.2);
          box(0xffffff, x1 - 1.4, x1 - 0.6, y0 + 0.8, y0 + 1.6);
        };
        if (shieldUp) { drawGlove(far, 28, 8.6); drawGlove(glove, 28, 12.4); }
        else {
          drawGlove(far, shoulder[0] + 6.2, 1.8);
          if (pose === 'thrust' || pose === 'lunge') { tip = [hand[0] + 2.2, hand[1]]; drawGlove(glove, hand[0] + 1.6, hand[1]); }
          else if (['raised', 'cheer', 'windup'].includes(pose)) drawGlove(glove, hand[0] + 0.8, hand[1]);
          else drawGlove(glove, shoulder[0] + 5.4, 1.8);
        }
        break;
      }
      case 'hammer': {
        let a = hand, b = [hand[0] + ux * 7.5, hand[1] + uy * 7.5];
        if (shieldUp) { a = [27.2, 3.5]; b = [27.2, 13.5]; }
        else if (resting) { a = [shoulder[0] + 3.5, 1.4]; b = [shoulder[0] + 10.5, 1.9]; }
        oline(0x9a6a3a, a, b, 1.1);
        const hl = Math.max(0.001, Math.hypot(b[0] - a[0], b[1] - a[1])), hx = (b[0] - a[0]) / hl, hy = (b[1] - a[1]) / hl;
        const nx = -hy, ny = hx;
        oline(0xaab3c5, [b[0] - nx * 2, b[1] - ny * 2], [b[0] + nx * 2, b[1] + ny * 2], 2.6);
        tip = [b[0] + hx * 1.5, b[1] + hy * 1.5];
        break;
      }
      case 'pan': {
        const disk = (color, cx, cy, r) => {
          for (let dy = -r; dy <= r; dy += 0.5) { const hw = Math.sqrt(r * r - dy * dy); box(color, cx - hw, cx + hw, cy + dy - 0.3, cy + dy + 0.3); }
        };
        const r = shieldUp ? 3.2 : 2.5;
        let a = hand, center = [hand[0] + ux * (5.0 + r), hand[1] + uy * (5.0 + r)];
        if (shieldUp) { a = [27.2, 4.4]; center = [28.8, 10.2]; }
        else if (resting) { a = [shoulder[0] + 3.5, 1.4]; center = [shoulder[0] + 10.2, 2.6]; }
        oline(0x6b4a2e, a, center, 0.9);
        disk(ink, center[0], center[1], r + 0.5);
        disk(0x6b7385, center[0], center[1], r);
        disk(0x2e323d, center[0], center[1], r - 0.7);
        box(0xffffff, center[0] + r * 0.25, center[0] + r * 0.25 + 0.7, center[1] + r * 0.3, center[1] + r * 0.3 + 0.7);
        tip = [center[0] + ux * r, center[1] + uy * r];
        break;
      }
      case 'pillow': {
        const fillColor = side === 0 ? 0xbfeedd : 0xdcc8f5, stitch = shade(shade(fillColor));
        let center = [hand[0] + ux * 2.9, hand[1] + uy * 2.9];
        let ax = [ux, uy], half = [2.4, 3.8];
        if (shieldUp) { center = [28.2, 9.6]; ax = [1, 0]; half = [2.3, 4.6]; }
        else if (resting) { center = [shoulder[0] + 8.2, 2.5]; ax = [0, 1]; half = [1.9, 3.7]; }
        const bx = [-ax[1], ax[0]];
        const pt = (s, l) => [center[0] + ax[0] * s + bx[0] * l, center[1] + ax[1] * s + bx[1] * l];
        for (const cs of [-1, 1]) for (const cl of [-1, 1]) {
          const corner = pt(cs * half[0], cl * half[1]), ear = pt(cs * (half[0] + 0.9), cl * (half[1] + 0.9));
          line(ink, corner, ear, 1.6); line(fillColor, corner, ear, 0.9);
        }
        const steps = Math.trunc(half[1] * 4);
        for (let pass = 0; pass < 2; pass++) {
          for (let k = 0; k <= steps; k++) {
            const l = -half[1] + 2 * half[1] * k / steps, puff = half[0] * (0.9 + 0.1 * Math.cos(Math.PI * l / half[1] / 2));
            const w = pass === 0 ? puff + 0.45 : puff;
            line(pass === 0 ? ink : fillColor, pt(-w, l), pt(w, l), 0.7);
          }
        }
        for (let l = -half[1] + 0.9; l <= half[1] - 0.9; l += 0.9) {
          for (const cs of [-1, 1]) { const p = pt(cs * (half[0] * 0.9 - 0.6), l); box(stitch, p[0] - 0.18, p[0] + 0.18, p[1] - 0.18, p[1] + 0.18); }
        }
        for (const cs of [-1, 1]) for (const cl of [-1, 1]) {
          line(shade(fillColor), pt(cs * half[0] * 0.75, cl * half[1] * 0.8), pt(cs * half[0] * 0.35, cl * half[1] * 0.5), 0.35);
        }
        tip = pt(half[0] + 0.6, 0);
        break;
      }
    }
    if (kit !== 'gloves') {
      let grip = hand;
      if (kit === 'pan' && shieldUp) grip = [27.2, 4.4];
      if (resting) grip = kit === 'pan' || kit === 'hammer' ? [shoulder[0] + 3.6, 1.5] : [shoulder[0] + 4.0, 1.0];
      if (!(kit === 'pillow' && (shieldUp || resting))) {
        box(ink, grip[0] - 0.95, grip[0] + 0.95, grip[1] - 0.95, grip[1] + 0.95);
        box(0xe5b087, grip[0] - 0.6, grip[0] + 0.6, grip[1] - 0.6, grip[1] + 0.6);
      }
    }
    const blocked = match.sides[1 - side].blocking;
    if (!(pose === 'thrust' || pose === 'lunge')) return;
    const spot = blocked ? [27.6, Math.min(Math.max(tip[1], 6.5), 13.5)] : [29.4, Math.min(Math.max(tip[1], 7.0), 12.5)];
    const spin = this.reducedMotion ? 0 : this.time;
    const star = (at, rOut, rIn, color, rot, outline, points = 8) => {
      const n = points * 2, ctx = this.ctx;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const r = k % 2 === 0 ? rOut * (points > 4 && k % 4 !== 0 ? 0.78 : 1) : rIn, ang = rot + k / n * 2 * Math.PI;
        const x = px(at[0] + Math.cos(ang) * r), y = py(at[1] + Math.sin(ang) * r);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = hex(color);
      ctx.fill();
      if (outline) { ctx.strokeStyle = 'rgb(20,23,41)'; ctx.lineWidth = c * 0.5; ctx.lineJoin = 'miter'; ctx.stroke(); }
    };
    if (blocked) {
      const phase = this.reducedMotion ? 0.5 : trunc(this.time * 3.5, 1);
      for (const grow of [phase, trunc(phase + 0.5, 1)]) {
        const rr = 2.0 + grow * 3.6;
        let prev = null;
        for (let k = 0; k <= 20; k++) {
          const ang = k / 20 * 2 * Math.PI, p = [spot[0] + Math.cos(ang) * rr, spot[1] + Math.sin(ang) * rr];
          if (prev) { line(ink, prev, p, 0.95); line(0x9ff0ff, prev, p, 0.5); }
          prev = p;
        }
      }
      if (kit === 'sword' || kit === 'pan' || kit === 'hammer') {
        for (let k = 0; k < 7; k++) {
          const ang = Math.PI + (k - 3) * 0.42 + Math.sin(spin * 9 + k) * 0.15, d1 = 3.2 + (k % 3) * 0.9;
          const a0 = [spot[0] + Math.cos(ang) * 1.2, spot[1] + Math.sin(ang) * 1.2], a1 = [spot[0] + Math.cos(ang) * d1, spot[1] + Math.sin(ang) * d1];
          line(ink, a0, a1, 1.0); line(0xfff3a0, a0, a1, 0.55);
        }
      }
      star(spot, 3.0, 0.8, 0xeafcff, 0, true, 4);
    } else if (kit === 'pillow') {
      for (let k = 0; k < 9; k++) {
        const ang = k * 0.7 + spin * 2, d = 1.8 + (k % 3) * 1.3, fx = spot[0] + Math.cos(ang) * d, fy = spot[1] + Math.sin(ang) * d;
        box(ink, fx - 0.65, fx + 0.85, fy - 0.4, fy + 0.5); box(0xffffff, fx - 0.45, fx + 0.65, fy - 0.2, fy + 0.3);
      }
    } else {
      star(spot, 4.6, 2.0, 0xffc83a, spin * 1.5, true);
      star(spot, 2.4, 1.1, 0xffffff, spin * 1.5 + 0.2, false);
    }
  }

  splash(place, x, y, t, cell) {
    if (t >= 0.85) return;
    const color = place === 'volcano' ? 0xffd65c : place === 'rooftops' ? 0xfff4dc : 0xe6f6ff;
    for (let i = 0; i < 10; i++) {
      const spread = (i - 4.5) * cell * 1.6, rise = Math.sin(t * Math.PI) * cell * (8 + (i * 5) % 7);
      this.fill(color, x + spread * (0.6 + t), y - rise, cell * 2, cell * 2, 1 - t);
    }
  }

  sprite(rows, x, y, size, colors) {
    const cell = size / Math.max(...rows.map(r => r.length));
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const color = colors[ch];
        if (color == null) return;
        this.fill(color, Math.round(x + c * cell), Math.round(y + r * cell), Math.ceil(cell), Math.ceil(cell));
      });
    });
  }

  /** The rival's "!" tell, in blocks. */
  bang(cx, y, c) {
    this.fill(0x14182a, cx - c * 1.5, y - c * 0.5, c * 3, c * 7);
    this.fill(0xffd65c, cx - c, y, c * 2, c * 4);
    this.fill(0xffd65c, cx - c, y + c * 5, c * 2, c * 1.5);
  }
}

