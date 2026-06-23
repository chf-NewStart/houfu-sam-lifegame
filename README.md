# Conway's Game of Life

An interactive browser implementation of Conway's Game of Life — zero dependencies, pure HTML/CSS/JS.

**[Play it live →](https://chf-newstart.github.io/houfu-sam-lifegame/)**

## Features

- **Draw freely** — click or drag to paint cells on the grid
- **8 built-in patterns** — Glider, Blinker, Pulsar, R-pentomino, Gosper Gun, Acorn, Diehard, LWSS
- **Drag-and-drop stamping** — drag any pattern onto the canvas; ghost preview follows your cursor
- **Rotate & mirror** — transform patterns before stamping (0°/90°/180°/270°, horizontal flip)
- **Undo** — step back up to 50 generations
- **Speed & cell size controls** — 1–30 fps, 4–16 px per cell
- **Next-gen preview** — dead cells about to be born are shown as dim ghosts each frame
- **Toroidal grid** — edges wrap, so nothing escapes off-screen
- **Mobile-ready** — touch drawing and touch drag-and-drop both work
- **English / 中文** — language toggle in the header

## Rules (B3/S23)

| State | Condition | Next state |
|---|---|---|
| Live | 2 or 3 live neighbours | Survives |
| Live | fewer than 2 or more than 3 | Dies |
| Dead | exactly 3 live neighbours | Born |

## Usage

Open `index.html` in any modern browser — no build step, no server required.

## License

MIT
