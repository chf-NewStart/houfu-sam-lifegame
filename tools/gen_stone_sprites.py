from PIL import Image
import json
import os

# Proper pixel art, not stencils. The two-value silhouettes these replace were
# drawn for a board that tinted them per player and stamped them on a disc; they
# read as ink blots at 16px. These are authored the way sprites/guru.png is —
# a small fixed palette, a dark outline, one shade for volume — and the board
# now draws them at an INTEGER scale with smoothing off, so the pixels survive
# to the screen instead of being resampled into a smudge.
#
# The art is player-independent: ownership is carried by the coloured stone the
# character stands on, and by the silhouette (a goose is not a raccoon under any
# form of colour blindness), so the sprites no longer ship in two tints.
PAL = {
 'goose': {
   'o': (23, 19, 31),      # outline
   'w': (246, 243, 236),   # feather white
   's': (201, 197, 192),   # feather shade
   'b': (233, 163, 62),    # bill / knob
   'd': (176, 102, 36),    # bill shade
   'e': (23, 19, 31),      # eye
 },
 'raccoon': {
   'o': (23, 19, 31),
   'g': (170, 168, 180),   # fur
   'h': (116, 114, 130),   # fur shade
   'm': (44, 38, 56),      # mask
   'w': (238, 236, 242),   # muzzle / brow
   'n': (66, 54, 70),      # nose
   'e': (246, 243, 236),   # eye glint
 },
}

# 16x16, because the board draws a character at ~2x on a desktop cell and 1x on
# a phone; anything finer is thrown away, anything coarser cannot hold a face.
GRIDS = {
 # A domestic goose in profile facing right: knobbed bill, long neck, heavy
 # horizontal body. The silhouette is the same one the old stencil earned its
 # place with — it just has feathers now.
 'goose': [
  "................",
  ".........ooo....",
  "........owwwo...",
  "........owewo...",
  "........owwwoooo",
  "........owwwbbbd",
  "........owwwooo.",
  ".........osswo..",
  "....ooo..osswo..",
  "..oowwwooosswwo.",
  ".owwwwwwwwwwwwwo",
  ".owwwwwwwwwwwwso",
  ".oswwwwwwwwwwsso",
  "..ossswwwwwssso.",
  "...oosssssssoo..",
  ".....oooooooo...",
 ],
 # A raccoon head-on: round ears, the mask over both eyes, pale brow and
 # muzzle. Front-facing so it never reads as a second bird at cell size.
 'raccoon': [
  "................",
  "..oo........oo..",
  ".ohho.oooo.ohho.",
  ".oggooggggooggo.",
  ".oggggggggggggo.",
  ".ogwwwwwwwwwwgo.",
  ".ommmmmwwmmmmmo.",
  ".ommemmwwmmemmo.",
  ".ommmmmwwmmmmmo.",
  "..oggwwwwwwggo..",
  "..oggwwwwwwggo..",
  "...ogwwnnwwgo...",
  "...ogwwwwwwgo...",
  "....ohwwwwho....",
  ".....ohhhho.....",
  "......oooo......",
 ],
}

OUT = 'sprites'


def build(name, rows):
    pal = PAL[name]
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    ink = 0
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            if ch not in pal:
                raise SystemExit(f"{name} row {y}: '{ch}' is not in the palette")
            px[x, y] = pal[ch] + (255,)
            ink += 1
    return im, ink / 256.0


os.makedirs(OUT, exist_ok=True)
cov = {}
for name, rows in GRIDS.items():
    if len(rows) != 16:
        raise SystemExit(f"{name} has {len(rows)} rows")
    for i, r in enumerate(rows):
        if len(r) != 16:
            raise SystemExit(f"{name} row {i} is {len(r)} wide")
    im, c = build(name, rows)
    cov[name] = c
    # Native size. The board scales by an integer factor with NEAREST, so a
    # pre-scaled export would only give it a source it has to resample again.
    im.save(f'{OUT}/stone_{name}.png')

# Equalise the ink each character actually puts on its stone: rendered area is
# coverage * box^2, so box = BASE * sqrt(ref/coverage) holds that product
# constant and neither side reads heavier than the other.
BASE = 0.90
ref = sum(cov.values()) / len(cov)
boxes = {n: max(0.70, min(1.00, BASE * (ref / c) ** 0.5)) for n, c in cov.items()}

print("character      coverage   box    normalised ink")
for n in GRIDS:
    print(f"  {n:12s} {cov[n]*100:5.1f}%   {boxes[n]:.3f}   {cov[n]*boxes[n]**2:.4f}")
vals = [cov[n] * boxes[n] ** 2 for n in GRIDS]
spread = max(vals) / min(vals)
print(f"\nspread: {spread:.3f}  {'OK' if spread <= 1.12 else 'FAIL'}")

with open(f'{OUT}/stone_boxes.json', 'w') as f:
    json.dump({n: round(v, 3) for n, v in boxes.items()}, f, indent=2, sort_keys=True)
print("wrote sprites/stone_boxes.json")
