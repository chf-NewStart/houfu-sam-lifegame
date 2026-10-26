/* Gomoku (five in a row, free-style) on a 15×15 board with Qi's AI: pattern-aware
   evaluation, forced wins and blocks, and alpha-beta minimax at depth 1/2/3
   (easy/normal/hard). A line-by-line port of the app's Qi/Engine/Gomoku.swift (itself a
   port of the old gomoku.html AI); tests/qi-parity.test.mjs replays the app's parity
   fixtures and must match move for move.
   Board: flat array, index r * 15 + c; 0 empty, 1 black (moves first), 2 white. */

export const N = 15;
export const COLUMNS = 'ABCDEFGHJKLMNOP';
export const STARS = [[3, 3], [3, 7], [3, 11], [7, 3], [7, 7], [7, 11], [11, 3], [11, 7], [11, 11]];
/** Cap on quiet candidate moves per node. Forcing moves (wins/blocks) are never capped. */
const MAX_CANDS = 12;
/** Search plies. Depth 4 plays worse than 3 (it ends on the opponent's reply). */
export const DEPTHS = { easy: 1, normal: 2, hard: 3 };
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export function emptyBoard() { return new Array(N * N).fill(0); }
export function coordinate(m) { return COLUMNS[m.c] + (N - m.r); }
function inside(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

/** Static evaluation from black's side: positive favours black. */
export function evaluate(board) { return lineScore(board, 1) - lineScore(board, 2); }

/** Sum of the threat value of every maximal run of `me`'s stones. */
function lineScore(board, me) {
  let score = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r * N + c] !== me) continue;
      for (const [dr, dc] of DIRS) {
        const pr = r - dr, pc = c - dc;
        if (inside(pr, pc) && board[pr * N + pc] === me) continue;   // score from a run's start only
        let len = 1, er = r + dr, ec = c + dc;
        while (inside(er, ec) && board[er * N + ec] === me) { len++; er += dr; ec += dc; }
        const openBefore = inside(pr, pc) && board[pr * N + pc] === 0;
        const openAfter = inside(er, ec) && board[er * N + ec] === 0;
        score += runScore(len, (openBefore ? 1 : 0) + (openAfter ? 1 : 0));
      }
    }
  }
  return score;
}

/** Value of a run of `len` stones with `ends` open ends (0/1/2). */
function runScore(len, ends) {
  if (len >= 5) return 1000000;
  if (ends === 0) return 0;
  if (len === 4) return ends === 2 ? 100000 : 12000;
  if (len === 3) return ends === 2 ? 5000 : 400;
  if (len === 2) return ends === 2 ? 250 : 30;
  return ends === 2 ? 20 : 5;
}

/** The winning line through (r, c), if the stone there completes five or more. */
export function checkWin(board, r, c) {
  const player = board[r * N + c];
  if (!player) return null;
  for (const [dr, dc] of DIRS) {
    const line = [{ r, c }];
    for (let d = 1; d < 5; d++) {
      const nr = r + d * dr, nc = c + d * dc;
      if (!inside(nr, nc) || board[nr * N + nc] !== player) break;
      line.push({ r: nr, c: nc });
    }
    for (let d = 1; d < 5; d++) {
      const nr = r - d * dr, nc = c - d * dc;
      if (!inside(nr, nc) || board[nr * N + nc] !== player) break;
      line.push({ r: nr, c: nc });
    }
    if (line.length >= 5) return { player, line };
  }
  return null;
}

function isWinMove(board, r, c, player) {
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let d = 1; d < 5; d++) {
      const nr = r + d * dr, nc = c + d * dc;
      if (!inside(nr, nc) || board[nr * N + nc] !== player) break;
      count++;
    }
    for (let d = 1; d < 5; d++) {
      const nr = r - d * dr, nc = c - d * dc;
      if (!inside(nr, nc) || board[nr * N + nc] !== player) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

/** Tactical value of `player` placing on empty (r, c): summed run scores of every line
    through that cell (gap-fills included). */
function localThreat(board, r, c, player) {
  board[r * N + c] = player;
  let s = 0;
  for (const [dr, dc] of DIRS) {
    let len = 1;
    let er = r + dr, ec = c + dc;
    while (inside(er, ec) && board[er * N + ec] === player) { len++; er += dr; ec += dc; }
    const openAfter = inside(er, ec) && board[er * N + ec] === 0;
    let pr = r - dr, pc = c - dc;
    while (inside(pr, pc) && board[pr * N + pc] === player) { len++; pr -= dr; pc -= dc; }
    const openBefore = inside(pr, pc) && board[pr * N + pc] === 0;
    s += runScore(len, (openBefore ? 1 : 0) + (openAfter ? 1 : 0));
  }
  board[r * N + c] = 0;
  return s;
}

/** Moves worth searching: an immediate win if there is one, otherwise every forced
    block, otherwise the best quiet cells next to existing stones. */
function candidates(board, player) {
  const opp = player === 1 ? 2 : 1;
  const wins = [], blocks = [], others = [];
  const seen = new Set();
  let hasStone = false;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r * N + c] === 0) continue;
      hasStone = true;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (!inside(nr, nc) || board[nr * N + nc] !== 0) continue;
          const key = nr * N + nc;
          if (seen.has(key)) continue;
          seen.add(key);

          board[key] = player;
          const pw = isWinMove(board, nr, nc, player);
          board[key] = 0;
          if (pw) { wins.push({ r: nr, c: nc }); continue; }

          board[key] = opp;
          const ow = isWinMove(board, nr, nc, opp);
          board[key] = 0;
          if (ow) { blocks.push({ r: nr, c: nc }); continue; }

          others.push({ r: nr, c: nc });
        }
      }
    }
  }
  if (!hasStone) return [{ r: 7, c: 7 }];
  if (wins.length) return wins;
  if (blocks.length) return blocks;
  // Rank quiet moves by what they build plus what they deny (stable sort).
  const scored = others.map((m, i) => ({ i, m, s: localThreat(board, m.r, m.c, player) + localThreat(board, m.r, m.c, opp) * 1.1 }))
    .sort((a, b) => (a.s !== b.s ? b.s - a.s : a.i - b.i));
  const keep = [];
  scored.forEach((e, i) => { if (i < MAX_CANDS || e.s >= 5000) keep.push(e.m); });
  return keep;
}

function minimax(board, depth, alpha, beta, isMax, last) {
  if (last && isWinMove(board, last.r, last.c, board[last.r * N + last.c])) {
    return board[last.r * N + last.c] === 1 ? 500000 + depth : -(500000 + depth);
  }
  if (depth === 0) return evaluate(board);
  const player = isMax ? 1 : 2;
  const cands = candidates(board, player);
  if (isMax) {
    let best = -Infinity;
    for (const m of cands) {
      board[m.r * N + m.c] = 1;
      const s = minimax(board, depth - 1, alpha, beta, false, m);
      board[m.r * N + m.c] = 0;
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of cands) {
    board[m.r * N + m.c] = 2;
    const s = minimax(board, depth - 1, alpha, beta, true, m);
    board[m.r * N + m.c] = 0;
    if (s < best) best = s;
    if (best < beta) beta = best;
    if (beta <= alpha) break;
  }
  return best;
}

/** The AI's move for `player` at the given search depth. */
export function bestMove(boardIn, player, depth) {
  const board = boardIn.slice();
  const isMax = player === 1;
  const cands = candidates(board, player);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  let bestScore = isMax ? -Infinity : Infinity;
  let best = cands[0];
  for (const m of cands) {
    board[m.r * N + m.c] = player;
    const score = isWinMove(board, m.r, m.c, player)
      ? (isMax ? 1000000 : -1000000)
      : minimax(board, depth - 1, -Infinity, Infinity, !isMax, m);
    board[m.r * N + m.c] = 0;
    if (isMax ? score > bestScore : score < bestScore) { bestScore = score; best = m; }
    // Stop early only on a forced win for us.
    if ((isMax ? bestScore : -bestScore) >= 500000) break;
  }
  return best;
}

/** Gold rings: wins. Cyan: mandatory blocks. Green/amber/rust: the three most promising
    threat-building moves, best first. */
export function coach(boardIn, player) {
  const board = boardIn.slice();
  const opp = player === 1 ? 2 : 1;
  const wins = [], blocks = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r * N + c] !== 0) continue;
      board[r * N + c] = player;
      const mine = isWinMove(board, r, c, player);
      board[r * N + c] = 0;
      if (mine) { wins.push({ r, c }); continue; }
      board[r * N + c] = opp;
      const theirs = isWinMove(board, r, c, opp);
      board[r * N + c] = 0;
      if (theirs) blocks.push({ r, c });
    }
  }
  if (wins.length) return { kind: 'win', moves: wins };
  if (blocks.length) return { kind: 'block', moves: blocks };
  const builds = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r * N + c] !== 0) continue;
      const own = localThreat(board, r, c, player), deny = localThreat(board, r, c, opp);
      if (own >= 250 || deny >= 400) builds.push({ i: builds.length, m: { r, c }, s: own + deny * 0.8 });
    }
  }
  builds.sort((a, b) => (a.s !== b.s ? b.s - a.s : a.i - b.i));
  const moves = builds.slice(0, 3).map((b) => b.m);
  return { kind: moves.length ? 'build' : 'quiet', moves };
}
