/* The 3D boards are built from voxels, the pixel art's cubes (the app's Qi/Scene3D/Voxels.swift):
   a model is a set of coloured cells that becomes one mesh with only the faces you can see,
   each corner darkened by the cells around it (ambient occlusion), so small models read as
   solid things. Also the deterministic noise every texture and model uses, and the little
   canvas helpers that paint the board faces. */
import * as THREE from './three.js?v=14';

const BIAS = 1024;
const key = (x, y, z) => (x + BIAS) + (y + BIAS) * 2048 + (z + BIAS) * 4194304;

export class VoxelModel {
  constructor() { this.cells = new Map(); }
  get size() { return this.cells.size; }
  get(x, y, z) { return this.cells.get(key(x, y, z)); }
  filled(x, y, z) { return this.cells.has(key(x, y, z)); }
  set(x, y, z, color) { this.cells.set(key(x, y, z), color); }

  /** A filled box, both corners included. */
  box(x0, y0, z0, x1, y1, z1, color) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, typeof color === 'function' ? color(x, y, z) : color);
  }

  /** A ball of radius `r` cells around a point (cell centres inside it are filled). */
  ball(c, r, color) {
    const r2 = r * r;
    for (let x = Math.floor(c[0] - r); x <= Math.ceil(c[0] + r); x++) {
      const dx = x + 0.5 - c[0];
      for (let y = Math.floor(c[1] - r); y <= Math.ceil(c[1] + r); y++) {
        const dy = y + 0.5 - c[1];
        for (let z = Math.floor(c[2] - r); z <= Math.ceil(c[2] + r); z++) {
          const dz = z + 0.5 - c[2];
          if (dx * dx + dy * dy + dz * dz <= r2) this.set(x, y, z, typeof color === 'function' ? color(x, y, z) : color);
        }
      }
    }
  }

  forEach(body) {
    for (const [k, v] of this.cells) {
      const x = (k % 2048) - BIAS, y = (Math.floor(k / 2048) % 2048) - BIAS, z = Math.floor(k / 4194304) - BIAS;
      body(x, y, z, v);
    }
  }

  /** One mesh for the whole model: `voxel` is a cell's edge in scene units. `glow` colours
      are drawn unlit (lantern windows, eyes) with a second material. */
  geometry(voxel, glow = new Set()) {
    if (!this.cells.size) return null;
    const positions = [], normals = [], colors = [], lit = [], glowing = [];
    let vertex = 0;
    this.forEach((x, y, z, color) => {
      const rgb = linear(color);
      for (const face of FACES) {
        const n = face.normal;
        if (this.filled(x + n[0], y + n[1], z + n[2])) continue;
        const ao = [];
        const axes = [0, 1, 2].filter((a) => n[a] === 0);
        const out = [x + n[0], y + n[1], z + n[2]];
        for (const corner of face.corners) {
          const s = axes.map((a) => { const d = [0, 0, 0]; d[a] = corner[a] === 1 ? 1 : -1; return d; });
          const s1 = this.filled(out[0] + s[0][0], out[1] + s[0][1], out[2] + s[0][2]);
          const s2 = this.filled(out[0] + s[1][0], out[1] + s[1][1], out[2] + s[1][2]);
          const s3 = this.filled(out[0] + s[0][0] + s[1][0], out[1] + s[0][1] + s[1][1], out[2] + s[0][2] + s[1][2]);
          const level = s1 && s2 ? 0 : 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0));
          ao.push(AO[level]);
          positions.push((x + corner[0]) * voxel, (y + corner[1]) * voxel, (z + corner[2]) * voxel);
          normals.push(n[0], n[1], n[2]);
        }
        const unlit = glow.has(color);
        for (let i = 0; i < 4; i++) { const k = unlit ? 1 : ao[i]; colors.push(rgb[0] * k, rgb[1] * k, rgb[2] * k); }
        // Split the quad along the diagonal that keeps the shading smooth.
        const v = vertex;
        const tri = ao[0] + ao[2] >= ao[1] + ao[3] ? [v, v + 1, v + 2, v, v + 2, v + 3] : [v, v + 1, v + 3, v + 1, v + 2, v + 3];
        (unlit ? glowing : lit).push(...tri);
        vertex += 4;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(lit.concat(glowing));
    g.clearGroups();
    if (lit.length) g.addGroup(0, lit.length, 0);
    if (glowing.length) g.addGroup(lit.length, glowing.length, 1);
    g.computeBoundingSphere();
    return g;
  }
}

const FACES = [
  { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO = [0.52, 0.7, 0.86, 1];

/** The voxel materials: matte with vertex colours, and the unlit one for glowing cells. */
export const VOXEL_MATERIALS = [
  new THREE.MeshLambertMaterial({ vertexColors: true }),
  new THREE.MeshBasicMaterial({ vertexColors: true }),
];
export function voxelMesh(model, voxel, glow) {
  const g = model.geometry(voxel, glow);
  if (!g) return null;
  const mesh = new THREE.Mesh(g, VOXEL_MATERIALS.map((m) => m.clone()));
  mesh.castShadow = true;
  return mesh;
}

/** sRGB hex to linear RGB (the renderer shades in linear space). */
export function linear(hex) {
  const f = (c) => { const v = (c & 0xff) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return [f(hex >> 16), f(hex >> 8), f(hex)];
}
export function color(hex) { return new THREE.Color().setHex(hex, THREE.SRGBColorSpace); }

// ── Noise ─────────────────────────────────────────────────────────────────────

/** Deterministic noise for textures and models, so every random-looking detail is
    correlated in space and the same board always looks the same, as in the app. */
const P32 = 4294967296;
export const Noise = {
  /** The app's hash exactly, though Swift wraps it in 64 bits: the 24 bits returned only need
      the sum's low 53 bits (the low word from imul, the rest from the sum, exact as a double),
      and the product's bits 32–39 come from the rounded double product. */
  hash(x, y, z = 0, seed = 0) {
    x |= 0; y |= 0; z |= 0; seed |= 0;
    const hi = Math.floor((x * 374761393 + y * 668265263 + z * 1442695041 + seed * 144665) / P32) & 0x1fffff;
    const lo = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041) + Math.imul(seed, 144665)) >>> 0;
    const glo = (lo ^ ((lo >>> 13) | (hi << 19))) >>> 0, ghi = (hi ^ (hi >>> 13)) & 0xff;      // h ^ (h >> 13)
    const pl = Math.imul(glo, 1274126177) >>> 0;                                               // times K
    const b = (Math.round((glo * 1274126177 - pl) / P32) + ghi * (1274126177 & 0xff)) & 0xff;
    return ((pl ^ ((pl >>> 16) | (b << 16))) & 0xffffff) / 0x1000000;                           // (p ^ p >> 16)
  },
  /** Value noise in [0, 1): smooth between integer lattice points. `period` makes it tile. */
  value(x, y, z = 0, seed = 0, period = 0) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = x - x0, fy = y - y0, fz = z - z0;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const h = (i, j, k) => (period > 0 ? Noise.hash(((i % period) + period) % period, ((j % period) + period) % period, k, seed) : Noise.hash(i, j, k, seed));
    const lerp = (a, b, t) => a + (b - a) * t;
    const a = lerp(lerp(h(x0, y0, z0), h(x0 + 1, y0, z0), ux), lerp(h(x0, y0 + 1, z0), h(x0 + 1, y0 + 1, z0), ux), uy);
    const b = lerp(lerp(h(x0, y0, z0 + 1), h(x0 + 1, y0, z0 + 1), ux), lerp(h(x0, y0 + 1, z0 + 1), h(x0 + 1, y0 + 1, z0 + 1), ux), uy);
    return lerp(a, b, uz);
  },
  /** Fractal value noise in [0, 1): big soft patches carrying smaller detail. */
  fbm(x, y, z = 0, octaves = 4, seed = 0, period = 0) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * Noise.value(x * freq, y * freq, z * freq, seed + o * 131, period > 0 ? period * freq : 0);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  },
};

// ── Painting textures ─────────────────────────────────────────────────────────

export function bitmap(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
const hexCss = (hex, alpha = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;
/** Fills a rectangle in top-left-origin pixel coordinates. */
export function fill(ctx, x, y, w, h, hex, alpha = 1) {
  ctx.fillStyle = hexCss(hex, alpha);
  ctx.fillRect(x, y, w, h);
}
export function texture(ctx, { repeat = null, nearest = true } = {}) {
  const t = new THREE.CanvasTexture(ctx.canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
