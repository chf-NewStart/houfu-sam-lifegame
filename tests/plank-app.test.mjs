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
    Flight: class extends Flight { constructor(duration) { super(duration, () => 0); } }, BrowSwitch, CoopFlight, PlankCamera: MockCamera,
    PlankRenderer: class { resize() {} draw() {} clearFaces() {} captureFaces() {} },
    matchMedia: () => ({ matches: false }), requestAnimationFrame: callback => { animation = callback; },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  }));
  context.window = context;
  vm.runInContext(`'use strict';\n${source}`, context, { filename: 'game/plank.js' });
  const state = () => JSON.parse(JSON.stringify(vm.runInContext('({phase, players, mode, duration, gameDuration: game?.duration, calibrated, elapsed: game?.elapsed, score: game?.score, done: game?.done, lanes: flightGames().map(g => g.lane), clocks: flightGames().map(g => g.elapsed), health: game?.health})', context)));
  function frame(face = true) {
    now += 50;
    if (camera.active && !camera.paused && now % 100 === 0) camera.emit(face);
    const callback = animation; animation = null; callback(now);
    assert.equal(typeof animation, 'function', 'Application must schedule its next frame');
  }
  const avoid = seconds => {
    for (let i = 0; i < Math.round(seconds * 20); i++) {
      vm.runInContext('for (const [i,g] of flightGames().entries()) { const gate = g.gates.find(x => !x.resolved); if (gate) game.steer(1-gate.lane,i); }',context); frame();
    }
  };
  const stall = seconds => { now += seconds * 1000; const callback = animation; animation = null; callback(now); };
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
  const finishCalibration = (control = 'face') => {
    const centers = camera.faces.map(face => face.x);
    if (control === 'brow') {
      until('brow'); camera.faces = camera.faces.map(face => ({...face, brow: .8}));
      until('relax'); camera.faces = camera.faces.map(face => ({...face, brow: .05}));
    } else {
      until('testLeft'); camera.faces = camera.faces.map((face, i) => ({...face, x: centers[i] + .1}));
      until('testRight'); camera.faces = camera.faces.map((face, i) => ({...face, x: centers[i] - .1}));
      until('countdown'); camera.faces = camera.faces.map((face, i) => ({...face, x: centers[i]}));
    }
    until('playing');
  };
  const launchCamera = async ({ buddy = false, control = 'face' } = {}) => {
    if (buddy) choose('players', 2);
    choose('control', control);
    await click('camera-start'); advance(.1); await click('calibrate');
    finishCalibration(control);
  };
  const key = key => context.dispatch('keydown', { key });
  const rotate = () => context.dispatch('orientationchange');
  const pointer = id => ids.get(id).dispatch('pointerdown');
  return { ids, storage, camera, document, state, advance, avoid, stall, until, click, choose, key, rotate, pointer, launchCamera, finishCalibration };
}

test('practice countdown does not spend flight time and completion lands at exactly 30 seconds', async () => {
  const app = harness();
  await app.click('practice-start'); app.advance(2.9);
  assert.equal(app.state().phase, 'countdown'); assert.equal(app.state().elapsed, 0);
  app.until('playing'); app.avoid(29.9);
  assert.equal(app.state().phase, 'playing');
  app.advance(.2);
  assert.equal(app.state().phase, 'results'); assert.equal(app.state().elapsed, 30);
  assert.equal(app.state().done, true);
  assert.equal(app.ids.get('result-time').textContent, '30 / 30');
  assert.equal(app.ids.get('result-kicker').textContent, 'FLIGHT COMPLETE');
  assert.ok(app.storage.has('plank_pilot_coins_v3_practice_30'));
});

for (const buddy of [false,true]) {
  test(`custom seconds finish ${buddy ? 'both buddy flights' : 'a solo flight'} at the exact requested time`, async () => {
    const app = harness(), seconds = buddy ? 123 : 75;
    if (buddy) app.choose('players',2);
    const input = app.ids.get('custom-duration');
    input.value = String(seconds); input.dispatch('input');
    assert.equal(input.attributes['data-active'],'true');
    await app.click('practice-start'); app.until('playing');
    assert.equal(app.state().gameDuration,seconds);
    assert.equal(app.state().elapsed,0);
    app.avoid(seconds-.1); assert.equal(app.state().phase,'playing');
    app.advance(.2); assert.equal(app.state().phase,'results');
    assert.equal(app.state().elapsed,seconds);
    assert.ok(app.state().clocks.every(clock => clock === seconds));
    assert.equal(app.ids.get('result-time').textContent,`${seconds} / ${seconds}`);
    assert.ok(app.storage.has(buddy ? `plank_pilot_coins_v3_buddy_practice_${seconds}` : `plank_pilot_coins_v3_practice_${seconds}`));
  });
}

test('invalid custom seconds cannot start a camera or practice flight and a preset restores valid setup', async () => {
  const app = harness(), input = app.ids.get('custom-duration');
  for (const value of ['', '0', '-1', '12.5', '1e2', 'Infinity', 'abc', '3601']) {
    input.value = value; input.dispatch('input');
    assert.equal(input.attributes['aria-invalid'],'true',value);
    assert.equal(app.ids.get('duration-error').hidden,false);
    assert.equal(app.ids.get('camera-start').disabled,true);
    assert.equal(app.ids.get('practice-start').disabled,true);
    await app.ids.get('camera-start').onclick();
    await app.ids.get('practice-start').onclick();
    assert.equal(app.state().phase,'setup');
    assert.equal(app.state().gameDuration,undefined);
    assert.equal(app.camera.starts.length,0);
  }
  app.choose('duration',45);
  assert.equal(input.value,'');
  assert.equal(input.attributes['data-active'],'false');
  assert.equal(input.attributes['aria-invalid'],'false');
  assert.equal(app.ids.get('duration-error').hidden,true);
  await app.click('practice-start');
  assert.equal(app.state().gameDuration,45);
});

test('custom duration accepts the lower and upper limits and displays their flight clocks', async () => {
  for (const seconds of [1,3600]) {
    const app = harness(), input = app.ids.get('custom-duration');
    input.value = String(seconds); input.dispatch('input');
    assert.equal(app.ids.get('duration-error').hidden,true);
    await app.click('practice-start');
    assert.equal(app.state().gameDuration,seconds);
    assert.equal(app.ids.get('clock').textContent,seconds === 1 ? '0:01' : '60:00');
  }
});

test('camera setup uses the custom duration through calibration and launch', async () => {
  const app = harness(), input = app.ids.get('custom-duration');
  input.value = '97'; input.dispatch('input');
  await app.launchCamera({buddy:true,control:'brow'});
  assert.equal(app.state().gameDuration,97);
  assert.deepEqual(app.state().clocks,[0,0]);
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
  app.advance(2); assert.equal(app.state().elapsed, elapsed);
  app.document.hidden = false; app.document.dispatch('visibilitychange');
  assert.equal(app.state().phase, 'prep');
  assert.equal(app.state().elapsed, elapsed);
  app.finishCalibration();
  assert.equal(app.state().elapsed, elapsed);
});

test('brief tracking misses freeze hazards silently; longer losses recover automatically', async () => {
  const app = harness(); await app.launchCamera(); app.advance(1);
  const elapsed = app.state().elapsed, coins = app.state().score, health = app.state().health;
  app.camera.emit(false); app.advance(.5,false);
  assert.equal(app.state().phase, 'playing');
  assert.equal(app.ids.get('message').hidden,true);
  assert.equal(app.state().elapsed,elapsed);
  app.advance(.1); assert.equal(app.state().phase,'playing');
  assert.ok(app.state().elapsed>elapsed);
  const before = app.state().elapsed;
  app.camera.emit(false); app.advance(2,false);
  assert.equal(app.state().phase,'tracking');
  assert.equal(app.state().elapsed,before);
  assert.equal(app.state().score,coins); assert.equal(app.state().health,health);
  app.advance(.5); assert.equal(app.state().phase,'tracking');
  app.until('playing'); assert.equal(app.state().elapsed,before);
  app.advance(.2); assert.ok(app.state().elapsed>before);
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

test('both players must complete neutral, a sustained eyebrow raise, and relaxation before buddy liftoff', async () => {
  const app = harness(); app.choose('players', 2);
  await app.click('camera-start'); app.advance(.1); await app.click('calibrate'); app.until('neutral');
  const bothFaces = app.camera.faces;
  app.camera.faces = [bothFaces[0]]; app.advance(3);
  assert.equal(app.state().phase, 'neutral');
  assert.equal(app.state().elapsed, undefined);
  app.camera.faces = bothFaces; app.until('brow');
  app.camera.faces = bothFaces.map((face, i) => ({...face, brow: i === 0 ? .8 : .05}));
  app.advance(4);
  assert.equal(app.state().phase, 'brow', 'wait for the buddy in this step without restarting preparation');
  assert.equal(app.state().elapsed, undefined, 'one successful gesture cannot launch both players');
  assert.equal(app.ids.get('camera-panel').hidden, false);
  assert.equal(app.ids.get('prep-step-controls').attributes['data-state'], 'current');
  app.camera.faces = bothFaces.map(face => ({...face, brow: .8}));
  app.advance(1); assert.equal(app.state().phase, 'brow', 'a short shared raise is insufficient');
  app.until('relax');
  app.camera.faces = bothFaces.map((face, i) => ({...face, brow: i === 0 ? .05 : .8}));
  app.advance(3); assert.equal(app.state().phase, 'relax', 'both players must relax');
  app.camera.faces = bothFaces.map(face => ({...face, brow: .05}));
  app.until('countdown'); assert.equal(app.state().elapsed, 0);
  app.advance(2.9); assert.equal(app.state().elapsed, 0);
  app.until('playing'); assert.equal(app.state().calibrated, true);
});

test('camera preparation keeps the preview visible and distinguishes settling, centering, controls, and liftoff', async () => {
  const app = harness();
  await app.click('camera-start'); app.advance(.1);
  const cameraStage = (phase, title, activeStep) => {
    assert.equal(app.state().phase, phase);
    assert.equal(app.ids.get('camera-panel').hidden, false, `${phase}: live framing preview stays visible`);
    assert.equal(app.ids.get('message').hidden, true, `${phase}: instructions stay with the preview`);
    assert.equal(app.ids.get('camera-title').textContent, title);
    assert.ok(app.ids.get('camera-copy').textContent.length, `${phase}: explains the current action`);
    assert.equal(app.ids.get('prep-next').hidden, phase === 'countdown');
    if (phase !== 'countdown') assert.ok(app.ids.get('prep-next').textContent.length, `${phase}: explains what happens next`);
    for (const step of ['frame', 'center', 'controls', 'launch']) {
      assert.equal(app.ids.get(`prep-step-${step}`).attributes['aria-current'], step === activeStep ? 'step' : 'false');
    }
  };
  await app.click('calibrate');
  cameraStage('prep', 'Settle into your plank.', 'frame');
  app.advance(4.9); assert.equal(app.state().phase, 'prep');
  assert.equal(app.state().elapsed, undefined, 'settling is outside the flight');
  app.until('neutral'); cameraStage('neutral', 'Center & hold still.', 'center');
  assert.equal(app.ids.get('prep-step-frame').attributes['data-state'], 'done');
  app.until('testLeft'); cameraStage('testLeft', 'Try a small shift left.', 'controls');
  app.camera.faces = app.camera.faces.map(face => ({...face, x: .6}));
  app.until('testRight'); cameraStage('testRight', 'Now shift right.', 'controls');
  app.camera.faces = app.camera.faces.map(face => ({...face, x: .4}));
  app.until('countdown'); cameraStage('countdown', 'Controls ready. Liftoff in…', 'launch');
  assert.equal(app.ids.get('prep-step-controls').attributes['data-state'], 'done');
  assert.equal(app.state().elapsed, 0, 'testing both controls is outside the flight');
  app.camera.faces = app.camera.faces.map(face => ({...face, x: .5}));
  app.advance(2.9); assert.equal(app.state().elapsed, 0);
  app.until('playing'); assert.equal(app.ids.get('camera-panel').hidden, true);
});

test('centering restarts its continuous hold after movement or a lost face without restarting preparation', async () => {
  const app = harness();
  await app.click('camera-start'); app.advance(.1); await app.click('calibrate'); app.until('neutral');
  app.advance(1);
  app.camera.faces = app.camera.faces.map(face => ({...face, x: .65}));
  app.advance(1.2);
  assert.equal(app.state().phase, 'neutral', 'movement restarts the hold in the centering step');
  assert.equal(app.ids.get('camera-panel').hidden, false);
  assert.equal(app.state().calibrated, false);
  app.advance(.2, false);
  assert.equal(app.state().phase, 'neutral');
  app.advance(1.5);
  assert.equal(app.state().phase, 'neutral', 'recovered tracking needs a fresh continuous hold');
  app.until('testLeft');
  assert.equal(app.state().elapsed, undefined);
});

test('crowded buddy framing explains insufficient steering room before starting control checks', async () => {
  const app = harness(); app.choose('players', 2); app.choose('control', 'face');
  await app.click('camera-start');
  app.camera.faces = app.camera.faces.map((face, i) => ({...face, x: i === 0 ? .55 : .45, width: .15}));
  app.advance(.1); await app.click('calibrate'); app.until('neutral'); app.until('framing');
  assert.match(app.ids.get('camera-copy').textContent, /room to steer/);
  assert.equal(app.ids.get('camera-panel').hidden, false);
  assert.equal(app.state().elapsed, undefined, 'framing failure never creates or spends a flight');
  assert.deepEqual(app.state().clocks, []);
});

test('face control checks require both players to hold a useful left shift, then a useful right shift', async () => {
  const app = harness(); app.choose('players', 2); app.choose('control', 'face');
  await app.click('camera-start'); app.advance(.1); await app.click('calibrate'); app.until('testLeft');
  const faces = app.camera.faces.map(face => ({...face}));
  const shift = offsets => { app.camera.faces = faces.map((face, i) => ({...face, x: face.x + offsets[i]})); };
  app.advance(3); assert.equal(app.state().phase, 'testLeft', 'time alone never proves a control');
  shift([.04, .04]); app.advance(1);
  assert.equal(app.state().phase, 'testLeft', 'movement smaller than the gameplay threshold does not pass');
  shift([.1, 0]); app.advance(1);
  assert.equal(app.state().phase, 'testLeft', 'P1 cannot complete the check for P2');
  shift([.1, .1]); app.advance(.2);
  assert.equal(app.state().phase, 'testLeft', 'a brief crossing is insufficient');
  shift([0, 0]); app.advance(.2);
  shift([.1, .1]); app.advance(.2);
  assert.equal(app.state().phase, 'testLeft', 'separate short crossings cannot accumulate into a hold');
  app.until('testRight');
  assert.equal(app.state().elapsed, undefined);
  shift([-.1, .1]); app.advance(1);
  assert.equal(app.state().phase, 'testRight', 'both players must also prove right steering');
  shift([-.1, -.1]); app.until('countdown');
  assert.equal(app.state().elapsed, 0);
  shift([0, 0]); app.until('playing');
});

test('a single remaining face freezes both flights and cannot take over the other player', async () => {
  const app = harness(); await app.launchCamera({buddy: true});
  app.camera.faces[0].x = .68; app.advance(.6);
  assert.deepEqual(app.state().lanes, [1, 0]);
  const before = app.state(), both = app.camera.faces;
  app.camera.faces = [{...both[1], x: .1, brow: .9}]; app.camera.emit();
  assert.equal(app.state().phase, 'playing');
  app.key('ArrowRight'); app.pointer('p2-right'); app.advance(3);
  assert.equal(app.state().elapsed, before.elapsed);
  assert.equal(app.state().score, before.score);
  assert.deepEqual(app.state().clocks, before.clocks);
  assert.deepEqual(app.state().lanes, before.lanes);
  app.camera.faces = both; app.advance(.5);
  assert.equal(app.state().elapsed, before.elapsed);
  app.until('playing'); app.advance(.2);
  assert.ok(app.state().elapsed > before.elapsed);
});

test('rotation preserves calibration and neither rotation nor a stalled frame needs a tap', async () => {
  const app = harness(); await app.launchCamera({buddy:true}); app.advance(1);
  const elapsed = app.state().elapsed;
  app.rotate(); assert.equal(app.state().phase,'playing');
  assert.equal(app.state().calibrated,true);
  app.stall(2); assert.equal(app.state().elapsed,elapsed);
  app.until('playing'); app.advance(.2);
  assert.ok(app.state().elapsed>elapsed);
  assert.equal(app.camera.starts.length,1);
});

test('camera setup starts itself once framed and shows directional cues without another tap', async () => {
  const app = harness();
  await app.click('camera-start'); app.until('prep');
  assert.equal(app.ids.get('prep-cue').attributes['data-action'],'stay');
  app.until('neutral'); assert.equal(app.ids.get('prep-cue-label').textContent,'STAY HERE');
  app.until('testLeft'); assert.equal(app.ids.get('prep-cue').attributes['data-action'],'left');
  app.camera.faces[0].x=.6; app.until('testRight');
  assert.equal(app.ids.get('prep-cue').attributes['data-action'],'right');
  app.camera.faces[0].x=.4; app.until('playing');
});

test('returning from the background recovers hands-free, but manual pause stays paused', async () => {
  const app = harness(); await app.launchCamera(); app.advance(1);
  const elapsed=app.state().elapsed;
  app.document.hidden=true;app.document.dispatch('visibilitychange');app.advance(10);
  assert.equal(app.state().elapsed,elapsed);
  app.document.hidden=false;app.document.dispatch('visibilitychange');
  assert.equal(app.state().phase,'tracking');
  app.until('playing');assert.equal(app.state().elapsed,elapsed);
  await app.click('pause');
  app.document.hidden=true;app.document.dispatch('visibilitychange');app.advance(2);
  app.document.hidden=false;app.document.dispatch('visibilitychange');app.advance(2);
  assert.equal(app.state().phase,'paused');
});

test('running out of hearts renders an honest early finish and saves coins separately from old points', async () => {
  const app=harness(); await app.click('practice-start');app.until('playing');app.advance(30);
  assert.equal(app.state().phase,'results');assert.equal(app.state().health,0);
  assert.equal(app.ids.get('result-kicker').textContent,'OUT OF HEARTS');
  assert.ok(app.state().elapsed<30);
  assert.ok(app.storage.has('plank_pilot_coins_v3_practice_30'));
});
