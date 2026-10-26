/* The 3D boards in the game screens (the app's QiModel.View3D, BoardWindow, GoScreen.scene3D…):
   the 3D button puts the 3D board in a window at the top of the rail; a tap on the window
   swaps the two boards, so the 3D one is played on and the 2D one watches from the window.
   three.js and the 3D code load only when 3D is first turned on. */
import { app, hooks, esc, t } from './main.js?v=5';
import { GridBoard, ChessBoard } from './boards.js?v=5';
import { Go, ask } from './models.js?v=5';
import * as Gomoku from './gomoku.js?v=5';
import * as Chess from './chess.js?v=5';
import { glyph } from './art.js?v=5';

let lib = null, loading = null, failed = false;
function load() {
  if (lib || loading) return loading;
  loading = Promise.all([import('./three/world.js?v=5'), import('./three/grid3d.js?v=5'), import('./three/chess3d.js?v=5'), import('./three/creatures.js?v=5')])
    .then(([world, grid, chess, creatures]) => { lib = { world, grid, chess, creatures }; })
    .catch(() => { failed = true; })
    .finally(() => { loading = null; for (const s of waiting) s.render(); waiting.clear(); });
  return loading;
}
const waiting = new Set();

/** The window: one persistent element per screen, put back into the rail after each render. */
function windowEl(screen) {
  if (screen.windowEl) return screen.windowEl;
  const el = document.createElement('button');
  el.className = 'board-window';
  el.dataset.act = 'swap3d';
  el.innerHTML = '<div class="win-wrap"></div><span class="tag"></span>';
  screen.windowEl = el;
  return el;
}

function wrap3D(screen) {
  if (screen.wrap3d) return screen.wrap3d;
  const el = document.createElement('div');
  el.className = 'wrap3d';
  screen.stage.appendChild(el);
  screen.wrap3d = el;
  return el;
}

function three(screen) {
  if (screen.three) return screen.three;
  if (!lib) return null;
  try {
    const view = new lib.world.BoardView();
    const content = screen.kind === 'chess' ? new lib.chess.Chess3DScene(view) : new lib.grid.Grid3DScene(view);
    view.scene = content.scene;
    if (screen.kind === 'chess') view.tapTargets = content.pieces;
    view.onTap = (p, name) => {
      const m = screen.model;
      if (m.review != null) return;
      if (screen.kind === 'chess') { const sq = content.square(p, name); if (sq != null) m.tap(sq); }
      else { const rc = content.boardPoint(p); if (rc) m.tap(rc[0], rc[1]); }
    };
    screen.three = { view, content, insight: { positions: [], creatures: null, ownership: null, ownershipFor: '' } };
    const destroy = screen.destroy.bind(screen);
    screen.destroy = () => { view.dispose(); if (screen.window2D) screen.window2D.destroy(); destroy(); };
  } catch (e) {
    failed = true;
    return null;
  }
  return screen.three;
}

hooks.board3D = {
  /** After each render of the rail: the window back in its slot, the canvases in place. */
  attach(screen) {
    const mode = app.view3D(screen.kind);
    const slot = screen.body.querySelector('.window-slot');
    const main = mode === 'main';
    screen.wrap.style.visibility = main && lib && !failed ? 'hidden' : '';
    if (mode === 'off') {
      if (screen.wrap3d) screen.wrap3d.style.display = 'none';
      return;
    }
    if (!lib && !failed) { waiting.add(screen); load(); }
    const win = windowEl(screen);
    if (slot) slot.replaceWith(win);
    const tag = win.querySelector('.tag');
    const showing3D = mode === 'side';
    tag.textContent = failed ? t('3D needs WebGL, which this browser has turned off', '3D 需要 WebGL，这个浏览器没有开启')
      : !lib ? t('Loading 3D…', '正在载入 3D…') : showing3D ? t('3D · tap to enlarge', '3D · 点按放大') : t('2D · tap to enlarge', '2D · 点按放大');
    win.setAttribute('aria-label', showing3D ? t('3D board. Tap to make it the big board.', '3D 棋盘。点按放大。') : t('2D board. Tap to make it the big board.', '2D 棋盘。点按放大。'));
    const T = three(screen);
    if (!T) return;
    const host = win.querySelector('.win-wrap');
    if (main) {
      const w3 = wrap3D(screen);
      w3.style.display = '';
      T.view.interactive = true;
      T.view.attach(w3);
      if (!screen.window2D) {
        host.innerHTML = '';
        screen.window2D = screen.kind === 'chess'
          ? new ChessBoard(host, screen.model, { pieceName: () => '', farSide: () => null })
          : new GridBoard(host, null);
      }
    } else {
      if (screen.wrap3d) screen.wrap3d.style.display = 'none';
      if (screen.window2D) { screen.window2D.destroy(); screen.window2D = null; }
      T.view.interactive = false;
      T.view.attach(host);
    }
  },

  /** After every change to the game: the 3D scene follows the position shown. */
  update(screen) {
    const T = screen.three;
    const mode = app.view3D(screen.kind);
    if (!T || mode === 'off') return;
    if (screen.window2D) {
      if (screen.kind === 'chess') screen.window2D.update(false);
      else screen.window2D.set({ ...screen.boardState(false), interactive: false });
    }
    if (screen.kind === 'chess') showChess(screen, T);
    else if (screen.kind === 'go') showGo(screen, T);
    else showGomoku(screen, T);
  },
};

// Go: the animals grow move by move through the positions shown; their moods come from the
// ownership estimate, worked out in the worker after every move.

function showGo(screen, T) {
  const m = screen.model, g = m.game, size = g.size;
  const positions = m.shownPositions;
  const ins = T.insight;
  const C = lib.creatures;
  const same = ins.size === size && ins.positions.length && positions.length === ins.positions.length + 1 && ins.positions.every((p, i) => p === positions[i]);
  if (!(ins.size === size && positions.length === ins.positions.length && positions.every((p, i) => p === ins.positions[i]))) {
    if (same && ins.creatures) ins.creatures.update(Array.from(positions[positions.length - 1], Number));
    else ins.creatures = C.GoCreatures.grown(size, positions.map((k) => Array.from(k, Number)));
    ins.positions = positions.slice();
    ins.size = size;
  }
  const key = positions[positions.length - 1];
  if (ins.ownershipFor !== key) {
    ins.ownershipFor = key;
    const toMove = m.review != null ? (m.review % 2 === 0 ? 1 : 2) : g.current;
    const board = Array.from(key, Number);
    ask({ game: 'ownership', board, size, toMove, playouts: size >= 19 ? 260 : (size >= 13 ? 320 : 400) }).then((own) => {
      if (ins.ownershipFor !== key) return;
      ins.ownership = own;
      showGo(screen, T);
    });
  }
  const stones = m.shownBoard;
  const reviewing = m.review != null;
  const p = reviewing ? null : m.priority;
  const rings = {};
  if (p && p.move) rings[p.move.row * size + p.move.col] = p.kind === 'attack' || p.kind === 'capture' ? 0xe8b04a : 0x45c7ff;
  const dead = reviewing ? new Set() : m.dead;
  const own = ins.ownership && ins.ownership.length === stones.length ? ins.ownership : null;
  let animals = C.animalsFor(stones, size, ins.creatures, own);
  if (dead.size) animals = animals.map((a) => (a.walk.every((q) => dead.has(q)) ? { ...a, mood: -1, breath: null, key: a.key + ':dead' } : a));
  const scoring = !reviewing && (g.phase === 'scoring' || (g.phase === 'finished' && g.result && g.result.reason === 'score'));
  const last = m.shownLast;
  place(screen, T, {
    size, stars: Go.starPoints(size).map(([r, c]) => r * size + c), board: stones, last: last ? last[0] * size + last[1] : null,
    rings, dead, territory: scoring ? m.finalScore.owner : null, animals, winLine: [], garden: false,
  });
}

function showGomoku(screen, T) {
  const m = screen.model, n = Gomoku.N;
  const last = m.shownMoves[m.shownMoves.length - 1];
  place(screen, T, {
    size: n, stars: Gomoku.STARS.map(([r, c]) => r * n + c), board: m.shownBoard, last: last ? last.r * n + last.c : null,
    rings: screen.coachMarks().rings, dead: new Set(), territory: null, animals: [], winLine: m.shownWinLine.map((p) => p.r * n + p.c), garden: true,
  });
}

function place(screen, T, s) {
  if (T.content.show(s, app.theme)) {
    const c = T.content;
    T.view.surfaceY = c.top;
    T.view.target.set(0, c.top, 0.04 * c.span);
    T.view.setHome({ azimuth: 0, elevation: 56, distance: c.span * 2.02 }, false);
  }
}

function showChess(screen, T) {
  const m = screen.model, shown = m.shownGame, reviewing = m.review != null;
  const hint = reviewing ? null : m.coachHint;
  const mated = shown.inCheck || (shown.result && shown.result.reason === 'checkmate');
  const s = {
    board: Array.from(shown.board), bottom: m.bottomSide, selected: reviewing ? null : m.selected, targets: reviewing ? [] : m.legalTargets,
    last: shown.lastMove, plies: shown.moves.length, check: mated ? shown.position.kingSquare[shown.current] : null,
    coach: hint ? (hint.move ? hint.move.to : hint.square) : null, coachFrom: hint && hint.move ? hint.move.from : null,
    coachColor: hint && (hint.kind === 'defend' || hint.kind === 'check') ? 0x45c7ff : 0xe8b04a,
  };
  const c = T.content;
  if (c.show(s, app.theme)) {
    T.view.surfaceY = c.top;
    T.view.target.set(0, c.top + 0.25, 0);
  }
  T.view.setHome({ azimuth: s.bottom === Chess.WHITE ? 0 : 180, elevation: 55, distance: lib.chess.SPAN * 2.12 }, T.bottom != null && T.bottom !== s.bottom);
  T.bottom = s.bottom;
  promotionPicker(screen, m);
}

/** On the 3D board the promotion choice is a row of the four pieces over it. */
function promotionPicker(screen, m) {
  const host = screen.wrap3d;
  if (!host) return;
  let el = host.querySelector('.promo3d');
  if (!m.promotion || app.view3D('chess') !== 'main') { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement('div');
  el.className = 'promo3d';
  el.addEventListener('click', (e) => { if (e.target === el) m.cancelPromotion(); });
  const sign = m.game.current === Chess.WHITE ? 1 : -1;
  for (const kind of [Chess.QUEEN, Chess.KNIGHT, Chess.ROOK, Chess.BISHOP]) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', ({ 5: t('queen', '后'), 2: t('knight', '马'), 4: t('rook', '车'), 3: t('bishop', '象') })[kind]);
    b.appendChild(glyph('piece', kind * sign, 44));
    b.addEventListener('click', () => m.promote(kind));
    el.appendChild(b);
  }
  host.appendChild(el);
}
