/* 麻将 with simple 推倒胡 rules, as the app plays it (Qi/Engine/Mahjong.swift, MahjongAI.swift):
   136 tiles (no flowers), four seats, 13 tiles each and the dealer 14. Draw then discard.
   Chow only the discard of the player on your left (上家); pung and kong anyone's; kongs
   exposed, concealed or added to a pung. A discard several seats want goes to a win, then a
   pung or kong, then a chow; two wins on one tile go to the first winner in turn order. A win
   is four sets and a pair, or seven pairs (七对), self-drawn (自摸) or on anyone's discard.
   Fans: 胡 1, 自摸 1, 门清 1, 碰碰胡 2, 七对 2, 清一色 3, 杠上开花 1, 海底捞月 1, added up into
   the hand's points: self-drawn, each of the other three pays; on a discard, its discarder
   alone. No dead wall: kong replacements come off the back of the wall, and with the wall
   empty the last discard can only be won, else the hand is drawn (流局). The dealer keeps the
   deal after its own win or a drawn hand, else it passes to the next seat.
   Tiles 0…33: 0–8 characters (万) 1–9, 9–17 dots (筒), 18–26 bamboo (条), 27–30 the winds
   东南西北, 31–33 the dragons 中 发 白. Seats 0…3 in turn order; -1 a tile this device can't
   see (another player's, online). The same wall from the same seed as the app (SplitMix64). */

export const KINDS = 34, UNKNOWN = -1;
export const isHonor = (t) => t >= 27;
export const suit = (t) => Math.floor(t / 9);
export const rank = (t) => (t < 27 ? (t % 9) + 1 : t - 26);
export const isTerminal = (t) => t < 27 && (t % 9 === 0 || t % 9 === 8);

/** "5m" (characters), "5p" (dots), "5s" (bamboo), "1z"…"7z" (东南西北中发白). */
export function code(t) { return t >= 0 && t < KINDS ? rank(t) + 'mpsz'[suit(t)] : '?'; }
export function tile(text) {
  const s = String(text);
  if (s.length !== 2) return null;
  const n = Number(s[0]), su = 'mpsz'.indexOf(s[1]);
  if (!(n >= 1) || su < 0 || n > (su === 3 ? 7 : 9)) return null;
  return su * 9 + n - 1;
}
/** Tiles written the short way: "123m456p11z". */
export function tiles(text) {
  const out = [];
  let digits = [];
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') digits.push(Number(ch));
    else {
      const su = 'mpsz'.indexOf(ch);
      if (su < 0) continue;
      for (const d of digits) if (d >= 1 && d <= (su === 3 ? 7 : 9)) out.push(su * 9 + d - 1);
      digits = [];
    }
  }
  return out;
}

const M64 = (1n << 64n) - 1n;
/** SplitMix64, as the app's (BigInt, so the same seed gives the same wall). */
export class SplitMix {
  constructor(seed) { this.state = BigInt.asUintN(64, BigInt(seed)); }
  next() {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & M64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M64;
    return z ^ (z >> 31n);
  }
  below(n) { return Number(this.next() % BigInt(n)); }
}

export const FULL_SET = Array.from({ length: KINDS * 4 }, (_, i) => Math.floor(i / 4));
/** The wall for a deal: the 136 tiles shuffled by `seed` (a BigInt or number). */
export function wall(seed) {
  const rng = new SplitMix(seed);
  const w = FULL_SET.slice();
  for (let i = w.length - 1; i > 0; i--) { const j = rng.below(i + 1); const x = w[i]; w[i] = w[j]; w[j] = x; }
  return w;
}
export function randomSeed() {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return (BigInt(b[0]) << 32n) | BigInt(b[1]);
}

export const sorted = (ts) => ts.slice().sort((a, b) => (a < 0 ? 99 : a) - (b < 0 ? 99 : b));
export function counts(ts) { const c = new Array(KINDS).fill(0); for (const t of ts) if (t >= 0) c[t]++; return c; }
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ── Winning hands ─────────────────────────────────────────────────────────────

export function isStandardWin(counts) {
  if (sum(counts) % 3 !== 2) return false;
  const c = counts.slice();
  for (let i = 0; i < KINDS; i++) {
    if (c[i] < 2) continue;
    c[i] -= 2;
    if (allSets(c, 0)) return true;
    c[i] += 2;
  }
  return false;
}
function allSets(c, from) {
  let i = from;
  while (i < KINDS && c[i] === 0) i++;
  if (i === KINDS) return true;
  if (c[i] >= 3) { c[i] -= 3; const ok = allSets(c, i); c[i] += 3; if (ok) return true; }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    const ok = allSets(c, i);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (ok) return true;
  }
  return false;
}
export const isSevenPairs = (c) => sum(c) === 14 && c.every((n) => n % 2 === 0);
export function isWin(c, melds) {
  if (sum(c) !== 14 - 3 * melds) return false;
  return isStandardWin(c) || (melds === 0 && isSevenPairs(c));
}
export function isAllPungs(c) {
  let pairs = 0;
  for (const n of c) { if (!n) continue; if (n === 2) pairs++; else if (n !== 3) return false; }
  return pairs === 1;
}
export function waits(c, melds) {
  const out = [];
  for (let t = 0; t < KINDS; t++) { if (c[t] >= 4) continue; const d = c.slice(); d[t]++; if (isWin(d, melds)) out.push(t); }
  return out;
}

// ── Shanten (向听) ─────────────────────────────────────────────────────────────

/** -1 a winning hand, 0 ready (听牌), 1 one useful tile away (一向听), … */
export function shanten(c, melds) {
  const standard = standardShanten(c, melds);
  return melds === 0 ? Math.min(standard, sevenPairsShanten(c)) : standard;
}
export const sevenPairsShanten = (c) => 6 - Math.min(7, c.reduce((s, n) => s + Math.floor(n / 2), 0));
export function standardShanten(c, melds) {
  const need = Math.max(0, 4 - melds);
  const groups = [parts(c, 0, 9, false), parts(c, 9, 9, false), parts(c, 18, 9, false), parts(c, 27, 7, true)];
  let best = 2 * need;
  for (let pairIn = -1; pairIn < 4; pairIn++) {
    if (pairIn >= 0 && !groups[pairIn].paired.length) continue;
    let sums = new Set([0]);
    for (let g = 0; g < 4; g++) {
      const list = g === pairIn ? groups[g].paired : groups[g].free;
      const next = new Set();
      for (const a of sums) for (const b of list) next.add(a + b);
      sums = next;
    }
    const pair = pairIn >= 0 ? 1 : 0;
    for (const s of sums) {
      const m = Math.min(s >> 5, need), t = Math.min(s & 31, need - m);
      best = Math.min(best, 2 * need - 2 * m - t - pair);
    }
  }
  return best;
}
const partsCache = new Map();
function parts(c, start, length, honors) {
  let key = honors ? 1 : 0;
  for (let i = start; i < start + length; i++) key = key * 5 + c[i];
  const hit = partsCache.get(key);
  if (hit) return hit;
  const g = c.slice(start, start + length);
  const free = new Set(), paired = new Set();
  split(g, 0, honors, 0, 0, free);
  for (let i = 0; i < g.length; i++) {
    if (g[i] < 2) continue;
    g[i] -= 2;
    split(g, 0, honors, 0, 0, paired);
    g[i] += 2;
  }
  const result = { free: pareto(free), paired: pareto(paired) };
  partsCache.set(key, result);
  return result;
}
function split(g, from, honors, m, t, out) {
  let i = from;
  while (i < g.length && g[i] === 0) i++;
  if (i === g.length) { out.add((m << 5) | t); return; }
  if (g[i] >= 3) { g[i] -= 3; split(g, i, honors, m + 1, t, out); g[i] += 3; }
  if (!honors && i + 2 < g.length && g[i + 1] > 0 && g[i + 2] > 0) {
    g[i]--; g[i + 1]--; g[i + 2]--; split(g, i, honors, m + 1, t, out); g[i]++; g[i + 1]++; g[i + 2]++;
  }
  if (g[i] >= 2) { g[i] -= 2; split(g, i, honors, m, t + 1, out); g[i] += 2; }
  if (!honors && i + 1 < g.length && g[i + 1] > 0) { g[i]--; g[i + 1]--; split(g, i, honors, m, t + 1, out); g[i]++; g[i + 1]++; }
  if (!honors && i + 2 < g.length && g[i + 2] > 0) { g[i]--; g[i + 2]--; split(g, i, honors, m, t + 1, out); g[i]++; g[i + 2]++; }
  g[i]--;
  split(g, i, honors, m, t, out);
  g[i]++;
}
function pareto(all) {
  const list = [...all];
  return list.filter((a) => !list.some((b) => b !== a && (b >> 5) >= (a >> 5) && (b & 31) >= (a & 31))).sort((a, b) => a - b);
}

// ── Melds, claims, steps ──────────────────────────────────────────────────────

/** {kind: 'chow'|'pung'|'kong'|'hiddenKong', tile, from, claimed, added}. */
export function meldTiles(m) {
  return m.kind === 'chow' ? [m.tile, m.tile + 1, m.tile + 2] : m.kind === 'pung' ? [m.tile, m.tile, m.tile] : [m.tile, m.tile, m.tile, m.tile];
}
export const isOpenMeld = (m) => m.kind !== 'hiddenKong';

/** A claim: 'win' | 'kong' | 'pung' | {chow: low}. */
export const claimPriority = (c) => (c === 'win' ? 3 : c === 'kong' || c === 'pung' ? 2 : 1);
export const sameClaim = (a, b) => (a && typeof a === 'object' ? !!b && typeof b === 'object' && a.chow === b.chow : a === b);
const hasClaim = (list, c) => list.some((x) => sameClaim(x, c));

/** A step: {t:'discard', tile} | {t:'selfDraw'} | {t:'kong', tile} | {t:'claim', seat, claim} | {t:'pass'}. */
export function stepCode(s) {
  switch (s.t) {
    case 'discard': return 'd' + code(s.tile);
    case 'selfDraw': return 't';
    case 'kong': return 'k' + code(s.tile);
    case 'claim': return 'c' + s.seat + (s.claim === 'win' ? 'h' : s.claim === 'kong' ? 'k' : s.claim === 'pung' ? 'p' : ':' + code(s.claim.chow));
    default: return 'x';
  }
}
export function parseStep(text) {
  const s = String(text);
  const body = s.slice(1);
  switch (s[0]) {
    case 'd': { const t = tile(body); return t == null ? null : { t: 'discard', tile: t }; }
    case 'k': { const t = tile(body); return t == null ? null : { t: 'kong', tile: t }; }
    case 't': return body ? null : { t: 'selfDraw' };
    case 'x': return body ? null : { t: 'pass' };
    case 'c': {
      const seat = Number(body[0]);
      if (!(seat >= 0 && seat < 4)) return null;
      const rest = body.slice(1);
      if (rest === 'h') return { t: 'claim', seat, claim: 'win' };
      if (rest === 'k') return { t: 'claim', seat, claim: 'kong' };
      if (rest === 'p') return { t: 'claim', seat, claim: 'pung' };
      if (rest[0] !== ':') return null;
      const low = tile(rest.slice(1));
      return low == null ? null : { t: 'claim', seat, claim: { chow: low } };
    }
    default: return null;
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export const FAN_VALUE = { win: 1, selfDraw: 1, concealed: 1, allPungs: 2, sevenPairs: 2, oneSuit: 3, kongBloom: 1, lastTile: 1 };
export const points = (fans) => fans.reduce((s, f) => s + FAN_VALUE[f], 0);

export function fans(concealed, melds, selfDrawn, kongDraw, lastTile) {
  const c = counts(concealed);
  const common = ['win'];
  if (selfDrawn) common.push('selfDraw');
  const everything = concealed.concat(melds.flatMap(meldTiles));
  if (everything.length && everything[0] < 27 && everything.every((t) => t < 27 && suit(t) === suit(everything[0]))) common.push('oneSuit');
  if (selfDrawn && kongDraw) common.push('kongBloom');
  if (selfDrawn && lastTile) common.push('lastTile');
  const options = [];
  if (isStandardWin(c)) {
    const f = common.slice();
    if (!melds.some(isOpenMeld)) f.push('concealed');
    if (melds.every((m) => m.kind !== 'chow') && isAllPungs(c)) f.push('allPungs');
    options.push(f);
  }
  if (!melds.length && isSevenPairs(c)) options.push(common.concat(['sevenPairs']));
  if (!options.length) return common;
  return options.reduce((best, o) => (points(o) > points(best) ? o : best));
}

/** Who deals next: the dealer again after its own win or a drawn hand, else the next seat. */
export const nextDealer = (dealer, result) => (result.winner == null || result.winner === dealer ? dealer : (dealer + 1) % 4);

// ── A hand ────────────────────────────────────────────────────────────────────

/** One hand, from the deal to a win or a drawn hand. Built from the wall (all 136 tiles known)
    or, online, from what one seat can see: the wall unknown (-1) except for the tiles that
    seat has been given (`known`, in the order it received them). */
export class Game {
  constructor(wallTiles, dealer, known = [[], [], [], []]) {
    this.wall = wallTiles;
    this.front = 0;
    this.back = wallTiles.length;
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.rivers = [[], [], [], []];
    this.dealer = dealer;
    this.turn = dealer;
    this.phase = 'turn';
    this.drawn = null;
    this.kongDraw = false;
    this.lastDiscard = null;
    this.steps = [];
    this.result = null;
    this.given = [[], [], [], []];
    this.known = known.map((k) => k.slice());
    this.dealt = known.map((k) => k.slice());
    for (let k = 0; k < 4; k++) {
      const seat = (dealer + k) % 4;
      const h = [];
      for (let i = 0; i < 13; i++) h.push(this.take(seat, false));
      this.hands[seat] = sorted(h);
    }
    this.draw(false);
  }

  clone() {
    const g = Object.create(Game.prototype);
    Object.assign(g, this);
    g.hands = this.hands.map((h) => h.slice());
    g.melds = this.melds.map((ms) => ms.map((m) => ({ ...m })));
    g.rivers = this.rivers.map((r) => r.map((x) => ({ ...x })));
    g.lastDiscard = this.lastDiscard ? { ...this.lastDiscard } : null;
    g.steps = this.steps.slice();
    g.given = this.given.map((x) => x.slice());
    g.known = this.known.map((x) => x.slice());
    g.result = this.result ? { ...this.result, change: this.result.change.slice(), fans: this.result.fans.slice() } : null;
    return g;
  }

  get wallLeft() { return this.back - this.front; }
  get isOpenView() { return !this.wall.includes(UNKNOWN); }

  /** A seat's concealed tiles without one copy of the tile it just drew. */
  handWithoutDrawn(seat) {
    const h = this.hands[seat].slice();
    if (seat === this.turn && this.drawn != null) { const i = h.indexOf(this.drawn); if (i >= 0) h.splice(i, 1); }
    return h;
  }

  take(seat, fromBack) {
    let pos;
    if (fromBack) { this.back--; pos = this.back; } else { pos = this.front; this.front++; }
    let t = this.wall[pos];
    if (t === UNKNOWN && this.known[seat].length) t = this.known[seat].shift();
    this.given[seat].push(t);
    return t;
  }
  draw(fromBack) {
    const t = this.take(this.turn, fromBack);
    this.insert(t, this.turn);
    this.drawn = t;
    this.kongDraw = fromBack;
    this.phase = 'turn';
  }
  insert(t, seat) {
    const h = this.hands[seat];
    let i = h.findIndex((x) => x > t || x === UNKNOWN);
    if (i < 0) i = h.length;
    h.splice(t === UNKNOWN ? h.length : i, 0, t);
  }
  remove(t, seat, count = 1) {
    const h = this.hands[seat].slice();
    for (let k = 0; k < count; k++) {
      let i = h.indexOf(t);
      if (i < 0) i = h.lastIndexOf(UNKNOWN);
      if (i < 0) return false;
      h.splice(i, 1);
    }
    this.hands[seat] = h;
    return true;
  }
  held(seat, t) { return this.hands[seat].filter((x) => x === t).length; }
  hidden(seat) { return this.hands[seat].filter((x) => x === UNKNOWN).length; }

  // What a seat may do

  get canSelfDraw() {
    if (this.phase !== 'turn' || this.drawn == null) return false;
    if (this.hidden(this.turn) > 0) return true;
    return isWin(counts(this.hands[this.turn]), this.melds[this.turn].length);
  }
  get kongOptions() {
    if (this.phase !== 'turn' || this.drawn == null || this.wallLeft <= 0) return [];
    const c = counts(this.hands[this.turn]);
    const concealed = [];
    for (let t = 0; t < KINDS; t++) if (c[t] === 4) concealed.push(t);
    const added = this.melds[this.turn].filter((m) => m.kind === 'pung' && c[m.tile] > 0).map((m) => m.tile);
    return concealed.concat(added);
  }
  claimOptions(seat) {
    if (this.phase !== 'claims' || !this.lastDiscard || seat === this.lastDiscard.from) return [];
    const { tile: t, from } = this.lastDiscard;
    const out = [];
    const c = counts(this.hands[seat]);
    c[t]++;
    if (isWin(c, this.melds[seat].length)) out.push('win');
    if (this.wallLeft <= 0) return out;
    const n = this.held(seat, t);
    if (n >= 3) out.push('kong');
    if (n >= 2) out.push('pung');
    if (seat === (from + 1) % 4 && t < 27) {
      const r = t % 9;
      for (const low of [t - 2, t - 1, t]) {
        if (!(low >= t - r && low % 9 <= 6 && low >= 0)) continue;
        const others = [low, low + 1, low + 2].filter((x) => x !== t);
        if (others.every((x) => this.held(seat, x) > 0)) out.push({ chow: low });
      }
    }
    return out;
  }
  get claimants() { return [0, 1, 2, 3].filter((s) => this.claimOptions(s).length > 0); }

  /** The step that settles the discard, given each seat's answer (a missing seat passes). */
  settle(answers) {
    if (!this.lastDiscard) return { t: 'pass' };
    const from = this.lastDiscard.from;
    let best = null;
    for (let k = 1; k <= 3; k++) {
      const seat = (from + k) % 4;
      const claim = answers[seat];
      if (claim == null || !hasClaim(this.claimOptions(seat), claim)) continue;
      if (!best || claimPriority(claim) > claimPriority(best[1])) best = [seat, claim];
    }
    return best ? { t: 'claim', seat: best[0], claim: best[1] } : { t: 'pass' };
  }

  // Playing

  /** Plays a step, if the rules allow it now. Returns false (and changes nothing) if not. */
  apply(step) {
    const next = this.clone();
    if (!next.play(step)) return false;
    next.steps.push(step);
    Object.assign(this, next);
    return true;
  }

  play(step) {
    switch (step.t) {
      case 'discard': {
        if (this.phase !== 'turn' || !this.remove(step.tile, this.turn)) return false;
        this.rivers[this.turn].push({ tile: step.tile, claimed: false });
        this.lastDiscard = { tile: step.tile, from: this.turn };
        this.drawn = null;
        this.kongDraw = false;
        this.phase = 'claims';
        return true;
      }
      case 'selfDraw':
        if (!this.canSelfDraw) return false;
        this.finish(this.turn, null, this.drawn);
        return true;
      case 'kong': {
        const t = step.tile;
        if (!(this.kongOptions.includes(t) || (this.hidden(this.turn) > 0 && this.wallLeft > 0 && this.drawn != null))) return false;
        const i = this.melds[this.turn].findIndex((m) => m.kind === 'pung' && m.tile === t);
        if (i >= 0 && this.held(this.turn, t) < 4) {
          if (!this.remove(t, this.turn)) return false;
          this.melds[this.turn][i] = { ...this.melds[this.turn][i], kind: 'kong', added: true };
        } else {
          if (!this.remove(t, this.turn, 4)) return false;
          this.melds[this.turn].push({ kind: 'hiddenKong', tile: t, from: null, claimed: null, added: false });
        }
        this.draw(true);
        return true;
      }
      case 'claim': {
        const ld = this.lastDiscard;
        if (!ld || !(hasClaim(this.claimOptions(step.seat), step.claim) || this.lenientClaim(step.seat, step.claim))) return false;
        const { tile: t, from } = ld;
        const seat = step.seat, claim = step.claim;
        const river = this.rivers[from];
        river[river.length - 1] = { ...river[river.length - 1], claimed: true };
        this.lastDiscard = null;
        this.turn = seat;
        if (claim === 'win') { this.insert(t, seat); this.finish(seat, from, t); return true; }
        if (claim === 'pung') {
          if (!this.remove(t, seat, 2)) return false;
          this.melds[seat].push({ kind: 'pung', tile: t, from, claimed: t, added: false });
        } else if (claim === 'kong') {
          if (!this.remove(t, seat, 3)) return false;
          this.melds[seat].push({ kind: 'kong', tile: t, from, claimed: t, added: false });
        } else {
          const low = claim.chow;
          for (const x of [low, low + 1, low + 2]) if (x !== t && !this.remove(x, seat)) return false;
          this.melds[seat].push({ kind: 'chow', tile: low, from, claimed: t, added: false });
        }
        if (claim === 'kong') this.draw(true);
        else { this.drawn = null; this.kongDraw = false; this.phase = 'turn'; }
        return true;
      }
      case 'pass': {
        if (this.phase !== 'claims' || !this.lastDiscard) return false;
        const from = this.lastDiscard.from;
        this.lastDiscard = null;
        if (this.wallLeft === 0) this.finish(null, null, null);
        else { this.turn = (from + 1) % 4; this.draw(false); }
        return true;
      }
      default: return false;
    }
  }

  /** Another seat's claim in a view that can't see its hand: allowed if its unknown tiles
      could cover it (the host checked it for real). */
  lenientClaim(seat, claim) {
    const ld = this.lastDiscard;
    if (this.phase !== 'claims' || !ld || seat === ld.from || this.hidden(seat) <= 0) return false;
    if (typeof claim === 'object') return seat === (ld.from + 1) % 4 && ld.tile < 27;
    return true;
  }

  finish(winner, from, t) {
    const r = { winner, from, tile: t, fans: [], points: 0, change: [0, 0, 0, 0] };
    if (winner != null) {
      r.fans = fans(this.hands[winner], this.melds[winner], from == null, this.kongDraw, this.wallLeft === 0);
      r.points = points(r.fans);
      if (from != null) { r.change[from] -= r.points; r.change[winner] += r.points; }
      else for (let s = 0; s < 4; s++) if (s !== winner) { r.change[s] -= r.points; r.change[winner] += r.points; }
    }
    this.result = r;
    this.phase = 'over';
    if (winner == null) this.drawn = null;
  }

  get selfDrawn() { return !!this.result && this.result.winner != null && this.result.from == null; }

  /** The hand after its first `k` steps, from the same wall. */
  replayed(k) {
    const g = new Game(this.wall, this.dealer, this.dealt);
    for (const s of this.steps.slice(0, k)) g.apply(s);
    return g;
  }
  static replay(wallTiles, dealer, steps, known) {
    const g = new Game(wallTiles, dealer, known);
    for (const s of steps) if (!g.apply(s)) return null;
    return g;
  }

  /** Every tile `seat` can see: its own hand, every river and every meld. */
  visible(seat) {
    const c = counts(this.hands[seat]);
    for (let s = 0; s < 4; s++) {
      for (const r of this.rivers[s]) if (!r.claimed && r.tile >= 0) c[r.tile]++;
      for (const m of this.melds[s]) for (const t of meldTiles(m)) c[t]++;
    }
    return c;
  }
  unseen(seat) { return this.visible(seat).map((n) => Math.max(0, 4 - n)); }
}

// ── The computer players and the coach's arithmetic ───────────────────────────

/* Every decision rests on shanten and on how many unseen tiles would bring the hand closer
   (进张). A seat only uses what it could see at a real table. Easy keeps the shape but picks
   among equal discards at random and claims eagerly; Normal takes the discard with the most
   tiles that help and claims what brings it closer; Hard also keeps its hand concealed early,
   and folds to safe tiles when an opponent looks close. */
export const LEVELS = ['easy', 'normal', 'hard'];

function helpers(c) {
  const out = [];
  for (let u = 0; u < KINDS; u++) {
    if (c[u] > 0) { out.push(u); continue; }
    if (u >= 27) continue;
    const r = u % 9;
    for (const d of [1, 2]) if ((r - d >= 0 && c[u - d] > 0) || (r + d <= 8 && c[u + d] > 0)) { out.push(u); break; }
  }
  return out;
}
function edge(t, c) {
  if (t >= 27) return c[t] === 1 ? 0 : 2;
  const r = t % 9;
  let near = false;
  for (const d of [1, 2]) if ((r - d >= 0 && c[t - d] > 0) || (r + d <= 8 && c[t + d] > 0)) near = true;
  if (near || c[t] > 1) return 2;
  return r === 0 || r === 8 ? 1 : 2;
}

/** Every distinct tile `seat` could let go, best first: fewest steps from ready, then the most
    unseen tiles that help, then lone honours and terminals before middle tiles. */
export function discards(g, seat) {
  const melds = g.melds[seat].length;
  const c = counts(g.hands[seat]);
  const unseen = g.unseen(seat);
  const out = [];
  for (let t = 0; t < KINDS; t++) {
    if (!c[t]) continue;
    c[t]--;
    const s = shanten(c, melds);
    const useful = [];
    let n = 0;
    for (const u of helpers(c)) {
      if (!unseen[u]) continue;
      c[u]++;
      if (shanten(c, melds) < s) { useful.push(u); n += unseen[u]; }
      c[u]--;
    }
    c[t]++;
    out.push({ tile: t, shanten: s, useful, count: n });
  }
  return out.sort((a, b) => a.shanten - b.shanten || b.count - a.count || edge(a.tile, c) - edge(b.tile, c) || b.tile - a.tile);
}

function noise(g, seat) {
  let h = 0xcbf29ce484222325n;
  for (const t of g.hands[seat]) h = ((h ^ BigInt(t + 2)) * 0x100000001b3n) & M64;
  return h ^ BigInt(g.steps.length * 4 + seat);
}

/** What the seat to move does: wins if it can, kongs when that keeps its shape, else discards. */
export function aiTurn(g, level) {
  if (g.canSelfDraw) return { t: 'selfDraw' };
  const seat = g.turn;
  const list = discards(g, seat);
  if (!list.length) return { t: 'pass' };
  const best = list[0];
  const c = counts(g.hands[seat]), melds = g.melds[seat].length;
  for (const t of g.kongOptions) {
    const d = c.slice();
    const added = g.melds[seat].some((m) => m.kind === 'pung' && m.tile === t);
    d[t] -= added ? 1 : 4;
    if (level === 'easy' || shanten(d, added ? melds : melds + 1) <= best.shanten) return { t: 'kong', tile: t };
  }
  if (level === 'easy') {
    const even = list.filter((d) => d.shanten === best.shanten);
    return { t: 'discard', tile: even[new SplitMix(noise(g, seat)).below(even.length)].tile };
  }
  if (level === 'hard') { const safe = defend(g, seat, list); return { t: 'discard', tile: safe != null ? safe : best.tile }; }
  return { t: 'discard', tile: best.tile };
}

function defend(g, seat, list) {
  const threats = [0, 1, 2, 3].filter((o) => {
    if (o === seat) return false;
    const open = g.melds[o].filter(isOpenMeld).length;
    return open >= 2 || (open >= 1 && g.wallLeft < 36) || g.wallLeft < 16;
  });
  const best = list[0];
  if (!threats.length || !best || best.shanten < (threats.length > 1 ? 1 : 2)) return null;
  const visible = g.visible(seat);
  const safety = (t) => Math.min(...threats.map((o) => {
    if (g.rivers[o].some((r) => r.tile === t)) return 10;
    if (t >= 27) return visible[t] >= 3 ? 9 : visible[t] === 2 ? 7 : 4;
    if (isTerminal(t)) return visible[t] >= 3 ? 8 : 4;
    const r = t % 9;
    return r === 1 || r === 7 ? 3 : 1;
  }));
  let pick = null, top = -Infinity;
  for (const d of list) {
    const s = safety(d.tile) * 4 - (d.shanten - best.shanten) * 6;
    if (s > top) { top = s; pick = d.tile; }
  }
  return pick;
}

/** The seat's answer to the discard on the table: a win always; a pung, kong or chow when it
    brings the hand closer; null to let it go. */
export function aiClaim(g, seat, level) {
  const options = g.claimOptions(seat);
  if (options.includes('win')) return 'win';
  if (!g.lastDiscard || !options.length) return null;
  const t = g.lastDiscard.tile;
  const c = counts(g.hands[seat]), melds = g.melds[seat].length;
  const now = shanten(c, melds);
  let best = null;
  for (const option of options) {
    const after = shantenAfter(option, t, c, melds);
    if (!best || after < best.after || (after === best.after && claimPriority(option) > claimPriority(best.claim))) best = { claim: option, after };
  }
  if (!best) return null;
  if (level === 'easy') return best.after <= now && new SplitMix(noise(g, seat)).below(3) > 0 ? best.claim : null;
  if (level === 'normal') return best.after < now ? best.claim : null;
  if (best.after >= now) return null;
  // Stay concealed (门清) early unless the claim makes the hand ready or it is already open, or
  // the hand is heavy with pairs (碰碰胡).
  const pairs = c.filter((n) => n >= 2).length;
  if (g.melds[seat].every((m) => !isOpenMeld(m)) && best.after > 0 && now >= 2 && pairs < 4 && g.wallLeft > 40) return null;
  return best.claim;
}

/** Shanten once `claim` is made with the discard and the best tile let go (a kong draws instead). */
export function shantenAfter(claim, t, counts0, melds) {
  const c = counts0.slice();
  if (claim === 'win') return -1;
  if (claim === 'pung') c[t] -= 2;
  else if (claim === 'kong') { c[t] -= 3; return shanten(c, melds + 1); }
  else for (const x of [claim.chow, claim.chow + 1, claim.chow + 2]) if (x !== t) c[x]--;
  let best = Infinity;
  for (let x = 0; x < KINDS; x++) {
    if (!c[x]) continue;
    c[x]--;
    best = Math.min(best, shanten(c, melds + 1));
    c[x]++;
  }
  return best;
}

/** Plays a hand to its end with the computer in every seat (tests, demos). */
export function playOut(start, levels) {
  const g = start.clone();
  while (g.phase !== 'over' && g.steps.length < 600) {
    let step;
    if (g.phase === 'turn') step = aiTurn(g, levels[g.turn]);
    else {
      const answers = {};
      for (const seat of g.claimants) { const a = aiClaim(g, seat, levels[seat]); if (a != null) answers[seat] = a; }
      step = g.settle(answers);
    }
    if (!g.apply(step)) break;
  }
  return g;
}

/** A wall arranged for a demo: `seat` is dealt `hand` and its next draws are `draws`. */
export function arrangedWall(seed, dealer, seat, hand, draws) {
  const rest = wall(seed);
  for (const t of hand.concat(draws)) { const i = rest.indexOf(t); if (i >= 0) rest.splice(i, 1); }
  const w = new Array(136).fill(UNKNOWN);
  const k = (seat - dealer + 4) % 4;
  hand.slice(0, 13).forEach((t, i) => { w[13 * k + i] = t; });
  draws.forEach((t, j) => { const pos = seat === dealer ? 52 + 4 * j : 52 + k + 4 * j; if (pos < 136) w[pos] = t; });
  for (let i = 0; i < w.length; i++) if (w[i] === UNKNOWN) w[i] = rest.shift();
  return w;
}
