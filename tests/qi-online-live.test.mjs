/* Qi online rooms on the real relay, two web sessions: chess (moves, a take-back, a draw
   offer, resign, rematch with sides swapped), Go (passes, dead stones, counting) and
   Gomoku (a five). The relay only answers lifegameproject.com, so this sends that Origin.
   usage: node tests/qi-online-live.test.mjs */
import { OnlineSession } from '../game/qi/online.js';
import { position } from '../game/qi/room.js';

const headers = { Origin: 'https://lifegameproject.com' };
const mem = () => { const m = {}; return { get: (k) => m[k] ?? null, set: (k, v) => { m[k] = v; } }; };
const make = () => new OnlineSession({ headers, storage: mem() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, what, ms = 8000) {
  const t0 = Date.now();
  while (!f()) { if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await sleep(30); }
}
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('FAIL', what); } else console.log('ok  ', what); };

async function pair(game, size, seat) {
  const host = make(), guest = make();
  host.create(game, size, seat);
  await until(() => host.info && host.code, 'room created');
  guest.join(host.code);
  await until(() => guest.seat != null && host.friendHere && guest.friendHere, 'guest seated');
  return { host, guest };
}

// Chess
{
  const { host, guest } = await pair('chess', null, 1);
  check(host.seat === 1 && guest.seat === 2, `chess seats (room ${host.code})`);
  host.send('move', { move: 'e2e4' });
  await until(() => guest.record.moves.length === 1, 'guest sees e4');
  guest.send('move', { move: 'e7e5' });
  check(guest.pendingMoves[0] === 'e7e5', 'guest shows its move at once');
  await until(() => host.record.moves.length === 2 && guest.pendingMoves.length === 0, 'host applies e5');
  guest.send('move', { move: 'e2e4' });   // not its turn: refused, acknowledged
  await until(() => guest.outbox.length === 0, 'refused move acknowledged');
  check(host.record.moves.length === 2, 'refused move not applied');
  host.send('undo');
  await until(() => guest.record.offer && guest.record.offer.kind === 'undo', 'guest sees the take-back');
  guest.send('accept');
  await until(() => host.record.moves.length === 0 && !host.record.offer, 'take-back accepted');
  check(host.record.moves.join() === '', 'host took back e4 and the reply') ;
  host.send('move', { move: 'd2d4' });
  guest.send('draw');
  await until(() => host.record.offer && host.record.offer.kind === 'draw', 'draw offered');
  host.send('decline');
  await until(() => guest.record && !guest.record.offer, 'draw declined');
  guest.send('resign');
  await until(() => host.record.result && host.record.result.reason === 'resign', 'resigned');
  check(host.record.result.winner === 1, 'white wins by resignation');
  host.send('rematch');
  guest.send('rematch');
  await until(() => guest.record.round === 2 && guest.seat === 1, 'rematch, sides swapped');
  check(host.seat === 2 && guest.record.moves.length === 0, 'host now black, empty board');
  host.leave(); guest.leave();
}

// Go: two passes, a dead stone, both count.
{
  const { host, guest } = await pair('go', 9, 2);
  check(guest.seat === 1 && host.info.size === 9, 'go: guest is black, 9×9');
  guest.send('move', { move: '2,2' });
  await until(() => host.record.moves.length === 1, 'black plays');
  host.send('move', { move: '6,6' });
  guest.send('move', { move: 'pass' });
  await until(() => host.record.moves.length === 3, 'black passes');
  host.send('move', { move: 'pass' });
  await until(() => guest.record.moves.length === 4, 'both passed');
  check(position(guest.info, guest.record.moves).scoring, 'scoring');
  guest.send('dead', { point: 6 * 9 + 6 });
  await until(() => host.record.dead.length === 1, 'white stone marked dead');
  host.send('count');
  guest.send('count');
  await until(() => guest.record.result && guest.record.result.reason === 'score', 'counted');
  check(guest.record.result.winner === 1, 'black wins the count (81 to 7.5)');
  host.leave(); guest.leave();
}

// Gomoku: five in a row ends it.
{
  const { host, guest } = await pair('gomoku', null, 1);
  for (let i = 0; i < 5; i++) {
    host.send('move', { move: `7,${3 + i}` });
    await until(() => guest.record.moves.length === i * 2 + 1, 'black ' + i);
    if (i < 4) { guest.send('move', { move: `8,${3 + i}` }); await until(() => host.record.moves.length === i * 2 + 2, 'white ' + i); }
  }
  check(position(guest.info, guest.record.moves).over, 'five in a row is over');
  host.leave(); guest.leave();
}

console.log(failures ? `${failures} failures` : 'all passed');
process.exit(failures ? 1 : 0);
