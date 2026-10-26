/* Qi's online rooms, the contract (the app's Qi/Online/QiRoom.swift; docs/ONLINE.md in the
   app's repo): two people, one game of Go, Gomoku or Chess, over the arcade relay. A room is
   a flat map of key → JSON, and every key has exactly one writer:

     room     the host    the game, the board size, who sits where
     g        the host    the moves so far and everything around them (offers, dead stones,
                          agreement to count, the result, rematches)
     j/<pid>  a guest     "I'm here", written on every connect; the host seats it
     i/<pid>  a guest     the guest's latest action, numbered; the host applies it (or
                          refuses it) and acknowledges it in g.acks[pid]

   Seat 1 moves first: Black in Go and Gomoku, White in chess. Both sides replay g.moves
   through the same rules, so they always agree on the position. A web player and an iPhone
   player share one room: the JSON here is exactly what the app reads and writes. */
import * as Gomoku from './gomoku.js?v=9';
import * as Chess from './chess.js?v=9';
import { goFromMoves, point } from './models.js?v=9';

/** The 7-letter codes people read to each other: no I, O, 0 or 1. */
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RoomCode = {
  make() {
    const bytes = new Uint8Array(7);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  },
  isValid(code) { return typeof code === 'string' && code.length === 7 && [...code].every((c) => ALPHABET.includes(c)); },
  /** A code typed or pasted in any form: "abc d123", an invite message, a link. */
  find(text) {
    const s = String(text || '');
    const at = s.search(/room\//i);
    if (at >= 0) {
      const tail = s.slice(at + 5, at + 12).toUpperCase();
      if (this.isValid(tail)) return tail;
    }
    const squeezed = s.toUpperCase().replace(/[\s-]/g, '');
    if (this.isValid(squeezed)) return squeezed;
    return s.toUpperCase().split(/[^A-Z0-9]+/).find((tk) => this.isValid(tk)) || null;
  },
  /** The relay's room name: the prefix keeps Qi rooms apart from Manilha's. */
  relayRoom(code) { return 'QI' + code; },
};

export function newRecord() {
  return { v: 1, round: 1, seq: 0, moves: [], acks: {}, dead: [], deadRev: 0, agreed: {}, rematch: {} };
}

/** A record as the app expects it: every field present (Swift decodes no defaults). */
export function normalRecord(r) {
  const out = { ...newRecord(), ...r };
  out.moves = Array.isArray(out.moves) ? out.moves : [];
  for (const k of ['acks', 'agreed', 'rematch']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  if (!Array.isArray(out.dead)) out.dead = [];
  if (out.offer == null) delete out.offer;
  if (out.result == null) delete out.result;
  if (out.mj == null) delete out.mj;
  return out;
}

export const seatKeys = (info) => (info.game === 'mahjong' ? ['0', '1', '2', '3'] : ['1', '2']);
export const seatOf = (info, pid) => { for (const [k, v] of Object.entries(info.seats || {})) if (v === pid) return Number(k); return null; };
export const isFull = (info) => seatKeys(info).every((k) => info.seats && info.seats[k] != null);

/** What the rules say about a list of moves: whose turn it is, whether the game is over,
    and which moves are allowed next. */
export function position(info, moves) {
  if (info.game === 'go') {
    const game = goFromMoves(info.size || 9, []);
    const movers = [];
    for (const m of moves) {
      const mover = game.current;
      let out;
      if (m === 'pass') { out = game.pass(); movers.push(mover); }
      else if (m === 'resume') { out = game.resume(); movers.push(0); }
      else { const p = point(m); out = p ? game.play(p[0], p[1]) : { ok: false }; movers.push(mover); }
      if (!out || !out.ok) return null;
    }
    return { toMove: game.current, over: false, scoring: game.phase === 'scoring', movers, game,
      accepts(m) {
        if (game.phase !== 'playing') return false;
        if (m === 'pass') return true;
        const p = point(m);
        return !!p && game.preview(p[0], p[1]).ok;
      } };
  }
  if (info.game === 'gomoku') {
    const board = Gomoku.emptyBoard();
    let current = 1, won = false;
    const movers = [];
    for (const m of moves) {
      const p = point(m);
      if (won || !p || p[0] < 0 || p[0] >= 15 || p[1] < 0 || p[1] >= 15 || board[p[0] * 15 + p[1]] !== 0) return null;
      board[p[0] * 15 + p[1]] = current;
      movers.push(current);
      if (Gomoku.checkWin(board, p[0], p[1])) won = true; else current = 3 - current;
    }
    const over = won || moves.length === 225;
    return { toMove: current, over, scoring: false, movers,
      accepts(m) { const p = point(m); return !over && !!p && p[0] >= 0 && p[0] < 15 && p[1] >= 0 && p[1] < 15 && board[p[0] * 15 + p[1]] === 0; } };
  }
  if (info.game === 'chess') {
    const game = Chess.ChessGame.replay(moves);
    if (!game) return null;
    return { toMove: game.current, over: game.isOver, scoring: false, movers: moves.map((_, i) => (i % 2 === 0 ? 1 : 2)),
      accepts(m) { const mv = Chess.parseUci(m); return !!mv && game.isLegal(mv); } };
  }
  return null;
}

function resetScoring(r) { r.dead = []; r.deadRev += 1; r.agreed = {}; }

/** The record after `seat` does `intent`, or null when it isn't allowed now (the host then
    only acknowledges it). Rematches are agreed here and started by `nextRound`. */
export function apply(intent, seat, record, info) {
  if (intent.round !== record.round || (seat !== 1 && seat !== 2)) return null;
  const pos = position(info, record.moves);
  if (!pos) return null;
  const r = JSON.parse(JSON.stringify(record));
  const finished = r.result != null || pos.over;
  const me = String(seat);
  switch (intent.a) {
    case 'move': {
      if (finished || pos.scoring || intent.m == null || pos.toMove !== seat || !pos.accepts(intent.m)) return null;
      r.moves.push(intent.m);
      delete r.offer;
      if (info.game === 'go') { const after = position(info, r.moves); if (after && after.scoring) resetScoring(r); }
      break;
    }
    case 'resign':
      if (finished) return null;
      r.result = { winner: 3 - seat, reason: 'resign' };
      delete r.offer;
      break;
    case 'undo':
      if (finished || r.offer || !pos.movers.includes(seat)) return null;
      r.offer = { kind: 'undo', by: seat };
      break;
    case 'draw':
      if (finished || info.game !== 'chess') return null;
      if (r.offer && r.offer.kind === 'draw' && r.offer.by !== seat) { r.result = { winner: 0, reason: 'agreement' }; delete r.offer; }
      else { if (r.offer) return null; r.offer = { kind: 'draw', by: seat }; }
      break;
    case 'accept': {
      const o = r.offer;
      if (finished || !o || o.by === seat) return null;
      if (o.kind === 'undo') {
        const movers = pos.movers.slice();
        while (movers.length) {
          const last = movers.pop();
          r.moves.pop();
          if (last === o.by) break;
        }
        resetScoring(r);
      } else {
        r.result = { winner: 0, reason: 'agreement' };
      }
      delete r.offer;
      break;
    }
    case 'decline':
      if (!r.offer || r.offer.by === seat) return null;
      delete r.offer;
      break;
    case 'cancel':
      if (!r.offer || r.offer.by !== seat) return null;
      delete r.offer;
      break;
    case 'dead': {
      if (info.game !== 'go' || !pos.scoring || r.result || intent.p == null) return null;
      const game = pos.game, p = intent.p;
      if (p < 0 || p >= game.board.length) return null;
      const toggled = game.toggleDead(r.dead, Math.floor(p / game.size), p % game.size);
      if (JSON.stringify(toggled) === JSON.stringify(r.dead.slice().sort((a, b) => a - b))) return null;
      r.dead = toggled;
      r.deadRev += 1;
      r.agreed = {};
      break;
    }
    case 'count': {
      if (info.game !== 'go' || !pos.scoring || r.result) return null;
      r.agreed[me] = r.deadRev;
      if (r.agreed['1'] === r.deadRev && r.agreed['2'] === r.deadRev) {
        r.result = { winner: pos.game.score(r.dead).winner, reason: 'score' };
      }
      break;
    }
    case 'resume':
      if (info.game !== 'go' || !pos.scoring || r.result) return null;
      r.moves.push('resume');
      resetScoring(r);
      break;
    case 'rematch':
      if (!finished) return null;
      r.rematch[me] = true;
      break;
    default:
      return null;
  }
  return r;
}

export function wantsRematch(r) { return r.rematch && r.rematch['1'] === true && r.rematch['2'] === true; }

/** Both asked for another game: an empty board, the seats swapped (so the other player moves
    first), the acknowledgements kept. */
export function nextRound(r, info) {
  const next = newRecord();
  next.round = r.round + 1;
  next.seq = r.seq;
  next.acks = { ...r.acks };
  const room = { ...info, seats: {} };
  if (info.seats['1']) room.seats['2'] = info.seats['1'];
  if (info.seats['2']) room.seats['1'] = info.seats['2'];
  return [next, room];
}
