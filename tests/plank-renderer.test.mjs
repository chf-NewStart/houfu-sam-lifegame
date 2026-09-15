import test from 'node:test';
import assert from 'node:assert/strict';
import { PlankRenderer, calculateFaceCrop } from '../game/plank-renderer.js';

const face = (x = .2, y = .15) => ({ bounds: { x, y, width: .18, height: .36 } });

test('face crops preserve video pixel aspect and remain within frame at every edge', () => {
  for (const [videoWidth, videoHeight] of [[640, 480], [1280, 720], [720, 1280]]) {
    for (const [width, height] of [[422, 330], [333.5, 315], [284, 260], [195, 700]]) {
      for (const [x, y] of [[0, 0], [.82, 0], [0, .64], [.82, .64], [.4, .3]]) {
        const crop = calculateFaceCrop(face(x, y), videoWidth, videoHeight, width, height);
        assert.ok(crop.x >= 0 && crop.y >= 0);
        assert.ok(crop.x + crop.width <= videoWidth + 1e-8);
        assert.ok(crop.y + crop.height <= videoHeight + 1e-8);
        assert.ok(Math.abs(crop.width / crop.height - width / height) < 1e-8,
          'drawing this crop into its half must not stretch the face');
      }
    }
  }
});

test('missing or invalid camera geometry has no crop', () => {
  assert.equal(calculateFaceCrop(null, 640, 480, 422, 330), null);
  assert.equal(calculateFaceCrop(face(), 0, 480, 422, 330), null);
  assert.equal(calculateFaceCrop(face(), 640, 480, 422, 0), null);
  assert.equal(calculateFaceCrop(face(NaN), 640, 480, 422, 330), null);
});

function harness() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, name) => name === 'createRadialGradient'
      ? () => ({ addColorStop() {} })
      : (...args) => calls.push({ name, args }),
  });
  const renderer = new PlankRenderer({ getContext: () => ctx });
  renderer.resize(844, 330);
  calls.length = 0;
  return { renderer, calls };
}

test('one video supplies distinct mirrored crops inside equal clipped player halves', () => {
  const { renderer, calls } = harness();
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480 };
  renderer.draw({ players: 2, cameraActive: true, video, faces: [face(.65), face(.1)], dt: .05 });
  const images = calls.filter(call => call.name === 'drawImage');
  assert.equal(images.length, 2);
  assert.equal(images[0].args[0], video);
  assert.equal(images[1].args[0], video);
  assert.ok(images[0].args[1] > images[1].args[1], 'each pilot sees their own source face');
  assert.deepEqual(images.map(call => call.args.slice(5)), [[0, 0, 422, 330], [0, 0, 422, 330]]);
  assert.deepEqual(calls.filter(call => call.name === 'rect').map(call => call.args),
    [[0, 0, 422, 330], [422, 0, 422, 330]]);
  assert.equal(calls.filter(call => call.name === 'clip').length, 2);
  assert.deepEqual(calls.filter(call => call.name === 'scale').map(call => call.args), [[-1, 1], [-1, 1]]);
});

test('losing tracking immediately removes cached face imagery', () => {
  const { renderer, calls } = harness();
  const options = { players: 2, cameraActive: true, dt: .05,
    video: { readyState: 2, videoWidth: 640, videoHeight: 480 }, faces: [face(.65), face(.1)] };
  renderer.draw(options);
  calls.length = 0;
  renderer.draw({ ...options, cameraActive: false });
  assert.equal(calls.filter(call => call.name === 'drawImage').length, 0);
  assert.ok(calls.some(call => call.name === 'fillRect'), 'starfield fallback is drawn');
});

test('video without a decoded frame uses the fallback', () => {
  const { renderer, calls } = harness();
  renderer.draw({ cameraActive: true, video: { readyState: 1, videoWidth: 640, videoHeight: 480 }, faces: [face()] });
  assert.equal(calls.filter(call => call.name === 'drawImage').length, 0);
});

test('a changed camera resolution discards old pixel crops without a canvas resize', () => {
  const { renderer, calls } = harness();
  const video = { readyState: 2, videoWidth: 1280, videoHeight: 720 };
  const options = { players: 2, cameraActive: true, dt: .01, video, faces: [face(.78), face(.02)] };
  renderer.draw(options);
  calls.length = 0;
  video.videoWidth = 640; video.videoHeight = 480;
  renderer.draw(options);
  const images = calls.filter(call => call.name === 'drawImage');
  for (let index = 0; index < 2; index++) {
    const expected = calculateFaceCrop(options.faces[index], 640, 480, 422, 330);
    assert.deepEqual(images[index].args.slice(1, 5), [expected.x, expected.y, expected.width, expected.height]);
  }
});
