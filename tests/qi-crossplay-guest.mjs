/* Cross-play the other way: the iPhone app opens the room (`-createRoom go -autoplay`) and a
   web session joins with its code and plays its side with the web engines.
   usage: node tests/qi-crossplay-guest.mjs CODE [moves] */
import { OnlineSession } from '../game/qi/online.js';
import { position } from '../game/qi/room.js';
import { ChessGame, chooseMove, uci } from '../game/qi/chess.js';
import * as Gomoku from '../game/qi/gomoku.js';
import { goFromMoves, point, Go } from '../game/qi/models.js';

const code = process.argv[2], limit = Number(process.argv[3] || 16);
const mem = {};
const s = new OnlineSession({ headers: { Origin: 'https://lifegameproject.com' }, storage: { get: (k) => mem[k] ?? null, set: (k, v) => { mem[k] = v; } } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
s.join(code);
const t0 = Date.now();
while (s.seat == null) { if (s.problem || Date.now() - t0 > 60000) { console.log('problem', s.problem); process.exit(1); } await sleep(100); }
console.log('seated', s.seat, JSON.stringify(s.info));
function myMove() {
  const moves = s.record.moves, game = s.info.game;
  if (game === 'chess') return uci(chooseMove(ChessGame.replay(moves), 'easy', 0.1));
  if (game === 'gomoku') {
    const b = Gomoku.emptyBoard();
    moves.forEach((m, i) => { const [r, c] = point(m); b[r * 15 + c] = i % 2 ? 2 : 1; });
    const m = moves.length ? Gomoku.bestMove(b, s.seat, 1) : { r: 7, c: 7 };
    return `${m.r},${m.c}`;
  }
  const g = goFromMoves(s.info.size || 9, moves);
  const m = Go.chooseBeginnerMove(g);
  return m && m.type !== 'pass' ? `${m.row},${m.col}` : 'pass';
}
let undo = false;
while (Date.now() - t0 < 600000) {
  await sleep(300);
  const r = s.record, pos = position(s.info, r.moves);
  if (!pos || pos.over || r.result || pos.scoring || r.moves.length >= limit) break;
  if (pos.toMove === s.seat && !s.outbox.length) {
    if (r.moves.length >= 6 && !undo) { undo = true; s.send('undo'); await sleep(2500); s.send('cancel'); continue; }
    s.send('move', { move: myMove() });
  }
}
await sleep(1500);
console.log('moves', s.record.moves.join(' '));
console.log('acks', JSON.stringify(s.record.acks), 'seq', s.record.seq, 'offer', JSON.stringify(s.record.offer || null));
s.send('resign');
const t1 = Date.now();
while (!s.record.result && Date.now() - t1 < 20000) await sleep(200);
console.log('result', JSON.stringify(s.record.result));
process.exit(0);
