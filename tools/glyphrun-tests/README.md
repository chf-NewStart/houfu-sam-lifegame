# Glyph Run: test tools

Headless-Chrome checks for `game/glyphrun-next.html` (the preview) and `game/glyphrun.html`. Start a local server from the repo root first: `python3 -m http.server 8765`.

- `bughunt2.mjs <outDir> <seconds> [mobile]`: a bot that plays (random walking, dashing, buying in the market, clicking through every screen) and logs every uncaught error and screen change. `CHAR=<index>` picks the character, `PAGE=<url>` another page.
- `fxshot.mjs <outDir> <charIndex> '<json steps>'`: starts a battle and runs scripted steps (`eval`, `wait`, `shots`) for frame-by-frame captures. `fxshot-m.mjs` does the same on an emulated landscape phone (`MOBILE=1`).
- `stshots.mjs`, `wpshots.mjs`: dense frame sheets of each character's strike and each weapon (need ffmpeg).

The page exposes `Game.test.*` hooks for these (`glyph`, `sky`, `lv`, `gift`, `hurt`, `arm`, `noStrike`, `ink`, `bei`, `market`, `god`) and `Game.dbg()` for state.
