# Conway's Game of Life

An interactive browser implementation of Conway's Game of Life — zero dependencies, pure HTML/CSS/JS.

**[▶ Play it live at lifegameproject.com](https://lifegameproject.com)**

![gameplay](demo/gif/lifegame.gif)

---

## Features

### Core
- **Draw freely** — click or drag to paint cells; right-click or middle-click to pan
- **Zoom & pan** — scroll to zoom into any point, pinch on mobile
- **8 built-in patterns** — Glider, Blinker, Pulsar, R-pentomino, Gosper Gun, Acorn, Diehard, LWSS
- **Drag-and-drop stamping** — drag any pattern onto the canvas with ghost preview
- **Rotate & mirror** — 0°/90°/180°/270° and horizontal flip before stamping
- **Undo / Redo** — full history for both drawing and simulation steps
- **Speed & cell size controls** — 1–30 fps, adjustable cell size
- **Next-gen preview** — cells about to be born shown as dim ghosts each frame
- **Finite grid** — cells die at the border (no toroidal wrapping)
- **Responsive** — canvas resizes with the window; mobile touch drawing and pinch-zoom

### Challenges & Leaderboard
- **8 challenges** — First Steps, Bloom, Century, Still Life, Mega City, Extinction, Equilibrium, Steady State
- **Anti-cheat** — drawing is locked once the simulation starts; set your initial pattern before pressing Play
- **Global leaderboard** — powered by Supabase; submit your score with a nickname after winning
- **Share your seed** — winners' initial patterns are stored; anyone can click ▶ Try to replay from the same start

### Community
- **Share Shape** — encode your current grid as a URL-safe link or post it to the community gallery
- **Gallery** — browse patterns shared by other players; load any with one click

### Image → Cells
- **Upload any image** — converts to live/dead cells based on brightness threshold
- **Live preview** — see exactly what the cell pattern will look like before stamping
- **Adjustable threshold & invert** — tune cell density or flip dark/light
- 100% client-side — the image never leaves your browser

### Language
- **English / 中文** — full bilingual support, toggle in the header

---

![drawing demo](demo/gif/rand_diy.gif)

---

## Rules (B3/S23)

| State | Condition | Next state |
|---|---|---|
| Live | 2 or 3 live neighbours | Survives |
| Live | < 2 or > 3 live neighbours | Dies |
| Dead | exactly 3 live neighbours | Born |

---

## Run locally

```bash
# Just open the file — no build step, no server needed
open index.html
```

Or serve it:
```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

---

## Built by

[Houfu Chen](https://houfu72.com) · Sam Qiu · Husam

Contact: houfuchen0702@gmail.com

---

## License

MIT
