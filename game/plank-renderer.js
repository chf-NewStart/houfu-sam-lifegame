const STARS = Array.from({ length: 85 }, (_, i) => ({
  x: Math.sin(i * 127.1) * .5 + .5,
  y: Math.sin(i * 311.7) * .5 + .5,
  size: i % 5 === 0 ? 1.6 : .8,
}));
const PILOTS = [
  { ship: '#9ceae2', glow: '#83e5de', exhaust: '#419d9c', seam: '#2a6e73' },
  { ship: '#d9c5ff', glow: '#c4a3ff', exhaust: '#8263b5', seam: '#685087' },
];

// Return a source rectangle in video pixels, preserving the destination aspect
// ratio even when a face is near an edge or the input video is not square.
export function calculateFaceCrop(face, videoWidth, videoHeight, targetWidth, targetHeight) {
  const bounds = face?.bounds;
  if (!bounds || ![videoWidth, videoHeight, targetWidth, targetHeight, bounds.width, bounds.height]
    .every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return null;
  const aspect = targetWidth / targetHeight;
  const faceWidth = bounds.width * videoWidth, faceHeight = bounds.height * videoHeight;
  let width = Math.max(faceWidth * 1.65, faceHeight * 1.65 * aspect);
  let height = width / aspect;
  const fit = Math.min(1, videoWidth / width, videoHeight / height);
  width *= fit; height *= fit;
  const centerX = (bounds.x + bounds.width * .5) * videoWidth;
  const centerY = (bounds.y + bounds.height * .45) * videoHeight;
  return {
    x: Math.max(0, Math.min(videoWidth - width, centerX - width / 2)),
    y: Math.max(0, Math.min(videoHeight - height, centerY - height / 2)),
    width, height,
  };
}

// Rendering never advances a Flight or changes its controls. Each pilot owns a
// clipped arena, including stars, incoming barriers, ship, and impact effects.
export class PlankRenderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;
    this.width = 1;
    this.height = 1;
    this.visualTime = 0;
    this.shipXs = [];
    this.faceCrops = [];
    this.videoSize = '';
    this.layout = '';
  }

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
    const scale = Math.max(1, Math.min(2, Number(dpr) || 1));
    this.canvas.width = Math.round(this.width * scale);
    this.canvas.height = Math.round(this.height * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.layout = '';
  }

  draw({ dt = 0, phase = 'setup', mode = 'face', players = 1, games = [], duration = 30, hitGlows = [],
    video = null, faces = [], cameraActive = false, cameraOpacity = .55 } = {}) {
    const ctx = this.ctx;
    const count = players === 2 ? 2 : 1;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
    const inFlight = !!games[0] && !['setup', 'framing', 'starting'].includes(phase);
    const layout = `${this.width}:${this.height}:${count}:${inFlight}`;
    if (layout !== this.layout) { this.shipXs = []; this.faceCrops = []; this.layout = layout; }
    const videoSize = video ? `${video.videoWidth}:${video.videoHeight}` : '';
    // Camera resolution can change independently of the canvas after rotation.
    // Pixel coordinates from the previous video must never enter the new crop.
    if (videoSize !== this.videoSize) { this.faceCrops = []; this.videoSize = videoSize; }
    if (!this.reducedMotion && !['paused', 'tracking'].includes(phase)) this.visualTime += step;
    ctx.fillStyle = '#080f1b';
    ctx.fillRect(0, 0, this.width, this.height);
    for (let pilot = 0; pilot < count; pilot++) {
      const arenaWidth = this.width / count;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pilot * arenaWidth, 0, arenaWidth, this.height);
      ctx.clip();
      ctx.translate(pilot * arenaWidth, 0);
      this.drawArena({ pilot, width: arenaWidth, split: count === 2,
        game: games[pilot], inFlight, mode, duration, dt: step, hitGlow: hitGlows[pilot] || 0,
        video: cameraActive ? video : null, face: faces[pilot], cameraOpacity });
      ctx.restore();
    }
    if (count === 2) {
      ctx.fillStyle = '#070c16';
      ctx.fillRect(this.width / 2 - 3, 0, 6, this.height);
      ctx.fillStyle = '#466170';
      ctx.fillRect(this.width / 2 - .5, 0, 1, this.height);
    }
  }

  drawArena({ pilot, width, split, game, inFlight, mode, duration, dt, hitGlow, video, face, cameraOpacity }) {
    const ctx = this.ctx, height = this.height, palette = PILOTS[pilot];
    const compact = this.width > height && height < 520;
    const cx = !split && !inFlight && width > 799 ? width * .72 : width * .5;
    const horizon = compact ? Math.max(60, height * .17) : height * .22;
    const shipY = height * (compact ? .66 : mode === 'practice' && inFlight ? .69 : .76);
    const spread = Math.min(width * (split ? .32 : .28), 240);
    const glow = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, height * .7);
    glow.addColorStop(0, pilot ? '#26213e' : '#123542');
    glow.addColorStop(.45, '#0c1c2c');
    glow.addColorStop(1, '#080f1b');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    const liveFace = this.drawCamera(video, face, pilot, width, height, cameraOpacity, dt);
    for (const star of STARS) {
      ctx.globalAlpha = (liveFace ? .1 : .25) + star.size * (liveFace ? .08 : .22);
      ctx.fillStyle = '#b8d3df';
      const y = (star.y * height + this.visualTime * star.size * 7) % height;
      ctx.fillRect(star.x * width, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pilot ? '#413653' : '#244956';
    ctx.lineWidth = 1;
    for (const side of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 12, horizon);
      ctx.lineTo(cx + side * spread * 1.7, height + 30);
      ctx.stroke();
    }
    for (let i = 0; i < 11; i++) {
      const z = ((i / 11 + this.visualTime * .07) % 1) ** 2;
      const y = horizon + z * (height - horizon);
      ctx.globalAlpha = .1 + z * .26;
      ctx.beginPath();
      ctx.moveTo(cx - spread * 1.7 * z, y);
      ctx.lineTo(cx + spread * 1.7 * z, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.drawPlanet(cx, horizon - 8, compact ? 12 : Math.min(24, width * .07));
    const gates = game && inFlight
      ? game.gates.map(gate => ({ ...gate, p: (game.elapsed - gate.born) / (gate.arrival - gate.born) }))
      : [{ lane: pilot ? 1 : 0, p: .55 }, { lane: pilot ? 0 : 1, p: .84 }];
    for (const gate of gates) {
      const z = Math.max(0, gate.p) ** 1.7;
      const y = horizon + (shipY - horizon) * z;
      if (y > height + 50) continue;
      const direction = gate.lane === 0 ? -1 : 1;
      const x = cx + direction * spread * .56 * z;
      const gateWidth = Math.max(5, spread * .92 * z), gateHeight = Math.max(3, 18 * z);
      ctx.globalAlpha = gate.resolved ? .3 : .45 + Math.min(1, z) * .55;
      ctx.fillStyle = '#351d27';
      ctx.strokeStyle = '#fa8d79';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - gateWidth / 2, y - gateHeight / 2, gateWidth, gateHeight, 3);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 5 * z, y - 4 * z); ctx.lineTo(x + 5 * z, y + 4 * z);
      ctx.moveTo(x + 5 * z, y - 4 * z); ctx.lineTo(x - 5 * z, y + 4 * z);
      ctx.stroke();
      if (gate.p < .25 && inFlight) {
        ctx.globalAlpha = .75; ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = '#faab98';
        ctx.fillText('!', cx + direction * spread * .56, shipY + 34);
      }
    }
    ctx.globalAlpha = 1;
    const lane = game && inFlight ? game.lane : pilot ? 0 : 1;
    const target = cx + (lane === 0 ? -1 : 1) * spread * .56;
    this.shipXs[pilot] ??= target;
    this.shipXs[pilot] += (target - this.shipXs[pilot]) * (this.reducedMotion ? 1 : Math.min(1, dt * 14));
    const size = Math.min(25, width * .065, height * .075);
    this.drawShip(this.shipXs[pilot], shipY, size, target, palette);
    if (game && inFlight) {
      const progress = Math.max(0, Math.min(1, game.elapsed / Math.max(1, duration)));
      ctx.fillStyle = '#1f3e48'; ctx.fillRect(0, height - 3, width, 3);
      ctx.fillStyle = palette.glow; ctx.fillRect(0, height - 3, width * progress, 3);
    }
    if (hitGlow > 0 && !this.reducedMotion) {
      ctx.fillStyle = `rgba(250,141,121,${Math.min(1, hitGlow) * .16})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  drawCamera(video, face, pilot, width, height, opacity, dt) {
    const crop = video && video.readyState >= 2
      ? calculateFaceCrop(face, video.videoWidth, video.videoHeight, width, height) : null;
    if (!crop) { this.faceCrops[pilot] = null; return false; }
    const previous = this.faceCrops[pilot];
    const smoothing = Math.min(1, dt * 8);
    if (previous) for (const key of ['x', 'y', 'width', 'height']) crop[key] = previous[key] + (crop[key] - previous[key]) * smoothing;
    this.faceCrops[pilot] = crop;
    const ctx = this.ctx;
    ctx.save();
    try {
      ctx.translate(width, 0); ctx.scale(-1, 1);
      ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    } catch {
      // A camera can stop between the readiness check and this animation frame.
      this.faceCrops[pilot] = null;
      return false;
    } finally { ctx.restore(); }
    ctx.fillStyle = `rgba(8,15,27,${1 - Math.max(0, Math.min(1, opacity))})`;
    ctx.fillRect(0, 0, width, height);
    return true;
  }

  drawPlanet(x, y, radius) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#426675';
    ctx.beginPath(); ctx.ellipse(x, y, radius * 2.25, radius * .58, -.3, 0, Math.PI * 2); ctx.stroke();
    const planet = ctx.createRadialGradient(x - radius * .37, y - radius * .5, 1, x, y, radius);
    planet.addColorStop(0, '#679196'); planet.addColorStop(1, '#172c3a');
    ctx.fillStyle = planet;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  drawShip(x, y, size, target, palette) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    if (!this.reducedMotion) ctx.rotate(Math.max(-.22, Math.min(.22, (target - x) * .008)));
    ctx.fillStyle = palette.exhaust;
    ctx.beginPath(); ctx.moveTo(-size * .25, size * .5);
    ctx.lineTo(0, size * (1.4 + Math.sin(this.visualTime * 18) * .1));
    ctx.lineTo(size * .25, size * .5); ctx.fill();
    ctx.shadowColor = palette.glow; ctx.shadowBlur = 16; ctx.fillStyle = palette.ship;
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .8, size * .8);
    ctx.lineTo(0, size * .35); ctx.lineTo(-size * .8, size * .8); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = palette.seam; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -size * .7); ctx.lineTo(0, size * .32); ctx.stroke();
    ctx.restore();
  }
}
