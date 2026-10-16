import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../game/truco-engine.js');
const O = require('../game/truco-online.js');

function seeded(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 0x100000000; };
}

const HOST = 'host0000pid0000a';
const pid = n => `friend${n}pid000000`;
const lobby = () => O.newRoom(HOST, 3, 1000, 10_000);
const joins = (...list) => Object.fromEntries(list.map(([p, avatar, want, at]) => [p, { avatar, want: want ?? null, at: at ?? 0 }]));

test('room codes, pids and invite links are compact and unambiguous', () => {
  assert.equal(O.makeRoomCode(() => 0), 'AAAAAAA');
  assert.match(O.makeRoomCode(seeded(3)), O.ROOM_RE);
  assert.match(O.makeRoomCode(), O.ROOM_RE);
  assert.match(O.makePid(), O.PID_RE);
  assert.equal(O.normalizeRoomCode('https://lifegameproject.com/game/truco.html?room=ab2cd3e#x'), 'AB2CD3E');
  assert.equal(O.normalizeRoomCode('manilha://room/ab2cd3e'), 'AB2CD3E');
  assert.equal(O.normalizeRoomCode(' ab2-cd3e '), 'AB2CD3E');
  assert.equal(O.roomLink('AB2CD3E'), 'https://lifegameproject.com/game/truco.html?room=AB2CD3E');
  assert.equal(O.AVATARS.length, 12);
  assert.equal(O.cleanAvatar(99), 0);
});

test('a new room seats its creator at 0 as host and validates', () => {
  const room = lobby();
  assert.equal(O.validRoom(room, 1500), true);
  assert.equal(O.validRoom(room, 20_000), false, 'expired');
  assert.equal(room.seats[0].pid, HOST);
  assert.equal(room.seats[0].avatar, 3);
  assert.equal(O.hostPid(room), HOST);
  assert.equal(room.status, 'waiting');
  assert.deepEqual(room.teams, [0, 1, 0, 1]);
  assert.equal(O.validRoom({ ...room, schema: 1 }), false);
  assert.equal(O.validRoom({ ...room, seats: [room.seats[0], { kind: 'human', pid: 'x', avatar: 0 }, null, null] }), false);
});

test('joiners fill the partner seat first, then the others, in arrival order', () => {
  let room = O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5, null, 20], [pid(2), 6, null, 10]));
  assert.equal(O.seatOf(room, pid(2)), 2, 'earliest joiner gets the partner seat');
  assert.equal(O.seatOf(room, pid(1)), 1);
  assert.equal(room.rev, 2);
  const same = O.reconcile(room, joins([HOST, 3], [pid(1), 5, null, 20], [pid(2), 6, null, 10]));
  assert.equal(same, room, 'nothing to change → same object, no write');
  room = O.reconcile(room, joins([HOST, 3], [pid(1), 5, null, 20], [pid(2), 6, null, 10], [pid(3), 7, null, 30], [pid(4), 8, null, 40]));
  assert.equal(O.seatOf(room, pid(3)), 3);
  assert.equal(O.seatOf(room, pid(4)), -1, 'a fifth player finds the room full');
});

test('players switch to open seats and keep their avatar in step with their join record', () => {
  let room = O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5]));
  assert.equal(O.seatOf(room, pid(1)), 2);
  room = O.reconcile(room, joins([HOST, 3], [pid(1), 9, 3]));
  assert.equal(O.seatOf(room, pid(1)), 3);
  assert.equal(room.seats[2], null);
  assert.equal(room.seats[3].avatar, 9);
  room = O.reconcile(room, joins([HOST, 3, 3], [pid(1), 9, 3]));
  assert.equal(O.seatOf(room, HOST), 0, 'a taken seat cannot be claimed');
  room = O.reconcile(room, joins([HOST, 3, 1], [pid(1), 9, 3]));
  assert.equal(O.seatOf(room, HOST), 1);
  assert.equal(room.host, 1, 'the host index follows the host');
  assert.equal(O.validRoom(room), true);
});

test('leaving frees a seat before the match and hands it to the computer during one', () => {
  let room = O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5], [pid(2), 6]));
  assert.equal(O.reconcile(room, joins([HOST, 3], [pid(1), 5])).seats[O.seatOf(room, pid(2))], null);
  const started = O.startMatch(room, [HOST, pid(1), pid(2)]);
  const left = O.reconcile(started, joins([HOST, 3], [pid(1), 5]));
  assert.deepEqual(left.seats[O.seatOf(room, pid(2))], { kind: 'ai' });
  const late = O.reconcile(started, joins([HOST, 3], [pid(1), 5], [pid(2), 6], [pid(3), 7]));
  assert.equal(late, started, 'nobody new sits down once a match is on');
  assert.equal(O.reconcile(room, joins([pid(1), 5], [pid(2), 6])).seats[0].pid, HOST, 'the host seat is never freed by reconcile');
});

test('starting needs two connected people; absent people lose their seat and the computer fills in', () => {
  const room = O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5], [pid(2), 6]));
  assert.throws(() => O.startMatch(room, [HOST]), /need-two/);
  const started = O.startMatch(room, [HOST, pid(1)]);
  assert.equal(started.status, 'playing');
  assert.equal(started.match, 1);
  assert.equal(O.humanSeats(started).length, 2);
  assert.equal(started.seats.filter(r => r.kind === 'ai').length, 2);
  assert.equal(O.validRoom(started), true);
  const again = O.startMatch(started, [HOST, pid(1)]);
  assert.equal(again.match, 2);
});

test('a room plays in partnerships or every player for themselves, chosen before the deal', () => {
  const teams = lobby();
  assert.equal(O.hasPartners(teams), true, 'partnerships unless asked otherwise');
  const solo = O.newRoom(HOST, 3, 1000, 10_000, false);
  assert.equal(solo.teams, null);
  assert.equal(O.hasPartners(solo), false);
  assert.equal(O.validRoom(solo, 1500), true);
  for (const bad of [[0, 1, 2, 3], [0, 0, 1, 1], [0, 1, 0], undefined, 'teams']) {
    assert.equal(O.validRoom({ ...teams, teams: bad }), false, JSON.stringify(bad));
  }

  let room = O.reconcile(teams, joins([HOST, 3], [pid(1), 5]));
  const switched = O.setPartners(room, false);
  assert.equal(switched.teams, null);
  assert.equal(switched.rev, room.rev + 1);
  assert.deepEqual(switched.seats, room.seats, 'nobody moves');
  assert.equal(O.setPartners(switched, false), switched, 'nothing to change → same object, no write');
  assert.deepEqual(O.setPartners(switched, true).teams, [0, 1, 0, 1]);

  room = O.startMatch(switched, [HOST, pid(1)]);
  assert.equal(room.teams, null, 'the deal keeps the choice');
  assert.equal(O.validRoom(room), true);
  assert.equal(O.setPartners(room, true), room, 'too late once the cards are out');
  assert.equal(O.startMatch(room, [HOST, pid(1)]).teams, null, 'and so does a rematch');

  const game = E.newGame(4, seeded(9), O.hasPartners(room) ? { teams: O.TEAM_BY_SEAT } : undefined);
  assert.equal(game.teamMode, false);
  game.startRound();
  const record = O.gameRecord(room, game, null);
  assert.equal(O.validGameRecord(record), true);
  assert.equal(E.restoreGame(record.state).teamMode, false);
});

test('the next connected player clockwise from the host succeeds them', () => {
  let room = O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5], [pid(2), 6], [pid(3), 7]));
  room = O.startMatch(room, [HOST, pid(1), pid(2), pid(3)]);
  assert.equal(O.successor(room, [pid(1), pid(2), pid(3)]), O.seatOf(room, pid(2)) === 1 ? 1 : O.seatOf(room, pid(2)));
  assert.equal(O.successor(room, [pid(3)]), O.seatOf(room, pid(3)));
  assert.equal(O.successor(room, []), -1);
  const taken = O.takeOver(room, 2);
  assert.equal(taken.host, 2);
  assert.equal(taken.epoch, room.epoch + 1);
  assert.equal(O.validRoom(taken), true);
});

test('a host who leaves hands over, or closes the room when nobody is left', () => {
  let room = O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5]));
  const waitingHandOver = O.handOver(room, [pid(1)]);
  assert.equal(waitingHandOver.host, 2);
  assert.equal(waitingHandOver.seats[0], null);
  assert.equal(O.validRoom(waitingHandOver), true);
  room = O.startMatch(room, [HOST, pid(1)]);
  const playingHandOver = O.handOver(room, [pid(1)]);
  assert.deepEqual(playingHandOver.seats[0], { kind: 'ai' });
  assert.equal(playingHandOver.host, 2);
  assert.equal(O.validRoom(playingHandOver), true);
  const closed = O.handOver(room, []);
  assert.equal(closed.status, 'closed');
  assert.equal(O.validRoom(closed), true);
});

test('game records carry the full engine state; newer epochs beat older ones', () => {
  let room = O.startMatch(O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5])), [HOST, pid(1)]);
  const game = E.newGame(4, seeded(7), { teams: O.TEAM_BY_SEAT });
  game.startRound();
  const g1 = O.gameRecord(room, game, null);
  assert.equal(g1.seq, 1);
  assert.deepEqual(g1.acks, [0, 0, 0, 0]);
  assert.deepEqual(E.exportState(E.restoreGame(g1.state)), g1.state);
  game.setBid(game.turn, 0);
  const g2 = O.gameRecord(room, game, g1);
  assert.equal(g2.seq, 2);
  assert.equal(O.newerGame(g2, g1), true);
  assert.equal(O.newerGame(g1, g2), false);
  const acked = O.ackRecord(room, g2, [0, 0, 4, 0]);
  assert.equal(acked.seq, 2);
  assert.equal(O.newerGame(acked, g2), true);
  room = O.takeOver(room, 2);
  const g3 = O.gameRecord(room, game, acked);
  const zombie = { ...g2, rev: 99 };
  assert.equal(O.newerGame(zombie, g3), false, 'a replaced host cannot overwrite its successor');
  const rematch = O.startMatch(room, [HOST, pid(1)]);
  const fresh = O.gameRecord(rematch, E.newGame(4, seeded(8), { teams: O.TEAM_BY_SEAT }), g3);
  assert.equal(fresh.seq, 1);
  assert.deepEqual(fresh.acks, [0, 0, 0, 0]);
});

test('intents are checked against seat, freshness, turn and legality', () => {
  const room = O.startMatch(O.reconcile(lobby(), joins([HOST, 3], [pid(1), 5])), [HOST, pid(1)]);
  const game = E.newGame(4, seeded(11), { teams: O.TEAM_BY_SEAT });
  game.startRound();
  while (game.turn !== 2) game.setBid(game.turn, 0);
  let g = O.gameRecord(room, game, null);
  const guess = O.makeIntent(pid(1), 1, g, { type: 'guess', count: 1 });
  assert.equal(O.checkIntent(room, g, 2, guess, game), 'ok');
  assert.equal(O.checkIntent(room, g, 2, { ...guess, pid: HOST }, game), 'not-yours');
  assert.equal(O.checkIntent(room, g, 2, { ...guess, seq: g.seq - 1 }, game), 'stale');
  assert.equal(O.checkIntent(room, g, 2, { ...guess, count: 9 }, game), 'illegal');
  assert.equal(O.checkIntent(room, g, 2, { ...guess, type: 'play', card: 'AH' }, game), 'illegal');
  assert.equal(O.checkIntent(room, { ...g, acks: [0, 0, 1, 0] }, 2, guess, game), 'old');
  O.applyIntent(game, 2, guess);
  assert.equal(game.players[2].bid, 1);
  g = O.gameRecord(room, game, g);
  assert.equal(O.checkIntent(room, g, 2, O.makeIntent(pid(1), 2, g, { type: 'guess', count: 0 }), game), 'not-your-turn');
});

test('a seat sees only its own cards, or everyone else\'s in a blind round', () => {
  const game = E.newGame(4, seeded(5), { teams: O.TEAM_BY_SEAT });
  game.startRound();
  const state = E.exportState(game);
  const blind = O.visibleHands(state, 1);
  assert.equal(blind[1][0], null);
  assert.ok(blind[0][0] && blind[2][0] && blind[3][0]);
  while (game.phase !== 'lobby') {
    if (game.phase === 'bidding') game.setBid(game.turn, 0);
    else if (game.phase === 'roundEnd') game.finishRound();
    else game.playCard(game.turn, game.players[game.turn].hand[0]);
  }
  game.startRound();
  const open = O.visibleHands(E.exportState(game), 1);
  assert.ok(open[1].every(Boolean));
  assert.ok(open[0].every(c => c === null));
});

test('two players never end up with the same animal: the later joiner moves on', () => {
  const room = lobby();                                   // host is 🐯 (3)
  // a newcomer who also likes 🐯 takes the next free animal; their own favourite is kept otherwise
  assert.equal(O.freeAvatar(room, joins([HOST, 3, 0, 1000]), pid(1), 3), 4);
  assert.equal(O.freeAvatar(room, joins([HOST, 3, 0, 1000]), pid(1), 7), 7);
  // seated with the same animal: only the one who joined later changes
  const seated = O.reconcile(room, joins([HOST, 3, 0, 1000], [pid(1), 3, null, 2000]));
  const j = joins([HOST, 3, 0, 1000], [pid(1), 3, null, 2000]);
  assert.equal(O.freeAvatar(seated, j, HOST, 3), 3);
  assert.equal(O.freeAvatar(seated, j, pid(1), 3), 4);
  // skips every animal taken before it, and wraps around the end of the list
  const three = joins([HOST, 11, 0, 1000], [pid(1), 0, null, 2000], [pid(2), 11, null, 3000]);
  assert.equal(O.freeAvatar(lobby(), three, pid(2), 11), 1);
  // same join time: the smaller pid keeps it
  const tie = joins([pid(1), 5, null, 2000], [pid(2), 5, null, 2000]);
  assert.equal(O.freeAvatar(lobby(), tie, pid(1), 5), 5);
  assert.equal(O.freeAvatar(lobby(), tie, pid(2), 5), 6);
  // what the picker greys out: everyone else's animal, earlier or not
  assert.deepEqual([...O.takenAvatars(seated, j, HOST)].sort(), [3]);
  assert.deepEqual([...O.takenAvatars(lobby(), three, pid(1))].sort((a, b) => a - b), [11]);
});
