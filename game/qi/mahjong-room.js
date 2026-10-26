/* Mahjong rooms (the app's Qi/Online/MahjongRoom.swift): up to four people at one table,
   computer players in the empty seats and in the seat of anyone who is away, on the same relay
   and with the same keys as the app, so phones with the app and browsers sit together.
   A hand is hidden information, but every write reaches everyone in the room, so:
     - The host deals; its wall comes from a secret only its device has, one seed per hand.
     - g.moves is the public log of the hand (discards, claims, kongs, wins).
     - h/<pid> carries one player's own tiles, sealed to that player alone.
     - Answers to a discard go to the host one by one; it keeps them sealed to itself (g.mj.box)
       until every seat that may claim has answered, then writes only the outcome.
     - When the hand ends the host writes the seed: every hand turns face up for everyone.
   This module adds Mahjong to OnlineSession (online.js) through its `ext` hooks. */
import * as M from './mahjong.js?v=12';
import * as K from './mahjong-keys.js?v=12';
import { newRecord } from './room.js?v=12';

const parseSteps = (moves) => { const list = moves.map(M.parseStep); return list.every(Boolean) ? list : null; };

/** The hand as the host deals it, every tile known. */
export function hostGame(r, secret) {
  const mj = r.mj;
  if (!mj || !mj.dealt || !K.ready()) return null;
  const steps = parseSteps(r.moves);
  return steps ? M.Game.replay(M.wall(K.seed(secret, r.round)), mj.dealer, steps) : null;
}

/** The hand as `seat` sees it, from the tiles the host sent it; every tile once the seed is out. */
export function view(r, seat, given) {
  const mj = r.mj;
  if (!mj || !mj.dealt) return null;
  const steps = parseSteps(r.moves);
  if (!steps) return null;
  if (mj.seed) return M.Game.replay(M.wall(BigInt('0x' + mj.seed)), mj.dealer, steps);
  const known = [[], [], [], []];
  known[seat] = given || [];
  return M.Game.replay(new Array(136).fill(M.UNKNOWN), mj.dealer, steps, known);
}

/** An answer to the discard on the table: "a<steps>:<x|h|k|p|chow's low tile>". */
export function answerCode(claim, at) {
  const body = claim == null ? 'x' : claim === 'win' ? 'h' : claim === 'kong' ? 'k' : claim === 'pung' ? 'p' : M.code(claim.chow);
  return `a${at}:${body}`;
}
export function parseAnswer(text) {
  const m = /^a(\d+):(.+)$/.exec(text);
  if (!m) return null;
  const at = Number(m[1]), b = m[2];
  if (b === 'x') return { at, claim: null };
  if (b === 'h') return { at, claim: 'win' };
  if (b === 'k') return { at, claim: 'kong' };
  if (b === 'p') return { at, claim: 'pung' };
  const t = M.tile(b);
  return t == null ? null : { at, claim: { chow: t } };
}

const sealNotes = (notes, secret) => K.seal(notes, K.own(secret));
const openNotes = (box, secret) => (box ? K.open(box, K.own(secret)) : null);

/** The record after `seat` does `intent`, or null if it isn't allowed now. */
export function apply(intent, seat, record, info, secret, computers, level) {
  if (intent.round !== record.round || seat < 0 || seat > 3 || !record.mj) return null;
  const r = JSON.parse(JSON.stringify(record));
  const mj = r.mj;
  if (intent.a === 'rematch') {
    // The host's first press deals; after a hand, everyone says they're ready.
    if (!mj.dealt) {
      if (info.seats[String(seat)] !== info.host) return null;
      mj.dealt = true;
      return progress(r, secret, computers, level);
    }
    const g = hostGame(r, secret);
    if (!g || g.phase !== 'over') return null;
    r.rematch[String(seat)] = true;
    return r;
  }
  if (intent.a !== 'move' || !mj.dealt || intent.m == null) return null;
  const g = hostGame(r, secret);
  if (!g) return null;
  const answer = parseAnswer(intent.m);
  if (answer) {
    const options = g.claimOptions(seat);
    if (g.phase !== 'claims' || answer.at !== r.moves.length || !options.length) return null;
    if (answer.claim != null && !options.some((o) => M.sameClaim(o, answer.claim))) return null;
    let notes = openNotes(mj.box, secret);
    if (!notes || notes.at !== answer.at) notes = { at: answer.at, answers: {} };
    if (notes.answers[String(seat)] != null) return null;
    notes.answers[String(seat)] = intent.m.slice(intent.m.indexOf(':') + 1);
    mj.box = sealNotes(notes, secret);
  } else {
    const step = M.parseStep(intent.m);
    if (!step || g.phase !== 'turn' || g.turn !== seat || !['discard', 'selfDraw', 'kong'].includes(step.t)) return null;
    if (!g.apply(step)) return null;
    r.moves.push(intent.m);
    delete mj.box;
  }
  return progress(r, secret, computers, level);
}

/** Settles the discard once every seat that may claim it has answered (the computer answering
    for its seats), and writes the seed when the hand ends. */
export function progress(record, secret, computers, level) {
  const r = record;
  const g = hostGame(r, secret);
  if (!g) return r;
  while (g.phase === 'claims') {
    let notes = openNotes(r.mj.box, secret) || { at: r.moves.length, answers: {} };
    if (notes.at !== r.moves.length) notes = { at: r.moves.length, answers: {} };
    const answers = {};
    let waiting = false;
    for (const seat of g.claimants) {
      const a = notes.answers[String(seat)];
      if (a != null) { const p = parseAnswer('a0:' + a); if (p && p.claim != null) answers[seat] = p.claim; }
      else if (computers.has(seat)) { const c = M.aiClaim(g, seat, level); if (c != null) answers[seat] = c; }
      else waiting = true;
    }
    if (waiting) break;
    const step = g.settle(answers);
    if (!g.apply(step)) break;
    r.moves.push(M.stepCode(step));
    delete r.mj.box;
  }
  if (g.phase === 'over' && !r.mj.seed) r.mj.seed = K.seed(secret, r.round).toString(16);
  return r;
}

/** The computer's move, when the seat to move is one it plays. */
export function computerTurn(r, secret, computers, level) {
  const g = hostGame(r, secret);
  if (!g || g.phase !== 'turn' || !computers.has(g.turn)) return null;
  return { seat: g.turn, move: M.stepCode(M.aiTurn(g, level)) };
}

export function readyForNext(r, humans) {
  if (!r.mj || !r.mj.seed || !humans.size) return false;
  return [...humans].every((s) => r.rematch[String(s)] === true);
}

/** The next hand, dealt by whoever the last one says, the scores carried over. */
export function nextHand(r, secret) {
  const g = hostGame(r, secret);
  if (!g || !g.result || !r.mj) return null;
  const next = newRecord();
  next.round = r.round + 1;
  next.seq = r.seq;
  next.acks = { ...r.acks };
  next.mj = { dealer: M.nextDealer(g.dealer, g.result), scores: r.mj.scores.map((s, i) => s + g.result.change[i]), dealt: true };
  return next;
}

/** What the host writes to a player at `seat`: its tiles this hand, sealed to it. */
export function sealedTiles(r, seat, secret, pub, room) {
  const g = hostGame(r, secret);
  const key = g && K.shared(secret, pub, room);
  if (!key) return null;
  return { round: r.round, n: g.given[seat].length, box: K.seal(g.given[seat], key) };
}

export function openTiles(p, round, secret, hostPub, room) {
  if (!p || p.round !== round) return null;
  const key = K.shared(secret, hostPub, room);
  const tiles = key && K.open(p.box, key);
  return Array.isArray(tiles) ? tiles : null;
}

// ── The session's Mahjong part ────────────────────────────────────────────────

function computersOf(s) {
  const info = s.info;
  if (!info) return new Set();
  return new Set([0, 1, 2, 3].filter((seat) => {
    const p = info.seats[String(seat)];
    return p == null || (p !== s.pid && !s.live.has(p));
  }));
}

function sealTiles(s) {
  if (!s.isHost || !s.info || !s.record || !s.code) return;
  for (const [key, guest] of Object.entries(s.info.seats)) {
    if (guest === s.pid) continue;
    const join = s.map[`j/${guest}`];
    if (!join || !join.pub) continue;
    const tiles = sealedTiles(s.record, Number(key), s.secret, join.pub, s.code);
    if (!tiles) continue;
    const mark = `${tiles.round}:${tiles.n}:${join.pub}`;
    if (s.sealed[guest] === mark) continue;
    s.sealed[guest] = mark;
    s.write(`h/${guest}`, tiles);
  }
}

/** Publishes the hand (the next one, once everyone here is ready), then each guest's tiles. */
function publishMahjong(s, record) {
  let next = record;
  const humans = new Set(Object.entries(s.info.seats).filter(([, p]) => p === s.pid || s.live.has(p)).map(([k]) => Number(k)));
  if (readyForNext(next, humans)) { const dealt = nextHand(next, s.secret); if (dealt) next = dealt; }
  next.seq = Math.max(next.seq, record.seq) + 1;
  s.publish('g', next);
  sealTiles(s);
}

export const mahjongExt = {
  newSecret: () => (K.ready() ? K.newSecret() : ''),
  decorateRoom(s, room) { if (room.game === 'mahjong' && K.ready()) room.pub = K.publicKey(s.secret); },
  decorateJoin(s, join) { if (K.ready() && s.secret) join.pub = K.publicKey(s.secret); },
  newRecord(record, room) { if (room.game === 'mahjong') record.mj = { dealer: 0, scores: [0, 0, 0, 0], dealt: false }; },
  reset(s) { s.mahjongTiles = []; s.sealed = {}; },
  refresh(s) {
    const info = s.info, r = s.record;
    s.mahjongTiles = [];
    if (info && info.game === 'mahjong' && !s.isHost && r && info.pub && s.code && K.ready()) {
      s.mahjongTiles = openTiles(s.map[`h/${s.pid}`], r.round, s.secret, info.pub, s.code) || [];
    }
  },
  hostSend(s, intent, seat) {
    const next = apply(intent, seat, s.record, s.info, s.secret, computersOf(s), s.mahjongLevel || 'normal');
    if (next) publishMahjong(s, next);
  },
  apply: (s, intent, seat, game, room) => apply(intent, seat, game, room, s.secret, computersOf(s), s.mahjongLevel || 'normal'),
  hostWork(s, game, changed) {
    const settled = progress(JSON.parse(JSON.stringify(game)), s.secret, computersOf(s), s.mahjongLevel || 'normal');
    if (JSON.stringify(settled) !== JSON.stringify(game)) { game = settled; changed = true; }
    if (changed) publishMahjong(s, game); else sealTiles(s);
  },
};

/** Session helpers the Mahjong screen uses. */
export const table = {
  computers: computersOf,
  hostGame: (s) => (s.isHost && s.record ? hostGame(s.record, s.secret) : null),
  computerTurnDue(s) { const g = table.hostGame(s); return !!g && g.phase === 'turn' && computersOf(s).has(g.turn); },
  playComputerTurn(s) {
    if (!s.isHost || !s.info || s.info.game !== 'mahjong' || !s.record) return false;
    const due = computerTurn(s.record, s.secret, computersOf(s), s.mahjongLevel || 'normal');
    if (!due) return false;
    const next = apply({ n: 0, round: s.record.round, a: 'move', m: due.move }, due.seat, s.record, s.info, s.secret, computersOf(s), s.mahjongLevel || 'normal');
    if (!next) return false;
    publishMahjong(s, next);
    return true;
  },
};
