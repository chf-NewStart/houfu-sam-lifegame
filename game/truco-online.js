/* truco-online.js — the room contract for online truco (Manilha), shared by
   game/truco.html and the Manilha iOS app (which implements the same rules in
   Swift and is tested against messages recorded from this file).
   Transport-agnostic UMD: browser → window.TrucoOnline, node → module.exports.

   A room lives on the relay (relay/src/index.js) as a flat map of keys, each
   written by exactly one side, so nothing ever needs a transaction:

     room       the roster and who is hosting                      host writes
     g          the whole game: engine state + bookkeeping         host writes
     j/<pid>    "I am here": avatar and the seat I'd like          that player writes
     i/<seat>   "my move": a guess or a card                       that seat's player writes

   One player hosts: they run the engine and the computer players, seat
   joiners, and turn intents into moves. Everyone else renders `g` and sends
   intents. The full state is in the room, so if the host disappears the next
   connected player (clockwise from the host) takes over where it stopped.
   The relay sends every key to everyone, so this is a casual room for people
   who trust each other, not an anti-cheat boundary.

   Players have no names, only one of the AVATARS (an index), so nothing anyone
   types is ever shown to anyone else. */
(function (root, factory) {
  'use strict';
  const engine = typeof module === 'object' && module.exports ? require('./truco-engine.js') : root.TrucoEngine;
  const api = factory(engine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TrucoOnline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TrucoEngine) {
  'use strict';

  const SCHEMA = 2;
  const ROOM_RE = /^[A-HJ-NP-Z2-9]{7}$/;
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PID_RE = /^[A-Za-z0-9_-]{8,64}$/;
  const TEAM_BY_SEAT = [0, 1, 0, 1];
  /* The creator sits at 0; the first friend joins their team opposite. */
  const CLAIM_ORDER = [0, 2, 1, 3];
  const AVATARS = ['🦊', '🐼', '🐸', '🐯', '🐙', '🦉', '🐢', '🐝', '🦁', '🐨', '🐧', '🦜'];
  const DEFAULT_TTL = 12 * 60 * 60 * 1000;
  /* How long the host may be missing before the next player takes over, and
     how long a player may be missing on their turn before the host lets the
     computer move for them (the seat stays theirs; they take it back on return). */
  const HOST_GRACE = 15 * 1000;
  const AWAY_GRACE = 20 * 1000;
  /* Host pacing, so every client's own animations finish before the next move. */
  const PACE = { deal: 3500, cpu: 950, trick: 2200, round: 5000 };
  const KEYS = { room: 'room', game: 'g', join: pid => 'j/' + pid, intent: seat => 'i/' + seat };

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function fail(code) { throw new Error('truco-room:' + code); }
  function isInt(value) { return Number.isInteger(value); }

  function randomBytes(count, rng) {
    if (!rng && typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
      return Array.from(crypto.getRandomValues(new Uint8Array(count)));
    }
    return Array.from({ length: count }, () => Math.floor((typeof rng === 'function' ? rng() : Math.random()) * 256) & 255);
  }

  function makeRoomCode(rng) {
    return randomBytes(7, rng).map(b => ROOM_CHARS[Math.min(ROOM_CHARS.length - 1, Math.floor(b / 256 * ROOM_CHARS.length))]).join('');
  }

  function makePid(rng) {
    return randomBytes(16, rng).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* A typed code, a pasted invite link, or a manilha:// link → the bare code. */
  function normalizeRoomCode(raw) {
    const value = String(raw || '').trim();
    let candidate = value;
    try {
      const match = value.match(/[?&]room=([^&#\s]+)/i) || value.match(/^manilha:\/\/room\/([^/?#\s]+)/i);
      if (match) candidate = decodeURIComponent(match[1]);
    } catch (error) {}
    return candidate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function roomLink(code, origin) {
    return (origin || 'https://lifegameproject.com') + '/game/truco.html?room=' + encodeURIComponent(code);
  }

  function cleanAvatar(value) {
    const n = Number(value);
    return isInt(n) && n >= 0 && n < AVATARS.length ? n : 0;
  }

  function seatsOf(room) {
    return Array.from({ length: 4 }, (_, seat) => room && Array.isArray(room.seats) ? (room.seats[seat] || null) : null);
  }

  function validSeat(record) {
    if (record == null) return true;
    if (record.kind === 'ai') return true;
    return record.kind === 'human' && typeof record.pid === 'string' && PID_RE.test(record.pid)
      && isInt(record.avatar) && record.avatar >= 0 && record.avatar < AVATARS.length;
  }

  function validRoom(room, now) {
    if (!room || room.kind !== 'truco' || room.schema !== SCHEMA) return false;
    if (!['waiting', 'playing', 'closed'].includes(room.status)) return false;
    if (!isInt(room.createdAt) || !isInt(room.expiresAt) || !isInt(room.epoch) || room.epoch < 1) return false;
    if (!isInt(room.rev) || !isInt(room.match) || room.match < 0) return false;
    if (now != null && room.expiresAt < now) return false;
    if (!Array.isArray(room.teams) || room.teams.length !== 4 || room.teams.some((t, s) => t !== TEAM_BY_SEAT[s])) return false;
    if (!Array.isArray(room.seats) || room.seats.length !== 4 || !room.seats.every(validSeat)) return false;
    const pids = room.seats.filter(r => r && r.kind === 'human').map(r => r.pid);
    if (new Set(pids).size !== pids.length) return false;
    if (room.status === 'closed') return true;
    if (!isInt(room.host) || room.host < 0 || room.host > 3) return false;
    const host = room.seats[room.host];
    if (!host || host.kind !== 'human') return false;
    if (room.status === 'playing' && room.seats.some(r => !r)) return false;
    return true;
  }

  function newRoom(hostPid, avatar, now, ttl) {
    if (!PID_RE.test(String(hostPid || ''))) fail('invalid-pid');
    const createdAt = Number(now == null ? Date.now() : now);
    const life = Number(ttl == null ? DEFAULT_TTL : ttl);
    return {
      kind: 'truco', schema: SCHEMA, createdAt, expiresAt: createdAt + life,
      status: 'waiting', host: 0, epoch: 1, match: 0, rev: 1,
      teams: TEAM_BY_SEAT.slice(),
      seats: [{ kind: 'human', pid: hostPid, avatar: cleanAvatar(avatar) }, null, null, null],
    };
  }

  function seatOf(room, pid) {
    const seats = seatsOf(room);
    for (let seat = 0; seat < 4; seat++) if (seats[seat] && seats[seat].kind === 'human' && seats[seat].pid === pid) return seat;
    return -1;
  }

  function hostPid(room) {
    const record = room && isInt(room.host) ? seatsOf(room)[room.host] : null;
    return record && record.kind === 'human' ? record.pid : null;
  }

  function humanSeats(room) {
    return seatsOf(room).map((r, seat) => r && r.kind === 'human' ? seat : -1).filter(seat => seat >= 0);
  }

  /* Every `j/<pid>` key in a relay map → { pid: {avatar, want, at} }. */
  function joinsOf(map) {
    const joins = {};
    for (const key of Object.keys(map || {})) {
      if (!key.startsWith('j/')) continue;
      const pid = key.slice(2), value = map[key];
      if (!PID_RE.test(pid) || !value || typeof value !== 'object') continue;
      joins[pid] = {
        avatar: cleanAvatar(value.avatar),
        want: isInt(value.want) && value.want >= 0 && value.want < 4 ? value.want : null,
        at: isInt(value.at) ? value.at : 0,
      };
    }
    return joins;
  }

  function joinRecord(avatar, want, now) {
    return { avatar: cleanAvatar(avatar), want: isInt(want) ? want : null, at: Number(now == null ? Date.now() : now) };
  }

  /* Nobody types a name, so the animal is how friends tell each other apart.
     Each player decides only for themselves: if someone who joined earlier
     (or is seated without a join record, like a host handing over) already
     has my animal, I take the first free one after it. Earlier joiners never
     change, so everyone settles on distinct animals without coordinating.
     A player who has not joined yet counts as the latest. */
  function earlier(joins, other, pid) {
    const a = joins[other], b = joins[pid];
    if (!a) return true;
    if (!b) return true;
    return a.at < b.at || (a.at === b.at && other < pid);
  }

  function takenAvatars(room, joins, pid, onlyEarlier) {
    const taken = new Set();
    joins = joins || {};
    for (const record of seatsOf(room)) {
      if (!record || record.kind !== 'human' || record.pid === pid) continue;
      if (!onlyEarlier || earlier(joins, record.pid, pid)) taken.add(joins[record.pid] ? joins[record.pid].avatar : cleanAvatar(record.avatar));
    }
    for (const other of Object.keys(joins)) {
      if (other === pid) continue;
      if (!onlyEarlier || earlier(joins, other, pid)) taken.add(joins[other].avatar);
    }
    return taken;
  }

  function freeAvatar(room, joins, pid, avatar) {
    const mine = cleanAvatar(avatar);
    const taken = takenAvatars(room, joins, pid, true);
    if (!taken.has(mine)) return mine;
    for (let k = 1; k < AVATARS.length; k++) {
      const next = (mine + k) % AVATARS.length;
      if (!taken.has(next)) return next;
    }
    return mine;
  }

  /* Host only: bring the roster in line with who has said they are here.
     Waiting: seat newcomers (their wished-for seat if it is open, else the
     claim order), move people who asked for an open seat, free the seats of
     people who left. Playing: nobody new sits down, and a player who left for
     good is replaced by the computer. Returns the same object when nothing
     changed, so the caller knows whether to write. */
  function reconcile(room, joins) {
    if (!validRoom(room) || room.status === 'closed') return room;
    const next = clone(room);
    next.seats = seatsOf(next);
    let changed = false;
    const hostKey = hostPid(room);
    for (let seat = 0; seat < 4; seat++) {
      const record = next.seats[seat];
      if (!record || record.kind !== 'human') continue;
      const join = joins[record.pid];
      if (!join) {
        if (record.pid === hostKey) continue;              // the host hands over before leaving
        next.seats[seat] = next.status === 'waiting' ? null : { kind: 'ai' };
        changed = true;
        continue;
      }
      if (join.avatar !== record.avatar) { record.avatar = join.avatar; changed = true; }
    }
    if (next.status === 'waiting') {
      for (let seat = 0; seat < 4; seat++) {
        const record = next.seats[seat];
        if (!record || record.kind !== 'human') continue;
        const want = joins[record.pid] && joins[record.pid].want;
        if (want != null && want !== seat && !next.seats[want]) {
          next.seats[want] = record;
          next.seats[seat] = null;
          if (next.host === seat) next.host = want;
          changed = true;
        }
      }
      const waiting = Object.keys(joins)
        .filter(pid => seatOf(next, pid) < 0)
        .sort((a, b) => (joins[a].at - joins[b].at) || (a < b ? -1 : a > b ? 1 : 0));
      for (const pid of waiting) {
        const want = joins[pid].want;
        const seat = want != null && !next.seats[want] ? want : CLAIM_ORDER.find(s => !next.seats[s]);
        if (seat == null) break;
        next.seats[seat] = { kind: 'human', pid, avatar: joins[pid].avatar };
        changed = true;
      }
    }
    if (!changed) return room;
    next.rev = room.rev + 1;
    return next;
  }

  /* Host only. Seats of people who are not connected are emptied, the computer
     takes every empty seat, and a new match begins. Also used for a rematch. */
  function startMatch(room, live) {
    if (!validRoom(room) || room.status === 'closed') fail('room-not-found');
    const next = clone(room);
    next.seats = seatsOf(next);
    const here = new Set(live || []);
    for (let seat = 0; seat < 4; seat++) {
      const record = next.seats[seat];
      if (record && record.kind === 'human' && seat !== room.host && !here.has(record.pid)) next.seats[seat] = null;
    }
    if (next.seats.filter(r => r && r.kind === 'human').length < 2) fail('need-two');
    for (let seat = 0; seat < 4; seat++) if (!next.seats[seat]) next.seats[seat] = { kind: 'ai' };
    next.status = 'playing';
    next.match = room.match + 1;
    next.rev = room.rev + 1;
    return next;
  }

  /* The next connected human clockwise from the host, or -1. */
  function successor(room, live) {
    const here = new Set(live || []);
    const seats = seatsOf(room);
    for (let step = 1; step < 4; step++) {
      const seat = (room.host + step) % 4;
      if (seats[seat] && seats[seat].kind === 'human' && here.has(seats[seat].pid)) return seat;
    }
    return -1;
  }

  /* A connected player takes over from a host who has gone quiet. */
  function takeOver(room, seat) {
    const next = clone(room);
    next.host = seat;
    next.epoch = room.epoch + 1;
    next.rev = room.rev + 1;
    return next;
  }

  /* The host leaves on purpose: hand the room to the next connected player
     (the leaving seat goes empty before a match, to the computer during one),
     or close it if nobody is left. */
  function handOver(room, live) {
    const next = clone(room);
    next.seats = seatsOf(next);
    const heir = successor(room, live);
    next.seats[room.host] = room.status === 'playing' ? { kind: 'ai' } : null;
    if (heir < 0) next.status = 'closed';
    else next.host = heir;
    next.epoch = room.epoch + 1;
    next.rev = room.rev + 1;
    return next;
  }

  /* ── the game record `g` ─────────────────────────────────────────────── */

  function gameRecord(room, game, prev) {
    const sameMatch = prev && prev.match === room.match;
    return {
      schema: SCHEMA,
      epoch: room.epoch,
      match: room.match,
      rev: prev ? prev.rev + 1 : 1,
      seq: sameMatch ? prev.seq + 1 : 1,
      acks: sameMatch ? prev.acks.slice() : [0, 0, 0, 0],
      state: TrucoEngine.exportState(game),
    };
  }

  /* Same state, new acknowledgements (a rejected intent changes nothing else). */
  function ackRecord(room, prev, acks) {
    return Object.assign(clone(prev), { epoch: room.epoch, rev: prev.rev + 1, acks: acks.slice() });
  }

  function validGameRecord(g) {
    return !!g && g.schema === SCHEMA && isInt(g.epoch) && isInt(g.match) && isInt(g.rev) && isInt(g.seq)
      && Array.isArray(g.acks) && g.acks.length === 4 && g.acks.every(isInt)
      && !!g.state && g.state.version === TrucoEngine.STATE_VERSION;
  }

  /* Is `g` newer than what we already have? Higher host epochs win, so a
     host that has been replaced cannot overwrite its successor's game. */
  function newerGame(g, current) {
    if (!validGameRecord(g)) return false;
    if (!current) return true;
    if (g.epoch !== current.epoch) return g.epoch > current.epoch;
    if (g.match !== current.match) return g.match > current.match;
    return g.rev > current.rev;
  }

  /* ── intents ─────────────────────────────────────────────────────────── */

  function makeIntent(pid, n, g, action) {
    const base = { pid, n, match: g.match, seq: g.seq };
    if (action.type === 'guess') return Object.assign(base, { type: 'guess', count: action.count });
    if (action.type === 'play') return Object.assign(base, { type: 'play', card: action.card });
    fail('unknown-action');
  }

  /* 'ok', or why the host must refuse it. `game` is the host's live engine;
     the host only asks while nothing is animating (it waits otherwise).
     'old' and 'not-yours' are dropped silently; any other refusal is
     acknowledged, so the player's buttons come back. */
  function checkIntent(room, g, seat, intent, game) {
    const record = seatsOf(room)[seat];
    if (!intent || !record || record.kind !== 'human' || record.pid !== intent.pid) return 'not-yours';
    if (!isInt(intent.n) || intent.n <= g.acks[seat]) return 'old';
    if (intent.match !== g.match || intent.seq !== g.seq) return 'stale';
    if (game.turn !== seat) return 'not-your-turn';
    if (intent.type === 'guess') {
      return game.phase === 'bidding' && isInt(intent.count) && intent.count >= 0 && intent.count <= game.handSize ? 'ok' : 'illegal';
    }
    if (intent.type === 'play') {
      return game.phase === 'playing' && typeof intent.card === 'string' && game.cardById(seat, intent.card) ? 'ok' : 'illegal';
    }
    return 'illegal';
  }

  /* Applies a checked intent to the host's engine. Returns the played card for 'play'. */
  function applyIntent(game, seat, intent) {
    if (intent.type === 'guess') { game.setBid(seat, intent.count); return null; }
    const card = game.cardById(seat, intent.card);
    game.playCard(seat, card);
    return card;
  }

  /* Cards this seat may see: its own hand, except in a blind round, where it
     sees everyone else's single card and not its own. */
  function visibleHands(state, seat) {
    const blind = state.handSize === 1 && (state.phase === 'bidding' || state.phase === 'reveal');
    return state.players.map((p, owner) => (blind ? owner !== seat : owner === seat) ? p.hand.slice() : p.hand.map(() => null));
  }

  return {
    SCHEMA, ROOM_RE, PID_RE, TEAM_BY_SEAT, CLAIM_ORDER, AVATARS, DEFAULT_TTL, HOST_GRACE, AWAY_GRACE, PACE, KEYS,
    makeRoomCode, makePid, normalizeRoomCode, roomLink, cleanAvatar,
    validRoom, newRoom, seatOf, hostPid, humanSeats, joinsOf, joinRecord, takenAvatars, freeAvatar,
    reconcile, startMatch, successor, takeOver, handOver,
    gameRecord, ackRecord, validGameRecord, newerGame,
    makeIntent, checkIntent, applyIntent, visibleHands,
  };
});
