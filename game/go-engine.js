(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GoEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const VALID_SIZES = new Set([5, 7, 9, 13, 19]);
  const COLUMNS = 'ABCDEFGHJKLMNOPQRST';

  function other(color) { return color === BLACK ? WHITE : BLACK; }
  function isInt(value) { return Number.isInteger(value); }
  function coordinate(size, row, col) {
    if (!isInt(size) || !isInt(row) || !isInt(col) || row < 0 || col < 0 || row >= size || col >= size) return '';
    return COLUMNS[col] + (size - row);
  }
  function starPoints(size) {
    if (size === 19) {
      const p = [3, 9, 15];
      return p.flatMap((row) => p.map((col) => [row, col]));
    }
    if (size === 13) return [[3, 3], [3, 9], [6, 6], [9, 3], [9, 9]];
    if (size === 9) return [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]];
    return [[Math.floor(size / 2), Math.floor(size / 2)]];
  }
  function cloneEvent(event) {
    const copy = { t: event.t };
    if (event.r != null) copy.r = event.r;
    if (event.c != null) copy.c = event.c;
    if (event.by != null) copy.by = event.by;
    return copy;
  }

  class GoGame {
    constructor(options) {
      const opts = options || {};
      this.size = Number(opts.size || 9);
      this.komi = Number(opts.komi == null ? 7.5 : opts.komi);
      if (!VALID_SIZES.has(this.size)) throw new Error('unsupported-size');
      if (!Number.isFinite(this.komi)) throw new Error('invalid-komi');
      this.board = new Array(this.size * this.size).fill(EMPTY);
      this.current = BLACK;
      this.phase = 'playing';
      this.passes = 0;
      this.captures = { 1: 0, 2: 0 };
      this.events = [];
      this.lastMove = null;
      this.result = null;
      this.positionHistory = [this.boardKey()];
      this.seenPositions = new Set(this.positionHistory);
    }

    static fromPosition(options) {
      const opts = options || {};
      const game = new GoGame({ size: opts.size, komi: opts.komi });
      if (!Array.isArray(opts.board) || opts.board.length !== game.size * game.size) {
        throw new Error('invalid-board');
      }
      if (opts.board.some((v) => v !== EMPTY && v !== BLACK && v !== WHITE)) {
        throw new Error('invalid-board');
      }
      game.board = opts.board.slice();
      game.current = opts.current === WHITE ? WHITE : BLACK;
      game.captures = {
        1: Math.max(0, Number(opts.captures && opts.captures[1]) || 0),
        2: Math.max(0, Number(opts.captures && opts.captures[2]) || 0),
      };
      game.positionHistory = Array.isArray(opts.positionHistory) && opts.positionHistory.length
        ? opts.positionHistory.map(String)
        : [game.boardKey()];
      if (game.positionHistory[game.positionHistory.length - 1] !== game.boardKey()) {
        game.positionHistory.push(game.boardKey());
      }
      game.seenPositions = new Set(game.positionHistory);
      return game;
    }

    static replay(options) {
      const opts = options || {};
      const game = new GoGame({ size: opts.size, komi: opts.komi });
      const events = Array.isArray(opts.events) ? opts.events : [];
      for (let i = 0; i < events.length; i++) {
        const event = events[i] || {};
        let outcome;
        if (event.t === 'play') outcome = game.play(event.r, event.c, event.by);
        else if (event.t === 'pass') outcome = game.pass(event.by);
        else if (event.t === 'resume') outcome = game.resume(event.by);
        else if (event.t === 'resign') outcome = game.resign(event.by);
        else outcome = { ok: false, reason: 'invalid-event' };
        if (!outcome.ok) return { game, error: outcome.reason, index: i };
      }
      return { game, error: null, index: -1 };
    }

    index(row, col) { return row * this.size + col; }
    rowCol(index) { return [Math.floor(index / this.size), index % this.size]; }
    inBounds(row, col) {
      return isInt(row) && isInt(col) && row >= 0 && row < this.size && col >= 0 && col < this.size;
    }
    boardKey(board) { return (board || this.board).join(''); }
    at(row, col) { return this.inBounds(row, col) ? this.board[this.index(row, col)] : null; }

    neighborIndexes(index) {
      const row = Math.floor(index / this.size);
      const col = index % this.size;
      const out = [];
      if (row > 0) out.push(index - this.size);
      if (row + 1 < this.size) out.push(index + this.size);
      if (col > 0) out.push(index - 1);
      if (col + 1 < this.size) out.push(index + 1);
      return out;
    }

    groupAt(row, col, board) {
      const source = board || this.board;
      if (!this.inBounds(row, col)) return null;
      const start = this.index(row, col);
      const color = source[start];
      if (color === EMPTY) return null;
      const stones = [];
      const liberties = new Set();
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length) {
        const point = stack.pop();
        stones.push(point);
        for (const next of this.neighborIndexes(point)) {
          if (source[next] === EMPTY) liberties.add(next);
          else if (source[next] === color && !seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      return {
        color,
        stones: stones.sort((a, b) => a - b),
        liberties: Array.from(liberties).sort((a, b) => a - b),
      };
    }

    preview(row, col) {
      if (this.phase !== 'playing') return { ok: false, reason: 'not-playing' };
      if (!this.inBounds(row, col)) return { ok: false, reason: 'out-of-bounds' };
      const point = this.index(row, col);
      if (this.board[point] !== EMPTY) return { ok: false, reason: 'occupied' };

      const color = this.current;
      const opponent = other(color);
      const next = this.board.slice();
      next[point] = color;
      const captured = [];
      const checked = new Set();
      for (const neighbor of this.neighborIndexes(point)) {
        if (next[neighbor] !== opponent || checked.has(neighbor)) continue;
        const rc = this.rowCol(neighbor);
        const group = this.groupAt(rc[0], rc[1], next);
        group.stones.forEach((stone) => checked.add(stone));
        if (group.liberties.length === 0) {
          for (const stone of group.stones) {
            next[stone] = EMPTY;
            captured.push(stone);
          }
        }
      }

      const placed = this.groupAt(row, col, next);
      if (!placed || placed.liberties.length === 0) return { ok: false, reason: 'suicide' };
      const key = this.boardKey(next);
      if (this.seenPositions.has(key)) return { ok: false, reason: 'superko' };
      return {
        ok: true,
        board: next,
        key,
        color,
        captured: captured.sort((a, b) => a - b),
        group: placed.stones,
        liberties: placed.liberties,
      };
    }

    play(row, col, by) {
      if (by != null && by !== this.current) return { ok: false, reason: 'wrong-player' };
      const outcome = this.preview(row, col);
      if (!outcome.ok) return outcome;
      const color = this.current;
      this.board = outcome.board;
      this.captures[color] += outcome.captured.length;
      this.current = other(color);
      this.passes = 0;
      this.lastMove = { t: 'play', r: row, c: col, by: color };
      this.events.push(cloneEvent(this.lastMove));
      this.positionHistory.push(outcome.key);
      this.seenPositions.add(outcome.key);
      return {
        ok: true,
        color,
        captured: outcome.captured.slice(),
        group: outcome.group.slice(),
        liberties: outcome.liberties.slice(),
      };
    }

    pass(by) {
      if (this.phase !== 'playing') return { ok: false, reason: 'not-playing' };
      if (by != null && by !== this.current) return { ok: false, reason: 'wrong-player' };
      const color = this.current;
      this.passes += 1;
      this.current = other(color);
      this.lastMove = { t: 'pass', by: color };
      this.events.push(cloneEvent(this.lastMove));
      if (this.passes >= 2) this.phase = 'scoring';
      return { ok: true, color, scoring: this.phase === 'scoring' };
    }

    resume(by) {
      if (this.phase !== 'scoring') return { ok: false, reason: 'not-scoring' };
      if (by != null && by !== BLACK && by !== WHITE) return { ok: false, reason: 'wrong-player' };
      this.phase = 'playing';
      this.passes = 0;
      this.lastMove = { t: 'resume', by: by || this.current };
      this.events.push(cloneEvent(this.lastMove));
      return { ok: true, current: this.current };
    }

    resign(by) {
      if (this.phase !== 'playing' && this.phase !== 'scoring') {
        return { ok: false, reason: 'not-playing' };
      }
      const color = by == null ? this.current : by;
      if (color !== BLACK && color !== WHITE) return { ok: false, reason: 'wrong-player' };
      this.phase = 'finished';
      this.result = { reason: 'resign', winner: other(color), resigned: color };
      this.lastMove = { t: 'resign', by: color };
      this.events.push(cloneEvent(this.lastMove));
      return { ok: true, winner: this.result.winner, resigned: color };
    }

    toggleDead(deadIndexes, row, col) {
      const dead = new Set(Array.isArray(deadIndexes) ? deadIndexes : Array.from(deadIndexes || []));
      const group = this.groupAt(row, col);
      if (!group) return Array.from(dead).sort((a, b) => a - b);
      const remove = group.stones.every((stone) => dead.has(stone));
      for (const stone of group.stones) {
        if (remove) dead.delete(stone);
        else dead.add(stone);
      }
      return Array.from(dead).sort((a, b) => a - b);
    }

    score(deadIndexes) {
      const dead = new Set(Array.isArray(deadIndexes) ? deadIndexes : Array.from(deadIndexes || []));
      const effective = this.board.slice();
      for (const point of dead) {
        if (isInt(point) && point >= 0 && point < effective.length) effective[point] = EMPTY;
      }

      const stones = { 1: 0, 2: 0 };
      for (const value of effective) if (value === BLACK || value === WHITE) stones[value] += 1;
      const territory = { 1: 0, 2: 0 };
      const neutral = [];
      const owner = new Array(effective.length).fill(EMPTY);
      const seen = new Set();
      for (let start = 0; start < effective.length; start++) {
        if (effective[start] !== EMPTY || seen.has(start)) continue;
        const region = [];
        const borders = new Set();
        const stack = [start];
        seen.add(start);
        while (stack.length) {
          const point = stack.pop();
          region.push(point);
          for (const next of this.neighborIndexes(point)) {
            if (effective[next] === EMPTY && !seen.has(next)) {
              seen.add(next);
              stack.push(next);
            } else if (effective[next] === BLACK || effective[next] === WHITE) {
              borders.add(effective[next]);
            }
          }
        }
        if (borders.size === 1) {
          const color = Array.from(borders)[0];
          territory[color] += region.length;
          region.forEach((point) => { owner[point] = color; });
        } else {
          neutral.push(...region);
        }
      }

      const black = stones[BLACK] + territory[BLACK];
      const whiteBase = stones[WHITE] + territory[WHITE];
      const white = whiteBase + this.komi;
      const winner = black === white ? EMPTY : (black > white ? BLACK : WHITE);
      return {
        black,
        white,
        whiteBase,
        komi: this.komi,
        winner,
        margin: Math.abs(black - white),
        stones,
        territory,
        neutral: neutral.sort((a, b) => a - b),
        owner,
        dead: Array.from(dead).sort((a, b) => a - b),
      };
    }
  }

  return {
    GoGame, EMPTY, BLACK, WHITE, other, coordinate, starPoints,
    COLUMNS, VALID_SIZES: Array.from(VALID_SIZES),
  };
});
