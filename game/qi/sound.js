/* The sound of a stone set down, for each board material, as the app makes it
   (Qi/Model/StoneSound.swift): on the stone slab a short bright click with a knock under
   it and a water plip a moment later; on wood the dry clack of a stone on kaya; on clear
   water a deeper plop; on steel a ringing clink; in the sky a small crystal chime; in the
   garden a soft thud into soil. Pebbles sound a little lower, shells a little brighter.
   Captured stones lift out with a run of small sounds in the same voice, and a big group
   taken rings a temple bell: the great bell for a dragon, the bowl bell (磬) for a snake.
   The same tiny synth, sample by sample (sine rings, gliding tones and low-passed noise),
   rendered into a buffer per sound: no audio files. */

let ctx = null;
let node = null;
let enabled = true;
let theme = 'stone';
const WORKLET = new URL('./synth-worklet.js?v=11', import.meta.url);

export function setEnabled(on) { enabled = on; if (on) unlock(); }
export function setTheme(t) { theme = t; }

/** Browsers start audio only after a tap: call on the first gesture. */
export function unlock() {
  if (!enabled) return;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.audioWorklet) {
        ctx.audioWorklet.addModule(WORKLET).then(() => {
          node = new AudioWorkletNode(ctx, 'qi-synth', { numberOfInputs: 0, outputChannelCount: [1] });
          node.connect(ctx.destination);
        }).catch(() => { node = null; });
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { ctx = null; }
}

const V = (wave, from, to, length, gain, wait, attack = 0) => ({ wave, from, to, length, gain, wait, attack });
const rnd = (a, b) => a + Math.random() * (b - a);

/** Renders voices to mono samples, as the app's Mixer does (one sample at a time). */
export function render(voices, sampleRate) {
  const end = Math.max(...voices.map((v) => v.wait + v.length)) + 0.02;
  const out = new Float32Array(Math.ceil(end * sampleRate));
  const dt = 1 / sampleRate;
  let seed = 0x2545f491;
  for (const v of voices) {
    let phase = 0, low = 0;
    const start = Math.round(v.wait * sampleRate);
    const count = Math.round(v.length * sampleRate);
    const glide = v.from !== v.to;
    const ratio = v.to / v.from;
    const decay = Math.exp(-3.912 * dt / v.length);
    let env = v.gain;
    for (let i = 0; i < count; i++) {
      const t = i * dt;
      const gain = t < v.attack ? env * t / v.attack : env;
      env *= decay;
      const freq = glide ? v.from * Math.pow(ratio, t / v.length) : v.from;
      let s;
      if (v.wave === 'sine') {
        s = Math.sin(phase * 2 * Math.PI) * gain;
      } else {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = (seed >>> 8) / 16777216 * 2 - 1;
        low += (1 - Math.exp(-2 * Math.PI * freq * dt)) * (white - low);
        s = low * gain * 2.5;
      }
      phase += freq * dt;
      if (phase >= 1) phase -= 1;
      out[start + i] += s;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i] * 1.8));
  return out;
}

function stoneVoices(color, th, bright = 1) {
  const p = (color === 1 ? 0.86 : 1.1) * bright * rnd(0.96, 1.04);
  switch (th) {
    case 'wood': return [
      V('noise', 7000, 3000, 0.01, 0.12, 0), V('sine', 1900 * p, 1750 * p, 0.03, 0.10, 0),
      V('sine', 430 * p, 400 * p, 0.09, 0.14, 0), V('sine', 790 * p, 760 * p, 0.05, 0.07, 0),
      V('sine', 190 * p, 170 * p, 0.06, 0.08, 0)];
    case 'water': return [
      V('sine', 3200 * p, 3000 * p, 0.015, 0.04, 0), V('sine', 280 * p, 950 * p, 0.1, 0.16, 0.005),
      V('noise', 1600, 500, 0.16, 0.07, 0.01), V('sine', 700 * p, 1600 * p, 0.05, 0.05, 0.09)];
    case 'steel': return [
      V('noise', 10000, 6000, 0.008, 0.08, 0), V('sine', 1260 * p, 1255 * p, 0.42, 0.07, 0),
      V('sine', 2985 * p, 2975 * p, 0.3, 0.05, 0), V('sine', 4630 * p, 4620 * p, 0.2, 0.035, 0),
      V('sine', 6210 * p, 6200 * p, 0.12, 0.02, 0), V('sine', 520 * p, 500 * p, 0.05, 0.05, 0)];
    case 'soil': return [
      V('noise', 1400, 500, 0.06, 0.12, 0), V('sine', 170 * p, 120 * p, 0.08, 0.14, 0), V('sine', 900 * p, 820 * p, 0.025, 0.04, 0)];
    case 'sky': {
      const note = (color === 1 ? 1320 : 1760) * rnd(0.995, 1.005);
      return [V('sine', note, note, 0.7, 0.07, 0), V('sine', note * 1.5, note * 1.5, 0.5, 0.04, 0),
        V('sine', note * 2.01, note * 2.01, 0.3, 0.025, 0), V('noise', 9000, 7000, 0.01, 0.03, 0)];
    }
    default: return [
      V('noise', 9000, 5000, 0.012, 0.10, 0), V('sine', 2650 * p, 2550 * p, 0.05, 0.12, 0),
      V('sine', 4150 * p, 4050 * p, 0.035, 0.06, 0), V('sine', 6900 * p, 6800 * p, 0.02, 0.035, 0),
      V('sine', 1180 * p, 1100 * p, 0.07, 0.08, 0), V('sine', 650 * p, 1500 * p, 0.06, 0.09, 0.025),
      V('noise', 2200, 900, 0.09, 0.05, 0.02)];
  }
}

function captureVoices(count, th) {
  const list = [];
  for (let i = 0; i < Math.min(count, 6); i++) {
    const w = 0.16 + i * 0.07, p = rnd(0.95, 1.08);
    switch (th) {
      case 'wood': list.push(V('noise', 6000, 2500, 0.008, 0.08, w), V('sine', 1500 * p, 1400 * p, 0.03, 0.07, w)); break;
      case 'water': list.push(V('sine', 400 * p, 1300 * p, 0.07, 0.08, w)); break;
      case 'steel': list.push(V('sine', 2400 * p, 2390 * p, 0.16, 0.04, w), V('sine', 5300 * p, 5290 * p, 0.08, 0.02, w)); break;
      case 'sky': list.push(V('sine', 2640 * p, 2640 * p, 0.3, 0.035, w)); break;
      case 'soil': list.push(V('noise', 1800, 700, 0.05, 0.07, w)); break;
      default: list.push(V('sine', 900 * p, 1750 * p, 0.05, 0.07, w), V('sine', 3000 * p, 2900 * p, 0.02, 0.04, w));
    }
  }
  return list;
}

/** A temple bell. The great bell (a dragon, 屠龍), struck with a log: a soft knock, then a
    deep hum that swells and slowly wavers (each low partial rings as a close pair that
    beats) while the brighter partials die away first. The bowl bell (磬, a snake, 斬蛇):
    higher, lighter, shorter. */
function bellVoices(great) {
  const p = rnd(0.99, 1.01);
  const partials = great ? [
    [110, 110.55, 0.05, 14, 0.15], [226.6, 227.4, 0.055, 11, 0.06], [278.3, 279.4, 0.045, 8, 0.03],
    [353.1, null, 0.035, 5.5, 0.012], [459.8, null, 0.025, 3.8, 0.012], [553.3, null, 0.016, 2.6, 0.012],
    [706.2, null, 0.01, 1.7, 0.012], [900, null, 0.006, 1.1, 0.012],
  ] : [
    [392, 393.3, 0.05, 7, 0.006], [1062, 1065, 0.03, 3.6, 0.004], [2007, null, 0.012, 1.6, 0.004], [3136, null, 0.006, 0.7, 0.004],
  ];
  const strike = great
    ? [V('noise', 900, 200, 0.09, 0.05, 0), V('sine', 150 * p, 118 * p, 0.14, 0.06, 0)]
    : [V('noise', 3000, 1200, 0.02, 0.025, 0)];
  const out = strike;
  for (const [f, twin, gain, length, attack] of partials) {
    out.push(V('sine', f * p, f * p, length, gain, 0, attack));
    if (twin) out.push(V('sine', twin * p, twin * p, length * 0.8, gain * 0.55, 0, attack));
  }
  return out;
}

/** A mahjong tile is bone on the table: the board's stone voice, brighter and drier. A call
    is two tiles turned up together; a win is the hand laid down, then the bowl bell, softly. */
function tileVoices(kind, th) {
  const clack = (after, gain = 1) => stoneVoices(2, th, 1.18).map((v) =>
    V(v.wave, v.from, v.to, v.length * (th === 'sky' || th === 'steel' ? 0.6 : 0.8), v.gain * gain, v.wait + after, v.attack));
  if (kind === 'call') return clack(0, 0.9).concat(clack(0.075, 1.05));
  if (kind === 'win') {
    let laid = [];
    for (let i = 0; i < 5; i++) laid = laid.concat(clack(i * 0.045, 0.55 + 0.1 * i));
    return laid.concat(bellVoices(false).map((v) => V(v.wave, v.from, v.to, v.length * 0.7, v.gain * 0.6, v.wait + 0.3, v.attack)));
  }
  return clack(0);
}

function play(voices) {
  if (!enabled || !voices.length) return;
  unlock();
  if (!ctx) return;
  if (node) { node.port.postMessage(voices); return; }
  // No worklet (yet): render this one sound into a buffer here.
  const data = render(voices, ctx.sampleRate);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
}

/** A stone of `color` (1 black pebble, 2 white shell) set down. */
export function stone(color) { play(stoneVoices(color, theme)); }
/** `count` stones lifted out, one after another. */
export function capture(count) { play(captureVoices(count, theme)); }
/** A big group taken: `color` is the captured group's (2 White: a dragon, the great bell). */
export function slay(color) {
  // The great bell rings for fourteen seconds: rendered once, then kept.
  const great = color === 2;
  if (!enabled) return;
  unlock();
  if (!ctx) return;
  if (node) { node.port.postMessage(bellVoices(great)); return; }
  if (!bells[great]) {
    const data = render(bellVoices(great), ctx.sampleRate);
    bells[great] = ctx.createBuffer(1, data.length, ctx.sampleRate);
    bells[great].getChannelData(0).set(data);
  }
  const src = ctx.createBufferSource();
  src.buffer = bells[great];
  src.connect(ctx.destination);
  src.start();
}
const bells = {};
export function tile(kind) { play(tileVoices(kind, theme)); }
/** The automatic mahjong table (麻将机) between hands: the tiles swept into the middle, the
    motor's whir with the shuffle clattering inside, the walls rising with a soft clunk, the
    dice rattling under the dome. The same little randomness every time: one machine. */
export function machine(kind) {
  let seed = 0x9e3779b9;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) / 16777216; };
  let list = [];
  if (kind === 'sweep') {
    list = [V('noise', 2400, 700, 0.5, 0.05, 0, 0.18)];
    for (let i = 0; i < 6; i++) list.push(V('noise', 3000, 1500, 0.02, 0.03, 0.15 + i * 0.05 + next() * 0.03));
  } else if (kind === 'whir') {
    list = [V('sine', 92, 118, 1.25, 0.05, 0, 0.25), V('sine', 184, 236, 1.1, 0.025, 0, 0.25), V('noise', 380, 260, 1.2, 0.05, 0, 0.3)];
    for (let i = 0; i < 16; i++) {
      const at = 0.1 + next() * 1.0, p = 0.85 + next() * 0.3;
      list.push(V('noise', 1500 * p, 700, 0.018, 0.035, at), V('sine', 900 * p, 820 * p, 0.03, 0.025, at));
    }
  } else if (kind === 'rise') {
    list = [V('sine', 70, 140, 0.4, 0.03, 0, 0.3), V('sine', 150, 95, 0.14, 0.08, 0.42), V('noise', 700, 300, 0.06, 0.06, 0.42), V('sine', 1300, 1200, 0.03, 0.025, 0.43)];
  } else if (kind === 'dice') {
    let t = 0;
    for (let i = 0; i < 9; i++) {
      t += 0.035 + next() * 0.06 + i * 0.006;
      const p = 0.9 + next() * 0.25;
      list.push(V('noise', 7000, 4000, 0.008, 0.05, t), V('sine', 2600 * p, 2500 * p, 0.025, 0.03, t), V('sine', 4100 * p, 4000 * p, 0.015, 0.015, t));
    }
  }
  play(list);
}
export function stopAll() { if (node) node.port.postMessage('stop'); }
