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

function lobby() { return O.createLobby('host-token', 'Host <One>', 1000, 10_000); }

test('room codes and names are compact, unambiguous, and link-friendly', () => {
  assert.equal(O.makeRoomCode(() => 0), 'AAAAAAA');
  assert.match(O.makeRoomCode(seeded(3)), O.ROOM_RE);
  assert.equal(O.normalizeRoomCode('https://example.test/game/truco.html?room=ab2cd3e#x'), 'AB2CD3E');
  assert.equal(O.cleanName('  <b>Alice</b>\n  Smith  '), 'Alice Smith');
  assert.equal(lobby().seats[0].name, 'Host');
});

test('first friend joins the host team and returning tokens reclaim their seat', () => {
  let room = lobby();
  room.extra = { keep: true };
  room = O.claimSeat(room, 'friend-a', 'Alice', 1200);
  assert.equal(O.seatForToken(room, 'friend-a'), 2);
  assert.equal(room.extra.keep, true);
  const again = O.claimSeat(room, 'friend-a', 'Alice 2', 1300);
  assert.equal(O.seatForToken(again, 'friend-a'), 2);
  assert.equal(again.seats[2].name, 'Alice 2');
  assert.equal(O.humanSeats(again).length, 2);
});

test('friends can switch open teams before lock and host seat stays fixed', () => {
  let room = O.claimSeat(lobby(), 'friend-a', 'Alice', 1200);
  room = O.moveSeat(room, 'friend-a', 1);
  assert.equal(O.seatForToken(room, 'friend-a'), 1);
  assert.equal(room.seats[2], null);
  assert.throws(() => O.moveSeat(room, 'host-token', 2), /host-fixed/);
  room = O.claimSeat(room, 'friend-b', 'Bob', 1300);
  assert.throws(() => O.moveSeat(room, 'friend-a', 2), /seat-unavailable/);
});

test('locking supports two, three, or four humans and fills only empty seats with AI', () => {
  for (const count of [2, 3, 4]) {
    let room = lobby();
    for (let index = 1; index < count; index++) room = O.claimSeat(room, `friend-${index}`, `Friend ${index}`, 1200 + index);
    const locked = O.lockRoster(room, 'host-token', 2000);
    assert.equal(locked.status, 'locked');
    assert.equal(O.humanSeats(locked).length, count);
    assert.equal(locked.seats.filter(seat => seat.kind === 'ai').length, 4 - count);
    assert.deepEqual(locked.teams, [0, 1, 0, 1]);
    assert.equal(O.validRoom(locked, 2001), true);
  }
  assert.throws(() => O.lockRoster(lobby(), 'host-token', 2000), /need-two/);
});

test('full, locked, expired, and malformed rooms reject new claims', () => {
  let room = lobby();
  for (let index = 1; index <= 3; index++) room = O.claimSeat(room, `friend-${index}`, `Friend ${index}`, 1200 + index);
  assert.throws(() => O.claimSeat(room, 'friend-4', 'Late', 1400), /room-full/);
  const locked = O.lockRoster(room, 'host-token', 1500);
  assert.throws(() => O.claimSeat(locked, 'late', 'Late', 1600), /room-locked/);
  assert.throws(() => O.claimSeat(lobby(), 'late', 'Late', 20_000), /room-expired/);
  const malformed = lobby(); malformed.teams = [0, 0, 1, 1];
  assert.equal(O.validRoom(malformed, 1200), false);
  const duplicate = O.claimSeat(lobby(), 'friend-a', 'Alice', 1200);
  duplicate.seats[1] = { kind: 'human', token: 'friend-a', name: 'Copy' };
  assert.equal(O.validRoom(duplicate, 1200), false);
});

test('normal projected views expose only the viewer hand', () => {
  const game = E.newGame(4, seeded(11), { teams: O.TEAM_BY_SEAT });
  game.handSize = 2;
  game.startRound();
  const view = O.projectGame(game, 2, { dealState: null });
  assert.ok(view.players[2].hand.every(Boolean));
  for (const seat of [0, 1, 3]) assert.ok(view.players[seat].hand.every(card => card === null));
  assert.deepEqual(view.indicator, game.indicator);
  assert.equal(typeof view.activeSeats, 'undefined');
});

test('dealing hides every hand and gates the indicator until its reveal', () => {
  const game = E.newGame(4, seeded(13), { teams: O.TEAM_BY_SEAT });
  game.handSize = 2;
  game.startRound();
  const hidden = O.projectGame(game, 0, { dealState: { indicatorRevealed: false } });
  assert.ok(hidden.players.every(player => player.hand.every(card => card === null)));
  assert.equal(hidden.indicator, null);
  assert.equal(hidden.manilha, null);
  const revealed = O.projectGame(game, 0, { dealState: { indicatorRevealed: true } });
  assert.deepEqual(revealed.indicator, game.indicator);
  assert.equal(revealed.manilha, game.manilha);
  assert.ok(revealed.players.every(player => player.hand.every(card => card === null)));
});

test('blind projected views hide your card and reveal every other seat', () => {
  const game = E.newGame(4, seeded(17), { teams: O.TEAM_BY_SEAT });
  game.startRound();
  assert.equal(game.handSize, 1);
  const view = O.projectGame(game, 2, { dealState: null });
  assert.equal(view.players[2].hand[0], null);
  for (const seat of [0, 1, 3]) assert.ok(view.players[seat].hand[0]);
});

test('hydrated client views provide render helpers but no mutation methods', () => {
  const game = E.newGame(4, seeded(19), { teams: O.TEAM_BY_SEAT });
  game.startRound();
  const hydrated = O.hydrateView(O.projectGame(game, 0, { dealState: null }));
  assert.deepEqual(hydrated.activeSeats(), [0, 1, 2, 3]);
  assert.equal(hydrated.isBlind(), true);
  assert.equal(hydrated.nextActive(0), 1);
  assert.equal(hydrated.sameTeam(0, 2), true);
  assert.equal(hydrated.playCard, undefined);
});
