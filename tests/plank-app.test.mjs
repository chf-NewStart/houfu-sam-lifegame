import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Flight, BrowSwitch } from '../game/plank-engine.js';

const html = readFileSync(new URL('../game/plank.html', import.meta.url), 'utf8');
// Execute the actual application; substitute only its two imported dependencies.
const source = readFileSync(new URL('../game/plank.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');

function harness() {
  let now = 0, animation, camera;
  const elements = [], ids = new Map(), storage = new Map();
  const target = () => ({
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...event }); },
  });
  const canvas = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const el = Object.assign(target(), {
      tagName: match[1].toUpperCase(), attributes, dataset: {}, style: {}, textContent: '',
      hidden: /\bhidden\b/.test(match[2]), disabled: /\bdisabled\b/.test(match[2]), value: attributes.value,
      classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; },
      getBoundingClientRect: () => ({ width: 390, height: 700 }), getContext: () => canvas, blur() {},
    });
    for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) el.dataset[key.slice(5)] = value;
    elements.push(el); if (attributes.id) ids.set(attributes.id, el);
  }
  const document = Object.assign(target(), {
    hidden: false, documentElement: {}, activeElement: null, body: { classList: { toggle() {} } },
    getElementById: id => { assert.ok(ids.has(id), `Unknown DOM id ${id}`); return ids.get(id); },
    querySelectorAll: selector => elements.filter(el => selector === '[data-key]' ? 'key' in el.dataset : selector === '[data-duration]' ? 'duration' in el.dataset : 'control' in el.dataset),
    querySelector: () => elements.find(el => el.dataset.control && el.attributes['aria-pressed'] === 'true'),
  });
  class MockCamera {
    constructor(_, callbacks) { this.callbacks = callbacks; this.active = false; this.paused = false; camera = this; }
    async start() { this.active = true; this.paused = false; return true; }
    emit(visible) {
      if (visible === false && this.visible === false) return;
      this.visible = visible;
      this.callbacks.onSample({ visible, x: .5, brow: .05, time: now });
    }
    pause() { if (this.active) { this.paused = true; this.emit(false); } }
    stop() { if (this.active) { this.active = false; this.emit(false); } }
    async resume() {
      if (this.resumeError) { this.stop(); this.callbacks.onError(this.resumeError); return false; }
      this.paused = false; return this.active;
    }
  }
  const context = vm.createContext(Object.assign(target(), {
    document, navigator: {}, performance: { now: () => now }, devicePixelRatio: 1, console,
    Flight, BrowSwitch, PlankCamera: MockCamera,
    matchMedia: () => ({ matches: false }), requestAnimationFrame: callback => { animation = callback; },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  }));
  context.window = context;
  vm.runInContext(`'use strict';\n${source}`, context, { filename: 'game/plank.js' });
  const state = () => vm.runInContext('({phase, elapsed: game?.elapsed, score: game?.score, done: game?.done})', context);
  function frame(face = true) {
    now += 50;
    if (camera.active && !camera.paused && now % 100 === 0) camera.emit(face);
    const callback = animation; animation = null; callback(now);
    assert.equal(typeof animation, 'function', 'Application must schedule its next frame');
  }
  const advance = (seconds, face = true) => { for (let i = 0; i < Math.round(seconds * 20); i++) frame(face); };
  const until = (phase, seconds = 20) => {
    for (let n = 0; state().phase !== phase && n < seconds * 20; n++) frame();
    assert.equal(state().phase, phase);
  };
  const click = async id => {
    const el = ids.get(id); assert.ok(el && !el.disabled, `${id} must be enabled`);
    await el.onclick?.(); el.dispatch('click');
  };
  const launchCamera = async () => {
    await click('camera-start'); advance(.1); await click('calibrate'); until('playing');
  };
  return { ids, storage, camera, document, state, advance, until, click, launchCamera };
}

test('practice countdown does not spend flight time and completion lands at exactly 30 seconds', async () => {
  const app = harness();
  await app.click('practice-start'); app.advance(2.9);
  assert.equal(app.state().phase, 'countdown'); assert.equal(app.state().elapsed, 0);
  app.until('playing'); app.advance(29.9);
  assert.equal(app.state().phase, 'playing');
  app.advance(.2);
  assert.equal(app.state().phase, 'results'); assert.equal(app.state().elapsed, 30);
  assert.equal(app.state().done, true);
  assert.equal(app.ids.get('result-time').textContent, '30 / 30');
  assert.equal(app.ids.get('result-kicker').textContent, 'FLIGHT COMPLETE');
  assert.ok(app.storage.has('plank_pilot_best_v1_practice_30'));
});

test('manual pause and its resume countdown freeze the actual flight clock', async () => {
  const app = harness();
  await app.click('practice-start'); app.until('playing'); app.advance(1);
  await app.click('pause'); const elapsed = app.state().elapsed;
  app.advance(5); assert.equal(app.state().elapsed, elapsed);
  await app.click('resume'); app.advance(2.9);
  assert.equal(app.state().elapsed, elapsed);
  app.until('playing'); app.advance(.5);
  assert.ok(app.state().elapsed > elapsed);
  await app.click('end'); assert.equal(app.state().phase, 'results');
  assert.equal(app.state().done, false);
});

for (const action of ['resume', 'recalibrate']) {
  test(`${action} preserves a synchronous camera-resume failure instead of overwriting error`, async () => {
    const app = harness(); await app.launchCamera(); app.advance(1); await app.click('pause');
    app.camera.resumeError = new Error('Face tracking stopped');
    await app.click(action); app.advance(2);
    assert.equal(app.state().phase, 'error'); assert.equal(app.camera.active, false);
    assert.equal(app.ids.get('message-title').textContent, 'Camera unavailable.');
  });
}

test('backgrounding during recalibration returns to framing while preserving flight progress', async () => {
  const app = harness(); await app.launchCamera(); app.advance(1); await app.click('pause');
  const elapsed = app.state().elapsed;
  await app.click('recalibrate'); app.advance(.1); await app.click('calibrate'); app.until('neutral'); app.advance(.5);
  app.document.hidden = true; app.document.dispatch('visibilitychange');
  assert.equal(app.state().phase, 'paused');
  app.document.hidden = false; app.document.dispatch('visibilitychange');
  await app.click('resume'); assert.equal(app.state().phase, 'framing');
  assert.equal(app.state().elapsed, elapsed);
  app.advance(.1); await app.click('calibrate'); app.until('playing');
  assert.equal(app.state().elapsed, elapsed);
});

test('lost tracking freezes gameplay immediately and recovery includes a fresh countdown', async () => {
  const app = harness(); await app.launchCamera(); app.advance(1);
  const elapsed = app.state().elapsed, score = app.state().score;
  app.camera.emit(false); assert.equal(app.state().phase, 'tracking');
  app.advance(3, false);
  assert.equal(app.state().elapsed, elapsed); assert.equal(app.state().score, score);
  app.advance(1); assert.equal(app.state().phase, 'tracking');
  app.until('countdown'); assert.equal(app.state().elapsed, elapsed);
  app.advance(2.9); assert.equal(app.state().elapsed, elapsed);
  app.until('playing'); app.advance(.5); assert.ok(app.state().elapsed > elapsed);
});
