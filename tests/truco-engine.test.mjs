import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../game/truco-engine.js');

/* ── deck / ranks ─────────────────────────────────────────────────────── */

test('deck has 40 cards, ranks A 2-7 J Q K × four suits', () => {
  const deck = E.newDeck();
  assert.equal(deck.length, 40);
  const ranks = new Set(deck.map(c => c.rank));
  assert.deepEqual([...ranks].sort(), ['2','3','4','5','6','7','A','J','K','Q']);
  assert.equal(deck.filter(c => c.suit === '8').length, 0);
  const perRank = {};
  for (const c of deck) perRank[c.rank] = (perRank[c.rank] || 0) + 1;
  for (const r of Object.keys(perRank)) assert.equal(perRank[r], 4, '4 suits per rank');
});

test('manilha cycle 4→5→6→7→Q→J→K→A→2→3→4', () => {
  assert.equal(E.manilhaAfter('7'), 'Q');
  assert.equal(E.manilhaAfter('3'), '4');
  assert.equal(E.manilhaAfter('K'), 'A');
  assert.equal(E.manilhaAfter('A'), '2');
});

test('normal strength order 3 2 A K J Q 7 6 5 4', () => {
  const order = ['3','2','A','K','J','Q','7','6','5','4'];
  for (let i = 0; i < order.length - 1; i++) {
    const hi = { rank: order[i], suit: 'D' }, lo = { rank: order[i+1], suit: 'D' };
    assert.ok(E.compareCards(hi, lo, 'X') > 0, `${order[i]} beats ${order[i+1]}`);
  }
});

/* ── trick resolution ─────────────────────────────────────────────────── */

const M = 'Q'; // manilha for most trick tests

test('any manilha beats any non-manilha, regardless of normal rank', () => {
  const r = E.trickWinner([
    { player: 0, card: { rank: '3', suit: 'C' } },   // highest normal card
    { player: 1, card: { rank: 'Q', suit: 'D' } },   // lowest-ish normal rank, but manilha
  ], M);
  assert.equal(r.winner, 1);
});

test('manilha vs manilha breaks by suit ♣>♥>♠>♦', () => {
  const plays = [
    { player: 0, card: { rank: 'Q', suit: 'D' } },
    { player: 1, card: { rank: 'Q', suit: 'C' } },
    { player: 2, card: { rank: 'Q', suit: 'H' } },
    { player: 3, card: { rank: 'Q', suit: 'S' } },
  ];
  const r = E.trickWinner(plays, M);
  assert.equal(r.winner, 1); // clubs
  const r2 = E.trickWinner([plays[0], plays[3]], M);
  assert.equal(r2.winner, 3); // spades beats diamonds
});

test('non-manilha equal ranks kill the trick (winner -1, tie)', () => {
  const r = E.trickWinner([
    { player: 0, card: { rank: '3', suit: 'C' } },
    { player: 1, card: { rank: '3', suit: 'H' } },
    { player: 2, card: { rank: '5', suit: 'S' } },
  ], M);
  assert.equal(r.winner, -1);
  assert.equal(r.tie, true);
});

test('manilha presence prevents a rank tie from killing the trick', () => {
  const r = E.trickWinner([
    { player: 0, card: { rank: 'Q', suit: 'D' } },  // manilha
    { player: 1, card: { rank: '3', suit: 'C' } },
    { player: 2, card: { rank: '3', suit: 'H' } },
  ], M);
  assert.equal(r.winner, 0);
});

/* ── hand size math ───────────────────────────────────────────────────── */

test('max hand size leaves one card for the indicator', () => {
  assert.equal(E.maxHandSize(2), 19);  // floor(39/2)
  assert.equal(E.maxHandSize(3), 13);  // floor(39/3)
  assert.equal(E.maxHandSize(4), 9);   // floor(39/4)
  assert.equal(E.maxHandSize(8), 4);   // floor(39/8)
  assert.ok(E.maxHandSize(9) >= 1);    // degenerate: still playable
});

/* ── game flow ────────────────────────────────────────────────────────── */

function makeSeeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function driveGame(seed, numPlayers, bids, options) {
  /* Deterministic driver: bids[i] is either a number (every round) or a
     function(round, seat) → number. CPU plays cards automatically. */
  const rng = makeSeeded(seed);
  const g = E.newGame(numPlayers, rng, options);
  g.startRound();
  let bidIdx = 0;
  while (g.phase !== 'over') {
    if (g.phase === 'bidding') {
      const b = typeof bids === 'function' ? bids(g.round, g.turn) : (bids[bidIdx++ % bids.length] ?? 0);
      g.setBid(g.turn, Math.min(g.handSize, Math.max(0, b)));
    } else if (g.phase === 'playing') {
      g.playCard(g.turn, g.cpuChooseCard(g.turn));
    } else if (g.phase === 'reveal') {
      /* blind auto-play: play in turn order */
      g.playCard(g.turn, g.cpuChooseCard(g.turn));
    } else if (g.phase === 'roundEnd') {
      g.finishRound();
    } else if (g.phase === 'lobby') {
      g.startRound();
    }
    if (g.round > 200) throw new Error('runaway game — round cap exceeded');
  }
  return g;
}

test('full game: exactly one winner emerges, scores only decrease', () => {
  const g = driveGame(42, 3, 0);
  assert.ok(g.phase === 'over');
  assert.ok(g.winner !== null && g.winner !== 'draw');
  assert.equal(g.players.filter(p => p.eliminated).length, 2);
  for (const p of g.players) assert.ok(p.score <= 0);
});

test('bidding enforces turn order and legal ranges', () => {
  const g = E.newGame(3, makeSeeded(7));
  g.startRound();
  assert.equal(g.phase, 'bidding');
  const first = g.turn;
  assert.throws(() => g.setBid((first + 1) % 3, 0), /not your turn/);
  assert.throws(() => g.setBid(first, g.handSize + 1), /out of range/);
  assert.throws(() => g.setBid(first, -1), /out of range/);
  g.setBid(first, 0);
  assert.notEqual(g.turn, first);
});

test('blind round: hands are hidden logically (all hands dealt, bids 0..1)', () => {
  const g = E.newGame(4, makeSeeded(9));
  g.startRound();
  assert.equal(g.handSize, 1);
  assert.equal(g.isBlind(), true);
  for (const s of g.activeSeats()) assert.equal(g.players[s].hand.length, 1);
  /* bids must be 0 or 1 */
  while (g.phase === 'bidding') g.setBid(g.turn, g.cpuBid(g.turn));
  assert.equal(g.phase, 'reveal');
  /* reveal auto-plays everyone's single card in turn order */
  const plays = [];
  while (g.phase === 'reveal') {
    plays.push({ player: g.turn, card: g.cpuChooseCard(g.turn) });
    g.playCard(g.turn, g.cpuChooseCard(g.turn));
  }
  assert.equal(plays.length, 4);
  assert.equal(g.lastTrick.plays.length, 4);
});

test('hand size zigzags up and down across rounds (4 players)', () => {
  const g = E.newGame(4, makeSeeded(11));
  const seen = [1];
  for (let r = 2; r <= 25 && g.phase !== 'over'; r++) {
    /* scoring-free probe: advance the round counter without finishRound so
       eliminations can't interfere with the hand-size progression */
    g.round = r - 1;
    const saved = g.startRound.bind(g);
    g.startRound = function () {
      saved();
      g.phase = 'bidding';
    };
    g.startRound();
    seen.push(g.handSize);
    /* fast-forward the round mechanically, skip scoring */
    while (g.phase === 'bidding') g.setBid(g.turn, 0);
    while (g.phase === 'playing' || g.phase === 'reveal') {
      g.playCard(g.turn, g.cpuChooseCard(g.turn));
    }
    g.phase = 'lobby';       // skip finishRound → nobody eliminated
    g.startRound = saved;
  }
  /* 4 players: max 9 → expect rise 1..9 then fall */
  const max = Math.max(...seen);
  assert.ok(max >= 9, `hand size should reach 9, saw ${max}`);
  const peakIdx = seen.indexOf(max);
  if (peakIdx < seen.length - 2) {
    assert.equal(seen[peakIdx + 1], max - 1, 'descends after peak');
  }
});

test('dealer rotation skips eliminated players', () => {
  const g = E.newGame(3, makeSeeded(13));
  g.startRound();
  const d0 = g.dealer;
  g.players[(d0 + 1) % 3].eliminated = true;
  g.finishRound = g.finishRound; // no-op; simulate round end manually
  g.phase = 'roundEnd';
  g.finishRound();
  g.startRound();
  /* next active after d0 is seat (d0+2)%3, so dealer moves two seats */
  assert.equal(g.dealer, (d0 + 2) % 3);
});

test('elimination at -5 ends participation but keeps score visible', () => {
  const g = E.newGame(2, makeSeeded(17));
  g.startRound();
  /* force scores below the line */
  g.players[0].score = -4; g.players[1].score = -6;
  g.players[1].bid = 0; g.players[1].tricks = 0;
  g.phase = 'roundEnd';
  const res = g.finishRound();
  /* seat 1 already ≤ -5 → eliminated regardless of this round's penalty */
  assert.equal(g.players[1].eliminated, true);
  assert.ok(res.eliminated.includes(1));
  assert.equal(g.winner, 0);
  assert.equal(g.phase, 'over');
});

test('everyone busting together is a draw', () => {
  const g = E.newGame(2, makeSeeded(19));
  g.startRound();
  g.players[0].score = -9; g.players[1].score = -9;
  g.players[0].bid = 0; g.players[0].tricks = 0;
  g.players[1].bid = 0; g.players[1].tricks = 0;
  g.phase = 'roundEnd';
  g.finishRound();
  assert.equal(g.winner, 'draw');
});

test('cpuBid is always legal (0..handSize) across many deals', () => {
  for (let seed = 0; seed < 30; seed++) {
    const g = E.newGame(4, makeSeeded(seed));
    g.startRound();
    while (g.phase === 'bidding') {
      const b = g.cpuBid(g.turn);
      assert.ok(Number.isInteger(b) && b >= 0 && b <= g.handSize, `illegal bid ${b}`);
      g.setBid(g.turn, b);
    }
  }
});

/* ── partnership mode ────────────────────────────────────────────────── */

test('partnership mode maps opposite seats and validates complete teams', () => {
  const g = E.newGame(4, makeSeeded(23), { teams: [0, 1, 0, 1] });
  assert.equal(g.teamMode, true);
  assert.deepEqual(g.teamBySeat, [0, 1, 0, 1]);
  assert.deepEqual(g.teams.map(team => team.seats), [[0, 2], [1, 3]]);
  assert.equal(g.sameTeam(0, 2), true);
  assert.equal(g.sameTeam(0, 1), false);
  assert.throws(() => E.newGame(4, makeSeeded(1), { teams: [0, 1, 0] }), /assign every player/);
  assert.throws(() => E.newGame(4, makeSeeded(1), { teams: [0, 1, 2, 2] }), /at least two players/);
});

test('partnership scoring pools bids and tricks once per team', () => {
  const g = E.newGame(4, makeSeeded(29), { teams: [0, 1, 0, 1] });
  g.startRound();
  [1, 0, 1, 1].forEach((bid, seat) => { g.players[seat].bid = bid; });
  [2, 0, 0, 0].forEach((tricks, seat) => { g.players[seat].tricks = tricks; });
  g.phase = 'roundEnd';
  const res = g.finishRound();
  assert.deepEqual(res.teamBids, { 0: 2, 1: 1 });
  assert.deepEqual(res.teamTricks, { 0: 2, 1: 0 });
  assert.deepEqual(res.teamPenalties, { 0: 0, 1: 1 });
  assert.deepEqual(g.teams.map(team => team.score), [0, -1]);
  assert.deepEqual(g.players.map(player => player.score), [0, -1, 0, -1]);
  assert.equal(g.phase, 'lobby');
});

test('a partnership is eliminated and wins atomically', () => {
  const g = E.newGame(4, makeSeeded(31), { teams: [0, 1, 0, 1] });
  g.startRound();
  g.teams[0].score = -4;
  [0, 0, 0, 0].forEach((bid, seat) => { g.players[seat].bid = bid; });
  g.players[0].tricks = 1;
  g.phase = 'roundEnd';
  const res = g.finishRound();
  assert.deepEqual(res.eliminatedTeams, [0]);
  assert.equal(g.players[0].eliminated, true);
  assert.equal(g.players[2].eliminated, true);
  assert.equal(g.players[1].eliminated, false);
  assert.equal(g.players[3].eliminated, false);
  assert.equal(g.winnerTeam, 1);
  assert.equal(g.winner, 'team:1');
  assert.equal(g.phase, 'over');
});

test('both partnerships busting in the same round is a draw', () => {
  const g = E.newGame(4, makeSeeded(37), { teams: [0, 1, 0, 1] });
  g.startRound();
  g.teams[0].score = -4;
  g.teams[1].score = -4;
  for (const player of g.players) { player.bid = 0; player.tricks = 1; }
  g.phase = 'roundEnd';
  g.finishRound();
  assert.equal(g.winnerTeam, 'draw');
  assert.equal(g.winner, 'draw');
  assert.ok(g.players.every(player => player.eliminated));
});

test('team CPU preserves a partner winner instead of wasting or tying a card', () => {
  const g = E.newGame(4, makeSeeded(41), { teams: [0, 1, 0, 1] });
  g.manilha = 'Q';
  g.trick = [
    { player: 1, card: { rank: '3', suit: 'C' } },
    { player: 2, card: { rank: '5', suit: 'S' } },
  ];
  g.players[3].hand = [
    { rank: '3', suit: 'H' },
    { rank: '4', suit: 'D' },
  ];
  assert.deepEqual(g.cpuChooseCard(3), { rank: '4', suit: 'D' });
});

test('authoritative snapshots restore methods and continue a bidding round', () => {
  const original = E.newGame(4, makeSeeded(43), { teams: [0, 1, 0, 1] });
  original.handSize = 2;
  original.startRound();
  original.setBid(original.turn, 1);
  const snapshot = E.exportState(original);
  const restored = E.restoreGame(snapshot, makeSeeded(99));
  assert.deepEqual(E.exportState(restored), snapshot);
  assert.equal(typeof restored.setBid, 'function');
  assert.equal(typeof restored.playCard, 'function');
  while (original.phase === 'bidding') {
    const seat = original.turn;
    original.setBid(seat, 0);
    restored.setBid(seat, 0);
  }
  assert.deepEqual(E.exportState(restored), E.exportState(original));
});

test('snapshot restored mid-trick accepts stable card IDs and resolves identically', () => {
  const original = E.newGame(4, makeSeeded(47), { teams: [0, 1, 0, 1] });
  original.handSize = 2;
  original.startRound();
  while (original.phase === 'bidding') original.setBid(original.turn, 0);
  const firstSeat = original.turn;
  original.playCard(firstSeat, original.players[firstSeat].hand[0]);
  const restored = E.restoreGame(E.exportState(original), makeSeeded(101));
  while (original.phase === 'playing') {
    const seat = original.turn;
    const id = E.cardId(original.players[seat].hand[0]);
    const restoredCard = restored.cardById(seat, id);
    assert.ok(restoredCard, `restored seat ${seat} should own ${id}`);
    original.playCard(seat, original.cardById(seat, id));
    restored.playCard(seat, restoredCard);
    assert.deepEqual(E.exportState(restored), E.exportState(original));
  }
});

test('restore rejects malformed or projected hidden-card snapshots', () => {
  const game = E.newGame(2, makeSeeded(53));
  game.startRound();
  const wrongVersion = E.exportState(game);
  wrongVersion.version = 999;
  assert.throws(() => E.restoreGame(wrongVersion), /unsupported state version/);
  const hidden = E.exportState(game);
  hidden.players[0].hand[0] = null;
  assert.throws(() => E.restoreGame(hidden), /invalid state hand/);
});

test('partnership game soak completes with one team or a draw', () => {
  for (let seed = 0; seed < 20; seed++) {
    const g = driveGame(seed, 4, 0, { teams: [0, 1, 0, 1] });
    assert.equal(g.phase, 'over');
    assert.ok(g.winnerTeam === 0 || g.winnerTeam === 1 || g.winnerTeam === 'draw');
    if (g.winnerTeam !== 'draw') {
      assert.equal(g.teams[g.winnerTeam].eliminated, false);
      assert.equal(g.teams.filter(team => team.eliminated).length, 1);
    }
  }
});

test('multi-game soak: 20 seeded games complete with a winner or draw', () => {
  for (let seed = 0; seed < 20; seed++) {
    const g = driveGame(seed, 2 + (seed % 3), 0);
    assert.ok(g.phase === 'over');
    assert.ok(g.winner !== null);
  }
});
