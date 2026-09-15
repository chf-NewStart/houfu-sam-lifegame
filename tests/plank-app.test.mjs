import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Flight, BrowSwitch, CoopFlight } from '../game/plank-engine.js';

const html = readFileSync(new URL('../game/plank.html', import.meta.url), 'utf8');
// Execute the actual application with its real engine and controlled camera/DOM.
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
      checked: /\bchecked\b/.test(match[2]),
      classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; },
      getBoundingClientRect: () => ({ width: 390, height: 700 }), getContext: () => canvas, blur() {},
    });
    for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) el.dataset[key.slice(5)] = value;
    elements.push(el); if (attributes.id) ids.set(attributes.id, el);
  }
  const select = selector => {
    const attributes = [...selector.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]*)))?\]/g)];
    assert.ok(attributes.length, `Unsupported selector ${selector}`);
    return elements.filter(el => attributes.every(([, name, quoted, unquoted]) =>
      name in el.attributes && (quoted === undefined && unquoted === undefined || el.attributes[name] === (quoted ?? unquoted))));
  };
  const document = Object.assign(target(), {
    hidden: false, documentElement: {}, activeElement: null, body: { classList: { toggle() {} } },
    getElementById: id => { assert.ok(ids.has(id), `Unknown DOM id ${id}`); return ids.get(id); },
    querySelectorAll: select,
    querySelector: selector => select(selector)[0] ?? null,
  });
  class MockCamera {
    constructor(_, callbacks) { this.callbacks = callbacks; this.active = false; this.paused = false; this.starts = []; camera = this; }
    async start({ numFaces = 1 } = {}) {
      this.starts.push({ numFaces }); this.numFaces = numFaces; this.active = true; this.paused = false;
      this.faces = (numFaces === 2 ? [.75, .25] : [.5]).map(x => ({ x, y: .5, brow: .05, width: .15 }));
      return true;
    }
    emit(visible = true, faces = visible ? this.faces : []) {
      visible = visible && faces.length === this.numFaces;
      if (visible === false && this.visible === false && this.count === faces.length) return;
      this.visible = visible;
      this.count = faces.length;
      this.callbacks.onSample({ visible, x: faces[0]?.x ?? .5, brow: faces[0]?.brow ?? 0, time: now, faces, count: faces.length });
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
    Flight, BrowSwitch, CoopFlight, PlankCamera: MockCamera,
    PlankRenderer: class { resize() {} draw() {} },
    matchMedia: () => ({ matches: false }), requestAnimationFrame: callback => { animation = callback; },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  }));
  context.window = context;
  vm.runInContext(`'use strict';\n${source}`, context, { filename: 'game/plank.js' });
  const state = () => JSON.parse(JSON.stringify(vm.runInContext('({phase, players, mode, calibrated, elapsed: game?.elapsed, score: game?.score, done: game?.done, lanes: flightGames().map(g => g.lane), clocks: flightGames().map(g => g.elapsed)})', context)));
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
  const choose = (attribute, value) => {
    const el = select(`[data-${attribute}="${value}"]`)[0];
    assert.ok(el, `Missing ${attribute} choice ${value}`); el.dispatch('click');
  };
  const launchCamera = async ({ buddy = false, control = 'face' } = {}) => {
    if (buddy) choose('players', 2);
    choose('control', control);
    await click('camera-start'); advance(.1); await click('calibrate');
    if (control === 'brow') {
      until('brow'); camera.faces = camera.faces.map(face => ({...face, brow: .8}));
      until('relax'); camera.faces = camera.faces.map(face => ({...face, brow: .05}));
    }
    until('playing');
  };
  const key = key => context.dispatch('keydown', { key });
  const rotate = () => context.dispatch('orientationchange');
  const pointer = id => ids.get(id).dispatch('pointerdown');
  return { ids, storage, camera, document, state, advance, until, click, choose, key, rotate, pointer, launchCamera };
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

test('buddy practice uses independent keyboard and pointer lanes on one shared clock', async () => {
  const app = harness(); app.choose('players', 2);
  await app.click('practice-start'); app.until('playing');
  assert.deepEqual(app.state().lanes, [0, 0]);
  app.key('d'); assert.deepEqual(app.state().lanes, [1, 0]);
  app.key('ArrowRight'); assert.deepEqual(app.state().lanes, [1, 1]);
  app.key('a'); assert.deepEqual(app.state().lanes, [0, 1]);
  app.key('ArrowLeft'); assert.deepEqual(app.state().lanes, [0, 0]);
  app.pointer('p1-right'); assert.deepEqual(app.state().lanes, [1, 0]);
  app.pointer('p2-right'); assert.deepEqual(app.state().lanes, [1, 1]);
  app.pointer('p1-left'); assert.deepEqual(app.state().lanes, [0, 1]);
  app.pointer('p2-left'); assert.deepEqual(app.state().lanes, [0, 0]);
  app.advance(1); assert.ok(app.state().clocks.every(clock => Math.abs(clock - 1) < 1e-10));
  const clocks = app.state().clocks;
  await app.click('pause'); app.key('d'); app.pointer('p2-right'); app.advance(2);
  assert.deepEqual(app.state().lanes, [0, 0]); assert.deepEqual(app.state().clocks, clocks);
  assert.equal(app.camera.starts.length, 0);
});

test('one shared camera calibrates two eyebrow controls and each raise changes only its own ship', async () => {
  const app = harness(); await app.launchCamera({buddy: true, control: 'brow'});
  assert.deepEqual(app.camera.starts, [{numFaces: 2}]);
  assert.equal(app.state().calibrated, true);
  app.advance(.2); // Both controls see neutral after the launch reset.
  app.camera.faces[0].brow = .8; app.advance(.4);
  assert.deepEqual(app.state().lanes, [1, 0]);
  app.advance(.5); assert.deepEqual(app.state().lanes, [1, 0], 'holding a raise cannot repeat');
  app.camera.faces[0].brow = .05; app.camera.faces[1].brow = .8; app.advance(.4);
  assert.deepEqual(app.state().lanes, [1, 1]);
  app.camera.faces[1].brow = .05; app.advance(.2);
  app.camera.faces[1].brow = .8; app.advance(.4);
  assert.deepEqual(app.state().lanes, [1, 0]);
});

test('both players must finish neutral and eyebrow calibration before a buddy flight can launch', async () => {
  const app = harness(); app.choose('players', 2);
  await app.click('camera-start'); app.advance(.1); await app.click('calibrate'); app.until('neutral');
  const bothFaces = app.camera.faces;
  app.camera.faces = [bothFaces[0]]; app.advance(3);
  assert.equal(app.state().phase, 'neutral');
  assert.equal(app.state().elapsed, undefined);
  app.camera.faces = bothFaces; app.until('brow');
  app.camera.faces[0].brow = .8; // Buddy never raises their eyebrows.
  app.until('framing');
  assert.equal(app.state().elapsed, undefined, 'one successful gesture cannot launch both players');
  assert.match(app.ids.get('camera-copy').textContent, /both eyebrow raises/);
});

test('a single remaining face freezes both flights and cannot take over the other player', async () => {
  const app = harness(); await app.launchCamera({buddy: true});
  app.camera.faces[0].x = .68; app.advance(.6);
  assert.deepEqual(app.state().lanes, [1, 0]);
  const before = app.state(), both = app.camera.faces;
  app.camera.faces = [{...both[1], x: .1, brow: .9}]; app.camera.emit();
  assert.equal(app.state().phase, 'tracking');
  app.key('ArrowRight'); app.pointer('p2-right'); app.advance(3);
  assert.equal(app.state().elapsed, before.elapsed);
  assert.equal(app.state().score, before.score);
  assert.deepEqual(app.state().clocks, before.clocks);
  assert.deepEqual(app.state().lanes, before.lanes);
  app.camera.faces = both; app.until('countdown'); app.advance(2.9);
  assert.equal(app.state().elapsed, before.elapsed);
  app.until('playing'); app.advance(.2);
  assert.ok(app.state().elapsed > before.elapsed);
});

test('rotating during buddy camera play requires fresh calibration without spending either clock', async () => {
  const app = harness(); await app.launchCamera({buddy: true}); app.advance(1);
  const elapsed = app.state().elapsed;
  app.rotate(); assert.equal(app.state().phase, 'framing');
  app.advance(4); assert.deepEqual(app.state().clocks, [elapsed, elapsed]);
  await app.click('calibrate'); app.until('playing');
  assert.deepEqual(app.state().clocks, [elapsed, elapsed]);
  app.advance(.2); assert.ok(app.state().elapsed > elapsed);
  assert.equal(app.camera.starts.length, 1, 'rotation reuses the shared camera');
});
