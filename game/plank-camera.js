// Frames stay in this browser. Only landmark coordinates and an expression score
// leave this controller; neither video nor images are recorded or uploaded.
const VISION_VERSION = '0.10.32';
const VISION_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FRAME_INTERVAL = 1000 / 15;
const FRAME_STALE_MS = 500;
const STARTUP_TIMEOUT_MS = 30000;
const CANCELLED = Symbol('camera startup cancelled');

/**
 * Front-camera input for Plank Pilot.
 *
 * start(): resolves true when ready, false when stopped during startup; failures
 * also call onError(Error) and reject. Repeated starts reuse the active session.
 * onStatus receives starting | running | paused | stopped | error.
 * onSample receives { visible, x, brow, time }; x is NOT selfie-mirrored and time
 * uses performance.now(). A missing/stalled face emits one invisible sample until
 * a face is visible again. The app owns calibration and gesture interpretation.
 */
export class PlankCamera {
  constructor(video, { onSample = () => {}, onError = () => {}, onStatus = () => {} } = {}) {
    if (!video) throw new TypeError('A video element is required.');
    this.video = video;
    this.callbacks = { onSample, onError, onStatus };
    this._run = null;
  }

  async start() {
    if (this._run) return this._run.startPromise;

    const run = {
      active: true,
      ready: false,
      paused: false,
      visible: null,
      stream: null,
      model: null,
      timer: null,
      timeout: null,
      lastVideoTime: -1,
      lastFrameAt: performance.now(),
      lastX: 0.5,
      resumeId: 0,
      removers: [],
    };
    run.cancelPromise = new Promise(resolve => { run.cancel = () => resolve(CANCELLED); });
    this._run = run;
    this._notify('onStatus', 'starting');
    run.startPromise = this._start(run);
    return run.startPromise;
  }

  async _start(run) {
    if (!this._isCurrent(run)) return false;
    const deadline = new Promise((_, reject) => {
      run.timeout = setTimeout(() => reject(new Error(
        'Camera setup took too long. Check camera permission and your connection, then try again.'
      )), STARTUP_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([this._prepare(run), run.cancelPromise, deadline]);
      if (result === CANCELLED || !this._isCurrent(run)) {
        if (run.failure) throw run.failure;
        return false;
      }
      clearTimeout(run.timeout);
      run.timeout = null;
      run.ready = true;
      this._notify('onStatus', run.paused ? 'paused' : 'running');
      if (!run.paused) this._tick(run);
      if (run.failure) throw run.failure;
      return true;
    } catch (error) {
      if (run.failure) throw run.failure;
      if (!this._isCurrent(run)) return false;
      this._fail(run, error);
      throw error;
    } finally {
      clearTimeout(run.timeout);
      run.timeout = null;
    }
  }

  async _prepare(run) {
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');

    // Attach ownership handlers before waiting: late results after cancellation
    // must still release their camera tracks or model allocation.
    const streamPromise = this._openCamera().then(stream => {
      if (!this._isCurrent(run)) {
        this._stopTracks(stream);
        return null;
      }
      run.stream = stream;
      for (const track of stream.getVideoTracks()) {
        const ended = () => this._fail(run, new Error('The camera stopped. Start the camera again to continue.'));
        const muted = () => { if (this._isCurrent(run)) this._emitInvisible(run); };
        track.addEventListener('ended', ended);
        track.addEventListener('mute', muted);
        run.removers.push(() => {
          track.removeEventListener('ended', ended);
          track.removeEventListener('mute', muted);
        });
      }
      return stream;
    });
    const modelPromise = this._loadModel(run).then(model => {
      if (!this._isCurrent(run)) {
        this._closeModel(model);
        return null;
      }
      run.model = model;
      return model;
    });
    await Promise.all([streamPromise, modelPromise]);
    if (!this._isCurrent(run)) return CANCELLED;
    this.video.srcObject = run.stream;
    await this.video.play();
    if (!this._isCurrent(run)) return CANCELLED;
    run.lastFrameAt = performance.now();
    return true;
  }

  async _openCamera() {
    if (globalThis.isSecureContext === false) {
      throw new Error('Camera play needs a secure HTTPS page.');
    }
    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot open the camera. Try Safari or Chrome.');
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 } },
      });
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Camera access was not allowed. Enable camera permission for this page and try again.', { cause: error });
      }
      if (error.name === 'NotFoundError') {
        throw new Error('No camera was found. Try a device with a front camera.', { cause: error });
      }
      throw new Error('The camera could not start. Close other apps using it and try again.', { cause: error });
    }
  }

  async _loadModel(run) {
    const { FaceLandmarker, FilesetResolver } = await import(`${VISION_ROOT}/vision_bundle.mjs`);
    if (!this._isCurrent(run)) return null;
    const files = await FilesetResolver.forVisionTasks(`${VISION_ROOT}/wasm`);
    if (!this._isCurrent(run)) return null;
    const options = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    };
    try {
      return await FaceLandmarker.createFromOptions(files, options);
    } catch (error) {
      // Some mobile browsers cannot allocate the GPU delegate. The same pinned
      // model can run on the CPU; never start that retry for a cancelled session.
      if (!this._isCurrent(run)) return null;
      return FaceLandmarker.createFromOptions(files, {
        ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    }
  }

  pause() {
    const run = this._run;
    if (!run || run.paused) return;
    run.paused = true;
    run.resumeId++;
    clearTimeout(run.timer);
    run.timer = null;
    this._emitInvisible(run);
    this._notify('onStatus', 'paused');
  }

  async resume() {
    const run = this._run;
    if (!run || !run.paused) return false;
    run.paused = false;
    const resumeId = ++run.resumeId;
    if (!run.ready) return false;
    try {
      // Mobile interruptions can pause the video element even while its camera
      // track remains live. Resume playback before accepting camera samples.
      if (this.video.paused) {
        const result = await Promise.race([this.video.play(), run.cancelPromise]);
        if (result === CANCELLED) return false;
      }
      if (!this._isCurrent(run) || run.paused || resumeId !== run.resumeId) return false;
      run.lastFrameAt = performance.now();
      this._notify('onStatus', 'running');
      this._tick(run);
      return this._isCurrent(run);
    } catch (error) {
      if (this._isCurrent(run) && !run.paused && resumeId === run.resumeId) {
        this._fail(run, new Error('Camera playback could not resume. Start the camera again to continue.', { cause: error }));
      }
      return false;
    }
  }

  stop() {
    const run = this._run;
    if (!run) return;
    this._finish(run);
    this._notify('onStatus', 'stopped');
  }

  _tick(run) {
    if (!this._isCurrent(run) || run.paused) return;
    const time = performance.now();
    try {
      if (this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.currentTime !== run.lastVideoTime) {
        run.lastVideoTime = this.video.currentTime;
        run.lastFrameAt = time;
        const result = run.model.detectForVideo(this.video, time);
        const face = result.faceLandmarks?.[0];
        const left = face?.[33];
        const right = face?.[263];
        if (Number.isFinite(left?.x) && Number.isFinite(right?.x)) {
          const x = Math.max(0, Math.min(1, (left.x + right.x) / 2));
          const score = result.faceBlendshapes?.[0]?.categories?.find(category => category.categoryName === 'browInnerUp')?.score;
          run.visible = true;
          run.lastX = x;
          this._notify('onSample', { visible: true, x, brow: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0, time });
        } else {
          this._emitInvisible(run, time);
        }
      } else if (time - run.lastFrameAt >= FRAME_STALE_MS) {
        this._emitInvisible(run, time);
      }
    } catch (error) {
      this._fail(run, new Error('Face tracking stopped. Start the camera again to retry.', { cause: error }));
      return;
    }
    if (this._isCurrent(run) && !run.paused) {
      // Schedule after inference finishes: never more than 15 detections/second,
      // even when inference is slow. Rendering uses the app's own frame loop.
      run.timer = setTimeout(() => this._tick(run), FRAME_INTERVAL);
    }
  }

  _emitInvisible(run, time = performance.now()) {
    if (run.visible === false) return;
    run.visible = false;
    this._notify('onSample', { visible: false, x: run.lastX, brow: 0, time });
  }

  _fail(run, error) {
    if (!this._isCurrent(run)) return;
    run.failure = error instanceof Error ? error : new Error(String(error));
    this._finish(run);
    this._notify('onStatus', 'error');
    this._notify('onError', run.failure);
  }

  _finish(run) {
    run.active = false;
    if (this._run === run) this._run = null;
    run.cancel();
    clearTimeout(run.timer);
    clearTimeout(run.timeout);
    run.timer = null;
    run.timeout = null;
    for (const remove of run.removers) remove();
    run.removers = [];
    this._stopTracks(run.stream);
    this._closeModel(run.model);
    if (this.video.srcObject === run.stream) {
      this.video.pause();
      this.video.srcObject = null;
    }
    run.model = null;
    run.stream = null;
    this._emitInvisible(run);
  }

  _isCurrent(run) {
    return run.active && this._run === run;
  }

  _stopTracks(stream) {
    for (const track of stream?.getTracks() || []) {
      try { track.stop(); } catch { /* Already released by the browser. */ }
    }
  }

  _closeModel(model) {
    try { model?.close(); } catch { /* Cleanup must still release the camera. */ }
  }

  _notify(name, value) {
    try { this.callbacks[name](value); }
    catch (error) { console.error(`PlankCamera ${name} callback failed:`, error); }
  }
}
