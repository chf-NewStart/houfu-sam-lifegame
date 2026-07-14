# Extract oracle-bone glyph images from 甲骨文汉字对应表.pdf, pair each with its
# label character by position, trace to vector outlines, emit JSON of path data.
import fitz, io, json, sys
from PIL import Image
import numpy as np

PDF = '/Users/chf/Downloads/古文字与甲骨文、金文/甲骨文汉字对应表.pdf'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'glyphs.json'

doc = fitz.open(PDF)
pairs = []  # (char, PIL image)

def page_rects(page):
    seen, out = set(), []
    for xref, *_ in page.get_images(full=True):
        if xref in seen: continue
        seen.add(xref)
        for rect in page.get_image_rects(xref):
            if rect.width >= 8 and rect.height >= 8:
                out.append((xref, rect))
    return out

prev_rects = []           # images from the previous page (for rows split by a page break)
for page in doc:
    words = page.get_text('words')  # x0,y0,x1,y1,text,...
    labels = [w for w in words if len(w[4]) == 1 and '一' <= w[4] <= '鿿']
    img_rects = page_rects(page)
    matched = set()
    for xref, rect in img_rects:
        # label: nearest hanzi word whose top edge is below the image bottom,
        # horizontally overlapping the image column
        best, bd = None, 1e9
        for w in labels:
            wx = (w[0] + w[2]) / 2
            if w[1] < rect.y1 - 2: continue          # must start below the glyph
            if wx < rect.x0 - 32 or wx > rect.x1 + 32: continue
            d = w[1] - rect.y1
            if 0 <= d < bd and d < 65:
                bd, best = d, w
        if not best: continue
        matched.add(id(best))
        try:
            pix = doc.extract_image(xref)
            img = Image.open(io.BytesIO(pix['image'])).convert('L')
        except Exception:
            continue
        pairs.append((best[4], img))
    # a table row can break across pages: its glyphs end the previous page and
    # its labels open this one — pair each orphaned top-row label with the
    # bottom-most previous-page image in the same column
    for w in labels:
        if id(w) in matched or w[1] > 110: continue
        wx = (w[0] + w[2]) / 2
        best, by = None, -1
        for xref, rect in prev_rects:
            cx = (rect.x0 + rect.x1) / 2
            if abs(cx - wx) > 28: continue
            if rect.y1 > by: by, best = rect.y1, (xref, rect)
        if not best or by < doc[0].rect.height * 0.55: continue
        try:
            pix = doc.extract_image(best[0])
            img = Image.open(io.BytesIO(pix['image'])).convert('L')
        except Exception:
            continue
        pairs.append((w[4], img))
    prev_rects = img_rects

print(f'paired {len(pairs)} glyph images', file=sys.stderr)

# ---- tracing: threshold -> marching squares -> RDP simplify ----
def trace(img):
    # upscale for smoother contours
    K = 3
    img = img.resize((img.width*K, img.height*K), Image.BICUBIC)
    a = np.array(img)
    binm = (a < 150).astype(np.uint8)          # ink = 1
    if binm.sum() < 20: return None
    H, W = binm.shape
    # pad so contours close at edges
    b = np.zeros((H+2, W+2), np.uint8); b[1:-1, 1:-1] = binm
    # marching squares: build edge segments between cell corners
    segs = {}
    def key(p): return (round(p[0], 1), round(p[1], 1))
    for y in range(b.shape[0]-1):
        row0, row1 = b[y], b[y+1]
        for x in range(b.shape[1]-1):
            c = row0[x] | row0[x+1] << 1 | row1[x] << 2 | row1[x+1] << 3
            if c in (0, 15): continue
            # midpoints of cell edges
            T = (x+0.5, y); Bo = (x+0.5, y+1); L = (x, y+0.5); R = (x+1, y+0.5)
            for p, q in {
                1:[(L,T)], 2:[(T,R)], 3:[(L,R)], 4:[(Bo,L)], 5:[(Bo,T)],
                6:[(T,R),(Bo,L)], 7:[(Bo,R)], 8:[(R,Bo)], 9:[(L,T),(R,Bo)],
                10:[(T,Bo)], 11:[(L,Bo)], 12:[(R,L)], 13:[(R,T)], 14:[(T,L)]
            }[c]:
                segs.setdefault(key(p), []).append(q)
    # chain segments into loops
    loops = []
    while segs:
        start = next(iter(segs))
        pt = start; loop = [pt]
        while True:
            nxts = segs.get(pt)
            if not nxts: break
            nxt = nxts.pop()
            if not nxts: del segs[pt]
            pt = key(nxt); loop.append(pt)
            if pt == start: break
        if len(loop) > 6: loops.append(loop)
    if not loops: return None
    # RDP simplification
    def rdp(pts, eps):
        if len(pts) < 3: return pts
        ax, ay = pts[0]; bx, by = pts[-1]
        dmax, idx = 0, 0
        dx, dy = bx-ax, by-ay
        L2 = dx*dx + dy*dy or 1e-9
        for i in range(1, len(pts)-1):
            px, py = pts[i]
            t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / L2))
            qx, qy = ax + t*dx, ay + t*dy
            d = ((px-qx)**2 + (py-qy)**2) ** 0.5
            if d > dmax: dmax, idx = d, i
        if dmax > eps:
            l = rdp(pts[:idx+1], eps); r = rdp(pts[idx:], eps)
            return l[:-1] + r
        return [pts[0], pts[-1]]
    loops = [rdp(lp, 2.2) for lp in loops]
    loops = [lp for lp in loops if len(lp) >= 4]
    if not loops: return None
    # normalize to 0..100 box preserving aspect
    xs = [p[0] for lp in loops for p in lp]; ys = [p[1] for lp in loops for p in lp]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = max(x1-x0, 1e-6), max(y1-y0, 1e-6)
    sc = 100.0 / max(w, h)
    ox, oy = (100 - w*sc)/2, (100 - h*sc)/2
    parts = []
    for lp in loops:
        pts = [(round((p[0]-x0)*sc + ox, 1), round((p[1]-y0)*sc + oy, 1)) for p in lp]
        d = 'M' + ' '.join(f'{p[0]} {p[1]}' for p in pts[:1]) + 'L' + ' '.join(f'{p[0]} {p[1]}' for p in pts[1:]) + 'Z'
        parts.append(d)
    return {'p': ''.join(parts), 'w': round(w*sc, 1), 'h': round(h*sc, 1)}

out = {}
for ch, img in pairs:
    t = trace(img)
    if t: out.setdefault(ch, []).append(t)

print(f'traced {sum(len(v) for v in out.values())} glyphs across {len(out)} characters', file=sys.stderr)
json.dump(out, open(OUT, 'w'), ensure_ascii=False)
