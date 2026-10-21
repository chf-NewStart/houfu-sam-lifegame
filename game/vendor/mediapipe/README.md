# MediaPipe, served from this site

Face tracking for Plank Constant in the browser (`game/plank-camera.js`), copied here so that
nothing is loaded from jsdelivr or Google's storage, which are slow or unreachable in mainland China.

- `tasks-vision-0.10.32/`: `vision_bundle.mjs` and `wasm/*` from the npm package
  `@mediapipe/tasks-vision@0.10.32` (Google, Apache License 2.0,
  https://www.apache.org/licenses/LICENSE-2.0), unchanged.
- `face_landmarker-float16-v1.task`: the Face Landmarker model, unchanged, from
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
  (sha256 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff).

To update: `npm pack @mediapipe/tasks-vision@<version>`, copy the same files into a new
`tasks-vision-<version>/` folder, and change `VISION_VERSION` in `plank-camera.js`.
