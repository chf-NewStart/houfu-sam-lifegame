import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelMatch } from '../game/plank-duel-engine.js';
import {
  PlankRoom, KEYS, ROOM_RE, PID_RE, STATE_INTERVAL, AWAY_GRACE, makeRoomCode, makePid,
  normalizeRoomCode, roomLink, acceptableRelay, validRoom, validSnapshot,
} from '../game/plank-online.js';

/* An in-memory relay with the real one's behaviour (relay/src/index.js): a flat map per room,
   every write echoed to every connection (the writer too) in one order, presence by ?id=.
   Deliveries queue until flush(), so tests decide when the network catches up. */
export class MemoryRelay {
  constructor() { this.rooms = new Map(); this.queue = []; this.writes = 0; this.log = []; }
  room(code) {
    if (!this.rooms.has(code)) this.rooms.set(code, { map: {}, conns: new Set() });
    return this.rooms.get(code);
  }
  ids(room) { return [...new Set([...room.conns].map(c => c.pid))].sort(); }
  connect(code, pid, target) {
    const room = this.room(code);
    const conn = { code, pid, target, open: true };
    room.conns.add(conn);
    this.queue.push([conn, 'opened', JSON.parse(JSON.stringify(room.map)), this.ids(room)]);
    for (const other of room.conns) if (other !== conn) this.queue.push([other, 'presence', this.ids(room)]);
    return conn;
  }
  set(conn, key, value) {
    if (!conn.open) return;
    const room = this.room(conn.code);
    if (value == null) delete room.map[key]; else room.map[key] = JSON.parse(JSON.stringify(value));
    this.writes++;
    this.log.push({ from: conn.pid, key, value: value == null ? null : JSON.parse(JSON.stringify(value)) });
    for (const other of room.conns) this.queue.push([other, 'update', key, value == null ? null : JSON.parse(JSON.stringify(value))]);
  }
  drop(conn) {
    if (!conn.open) return;
    conn.open = false;
    const room = this.room(conn.code);
    room.conns.delete(conn);
    for (const other of room.conns) this.queue.push([other, 'presence', this.ids(room)]);
  }
  flush() {
    while (this.queue.length) {
      const [conn, kind, ...args] = this.queue.shift();
      if (!conn.open) continue;
      conn.target[kind](...args);
    }
  }
}

let clock = 1_000_000;
const now = () => clock;

function device(relay, code, { creating = false, pid = makePid(), seed = 7 } = {}) {
  let conn;
  let r = seed;
  const room = new PlankRoom({ code, pid, creating, write: (k, v) => relay.set(conn, k, v), now,
    random: () => { r = (r * 9301 + 49297) % 233280; return r / 233280; } });
  const seen = { roles: [], friend: [], starts: [], events: [], pauses: [], finished: 0, problems: [] };
  room.on('role', x => seen.roles.push(x)).on('friend', x => seen.friend.push(x))
    .on('start', (seed, len) => seen.starts.push([seed, len])).on('event', (e, round) => seen.events.push([e, round]))
    .on('pause', p => seen.pauses.push(p)).on('finished', () => seen.finished++).on('problem', p => seen.problems.push(p));
  conn = relay.connect(code, pid, room);
  return { room, seen, get conn() { return conn; }, reconnect() { conn = relay.connect(code, pid, room); } };
}

function pair() {
  const relay = new MemoryRelay();
  const code = makeRoomCode();
  const host = device(relay, code, { creating: true });
  relay.flush();
  const guest = device(relay, code);
  relay.flush();
  return { relay, code, host, guest };
}

test('codes, ids, links and relay addresses', () => {
  for (let i = 0; i < 50; i++) { assert.match(makeRoomCode(), ROOM_RE); assert.match(makePid(), PID_RE); }
  assert.equal(normalizeRoomCode(' abc-d23 4 '), 'ABCD234');
  assert.equal(normalizeRoomCode('https://lifegameproject.com/game/plank-duel.html?room=QWERTY2'), 'QWERTY2');
  assert.equal(roomLink('QWERTY2'), 'https://lifegameproject.com/game/plank-duel.html?room=QWERTY2');
  assert.ok(acceptableRelay('wss://relay.example.com'));
  assert.ok(acceptableRelay('ws://127.0.0.1:8787'));
  assert.ok(!acceptableRelay('ws://relay.example.com'));
  assert.ok(!acceptableRelay('https://relay.example.com'));
});

test('the creator hosts and the first friend is seated as the guest', () => {
  const { relay, host, guest } = pair();
  assert.deepEqual(host.seen.roles, ['host']);
  assert.deepEqual(guest.seen.roles, ['guest']);
  assert.deepEqual(host.seen.friend, [true]);
  assert.deepEqual(guest.seen.friend, [true]);
  const room = relay.rooms.values().next().value.map.room;
  assert.ok(validRoom(room));
  assert.equal(room.host, host.room.pid);
  assert.equal(room.guest, guest.room.pid);
});

test('a third person finds the room full; an unknown code is not found', () => {
  const { relay, code } = pair();
  const third = device(relay, code);
  relay.flush();
  assert.deepEqual(third.seen.problems, ['full']);
  const lost = device(relay, makeRoomCode());
  relay.flush();
  assert.deepEqual(lost.seen.problems, ['notFound']);
});

test('both ready starts both with the same seed; the host\'s length wins', () => {
  const { relay, host, guest } = pair();
  host.room.setReady(45);
  relay.flush();
  assert.equal(host.seen.starts.length, 0);
  guest.room.setReady(90);
  relay.flush();
  assert.equal(host.seen.starts.length, 1);
  assert.deepEqual(host.seen.starts, guest.seen.starts);
  assert.equal(guest.seen.starts[0][1], 45);
  assert.equal(host.room.playing, 1);
  assert.equal(guest.room.playing, 1);
});

test('a friend who is ready first stays ready when the other comes back from the results', () => {
  const { relay, host, guest } = pair();
  host.room.setReady(30); guest.room.setReady(30); relay.flush();
  host.room.finish(new DuelMatch({ duration: 30, seed: 1 })); relay.flush();
  assert.equal(guest.seen.finished, 1);
  // The guest sets up again while the host is still looking at the results.
  guest.room.resetForNextDuel(); guest.room.setReady(30); relay.flush();
  host.room.resetForNextDuel(); host.room.setReady(30); relay.flush();
  assert.equal(host.seen.starts.length, 2);
  assert.equal(guest.seen.starts.length, 2);
  assert.equal(guest.room.playing, 2);
});

test('the guest\'s moves reach the host only when they change, at most every 120 ms', () => {
  const { relay, host, guest } = pair();
  host.room.setReady(30); guest.room.setReady(30); relay.flush();
  const before = relay.writes;
  guest.room.guestTick('block', true, 0); relay.flush();
  assert.equal(host.room.peerAction, 'block');
  for (let t = 16; t < 1000; t += 16) guest.room.guestTick('block', true, t);
  assert.equal(relay.writes - before, 1, 'an unchanged move is not written again');
  guest.room.guestTick('strike', false, 1010); relay.flush();
  assert.equal(host.room.peerAction, 'strike');
  assert.equal(host.room.peerVisible, false);
  guest.room.guestTick('rest', true, 1050);       // too soon: held back …
  relay.flush();
  assert.equal(host.room.peerAction, 'strike');
  guest.room.tick(1140); relay.flush();             // … and sent once 120 ms have passed
  assert.equal(host.room.peerAction, 'rest');
  assert.equal(host.room.peerVisible, true);
});

test('snapshots go out four times a second, at once when the duel starts or stops waiting', () => {
  const { relay, host, guest } = pair();
  host.room.setReady(30); guest.room.setReady(30); relay.flush();
  const match = new DuelMatch({ duration: 30, seed: 4 });
  for (let i = 0; i < 60; i++) match.advance(1 / 60, ['block', 'strike']);
  const before = relay.writes;
  for (let frame = 0; frame < 60; frame++) host.room.hostTick(match, false, frame * 1000 / 60);
  assert.equal(relay.writes - before, Math.ceil(1000 / STATE_INTERVAL));
  host.room.hostTick(match, true, 1001);           // a face went out of view: no waiting for the next slot
  assert.equal(relay.writes - before, 5);
  relay.flush();
  assert.ok(validSnapshot(guest.room.snapshot));
  assert.equal(guest.room.snapshot.holding, true);
  const view = new DuelMatch({ duration: 30, seed: 0 });
  view.show(guest.room.snapshot, true);
  assert.equal(view.line, -match.line);              // the guest sees itself on the left
  assert.ok(view.sides[0].striking && !view.sides[0].blocking);
  assert.ok(view.sides[1].blocking);
  assert.equal(view.elapsed, match.elapsed);
});

test('events arrive in the guest\'s numbering with their round; pauses go both ways', () => {
  const { relay, host, guest } = pair();
  host.room.setReady(30); guest.room.setReady(30); relay.flush();
  host.room.sendEvent({ kind: 'fall', side: 0 }, 1);
  host.room.sendEvent({ kind: 'round', side: 0, place: 'volcano' }, 2);
  relay.flush();
  assert.deepEqual(guest.seen.events[0], [{ kind: 'fall', side: 1 }, 1]);
  assert.equal(guest.seen.events[1][0].place, 'volcano');
  assert.equal(guest.seen.events[1][1], 2);
  guest.room.sendPause(true); relay.flush();
  host.room.sendPause(false); relay.flush();
  assert.deepEqual(host.seen.pauses, [true]);
  assert.deepEqual(guest.seen.pauses, [false]);
});

test('a guest who leaves frees the place for the next friend', () => {
  const { relay, code, host, guest } = pair();
  guest.room.leave(); relay.drop(guest.conn); relay.flush();
  assert.deepEqual(host.seen.friend, [true, false]);
  assert.equal(relay.rooms.get(code).map.room.guest, null);
  const next = device(relay, code); relay.flush();
  assert.deepEqual(next.seen.roles, ['guest']);
  assert.deepEqual(host.seen.friend, [true, false, true]);
  assert.equal(host.room.friend, next.room.pid);
});

test('a short drop-out keeps the duel; a long one ends it', () => {
  const { relay, host, guest } = pair();
  host.room.setReady(30); guest.room.setReady(30); relay.flush();
  relay.drop(guest.conn); relay.flush();
  assert.equal(host.room.friendHere, false);
  clock += 5000; host.room.tick(clock);
  assert.deepEqual(host.seen.friend, [true]);       // still the friend
  guest.reconnect(); relay.flush();
  assert.equal(host.room.friendHere, true);
  assert.equal(guest.room.playing, 1);
  assert.deepEqual(guest.seen.roles, ['guest']);
  relay.drop(guest.conn); relay.flush();
  clock += AWAY_GRACE + 10; host.room.tick(clock);
  assert.deepEqual(host.seen.friend, [true, false]);
});

test('a guest whose host leaves is told the room is over', () => {
  const { relay, host, guest } = pair();
  host.room.leave(); relay.drop(host.conn); relay.flush();
  assert.deepEqual(guest.seen.problems, ['hostLeft']);
  assert.deepEqual(guest.seen.friend, [true, false]);
});

test('a reconnecting guest catches a start it missed', () => {
  const { relay, host, guest } = pair();
  guest.room.setReady(30); relay.flush();
  relay.drop(guest.conn); relay.flush();
  host.room.setReady(30); relay.flush();            // the host starts while the guest is away
  assert.equal(host.seen.starts.length, 1);
  assert.equal(guest.seen.starts.length, 0);
  guest.reconnect(); relay.flush();
  assert.deepEqual(guest.seen.starts, host.seen.starts);
});

test('a new guest ignores what is left in the room from an earlier duel', () => {
  const { relay, code, host, guest } = pair();
  host.room.setReady(30); guest.room.setReady(30); relay.flush();
  const match = new DuelMatch({ duration: 30, seed: 2 });
  host.room.hostTick(match, false, 0);
  host.room.finish(match); relay.flush();
  guest.room.leave(); relay.drop(guest.conn); relay.flush();
  const next = device(relay, code); relay.flush();
  assert.equal(next.seen.finished, 0);
  assert.equal(next.room.snapshot, null);
  assert.equal(next.room.nextDuel, 2);
  next.room.setReady(60); relay.flush();
  host.room.resetForNextDuel(); host.room.setReady(60); relay.flush();
  assert.equal(next.seen.starts.length, 1);
  assert.equal(next.room.playing, 2);
});

/* The whole thing, as the page plays it: a 60 s duel at 60 frames a second with a guest that
   changes its move every half second or so. Checks the room write budget. */
test('a whole duel stays within the write budget', () => {
  const { relay, host, guest } = pair();
  host.room.setReady(60); guest.room.setReady(60); relay.flush();
  const [seed, len] = host.seen.starts[0];
  const match = new DuelMatch({ duration: len, seed });
  const view = new DuelMatch({ duration: len, seed });
  const before = relay.writes;
  let t = 0, guestAction = 'rest', hostAction = 'rest', events = 0;
  while (!match.done) {
    t += 1000 / 60;
    if (Math.floor(t / 530) % 3 === 0) guestAction = 'strike'; else if (Math.floor(t / 530) % 3 === 1) guestAction = 'block'; else guestAction = 'rest';
    hostAction = Math.floor(t / 700) % 2 ? 'strike' : 'rest';
    guest.room.guestTick(guestAction, true, t);
    guest.room.tick(t);
    for (const e of match.advance(1 / 60, [hostAction, host.room.peerAction])) { host.room.sendEvent(e, match.round); events++; }
    host.room.hostTick(match, false, t);
    relay.flush();
    if (guest.room.snapshot) view.show(guest.room.snapshot, true);
  }
  host.room.finish(match); relay.flush();
  const writes = relay.writes - before;
  assert.equal(guest.seen.finished, 1);
  assert.equal(guest.seen.events.length, events);
  assert.equal(view.sides[0].rounds, match.sides[1].rounds);
  // 4 snapshots a second (240) + a move write per change (~113) + events + finish.
  assert.ok(writes < 420, `${writes} writes for a 60 s duel`);
});
