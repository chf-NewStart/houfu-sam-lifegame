/* The 2D boards, drawn as the app draws them (Qi/Views/BoardView.swift,
   ChessBoardView.swift): a square board on the pixel pond, crisp at any size. */
import { C, drawPond, drawStone, octagon, drawPiece, makeCanvas } from './art.js?v=5';
import * as Chess from './chess.js?v=5';

const RIPPLE = 1300;
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/** A square canvas that fills its wrapper and redraws when resized. */
class SquareCanvas {
  constructor(wrap) {
    this.wrap = wrap;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board-canvas';
    wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.side = 0;
    this.frame = 0;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(wrap);
    this.resize();
  }

  resize() {
    const r = this.wrap.getBoundingClientRect();
    const side = Math.floor(Math.min(r.width, r.height || r.width));
    if (side <= 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr;
    if (side !== this.side || this.canvas.width !== Math.round(side * dpr)) {
      this.side = side;
      this.canvas.style.width = side + 'px';
      this.canvas.style.height = side + 'px';
      this.canvas.width = Math.round(side * dpr);
      this.canvas.height = Math.round(side * dpr);
      this.background = null;
    }
    this.draw();
  }

  /** The pond and slab, cached per size. */
  pond(extra) {
    const W = this.canvas.width;
    if (!this.background || this.background.width !== W) {
      this.background = makeCanvas(W, W);
      const b = this.background.getContext('2d');
      b.scale(this.dpr, this.dpr);
      drawPond(b, this.side, this.side * 0.03);
      if (extra) extra(b);
    }
    return this.background;
  }

  animate(until) {
    this.animUntil = Math.max(this.animUntil || 0, until);
    if (this.frame) return;
    const tick = () => {
      this.draw();
      this.frame = performance.now() < this.animUntil ? requestAnimationFrame(tick) : 0;
      if (!this.frame) this.draw();
    };
    this.frame = requestAnimationFrame(tick);
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  destroy() { this.ro.disconnect(); cancelAnimationFrame(this.frame); this.canvas.remove(); }
}

/** Go and Gomoku: a grid on the slab, stones, star points, coordinates, coach rings, dead
    stones, territory, the winning line, and mint ripples from each new stone. */
export class GridBoard extends SquareCanvas {
  constructor(wrap, onTap) {
    super(wrap);
    this.onTap = onTap;
    this.state = null;
    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.state || !this.onTap || !this.state.interactive) return;
      const { x, y } = this.point(e);
      const g = this.geometry();
      const c = Math.round((x - g.margin) / g.cell), r = Math.round((y - g.margin) / g.cell);
      if (r >= 0 && c >= 0 && r < this.state.size && c < this.state.size) this.onTap(r, c);
    });
  }

  geometry() {
    const side = this.side, size = this.state.size;
    const inset = side * 0.03;
    const margin = inset + side * (size >= 15 ? 0.045 : 0.06);
    return { side, inset, margin, cell: (side - 2 * margin) / (size - 1) };
  }

  set(state) {
    const prev = this.state;
    const lastKey = state.last ? state.last[0] * state.size + state.last[1] : null;
    const prevKey = prev && prev.last && prev.size === state.size ? prev.last[0] * prev.size + prev.last[1] : null;
    if (!prev || prev.size !== state.size) this.background = null;
    this.state = state;
    this.canvas.style.cursor = state.interactive ? 'pointer' : 'default';
    if (lastKey != null && lastKey !== prevKey && prev && !reduceMotion() && !state.still) {
      this.ripple = { point: lastKey, start: performance.now() };
      this.animate(performance.now() + RIPPLE);
    }
    this.draw();
  }

  draw() {
    const s = this.state;
    if (!s || !this.side) return;
    const ctx = this.ctx, g = this.geometry(), size = s.size, cell = g.cell;
    const P = (r, c) => [g.margin + c * cell, g.margin + r * cell];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.pond((b) => {
      // Grid, star points and coordinates are part of the still background.
      b.strokeStyle = C.gridLine;
      b.lineWidth = Math.max(1, cell * 0.06);
      b.lineCap = 'square';
      b.beginPath();
      for (let i = 0; i < size; i++) {
        let [x, y] = P(i, 0); b.moveTo(x, y); [x, y] = P(i, size - 1); b.lineTo(x, y);
        [x, y] = P(0, i); b.moveTo(x, y); [x, y] = P(size - 1, i); b.lineTo(x, y);
      }
      b.stroke();
      b.fillStyle = C.star;
      for (const [r, c] of s.stars) {
        const [x, y] = P(r, c), h = Math.max(2, cell * 0.11);
        b.fillRect(x - h, y - h, h * 2, h * 2);
      }
      const room = g.margin - g.inset;
      if (room > 9) {
        const fs = Math.min(room * 0.5, cell * 0.42);
        b.font = `bold ${fs}px ${MONO}`;
        b.fillStyle = 'rgba(169,185,179,.75)';
        b.textAlign = 'center';
        b.textBaseline = 'middle';
        for (let i = 0; i < size; i++) {
          b.fillText(s.columns[i], P(0, i)[0], g.inset + room * 0.5);
          b.fillText(String(size - i), g.inset + room * 0.5, P(i, 0)[1]);
        }
      }
    }), 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Territory (scoring): small pixel squares in the owner's colours.
    if (s.owner) {
      s.owner.forEach((o, i) => {
        if (!o || (s.stones[i] !== 0 && !(s.dead && s.dead.has(i)))) return;
        const [x, y] = P(Math.floor(i / size), i % size), h = cell * 0.16;
        ctx.fillStyle = o === 1 ? '#101917' : '#eadfc6';
        ctx.fillRect(x - h, y - h, h * 2, h * 2);
      });
    }

    // Stones.
    const diameter = cell * 1.04;
    s.stones.forEach((v, i) => {
      if (!v) return;
      const [x, y] = P(Math.floor(i / size), i % size);
      const dead = s.dead && s.dead.has(i);
      drawStone(ctx, v === 1, x, y, diameter, dead ? 0.38 : (s.ghost && s.ghost.has(i) ? 0.55 : 1));
      if (dead) {
        const d = cell * 0.22;
        ctx.strokeStyle = C.danger;
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
        ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d);
        ctx.stroke();
      }
    });

    // Last move: a mint pixel on the stone.
    if (s.last && s.stones[s.last[0] * size + s.last[1]]) {
      const [x, y] = P(s.last[0], s.last[1]), h = Math.max(2, cell * 0.09);
      ctx.fillStyle = C.mint;
      ctx.fillRect(x - h, y - h, h * 2, h * 2);
    }

    // Ripple spreading from the newest stone, in eight steps like the web page's.
    if (this.ripple) {
      const t = (performance.now() - this.ripple.start) / 1000;
      const [x, y] = P(Math.floor(this.ripple.point / size), this.ripple.point % size);
      let live = false;
      for (const [delay, color, width] of [[0, C.ripple, 0.08], [0.15, C.rippleFaint, 0.05]]) {
        const f = (t - delay) / (RIPPLE / 1000 - 0.15);
        if (f <= 0 || f >= 1) { if (f <= 0) live = true; continue; }
        live = true;
        const stepped = Math.floor(f * 8) / 8;
        ctx.save();
        ctx.globalAlpha = 0.75 * (1 - stepped);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, cell * width);
        ctx.stroke(octagon(x, y, cell * (0.35 + 1.5 * stepped), 1 + stepped * 0.6));
        ctx.restore();
      }
      if (!live) this.ripple = null;
    }

    // Coach rings (pixel octagons) and their marks.
    for (const h of s.hints || []) {
      const [x, y] = P(h.row, h.col);
      ctx.strokeStyle = h.color;
      ctx.lineWidth = Math.max(1.5, cell * 0.08);
      ctx.stroke(octagon(x, y, cell * 0.4));
      ctx.fillStyle = h.color;
      if (!h.mark) {
        const d = Math.max(2, cell * 0.08);
        ctx.fillRect(x - d, y - d, d * 2, d * 2);
      } else {
        ctx.font = `900 ${cell * 0.34}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(h.mark, x, y + cell * 0.02);
      }
    }

    // Winning line.
    if (s.winLine && s.winLine.length >= 2) {
      const sorted = s.winLine.slice().sort((a, b) => (a.r !== b.r ? a.r - b.r : a.c - b.c));
      const a = sorted[0], b = sorted[sorted.length - 1];
      ctx.strokeStyle = 'rgba(232,176,74,.9)';
      ctx.lineWidth = cell * 0.14;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(...P(a.r, a.c));
      ctx.lineTo(...P(b.r, b.c));
      ctx.stroke();
    }
  }
}

// ── Chess ─────────────────────────────────────────────────────────────────────

export const LIGHT_SQUARE = '#82978f', DARK_SQUARE = '#566c66';
const SLIDE = 160;

/** The chess board on the pond: a checker of two stone tones on the slab, coordinates, the
    last move, check, legal moves, the coach's ring and the pieces. Tap a piece and then a
    square, or drag it: a piece in the hand rides above the finger and its landing square
    lights up. The other side's moves slide across, and every landing sends out a ripple. */
export class ChessBoard extends SquareCanvas {
  constructor(wrap, model, text) {
    super(wrap);
    this.model = model;
    this.text = text;
    this.drag = null;
    this.overlay = document.createElement('div');
    this.overlay.className = 'board-overlay';
    wrap.appendChild(this.overlay);
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.moveDrag(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', () => { this.drag = null; this.draw(); });
  }

  geometry() {
    const side = this.side, inset = side * 0.03, margin = inset + side * 0.05;
    return { side, inset, margin, cell: (side - 2 * margin) / 8, flipped: this.model.bottomSide === Chess.BLACK };
  }
  display(sq, g) { return g.flipped ? [7 - (sq >> 3), 7 - (sq & 7)] : [sq >> 3, sq & 7]; }
  rect(sq, g) { const [r, c] = this.display(sq, g); return [g.margin + c * g.cell, g.margin + r * g.cell, g.cell]; }
  squareAt(x, y, g) {
    const c = Math.floor((x - g.margin) / g.cell), r = Math.floor((y - g.margin) / g.cell);
    if (r < 0 || r > 7 || c < 0 || c > 7) return null;
    return g.flipped ? (7 - r) * 8 + (7 - c) : r * 8 + c;
  }

  /** Called after every change to the model. */
  update(interactive) {
    this.interactive = interactive;
    const game = this.model.shownGame;
    const count = game.moves.length;
    if (this.flippedWas !== this.geometry().flipped) { this.flippedWas = this.geometry().flipped; this.background = null; }
    if (this.lastCount != null && count === this.lastCount + 1 && game.lastMove && !reduceMotion()) {
      const last = game.lastMove, now = performance.now();
      const byHand = this.dropped && Chess.sameMove(this.dropped, last);
      if (!byHand) {
        const piece = game.board[last.to];
        this.slide = { piece: last.promo ? Math.sign(piece) * Chess.PAWN : piece, from: last.from, to: last.to, start: now };
      }
      this.ripple = { square: last.to, start: now + (byHand ? 0 : SLIDE) };
      this.animate(now + SLIDE + RIPPLE);
    }
    this.dropped = null;
    this.lastCount = count;
    this.renderOverlay();
    this.draw();
  }

  upsideDown(piece) { const m = this.model; return m.faceToFace && m.seating === 'twoPlayers' && !m.isOnline && piece < 0; }

  draw() {
    if (!this.side || !this.model) return;
    const m = this.model, game = m.shownGame, ctx = this.ctx, g = this.geometry();
    const px = Math.max(1, g.side / 160);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.pond((b) => {
      // Squares, each with a speck so they read as stone; coordinates in the margin.
      for (let sq = 0; sq < 64; sq++) {
        const [x, y, s] = this.rect(sq, g);
        const dark = Chess.isDark(sq);
        b.fillStyle = dark ? DARK_SQUARE : LIGHT_SQUARE;
        b.fillRect(x, y, s, s);
        b.fillStyle = dark ? '#6c827b' : '#91a59e';
        b.fillRect(x + s * (0.15 + 0.55 * ((sq * 7) % 11) / 11), y + s * (0.2 + 0.5 * ((sq * 5) % 9) / 9), px * 2, px);
      }
      const room = g.margin - g.inset;
      if (room > 8) {
        const fs = Math.min(room * 0.55, g.cell * 0.3);
        b.font = `bold ${fs}px ${MONO}`;
        b.fillStyle = 'rgba(169,185,179,.8)';
        b.textAlign = 'center';
        b.textBaseline = 'middle';
        for (let i = 0; i < 8; i++) {
          const file = g.flipped ? 7 - i : i, rank = g.flipped ? i + 1 : 8 - i;
          const p = g.margin + (i + 0.5) * g.cell;
          b.fillText(Chess.FILES[file], p, g.side - g.inset - room * 0.5);
          b.fillText(String(rank), g.inset + room * 0.5, p);
        }
      }
    }), 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // The last move, and a king in check.
    const last = game.lastMove;
    if (last) {
      ctx.fillStyle = 'rgba(232,176,74,.28)';
      for (const sq of [last.from, last.to]) { const [x, y, s] = this.rect(sq, g); ctx.fillRect(x, y, s, s); }
    }
    if (game.inCheck || (game.result && game.result.reason === 'checkmate')) {
      const [x, y, s] = this.rect(game.position.kingSquare[game.current], g);
      ctx.fillStyle = 'rgba(235,102,102,.5)';
      ctx.fillRect(x + px, y + px, s - 2 * px, s - 2 * px);
    }

    // The picked-up piece's square and where it may go.
    const sel = m.review == null ? m.selected : null;
    if (sel != null) {
      const [x, y, s] = this.rect(sel, g);
      ctx.strokeStyle = C.mint;
      ctx.lineWidth = px * 3;
      ctx.strokeRect(x + px * 1.5, y + px * 1.5, s - px * 3, s - px * 3);
      for (const to of m.legalTargets) {
        const [tx, ty, ts] = this.rect(to, g);
        if (game.board[to] !== 0 || (Math.abs(game.board[sel]) === Chess.PAWN && (to & 7) !== (sel & 7))) {
          ctx.fillStyle = C.mint;
          const k = ts * 0.22;
          for (const [cx, cy, dx, dy] of [[tx, ty, 1, 1], [tx + ts, ty, -1, 1], [tx, ty + ts, 1, -1], [tx + ts, ty + ts, -1, -1]]) {
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + k * dx, cy); ctx.lineTo(cx, cy + k * dy); ctx.closePath(); ctx.fill();
          }
        } else {
          const h = ts * 0.1;
          ctx.fillStyle = 'rgba(81,230,142,.9)';
          ctx.fillRect(tx + ts / 2 - h, ty + ts / 2 - h, 2 * h, 2 * h);
        }
      }
    }
    const d = this.drag;
    if (d && d.from != null && d.moved) {
      const over = this.squareAt(d.x, d.y, g);
      if (over != null && m.legalTargets.includes(over)) {
        const [x, y, s] = this.rect(over, g);
        ctx.strokeStyle = C.ripple;
        ctx.lineWidth = px * 3;
        ctx.strokeRect(x + px * 1.5, y + px * 1.5, s - px * 3, s - px * 3);
      }
    }

    // The coach's ring.
    const hint = m.review == null ? m.coachHint : null;
    const hintSq = hint ? (hint.move ? hint.move.to : hint.square) : null;
    if (hintSq != null) {
      const color = hint.kind === 'defend' || hint.kind === 'check' ? C.cyan : C.gold;
      const [x, y, s] = this.rect(hintSq, g);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.stroke(octagon(x + s / 2, y + s / 2, s * 0.46));
      if (hint.move) {
        const [fx, fy] = this.rect(hint.move.from, g);
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.stroke(octagon(fx + s / 2, fy + s / 2, s * 0.46));
        ctx.restore();
      }
    }

    // Pieces. The one in the hand and the one sliding are drawn last.
    const now = performance.now();
    const sliding = this.slide && now - this.slide.start < SLIDE ? this.slide : null;
    if (!sliding) this.slide = null;
    for (let sq = 0; sq < 64; sq++) {
      const piece = game.board[sq];
      if (!piece || (sliding && sq === sliding.to)) continue;
      const lifted = d && d.from === sq && d.moved;
      const [x, y, s] = this.rect(sq, g);
      drawPiece(ctx, piece, x, y, s, { upsideDown: this.upsideDown(piece), opacity: lifted ? 0.35 : 1 });
    }
    if (sliding) {
      const t = Math.min(1, Math.max(0, (now - sliding.start) / SLIDE));
      const e = 1 - Math.pow(1 - t, 3);
      const [ax, ay, s] = this.rect(sliding.from, g), [bx, by] = this.rect(sliding.to, g);
      const piece = game.board[sliding.to] || sliding.piece;
      drawPiece(ctx, piece, ax + (bx - ax) * e, ay + (by - ay) * e, s, { upsideDown: this.upsideDown(piece) });
    }

    // The ripple from the square a piece just landed on: a flattened ring at its foot.
    if (this.ripple) {
      const t = (now - this.ripple.start) / 1000;
      const [x, y, s] = this.rect(this.ripple.square, g);
      const cx = x + s / 2, cy = y + s - s * 0.18;
      let live = false;
      for (const [delay, color, width] of [[0, C.ripple, 0.07], [0.15, C.rippleFaint, 0.045]]) {
        const f = (t - delay) / (RIPPLE / 1000 - 0.15);
        if (f <= 0) { live = true; continue; }
        if (f >= 1) continue;
        live = true;
        const stepped = Math.floor(f * 8) / 8;
        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - stepped);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, s * width);
        ctx.stroke(octagon(cx, cy, s * (0.25 + 0.6 * stepped), 1.6 + stepped * 0.6, 0.45));
        ctx.restore();
      }
      if (!live) this.ripple = null;
    }

    // The piece in the hand, a little bigger and above the finger so it can be seen.
    if (d && d.from != null && d.moved) {
      const size = g.cell * 1.18;
      drawPiece(ctx, game.board[d.from], d.x - size / 2, d.y - size * 0.95, size, { upsideDown: this.upsideDown(game.board[d.from]) });
    }
  }

  // Touch

  down(e) {
    if (!this.interactive) return;
    const g = this.geometry();
    const { x, y } = this.point(e);
    const sq = this.squareAt(x, y, g);
    if (sq == null) return;
    this.canvas.setPointerCapture(e.pointerId);
    const wasSelected = this.model.selected === sq;
    const own = this.model.pickUp(sq);
    this.drag = { from: own ? sq : null, start: sq, x, y, x0: x, y0: y, moved: false, wasSelected };
  }

  moveDrag(e) {
    const d = this.drag;
    if (!d) return;
    const { x, y } = this.point(e);
    d.x = x; d.y = y;
    if (!d.moved && Math.hypot(x - d.x0, y - d.y0) > this.geometry().cell * 0.2) d.moved = true;
    if (d.moved && d.from != null) this.draw();
  }

  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const g = this.geometry();
    const { x, y } = this.point(e);
    if (d.from != null && d.moved) {
      const to = this.squareAt(x, y, g);
      if (to != null && to !== d.from) {
        const m = this.model.game.movesFrom(d.from).find((mm) => mm.to === to);
        if (m) this.dropped = m.promo ? null : m;
        this.model.move(d.from, to);
      }
      this.draw();
    } else if (d.from == null || d.wasSelected) {
      this.model.tap(d.start);
    }
    this.draw();
  }

  // Promotion and the far side's banner, as DOM over the canvas.

  renderOverlay() {
    const m = this.model, o = this.overlay;
    o.innerHTML = '';
    const g = this.geometry();
    o.style.width = g.side + 'px';
    o.style.height = g.side + 'px';
    if (m.promotion && this.side) {
      const shade = document.createElement('div');
      shade.className = 'promo-shade';
      shade.addEventListener('click', () => m.cancelPromotion());
      o.appendChild(shade);
      const sign = m.game.current === Chess.WHITE ? 1 : -1;
      const [x, y, s] = this.rect(m.promotion.to, g);
      const down = this.display(m.promotion.to, g)[0] === 0;
      [Chess.QUEEN, Chess.KNIGHT, Chess.ROOK, Chess.BISHOP].forEach((kind, i) => {
        const b = document.createElement('button');
        b.className = 'promo-choice';
        b.style.cssText = `left:${x}px;top:${y + (down ? i : -i) * s}px;width:${s}px;height:${s}px;background:${i % 2 ? DARK_SQUARE : LIGHT_SQUARE}`;
        b.setAttribute('aria-label', this.text.pieceName(kind));
        const c = document.createElement('canvas');
        c.width = c.height = Math.round(s * this.dpr);
        drawPiece(c.getContext('2d'), kind * sign, 0, 0, c.width);
        b.appendChild(c);
        b.addEventListener('click', (ev) => { ev.stopPropagation(); m.promote(kind); });
        o.appendChild(b);
      });
    }
    const far = this.text.farSide && this.text.farSide();
    if (far) {
      const b = document.createElement('div');
      b.className = 'far-side' + (m.game.inCheck ? ' check' : '');
      b.textContent = far;
      b.style.top = (g.inset + (g.margin - g.inset) / 2) + 'px';
      o.appendChild(b);
    }
  }

  resize() { super.resize(); if (this.overlay) this.renderOverlay(); }
}
