/* truco-engine.js — rules engine for the arcade's truco.exe cabinet.
   Brazilian-style bidding trick-taking game:
   · 40-card deck (A,2,3,4,5,6,7,J,Q,K × ♣♥♠♦ — no 8/9/10)
   · normal strength (high→low): 3 2 A K J Q 7 6 5 4
   · each round an indicator card is flipped; manilha = next rank in the cycle
     4→5→6→7→Q→J→K→A→2→3→(4). Any manilha-rank card beats every non-manilha card.
   · manilha vs manilha breaks by suit: ♣ > ♥ > ♠ > ♦
   · non-manilha ties kill the trick: cards are dead, nobody leads a win
     (documented house rule: the player who led the dead trick leads the next one)
   · bidding: each active player declares 0..handSize tricks; penalty = |bid − tricks|
   · score ≤ −5 → eliminated; game over when one active player remains
     (optional partnership mode pools bids, tricks, score, and elimination by team)
   · hand size starts at 1, +1 per round up to floor(39 / activePlayers), then −1 back
     to 1, and up again — forever. Blind rule: hand size 1 → nobody sees their own
     card (everyone sees the others'), and cards auto-play in turn order after bidding.
   UMD: browser → window.TrucoEngine, node → module.exports (for tests). */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TrucoEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RANK_CYCLE = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
  const STRENGTH = { '4': 0, '5': 1, '6': 2, '7': 3, 'Q': 4, 'J': 5, 'K': 6, 'A': 7, '2': 8, '3': 9 };
  const SUIT_KEYS = ['C', 'H', 'S', 'D'];
  const SUIT_CHARS = { C: '♣', H: '♥', S: '♠', D: '♦' };
  const SUIT_POWER = { C: 3, H: 2, S: 1, D: 0 };   // manilha tiebreak: ♣ > ♥ > ♠ > ♦
  const DECK_SIZE = 40;
  const ELIMINATION_SCORE = -5;

  function newDeck() {
    const deck = [];
    for (const rank of RANK_CYCLE) for (const suit of SUIT_KEYS) deck.push({ rank, suit });
    return deck;
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((rng ? rng : Math.random)() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function manilhaAfter(rank) {
    const i = RANK_CYCLE.indexOf(rank);
    return RANK_CYCLE[(i + 1) % RANK_CYCLE.length];
  }

  function isManilha(card, manilha) { return card.rank === manilha; }

  /* Sort key: manilha dominates (tier 1), suit breaks manilha ties.
     Non-manilha (tier 0) compares by rank strength only — equal ranks tie. */
  function cardKey(card, manilha) {
    if (card.rank === manilha) return [1, SUIT_POWER[card.suit]];
    return [0, STRENGTH[card.rank]];
  }

  /* -1/0/1 — 0 only for same-rank non-manilha (a dead tie). */
  function compareCards(a, b, manilha) {
    const ka = cardKey(a, manilha), kb = cardKey(b, manilha);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return 0;
  }

  /* plays: [{player, card}] → { winner: player|-1, tie: bool }
     -1 means a dead trick (non-manilha tie at the top). */
  function trickWinner(plays, manilha) {
    if (!plays.length) return { winner: -1, tie: true };
    let best = 0, tie = false;
    for (let i = 1; i < plays.length; i++) {
      const c = compareCards(plays[i].card, plays[best].card, manilha);
      if (c > 0) { best = i; tie = false; }
      else if (c === 0) tie = true;
    }
    return { winner: tie ? -1 : plays[best].player, tie };
  }

  /* Biggest hand size that leaves at least one card for the indicator. */
  function maxHandSize(activeCount) { return Math.max(1, Math.floor((DECK_SIZE - 1) / activeCount)); }

  function cardId(card) { return card.rank + card.suit; }

  function normalizeTeams(numPlayers, teams) {
    if (teams == null) return null;
    if (!Array.isArray(teams) || teams.length !== numPlayers) {
      throw new Error('truco: teams must assign every player');
    }
    const ids = [];
    for (const id of teams) {
      if (!Number.isInteger(id) || id < 0) throw new Error('truco: invalid team id');
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length < 2) throw new Error('truco: at least two teams required');
    const compact = teams.map(id => ids.indexOf(id));
    for (let id = 0; id < ids.length; id++) {
      if (compact.filter(t => t === id).length < 2) {
        throw new Error('truco: partnership teams need at least two players');
      }
    }
    return compact;
  }

  /* ── Game state machine ─────────────────────────────────────────────── */

  function newGame(numPlayers, rng, options) {
    if (!Number.isInteger(numPlayers) || numPlayers < 2 || numPlayers > 8) {
      throw new Error('truco: 2–8 players');
    }
    const rand = rng || Math.random;
    const opts = options || {};
    const teamBySeat = normalizeTeams(numPlayers, opts.teams);
    const teamMode = !!teamBySeat;

    const game = {
      numPlayers,
      teamMode,
      teamBySeat,
      teams: [],              // {id, seats:[], score, eliminated}
      players: [],            // {score, eliminated, team, hand:[], bid, tricks}
      dealer: -1,
      round: 0,
      handSize: 1,
      dir: 1,                 // hand-size zigzag direction: +1 rising, -1 falling
      indicator: null,
      manilha: null,
      phase: 'lobby',         // lobby | bidding | reveal | playing | roundEnd | over
      turn: -1,               // seat to bid / play next
      bids: [],
      trick: [],              // [{player, card}] cards on the table this trick
      trickLeader: -1,        // seat leading the current trick
      lastTrick: null,        // {winner, tie, plays:[...]} after each trick resolves
      winner: null,           // seat index, or 'draw' if everyone busts together
      winnerTeam: null,       // team index in partnership mode, or 'draw'
      history: [],
      log: [],
    };
    for (let i = 0; i < numPlayers; i++) {
      game.players.push({ score: 0, eliminated: false, team: teamMode ? teamBySeat[i] : null, hand: [], bid: null, tricks: 0 });
    }
    if (teamMode) {
      const count = Math.max.apply(null, teamBySeat) + 1;
      for (let id = 0; id < count; id++) {
        game.teams.push({ id, seats: [], score: 0, eliminated: false });
      }
      for (let seat = 0; seat < numPlayers; seat++) game.teams[teamBySeat[seat]].seats.push(seat);
    }

    game.activeSeats = function () {
      const seats = [];
      for (let i = 0; i < numPlayers; i++) if (!game.players[i].eliminated) seats.push(i);
      return seats;
    };

    game.nextActive = function (from) {
      for (let step = 1; step <= numPlayers; step++) {
        const s = (from + step) % numPlayers;
        if (!game.players[s].eliminated) return s;
      }
      return -1;
    };

    game.activeTeamIds = function () {
      if (!game.teamMode) return [];
      return game.teams.filter(team => !team.eliminated).map(team => team.id);
    };

    game.sameTeam = function (a, b) {
      return game.teamMode && a >= 0 && b >= 0 && game.teamBySeat[a] === game.teamBySeat[b];
    };

    game.maxHand = function () { return maxHandSize(game.activeSeats().length); };
    game.isBlind = function () { return game.handSize === 1; };
    game.allHandsEmpty = function () {
      return game.activeSeats().every(s => game.players[s].hand.length === 0);
    };

    function say(msg) { game.log.push(msg); if (game.log.length > 200) game.log.shift(); }

    /* Round setup: bump hand size (zigzag), rotate dealer, deal, flip indicator. */
    game.startRound = function () {
      if (game.phase === 'over') return;
      game.round++;
      const max = game.maxHand();
      if (game.round > 1) {
        if (game.dir > 0) { game.handSize++; if (game.handSize >= max) game.dir = -1; }
        else { game.handSize--; if (game.handSize <= 1) game.dir = 1; }
      }
      if (game.handSize > max) { game.handSize = max; game.dir = -1; }
      if (game.handSize < 1) game.handSize = 1;

      if (game.dealer === -1) {
        const act = game.activeSeats();
        game.dealer = act[Math.floor(rand() * act.length)];
      } else {
        game.dealer = game.nextActive(game.dealer);
      }
      game.trickLeader = game.nextActive(game.dealer);   // leader bids first + leads trick 1
      game.turn = game.trickLeader;

      const deck = shuffle(newDeck(), rand);
      const act = game.activeSeats();
      let idx = 0;
      for (const s of act) {
        game.players[s].hand = deck.slice(idx, idx + game.handSize);
        idx += game.handSize;
      }
      game.indicator = deck[idx];                        // next card stays in the centre
      game.manilha = manilhaAfter(game.indicator.rank);

      game.bids = new Array(numPlayers).fill(null);
      for (const s of act) { game.players[s].bid = null; game.players[s].tricks = 0; }
      game.trick = [];
      game.lastTrick = null;
      game.phase = 'bidding';
    };

    /* Bidding: seat declares 0..handSize. Advances turn; flips phase when done. */
    game.setBid = function (seat, count) {
      if (game.phase !== 'bidding') throw new Error('truco: not bidding');
      if (seat !== game.turn) throw new Error('truco: not your turn to bid');
      if (game.players[seat].eliminated) throw new Error('truco: eliminated player');
      if (!Number.isInteger(count) || count < 0 || count > game.handSize) {
        throw new Error('truco: bid out of range');
      }
      game.players[seat].bid = count;
      game.bids[seat] = count;
      const done = game.activeSeats().every(s => game.players[s].bid !== null);
      if (done) {
        game.turn = game.trickLeader;
        game.phase = game.isBlind() ? 'reveal' : 'playing';  // blind: auto-play next
      } else {
        game.turn = game.nextActive(game.turn);
      }
    };

    game.handIndexOf = function (seat, card) {
      const hand = game.players[seat].hand;
      for (let i = 0; i < hand.length; i++) {
        if (hand[i].rank === card.rank && hand[i].suit === card.suit) return i;
      }
      return -1;
    };

    /* Play a card into the current trick; auto-resolves when all seats played. */
    game.playCard = function (seat, card) {
      if (game.phase !== 'playing' && game.phase !== 'reveal') {
        throw new Error('truco: not in a play phase');
      }
      if (seat !== game.turn) throw new Error('truco: not your turn to play');
      const hi = game.handIndexOf(seat, card);
      if (hi === -1) throw new Error('truco: card not in hand');
      game.players[seat].hand.splice(hi, 1);
      game.trick.push({ player: seat, card });

      if (game.trick.length >= game.activeSeats().length) {
        game.resolveTrick();
      } else {
        game.turn = game.nextActive(game.turn);
      }
    };

    game.resolveTrick = function () {
      const res = trickWinner(game.trick, game.manilha);
      if (res.winner >= 0) {
        game.players[res.winner].tricks++;
        game.trickLeader = res.winner;      // winner leads the next trick
      }
      /* dead trick: nobody wins; the leader who led it leads again (house rule) */
      game.lastTrick = { winner: res.winner, tie: res.tie, plays: game.trick.slice() };
      game.trick = [];
      if (game.allHandsEmpty()) {
        game.phase = 'roundEnd';
      } else {
        game.phase = 'playing';
        game.turn = game.trickLeader;
      }
      return game.lastTrick;
    };

    /* Round scoring: free-for-all applies |bid − tricks| per player.
       Partnership mode pools both partners' bids and tricks, applies one shared
       penalty, and eliminates/wins as a team. */
    game.finishRound = function () {
      if (game.phase !== 'roundEnd') throw new Error('truco: round not finished');
      if (game.teamMode) {
        const teamPenalties = {}, teamBids = {}, teamTricks = {}, eliminatedTeams = [];
        const roundTeams = game.activeTeamIds();
        for (const id of roundTeams) {
          const team = game.teams[id];
          const bid = team.seats.reduce((sum, s) => sum + (game.players[s].bid || 0), 0);
          const tricks = team.seats.reduce((sum, s) => sum + game.players[s].tricks, 0);
          const pen = Math.abs(bid - tricks);
          team.score -= pen;
          teamBids[id] = bid;
          teamTricks[id] = tricks;
          teamPenalties[id] = pen;
          for (const s of team.seats) game.players[s].score = team.score;
          if (team.score <= ELIMINATION_SCORE) {
            team.eliminated = true;
            eliminatedTeams.push(id);
            for (const s of team.seats) game.players[s].eliminated = true;
          }
        }
        game.history.push({
          round: game.round,
          handSize: game.handSize,
          indicator: game.indicator,
          manilha: game.manilha,
          bids: game.players.map(p => p.bid),
          tricks: game.players.map(p => p.tricks),
          scores: game.players.map(p => p.score),
          eliminated: eliminatedTeams.flatMap(id => game.teams[id].seats),
          teamBids,
          teamTricks,
          teamPenalties,
          teamScores: game.teams.map(team => team.score),
          eliminatedTeams: eliminatedTeams.slice(),
        });
        const activeTeams = game.activeTeamIds();
        if (activeTeams.length === 1) {
          game.winnerTeam = activeTeams[0];
          game.winner = 'team:' + activeTeams[0];
          game.phase = 'over';
        } else if (activeTeams.length === 0) {
          game.winnerTeam = 'draw';
          game.winner = 'draw';
          game.phase = 'over';
        } else {
          game.phase = 'lobby';
        }
        return {
          penalties: {}, teamPenalties, teamBids, teamTricks,
          eliminated: eliminatedTeams.flatMap(id => game.teams[id].seats),
          eliminatedTeams,
          over: game.phase === 'over', winner: game.winner, winnerTeam: game.winnerTeam,
        };
      }
      const penalties = {}, eliminatedNow = [];
      for (const s of game.activeSeats()) {
        const p = game.players[s];
        const pen = Math.abs((p.bid || 0) - p.tricks);
        p.score -= pen;
        penalties[s] = pen;
        if (p.score <= ELIMINATION_SCORE) { p.eliminated = true; eliminatedNow.push(s); }
      }
      game.history.push({
        round: game.round,
        handSize: game.handSize,
        indicator: game.indicator,
        manilha: game.manilha,
        bids: game.players.map(p => p.bid),
        tricks: game.players.map(p => p.tricks),
        scores: game.players.map(p => p.score),
        eliminated: eliminatedNow.slice(),
      });
      const act = game.activeSeats();
      if (act.length === 1) { game.winner = act[0]; game.phase = 'over'; }
      else if (act.length === 0) { game.winner = 'draw'; game.phase = 'over'; }
      else { game.phase = 'lobby'; }
      return { penalties, eliminated: eliminatedNow, over: game.phase === 'over', winner: game.winner };
    };

    /* ── CPU heuristics (legal always, decent usually) ──────────────────── */

    game.cpuBid = function (seat) {
      const n = game.handSize;
      if (game.isBlind()) {
        /* Own card is hidden. Estimate from the others' visible single cards. */
        const others = game.activeSeats().filter(s => s !== seat);
        const vis = others.map(s => game.players[s].hand[0]).filter(Boolean);
        if (vis.some(c => c.rank === game.manilha)) return 0;   // someone else shows a manilha
        const pM = 4 / (DECK_SIZE - 1 - vis.length);            // own card is a manilha?
        let pBeat = 1;                                          // beat every visible card
        for (const c of vis) pBeat *= (9 - STRENGTH[c.rank]) / 10;
        const pWin = pM + (1 - pM) * pBeat;
        return pWin > 0.45 ? 1 : 0;
      }
      let exp = 0;
      for (const c of game.players[seat].hand) {
        if (c.rank === game.manilha) exp += 0.9;
        else if (STRENGTH[c.rank] >= 6) exp += 0.45;
        else if (STRENGTH[c.rank] >= 3) exp += 0.2;
        else exp += 0.05;
      }
      exp *= 2 / game.numPlayers;                               // more seats → fewer tricks each
      return Math.max(0, Math.min(n, Math.round(exp)));
    };

    game.cpuChooseCard = function (seat) {
      const hand = game.players[seat].hand;
      if (!hand.length) throw new Error('truco: empty hand');
      if (game.trick.length === 0) {
        /* Lead the strongest card. */
        let bi = 0;
        for (let i = 1; i < hand.length; i++) {
          if (compareCards(hand[i], hand[bi], game.manilha) > 0) bi = i;
        }
        return hand[bi];
      }
      if (game.teamMode) {
        const weakestFirst = hand.map((card, index) => ({ card, index })).sort((a, b) => {
          const cmp = compareCards(a.card, b.card, game.manilha);
          return cmp || a.index - b.index;
        });
        const current = trickWinner(game.trick, game.manilha);
        if (current.winner >= 0 && game.sameTeam(current.winner, seat)) {
          const preservesPartner = weakestFirst.find(({ card }) => {
            const result = trickWinner(game.trick.concat({ player: seat, card }), game.manilha);
            return result.winner === current.winner;
          });
          if (preservesPartner) return preservesPartner.card;
        }
        const winsForTeam = weakestFirst.find(({ card }) => {
          const result = trickWinner(game.trick.concat({ player: seat, card }), game.manilha);
          return result.winner >= 0 && game.sameTeam(result.winner, seat);
        });
        return (winsForTeam || weakestFirst[0]).card;
      }
      /* Follow: beat the current best as cheaply as possible, else dump lowest. */
      let bi = 0;
      for (let i = 1; i < game.trick.length; i++) {
        const c = compareCards(game.trick[i].card, game.trick[bi].card, game.manilha);
        if (c > 0 || (c === 0 && game.trick[i].player < game.trick[bi].player)) bi = i;
      }
      const best = game.trick[bi].card;
      let winner = -1, dump = 0;
      for (let i = 0; i < hand.length; i++) {
        if (compareCards(hand[i], best, game.manilha) > 0) {
          if (winner === -1 || compareCards(hand[i], hand[winner], game.manilha) < 0) winner = i;
        }
        if (compareCards(hand[i], hand[dump], game.manilha) < 0) dump = i;
      }
      return hand[winner === -1 ? dump : winner];
    };

    return game;
  }

  return {
    RANK_CYCLE, STRENGTH, SUIT_KEYS, SUIT_CHARS, SUIT_POWER,
    DECK_SIZE, ELIMINATION_SCORE,
    newDeck, shuffle, manilhaAfter, isManilha, cardKey, compareCards,
    trickWinner, maxHandSize, cardId, newGame,
  };
});
