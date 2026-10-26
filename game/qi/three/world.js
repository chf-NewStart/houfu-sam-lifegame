/* What the 3D boards stand on (the app's Qi/Scene3D/Pond3D.swift and BoardTheme.swift): the
   stone slab on the pixel pond, a thick wooden board on a dark table, a grid floating on clear
   water, a brushed steel plate on tread plate, a raised garden bed on the pond, and a glass
   board among the stars; each board's face (a Go grid or chess squares) painted on its own
   surface; the lights; and the view that orbits it all. */
import * as THREE from './three.js?v=9';
import { VoxelModel, Noise, bitmap, fill, texture, color } from './voxels.js?v=9';

export const THEMES = {
  stone: { top: 0.3, background: 0x051113 },
  wood: { top: 0.62, background: 0x0e0906 },
  water: { top: 0.0, background: 0x051113 },
  steel: { top: 0.34, background: 0x0b0e10 },
  sky: { top: 0.3, background: 0x03040b },
  soil: { top: 0.3, background: 0x051113 },
};

// ── Water and slab ────────────────────────────────────────────────────────────

const waterCache = {};
/** Pixel water: the 2D pond's three water tones in soft patches, with wave dashes where the
    water is lightest. Tiles seamlessly. */
function waterTexture(clear) {
  if (waterCache[clear]) return waterCache[clear];
  const n = 96, seed = 7;
  const ctx = bitmap(n, n);
  const [dark, base, light] = clear ? [0x0f4f58, 0x16656d, 0x23808a] : [0x08272d, 0x0b3036, 0x124249];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = Noise.fbm(x / 12, y / 12, 0, 3, seed, n / 12);
      fill(ctx, x, y, 1, 1, v < 0.36 ? dark : (v > 0.62 ? light : base));
    }
  }
  let placed = 0, tries = 0;
  while (placed < n / 10 && tries < 4000) {
    tries++;
    const x = Math.floor(Noise.hash(tries, 1, 0, seed) * n), y = Math.floor(Noise.hash(tries, 2, 0, seed) * n);
    if (Noise.fbm(x / 12, y / 12, 0, 3, seed, n / 12) <= 0.6) continue;
    const len = 2 + Math.floor(Noise.hash(tries, 3, 0, seed) * 4);
    for (let i = 0; i < len; i++) fill(ctx, (x + i) % n, y, 1, 1, clear ? 0xbff3ec : 0x82c8c0, 0.55);
    placed++;
  }
  return (waterCache[clear] = ctx);
}

function plane(extent, tex, repeat, y, lit = true) {
  const t = texture(tex, { repeat });
  const m = lit ? new THREE.MeshLambertMaterial({ map: t }) : new THREE.MeshBasicMaterial({ map: t });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function water(extent, tile, clear = false) { return plane(extent, waterTexture(clear), extent / tile, 0); }

/** A slab `w` square with notched corners, its top `top` above the water, `thickness` deep,
    its upper face showing `face` (stretched over the whole slab). */
function slab(w, top, thickness, notch, face, side) {
  const shape = new THREE.Shape();
  const h = w / 2, n = notch;
  shape.moveTo(-h + n, -h);
  shape.lineTo(h - n, -h); shape.lineTo(h - n, -h + n); shape.lineTo(h, -h + n); shape.lineTo(h, h - n);
  shape.lineTo(h - n, h - n); shape.lineTo(h - n, h); shape.lineTo(-h + n, h); shape.lineTo(-h + n, h - n);
  shape.lineTo(-h, h - n); shape.lineTo(-h, -h + n); shape.lineTo(-h + n, -h + n);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // Map the face across the whole slab (the extrusion's UVs are in shape units).
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + h) / w, (pos.getY(i) + h) / w);
  const topMaterial = new THREE.MeshLambertMaterial({ map: texture(face) });
  const sideMaterial = new THREE.MeshLambertMaterial({ color: color(side) });
  const mesh = new THREE.Mesh(g, [topMaterial, sideMaterial]);
  // Extruded along +z with the shape facing +z: lay it face up. The shape's +y is the far edge,
  // where the texture's top row lands (row 0 = rank 8).
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = top - thickness;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  // ExtrudeGeometry: group 0 is the caps (front and back), group 1 the sides. The front cap at
  // z = depth faces up once laid down.
  return mesh;
}

/** Lighter and darker flecks in clusters, so stone reads as stone and not as a pattern. */
export function specks(ctx, n, seed, light = 0x70837d, dark = 0x455d59) {
  const clusters = Math.max(8, Math.floor(n * n / 2600));
  for (let k = 0; k < clusters; k++) {
    const cx = Noise.hash(k, 11, 0, seed) * n, cy = Noise.hash(k, 12, 0, seed) * n;
    const spread = 6 + 22 * Math.pow(Noise.hash(k, 13, 0, seed), 2);
    const count = 2 + Math.floor(Noise.hash(k, 14, 0, seed) * 9);
    for (let j = 0; j < count; j++) {
      const a = Noise.hash(k, j, 15, seed) * 2 * Math.PI, r = spread * Math.sqrt(Noise.hash(k, j, 16, seed));
      const x = Math.trunc(cx + Math.cos(a) * r), y = Math.trunc(cy + Math.sin(a) * r);
      const big = Noise.hash(k, j, 17, seed) < 0.25;
      fill(ctx, x, y, big ? 4 : 2 + Math.floor(Noise.hash(k, j, 18, seed) * 2), big ? 2 : 1, Noise.hash(k, j, 19, seed) < 0.55 ? light : dark);
    }
  }
}

// ── Board faces ───────────────────────────────────────────────────────────────

const INKS = { stone: [0x183e3d, 0x284f4b], wood: [0x2b1a0c, 0x2b1a0c], water: [0xc8f4ec, 0xe6fffa], steel: [0x2c3236, 0x2c3236], sky: [0x7fd6ff, 0xd8f3ff], soil: [0xc9b07a, 0xe2cc94] };
const SQUARES = { stone: [0x82978f, 0x566c66, 1], wood: [0xe2bf86, 0x8b5a33, 1], water: [0x9fe3dc, 0x2f7f86, 0.45], steel: [0xaab2b7, 0x5c656b, 1], sky: [0x26325e, 0x0d1430, 0.9], soil: [0x8a6a48, 0x4a3424, 1] };

/** The bare surface: stone, kaya grain, clear water, brushed steel, loam or dark glass with
    faint stars. `tint` gives a neutral version to overlay on chess squares. */
function surface(theme, ctx, n, tint = false) {
  switch (theme) {
    case 'wood':
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x += 2) {
          const g = Noise.fbm(x / 220, y / 7, 0, 3, 41);
          const fine = Noise.value(x / 40, y / 1.6, 0, 42);
          let c = g > 0.6 ? 0xe6bd74 : (g < 0.38 ? 0xcb9750 : 0xdcae63);
          if (fine > 0.84) c = 0xb78543;
          if (tint) c = g > 0.5 ? 0xffffff : 0x808080;
          fill(ctx, x, y, 2, 1, c);
        }
      }
      break;
    case 'water':
      if (tint) fill(ctx, 0, 0, n, n, 0x808080);
      break;
    case 'steel':
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x += 4) {
          const g = Noise.fbm(x / 160, y / 1.2, 0, 2, 51);
          let c = g > 0.62 ? 0xa3acb2 : (g < 0.38 ? 0x7e868c : 0x8d969c);
          if (tint) c = g > 0.5 ? 0xffffff : 0x909090;
          fill(ctx, x, y, 4, 1, c);
        }
      }
      break;
    case 'soil':
      for (let y = 0; y < n; y += 2) {
        for (let x = 0; x < n; x += 2) {
          const v = Noise.fbm(x / 18, y / 18, 0, 4, 3);
          let c = v < 0.4 ? 0x2f2219 : (v > 0.62 ? 0x4a3626 : 0x3a2a1f);
          if (tint) c = v > 0.5 ? 0xffffff : 0x808080;
          fill(ctx, x, y, 2, 2, c);
        }
      }
      if (!tint) specks(ctx, n, 9, 0x5a4430, 0x251a13);
      break;
    case 'sky':
      fill(ctx, 0, 0, n, n, tint ? 0x808080 : 0x0b1026);
      if (tint) break;
      for (let y = 0; y < n; y += 4) {
        for (let x = 0; x < n; x += 4) {
          const v = Noise.fbm(x / 160, y / 160, 0, 4, 61);
          if (v > 0.58) fill(ctx, x, y, 4, 4, v > 0.66 ? 0x2a2463 : 0x1a1d4a, 0.8);
        }
      }
      stars(ctx, n, n, Math.floor(n * n / 900), 62);
      break;
    default:
      fill(ctx, 0, 0, n, n, 0x5b716c);
      specks(ctx, n, n);
  }
}

/** The Go/Gomoku face: the grid and the star points on this theme's surface. */
export function goFace(theme, size, margin, stars, cellPixels = 40) {
  const span = size - 1 + 2 * margin;
  const n = Math.round(span * cellPixels);
  if (theme === 'soil') return field(size, margin, stars, cellPixels);
  const ctx = bitmap(n, n);
  if (theme === 'stone') { fill(ctx, 0, 0, n, n, 0x5b716c); specks(ctx, n, size); } else surface(theme, ctx, n);
  const [line, star] = INKS[theme];
  const alpha = theme === 'water' ? 0.75 : (theme === 'sky' ? 0.9 : 1);
  const at = (i) => Math.round((margin + i) * cellPixels);
  const w = Math.max(2, Math.floor(cellPixels / 16));
  for (let i = 0; i < size; i++) {
    fill(ctx, at(0) - w / 2, at(i) - w / 2, at(size - 1) - at(0) + w, w, line, alpha);
    fill(ctx, at(i) - w / 2, at(0) - w / 2, w, at(size - 1) - at(0) + w, line, alpha);
  }
  const r = Math.max(3, Math.floor(cellPixels / 7));
  for (const [row, col] of stars) fill(ctx, at(col) - r, at(row) - r, r * 2, r * 2, star);
  return ctx;
}

/** The garden's face as a tilled field: the rows of earth between the lines gently ridged, lit
    on the side towards the light, the lines dug in as furrows (a dark trench with a lit lip),
    the cross lines shallower, and the star points small mounds. Calm enough that the
    tomatoes and cucumbers stand out. */
function field(size, margin, stars, cellPixels) {
  const span = size - 1 + 2 * margin;
  const n = Math.round(span * cellPixels);
  const ctx = bitmap(n, n);
  const at = (i) => Math.round((margin + i) * cellPixels);
  const shade = (c, k) => {
    const ch = (s) => Math.min(255, Math.max(0, Math.trunc(((c >> s) & 0xff) * k))) << s;
    return ch(16) | ch(8) | ch(0);
  };
  for (let y = 0; y < n; y += 2) {
    // Across a row of earth: rising from one furrow, falling to the next.
    const u = y / cellPixels - margin;
    const f = u - Math.floor(u);
    const ridge = 0.94 + 0.12 * Math.cos((f - 0.35) * 2 * Math.PI);
    for (let x = 0; x < n; x += 2) {
      const v = Noise.fbm(x / 26, y / 14, 0, 3, 3);
      const base = v < 0.42 ? 0x352619 : (v > 0.6 ? 0x41301f : 0x3b2b1c);
      fill(ctx, x, y, 2, 2, shade(base, ridge));
    }
  }
  specks(ctx, n, 9, 0x4d3a28, 0x2a1e14);
  const w = Math.max(3, Math.trunc(cellPixels / 10));
  for (let i = 0; i < size; i++) {
    const y = at(i), x = at(i);
    // Along the rows: the deeper furrows. Across them: shallow grooves.
    fill(ctx, at(0) - Math.trunc(w / 2), y - Math.trunc(w / 2), at(size - 1) - at(0) + w, w, 0x1a120b);
    fill(ctx, at(0) - Math.trunc(w / 2), y + Math.trunc(w / 2), at(size - 1) - at(0) + w, 2, 0x5e4630);
    fill(ctx, x - Math.trunc(w / 3), at(0) - Math.trunc(w / 2), Math.max(2, Math.trunc(w * 2 / 3)), at(size - 1) - at(0) + w, 0x170f09);
  }
  const r = Math.max(3, Math.trunc(cellPixels / 8));
  for (const [row, col] of stars) {
    fill(ctx, at(col) - r, at(row) - r, r * 2, r * 2, 0x5e4630);
    fill(ctx, at(col) - Math.trunc(r / 2), at(row) - Math.trunc(r / 2), r, r, 0x77593c);
  }
  return ctx;
}

/** The chess face: light and dark squares on this theme's surface. */
export function chessFace(theme, margin, squarePixels = 48) {
  const span = 8 + 2 * margin;
  const n = Math.round(span * squarePixels);
  const ctx = bitmap(n, n);
  const at = (i) => Math.round((margin + i) * squarePixels);
  if (theme === 'stone') {
    fill(ctx, 0, 0, n, n, 0x5b716c);
    specks(ctx, n, 64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) fill(ctx, at(c), at(r), at(c + 1) - at(c), at(r + 1) - at(r), (r + c) & 1 ? 0x566c66 : 0x82978f);
    for (let k = 0; k < Math.floor(n * n / 900); k++) {
      const x = Math.floor(Noise.hash(k, 1, 0, 65) * n), y = Math.floor(Noise.hash(k, 2, 0, 65) * n);
      const fx = x / squarePixels - margin, fy = y / squarePixels - margin;
      if (fx < 0 || fy < 0 || fx >= 8 || fy >= 8) continue;
      if (Noise.value(x / 40, y / 40, 0, 66) < 0.45) continue;
      const dark = (Math.floor(fx) + Math.floor(fy)) & 1;
      fill(ctx, x, y, 2 + (k % 3), 1 + (k % 2), dark ? 0x6c827b : 0x91a59e);
    }
    return ctx;
  }
  surface(theme, ctx, n);
  const [light, dark, alpha] = SQUARES[theme];
  const tint = bitmap(n, n);
  surface(theme, tint, n, true);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = at(c), y = at(r), w = at(c + 1) - at(c), h = at(r + 1) - at(r);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.globalAlpha = alpha;
      fill(ctx, x, y, w, h, (r + c) & 1 ? dark : light);
      ctx.globalAlpha = 0.22;
      ctx.globalCompositeOperation = 'overlay';
      ctx.drawImage(tint.canvas, 0, 0);
      ctx.restore();
    }
  }
  if (theme === 'sky') {
    for (let i = 0; i <= 8; i++) {
      fill(ctx, at(0), at(i) - 1, at(8) - at(0), 2, 0x7fd6ff, 0.55);
      fill(ctx, at(i) - 1, at(0), 2, at(8) - at(0), 0x7fd6ff, 0.55);
    }
  }
  return ctx;
}

// ── Other textures ────────────────────────────────────────────────────────────

function stars(ctx, w, h, count, seed) {
  const clusters = Math.max(6, Math.floor(count / 14));
  for (let k = 0; k < clusters; k++) {
    const cx = Noise.hash(k, 1, 0, seed) * w, cy = Noise.hash(k, 2, 0, seed) * h;
    const spread = 8 + 60 * Math.pow(Noise.hash(k, 3, 0, seed), 2);
    const many = 3 + Math.floor(Noise.hash(k, 4, 0, seed) * 22);
    for (let j = 0; j < many; j++) {
      const a = Noise.hash(k, j, 5, seed) * 2 * Math.PI, r = spread * Math.sqrt(Noise.hash(k, j, 6, seed));
      const x = Math.trunc(cx + Math.cos(a) * r), y = Math.trunc(cy + Math.sin(a) * r);
      const b = Noise.hash(k, j, 7, seed);
      const c = b < 0.12 ? 0xffe9b8 : (b < 0.24 ? 0xb8d8ff : 0xf2f6ff);
      const big = b > 0.95;
      fill(ctx, x, y, big ? 2 : 1, big ? 2 : 1, c, 0.35 + 0.65 * Noise.hash(k, j, 8, seed));
    }
  }
}

let starfieldCtx = null;
function starfield() {
  if (starfieldCtx) return starfieldCtx;
  const w = 1024, h = 640;
  const ctx = bitmap(w, h);
  fill(ctx, 0, 0, w, h, 0x03040b);
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const v = Noise.fbm(x / 260, y / 200, 0, 4, 71);
      if (v > 0.6) fill(ctx, x, y, 4, 4, v > 0.68 ? 0x1c1748 : 0x10122e, 0.9);
    }
  }
  stars(ctx, w, h, 900, 72);
  return (starfieldCtx = ctx);
}

function nebulaImage() {
  const n = 256;
  const ctx = bitmap(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x - n / 2) / (n / 2), dy = (y - n / 2) / (n / 2);
      const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const v = Noise.fbm(x / 40, y / 40, 0, 4, 81) * fall;
      if (v <= 0.12) continue;
      fill(ctx, x, y, 1, 1, v > 0.4 ? 0x4b3a9a : (v > 0.26 ? 0x253a7a : 0x152450), Math.min(1, v * 1.6));
    }
  }
  return ctx;
}

/** A dark walnut table: planks of slightly different tone with fine grain and seams. */
function planks() {
  const n = 256, plank = 32;
  const ctx = bitmap(n, n);
  for (let y = 0; y < n; y++) {
    const row = Math.floor(y / plank);
    const tone = Noise.hash(row, 0, 0, 91);
    for (let x = 0; x < n; x++) {
      const g = Noise.fbm(x / 70 + row * 13, y / 3, 0, 3, 92);
      let c = tone > 0.5 ? 0x33231a : 0x2a1c14;
      if (g > 0.62) c = tone > 0.5 ? 0x3d2a1e : 0x332318;
      if (g < 0.34) c = 0x22160f;
      if (y % plank === 0) c = 0x120b07;
      fill(ctx, x, y, 1, 1, c);
    }
  }
  return ctx;
}

/** Diamond tread plate under the steel board. */
function treadPlate() {
  const n = 64;
  const ctx = bitmap(n, n);
  fill(ctx, 0, 0, n, n, 0x1a1f23);
  for (const [cx, cy, s] of [[16, 16, 1], [48, 48, 1], [48, 16, -1], [16, 48, -1]]) {
    for (let k = -6; k <= 6; k++) {
      fill(ctx, cx + k, cy + s * k, 2, 2, 0x30373c);
      fill(ctx, cx + k + (s > 0 ? 1 : 0), cy + s * k, 1, 1, 0x464f55);
    }
  }
  return ctx;
}

// ── Building a board ──────────────────────────────────────────────────────────

/** Puts the surroundings, the board (its face showing `face`) and the lights in `root`;
    sets the scene's background. `span` is the board's width. */
export function buildBoard(theme, root, scene, span, face) {
  const top = THEMES[theme].top;
  scene.background = theme === 'sky' ? texture(starfield(), { nearest: true }) : color(THEMES[theme].background);
  if (theme === 'sky') scene.background.colorSpace = THREE.SRGBColorSpace;
  switch (theme) {
    case 'wood':
      root.add(plane(span * 6, planks(), (span * 6) / (span * 0.9), -0.02));
      root.add(slab(span, top, top + 0.02, 0, face, 0x9a6532));
      break;
    case 'water': {
      root.add(water(span * 6, span * 0.75, true));
      const grid = new THREE.Mesh(new THREE.PlaneGeometry(span, span),
        new THREE.MeshBasicMaterial({ map: texture(face), transparent: true, depthWrite: false }));
      grid.rotation.x = -Math.PI / 2;
      grid.position.y = 0.012;
      grid.renderOrder = 10;
      root.add(grid);
      break;
    }
    case 'steel': {
      root.add(plane(span * 6, treadPlate(), (span * 6) / (span * 0.35), -0.02));
      const s = slab(span, top, top + 0.02, span / 40, face, 0x50585e);
      s.material[0] = new THREE.MeshPhongMaterial({ map: s.material[0].map, specular: new THREE.Color(0.55, 0.55, 0.55), shininess: 40 });
      root.add(s);
      break;
    }
    case 'soil':
      // A raised bed of soil in a timber frame, floating on the pond like a 架田.
      root.add(water(span * 6, span));
      root.add(slab(span, top, 0.55, 0, face, 0x6b4a2e));
      break;
    case 'sky': {
      const s = slab(span, top, 0.2, span / 48, face, 0x141b3a);
      s.material[0] = new THREE.MeshBasicMaterial({ map: s.material[0].map });
      s.material[1].transparent = true;
      s.material[1].opacity = 0.85;
      root.add(s);
      const neb = new THREE.Mesh(new THREE.PlaneGeometry(span * 2.6, span * 2.6),
        new THREE.MeshBasicMaterial({ map: texture(nebulaImage(), { nearest: false }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      neb.rotation.x = -Math.PI / 2;
      neb.position.y = -0.6;
      root.add(neb);
      break;
    }
    default:
      root.add(water(span * 6, span));
      root.add(slab(span, top, 0.55, span / 48, face, 0x455d59));
  }
  addLights(root, span, theme);
}

/** A warm key light from the front left (the pixel art's light comes from the top left),
    casting crisp shadows, and a cool teal fill. */
function addLights(root, extent, theme) {
  const keyColor = { soil: 0xfff0d6, wood: 0xffe2bd, steel: 0xf4f7ff, sky: 0xcfe0ff }[theme] || 0xfff1dc;
  const fillColor = { wood: 0x8a7766, steel: 0x8b98a3, sky: 0x5a6aa8 }[theme] || 0x86a9a2;
  const fillI = { wood: 0.38, steel: 0.40, sky: 0.47 }[theme] || 0.42;
  const key = new THREE.DirectionalLight(color(keyColor), (theme === 'sky' ? 0.95 : 1.05) * Math.PI);
  key.position.set(-0.55, 1.0, 0.45).normalize().multiplyScalar(extent * 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const s = extent * 0.75;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: extent * 4 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 2;
  root.add(key);
  root.add(key.target);
  root.add(new THREE.AmbientLight(color(fillColor), fillI * Math.PI));
}

// ── Stones as voxels ──────────────────────────────────────────────────────────

/** The black river pebble, 16 to a cell: a flattened, slightly lopsided lens with the 2D
    pebble's light facet on its upper left and a pale fleck. */
export function pebble(seed = 1) {
  const v = new VoxelModel();
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      const ang = Math.atan2(z, x);
      const wobble = 1 + 0.07 * Math.sin(ang * 3 + seed) + 0.04 * Math.cos(ang * 5 - 1.3);
      const rr = (x + 0.5) * (x + 0.5) / (7.4 * 7.4) + (z + 0.5) * (z + 0.5) / (6.9 * 6.9);
      const r = Math.sqrt(rr) / wobble;
      if (r > 1) continue;
      const h = Math.round(3.6 * Math.sqrt(Math.max(0, 1 - r * r))) + 1;
      for (let y = 0; y < h; y++) {
        let c = 0x101917;
        if (y === h - 1) {
          const facing = -x * 0.6 - z * 0.8;
          const patch = Noise.value(x / 3.5, z / 3.5, 0, seed);
          if (facing > 1.2 && patch > 0.35) c = 0x52645e;
          else if (facing < -2.5 && patch < 0.6) c = 0x283832;
          if (x === -4 && z === -3) c = 0x829b92;
        } else if (y === 0) c = 0x0b120f;
        v.set(x, y, z, c);
      }
    }
  }
  return v;
}

/** The cream scallop shell: a low dome with ribs fanning from the hinge, a pale highlight
    and a blush, like the 2D shell. */
export function shell(seed = 2) {
  const v = new VoxelModel();
  const hx = 0.5, hz = 7.5;
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) {
      const px = x + 0.5, pz = z + 0.5;
      const narrowing = pz > 2 ? 1 - (pz - 2) * 0.075 : 1;
      const rr = (px * px) / (7.4 * 7.4 * narrowing * narrowing) + (pz * pz) / (7.2 * 7.2);
      if (rr > 1) continue;
      const r = Math.sqrt(rr);
      const h = Math.round(3.2 * Math.sqrt(Math.max(0, 1 - r * r))) + 1;
      const ang = Math.atan2(px - hx, hz - pz);
      const rib = Math.abs(Math.sin(ang * 7.5)) > 0.86;
      for (let y = 0; y < h; y++) {
        let c = 0xeadfc6;
        if (y === h - 1) {
          if (rib) c = 0xa58e68;
          else if (px < -2 && pz < -1 && Noise.value(px / 3, pz / 3, 0, seed) > 0.45) c = 0xfff6df;
          else if (px > 2 && pz < 1 && Noise.value(px / 3, pz / 3, 0, seed + 1) > 0.62) c = 0xe7cbbb;
        } else if (y === 0) c = 0xcdb894;
        else if (rib) c = 0xd6c6a2;
        v.set(x, y, z, c);
      }
    }
  }
  v.box(-3, 0, 6, 3, 1, 7, 0xb59c74);
  return v;
}

// ── Rings ─────────────────────────────────────────────────────────────────────

const glowCache = new Map();
export function glow(hex) {
  if (!glowCache.has(hex)) glowCache.set(hex, new THREE.MeshBasicMaterial({ color: color(hex) }));
  return glowCache.get(hex);
}
export function matte(hex) { return new THREE.MeshLambertMaterial({ color: color(hex) }); }

/** A flat round ring (round like a ripple on water; an octagon on a board reads as the 八卦). */
export function ring(radius, width, hex, opacity = 1) {
  const g = new THREE.RingGeometry(Math.max(0.001, radius - width / 2), radius + width / 2, 72);
  const m = new THREE.MeshBasicMaterial({ color: color(hex), transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ── The view: a renderer, a camera at the player's seat, orbit, pinch, tap ────

/** One finger (or the mouse) turns the table and tips it, a pinch or the wheel goes closer or
    further, a double tap goes back to the player's seat. A tap reports the point on the board's
    surface under it, and the object touched. Renders only while something moves. */
export class BoardView {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'board3d-canvas';
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.3, 200);
    this.home = { azimuth: 0, elevation: 54, distance: 20 };
    this.orbit = { ...this.home };
    this.target = new THREE.Vector3(0, 0.3, 0);
    this.surfaceY = 0.3;
    this.scene = null;
    this.onTap = null;
    this.tapTargets = null;
    this.interactive = true;
    this.animators = new Set();
    this.frame = 0;
    this.pointers = new Map();
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.pinch = null; });
    c.addEventListener('wheel', (e) => {
      if (!this.interactive) return;
      e.preventDefault();
      this.glide = null;
      this.orbit.distance = Math.min(this.home.distance * 1.6, Math.max(this.home.distance * 0.45, this.orbit.distance * Math.exp(e.deltaY * 0.0015)));
      this.place();
    }, { passive: false });
    c.addEventListener('dblclick', () => { if (this.interactive) this.glideTo(this.home, 500); });
    c.addEventListener('webglcontextlost', (e) => e.preventDefault());
  }

  attach(container) {
    if (this.container === container) return;
    this.container = container;
    container.appendChild(this.canvas);
    if (this.ro) this.ro.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  resize() {
    if (!this.container) return;
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    // The app frames the board for a wide window; in a squarer or taller one, widen the view
    // until the board's width fits as it would there.
    const a = w / h;
    this.camera.fov = a < 1.1 ? 2 * Math.atan(Math.tan(15 * Math.PI / 180) * 1.1 / a) * 180 / Math.PI : 30;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  setHome(orbit, animated) {
    const same = this.home.azimuth === orbit.azimuth && this.home.elevation === orbit.elevation && this.home.distance === orbit.distance;
    this.home = { ...orbit };
    if (same) return;
    if (animated) this.glideTo(orbit, 900); else { this.orbit = { ...orbit }; this.place(); }
  }

  place() {
    const e = this.orbit.elevation * Math.PI / 180, a = this.orbit.azimuth * Math.PI / 180;
    this.camera.position.set(
      this.target.x + Math.sin(a) * Math.cos(e) * this.orbit.distance,
      this.target.y + Math.sin(e) * this.orbit.distance,
      this.target.z + Math.cos(a) * Math.cos(e) * this.orbit.distance);
    this.camera.lookAt(this.target);
    this.render();
  }

  glideTo(end, ms) {
    const to = { ...end };
    while (to.azimuth - this.orbit.azimuth > 180) to.azimuth -= 360;
    while (to.azimuth - this.orbit.azimuth < -180) to.azimuth += 360;
    const from = { ...this.orbit }, start = performance.now();
    this.animate((now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.orbit = { azimuth: from.azimuth + (to.azimuth - from.azimuth) * e, elevation: from.elevation + (to.elevation - from.elevation) * e,
        distance: from.distance + (to.distance - from.distance) * e };
      this.place();
      return t < 1;
    });
  }

  /** Runs `step(now)` every frame until it returns false, rendering each frame. */
  animate(step) {
    this.animators.add(step);
    if (this.frame) return;
    const tick = (now) => {
      for (const s of [...this.animators]) if (!s(now)) this.animators.delete(s);
      this.renderer.render(this.scene, this.camera);
      this.frame = this.animators.size ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }

  render() { if (this.scene && !this.frame) this.renderer.render(this.scene, this.camera); }

  // Gestures

  down(e) {
    if (!this.interactive) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() });
    this.glide = null;
    if (this.pointers.size === 1) this.drag = { orbit: { ...this.orbit }, moved: false };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), distance: this.orbit.distance };
      this.drag = null;
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.orbit.distance = Math.min(this.home.distance * 1.6, Math.max(this.home.distance * 0.45, this.pinch.distance * this.pinch.d / Math.max(10, d)));
      this.place();
    } else if (this.drag) {
      const dx = p.x - p.x0, dy = p.y - p.y0;
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        this.orbit.azimuth = this.drag.orbit.azimuth - dx * 0.35;
        this.orbit.elevation = Math.min(88, Math.max(24, this.drag.orbit.elevation + dy * 0.25));
        this.place();
      }
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p) return;
    const tap = this.drag && !this.drag.moved && performance.now() - p.t < 600;
    this.drag = null;
    if (!tap || !this.onTap) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let hitName = null;
    if (this.tapTargets) {
      const hit = ray.intersectObjects(this.tapTargets.children, true)[0];
      for (let o = hit && hit.object; o; o = o.parent) if (o.name && o.name.startsWith('piece:')) { hitName = o.name; break; }
    }
    const surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.surfaceY);
    const point = new THREE.Vector3();
    if (ray.ray.intersectPlane(surface, point) || hitName) this.onTap(point, hitName);
  }

  dispose() { cancelAnimationFrame(this.frame); if (this.ro) this.ro.disconnect(); this.renderer.dispose(); this.canvas.remove(); }
}
