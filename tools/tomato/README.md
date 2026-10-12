# Grow a Tomato: source

`game/tomato.html` is built from these files; edit here, not in the built page.

- `engine.js`: the season model (seeded weather, growth, the Kalman twin, the forecast and the autopilot planner). Runs in Node too (`module.exports` at the end), so the balance can be checked headlessly.
- `page.html`: the page; `/*__ENGINE__*/` marks where the engine is inlined.
- `build.sh`: inlines the engine into `out/game/tomato.html`; `PUBLISH=1 ./build.sh` also copies it to `../../game/tomato.html`.
- `greedy.js`, `tune.js`: balance simulations (idle, random, heuristic and forecast-following players against the autopilot).
- `shot.mjs`: headless-Chrome screenshots through a scripted session (needs a local server on port 8765 from the repo root: `python3 -m http.server 8765`).

Textbook physiology only: this is not the author's research model or data.
