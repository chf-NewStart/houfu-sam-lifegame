/* The computer players, off the page's thread: Go's beginner opponent, Gomoku's minimax
   and the chess search (which thinks for up to two seconds). One request at a time; the
   page drops any answer that arrives for a position it has left. */
import '../go-engine.js?v=46';
import * as Gomoku from './gomoku.js?v=4';
import { ChessGame, chooseMove, uci } from './chess.js?v=4';
import { estimate } from './ownership.js?v=4';

const Go = globalThis.GoEngine;

self.onmessage = (e) => {
  const q = e.data;
  let move = null;
  try {
    if (q.game === 'go') {
      const { game } = Go.GoGame.replay({ size: q.size, komi: 7.5, events: q.events });
      const m = Go.chooseBeginnerMove(game);
      move = m && m.type !== 'pass' ? { row: m.row, col: m.col } : null;
    } else if (q.game === 'gomoku') {
      move = q.board.every((v) => v === 0) ? { r: 7, c: 7 } : Gomoku.bestMove(q.board, q.player, q.depth);
    } else if (q.game === 'ownership') {
      move = estimate(q.board, q.size, q.toMove, q.playouts);
    } else if (q.game === 'chess') {
      const game = ChessGame.replay(q.moves);
      const m = game && chooseMove(game, q.level, q.seconds);
      move = m ? uci(m) : null;
    }
  } catch (err) {
    move = null;
  }
  self.postMessage({ id: q.id, move });
};
