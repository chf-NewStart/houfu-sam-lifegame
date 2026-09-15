# Plank Pilot — browser experiment

Open `/game/plank.html` directly or choose **plank_pilot.exe** in the WIP lab. Dodge obstacles with a cyan ship while a **30, 45, 60, or 90-second** target round counts down.

## Controls and setup

1. Start with **practice mode while seated**. Touch controls or the keyboard let you learn the game without granting camera access.
2. For hands-free play, place the phone securely in front of you with its front camera able to see your face. Adjust the phone angle so you can look at it comfortably without craning your neck.
3. Choose camera control: **small face shifts** steer left and right, or **raised eyebrows** switch lanes. Use calibration in the position you intend to play from. Make only small, comfortable movements; move the phone or use eyebrow mode if steering requires exaggerated movement.
4. Choose a round length you already find manageable. Follow the setup and start prompts; the round countdown gives you time to settle into position.
5. Rest when needed. The camera tracks the face for input; it does **not** verify full-body plank form or measure exercise quality.

## Camera, network, and privacy

- Camera mode requires camera permission and a secure browser context: HTTPS, or `localhost` when testing on the same machine. Opening an ordinary `http://192.168…` development address on a phone does not provide that secure context.
- Face processing runs on the device. The game does not record or upload camera footage.
- Camera mode downloads the MediaPipe runtime and face model from external hosts. Those asset requests require network access; do not assume camera mode works fully offline.
- Touch/keyboard practice works without camera permission and is useful when camera access or model loading fails.

## Real-phone testing checklist

**Status: browser visual verification and physical iPhone Safari / Android Chrome camera validation are pending.** Automated rules and mocked camera lifecycle tests pass; the available cloud browser could not access the local preview. Simulated camera checks cannot establish phone compatibility or a comfortable plank setup.

Use an HTTPS deployment of the branch containing this game. Test in the full Safari app on iPhone and the full Chrome app on Android, starting while seated:

1. Open the WIP card and confirm the page fits the screen in portrait and landscape. Check that setup buttons remain reachable without horizontal scrolling.
2. Run a 30-second practice round without camera access. Verify left/right controls, obstacles, pause/restart, countdown, and end-of-round results.
3. Choose camera mode. Allow the front camera and wait for the runtime/model download. Confirm that the preview and tracking status are useful before starting.
4. Calibrate and test both control modes. Confirm that small face shifts steer in the expected direction and that a single eyebrow gesture changes lanes once, without repeated unintended switching.
5. Move out of view, cover the camera, background the browser, and return. Check that the game clearly handles tracking loss or interruption and lets you resume or recalibrate without a surprise collision.
6. End a camera session and leave the game. Check that the browser camera indicator turns off when the session releases the camera. Repeat with permission denied and with the model host unavailable; practice should remain available and errors should explain how to continue.
7. After seated checks pass, try the shortest round with the phone in a comfortable plank viewing position. Record phone model, OS/browser versions, control mode, lighting, tracking stability, and any lag or neck discomfort. Test longer round choices only as appropriate for the tester.

## Local development and iOS shell

From the repository root, `python3 -m http.server 8080` serves practice at `http://localhost:8080/game/plank.html` on the same computer. A real phone needs an HTTPS development or preview URL for camera testing.

This is initially a **browser** experiment. The checked-in Capacitor shell's `app/ios/App/App/Info.plist` currently lacks `NSCameraUsageDescription`. Before bundling camera play in that native shell, add an appropriate camera usage description, resync the site assets, and verify camera permission and model loading on a physical iOS device. Those native changes are not part of this prototype.

The game currently directs native-shell users to a browser for camera play; practice remains available. To run the automated checks from the repository root:

```sh
node --test tests/plank-*.test.mjs
```

Tracking uses pinned `@mediapipe/tasks-vision@0.10.32` and the `face_landmarker/float16/1` model. See Google's [Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) for its landmark and expression APIs. A Screen Wake Lock is requested during active rounds when supported; it is not guaranteed by every browser.
