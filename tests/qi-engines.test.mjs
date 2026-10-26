/* Qi web engines against the app: chess perft (standard positions), the Gomoku and Go
   parity fixtures the app's ParityTests replay (QiTests/parity-fixtures.json, copied here
   as qi-parity-fixtures.json), and a few whole chess games.
   usage: node tests/qi-engines.test.mjs */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as Gomoku from '../game/qi/gomoku.js';
import { Position, ChessGame, chooseMove, coach, uci } from '../game/qi/chess.js';

const require = createRequire(import.meta.url);
const Go = require('../game/go-engine.js');
let failures = 0;
function check(ok, what) { if (!ok) { failures++; console.log('FAIL', what); } }

// Chess perft (chessprogramming.org's standard positions).
const perft = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [fen, counts] of perft) {
  const p = Position.fromFEN(fen);
  check(p.fen === fen, 'fen round trip ' + fen);
  counts.forEach((n, i) => { const got = p.perft(i + 1); check(got === n, `perft ${i + 1} ${fen}: ${got} != ${n}`); });
}

const fixtures = JSON.parse(readFileSync(new URL('./qi-parity-fixtures.json', import.meta.url)));

// Gomoku: every move, the coach before it, and the winner.
for (const g of fixtures.gomoku) {
  const board = Gomoku.emptyBoard();
  let player = 1, winner = 0;
  g.steps.forEach((s, i) => {
    if (s.level) {
      const kind = Gomoku.coach(board, player);
      check(kind.kind === s.coach, `gomoku ${g.openingSeed} step ${i} coach ${kind.kind} != ${s.coach}`);
      check(JSON.stringify(kind.moves.map((m) => [m.r, m.c])) === JSON.stringify(s.coachMoves), `gomoku ${g.openingSeed} step ${i} coach moves`);
      const m = board.every((v) => v === 0) ? { r: 7, c: 7 } : Gomoku.bestMove(board, player, Gomoku.DEPTHS[s.level]);
      check(m && m.r === s.move[0] && m.c === s.move[1], `gomoku ${g.openingSeed} step ${i} move ${m && [m.r, m.c]} != ${s.move}`);
    }
    board[s.move[0] * 15 + s.move[1]] = player;
    if (Gomoku.checkWin(board, s.move[0], s.move[1])) winner = player;
    player = 3 - player;
  });
  check(winner === (g.winner || 0), `gomoku ${g.openingSeed} winner ${winner} != ${g.winner}`);
}

// Go: the shared engine, so this mostly guards the copy the page loads.
for (const g of fixtures.go) {
  const game = new Go.GoGame({ size: g.size });
  g.steps.forEach((s, i) => {
    if (s.opening) { game.play(s.move[0], s.move[1]); return; }
    const p = Go.analyzeBeginnerPriority(game);
    check(p.kind === s.coach, `go ${g.size}/${g.openingSeed} step ${i} coach`);
    const m = Go.chooseBeginnerMove(game);
    if (s.move === 'pass') { check(!m || m.type === 'pass', `go step ${i} pass`); game.pass(); }
    else { check(m.row === s.move[0] && m.col === s.move[1], `go ${g.size}/${g.openingSeed} step ${i} move`); game.play(m.row, m.col); }
  });
  const sc = game.score([]);
  check(sc.black === g.score.black && sc.white === g.score.white, `go ${g.size}/${g.openingSeed} score`);
}

// Chess games: the computer against itself, replayed through UCI, with the coach.
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (const level of ['easy', 'normal']) {
  const game = new ChessGame();
  const t0 = Date.now();
  while (!game.isOver && game.moves.length < 80) {
    coach(game);
    const m = chooseMove(game, level, 0.05, rand);
    check(game.play(m) != null, 'ai move legal');
  }
  const again = ChessGame.replay(game.moves.map(uci));
  check(again && again.position.fen === game.position.fen, 'replay');
  console.log(`chess ${level}: ${game.moves.length} moves, ${game.result ? game.result.reason : 'unfinished'}, ${Date.now() - t0} ms; ${game.san.slice(0, 12).join(' ')}`);
}
// Mate in one for the coach; fool's mate is found.
const fool = ChessGame.replay(['f2f3', 'e7e5', 'g2g4']);
check(coach(fool).kind === 'mate' && coach(fool).san === 'Qh4#', 'coach finds Qh4#');
const mated = ChessGame.replay(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
check(mated.result && mated.result.reason === 'checkmate' && mated.result.winner === 2, 'fool\'s mate ends the game');
check(uci(chooseMove(fool, 'hard', 0.5)) === 'd8h4', 'hard finds the mate');

console.log(failures ? `${failures} failures` : 'all passed');
process.exit(failures ? 1 : 0);
