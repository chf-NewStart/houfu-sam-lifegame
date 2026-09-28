/* truco-online.js — pure room and projected-view helpers for truco.exe.
   Transport-agnostic UMD: browser → window.TrucoOnline, node → module.exports. */
(function (root, factory) {
  'use strict';
  const engine = typeof module === 'object' && module.exports ? require('./truco-engine.js') : root.TrucoEngine;
  const api = factory(engine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TrucoOnline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TrucoEngine) {
  'use strict';

  const ROOM_RE = /^[A-HJ-NP-Z2-9]{7}$/;
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const TEAM_BY_SEAT = [0, 1, 0, 1];
  const CLAIM_ORDER = [2, 1, 3];
  const DEFAULT_TTL = 12 * 60 * 60 * 1000;

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function fail(code) { throw new Error('truco-room:' + code); }
  function safeToken(token) {
    const value = String(token || '').trim();
    if (!value || value.length > 128 || /[.#$\[\]/]/.test(value)) fail('invalid-token');
    return value;
  }

  function cleanName(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/[<>&"'`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 18);
  }

  function makeRoomCode(rng) {
    let bytes = null;
    if (!rng && typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
      bytes = new Uint8Array(7);
      crypto.getRandomValues(bytes);
    }
    let code = '';
    for (let i = 0; i < 7; i++) {
      const value = bytes ? bytes[i] / 256 : (typeof rng === 'function' ? rng() : Math.random());
      const index = Math.max(0, Math.min(ROOM_CHARS.length - 1, Math.floor(value * ROOM_CHARS.length)));
      code += ROOM_CHARS[index];
    }
    return code;
  }

  function normalizeRoomCode(raw) {
    const value = String(raw || '').trim();
    let candidate = value;
    try {
      const match = value.match(/[?&]room=([^&#\s]+)/i);
      if (match) candidate = decodeURIComponent(match[1]);
    } catch (error) {}
    return candidate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function seatsOf(room) {
    return Array.from({ length: 4 }, (_, seat) => room && room.seats ? (room.seats[seat] || room.seats[String(seat)] || null) : null);
  }

  function validRoom(room, now) {
    if (!room || !room.meta || room.meta.kind !== 'truco' || Number(room.meta.schema) !== 1) return false;
    if (!['waiting', 'locking', 'locked'].includes(room.status)) return false;
    if (typeof room.hostToken !== 'string' || !room.hostToken) return false;
    if (!Array.isArray(room.teams) || room.teams.length !== 4 || room.teams.some((team, seat) => Number(team) !== TEAM_BY_SEAT[seat])) return false;
    if (!Number.isFinite(Number(room.meta.createdAt)) || !Number.isFinite(Number(room.meta.expiresAt))) return false;
    if (now != null && Number(room.meta.expiresAt) < Number(now)) return false;
    const seats = seatsOf(room);
    const humanTokens = new Set();
    for (const record of seats) {
      if (record == null) continue;
      if (record.kind !== 'human' && record.kind !== 'ai') return false;
      if (!cleanName(record.name)) return false;
      if (record.kind === 'human') {
        if (typeof record.token !== 'string' || !record.token || humanTokens.has(record.token)) return false;
        humanTokens.add(record.token);
      }
    }
    if (!seats[0] || seats[0].kind !== 'human' || seats[0].token !== room.hostToken) return false;
    if (room.status === 'locked' && seats.some(record => !record)) return false;
    return true;
  }

  function createLobby(hostToken, hostName, now, ttl) {
    const token = safeToken(hostToken);
    const name = cleanName(hostName) || 'Host';
    const createdAt = Number(now == null ? Date.now() : now);
    const life = Number(ttl == null ? DEFAULT_TTL : ttl);
    if (!Number.isFinite(createdAt) || !Number.isFinite(life) || life <= 0) fail('invalid-time');
    return {
      meta: { kind: 'truco', schema: 1, createdAt, expiresAt: createdAt + life },
      status: 'waiting',
      hostToken: token,
      teams: TEAM_BY_SEAT.slice(),
      seats: [{ kind: 'human', token, name }, null, null, null],
      updatedAt: createdAt,
    };
  }

  function seatForToken(room, token) {
    const value = String(token || '');
    const seats = seatsOf(room);
    for (let seat = 0; seat < seats.length; seat++) {
      if (seats[seat] && seats[seat].kind === 'human' && seats[seat].token === value) return seat;
    }
    return -1;
  }

  function claimSeat(room, token, name, now) {
    if (!validRoom(room, now)) fail(room && room.meta && Number(room.meta.expiresAt) < Number(now) ? 'room-expired' : 'room-not-found');
    const playerToken = safeToken(token);
    const playerName = cleanName(name) || 'Friend';
    const next = clone(room);
    next.seats = seatsOf(next);
    const existing = seatForToken(next, playerToken);
    if (existing >= 0) {
      next.seats[existing].name = playerName;
      next.updatedAt = Number(now == null ? Date.now() : now);
      return next;
    }
    if (next.status !== 'waiting') fail('room-locked');
    const seat = CLAIM_ORDER.find(index => !next.seats[index]);
    if (seat == null) fail('room-full');
    next.seats[seat] = { kind: 'human', token: playerToken, name: playerName };
    next.updatedAt = Number(now == null ? Date.now() : now);
    return next;
  }

  function moveSeat(room, token, targetSeat) {
    if (!validRoom(room)) fail('room-not-found');
    if (room.status !== 'waiting') fail('room-locked');
    const target = Number(targetSeat);
    if (!Number.isInteger(target) || target < 1 || target > 3) fail('invalid-seat');
    const playerToken = safeToken(token);
    const next = clone(room);
    next.seats = seatsOf(next);
    const current = seatForToken(next, playerToken);
    if (current < 0) fail('not-seated');
    if (current === 0) fail('host-fixed');
    if (next.seats[target]) fail('seat-unavailable');
    next.seats[target] = next.seats[current];
    next.seats[current] = null;
    next.updatedAt = Date.now();
    return next;
  }

  function humanSeats(room) {
    return seatsOf(room).map((record, seat) => record && record.kind === 'human' ? seat : -1).filter(seat => seat >= 0);
  }

  function lockRoster(room, hostToken, now) {
    if (!validRoom(room, now)) fail('room-not-found');
    if (room.status !== 'waiting') fail('room-locked');
    if (room.hostToken !== safeToken(hostToken)) fail('not-host');
    const next = clone(room);
    next.seats = seatsOf(next);
    if (humanSeats(next).length < 2) fail('need-two');
    for (let seat = 0; seat < 4; seat++) {
      if (!next.seats[seat]) next.seats[seat] = { kind: 'ai', name: `AI-${seat + 1}` };
    }
    next.status = 'locked';
    next.lockedAt = Number(now == null ? Date.now() : now);
    next.updatedAt = next.lockedAt;
    return next;
  }

  function projectGame(game, viewerSeat, uiState) {
    if (!TrucoEngine || typeof TrucoEngine.exportState !== 'function') fail('engine-unavailable');
    const seat = Number(viewerSeat);
    if (!Number.isInteger(seat) || seat < 0 || seat >= game.numPlayers) fail('invalid-seat');
    const state = TrucoEngine.exportState(game);
    const dealState = uiState && uiState.dealState;
    const dealing = !!dealState;
    const blind = state.handSize === 1 && (state.phase === 'bidding' || state.phase === 'reveal');
    for (let owner = 0; owner < state.players.length; owner++) {
      const show = !dealing && (blind ? owner !== seat : owner === seat);
      if (!show) state.players[owner].hand = state.players[owner].hand.map(() => null);
    }
    if (dealing && !dealState.indicatorRevealed) {
      state.indicator = null;
      state.manilha = null;
    }
    state.history = Array.isArray(state.history) ? state.history.slice(-12) : [];
    state.log = Array.isArray(state.log) ? state.log.slice(-40) : [];
    return state;
  }

  function hydrateView(snapshot) {
    if (!snapshot || Number(snapshot.version) !== Number(TrucoEngine.STATE_VERSION) || !Array.isArray(snapshot.players)) fail('invalid-view');
    const game = clone(snapshot);
    game.activeSeats = function () {
      const seats = [];
      for (let seat = 0; seat < game.players.length; seat++) if (!game.players[seat].eliminated) seats.push(seat);
      return seats;
    };
    game.nextActive = function (from) {
      for (let step = 1; step <= game.numPlayers; step++) {
        const seat = (from + step) % game.numPlayers;
        if (!game.players[seat].eliminated) return seat;
      }
      return -1;
    };
    game.isBlind = function () { return game.handSize === 1; };
    game.sameTeam = function (a, b) { return !!game.teamMode && game.teamBySeat[a] === game.teamBySeat[b]; };
    return game;
  }

  return {
    ROOM_RE, TEAM_BY_SEAT, CLAIM_ORDER,
    cleanName, makeRoomCode, normalizeRoomCode, validRoom, createLobby,
    seatForToken, claimSeat, moveSeat, lockRoster, humanSeats,
    projectGame, hydrateView,
  };
});
