/* 麻将 at a table of four (the app's Qi/Model/MahjongModel.swift and Qi/Views/MahjongScreen.swift):
   you at the bottom against three computer players, or online with friends and computers in
   the empty seats. Hand after hand with running scores and a turning deal, the coach, a replay
   of the hand just played, and between hands the automatic table's reset (the old hand swept
   into the middle, the shuffle, four walls rising, the dice under the dome). */
import { app, hooks, GameScreen, btn, esc, t, sheet, sheetHead, closeSheet, scheduleRender, replayPanel, chineseNumber, RULES } from './main.js?v=7';
import { icon, C as COL, drawPond } from './art.js?v=7';
import * as M from './mahjong.js?v=7';
import * as Sound from './sound.js?v=7';
import { sprite, drawTile, tileURL, glyph, NAMES, ASPECT, COLORS } from './tiles.js?v=7';
import { mahjongExt, answerCode, view, table } from './mahjong-room.js?v=7';

const RESET = 3400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private */ } };

// ── The model ─────────────────────────────────────────────────────────────────

export class MahjongModel {
  constructor() {
    this.listeners = [];
    const saved = load('qi_mahjong');
    this.level = saved && M.LEVELS.includes(saved.level) ? saved.level : 'normal';
    this.coach = true;
    this.me = 0;
    this.reveal = false;
    this.called = null;
    this.lifted = null;
    this.thinking = false;
    this.reset = null;
    this.answers = {};
    this.answered = new Set();
    this.token = 0;
    this.scored = false;
    this.online = null;
    this.replayAt = null;
    this.scores = saved && Array.isArray(saved.scores) ? saved.scores : [0, 0, 0, 0];
    this.handNumber = saved && saved.hand ? saved.hand : 1;
    // A saved hand comes back as it stood (its wall from its seed, its steps replayed).
    let g = null;
    if (saved && saved.seed && Array.isArray(saved.steps)) {
      const steps = saved.steps.map(M.parseStep);
      if (steps.every(Boolean)) g = M.Game.replay(M.wall(BigInt('0x' + saved.seed)), saved.dealer || 0, steps);
      if (g) { this.seed = BigInt('0x' + saved.seed); this.scored = !!saved.scored; }
    }
    if (!g) { this.seed = M.randomSeed(); g = new M.Game(M.wall(this.seed), 0); }
    this.game = g;
  }

  changed() { for (const f of this.listeners) f(); }
  persist() {
    if (this.online) return;
    save('qi_mahjong', { level: this.level, scores: this.scores, hand: this.handNumber, seed: this.seed.toString(16), dealer: this.game.dealer,
      steps: this.game.steps.map(M.stepCode), scored: this.scored });
  }

  get isOver() { return this.game.phase === 'over'; }
  get result() { return this.game.result; }
  get resetting() { return !!this.reset && performance.now() - this.reset.start < RESET; }
  get isOnline() { return this.online != null; }
  get lobby() { return !!this.online && !(this.online.record && this.online.record.mj && this.online.record.mj.dealt); }
  get isOnlineBlocked() { return (this.online && this.online.outbox.length > 0) || this.lobby; }
  get isMyTurn() { return this.game.phase === 'turn' && this.game.turn === this.me && !this.isOnlineBlocked && !this.resetting; }
  get myClaims() {
    if (this.game.phase !== 'claims' || this.answered.has(this.me) || this.isOnlineBlocked || this.resetting) return [];
    return this.game.claimOptions(this.me);
  }
  get canSelfDraw() { return this.isMyTurn && this.game.canSelfDraw; }
  get kongOptions() { return this.isMyTurn ? this.game.kongOptions : []; }
  get canDealNext() {
    if (!this.isOver) return false;
    if (!this.online) return true;
    return !(this.online.record && this.online.record.rematch[String(this.me)]);
  }

  // The automatic table between hands.
  startReset(previous) {
    const id = (this.reset ? this.reset.id : 0) + 1;
    this.reset = { id, start: performance.now(), previous, dice: dice(this.game) };
    this.lifted = null;
    Sound.machine('sweep');
    for (const [at, kind] of [[550, 'whir'], [1750, 'rise'], [2350, 'dice']]) {
      setTimeout(() => { if (this.reset && this.reset.id === id) Sound.machine(kind); }, at);
    }
    setTimeout(() => { if (this.reset && this.reset.id === id) { this.reset = null; this.changed(); if (!this.online) this.advance(); else this.scheduleComputer(); } }, RESET);
  }
  skipReset() {
    if (!this.resetting) return;
    this.reset = null;
    Sound.stopAll();
    this.changed();
    if (!this.online) this.advance(); else this.scheduleComputer();
  }
  get resetLeft() { return this.reset ? Math.max(0, RESET - (performance.now() - this.reset.start)) : 0; }

  // Replay
  get review() { return this.replayAt; }
  setReview(k) {
    if (!this.isOver || k == null || k >= this.game.steps.length) this.replayAt = null;
    else { this.replayAt = Math.max(0, k); this.reviewGame = this.game.replayed(this.replayAt); }
    this.changed();
  }
  get shown() { return this.replayAt != null && this.reviewGame ? this.reviewGame : this.game; }

  // The coach
  get advice() {
    if (!this.coach || this.replayAt != null) return null;
    const g = this.game;
    if (this.canSelfDraw) return { kind: 'win', shanten: -1, useful: [], count: 0 };
    const claims = this.myClaims;
    if (claims.length) {
      if (claims.includes('win')) return { kind: 'win', claim: 'win', shanten: -1, useful: [], count: 0 };
      const c = M.counts(g.hands[this.me]), melds = g.melds[this.me].length;
      const now = M.shanten(c, melds);
      const pick = M.aiClaim(g, this.me, 'hard');
      const tile = g.lastDiscard && g.lastDiscard.tile;
      if (tile == null) return null;
      if (pick != null) return { kind: 'claim', tile, claim: pick, shanten: M.shantenAfter(pick, tile, c, melds), useful: [], count: 0 };
      const closer = claims.some((cl) => M.shantenAfter(cl, tile, c, melds) < now);
      return { kind: closer ? 'stayConcealed' : 'pass', tile, shanten: now, useful: [], count: 0 };
    }
    if (!this.isMyTurn) return null;
    const best = M.discards(g, this.me)[0];
    if (!best) return null;
    if (g.kongOptions.length && M.aiTurn(g, 'hard').t === 'kong') return { kind: 'claim', tile: g.kongOptions[0], claim: 'kong', shanten: best.shanten, useful: [], count: 0 };
    return { kind: 'discard', tile: best.tile, shanten: best.shanten, useful: best.useful, count: best.count };
  }

  // Playing
  tap(tile) {
    if (!this.isMyTurn) return;
    if (this.lifted === tile) this.discard(tile); else { this.lifted = tile; this.changed(); }
  }
  discard(tile) { if (this.isMyTurn && this.game.hands[this.me].includes(tile)) { this.lifted = null; this.perform({ t: 'discard', tile }); } }
  selfDraw() { if (this.canSelfDraw) this.perform({ t: 'selfDraw' }); }
  kong(tile) { if (this.kongOptions.includes(tile)) this.perform({ t: 'kong', tile }); }
  /** Your answer to the discard on the table: a claim, or null to let it go (过). */
  answer(claim) {
    if (this.game.phase !== 'claims' || this.answered.has(this.me)) return;
    this.answered.add(this.me);
    if (this.online) {
      this.answeredAt = this.game.steps.length;
      this.online.send('move', { move: answerCode(claim, this.game.steps.length) });
      this.changed();
      return;
    }
    if (claim != null) this.answers[this.me] = claim;
    this.advance();
  }

  newGame(level) {
    if (this.online) return;
    if (level) this.level = level;
    this.scores = [0, 0, 0, 0];
    this.handNumber = 1;
    this.deal(0);
  }
  nextHand() {
    if (this.online) { if (this.canDealNext) this.online.send('rematch'); return; }
    if (!this.game.result) return;
    this.handNumber++;
    this.deal(M.nextDealer(this.game.dealer, this.game.result));
  }
  deal(dealer) {
    this.token++;
    this.thinking = false;
    this.seed = M.randomSeed();
    const previous = this.game;
    this.game = new M.Game(M.wall(this.seed), dealer);
    this.answers = {};
    this.answered = new Set();
    this.lifted = null;
    this.scored = false;
    this.replayAt = null;
    this.startReset(previous);
    this.persist();
    this.changed();
  }

  perform(step) {
    if (this.online) { this.lifted = null; this.online.send('move', { move: M.stepCode(step) }); this.changed(); return; }
    const before = this.game;
    if (!this.game.apply(step)) return;
    this.replayAt = null;
    this.answers = {};
    this.answered = new Set();
    this.sound(step, before);
    this.persist();
    this.advance();
  }

  sound(step, before) {
    if (step.t === 'discard') Sound.tile('discard');
    else if (step.t === 'kong') { this.called = { seat: before.turn, claim: 'kong', id: Math.random(), at: performance.now() }; Sound.tile('call'); }
    else if (step.t === 'claim') {
      if (step.claim === 'win') Sound.tile('win');
      else { this.called = { seat: step.seat, claim: step.claim, id: Math.random(), at: performance.now() }; Sound.tile('call'); }
    } else if (step.t === 'selfDraw') Sound.tile('win');
  }

  /** Moves the table along: the computer seats play and answer discards; a discard is settled
      once every seat that may claim it has answered. */
  advance() {
    if (this.online) return;
    const token = ++this.token;
    this.thinking = false;
    const g = this.game;
    if (g.phase === 'over') {
      if (!this.scored && g.result) { this.scored = true; this.scores = this.scores.map((s, i) => s + g.result.change[i]); this.persist(); }
      this.changed();
      return;
    }
    if (this.resetting) { this.changed(); return; }
    if (g.phase === 'turn') {
      if (g.turn === this.me) { this.changed(); return; }
      this.thinking = true;
      this.changed();
      setTimeout(() => {
        if (token !== this.token) return;
        this.thinking = false;
        this.perform(M.aiTurn(this.game, this.level));
      }, 650);
      return;
    }
    const claimants = g.claimants;
    for (const seat of claimants) {
      if (seat === this.me || this.answered.has(seat)) continue;
      this.answered.add(seat);
      const c = M.aiClaim(g, seat, this.level);
      if (c != null) this.answers[seat] = c;
    }
    this.changed();
    if (claimants.includes(this.me) && !this.answered.has(this.me)) return;
    const step = g.settle(this.answers);
    setTimeout(() => { if (token === this.token) this.perform(step); }, step.t === 'pass' ? 250 : 500);
  }

  // Online
  onlineName(seat) {
    const o = this.online;
    if (!o || !o.info) return null;
    const place = [null, t('right', '下家'), t('across', '对家'), t('left', '上家')][(seat - this.me + 4) % 4];
    if (o.info.seats[String(seat)] == null) return t(`Computer (${place})`, `电脑（${place}）`);
    if (table.computers(o).has(seat)) return t(`Friend, away (${place})`, `好友·离开（${place}）`);
    return t(`Friend (${place})`, `好友（${place}）`);
  }

  beginOnline(session) {
    this.token++;
    this.thinking = false;
    if (!this.online) this.localTable = { game: this.game, scores: this.scores, hand: this.handNumber, scored: this.scored, seed: this.seed };
    this.online = session;
    session.mahjongLevel = this.level;
    this.answeredAt = null;
    this.syncOnline();
  }
  endOnline() {
    if (!this.online) return;
    this.online = null;
    this.token++;
    this.me = 0;
    const s = this.localTable;
    if (s) { this.game = s.game; this.scores = s.scores; this.handNumber = s.hand; this.scored = s.scored; this.seed = s.seed; }
    this.localTable = null;
    this.answers = {};
    this.answered = new Set();
    this.replayAt = null;
    this.advance();
  }

  /** Follows the room: the whole hand on the host, this seat's view on a guest. */
  syncOnline() {
    const o = this.online;
    if (!o || !o.record || o.seat == null) return;
    const r = o.record;
    this.me = o.seat;
    if (this.lobby) this.lobbyShown = true;
    const previousRound = this.handNumber;
    this.handNumber = r.round;
    const v = o.isHost ? table.hostGame(o) : view(r, o.seat, o.mahjongTiles);
    if (v) {
      const before = this.game;
      const newHand = previousRound !== r.round;
      if (newHand || (this.lobbyShown && !this.lobby)) {
        this.lobbyShown = false;
        this.game = v;
        this.startReset(newHand ? before : null);
      }
      if (!newHand && v.steps.length > before.steps.length && before.steps.every((s, i) => M.stepCode(s) === M.stepCode(v.steps[i]))) {
        let b = before;
        for (const step of v.steps.slice(before.steps.length)) { this.sound(step, b); }
      }
      if (v.steps.length !== this.game.steps.length || v.phase !== this.game.phase || v.dealer !== this.game.dealer) this.replayAt = null;
      this.game = v;
    }
    const base = (r.mj && r.mj.scores) || [0, 0, 0, 0];
    this.scores = this.game.result ? base.map((s, i) => s + this.game.result.change[i]) : base;
    this.answered = this.answeredAt === this.game.steps.length ? new Set([this.me]) : new Set();
    if (this.game.phase === 'over') this.lifted = null;
    this.scheduleComputer();
    this.changed();
  }

  /** The host plays the computer seats, at the computer's pace. */
  scheduleComputer() {
    const o = this.online;
    if (!o || !o.isHost || !o.record) return;
    const seq = o.record.seq, token = ++this.token;
    if (!table.computerTurnDue(o)) { this.thinking = false; return; }
    this.thinking = true;
    setTimeout(() => {
      if (token !== this.token || !this.online || !this.online.record || this.online.record.seq !== seq) return;
      this.thinking = false;
      table.playComputerTurn(this.online);
    }, 700 + this.resetLeft);
  }
  deal0() { if (this.online) this.online.send('rematch'); }
}

/** The dealer's two dice for a hand (they say where the wall is broken). */
function dice(g) {
  if (!g.isOpenView) return [3, 4];
  let s = BigInt(g.dealer);
  for (const x of g.wall.slice(0, 12)) s = (s * 37n + BigInt(x + 1)) & ((1n << 64n) - 1n);
  const rng = new M.SplitMix(s);
  return [rng.below(6) + 1, rng.below(6) + 1];
}

// ── Words ─────────────────────────────────────────────────────────────────────

const levelName = (l) => ({ easy: t('easy', '简单'), normal: t('normal', '普通'), hard: t('hard', '困难') })[l];
const tileName = (x) => (app.lang === 'zh' ? NAMES.zh(x) : NAMES.en(x));

function seatName(model, seat) {
  if (seat === model.me) return t('You', '你');
  const online = model.onlineName(seat);
  if (online) return online;
  return [null, t('Right', '下家'), t('Across', '对家'), t('Left', '上家')][(seat - model.me + 4) % 4];
}

function turnText(model) {
  const g = model.game;
  if (model.lobby) return model.online.isHost ? t('Invite friends, then deal.', '邀请好友，然后发牌。') : t('Waiting for the host to deal…', '等房主发牌…');
  if (g.result) {
    const w = g.result.winner;
    if (w == null) return t('Wall empty: a drawn hand', '牌墙摸完：流局');
    return w === model.me ? t(`You win! +${g.result.change[w]}`, `你胡了！+${g.result.change[w]}`) : t(`${seatName(model, w)} wins`, `${seatName(model, w)}胡了`);
  }
  if (model.myClaims.length && g.lastDiscard) {
    return t(`${seatName(model, g.lastDiscard.from)} let go ${NAMES.en(g.lastDiscard.tile)}. Take it?`, `${seatName(model, g.lastDiscard.from)}打出${NAMES.zh(g.lastDiscard.tile)}，要吗？`);
  }
  if (model.isMyTurn) {
    if (g.drawn == null) return t('Your turn: let a tile go', '轮到你：打一张牌');
    return t(`You drew ${NAMES.en(g.drawn)}. Tap a tile twice to let it go`, `你摸到${NAMES.zh(g.drawn)}。点两下打出一张`);
  }
  if (g.phase === 'claims') return t('Waiting for claims…', '等待吃碰…');
  return t(`${seatName(model, g.turn)} to play`, `轮到${seatName(model, g.turn)}`);
}

function coachText(model) {
  const a = model.advice;
  if (!a) return null;
  const zh = app.lang === 'zh';
  switch (a.kind) {
    case 'win': return t('Win now!', '可以胡牌了！');
    case 'claim': {
      let what;
      if (a.claim === 'win') what = ['Win', '胡'];
      else if (a.claim === 'kong') what = ['Kong', '杠'];
      else if (a.claim === 'pung') what = ['Pung', '碰'];
      else { const run = [a.claim.chow, a.claim.chow + 1, a.claim.chow + 2].map((x) => NAMES.short(x, zh)); what = [`Chow ${run.join('-')}`, `吃${run.join('')}`]; }
      const after = a.shanten === 0 ? t('it makes you ready', '之后就听牌了') : t('it brings you closer', '能离胡牌更近');
      return t(`${what[0]}: ${after}.`, `可以${what[1]}：${after}。`);
    }
    case 'pass': return t('Pass: taking it doesn\'t help.', '建议「过」：要了也不更接近胡牌。');
    case 'stayConcealed': return t('Pass for now: a concealed hand scores more, and it\'s early.', '建议先「过」：还早，门清多一番。');
    default: {
      const list = a.useful.slice(0, 5).map((x) => NAMES.short(x, zh)).join(zh ? '、' : ' ');
      if (a.shanten === 0) return t(`Let ${tileName(a.tile)} go: ready, waiting on ${list}, ${a.count} left.`, `打${tileName(a.tile)}就听牌，等${list}，剩 ${a.count} 张。`);
      const away = a.shanten === 1 ? t('1 from ready', '一向听') : t(`${a.shanten} from ready`, `${chineseNumber(a.shanten)}向听`);
      return t(`Let ${tileName(a.tile)} go: ${away}, ${a.count} tiles help (${list}).`, `打${tileName(a.tile)}：${away}，${a.count} 张能进张（${list}）。`);
    }
  }
}

const FAN_NAMES = { win: ['Win', '胡'], selfDraw: ['Self-drawn', '自摸'], concealed: ['Concealed', '门清'], allPungs: ['All pungs', '碰碰胡'],
  sevenPairs: ['Seven pairs', '七对'], oneSuit: ['One suit', '清一色'], kongBloom: ['Kong bloom', '杠上开花'], lastTile: ['Last tile', '海底捞月'] };

function resultSummary(model) {
  const r = model.result, g = model.game;
  if (!r) return '';
  let html = '';
  if (r.winner != null) {
    const how = r.from == null ? t('self-drawn', '自摸') : t(`on ${seatName(model, r.from)}'s tile`, `${seatName(model, r.from)}点炮`);
    html += `<div class="result">${esc(t(`${seatName(model, r.winner)} won, ${how}`, `${seatName(model, r.winner)}胡牌，${how}`))}</div>`;
    html += `<div class="note">${esc(r.fans.map((f) => `${t(...FAN_NAMES[f])} ${M.FAN_VALUE[f]}`).join(' · '))}</div>`;
  } else html += `<div class="result">${esc(t('Drawn hand: nobody pays.', '流局：无人输赢。'))}</div>`;
  html += '<div class="mj-change">' + [0, 1, 2, 3].map((s) => {
    const v = r.change[s];
    const place = s === model.me ? t('You', '你') : [null, t('Right', '下家'), t('Across', '对家'), t('Left', '上家')][(s - model.me + 4) % 4];
    return `<div><small>${esc(place)}</small><b class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' + v : v}</b></div>`;
  }).join('') + '</div>';
  const next = M.nextDealer(g.dealer, r);
  html += `<div class="note muted">${esc(next === g.dealer ? t(`${seatName(model, next)} deals again.`, `${seatName(model, next)}连庄。`) : t(`${seatName(model, next)} deals next.`, `下一局由${seatName(model, next)}坐庄。`))}</div>`;
  return `<div class="panel">${html}</div>`;
}

function seatsPanel(model, withNote = true) {
  const o = app.online;
  if (!o || !o.info) return '';
  const comps = table.computers(o);
  let rows = '';
  for (let seat = 0; seat < 4; seat++) {
    const pid = o.info.seats[String(seat)];
    const me = seat === o.seat;
    const away = pid != null && !me && comps.has(seat);
    const wind = (seat - model.game.dealer + 4) % 4;
    const ready = o.record && o.record.rematch[String(seat)] === true && model.isOver;
    const who = me ? t('You', '你') : pid == null ? t('Computer', '电脑') : away ? t('Friend (away: computer plays)', '好友（离开中，电脑代打）') : t('Friend', '好友');
    rows += `<div class="mj-seat"><span class="wind${wind === 0 ? ' east' : ''}">${'东南西北'[wind]}</span><span class="${pid == null ? 'muted' : ''}">${esc(who)}</span>
      ${ready ? `<b class="ready">${esc(t('ready', '已准备'))}</b>` : ''}${pid != null ? `<i class="dot ${away ? 'away' : ''}"></i>` : ''}</div>`;
  }
  return `<div class="panel"><div class="room-line"><span class="dot" style="background:${o.connected ? 'var(--green)' : 'var(--danger)'}"></span><span class="label">${esc(t('ROOM', '房间'))}</span>
    <span class="code">${esc(o.code || '')}</span><button class="invite" data-act="oInvite">${icon('share')}${esc(t('Invite', '邀请'))}</button></div>
    ${o.connected ? '' : `<div class="room-status warn">${esc(t('Reconnecting…', '正在重新连接…'))}</div>`}
    <div class="mj-seats">${rows}</div>
    ${withNote ? `<div class="note muted">${esc(t('Up to four people, on the web or in the Qi app. Computers play the empty seats, and anyone who is away until they\'re back. Each player\'s tiles are sealed to them alone.', '最多四人，网页和 Qi 应用都能加入。空位由电脑来打，有人离开时电脑也会替他打，回来即可接手。每个人的牌都只加密发给本人。'))}</div>` : ''}</div>`;
}

// ── The table, drawn ──────────────────────────────────────────────────────────

/** Where everything goes, from the table's size (MahjongTable.Geometry). */
function geometry(W, H) {
  const r = Math.max(9, Math.min(W / 23.6, H / 14));
  const h = r / ASPECT, gap = r * 0.15, band = r * 0.8 / ASPECT, cw = 4 * r, ch = 4 * r;
  return { W, H, r, h, gap, band, cw, ch, longRiver: 10 * r, cx: W / 2, cy: band + 2 * gap + 3 * h + ch / 2 + (H - (band + 4 * gap + 6 * h + ch)) / 2 };
}
const ANGLE = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

function drawMeld(ctx, meld, x, y, w, index) {
  M.meldTiles(meld).forEach((tl, i) => drawTile(ctx, meld.kind === 'hiddenKong' && (i === 0 || i === 3) ? null : tl, x + i * w, y, w, { index }));
  return 4 * 0 + M.meldTiles(meld).length * w;
}

function drawLayout(ctx, g, m, model, index) {
  for (let seat = 0; seat < 4; seat++) {
    const pos = (seat - model.me + 4) % 4;
    const long = pos % 2 === 0;
    const perRow = long ? 10 : 4;
    const depth = (long ? 3 : 6) * m.h;
    const center = [[m.cx, m.cy + m.ch / 2 + m.gap + depth / 2], [m.cx + m.cw / 2 + m.gap + depth / 2, m.cy],
      [m.cx, m.cy - m.ch / 2 - m.gap - depth / 2], [m.cx - m.cw / 2 - m.gap - depth / 2, m.cy]][pos];
    // The river: rows of discards, the seat's own way round.
    ctx.save();
    ctx.translate(center[0], center[1]);
    ctx.rotate(ANGLE[pos]);
    ctx.translate(-perRow * m.r / 2, -depth / 2);
    const tiles = g.rivers[seat];
    const last = g.lastDiscard && g.lastDiscard.from === seat;
    tiles.forEach((rv, i) => {
      const x = (i % perRow) * m.r, y = Math.floor(i / perRow) * m.h;
      drawTile(ctx, rv.tile, x, y, m.r, { index, dim: rv.claimed });
      if (last && i === tiles.length - 1) { ctx.strokeStyle = COL.gold; ctx.lineWidth = Math.max(1.5, m.r / 9); ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, m.r - ctx.lineWidth, m.h - ctx.lineWidth); }
    });
    ctx.restore();
    if (pos === 0) continue;
    // Another player's edge: their hand face down (face up once it's over), then their melds.
    const tile = long ? m.r * 0.8 : Math.min(m.r * 0.8, (m.H - 2 * m.band) / 17);
    const th = tile / ASPECT;
    const open = model.reveal || g.phase === 'over';
    const melds = g.melds[seat];
    const handW = g.hands[seat].length * tile;
    const meldW = melds.reduce((s, md) => s + M.meldTiles(md).length * tile * 0.92, 0) + melds.length * tile * 0.35;
    const total = handW + meldW;
    const edge = [null, [m.W - m.band / 2 - m.gap * 2, m.cy], [m.cx, m.band / 2 + m.gap], [m.band / 2 + m.gap * 2, m.cy]][pos];
    ctx.save();
    ctx.translate(edge[0], edge[1]);
    ctx.rotate(ANGLE[pos]);
    let x = -total / 2;
    g.hands[seat].forEach((tl) => { drawTile(ctx, open ? tl : null, x, -th / 2, tile, { index }); x += tile; });
    for (const md of melds) {
      x += tile * 0.35;
      const w = tile * 0.92;
      drawMeld(ctx, md, x, th / 2 - w / ASPECT, w, index);
      x += M.meldTiles(md).length * w;
    }
    ctx.restore();
  }
}

/** The middle, like an automatic table's display: the tiles left, and each seat's wind and score. */
function drawCenter(ctx, g, m, model) {
  const u = m.ch, x0 = m.cx - m.cw / 2, y0 = m.cy - m.ch / 2;
  roundRect(ctx, x0, y0, m.cw, m.ch, u * 0.1);
  ctx.fillStyle = '#061a1c';
  ctx.fill();
  ctx.strokeStyle = COL.gridLine;
  ctx.lineWidth = Math.max(1, u / 50);
  ctx.stroke();
  if (model.lobby) return;
  pixelText(ctx, String(g.wallLeft), m.cx, m.cy, u * 0.028 * 7, COL.green);
  for (let seat = 0; seat < 4; seat++) {
    const pos = (seat - model.me + 4) % 4;
    const wind = (seat - g.dealer + 4) % 4;
    const toMove = g.phase !== 'over' && g.turn === seat;
    const v = model.scores[seat];
    ctx.save();
    ctx.translate(m.cx, m.cy);
    ctx.rotate(ANGLE[pos]);
    const inset = m.ch / 2 - u * 0.15;
    const gs = u * 0.15;
    glyph(ctx, '东南西北'[wind], -gs * 1.4, inset - gs * 0.62, gs, wind === 0 ? COL.gold : 'rgba(255,255,255,.75)');
    pixelText(ctx, v > 0 ? `+${v}` : String(v), gs * 0.65, inset - gs * 0.12, u * 0.022 * 7, toMove ? COL.green : 'rgba(255,255,255,.7)');
    if (toMove) { ctx.fillStyle = COL.green; ctx.fillRect(-u * 0.45 / 2 * 1.4, inset + gs * 0.5, u * 0.63, Math.max(1.5, u * 0.025)); }
    ctx.restore();
  }
  const r = g.result;
  if (r && model.review == null) {
    roundRect(ctx, m.cx - m.cw * 0.485, m.cy - m.ch * 0.47, m.cw * 0.97, m.ch * 0.94, u * 0.1);
    ctx.fillStyle = 'rgba(6,26,28,.96)';
    ctx.fill();
    const word = r.winner == null ? '流局' : r.from == null ? '自摸' : '胡';
    const size = u * (word.length > 1 ? 0.3 : 0.42);
    const color = r.winner == null ? 'rgba(255,255,255,.8)' : COL.gold;
    const top = m.cy - (r.winner != null ? size * 0.75 : size / 2);
    [...word].forEach((ch, i) => glyph(ctx, ch, m.cx - (word.length * size * 1.05) / 2 + i * size * 1.05, top, size, color));
    if (r.winner != null) pixelText(ctx, `${r.points} FAN`, m.cx, top + size + u * 0.12, u * 0.028 * 7, '#fff');
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function pixelText(ctx, text, x, y, size, color) {
  ctx.font = `${Math.max(6, size)}px 'Plank Pixel', ui-monospace, monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawFelt(ctx, W, H) {
  const px = Math.max(2, Math.min(W, H) / 110);
  roundRect(ctx, 0, 0, W, H, px * 3);
  ctx.fillStyle = COL.waterDark;
  ctx.fill();
  ctx.fillStyle = COL.water;
  for (let y = px * 2; y < H - px * 2; y += px * 10) for (let x = px * 2; x < W - px * 2; x += px * 10) ctx.fillRect(x, y, px * 2, px * 2);
  roundRect(ctx, px / 2, px / 2, W - px, H - px, px * 3);
  ctx.strokeStyle = COL.gridLine;
  ctx.lineWidth = px;
  ctx.stroke();
}

/** What the automatic table does between hands, `t` ms into its reset. */
function drawMachine(ctx, t, diceFaces, m) {
  const u = m.ch, s = t / 1000;
  roundRect(ctx, m.cx - m.cw / 2, m.cy - m.ch / 2, m.cw, m.ch, u * 0.1);
  ctx.fillStyle = '#061a1c'; ctx.fill();
  ctx.strokeStyle = COL.gridLine; ctx.lineWidth = Math.max(1, u / 50); ctx.stroke();
  const open = s < 0.3 ? 0 : s < 0.6 ? (s - 0.3) / 0.3 : s < 1.55 ? 1 : s < 1.75 ? 1 - (s - 1.55) / 0.2 : 0;
  if (open > 0) {
    const side = u * 0.8 * open;
    ctx.fillStyle = '#000';
    ctx.fillRect(m.cx - side / 2, m.cy - side / 2, side, side);
    if (s > 0.55 && s < 1.7) {
      const rng = new M.SplitMix(BigInt(Math.floor(s * 24)));
      const bit = Math.max(2, side / 9);
      for (let i = 0; i < 14; i++) {
        const x = m.cx - side / 2 + rng.below(1000) / 1000 * (side - bit), y = m.cy - side / 2 + rng.below(1000) / 1000 * (side - bit * 1.3);
        ctx.fillStyle = rng.below(3) === 0 ? 'rgba(239,231,210,.8)' : COLORS.jade;
        ctx.fillRect(x, y, bit, bit * 1.3);
      }
    }
  }
  if (s >= 1.75) {
    // Four walls, 17 stacks of two, in a pinwheel; each stack rises a moment after its neighbour.
    const rise = Math.min(1, (s - 1.75) / 0.5), fade = s < 2.95 ? 1 : Math.max(0, 1 - (s - 2.95) / 0.4);
    const side = Math.min(m.longRiver * 1.02, m.H - 2 * m.band - 2 * m.gap);
    const sw = side / 18.2, wd = sw * 1.25;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(m.cx, m.cy);
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.rotate(k * Math.PI / 2);
      for (let i = 0; i < 17; i++) {
        const up = Math.max(0, Math.min(1, rise * 1.6 - i * 0.035));
        if (up <= 0) continue;
        const x = -side / 2 + i * sw, y = side / 2 - wd, h = wd * up;
        ctx.fillStyle = COLORS.jade; ctx.fillRect(x + sw * 0.05, y + wd - h, sw * 0.9, h);
        ctx.fillStyle = COLORS.jadeLight; ctx.fillRect(x + sw * 0.05, y + wd - h, sw * 0.9, Math.max(1, h * 0.18));
        ctx.fillStyle = COLORS.jadeDark; ctx.fillRect(x + sw * 0.05, y + wd - h + h * 0.55, sw * 0.9, Math.max(0.8, h * 0.08));
      }
      ctx.restore();
    }
    ctx.restore();
  }
  if (s >= 2.3) {
    // The clear dome with the two dice: tumbling, then still on the roll.
    const fade = s < 3.0 ? 1 : Math.max(0, 1 - (s - 3.0) / 0.35);
    const r = m.ch * 0.38;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.beginPath(); ctx.arc(m.cx, m.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, r / 18); ctx.stroke();
    ctx.beginPath(); ctx.arc(m.cx, m.cy, r * 0.78, 200 * Math.PI / 180, 250 * Math.PI / 180);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = Math.max(1, r / 14); ctx.stroke();
    const still = s >= 2.9;
    const rng = new M.SplitMix(BigInt(Math.floor(s * 14)));
    const d = r * 0.62;
    diceFaces.forEach((faceN, i) => {
      const jx = still ? 0 : (rng.below(100) - 50) / 100 * r * 0.4, jy = still ? 0 : (rng.below(100) - 50) / 100 * r * 0.4;
      die(ctx, m.cx + (i === 0 ? -d * 0.62 : d * 0.62) - d / 2 + jx, m.cy - d / 2 + jy, d, still ? faceN : rng.below(6) + 1);
    });
    ctx.restore();
  }
}
function die(ctx, x, y, w, faceN) {
  const u = w / 7;
  ctx.fillStyle = COLORS.ivory;
  ctx.fillRect(x + u, y, 5 * u, 7 * u);
  ctx.fillRect(x, y + u, 7 * u, 5 * u);
  const spots = { 1: [[3, 3]], 2: [[1, 1], [5, 5]], 3: [[1, 1], [3, 3], [5, 5]], 4: [[1, 1], [5, 1], [1, 5], [5, 5]], 5: [[1, 1], [5, 1], [3, 3], [1, 5], [5, 5]], 6: [[1, 1], [5, 1], [1, 3], [5, 3], [1, 5], [5, 5]] }[faceN];
  ctx.fillStyle = faceN === 1 || faceN === 4 ? COLORS.red : COLORS.navy;
  for (const [sx, sy] of spots) ctx.fillRect(x + sx * u, y + sy * u, u, u);
}

// ── The screen ────────────────────────────────────────────────────────────────

export const model = new MahjongModel();

class MahjongScreen extends GameScreen {
  constructor() { super('mahjong', model); this.root.classList.add('mj'); }

  makeBoard() {
    this.wrap.innerHTML = '<div class="mj-table"><canvas class="mj-canvas"></canvas><div class="mj-actions"></div><div class="mj-lobby"></div></div><div class="mj-hand"></div>';
    this.canvas = this.wrap.querySelector('.mj-canvas');
    this.tableEl = this.wrap.querySelector('.mj-table');
    this.actionsEl = this.wrap.querySelector('.mj-actions');
    this.lobbyEl = this.wrap.querySelector('.mj-lobby');
    this.handEl = this.wrap.querySelector('.mj-hand');
    this.ro = new ResizeObserver(() => { if (this.three && app.view3D('mahjong') !== 'off') this.update3D(); else this.draw(); });
    this.ro.observe(this.tableEl);
    this.canvas.addEventListener('click', () => { if (model.resetting) model.skipReset(); });
    this.wrap.addEventListener('click', (e) => {
      const el = e.target.closest('[data-mj]');
      if (!el) return;
      const [a, v] = el.dataset.mj.split(':');
      if (a === 'tile') model.tap(Number(v));
      else if (a === 'self') model.selfDraw();
      else if (a === 'kong') model.kong(Number(v));
      else if (a === 'claim') model.answer(v === 'x' ? null : v === 'win' || v === 'kong' || v === 'pung' ? v : { chow: Number(v) });
      else if (a === 'deal') model.deal0();
      else if (a === 'next') model.nextHand();
    });
    this.board = { destroy: () => { this.ro.disconnect(); cancelAnimationFrame(this.frame); } };
  }

  reviewLength() { return model.game.steps.length; }
  title() { return t('MAHJONG', '麻将'); }
  subtitle() { return t(`Chinese rules · hand ${model.handNumber}`, `推倒胡 · 第 ${model.handNumber} 局`) + (model.isOnline ? t(' · online', ' · 在线') : ''); }

  updateBoard() {
    this.update3D();
    if (!(this.three && app.view3D('mahjong') !== 'off')) this.draw();
    this.renderHand();
    this.renderActions();
    this.renderLobby();
  }

  draw() {
    const c = this.canvas, box = this.tableEl.getBoundingClientRect();
    const W = Math.floor(box.width), H = Math.floor(box.height);
    if (W <= 0 || H <= 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const m = geometry(W, H);
    drawFelt(ctx, W, H);
    const g = model.shown, index = app.lang === 'en';
    const now = performance.now();
    const rs = model.reset, tt = rs ? now - rs.start : Infinity;
    let animating = false;
    if (rs && tt < 600 && rs.previous) {
      // The old hand swept into the middle.
      const p = tt / 600;
      ctx.save();
      ctx.globalAlpha = 1 - p * p;
      ctx.translate(m.cx, m.cy);
      ctx.scale(1 - 0.85 * p * p, 1 - 0.85 * p * p);
      ctx.translate(-m.cx, -m.cy);
      drawLayout(ctx, rs.previous, m, model, index);
      ctx.restore();
    }
    if (!model.lobby && tt >= RESET - 450) {
      ctx.save();
      ctx.globalAlpha = isFinite(tt) ? Math.min(1, (tt - (RESET - 450)) / 400) : 1;
      drawLayout(ctx, g, m, model, index);
      ctx.restore();
    }
    if (rs && tt < RESET) { drawMachine(ctx, tt, rs.dice, m); animating = true; }
    else drawCenter(ctx, g, m, model);
    // The call, big for a moment by the seat that made it.
    const call = model.called;
    if (call && now - call.at < 1300) {
      const pos = (call.seat - model.me + 4) % 4;
      const dx = m.cw / 2 + 2.5 * m.h, dy = m.ch / 2 + 1.5 * m.h;
      const [x, y] = [[m.cx, m.cy + dy], [m.cx + dx, m.cy], [m.cx, m.cy - dy], [m.cx - dx, m.cy]][pos];
      const k = now - call.at < 900 ? 0 : (now - call.at - 900) / 400;
      const size = m.r * 2.6 * (1 + 0.3 * k);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = size * 0.1; ctx.shadowOffsetY = size * 0.03;
      glyph(ctx, call.claim === 'win' ? '胡' : call.claim === 'kong' ? '杠' : call.claim === 'pung' ? '碰' : '吃', x - size / 2, y - size / 2, size, COL.gold);
      ctx.restore();
      animating = true;
    }
    if (animating && !this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); if (!model.resetting) this.renderHand(); });
  }

  renderHand() {
    const g = model.shown, me = model.me, el = this.handEl;
    if (model.lobby || (model.reset && performance.now() - model.reset.start < RESET - 450)) { el.innerHTML = ''; return; }
    const concealed = g.handWithoutDrawn(me);
    const drawn = g.turn === me && g.phase !== 'over' ? g.drawn : null;
    const meldTiles = g.melds[me].reduce((s, md) => s + M.meldTiles(md).length, 0);
    const box = el.getBoundingClientRect();
    const slots = concealed.length + (drawn == null ? 0 : 1) + meldTiles * 0.72 + 1.6;
    const w = Math.max(14, Math.min((box.height || 60) * 0.72 * ASPECT / 0.62 * 0.62, (box.width - 8) / slots, 54));
    const a = model.advice;
    const suggestion = a && a.kind === 'discard' ? a.tile : null;
    const index = app.lang === 'en';
    const can = model.isMyTurn;
    const tileBtn = (tl, mark, lifted) => `<button class="mj-tile${lifted ? ' lifted' : ''}${mark ? ' mark' : ''}" data-mj="tile:${tl}" ${can ? '' : 'disabled'}
      aria-label="${esc(tileName(tl))}" style="width:${w}px"><img src="${tileURL(tl, { index })}" alt="" width="${w}" height="${w / ASPECT}"></button>`;
    let html = '<div class="mj-row">';
    concealed.forEach((tl, i) => {
      const first = concealed.indexOf(tl) === i;
      html += tileBtn(tl, suggestion === tl && first && drawn !== tl, model.lifted === tl && first && drawn !== tl);
    });
    html += '</div>';
    if (drawn != null) html += `<div class="mj-row drawn">${tileBtn(drawn, suggestion === drawn, model.lifted === drawn)}</div>`;
    for (const md of g.melds[me]) {
      html += '<div class="mj-row meld">' + M.meldTiles(md).map((tl, i) => `<img src="${tileURL(md.kind === 'hiddenKong' && (i === 0 || i === 3) ? -1 : tl, { index })}" alt="" width="${w * 0.72}" height="${w * 0.72 / ASPECT}">`).join('') + '</div>';
    }
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    el.style.setProperty('--gap', `${w * 0.4}px`);
  }

  renderActions() {
    const claims = model.myClaims;
    const a = model.advice;
    const pick = a && a.kind === 'claim' ? a.claim : null;
    const index = app.lang === 'en';
    const act = (glyphs, label, mj, { tiles = [], prominent = false, quiet = false } = {}) => `<button class="mj-act${prominent ? ' prominent' : ''}${quiet ? ' quiet' : ''}" data-mj="${mj}" aria-label="${esc(label)}">
      ${glyphs ? `<span class="g" data-glyph="${glyphs}"></span>` : `<b>${esc(label)}</b>`}<span class="sub">${tiles.length ? `<span class="ts">${tiles.map((x) => `<img src="${tileURL(x, { index })}" alt="" width="13" height="18">`).join('')}</span>` : ''}${glyphs && app.lang === 'en' ? `<small>${esc(label)}</small>` : ''}</span></button>`;
    let html = '';
    if (model.lobby && app.online && app.online.isHost) html += act('', t('Deal', '开局'), 'deal', { prominent: true });
    if (model.canSelfDraw) html += act('胡', t('Win', '自摸'), 'self', { prominent: true });
    for (const k of model.kongOptions) html += act('杠', t('Kong', '杠'), `kong:${k}`, { tiles: [k] });
    if (claims.includes('win')) html += act('胡', t('Win', '胡'), 'claim:win', { prominent: true });
    if (claims.includes('kong')) html += act('杠', t('Kong', '杠'), 'claim:kong', { prominent: pick === 'kong' });
    if (claims.includes('pung')) html += act('碰', t('Pung', '碰'), 'claim:pung', { prominent: pick === 'pung' });
    for (const c of claims) if (typeof c === 'object') html += act('吃', t('Chow', '吃'), `claim:${c.chow}`, { tiles: [c.chow, c.chow + 1, c.chow + 2], prominent: !!pick && typeof pick === 'object' && pick.chow === c.chow });
    if (claims.length) html += act('过', t('Pass', '过'), 'claim:x', { quiet: true });
    if (this.actionsEl.dataset.html === html) return;
    this.actionsEl.innerHTML = html;
    this.actionsEl.dataset.html = html;
    this.actionsEl.querySelectorAll('[data-glyph]').forEach((s) => {
      const text = s.dataset.glyph, size = 22;
      const c = document.createElement('canvas');
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.round(size * text.length * 1.05 * dpr); c.height = Math.round(size * dpr);
      c.style.width = size * text.length * 1.05 + 'px'; c.style.height = size + 'px';
      const ctx = c.getContext('2d');
      [...text].forEach((ch, i) => glyph(ctx, ch, i * size * 1.05 * dpr, 0, size * dpr, getComputedStyle(s.closest('.mj-act')).color));
      s.appendChild(c);
    });
  }

  renderLobby() {
    if (!model.lobby) { this.lobbyEl.innerHTML = ''; this.lobbyEl.dataset.html = ''; this.lobbyEl.hidden = true; return; }
    this.lobbyEl.hidden = false;
    const html = `<div class="mj-lobby-card"><div class="mj-title" data-glyph="麻将"></div>${seatsPanel(model, false)}
      <p>${esc(app.online.isHost ? t('Deal when your friends are in: the empty seats get computer players.', '好友到齐就开局：空位由电脑补上。') : t('Waiting for the host to deal…', '等房主开局…'))}</p></div>`;
    if (this.lobbyEl.dataset.html === html) return;
    this.lobbyEl.innerHTML = html;
    this.lobbyEl.dataset.html = html;
    const s = this.lobbyEl.querySelector('[data-glyph]');
    const c = document.createElement('canvas');
    const dpr = Math.min(3, window.devicePixelRatio || 1), size = 30;
    c.width = Math.round(size * 2.1 * dpr); c.height = Math.round(size * dpr);
    c.style.width = size * 2.1 + 'px'; c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ['麻', '将'].forEach((ch, i) => glyph(ctx, ch, i * size * 1.05 * dpr, 0, size * dpr, COL.gold));
    s.appendChild(c);
  }

  bodyHTML() {
    const g = model.game, online = model.isOnline;
    let html = `<div class="panel"><div class="mj-kicker">${esc(t(`MAHJONG · hand ${model.handNumber}`, `麻将 · 第 ${model.handNumber} 局`))}</div>
      <div class="status-line ${model.isOver ? 'over' : ''}"><span>${esc(turnText(model))}</span></div>
      <div class="meta"><span>${esc((online ? t(`online · room ${app.online.code || ''}`, `在线 · 房间 ${app.online.code || ''}`) : t(`computers ${levelName(model.level)}`, `推倒胡 · 电脑${levelName(model.level)}`)) + t(` · wall ${g.wallLeft}`, ` · 余 ${g.wallLeft}`))}</span></div></div>`;
    if (online) html += seatsPanel(model);
    if (model.result) html += resultSummary(model);
    if (model.isOver && g.steps.length) html += replayPanel(this, g.steps.length, model.review);
    const text = coachText(model);
    if (text) html += `<div class="panel coach">${icon('bulb')}<div>${esc(text)}</div></div>`;
    let row = '';
    if (model.isOver) row += btn('next', t('Next hand', '下一局'), 'mjNext', { prominent: model.canDealNext });
    row += btn('bulb', t('Coach', '教练'), 'coach', { active: model.coach });
    if (!online) row += btn('plus', t('New game', '新对局'), 'newMenu');
    html += `<div class="btn-row">${row}</div>`;
    html += `<div class="btn-row">${btn('cube', '3D', 'mj3d', { active: app.view3D('mahjong') !== 'off' })}${btn('board', t('Board: ' + ({ stone: 'Stone', wood: 'Wood', water: 'Water', steel: 'Steel', sky: 'Sky', soil: 'Garden' })[app.theme], '棋盘：' + ({ stone: '石', wood: '木', water: '水', steel: '钢', sky: '星空', soil: '菜园' })[app.theme]), 'boardMenu')}</div>`;
    return html;
  }

  extraAct(a) {
    if (a === 'mjNext') model.nextHand();
    else if (a === 'mj3d') app.set3D('mahjong', app.view3D('mahjong') === 'off' ? 'side' : 'off');
  }

  /** No window at the top of the rail: in 3D the table itself is 3D, your hand stays below. */
  windowHTML() { return ''; }

  /** The 3D table (three.js loads the first time 3D is on). */
  update3D() {
    const on = app.view3D('mahjong') !== 'off';
    this.canvas.style.visibility = on && this.three ? 'hidden' : '';
    if (!on) { if (this.host3d) this.host3d.style.display = 'none'; return; }
    if (!this.three) {
      if (!this.loading3d) {
        this.loading3d = Promise.all([import('./three/world.js?v=7'), import('./three/mahjong3d.js?v=7')]).then(([world, mj]) => {
          try {
            const view = new world.BoardView();
            const content = new mj.Mahjong3DScene(view);
            view.scene = content.scene;
            view.onTap = () => { if (model.resetting) model.skipReset(); };
            this.host3d = document.createElement('div');
            this.host3d.className = 'mj-3d';
            this.tableEl.insertBefore(this.host3d, this.actionsEl);
            view.attach(this.host3d);
            this.three = { view, content, SPAN: mj.SPAN };
            const destroy = this.board.destroy;
            this.board.destroy = () => { view.dispose(); destroy(); };
            this.updateBoard();
          } catch (e) { this.failed3d = true; }
        }).catch(() => { this.failed3d = true; });
      }
      return;
    }
    this.host3d.style.display = '';
    const g = model.shown;
    const T3 = this.three;
    // The app frames the table for a wide window; in a squarer one, step back until the near
    // hand fits as it would there.
    const box = this.tableEl.getBoundingClientRect();
    const fit = Math.max(1, 1.75 / Math.max(0.5, box.width / Math.max(1, box.height)));
    const built = T3.content.show({ game: g, me: model.me, open: model.reveal || g.phase === 'over', index: app.lang === 'en', reset: model.reset }, app.theme);
    if (built || T3.fit !== fit) {
      T3.fit = fit;
      T3.view.surfaceY = T3.content.top;
      T3.view.target.set(0, T3.content.top, 0.9);
      T3.view.setHome({ azimuth: 0, elevation: 52, distance: T3.SPAN * 1.32 * fit }, false);
    }
  }

  act(a, arg) {
    if (a === 'coach') { model.coach = !model.coach; model.changed(); return; }
    super.act(a, arg);
  }

  newGameSheet() {
    let html = sheetHead(t('New game', '新对局')) + `<h3>${esc(t('New game: computers', '新对局：电脑'))}</h3>`;
    html += M.LEVELS.map((l) => `<button class="option${l === model.level ? ' on' : ''}" data-act="level" data-arg="${l}">${l === model.level ? icon('check') : '<span class="tick"></span>'}<span>${esc(levelName(l))}</span></button>`).join('');
    if (hooks.openOnline) html += `<button class="option" data-act="online">${icon('globe')}<span>${esc(t('Friends online…', '在线好友…'))}</span></button>`;
    sheet(html, { small: true, actions: { level: (l) => { closeSheet(); this.stopReplay(); model.newGame(l); }, online: () => { closeSheet(); hooks.openOnline('mahjong'); } } });
  }

  decorate() { super.decorate(); }
}

// ── Rules ─────────────────────────────────────────────────────────────────────

function tileRule(list, title, text) {
  const index = app.lang === 'en';
  return `<div class="rule"><div class="mj-rule-tiles">${list.map((x) => `<img src="${tileURL(x, { index })}" alt="" width="${list.length > 3 ? 11 : 14}" height="${(list.length > 3 ? 11 : 14) / ASPECT}">`).join('')}</div><div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`;
}
function rule(iconName, title, text) { return `<div class="rule">${icon(iconName)}<div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`; }

RULES.mahjong = () => [
  tileRule([0, 13, 26], t('The tiles', '牌'), t('136 tiles, four of each. Three suits numbered 1 to 9: characters (萬), dots (筒) and bamboo (条; the 1 is a bird). Then the honours: the four winds 東南西北 and the three dragons, red 中, green 發 and white 白. No flowers. In English each suited tile carries its number in the corner.', '共 136 张，每种四张。三门数牌各一到九：万、筒、条（一条是一只鸟）。再加字牌：东南西北四风，和中、发、白三元。不用花牌。')),
  rule('again', t('Draw, then let one go', '摸一张，打一张'), t('Four players, 13 tiles each; the dealer (East, 庄) starts with 14 and lets one go first. Then, in turn to the right, each player draws a tile from the wall and lets one go. Tap a tile to lift it, tap it again to let it go.', '四人各 13 张，庄家（东）先拿 14 张并先打出一张。之后按逆时针轮流：从牌墙摸一张，再打出一张。点一下把牌抬起，再点一下打出。')),
  tileRule([0, 1, 2], t('Sets', '顺子、刻子、杠'), t('A chow (吃) is three in a row in one suit, a pung (碰) three the same, a kong (杠) four the same. Honours make pungs and kongs, never chows.', '顺子是同一门连着的三张（吃），刻子是三张相同（碰），杠是四张相同。字牌只能成刻子或杠，不能成顺子。')),
  rule('pass', t('Taking a discard', '吃、碰、杠'), t('You may take a tile someone lets go to finish a set: a chow only from the player on your left (上家), a pung or kong from anyone. A claimed set lies face up and it is your turn to let a tile go. If several players want the same tile, a win comes first, then a pung or kong, then a chow.', '别人打出的牌可以拿来凑成一组：只能吃上家的牌，碰和杠谁的都行。吃碰杠的牌亮在桌上，然后由你打一张。几家同时要同一张牌时，胡优先，其次碰或杠，最后吃。')),
  rule('cube', t('Kongs', '杠'), t('Four the same from your hand is a concealed kong; three in your hand and a discard, an exposed kong; the fourth tile added to your pung, an added kong. Every kong draws a replacement tile from the back of the wall.', '手里四张相同是暗杠；手里三张加别人打的一张是明杠；碰过的牌再摸到第四张可以补杠。每次开杠都从牌墙尾部补摸一张。')),
  tileRule([18, 18, 31, 31, 31], t('Winning (胡)', '胡牌'), t('Four sets and a pair, or seven pairs (七对; four the same count as two pairs), with a tile you draw (自摸) or one anyone lets go. If two players can win on the same tile, the first after the player who let it go takes it.', '四组加一对将，或七对（四张相同算两对）。可以自摸，也可以胡任何人打出的牌。两家同时能胡同一张时，由打牌者之后最先轮到的那家胡。')),
  rule('plus', t('Fans and points', '番与计分'), t('A win scores its fans added up: 胡 1, self-drawn (自摸) +1, a concealed hand with no claimed tile (门清) +1, all pungs (碰碰胡) +2, seven pairs (七对) +2, one suit only (清一色) +3, won with the tile after a kong (杠上开花) +1, won with the wall\'s last tile (海底捞月) +1. Self-drawn, each of the other three pays the points; on a discard, the player who let it go pays alone.', '胡牌按番数相加计分：胡 1 番，自摸 +1，门清（没有吃碰明杠）+1，碰碰胡 +2，七对 +2，清一色 +3，杠上开花 +1，海底捞月 +1。自摸由其他三家各付；点炮由打出那张牌的人一人付。')),
  rule('replay', t('A drawn hand, the next dealer', '流局与坐庄'), t('When the wall runs out, the last tile let go can only be won; otherwise the hand is drawn (流局) and nobody pays. The dealer deals again after winning or a drawn hand; otherwise the deal passes to the right.', '牌墙摸完后，最后打出的那张只能用来胡；没人胡就是流局，无人输赢。庄家胡牌或流局则连庄，否则下家坐庄。')),
  rule('bulb', t('The coach', '教练'), t('With the coach on, a gold arrow marks the tile to let go, and the rail says why: how many tiles you are from ready (向听), and how many unseen tiles would help. When someone lets a tile go that you could take, it says whether taking it is worth it.', '开启教练后，金色箭头标出建议打的牌，侧栏说明原因：离听牌还差几步（向听），还有多少张没见过的牌能进张。别人打出你能吃碰的牌时，也会告诉你值不值得要。')),
  rule('flag', t('Computer levels', '电脑难度'), t('Easy keeps its hand in shape but plays loosely and claims eagerly. Normal lets go the tile that leaves the most ways to improve and claims what brings it closer. Hard also keeps its hand concealed early and lets go safe tiles when someone looks close to winning. They only ever see what you could see at a real table.', '简单：保持牌型，但打得随意、爱吃碰。普通：打出后进张最多的牌，只要能更接近胡牌就吃碰。困难：前期尽量门清，看到别人快胡时会打安全牌。电脑只看得到真实牌桌上能看到的牌。')),
  rule('globe', t('Friends online', '和好友在线'), t('Create a Mahjong room and send the code to up to three friends, on the web or in the Qi app. Computer players sit in the empty seats, and a friend who joins later takes one over. Each player\'s tiles travel locked to that player alone; the room\'s creator deals, so their Qi holds the wall.', '创建麻将房间，把房间码发给最多三位好友，网页和 Qi 应用都能加入。空位由电脑补上，好友晚到也能接替电脑。每个人的牌都加密只发给本人；由房主的 Qi 发牌并保管牌墙。')),
];

// ── Registration ──────────────────────────────────────────────────────────────

hooks.screens.mahjong = {
  make: () => new MahjongScreen(),
  card: () => [t('Mahjong', '麻将'), t('Four at a table: computer players or friends online, simple Chinese rules, and a coach for every tile.', '四人一桌：电脑或在线好友，简单的推倒胡规则，教练帮你打好每一张牌。')],
  mini(wrap) {
    // A few tiles on the pond: a hand standing, and a pung of red dragons laid down.
    const c = document.createElement('canvas');
    wrap.appendChild(c);
    const draw = () => {
      const side = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight || wrap.clientWidth));
      if (!side) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = c.height = Math.round(side * dpr);
      c.style.width = c.style.height = side + 'px';
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPond(ctx, side, side * 0.03);
      const w = side * 0.17;
      const x0 = (side - w * 5) / 2;
      [0, 10, 19, 27, 32].forEach((tl, i) => drawTile(ctx, tl, x0 + i * w, side * 0.56, w, {}));
      const small = w * 0.82, x1 = (side - small * 3) / 2;
      for (let i = 0; i < 3; i++) drawTile(ctx, 31, x1 + i * small, side * 0.14, small, {});
    };
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return { destroy() { ro.disconnect(); c.remove(); } };
  },
};
hooks.onlineModels = { ...(hooks.onlineModels || {}), mahjong: model };
model.listeners.push(() => {});
// Online Mahjong needs the session's Mahjong part (sealed hands, the host's dealing).
if (app.online) { app.online.ext = mahjongExt; mahjongExt.reset(app.online); }
if (!model.game.result && !model.resetting) setTimeout(() => model.advance(), 0);
