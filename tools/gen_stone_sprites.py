from PIL import Image
import os

# Two-value stencil art. K = ink (the mass), P = paper (accents). No mid tone:
# the game caps CELL at 33, so a three-value miniature is mud at that size.
GRIDS = {
 # Heavy HORIZONTAL body, thin vertical neck, defined head — reads as a goose,
 # not a musical note.
 'goose': [
  "................",
  ".........KKK....",
  "........KKPKK...",
  "........KKKKK...",
  ".......PKKKK....",
  "........KK......",
  "........KK......",
  "...KKKKKKKK.....",
  "..KKKKKKKKKKK...",
  ".KKKKKKKKKKKKK..",
  "KKKKKKKKKKKKKKK.",
  "KKKKKKKKKKKKKKK.",
  ".KKKKKKKKKKKKK..",
  "..KKKKKKKKKKK...",
  "....KKKKKKK.....",
  "................",
 ],
 # Rounded ears, mask band across the eyes, soft muzzle. Thinned so its ink
 # budget matches the goose instead of reading heavier.
 'raccoon': [
  "................",
  "................",
  "...KK......KK...",
  "..KKKK....KKKK..",
  "..KKKKKKKKKKKK..",
  ".KKK........KKK.",
  ".KK..........KK.",
  ".KKPP.KKKK.PPKK.",
  ".KKPP.KKKK.PPKK.",
  ".KK..........KK.",
  "..KKKKPPPPKKKK..",
  "..KKKKPPPPKKKK..",
  "...KKKKKKKKKK...",
  ".....KKKKKK.....",
  "................",
  "................",
 ],
 # Lens-shaped plastid with visible grana stacks.
 'chloroplast': [
  "................",
  "................",
  "......KKKKK.....",
  "....KKKKKKKKK...",
  "...KK.......KK..",
  "..KK.PPPPP...KK.",
  "..KK.........KK.",
  ".KK..PPPPP....KK",
  ".KK...........KK",
  ".KK....PPPPP..KK",
  "..KK.........KK.",
  "..KK........KK..",
  "...KKKKKKKKK....",
  ".....KKKKK......",
  "................",
  "................",
 ],
 # Compact faceted body with one bright carotenoid needle — not an asterisk.
 'chromoplast': [
  "................",
  "................",
  "......KKKK......",
  ".....KKKKKK.....",
  "....KKKKKKKK....",
  "...KKKKKKKKKK...",
  "..KKKKKPKKKKKK..",
  "..KKKKKPKKKKKK..",
  ".KKKKKKPKKKKKKK.",
  ".KKKKKKPKKKKKKK.",
  "..KKKKKPKKKKKK..",
  "..KKKKKKKKKKKK..",
  "...KKKKKKKKKK...",
  "....KKKKKKKK....",
  ".....KKKKKK.....",
  "................",
 ],
 # Game of Life: a three-cell bar.
 'blinker': [
  "................",
  "................",
  "................",
  "................",
  "..KKKKKKKKKKKK..",
  "..KKKKKKKKKKKK..",
  "..KKKKKKKKKKKK..",
  "..KKKKKKKKKKKK..",
  "..KKKKKKKKKKKK..",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
 ],
 # Game of Life: a 2x2 square, thinned to a ring so its ink matches the blinker.
 'block': [
  "................",
  "................",
  "..KKKKKKKKKKKK..",
  "..KKKKKKKKKKKK..",
  "..KK........KK..",
  "..KK........KK..",
  "..KK........KK..",
  "..KK........KK..",
  "..KK........KK..",
  "..KK........KK..",
  "..KK........KK..",
  "..KK........KK..",
  "..KKKKKKKKKKKK..",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
 ],
}

# Ink and paper tints per player, derived from the game's own stone colours so
# the badge reads as part of the stone rather than pasted onto it.
TINT = {
  1: {'K': (6, 33, 15), 'P': (234, 255, 241)},     # on #1db954
  2: {'K': (43, 9, 6),  'P': (255, 240, 238)},     # on #f44336
}
SCALE = 4   # export at 4x so the canvas downsamples from real pixels

out = 'sprites'
os.makedirs(out, exist_ok=True)
report = []
for name, rows in GRIDS.items():
    assert len(rows) == 16, name
    for i, r in enumerate(rows):
        assert len(r) == 16, f"{name} row {i} is {len(r)}"
    ink = sum(r.count('K') + r.count('P') for r in rows)
    report.append((name, ink / 256.0))
    for p in (1, 2):
        im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        px = im.load()
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch == 'K': px[x, y] = TINT[p]['K'] + (255,)
                elif ch == 'P': px[x, y] = TINT[p]['P'] + (255,)
        im.resize((16 * SCALE, 16 * SCALE), Image.NEAREST).save(f'{out}/stone_{name}_p{p}.png')

# Equalise the ink each badge actually PUTS ON the disc, rather than trying to
# hand-draw six sprites to the same coverage. Rendered ink area is
# coverage * box^2, so box = BASE * sqrt(ref / coverage) makes that product
# constant for any art. Solves F1 exactly instead of approximately.
BASE = 0.72
cov = dict(report)
ref = sum(cov.values()) / len(cov)
scales = {n: max(0.55, min(0.86, BASE * (ref / c) ** 0.5)) for n, c in cov.items()}

print("character      coverage   box    normalised ink")
for n in GRIDS:
    print(f"  {n:12s} {cov[n]*100:5.1f}%   {scales[n]:.3f}   {cov[n]*scales[n]**2:.4f}")
vals = [cov[n] * scales[n] ** 2 for n in GRIDS]
spread = max(vals) / min(vals)
print(f"\nspread across ALL characters: {spread:.3f}  {'OK' if spread <= 1.12 else 'FAIL'}")
for a, b in [('goose','raccoon'), ('chloroplast','chromoplast'), ('blinker','block')]:
    r = max(cov[a]*scales[a]**2, cov[b]*scales[b]**2) / min(cov[a]*scales[a]**2, cov[b]*scales[b]**2)
    print(f"  {a} vs {b}: {r:.3f}  {'OK' if r <= 1.12 else 'FAIL'}")

with open(f'{out}/stone_boxes.json', 'w') as f:
    import json
    json.dump({n: round(v, 3) for n, v in scales.items()}, f, indent=2, sort_keys=True)
print("\nwrote sprites/stone_boxes.json")
