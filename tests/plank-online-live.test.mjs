/* A whole Plank duel between two clients over a running relay. Skipped unless RELAY_URL is set:
     (cd relay && npx wrangler@4 dev --port 8787 --var "ALLOW_ORIGINS:http://127.0.0.1:8000")
     RELAY_URL=ws://127.0.0.1:8787 node --test tests/plank-online-live.test.mjs
   RELAY_ORIGIN (default http://127.0.0.1:8000) is sent as the Origin the relay checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelMatch } from '../game/plank-duel-engine.js';
import { PlankRoom, makeRoomCode, makePid } from '../game/plank-online.js';

const RELAY = process.env.RELAY_URL;
const ORIGIN = process.env.RELAY_ORIGIN || 'http://127.0.0.1:8000';
const skip = !RELAY && 'set RELAY_URL to run against a relay';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function client(code, creating) {
  const pid = makePid();
  let ws;
  const room = new PlankRoom({ code, pid, creating, app: 'web', now: () => performance.now(),
    write: (p, v) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'set', p, v })); } });
  const seen = { starts: [], events: [], finished: 0, friend: [], writes: 0 };
  room.on('start', (seed, len) => seen.starts.push([seed, len])).on('event', e => seen.events.push(e))
    .on('finished', () => seen.finished++).on('friend', here => seen.friend.push(here));
  const opened = new Promise((resolve, reject) => {
    ws = new WebSocket(`${RELAY}/room/${code}?id=${pid}`, { headers: { Origin: ORIGIN } });
    ws.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.t === 'init') { room.opened(m.d, m.who); resolve(); }
      else if (m.t === 'u') room.update(m.p, m.v ?? null);
      else if (m.t === 'who') room.presence(m.ids);
    };
    ws.onerror = () => reject(new Error('relay unreachable'));
  });
  return { room, seen, opened, close: () => ws.close() };
}

let clients = [];
test.afterEach(() => { for (const c of clients) c.close(); clients = []; });

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) { if (Date.now() > end) throw new Error('timed out'); await sleep(20); }
}

test('two clients duel through the relay', { skip, timeout: 30000 }, async () => {
  const code = makeRoomCode();
  const host = client(code, true);
  await host.opened;
  const guest = client(code, false);
  await guest.opened;
  clients = [host, guest];
  await until(() => host.room.friendActive && guest.room.friendActive);
  assert.equal(host.room.role, 'host');
  assert.equal(guest.room.role, 'guest');

  host.room.setReady(5); guest.room.setReady(60);
  await until(() => host.seen.starts.length && guest.seen.starts.length);
  assert.deepEqual(guest.seen.starts, host.seen.starts);
  const [seed, len] = host.seen.starts[0];
  assert.equal(len, 5);

  // The duel at 60 frames a second, real time: the guest pulls, the host rests.
  const match = new DuelMatch({ duration: len, seed });
  let events = 0, t = 0;
  while (!match.done) {
    await sleep(1000 / 60);
    t += 1000 / 60;
    guest.room.guestTick(t % 2000 < 1400 ? 'strike' : 'rest', true, performance.now());
    guest.room.tick(performance.now());
    for (const e of match.advance(1 / 60, ['rest', host.room.peerAction])) { host.room.sendEvent(e, match.round); events++; }
    host.room.hostTick(match, false, performance.now());
  }
  host.room.finish(match);
  await until(() => guest.seen.finished === 1);
  assert.equal(guest.seen.events.length, events);
  assert.equal(guest.room.snapshot.elapsed, match.elapsed);
  // The guest is the host's side 1: positive line drags the host toward its edge.
  assert.ok(match.sides[1].rounds > 0 || match.line > 0, 'the guest pulled the line its way');

  guest.room.leave();
  await sleep(100);
  guest.close();
  await until(() => host.seen.friend.at(-1) === false);
  host.room.leave();
  await sleep(100);
  host.close();
});
