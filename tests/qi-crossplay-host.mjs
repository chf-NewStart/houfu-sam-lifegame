/* Cross-play with the iPhone app: a web session (the same code the page runs) opens a room
   on the real relay, prints its code, and plays its side with the web engines. Run the app
   with `-joinRoom CODE -autoplay` (DEBUG) and it plays the other side.
   usage: node tests/qi-crossplay-host.mjs chess|go|gomoku [moves] */
import { OnlineSession } from '../game/qi/online.js';
import { position } from '../game/qi/room.js';
import { ChessGame, chooseMove, uci } from '../game/qi/chess.js';
import * as Gomoku from '../game/qi/gomoku.js';
import { goFromMoves, point, Go } from '../game/qi/models.js';
import { writeFileSync } from 'node:fs';

const game = process.argv[2] || 'chess', limit = Number(process.argv[3] || 16);
const mem = {};
const s = new OnlineSession({ headers: { Origin: 'https://lifegameproject.com' }, storage: { get: (k) => mem[k] ?? null, set: (k, v) => { mem[k] = v; } } });
s.create(game, 9, 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
while (!s.code || !s.info) await sleep(50);
console.log('CODE', s.code);
writeFileSync(new URL('./.crossplay-code', import.meta.url), s.code);
const t0 = Date.now();
while (!s.friendHere) { if (Date.now() - t0 > 900000) { console.log('no guest'); process.exit(1); } await sleep(200); }
console.log('guest seated', JSON.stringify(s.info.seats));
function myMove() {
  const moves = s.record.moves;
  if (game === 'chess') return uci(chooseMove(ChessGame.replay(moves), 'easy', 0.1));
  if (game === 'gomoku') {
    const b = Gomoku.emptyBoard();
    moves.forEach((m, i) => { const [r, c] = point(m); b[r * 15 + c] = i % 2 ? 2 : 1; });
    const m = moves.length ? Gomoku.bestMove(b, s.seat, 1) : { r: 7, c: 7 };
    return `${m.r},${m.c}`;
  }
  const g = goFromMoves(9, moves);
  const m = Go.chooseBeginnerMove(g);
  return m && m.type !== 'pass' ? `${m.row},${m.col}` : 'pass';
}
let undoAsked = false;
while (Date.now() - t0 < 1200000) {
  await sleep(300);
  const r = s.record, pos = position(s.info, r.moves);
  if (!pos || pos.over || r.result || pos.scoring || r.moves.length >= limit) break;
  if (r.moves.length === 6 && !undoAsked && pos.toMove === s.seat) {
    // A take-back the app's guest must answer by hand: just show it, then cancel.
    undoAsked = true;
    s.send('undo');
    await sleep(1500);
    s.send('cancel');
    continue;
  }
  if (pos.toMove === s.seat) s.send('move', { move: myMove() });
}
await sleep(1500);
console.log('moves', s.record.moves.join(' '));
console.log('acks', JSON.stringify(s.record.acks), 'seq', s.record.seq);
console.log('join record', JSON.stringify(Object.entries(s.map).filter(([k]) => k.startsWith('j/') || k.startsWith('i/'))));
s.send('resign');
await sleep(1500);
console.log('result', JSON.stringify(s.record.result));
process.exit(0);
