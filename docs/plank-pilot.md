# Plank Pilot — browser experiment

Open `/game/plank.html` directly or choose **plank_pilot.exe** in the WIP lab. Fly a pixel selfie through rocks and gold coins. Each pilot starts with **three hearts**: a collision costs one heart, while the opposite lane has a coin. Coins already collected are never subtracted. At zero hearts a solo round ends; in co-op that pilot spectates until their buddy finishes or also runs out of hearts. Pick **30, 45, 60, or 90 seconds**, or enter **Custom seconds** (any whole number from 1 to 3,600). Typing a custom duration replaces the preset selection; choosing a preset clears the custom field. Both solo and buddy flights use the entered duration.

## One phone, two gym buddies

Choose **Buddy · one phone** and turn the phone sideways. Place it between you at a distance where its front camera can see both faces at once. The left person in the mirrored preview controls P1's cyan half; the right person controls P2's purple half. Stay on those sides during the round. A missed detection freezes hazards and the shared clock quietly. A tracking notice appears only after a one-second gap. When tracking is stable for 0.75 seconds, play resumes automatically; brief misses no longer open a pause menu or restart a three-second countdown.

Both players calibrate together. Eyebrow switching is selected initially in buddy mode; each person's raised eyebrows move only their own pixel face. Small face shifts are also available. The flights share an obstacle sequence and finish together. Individual coin counts are added, with one extra team coin for each obstacle both players clear. Coin records use a new storage key so old point scores do not appear as coin records.

**Live face background** enlarges each face behind its own game zone. Use the slider to adjust visibility, or turn it off for the starfield. These crops are only a display effect: the detector always reads the original, uncropped camera frame. Neither player needs an account, room code, or second phone.

Camera-free buddy practice has four touch buttons, two per half. On a keyboard, P1 uses A/D and P2 uses the arrow keys. Space pauses both.

## Controls and setup

1. Start with **practice mode while seated**. Touch controls or the keyboard let you learn the game without granting camera access.
2. For hands-free play, place the phone securely in front of you with its front camera able to see your face. Adjust the phone angle so you can look at it comfortably without craning your neck.
3. Choose camera control: **small face shifts** steer left and right, or **raised eyebrows** switch lanes. Use calibration in the position you intend to play from. Make only small, comfortable movements; move the phone or use eyebrow mode if steering requires exaggerated movement.
4. Choose a round length you already find manageable. Follow the four labeled prep stages: **Frame → Center → Controls → Fly**. After the camera sees the required faces for 0.8 seconds, setup starts automatically. Five seconds let you settle into position before centering begins. The initial camera-permission button is at the top on landscape phones; no later start tap is needed. The center stage records two seconds of stillness; movement or a missing face restarts that hold. Eyebrow mode checks a sustained raise and a relaxed expression; face mode checks a small left shift and then a right shift. Both players must pass each control check together. A separate three-second countdown starts the flight only after these checks pass.
5. Rest when needed. The camera tracks the face for input; it does **not** verify full-body plank form or measure exercise quality.

Large pixel arrows indicate left, right, and raised eyebrows; a square hold marker indicates staying still. The live preview stays visible throughout preparation. The current step, next action, hold progress, and individual pilot status distinguish settling, measuring a center, checking controls, and launching. No flight time is spent in preparation.

## Camera, network, and privacy

- Camera mode requires camera permission and a secure browser context: HTTPS, or `localhost` when testing on the same machine. Opening an ordinary `http://192.168…` development address on a phone does not provide that secure context.
- Face processing runs on the device. The renderer periodically crops a **20 × 20 pixel selfie** from the live frame and uses it as the player avatar. These tiny canvases exist only in memory for the round and are cleared on return to setup. No photos or video are persisted or uploaded. Camera-free practice uses original pixel face sprites.
- Camera mode downloads the MediaPipe runtime and face model from external hosts. Those asset requests require network access; do not assume camera mode works fully offline.
- Touch/keyboard practice works without camera permission and is useful when camera access or model loading fails.

## Real-phone testing checklist

**Status: physical iPhone Safari / Android Chrome two-person camera validation is pending.** Automated rules, application flows, mocked camera lifecycle, and rendering geometry tests cover solo and shared-phone play. Simulated camera checks cannot establish phone compatibility, two-face tracking quality, or a comfortable plank setup.

Use an HTTPS deployment of the branch containing this game. Test in the full Safari app on iPhone and the full Chrome app on Android, starting while seated:

1. Open the WIP card and confirm the page fits the screen in portrait and landscape. Check that setup buttons remain reachable without horizontal scrolling.
2. Run a 30-second practice round without camera access. Verify left/right controls, obstacles, pause/restart, countdown, and end-of-round results.
3. Choose camera mode. Allow the front camera and wait for the runtime/model download. Confirm that the preview and tracking status are useful before starting.
4. Calibrate and test both control modes. Confirm that small face shifts steer in the expected direction and that a single eyebrow gesture changes lanes once, without repeated unintended switching. In buddy mode, verify each person's gesture only affects their own half, both face crops are assigned correctly, and an absent player freezes both games.
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

Tracking uses pinned `@mediapipe/tasks-vision@0.10.32` and the `face_landmarker/float16/1` model. See Google's [Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js) for its landmark and expression APIs. A Screen Wake Lock is requested throughout setup and play when supported, and reacquired after an interruption. A true hidden tab freezes the round; returning recovers automatically while an intentional manual pause remains paused. Browser stalls discard elapsed wall time instead of requiring a tap. Rotation resizes the view without resetting calibration; reposition/recalibrate remains available from Pause if the camera angle changes. A paused camera video attempts playback recovery without opening a second stream.

`tests/plank-layout.html` is a developer-only simulated layout fixture. It displays the actual page inside phone-sized frames for visual and geometry checks, without requesting a camera. Its sample states are not a playable mode or evidence of real camera tracking.

The local `game/plank-pixel.woff` font is an original 5 × 7 bitmap design. Rebuild it with `python scripts/build-plank-font.py` (fonttools required); runtime play needs no font CDN.
