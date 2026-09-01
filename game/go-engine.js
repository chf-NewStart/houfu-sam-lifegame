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

  /* A deliberately small, deterministic teaching opponent. It does not search
     a game tree; instead it ranks every legal move by the local ideas a new Go
     player is learning on this page. Keeping it pure makes the browser turn
     scheduler easy to cancel and lets fixtures test the exact same decisions. */
  function groupsOf(game, color, board) {
    const source = board || game.board;
    const seen = new Set();
    const groups = [];
    for (let point = 0; point < source.length; point++) {
      if (source[point] !== color || seen.has(point)) continue;
      const rc = game.rowCol(point);
      const group = game.groupAt(rc[0], rc[1], source);
      if (!group) continue;
      group.stones.forEach((stone) => seen.add(stone));
      groups.push(group);
    }
    return groups;
  }

  function atariRescueMap(game, color) {
    const rescues = new Map();
    for (const group of groupsOf(game, color)) {
      if (group.liberties.length !== 1) continue;
      const liberty = group.liberties[0];
      rescues.set(liberty, (rescues.get(liberty) || 0) + group.stones.length);
    }
    return rescues;
  }

  function adjacentGroupCount(game, point, color, board) {
    const source = board || game.board;
    const groups = new Set();
    for (const neighbor of game.neighborIndexes(point)) {
      if (source[neighbor] !== color) continue;
      const rc = game.rowCol(neighbor);
      const group = game.groupAt(rc[0], rc[1], source);
      if (group && group.stones.length) groups.add(group.stones[0]);
    }
    return groups.size;
  }

  function newlyAtaried(game, point, color, board) {
    const source = board || game.board;
    const seen = new Set();
    let stones = 0;
    for (const neighbor of game.neighborIndexes(point)) {
      if (source[neighbor] !== color || seen.has(neighbor)) continue;
      const rc = game.rowCol(neighbor);
      const group = game.groupAt(rc[0], rc[1], source);
      if (!group) continue;
      group.stones.forEach((stone) => seen.add(stone));
      if (group.liberties.length === 1) stones += group.stones.length;
    }
    return stones;
  }

  function orderedGroups(game, color) {
    return groupsOf(game, color).sort((a, b) =>
      a.liberties.length - b.liberties.length ||
      b.stones.length - a.stones.length ||
      a.stones[0] - b.stones[0]
    );
  }

  function strategyTarget(group) {
    return group ? {
      color: group.color,
      stones: group.stones.slice(),
      liberties: group.liberties.slice(),
    } : null;
  }

  function moveFromPoint(game, point) {
    if (point == null) return null;
    const rc = game.rowCol(point);
    return { row: rc[0], col: rc[1], point };
  }

  function survivingGroup(game, group, board) {
    const survivor = group.stones.find((stone) => board[stone] === group.color);
    if (survivor == null) return null;
    const rc = game.rowCol(survivor);
    return game.groupAt(rc[0], rc[1], board);
  }

  function strategyMove(game, evaluation) {
    const move = moveFromPoint(game, evaluation.point);
    move.liberties = evaluation.preview.liberties.length;
    return move;
  }

  /* A one-move, explainable priority ladder for the live beginner coach. It is
     intentionally not a life-and-death solver or a claim about the best move. */
  function analyzeBeginnerPriority(game) {
    if (!game || game.phase !== 'playing' || (game.current !== BLACK && game.current !== WHITE)) {
      return { kind: 'inactive', color: game && game.current || BLACK, target: null, move: null };
    }
    const color = game.current;
    const opponent = other(color);
    const own = orderedGroups(game, color);
    const theirs = orderedGroups(game, opponent);
    const endangered = own.filter((group) => group.liberties.length === 1);
    const evaluations = [];

    for (let row = 0; row < game.size; row++) {
      for (let col = 0; col < game.size; col++) {
        const point = game.index(row, col);
        if (game.board[point] !== EMPTY) continue;
        const preview = game.preview(row, col);
        if (!preview.ok) continue;
        const capturedSet = new Set(preview.captured);
        const saved = endangered.map((group) => ({ group, after: survivingGroup(game, group, preview.board) }))
          .filter((entry) => entry.after && entry.after.liberties.length >= 2);
        const capturedGroups = theirs.filter((group) => group.stones.some((stone) => capturedSet.has(stone)));
        const attacked = theirs.filter((group) => group.liberties.length > 1)
          .map((group) => ({ group, after: survivingGroup(game, group, preview.board) }))
          .filter((entry) => entry.after && entry.after.liberties.length === 1);
        evaluations.push({
          point, preview, saved, capturedGroups, attacked,
          savedStones: saved.reduce((sum, entry) => sum + entry.group.stones.length, 0),
          attackedStones: attacked.reduce((sum, entry) => sum + entry.group.stones.length, 0),
          selfAtari: preview.liberties.length === 1 && preview.captured.length === 0,
        });
      }
    }

    if (endangered.length) {
      const rescues = evaluations.filter((entry) => entry.savedStones > 0);
      rescues.sort((a, b) =>
        b.savedStones - a.savedStones || b.saved.length - a.saved.length ||
        b.preview.captured.length - a.preview.captured.length ||
        b.saved.reduce((sum, entry) => sum + entry.after.liberties.length, 0) -
          a.saved.reduce((sum, entry) => sum + entry.after.liberties.length, 0) ||
        a.point - b.point
      );
      if (!rescues.length) {
        return { kind: 'danger', color, target: strategyTarget(endangered[0]), move: null };
      }
      const best = rescues[0];
      const savedTarget = best.saved.slice().sort((a, b) =>
        b.group.stones.length - a.group.stones.length || a.group.stones[0] - b.group.stones[0]
      )[0];
      return {
        kind: best.preview.captured.length ? 'defend-capture' : 'defend',
        color,
        target: strategyTarget(savedTarget.group),
        move: strategyMove(game, best),
        threatenedStones: best.savedStones,
        savedGroups: best.saved.length,
        captured: best.preview.captured.length,
        resultLiberties: savedTarget.after.liberties.length,
      };
    }

    const captures = evaluations.filter((entry) => entry.preview.captured.length > 0);
    captures.sort((a, b) =>
      b.preview.captured.length - a.preview.captured.length ||
      b.preview.liberties.length - a.preview.liberties.length || a.point - b.point
    );
    if (captures.length) {
      const best = captures[0];
      const target = best.capturedGroups.slice().sort((a, b) =>
        b.stones.length - a.stones.length || a.stones[0] - b.stones[0]
      )[0] || null;
      return {
        kind: 'capture', color, target: strategyTarget(target), move: strategyMove(game, best),
        captured: best.preview.captured.length,
      };
    }

    const attacks = evaluations.filter((entry) => entry.attackedStones > 0 && !entry.selfAtari);
    attacks.sort((a, b) =>
      b.attackedStones - a.attackedStones || b.attacked.length - a.attacked.length ||
      b.preview.liberties.length - a.preview.liberties.length || a.point - b.point
    );
    if (attacks.length) {
      const best = attacks[0];
      const attackedTarget = best.attacked.slice().sort((a, b) =>
        b.group.stones.length - a.group.stones.length || a.group.stones[0] - b.group.stones[0]
      )[0];
      return {
        kind: 'attack', color, target: strategyTarget(attackedTarget.group), move: strategyMove(game, best),
        attackedStones: best.attackedStones,
        attackedGroups: best.attacked.length,
      };
    }

    return { kind: 'quiet', color, target: null, move: null };
  }

  function chooseBeginnerMove(game, options) {
    const opts = options || {};
    if (!game || game.phase !== 'playing') return null;
    const color = game.current;
    const opponent = other(color);
    const total = game.board.length;
    const occupied = game.board.reduce((count, value) => count + (value === EMPTY ? 0 : 1), 0);
    const rescues = atariRescueMap(game, color);
    const owner = game.score([]).owner;
    const stars = new Set(starPoints(game.size).map((rc) => game.index(rc[0], rc[1])));
    const last = game.lastMove && game.lastMove.t === 'play' ? game.lastMove : null;
    const candidates = [];

    for (let row = 0; row < game.size; row++) {
      for (let col = 0; col < game.size; col++) {
        const point = game.index(row, col);
        if (game.board[point] !== EMPTY) continue;
        const preview = game.preview(row, col);
        if (!preview.ok) continue;

        const captured = preview.captured.length;
        const rescued = rescues.get(point) || 0;
        const saved = rescued && (preview.liberties.length > 1 || captured) ? rescued : 0;
        const selfAtari = preview.liberties.length === 1 && captured === 0;
        const attacked = newlyAtaried(game, point, opponent, preview.board);
        const friendlyGroups = adjacentGroupCount(game, point, color, game.board);
        const enemyNeighbors = game.neighborIndexes(point).filter((next) => game.board[next] === opponent).length;
        const ownTerritory = owner[point] === color;
        const edge = Math.min(row, col, game.size - 1 - row, game.size - 1 - col);
        const preferredLine = game.size <= 9 ? 2 : 3;
        const lineShape = 22 - Math.abs(edge - preferredLine) * 7;
        const star = occupied < game.size * 2 && stars.has(point) ? 34 : 0;
        const nearLast = last ? Math.max(0, 5 - Math.abs(row - last.r) - Math.abs(col - last.c)) * 3 : 0;

        let score = 0;
        score += captured * 10000 + (captured ? 1800 : 0);
        score += saved * 6200 + (saved ? 1100 : 0);
        score += attacked * 720;
        score += Math.max(0, friendlyGroups - 1) * 150;
        score += enemyNeighbors * 28;
        score += Math.min(preview.liberties.length, 6) * 18;
        score += lineShape + star + nearLast;
        if (ownTerritory && !captured && !saved && !attacked) score -= 1500;
        if (selfAtari) score -= 5200 + preview.group.length * 90;

        let reason = 'shape';
        if (captured) reason = 'capture';
        else if (saved) reason = 'save-atari';
        else if (attacked) reason = 'atari';
        else if (friendlyGroups > 1) reason = 'connect';
        candidates.push({
          type: 'play', row, col, score, reason, captured, saved, attacked,
          selfAtari, ownTerritory, liberties: preview.liberties.length,
        });
      }
    }

    if (!candidates.length) return { type: 'pass', reason: 'no-legal-move' };
    candidates.sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);
    const best = candidates[0];
    const tactical = best.captured > 0 || best.saved > 0 || best.attacked > 0;
    const lateEnough = occupied >= Math.max(12, Math.floor(total * .28));
    if (game.passes === 1 && lateEnough && !tactical && best.ownTerritory) {
      return { type: 'pass', reason: 'agree-end' };
    }
    if (occupied >= Math.floor(total * .82) && !tactical && best.score < 0) {
      return { type: 'pass', reason: 'board-settled' };
    }

    /* Optional variety is opt-in. The page intentionally uses the deterministic
       top move, which makes behavior explainable and repeatable for beginners. */
    if (typeof opts.random === 'function') {
      const close = candidates.filter((move) => best.score - move.score <= 12).slice(0, 4);
      const pick = Math.min(close.length - 1, Math.floor(Math.max(0, opts.random()) * close.length));
      return close[pick];
    }
    return best;
  }

  return {
    GoGame, EMPTY, BLACK, WHITE, other, coordinate, starPoints, chooseBeginnerMove,
    analyzeBeginnerPriority,
    COLUMNS, VALID_SIZES: Array.from(VALID_SIZES),
  };
});
