import test from 'node:test';
import assert from 'node:assert/strict';
import { PlankCamera } from '../game/plank-camera.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function stream() {
  const track = new EventTarget();
  track.stops = 0;
  track.stop = () => { track.stops++; };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

function video() {
  return {
    srcObject: null, readyState: 2, videoWidth: 640, currentTime: 0,
    setAttribute() {}, play: async () => {}, pause() {},
  };
}

function faceResult(x = 0.3, brow = 0.7) {
  const landmarks = [];
  landmarks[33] = { x: x - 0.1 };
  landmarks[263] = { x: x + 0.1 };
  return {
    faceLandmarks: [landmarks],
    faceBlendshapes: [{ categories: [{ categoryName: 'browInnerUp', score: brow }] }],
  };
}

function model(results = [faceResult()]) {
  return {
    closes: 0, detections: 0,
    close() { this.closes++; },
    detectForVideo() {
      const result = results[Math.min(this.detections++, results.length - 1)];
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function controller(cameraSource, modelSource, callbacks = {}, element = video()) {
  const camera = new PlankCamera(element, callbacks);
  camera._openCamera = () => Promise.resolve(typeof cameraSource === 'function' ? cameraSource() : cameraSource);
  camera._loadModel = () => Promise.resolve(typeof modelSource === 'function' ? modelSource() : modelSource);
  return { camera, element };
}

const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

test('stopping while permission and model are pending resolves promptly and releases late resources', async () => {
  const permission = deferred();
  const loading = deferred();
  const media = stream();
  const tracker = model();
  const errors = [];
  const { camera, element } = controller(permission.promise, loading.promise, { onError: error => errors.push(error) });
  const starting = camera.start();
  camera.stop();
  assert.equal(await starting, false);
  permission.resolve(media);
  loading.resolve(tracker);
  await flush();
  assert.equal(media.track.stops, 1);
  assert.equal(tracker.closes, 1);
  assert.equal(element.srcObject, null);
  assert.deepEqual(errors, []);
});

test('late resources from an old start do not replace or stop a new session', async t => {
  const oldPermission = deferred();
  const oldLoading = deferred();
  const oldMedia = stream();
  const oldTracker = model();
  const currentMedia = stream();
  const currentTracker = model();
  let opens = 0, loads = 0;
  const { camera, element } = controller(
    () => ++opens === 1 ? oldPermission.promise : currentMedia,
    () => ++loads === 1 ? oldLoading.promise : currentTracker,
  );
  t.after(() => camera.stop());
  const previous = camera.start();
  camera.stop();
  assert.equal(await previous, false);
  assert.equal(await camera.start(), true);
  oldPermission.resolve(oldMedia);
  oldLoading.resolve(oldTracker);
  await flush();
  assert.equal(element.srcObject, currentMedia);
  assert.equal(oldMedia.track.stops, 1);
  assert.equal(oldTracker.closes, 1);
  assert.equal(currentMedia.track.stops, 0);
  assert.equal(currentTracker.closes, 0);
  assert.equal(await camera.start(), true);
  assert.equal(opens, 2);
});

test('model failure releases an already granted camera and reports the failure once', async () => {
  const loading = deferred();
  const media = stream();
  const errors = [];
  const { camera } = controller(media, loading.promise, { onError: error => errors.push(error) });
  const starting = camera.start();
  await flush();
  loading.reject(new Error('Model download failed'));
  await assert.rejects(starting, /Model download failed/);
  assert.equal(media.track.stops, 1);
  assert.equal(errors.length, 1);
  camera.stop();
  assert.equal(media.track.stops, 1);
});

test('samples remain unmirrored; missing faces are edge-triggered; unchanged frames are skipped', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const media = stream();
  const tracker = model([faceResult(), { faceLandmarks: [] }, { faceLandmarks: [] }, faceResult(0.8, 0.2)]);
  const samples = [];
  const { camera, element } = controller(media, tracker, { onSample: sample => samples.push(sample) });
  t.after(() => camera.stop());
  await camera.start();
  assert.equal(samples[0].visible, true);
  assert.ok(Math.abs(samples[0].x - 0.3) < 1e-10);
  assert.equal(samples[0].brow, 0.7);
  t.mock.timers.tick(70);
  assert.equal(tracker.detections, 1);
  element.currentTime = 1;
  t.mock.timers.tick(70);
  element.currentTime = 2;
  t.mock.timers.tick(70);
  assert.equal(samples.length, 2);
  assert.equal(samples[1].visible, false);
  element.currentTime = 3;
  t.mock.timers.tick(70);
  assert.equal(samples.length, 3);
  assert.equal(samples[2].visible, true);
  assert.ok(Math.abs(samples[2].x - 0.8) < 1e-10);
  camera.pause();
  element.currentTime = 4;
  t.mock.timers.tick(1000);
  assert.equal(tracker.detections, 4);
  assert.equal(samples.at(-1).visible, false);
  camera.resume();
  assert.equal(tracker.detections, 5);
  assert.equal(samples.at(-1).visible, true);
});

test('an inference exception closes model and camera instead of leaving an active stream', async () => {
  const media = stream();
  const tracker = model([new Error('Delegate stopped')]);
  const errors = [];
  const { camera, element } = controller(media, tracker, { onError: error => errors.push(error) });
  await assert.rejects(camera.start(), /Face tracking stopped/);
  assert.equal(errors.length, 1);
  assert.equal(media.track.stops, 1);
  assert.equal(tracker.closes, 1);
  assert.equal(element.srcObject, null);
});

test('browser-ended camera track freezes input and cleans up once', async () => {
  const media = stream();
  const tracker = model();
  const samples = [], errors = [];
  const { camera } = controller(media, tracker, {
    onSample: sample => samples.push(sample), onError: error => errors.push(error),
  });
  await camera.start();
  media.track.dispatchEvent(new Event('ended'));
  media.track.dispatchEvent(new Event('ended'));
  assert.equal(samples.at(-1).visible, false);
  assert.equal(errors.length, 1);
  assert.equal(media.track.stops, 1);
  assert.equal(tracker.closes, 1);
});

test('startup has a deadline and closes a model that finishes after the timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const loading = deferred();
  const media = stream();
  const tracker = model();
  const errors = [];
  const { camera } = controller(media, loading.promise, { onError: error => errors.push(error) });
  const starting = camera.start();
  await flush();
  t.mock.timers.tick(30001);
  await assert.rejects(starting, /setup took too long/);
  loading.resolve(tracker);
  await flush();
  assert.equal(media.track.stops, 1);
  assert.equal(tracker.closes, 1);
  assert.equal(errors.length, 1);
});

test('stop cancels an outstanding video.play without disturbing a later start', async t => {
  const playing = deferred();
  const oldMedia = stream(), currentMedia = stream();
  const oldTracker = model(), currentTracker = model();
  const element = video();
  let plays = 0, opens = 0, loads = 0;
  element.play = () => ++plays === 1 ? playing.promise : Promise.resolve();
  const { camera } = controller(
    () => ++opens === 1 ? oldMedia : currentMedia,
    () => ++loads === 1 ? oldTracker : currentTracker,
    {}, element,
  );
  t.after(() => camera.stop());
  const starting = camera.start();
  await flush();
  camera.stop();
  assert.equal(await starting, false);
  await camera.start();
  playing.resolve();
  await flush();
  assert.equal(element.srcObject, currentMedia);
  assert.equal(oldMedia.track.stops, 1);
  assert.equal(oldTracker.closes, 1);
  assert.equal(currentMedia.track.stops, 0);
});

test('resume restarts video paused by a mobile interruption and stop cancels pending playback', async t => {
  const media = stream(), tracker = model();
  const playing = deferred();
  const element = video();
  const { camera } = controller(media, tracker, {}, element);
  t.after(() => camera.stop());
  await camera.start();
  camera.pause();
  element.paused = true;
  let plays = 0;
  element.play = () => { plays++; return playing.promise; };
  const resuming = camera.resume();
  assert.equal(plays, 1);
  assert.equal(tracker.detections, 1);
  element.currentTime = 1;
  playing.resolve();
  assert.equal(await resuming, true);
  assert.equal(tracker.detections, 2);
  camera.pause();
  const interrupted = deferred();
  element.play = () => interrupted.promise;
  const pendingResume = camera.resume();
  camera.stop();
  assert.equal(await pendingResume, false);
  interrupted.resolve();
  await flush();
  assert.equal(media.track.stops, 1);
  assert.equal(tracker.closes, 1);
  assert.equal(tracker.detections, 2);
});

test('a camera whose frames stop advancing emits an invisible sample after the grace period', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const samples = [];
  const { camera } = controller(stream(), model(), { onSample: sample => samples.push(sample) });
  t.after(() => camera.stop());
  await camera.start();
  now = 700;
  t.mock.timers.tick(70);
  assert.deepEqual(samples.map(sample => sample.visible), [true, false]);
  now = 900;
  t.mock.timers.tick(70);
  assert.equal(samples.length, 2);
});
