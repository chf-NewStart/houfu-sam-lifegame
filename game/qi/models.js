/* The three board games as the app runs them (Qi/Model/GoModel.swift, GomokuModel.swift,
   ChessModel.swift): against the computer, two players on one device, or a friend online;
   with the coach, undo, replay of a finished game, and the 屠龍/斬蛇 moment in Go. Each
   model calls `changed()` after anything the screen shows; the screens read its fields. */
import '../go-engine.js?v=46';
import * as Gomoku from './gomoku.js?v=6';
import * as Chess from './chess.js?v=6';
import * as Sound from './sound.js?v=6';

export const Go = globalThis.GoEngine;

/** Who controls each side. Side 1 moves first: Black in Go and Gomoku, White in chess. */
export const SEATINGS = ['youFirst', 'youSecond', 'twoPlayers'];
export function isAI(seating, side) {
  return seating === 'youFirst' ? side === 2 : seating === 'youSecond' ? side === 1 : false;
}

// ── The computer, in a worker ─────────────────────────────────────────────────

let worker = null, nextId = 1;
const waiting = new Map();
export function ask(query) {
  if (!worker) {
    worker = new Worker(new URL('./worker.js?v=6', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const done = waiting.get(e.data.id); waiting.delete(e.data.id); if (done) done(e.data.move); };
  }
  const id = nextId++;
  return new Promise((resolve) => { waiting.set(id, resolve); worker.postMessage({ ...query, id }); });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } }
function load(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }

/** Online moves: "r,c" for Go and Gomoku. */
export function point(m) {
  const parts = String(m).split(',').map(Number);
  return parts.length === 2 && parts.every(Number.isInteger) ? [parts[0], parts[1]] : null;
}

class Model {
  constructor() { this.listeners = []; this.online = null; this.onlineSeat = 1; this.replayAt = null; this.coach = true; this.thinking = false; }
  changed() { for (const f of this.listeners) f(); }
  get isOnline() { return this.online != null; }
  get review() { return this.replayAt; }
  /** The friend is seated, no result yet, and no move of ours is still on its way. */
  onlineReady() {
    const o = this.online;
    return o.seat === this.onlineSeat && o.friendPid != null && !(o.record && o.record.result) && !o.pendingMoves.length;
  }
}

// ── Go ────────────────────────────────────────────────────────────────────────

export class GoModel extends Model {
  static sizes = [9, 13, 19];
  static slainSize = 5;

  constructor() {
    super();
    const saved = load('qi_go');
    this.size = saved && GoModel.sizes.includes(saved.size) ? saved.size : 9;
    this.seating = saved && SEATINGS.includes(saved.seating) ? saved.seating : 'youFirst';
    this.game = new Go.GoGame({ size: this.size });
    this.dead = new Set();
    this.refusal = null;
    this.opponentPassed = false;
    this.slain = null;
    this.token = 0;
    if (saved && Array.isArray(saved.events)) {
      const { game, error } = Go.GoGame.replay({ size: this.size, komi: 7.5, events: saved.events });
      if (!error) this.game = game;
      if (saved.finished && this.game.phase !== 'finished') {
        if (saved.finished.reason === 'score' && this.game.phase === 'scoring') {
          this.dead = new Set(saved.dead || []);
          this.game.phase = 'finished';
          this.game.result = { reason: 'score', winner: this.game.score([...this.dead]).winner };
        }
      }
    }
  }

  persist() {
    if (this.isOnline) return;
    save('qi_go', { size: this.size, seating: this.seating, events: this.game.events, dead: [...this.dead],
      finished: this.game.result && this.game.result.reason === 'score' ? { reason: 'score' } : null });
  }

  get isHumanTurn() {
    if (this.game.phase !== 'playing' || this.thinking) return false;
    if (this.online) return this.game.current === this.onlineSeat && this.onlineReady();
    return !isAI(this.seating, this.game.current);
  }
  get moveNumber() { return this.game.events.filter((e) => e.t === 'play' || e.t === 'pass').length; }
  get priority() {
    if (!this.coach || !this.isHumanTurn) return null;
    const key = this.game.positionHistory.length + ':' + this.game.boardKey() + this.game.current;
    if (this._prioKey !== key) { this._prioKey = key; this._prio = Go.analyzeBeginnerPriority(this.game); }
    return this._prio;
  }
  get finalScore() { return this.game.score([...this.dead]); }

  // Replay: how many stones of the finished game the board shows (null: the end).
  get reviewLength() { return this.game.positionHistory.length - 1; }
  setReview(k) {
    this.replayAt = k == null || k >= this.reviewLength ? null : Math.max(0, k);
    this.changed();
  }
  get shownPositions() { return this.review == null ? this.game.positionHistory : this.game.positionHistory.slice(0, this.review + 1); }
  get shownBoard() {
    return this.review == null ? this.game.board : Array.from(this.game.positionHistory[this.review], Number);
  }
  get shownLast() {
    if (this.review == null) {
      const m = this.game.lastMove;
      return m && m.t === 'play' ? [m.r, m.c] : null;
    }
    const plays = this.game.events.filter((e) => e.t === 'play');
    const k = this.review;
    return k > 0 && plays[k - 1] ? [plays[k - 1].r, plays[k - 1].c] : null;
  }

  newGame({ size, seating } = {}) {
    this.token++;
    if (size) this.size = size;
    if (seating) this.seating = seating;
    this.game = new Go.GoGame({ size: this.size });
    this.dead = new Set();
    this.thinking = false;
    this.refusal = null;
    this.opponentPassed = false;
    this.replayAt = null;
    this.persist();
    this.changed();
    this.scheduleAI();
  }

  /** A tap on the board: a move while playing, or marking a group dead while scoring. */
  tap(row, col) {
    if (this.game.phase === 'playing') {
      if (!this.isHumanTurn) return;
      const preview = this.game.preview(row, col);
      if (!preview.ok) { this.refusal = preview.reason; this.changed(); return; }
      this.refusal = null;
      this.opponentPassed = false;
      this.play(row, col);
      if (this.online) this.online.send('move', { move: `${row},${col}` }); else this.scheduleAI();
      this.persist();
      this.changed();
    } else if (this.game.phase === 'scoring') {
      if (this.online) {
        if (this.game.groupAt(row, col)) this.online.send('dead', { point: row * this.game.size + col });
      } else {
        this.dead = new Set(this.game.toggleDead([...this.dead], row, col));
        this.persist();
        this.changed();
      }
    }
  }

  pass() {
    if (!this.isHumanTurn) return;
    this.refusal = null;
    this.game.pass();
    this.replayAt = null;
    if (this.online) this.online.send('move', { move: 'pass' }); else this.scheduleAI();
    this.persist();
    this.changed();
  }

  resign() {
    if (this.online) { this.online.send('resign'); return; }
    if (this.game.phase !== 'playing' && this.game.phase !== 'scoring') return;
    this.token++;
    this.thinking = false;
    // Two players: the player to move resigns. Against the computer: you do.
    this.game.resign(this.seating === 'twoPlayers' ? this.game.current : (this.seating === 'youFirst' ? 1 : 2));
    this.replayAt = null;
    this.persist();
    this.changed();
  }

  /** Both players passed: count the board with the stones marked dead. */
  finishScoring() {
    if (this.game.phase !== 'scoring') return;
    if (this.online) { this.online.send('count'); return; }
    const score = this.game.score([...this.dead]);
    this.game.phase = 'finished';
    this.game.result = { reason: 'score', winner: score.winner };
    this.replayAt = null;
    this.persist();
    this.changed();
  }

  resumePlay() {
    if (this.game.phase !== 'scoring') return;
    if (this.online) { this.online.send('resume'); return; }
    this.dead = new Set();
    this.game.resume();
    this.persist();
    this.changed();
    this.scheduleAI();
  }

  /** Takes back the last move, or your last move and the computer's reply. */
  undo() {
    if (this.online) { this.online.send('undo'); return; }
    this.token++;
    this.thinking = false;
    const events = this.game.events.slice();
    if (!events.length) return;
    // Remove the last move, then keep going until it is a human's turn again.
    do { events.pop(); } while (events.length && isAI(this.seating, this.colorToMove(events)));
    const { game, error } = Go.GoGame.replay({ size: this.size, komi: this.game.komi, events });
    if (!error) {
      this.game = game;
      this.dead = new Set();
      this.refusal = null;
      this.opponentPassed = false;
      this.replayAt = null;
    }
    this.persist();
    this.changed();
    this.scheduleAI();
  }

  get canUndo() {
    if (this.isOnline) return this.game.phase !== 'finished' && this.game.events.some((e) => e.t !== 'resume' && e.by === this.onlineSeat);
    return this.game.events.some((e) => !isAI(this.seating, e.by || 0));
  }

  colorToMove(events) {
    const { game } = Go.GoGame.replay({ size: this.size, komi: this.game.komi, events });
    return game.current;
  }

  play(row, col) {
    const out = this.game.play(row, col);
    if (!out.ok) return;
    this.replayAt = null;
    Sound.stone(out.color);
    if (out.captured.length) Sound.capture(out.captured.length);
    if (out.captured.length >= GoModel.slainSize) this.slay(Go.other(out.color), out.captured.length);
  }

  slay(color, count) {
    this.slain = { color, count, id: Math.random() };
    Sound.slay(color);
  }

  async scheduleAI() {
    if (this.isOnline || this.game.phase !== 'playing' || !isAI(this.seating, this.game.current)) return;
    const token = ++this.token;
    this.thinking = true;
    this.changed();
    const events = this.game.events.slice(), size = this.size;
    const [move] = await Promise.all([ask({ game: 'go', size, events }), sleep(450)]);
    if (token !== this.token) return;
    this.thinking = false;
    if (this.game.phase !== 'playing') { this.changed(); return; }
    if (move) this.play(move.row, move.col);
    else { this.game.pass(); this.opponentPassed = true; }
    this.persist();
    this.changed();
  }

  // Online

  beginOnline(session) {
    this.token++;
    this.thinking = false;
    if (!this.online) this.localGame = { events: this.game.events.slice(), size: this.size, seating: this.seating, dead: [...this.dead], result: this.game.result, phase: this.game.phase };
    this.online = session;
    this.refusal = null;
    this.opponentPassed = false;
    this.syncOnline();
  }

  endOnline() {
    if (!this.online) return;
    this.online = null;
    const saved = this.localGame;
    if (saved) {
      this.size = saved.size;
      this.seating = saved.seating;
      const { game } = Go.GoGame.replay({ size: saved.size, komi: 7.5, events: saved.events });
      if (saved.phase === 'finished' && saved.result && game.phase !== 'finished') { game.phase = 'finished'; game.result = saved.result; }
      this.game = game;
      this.dead = new Set(saved.dead);
    }
    this.localGame = null;
    this.refusal = null;
    this.opponentPassed = false;
    this.replayAt = null;
    this.changed();
    this.scheduleAI();
  }

  /** Replays the room's moves (plus this device's moves still on their way). */
  syncOnline() {
    const o = this.online;
    if (!o || !o.info || !o.record) return;
    const size = o.info.size || 9;
    const rebuilt = goFromMoves(size, o.record.moves);
    if (!rebuilt) return;
    if (o.seat) this.onlineSeat = o.seat;
    for (const m of o.pendingMoves) {
      if (m === 'pass') rebuilt.pass(); else { const p = point(m); if (p) rebuilt.play(p[0], p[1]); }
    }
    const result = o.record.result;
    if (result) {
      rebuilt.phase = 'finished';
      rebuilt.result = result.reason === 'resign' ? { reason: 'resign', winner: result.winner, resigned: 3 - result.winner } : { reason: 'score', winner: result.winner };
    }
    const before = this.game.events;
    const after = rebuilt.events;
    const grew = this.size === size && after.length > before.length && JSON.stringify(after.slice(0, before.length)) === JSON.stringify(before);
    const last = after[after.length - 1];
    if (grew && last && last.by !== this.onlineSeat) {
      // The friend's move: the same sound as one made here.
      if (last.t === 'play') {
        Sound.stone(last.by || 1);
        const taken = rebuilt.captures[1] + rebuilt.captures[2] - this.game.captures[1] - this.game.captures[2];
        if (taken > 0) {
          Sound.capture(taken);
          if (taken >= GoModel.slainSize) this.slay(this.onlineSeat, taken);
        }
      }
      this.opponentPassed = last.t === 'pass';
    }
    const same = this.size === size && JSON.stringify(after) === JSON.stringify(before) && (this.game.result || null) === null && !result;
    this.size = size;
    if (!same) this.replayAt = null;
    this.game = rebuilt;
    this.dead = new Set(o.record.dead || []);
    this.changed();
  }
}

/** A Go game from a room's moves ("r,c", "pass", "resume"); null if any is illegal. */
export function goFromMoves(size, moves) {
  const game = new Go.GoGame({ size, komi: 7.5 });
  for (const m of moves) {
    let out;
    if (m === 'pass') out = game.pass();
    else if (m === 'resume') out = game.resume();
    else { const p = point(m); out = p ? game.play(p[0], p[1]) : { ok: false }; }
    if (!out || !out.ok) return null;
  }
  return game;
}

// ── Gomoku ────────────────────────────────────────────────────────────────────

export class GomokuModel extends Model {
  constructor() {
    super();
    const saved = load('qi_gomoku');
    this.difficulty = saved && Gomoku.DEPTHS[saved.difficulty] ? saved.difficulty : 'normal';
    this.seating = saved && SEATINGS.includes(saved.seating) ? saved.seating : 'youFirst';
    this.resigned = null;
    this.token = 0;
    this.replay(saved && Array.isArray(saved.moves) ? saved.moves.map(([r, c]) => ({ r, c })) : []);
  }

  persist() {
    if (this.isOnline) return;
    save('qi_gomoku', { difficulty: this.difficulty, seating: this.seating, moves: this.moves.map((m) => [m.r, m.c]) });
  }

  get isDraw() { return this.winner == null && this.moves.length === Gomoku.N * Gomoku.N; }
  get isOver() { return this.winner != null || this.isDraw; }
  get isHumanTurn() {
    if (this.isOver || this.thinking) return false;
    if (this.online) return this.current === this.onlineSeat && this.onlineReady();
    return !isAI(this.seating, this.current);
  }
  get lastMove() { return this.moves[this.moves.length - 1] || null; }
  get canUndo() {
    if (this.isOnline) return !this.isOver && this.moves.some((_, i) => (i % 2 === 0 ? 1 : 2) === this.onlineSeat);
    return this.moves.some((_, i) => !isAI(this.seating, i % 2 === 0 ? 1 : 2));
  }

  setReview(k) { this.replayAt = k == null || k >= this.moves.length ? null : Math.max(0, k); this.changed(); }
  get shownMoves() { return this.review == null ? this.moves : this.moves.slice(0, this.review); }
  get shownBoard() {
    if (this.review == null) return this.board;
    const b = Gomoku.emptyBoard();
    this.shownMoves.forEach((m, i) => { b[m.r * Gomoku.N + m.c] = i % 2 === 0 ? 1 : 2; });
    return b;
  }
  get shownWinLine() { return this.review == null ? this.winLine : []; }

  get coachHints() {
    if (!this.coach || !this.isHumanTurn || !this.moves.length) return null;
    const key = this.moves.length;
    if (this._coachKey !== key) { this._coachKey = key; this._coach = Gomoku.coach(this.board, this.current); }
    return this._coach;
  }

  newGame({ difficulty, seating } = {}) {
    this.token++;
    if (difficulty) this.difficulty = difficulty;
    if (seating) this.seating = seating;
    this.replay([]);
    this.thinking = false;
    this.replayAt = null;
    this.persist();
    this.changed();
    this.scheduleAI();
  }

  tap(row, col) {
    if (!this.isHumanTurn || this.board[row * Gomoku.N + col] !== 0) return;
    this.place({ r: row, c: col });
    if (this.online) this.online.send('move', { move: `${row},${col}` }); else this.scheduleAI();
    this.persist();
    this.changed();
  }

  /** Online only: gives the game up. */
  resign() { if (this.online) this.online.send('resign'); }

  undo() {
    if (this.online) { this.online.send('undo'); return; }
    this.token++;
    this.thinking = false;
    if (!this.moves.length) return;
    const remaining = this.moves.slice();
    do { remaining.pop(); } while (remaining.length && isAI(this.seating, remaining.length % 2 === 0 ? 1 : 2));
    this.replay(remaining);
    this.replayAt = null;
    this.persist();
    this.changed();
    this.scheduleAI();
  }

  replay(list) {
    this.board = Gomoku.emptyBoard();
    this.moves = [];
    this.current = 1;
    this.winner = null;
    this.winLine = [];
    for (const m of list) this.place(m, true);
  }

  place(m, silent) {
    this.board[m.r * Gomoku.N + m.c] = this.current;
    this.moves.push({ r: m.r, c: m.c });
    if (!silent) { this.replayAt = null; Sound.stone(this.current); }
    const win = Gomoku.checkWin(this.board, m.r, m.c);
    if (win) { this.winner = win.player; this.winLine = win.line; } else this.current = this.current === 1 ? 2 : 1;
  }

  async scheduleAI() {
    if (this.isOnline || this.isOver || !isAI(this.seating, this.current)) return;
    const token = ++this.token;
    this.thinking = true;
    this.changed();
    const query = { game: 'gomoku', board: this.board.slice(), player: this.current, depth: Gomoku.DEPTHS[this.difficulty] };
    const [move] = await Promise.all([ask(query), sleep(350)]);
    if (token !== this.token) return;
    this.thinking = false;
    if (move) this.place(move);
    this.persist();
    this.changed();
  }

  beginOnline(session) {
    this.token++;
    this.thinking = false;
    if (!this.online) this.localGame = { moves: this.moves.slice(), seating: this.seating };
    this.online = session;
    this.syncOnline();
  }

  endOnline() {
    if (!this.online) return;
    this.online = null;
    this.resigned = null;
    if (this.localGame) { this.seating = this.localGame.seating; this.replay(this.localGame.moves); }
    this.localGame = null;
    this.replayAt = null;
    this.changed();
    this.scheduleAI();
  }

  syncOnline() {
    const o = this.online;
    if (!o || !o.record) return;
    if (o.seat) this.onlineSeat = o.seat;
    const list = o.record.moves.concat(o.pendingMoves).map(point).filter(Boolean).map(([r, c]) => ({ r, c }));
    const before = this.moves;
    const same = JSON.stringify(list) === JSON.stringify(before);
    const kept = same ? this.replayAt : null;
    this.replay(list);
    this.replayAt = kept;
    if (list.length > before.length && JSON.stringify(list.slice(0, before.length)) === JSON.stringify(before) && (list.length % 2 === 1 ? 1 : 2) !== this.onlineSeat) {
      Sound.stone(list.length % 2 === 1 ? 1 : 2);
    }
    const r = o.record.result;
    this.resigned = r && r.reason === 'resign' ? 3 - r.winner : null;
    if (r && r.reason === 'resign') this.winner = r.winner;
    this.changed();
  }
}

// ── Chess ─────────────────────────────────────────────────────────────────────

export class ChessModel extends Model {
  constructor() {
    super();
    const saved = load('qi_chess');
    this.level = saved && Chess.LEVELS[saved.level] ? saved.level : 'normal';
    this.seating = saved && SEATINGS.includes(saved.seating) ? saved.seating : 'youFirst';
    this.faceToFace = !!load('qi_chess_f2f');
    this.game = (saved && Array.isArray(saved.moves) && Chess.ChessGame.replay(saved.moves)) || new Chess.ChessGame();
    if (saved && saved.result && !this.game.isOver) this.game.result = saved.result;
    this.selected = null;
    this.promotion = null;
    this.token = 0;
    this.updateCoach();
  }

  persist() {
    if (this.isOnline) return;
    save('qi_chess', { level: this.level, seating: this.seating, moves: this.game.moves.map(Chess.uci),
      result: this.game.result && (this.game.result.reason === 'resign' || this.game.result.reason === 'agreement') ? this.game.result : null });
  }

  setFaceToFace(on) { this.faceToFace = on; save('qi_chess_f2f', on); this.changed(); }
  setCoach(on) { this.coach = on; this.updateCoach(); this.changed(); }

  /** Whether a person on this device plays `side`. */
  controls(side) { return this.isOnline ? side === this.onlineSeat : !isAI(this.seating, side); }
  get isHumanTurn() {
    if (this.game.isOver || this.thinking || !this.controls(this.game.current)) return false;
    if (this.online) return this.onlineReady();
    return true;
  }
  /** The side at the bottom of the board: yours against the computer or online, White
      when two people share the device. */
  get bottomSide() { return this.isOnline ? this.onlineSeat : (this.seating === 'youSecond' ? Chess.BLACK : Chess.WHITE); }
  get legalTargets() {
    if (this.selected == null || !this.isHumanTurn) return [];
    return [...new Set(this.game.movesFrom(this.selected).map((m) => m.to))];
  }
  get canUndo() {
    if (this.isOnline) return !this.game.isOver && this.game.moves.some((_, i) => i % 2 === (this.onlineSeat === 1 ? 0 : 1));
    return this.game.moves.some((_, i) => !isAI(this.seating, i % 2 === 0 ? 1 : 2));
  }

  setReview(k) {
    if (k == null || k >= this.game.moves.length) { this.replayAt = null; this.reviewGame = null; }
    else {
      this.replayAt = Math.max(0, k);
      this.reviewGame = Chess.ChessGame.replay(this.game.moves.slice(0, this.replayAt).map(Chess.uci));
    }
    this.changed();
  }
  /** The game as the board shows it: replayed to the move being looked at, or as it stands. */
  get shownGame() { return this.review == null || !this.reviewGame ? this.game : this.reviewGame; }

  newGame({ level, seating } = {}) {
    this.token++;
    if (level) this.level = level;
    if (seating) this.seating = seating;
    this.game = new Chess.ChessGame();
    this.thinking = false;
    this.selected = null;
    this.promotion = null;
    this.replayAt = null;
    this.updateCoach();
    this.persist();
    this.changed();
    this.scheduleAI();
  }

  /** A tap on a square: pick up one of your pieces, put the picked one down on a legal
      square, or let go of it. */
  tap(sq) {
    if (!this.isHumanTurn || this.promotion) return;
    const piece = this.game.board[sq];
    if (this.selected != null) {
      if (this.game.movesFrom(this.selected).some((m) => m.to === sq)) { this.move(this.selected, sq); return; }
      if (this.selected === sq) { this.selected = null; this.changed(); return; }
    }
    this.selected = piece !== 0 && Chess.sideOf(piece) === this.game.current ? sq : null;
    this.changed();
  }

  /** Picks up a piece to drag it (nothing happens if it isn't yours to move). */
  pickUp(sq) {
    if (!this.isHumanTurn || this.promotion) return false;
    const piece = this.game.board[sq];
    if (piece === 0 || Chess.sideOf(piece) !== this.game.current) return false;
    this.selected = sq;
    this.changed();
    return true;
  }

  move(from, to) {
    if (!this.isHumanTurn) return;
    const options = this.game.movesFrom(from).filter((m) => m.to === to);
    if (!options.length) return;
    if (options.length > 1) { this.promotion = { from, to }; this.changed(); return; }
    this.commit(options[0]);
  }

  promote(kind) { if (this.promotion) this.commit(Chess.mv(this.promotion.from, this.promotion.to, kind)); }
  cancelPromotion() { this.promotion = null; this.selected = null; this.changed(); }

  commit(m) {
    this.promotion = null;
    this.selected = null;
    if (!this.game.isLegal(m)) { this.changed(); return; }
    this.play(m);
    if (this.online) this.online.send('move', { move: Chess.uci(m) }); else this.scheduleAI();
    this.persist();
    this.changed();
  }

  play(m) {
    const mover = this.game.current;
    const taken = this.game.play(m);
    if (taken == null) return;
    this.replayAt = null;
    if (taken > 0) Sound.capture(1); else Sound.stone(mover);
    this.updateCoach();
  }

  resign() {
    if (this.online) { this.online.send('resign'); return; }
    if (this.game.isOver) return;
    this.token++;
    this.thinking = false;
    this.game.resign(this.seating === 'twoPlayers' ? this.game.current : (this.seating === 'youFirst' ? 1 : 2));
    this.selected = null;
    this.replayAt = null;
    this.updateCoach();
    this.persist();
    this.changed();
  }

  undo() {
    if (this.online) { this.online.send('undo'); return; }
    this.token++;
    this.thinking = false;
    const moves = this.game.moves.map(Chess.uci);
    if (!moves.length) return;
    do { moves.pop(); } while (moves.length && isAI(this.seating, moves.length % 2 === 0 ? 1 : 2));
    const rebuilt = Chess.ChessGame.replay(moves);
    if (rebuilt) this.game = rebuilt;
    this.selected = null;
    this.promotion = null;
    this.replayAt = null;
    this.updateCoach();
    this.persist();
    this.changed();
    this.scheduleAI();
  }

  updateCoach() { this.coachHint = this.coach && this.isHumanTurn ? Chess.coach(this.game) : null; }

  async scheduleAI() {
    if (this.isOnline || this.game.isOver || !isAI(this.seating, this.game.current)) return;
    const token = ++this.token;
    this.thinking = true;
    this.updateCoach();
    this.changed();
    const query = { game: 'chess', moves: this.game.moves.map(Chess.uci), level: this.level };
    const [move] = await Promise.all([ask(query), sleep(350)]);
    if (token !== this.token) return;
    this.thinking = false;
    const m = move && Chess.parseUci(move);
    if (m) this.play(m);
    this.updateCoach();
    this.persist();
    this.changed();
  }

  beginOnline(session) {
    this.token++;
    this.thinking = false;
    if (!this.online) this.localGame = { moves: this.game.moves.map(Chess.uci), result: this.game.result, seating: this.seating };
    this.online = session;
    this.selected = null;
    this.promotion = null;
    this.syncOnline();
  }

  endOnline() {
    if (!this.online) return;
    this.online = null;
    if (this.localGame) {
      this.game = Chess.ChessGame.replay(this.localGame.moves) || new Chess.ChessGame();
      if (this.localGame.result && !this.game.isOver) this.game.result = this.localGame.result;
      this.seating = this.localGame.seating;
    }
    this.localGame = null;
    this.selected = null;
    this.promotion = null;
    this.replayAt = null;
    this.updateCoach();
    this.changed();
    this.scheduleAI();
  }

  syncOnline() {
    const o = this.online;
    if (!o || !o.record) return;
    const rebuilt = Chess.ChessGame.replay(o.record.moves);
    if (!rebuilt) return;
    if (o.seat) this.onlineSeat = o.seat;
    for (const text of o.pendingMoves) { const m = Chess.parseUci(text); if (m) rebuilt.play(m); }
    const r = o.record.result;
    if (r) { if (r.reason === 'resign') rebuilt.resign(3 - r.winner); else rebuilt.agreeDraw(); }
    const before = this.game.moves.map(Chess.uci), after = rebuilt.moves.map(Chess.uci);
    const lastMover = after.length % 2 === 1 ? 1 : 2;
    if (after.length > before.length && after.slice(0, before.length).join() === before.join() && !this.controls(lastMover)) {
      const caught = rebuilt.taken[1].length + rebuilt.taken[2].length > this.game.taken[1].length + this.game.taken[2].length;
      if (caught) Sound.capture(1); else Sound.stone(lastMover);
    }
    if (after.join() !== before.join() || !!r !== !!this.game.result) this.replayAt = null;
    this.game = rebuilt;
    if (this.selected != null) {
      const p = this.game.board[this.selected];
      if (p === 0 || Chess.sideOf(p) !== this.onlineSeat) this.selected = null;
    }
    this.updateCoach();
    this.changed();
  }
}
