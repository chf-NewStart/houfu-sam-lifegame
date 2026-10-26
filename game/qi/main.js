/* Qi on the web: the app's start screen and its games (Qi/Views/*.swift), in English and
   中文. Each game screen is the board (2D canvas, or 3D when it is swapped in) and the
   rail: the header, the status, the room, the replay, the coach and the buttons. */
import { C, icon, glyph } from './art.js?v=1';
import { GridBoard, ChessBoard } from './boards.js?v=1';
import { Go, GoModel, GomokuModel, ChessModel, SEATINGS, isAI } from './models.js?v=1';
import * as Gomoku from './gomoku.js?v=1';
import * as Chess from './chess.js?v=1';
import * as Sound from './sound.js?v=1';

// ── App state ─────────────────────────────────────────────────────────────────

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};

export const THEMES = ['stone', 'wood', 'water', 'steel', 'sky', 'soil'];
const THEME_NAMES = { stone: ['Stone', '石'], wood: ['Wood', '木'], water: ['Water', '水'], steel: ['Steel', '钢'], sky: ['Sky', '星空'], soil: ['Garden', '菜园'] };

function initialLang() {
  try {
    const saved = localStorage.getItem('arcade_lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (e) { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export const app = {
  lang: initialLang(),
  soundOn: !store.get('qi_sound_muted', false),
  theme: THEMES.includes(store.get('qi_board_theme')) ? store.get('qi_board_theme') : 'stone',
  views3D: store.get('qi_view3d', {}) || {},
  screen: 'hub',
  go: new GoModel(),
  gomoku: new GomokuModel(),
  chess: new ChessModel(),
  online: null,
  t(en, zh) { return this.lang === 'zh' ? zh : en; },
  setLang(l) {
    this.lang = l;
    try { localStorage.setItem('arcade_lang', l); } catch (e) { /* ignore */ }
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
    rerender(true);
  },
  toggleSound() { this.soundOn = !this.soundOn; store.set('qi_sound_muted', !this.soundOn); Sound.setEnabled(this.soundOn); rerender(); },
  setTheme(t) { this.theme = t; store.set('qi_board_theme', t); Sound.setTheme(t); rerender(); },
  view3D(screen) { return this.views3D[screen] || 'off'; },
  set3D(screen, v) { this.views3D[screen] = v; store.set('qi_view3d', this.views3D); rerender(true); },
  gameName(game) { return { go: this.t('Go', '围棋'), gomoku: this.t('Gomoku', '五子棋'), chess: this.t('chess', '国际象棋'), mahjong: this.t('Mahjong', '麻将') }[game]; },
};
const t = (en, zh) => app.t(en, zh);
Sound.setEnabled(app.soundOn);
Sound.setTheme(app.theme);
document.documentElement.lang = app.lang === 'zh' ? 'zh-CN' : 'en';
// Browsers start audio only from a gesture.
addEventListener('pointerdown', () => Sound.unlock(), { capture: true });
addEventListener('keydown', () => Sound.unlock(), { capture: true });

/** Optional pieces that load later (online rooms, 3D, Mahjong) register here. */
export const hooks = { onlinePanel: null, openOnline: null, board3D: null, screens: {}, hubExtras: null };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export function btn(iconName, label, act, { active = false, enabled = true, prominent = false, arg = '', wide = false } = {}) {
  return `<button class="btn${active ? ' active' : ''}${prominent ? ' prominent' : ''}${wide ? ' wide' : ''}" data-act="${act}"${arg !== '' ? ` data-arg="${esc(arg)}"` : ''}${enabled ? '' : ' disabled'} aria-label="${esc(label)}">${icon(iconName)}<span>${esc(label)}</span></button>`;
}
export { esc, t };

// ── Sheets ────────────────────────────────────────────────────────────────────

let openSheet = null;
export function sheet(html, { small = false, onClose = null, actions = {} } = {}) {
  closeSheet();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet${small ? ' small' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  back.addEventListener('click', (e) => {
    if (e.target === back) { closeSheet(); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.act === 'close') { closeSheet(); return; }
    const f = actions[el.dataset.act];
    if (f) f(el.dataset.arg, el);
  });
  document.body.appendChild(back);
  openSheet = { back, onClose };
  const first = back.querySelector('[autofocus]') || back.querySelector('button');
  if (first) first.focus({ preventScroll: true });
  return back;
}
export function closeSheet() {
  if (!openSheet) return;
  const s = openSheet;
  openSheet = null;
  s.back.remove();
  if (s.onClose) s.onClose();
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
export function sheetHead(title) {
  return `<div class="sheet-head"><h2>${esc(title)}</h2><button class="round-btn" data-act="close" aria-label="${esc(t('Close', '关闭'))}">${icon('close')}</button></div>`;
}
function option(label, act, arg, on) {
  return `<button class="option${on ? ' on' : ''}" data-act="${act}" data-arg="${esc(arg)}">${on ? icon('check') : '<span class="tick"></span>'}<span>${esc(label)}</span></button>`;
}
export function confirmSheet(title, text, okLabel, ok, cancelLabel) {
  sheet(`${sheetHead(title)}<div class="confirm"><p>${esc(text)}</p><div class="btns">
    <button class="small-btn" data-act="close">${esc(cancelLabel || t('Cancel', '取消'))}</button>
    <button class="small-btn prominent" data-act="ok">${esc(okLabel)}</button></div></div>`,
  { small: true, actions: { ok: () => { closeSheet(); ok(); } } });
}
export function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function boardSheet() {
  const html = sheetHead(t('Board', '棋盘')) +
    `<p class="note muted" style="margin:0 0 12px">${esc(t('What the 3D boards are made of, and how a stone sounds when it lands.', '3D 棋盘的材质，以及落子的声音。'))}</p>` +
    THEMES.map((th) => option(app.t(...THEME_NAMES[th]), 'theme', th, th === app.theme)).join('');
  sheet(html, { small: true, actions: { theme: (th) => { app.setTheme(th); Sound.stone(1); boardSheet(); } } });
}

// ── Rules ─────────────────────────────────────────────────────────────────────

function rule(iconName, title, text) {
  return `<div class="rule">${icon(iconName)}<div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`;
}
function pieceRule(kind, title, text) {
  return `<div class="rule"><div class="pieces" data-piece="${kind}"></div><div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`;
}
const ONLINE_RULE = () => rule('globe', t('Play a friend online', '和好友在线对局'), t(
  'Tap Play online on the start screen (or A friend online… under New game), create a room and send your friend its code. They open Qi, in the app or here on the web, tap Play online and enter it. Take-backs and draws are asked, not taken; after a game you can both press Rematch and swap sides.',
  '在开始页面点「在线对局」（或在「新对局」里选「在线好友…」），创建房间并把房间码发给好友。对方在 Qi 应用或这个网页上点「在线对局」并输入房间码。悔棋与和棋需要对方同意；一局结束后双方都按「再来」即可交换先后手再下一局。'));

export const RULES = {
  go: () => [
    rule('board', t('Place stones', '落子'), t('Black and White take turns placing a stone on an empty intersection. Stones never move once placed.', '黑白双方轮流在空的交叉点上落子。棋子落下后不再移动。')),
    rule('replay', t('Liberties and capture', '气与提子'), t('The empty points next to a group are its liberties. Take a group\'s last liberty and it is captured and removed.', '与棋块相邻的空点是它的「气」。堵住最后一口气，这块棋就被提走。')),
    rule('flag', t('Atari', '叫吃'), t('A group with one liberty left is in atari: save it by extending, or capture an attacker.', '只剩一口气的棋块处于「叫吃」状态：延长出逃，或者提掉对方的棋来救。')),
    rule('again', t('Ko', '劫'), t('You can\'t make a move that repeats an earlier board position. Play somewhere else first.', '不能下出与之前完全相同的局面，需要先在别处下一手。')),
    rule('check', t('End and scoring', '终局与数子'), t('When both players pass in a row, mark the groups that are dead. Your score is your stones plus the empty points you surround. White gets 7.5 points of komi for moving second.', '双方连续停手后，标出死棋。得分 = 自己的棋子 + 围住的空点。白棋后手，贴 7.5 目。')),
    rule('bulb', t('The coach', '教练'), t('With the coach on, a ring shows the most urgent idea: save stones in atari, capture, or put enemy stones in atari. It\'s a hint, not a guarantee of the best move.', '开启教练后，圆环会标出最紧急的一手：救出被叫吃的棋、提子或叫吃对方。这只是提示，不保证是最佳着法。')),
    ONLINE_RULE(),
  ],
  gomoku: () => [
    rule('board', t('Five in a row', '连成五子'), t('Black moves first. Take turns placing stones; the first to make an unbroken line of five or more, across, down or diagonally, wins.', '黑棋先行，双方轮流落子。先在横、竖或斜方向连成五子（或更多）的一方获胜。')),
    rule('flag', t('Threats', '威胁'), t('An open three (both ends empty) threatens to become an open four, which can\'t be stopped. Block threes early.', '活三（两端都空）会变成无法阻挡的活四。要尽早封堵对方的活三。')),
    rule('scope', t('The coach', '教练'), t('Gold rings mark a winning move, cyan rings a block you must make, and green/amber rings the strongest building moves.', '金色圆环表示可立即取胜，青色表示必须封堵，绿色/琥珀色是最有力的进攻点。')),
    rule('cube', t('Computer levels', '电脑难度'), t('Easy looks one move ahead, Normal two and Hard three. Every level always takes a win and always blocks one.', '简单看一步，普通看两步，困难看三步。所有难度都会抓住必胜并封堵必败。')),
    ONLINE_RULE(),
  ],
  chess: () => [
    rule('board', t('The goal', '目标'), t('White moves first, then you take turns. Trap the other king so it can\'t escape capture: that\'s checkmate, and the game is won.', '白方先走，双方轮流走棋。把对方的王困住、让它无法逃脱被吃，就是「将死」，赢得对局。')),
    pieceRule(Chess.KING, t('King', '王'), t('One square in any direction. It may never move into check.', '向任意方向走一格，不能走到被攻击的格子。')),
    pieceRule(Chess.QUEEN, t('Queen', '后'), t('Any distance in a straight line or diagonally.', '沿直线或斜线走任意格数。')),
    pieceRule(Chess.ROOK, t('Rook: the stone lantern', '车：石灯笼'), t('Any distance along a rank or file.', '沿横线或竖线走任意格数。')),
    pieceRule(Chess.BISHOP, t('Bishop', '象'), t('Any distance diagonally, so it stays on one colour.', '沿斜线走任意格数，始终停在同一种颜色的格子上。')),
    pieceRule(Chess.KNIGHT, t('Knight: the seahorse', '马：海马'), t('An L: two squares one way and one to the side. The only piece that jumps over others.', '走「日」字：一个方向两格再横一格。唯一能跳过其他棋子的棋子。')),
    pieceRule(Chess.PAWN, t('Pawn: the cairn', '兵：石堆'), t('One square forward (two on its first move); it captures one square diagonally forward. On the last rank it becomes a queen, rook, bishop or knight.', '向前走一格（第一步可走两格），斜前方一格吃子。走到底线可升变为后、车、象或马。')),
    rule('flag', t('Check', '将军'), t('A king under attack is in check: the next move must get it out, by moving the king, blocking, or taking the attacker.', '王被攻击就是「将军」：下一步必须解除，移动王、挡住来路，或吃掉攻击的棋子。')),
    rule('again', t('Castling, en passant', '王车易位、吃过路兵'), t('Castling: the king moves two squares toward a rook that hasn\'t moved and the rook jumps over it, if nothing is in between and the king isn\'t in, through or into check. En passant: a pawn that rushes two squares past an enemy pawn can be taken as if it had moved one, on the very next move.', '王车易位：王向未动过的车移动两格，车跳到王的另一侧；中间不能有子，王不能正被将军、经过或落在被攻击的格子。吃过路兵：兵从起始位置一次走两格、经过对方兵的攻击格时，对方可在下一步像它只走一格那样把它吃掉。')),
    rule('draw', t('Draws', '和棋'), t('No legal move but not in check is stalemate. The same position three times, fifty moves each without a capture or pawn move, or too few pieces to mate also end in a draw.', '无子可动但没有被将军是「逼和」。同一局面出现三次、双方各五十步无吃子也无兵移动，或双方子力不足以将死，也都是和棋。')),
    rule('bulb', t('The coach', '教练'), t('With the coach on, a ring marks the most urgent idea: a mate in one (gold), a free piece to take (gold), or your piece that is about to be lost (cyan).', '开启教练后，圆环会标出最紧急的一手：一步将死（金色）、可以白吃的子（金色），或你即将被吃掉的子（青色）。')),
    rule('face', t('Two players on one tablet', '一台平板两人对下'), t('Choose Two players, lay the tablet flat between you and turn on Face to face: Black\'s pieces turn round to face the far side, and its turn is written the right way up for them.', '选择「双人同屏」，把平板平放在两人中间并打开「对坐」：黑方的棋子会转向对面，轮到黑方时提示文字也朝向对面。')),
    ONLINE_RULE(),
  ],
};

export function rulesSheet(game) {
  const title = { go: t('How to play Go', '围棋玩法'), gomoku: t('How to play Gomoku', '五子棋玩法'), chess: t('How to play chess', '国际象棋玩法'), mahjong: t('How to play Mahjong', '麻将玩法') }[game];
  const back = sheet(sheetHead(title) + RULES[game]().join(''));
  back.querySelectorAll('[data-piece]').forEach((el) => {
    const k = Number(el.dataset.piece);
    el.append(glyph('piece', k, 20), glyph('piece', -k, 20));
  });
}

// ── The header and shared panels ──────────────────────────────────────────────

export function header(title, subtitle) {
  const zh = app.lang === 'zh';
  return `<div class="head">
    <button class="round-btn back" data-act="back" aria-label="${esc(t('Back to Qi', '返回'))}">${icon('back')}</button>
    <div class="titles"><h1 class="${zh ? 'zh' : ''}">${esc(title)}</h1><div class="sub">${esc(subtitle)}</div></div>
    <button class="round-btn" data-act="rules" aria-label="${esc(t('How to play', '玩法'))}">${icon('help')}</button>
    <button class="round-btn${app.soundOn ? ' on' : ''}" data-act="sound" aria-label="${esc(app.soundOn ? t('Mute sounds', '静音') : t('Turn sounds on', '开启声音'))}">${icon(app.soundOn ? 'sound' : 'mute')}</button>
    <button class="lang-btn" data-act="lang">${app.lang === 'en' ? '中文' : 'EN'}</button>
  </div>`;
}

function coachPanel(text, iconName = 'bulb') {
  return `<div class="panel coach">${icon(iconName)}<div>${esc(text)}</div></div>`;
}

function viewRow(screen) {
  const three = hooks.board3D ? btn('cube', '3D', 'toggle3d', { active: app.view3D(screen) !== 'off' }) : '';
  return `<div class="btn-row">${three}${btn('board', t(`Board: ${THEME_NAMES[app.theme][0]}`, `棋盘：${THEME_NAMES[app.theme][1]}`), 'boardMenu')}</div>`;
}

function replayPanel(screen, length, at) {
  const shown = at == null ? length : at;
  const playing = screen.replayTimer != null;
  return `<div class="panel replay">
    <div class="replay-head">${icon('replay')}<span>${esc(t('Replay', '复盘'))}</span><span class="at">${esc(t(`move ${shown} of ${length}`, `第 ${shown} / ${length} 手`))}</span></div>
    <input type="range" min="0" max="${Math.max(1, length)}" step="1" value="${shown}" data-input="review" aria-label="${esc(t('Move shown', '显示的手数'))}">
    <div class="btn-row">
      ${btn('start', t('Start', '开局'), 'rv', { arg: 'start' })}${btn('prev', t('Back', '后退'), 'rv', { arg: 'back' })}
      ${btn(playing ? 'pause' : 'play', playing ? t('Pause', '暂停') : t('Play', '播放'), 'rv', { arg: 'play' })}
      ${btn('next', t('Forward', '前进'), 'rv', { arg: 'fwd' })}${btn('end', t('End', '终局'), 'rv', { arg: 'end' })}
    </div></div>`;
}

const seatLabel = {
  go: (s) => ({ youFirst: t('You (Black) vs computer', '你执黑 vs 电脑'), youSecond: t('You (White) vs computer', '你执白 vs 电脑'), twoPlayers: t('Two players, one device', '双人同屏') })[s],
  gomoku: (s) => ({ youFirst: t('You (Black, first) vs computer', '你执黑先行 vs 电脑'), youSecond: t('You (White) vs computer', '你执白 vs 电脑'), twoPlayers: t('Two players, one device', '双人同屏') })[s],
  chess: (s) => ({ youFirst: t('You (White, first) vs computer', '你执白先行 vs 电脑'), youSecond: t('You (Black) vs computer', '你执黑 vs 电脑'), twoPlayers: t('Two players, one device', '双人同屏') })[s],
};
const levelName = (l) => ({ easy: t('easy', '简单'), normal: t('normal', '普通'), hard: t('hard', '困难') })[l];
const colorName = (c) => (c === 1 ? t('Black', '黑棋') : t('White', '白棋'));

// ── A game screen ─────────────────────────────────────────────────────────────

class GameScreen {
  constructor(kind, model) {
    this.kind = kind;
    this.model = model;
    this.root = document.createElement('main');
    this.root.className = 'game';
    this.root.dataset.game = kind;
    this.root.innerHTML = `<header class="game-head"></header><div class="stage"><div class="board-wrap"></div></div><div class="game-body"></div>`;
    this.headEl = this.root.querySelector('.game-head');
    this.stage = this.root.querySelector('.stage');
    this.wrap = this.root.querySelector('.board-wrap');
    this.body = this.root.querySelector('.game-body');
    this.replayTimer = null;
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      this.act(el.dataset.act, el.dataset.arg, el);
    });
    this.root.addEventListener('input', (e) => {
      if (e.target.dataset.input === 'review') { this.stopReplay(); this.model.setReview(Number(e.target.value)); }
    });
    this.unlisten = () => {};
    const listener = () => scheduleRender();
    model.listeners.push(listener);
    this.unlisten = () => { model.listeners = model.listeners.filter((f) => f !== listener); };
  }

  mount(parent) { parent.appendChild(this.root); this.makeBoard(); this.render(); }
  destroy() { this.stopReplay(); this.unlisten(); if (this.board) this.board.destroy(); if (this.window3D) this.window3D.destroy(); this.root.remove(); }

  act(a, arg) {
    const m = this.model;
    switch (a) {
      case 'back':
        if (app.online && app.online.active) {
          confirmSheet(t('Leave this room?', '离开这个房间？'),
            t('The game waits on the server for six hours. Come back from the start screen, or join again with the code.', '对局会在服务器上保留六小时。可以从开始页面回来，或用房间码重新加入。'),
            t('Leave room', '离开房间'), () => { app.online.leave(); go('hub'); }, t('Stay', '留下'));
        } else go('hub');
        break;
      case 'rules': rulesSheet(this.kind); break;
      case 'sound': app.toggleSound(); break;
      case 'lang': app.setLang(app.lang === 'en' ? 'zh' : 'en'); break;
      case 'coach': if (m.setCoach) m.setCoach(!m.coach); else { m.coach = !m.coach; m.changed(); } break;
      case 'undo': m.undo(); break;
      case 'newMenu': this.newGameSheet(); break;
      case 'boardMenu': boardSheet(); break;
      case 'toggle3d': app.set3D(this.kind, app.view3D(this.kind) === 'off' ? 'side' : 'off'); break;
      case 'swap3d': app.set3D(this.kind, app.view3D(this.kind) === 'main' ? 'side' : 'main'); break;
      case 'rv': this.replayAction(arg); break;
      case 'again':
        if (m.isOnline) app.online.send('rematch'); else { this.stopReplay(); m.newGame(); }
        break;
      case 'resign':
        if (m.isOnline) {
          confirmSheet(t('Resign this game?', '认输这一局？'), '', t('Resign', '认输'), () => m.resign(), t('Keep playing', '继续下'));
        } else m.resign();
        break;
      default:
        if (hooks.onlineAct && hooks.onlineAct(a, arg)) return;
        this.extraAct(a, arg);
    }
  }

  extraAct() {}

  replayAction(arg) {
    const m = this.model;
    const length = this.reviewLength();
    const at = m.review == null ? length : m.review;
    if (arg !== 'play') this.stopReplay();
    if (arg === 'start') m.setReview(0);
    else if (arg === 'back') m.setReview(Math.max(0, at - 1));
    else if (arg === 'fwd') m.setReview(at + 1);
    else if (arg === 'end') m.setReview(null);
    else if (arg === 'play') {
      if (this.replayTimer != null) { this.stopReplay(); scheduleRender(); return; }
      if (at >= length) m.setReview(0);
      this.replayTimer = setInterval(() => {
        const now = m.review == null ? length : m.review;
        if (now >= length - 1) { this.stopReplay(); m.setReview(null); return; }
        m.setReview(now + 1);
      }, 650);
      scheduleRender();
    }
  }
  stopReplay() { if (this.replayTimer != null) { clearInterval(this.replayTimer); this.replayTimer = null; } }

  newGameSheet() {
    const m = this.model, k = this.kind;
    let html = sheetHead(t('New game', '新对局'));
    if (k === 'go') {
      html += `<h3>${esc(t('Board', '棋盘'))}</h3>` + GoModel.sizes.map((s) => option(`${s}×${s}`, 'size', s, s === m.size)).join('');
    } else {
      html += `<h3>${esc(t('Computer', '电脑'))}</h3>` + ['easy', 'normal', 'hard'].map((l) => option(levelName(l), 'level', l,
        (k === 'chess' ? m.level === l && m.seating !== 'twoPlayers' : m.difficulty === l))).join('');
    }
    html += `<h3>${esc(t('Players', '对局'))}</h3>` + SEATINGS.map((s) => option(seatLabel[k](s), 'seat', s, s === m.seating)).join('');
    if (hooks.openOnline) html += `<button class="option" data-act="online">${icon('globe')}<span>${esc(t('A friend online…', '在线好友…'))}</span></button>`;
    sheet(html, { small: true, actions: {
      size: (s) => { closeSheet(); this.stopReplay(); m.newGame({ size: Number(s) }); },
      level: (l) => { closeSheet(); this.stopReplay(); if (k === 'chess') m.newGame({ level: l, seating: m.seating === 'twoPlayers' ? 'youFirst' : undefined }); else m.newGame({ difficulty: l }); },
      seat: (s) => { closeSheet(); this.stopReplay(); m.newGame({ seating: s }); },
      online: () => { closeSheet(); hooks.openOnline(k); },
    } });
  }

  /** The window at the top of the rail when 3D is on. */
  windowHTML() {
    if (!hooks.board3D || app.view3D(this.kind) === 'off') return '';
    const showing3D = app.view3D(this.kind) === 'side';
    return `<button class="board-window" data-act="swap3d" aria-label="${esc(showing3D ? t('3D board. Tap to make it the big board.', '3D 棋盘。点按放大。') : t('2D board. Tap to make it the big board.', '2D 棋盘。点按放大。'))}"><div class="win-wrap"></div><span class="tag">${esc(showing3D ? t('3D · tap to enlarge', '3D · 点按放大') : t('2D · tap to enlarge', '2D · 点按放大'))}</span></button>`;
  }

  render() {
    this.headEl.innerHTML = header(this.title(), this.subtitle());
    const keepScroll = this.body.scrollTop;
    this.body.innerHTML = this.windowHTML() + this.bodyHTML();
    this.body.scrollTop = keepScroll;
    this.decorate();
    this.updateBoard();
  }

  decorate() {
    this.body.querySelectorAll('[data-stone]').forEach((el) => el.replaceWith(glyph('stone', Number(el.dataset.stone), Number(el.dataset.px || 14))));
    this.body.querySelectorAll('[data-pc]').forEach((el) => el.replaceWith(glyph('piece', Number(el.dataset.pc), Number(el.dataset.px || 18))));
    if (hooks.board3D) hooks.board3D.attach(this);
  }

  onlinePanel() { return this.model.isOnline && hooks.onlinePanel ? hooks.onlinePanel(this.kind) : ''; }
}

const dot = (color, px = 14) => `<i data-stone="${color}" data-px="${px}"></i>`;

// Go

class GoScreen extends GameScreen {
  constructor() { super('go', app.go); this.bannerId = null; }

  makeBoard() {
    this.board = new GridBoard(this.wrap, (r, c) => this.model.tap(r, c));
  }

  get reviewing() { return this.model.review != null; }
  reviewLength() { return this.model.reviewLength; }
  get priority() { return this.reviewing ? null : this.model.priority; }
  get scoring() { const g = this.model.game; return !this.reviewing && (g.phase === 'scoring' || (g.phase === 'finished' && g.result && g.result.reason === 'score')); }

  boardState(interactive) {
    const m = this.model, g = m.game, p = this.priority;
    const hints = p && p.move ? [{ row: p.move.row, col: p.move.col, color: p.kind === 'attack' || p.kind === 'capture' ? C.gold : C.cyan, mark: '' }] : [];
    const ghost = new Set();
    if (m.isOnline && app.online) {
      for (const mv of app.online.pendingMoves) { const pt = mv.split(',').map(Number); if (pt.length === 2) ghost.add(pt[0] * g.size + pt[1]); }
    }
    return { size: g.size, stones: m.shownBoard, columns: Go.COLUMNS, stars: Go.starPoints(g.size), last: m.shownLast, hints,
      dead: this.reviewing ? new Set() : m.dead, owner: this.scoring ? m.finalScore.owner : null, ghost,
      interactive: interactive && !this.reviewing };
  }

  updateBoard() {
    const main3D = hooks.board3D && app.view3D('go') === 'main';
    if (!main3D) this.board.set(this.boardState(true));
    if (hooks.board3D) hooks.board3D.update(this);
    this.showBanner();
  }

  showBanner() {
    const s = this.model.slain;
    if (!s || s.id === this.bannerId) return;
    this.bannerId = s.id;
    showSlain(this.stage, s);
  }

  title() { return t('GO', '围棋'); }
  subtitle() { const g = this.model.game; return `${g.size}×${g.size} · ${t('komi', '贴目')} ${g.komi}` + (this.model.isOnline ? t(' · online', ' · 在线') : ''); }

  turnText() {
    const m = this.model, color = m.game.current;
    if (m.isOnline) {
      if (app.online.waitingForFriend) return t('Waiting for your friend', '等待好友加入');
      return color === m.onlineSeat ? t(`Your move (${colorName(color)})`, `轮到你（${colorName(color)}）`) : t(`Your friend's move (${colorName(color)})`, `轮到好友（${colorName(color)}）`);
    }
    if (m.seating === 'twoPlayers') return t(`${colorName(color)} to play`, `轮到${colorName(color)}`);
    if (isAI(m.seating, color)) return t('Computer is thinking…', '电脑思考中…');
    return t(`Your move (${colorName(color)})`, `轮到你（${colorName(color)}）`);
  }

  scoreLines(s) {
    return `<div class="score-lines"><div>${dot(1, 12)}${esc(t(`Black ${fmt(s.black)}`, `黑 ${fmt(s.black)}`))}</div>
      <div>${dot(2, 12)}${esc(t(`White ${fmt(s.whiteBase)} + ${fmt(s.komi)} komi = ${fmt(s.white)}`, `白 ${fmt(s.whiteBase)} + 贴目 ${fmt(s.komi)} = ${fmt(s.white)}`))}</div></div>`;
  }

  resultText() {
    const m = this.model, r = m.game.result;
    if (!r) return '';
    if (m.isOnline) {
      const who = r.winner === m.onlineSeat ? t('You win', '你赢了') : t('Your friend wins', '好友获胜');
      if (r.reason === 'resign') return t(`${who} by resignation`, `${who}（对方认输）`);
      const s = m.finalScore;
      return s.winner === 0 ? t('Draw', '和棋') : t(`${who} by ${fmt(s.margin)}`, `${who} ${fmt(s.margin)} 目`);
    }
    if (r.reason === 'resign') return t(`${colorName(r.winner)} wins by resignation`, `${colorName(r.winner)}中盘胜`);
    const s = m.finalScore;
    if (s.winner === 0) return t('Draw', '和棋');
    return t(`${colorName(s.winner)} wins by ${fmt(s.margin)}`, `${colorName(s.winner)}胜 ${fmt(s.margin)} 目`);
  }

  refusalText(reason) {
    return ({
      occupied: t('That point is taken.', '这里已经有棋子了。'),
      suicide: t('No liberties there: that stone would be captured at once.', '此处没有气，落子会立刻被提。'),
      superko: t('Ko: that would repeat an earlier position. Play elsewhere first.', '劫：这会重复之前的局面，请先在别处下一手。'),
    })[reason] || t('You can\'t play there now.', '现在不能在这里下。');
  }

  coachText() {
    const p = this.model.priority;
    if (!p) return null;
    const coord = p.move ? Go.coordinate(this.model.game.size, p.move.row, p.move.col) : '';
    switch (p.kind) {
      case 'danger': return t('Your group is in atari and can\'t be saved directly. Make your next move count elsewhere.', '你的棋块被叫吃，已无法直接救活。把这一手下在别处更有价值。');
      case 'defend': return t(`Save your stones: play ${coord}. ${p.threatenedStones} stone(s) in atari get ${p.resultLiberties} liberties.`, `救棋：下在 ${coord}。被叫吃的 ${p.threatenedStones} 子会长到 ${p.resultLiberties} 口气。`);
      case 'defend-capture': return t(`Save your stones by capturing at ${coord}.`, `在 ${coord} 提子，同时救出自己的棋。`);
      case 'capture': return t(`Capture ${p.captured} stone(s) at ${coord}.`, `在 ${coord} 可以提掉 ${p.captured} 子。`);
      case 'attack': return t(`Put ${p.attackedStones} stone(s) in atari at ${coord}.`, `在 ${coord} 可以叫吃 ${p.attackedStones} 子。`);
      case 'quiet': return t('No urgent fights. Claim open space, corners first, then sides.', '暂无紧急战斗。先占角，再占边，扩大地盘。');
      default: return null;
    }
  }

  bodyHTML() {
    const m = this.model, g = m.game, online = m.isOnline;
    let status = '';
    if (g.phase === 'playing') {
      status += `<div class="status-line">${dot(g.current, 16)}<span>${esc(this.turnText())}</span></div>`;
      if (m.opponentPassed) status += `<div class="note gold">${esc(online ? t('Your friend passed. Pass too to finish and count, or keep playing.', '好友停了一手。你也停一手即可结束数子，或者继续下。') : t('The computer passed. Pass too to finish and count, or keep playing.', '电脑停了一手。你也停一手即可结束数子，或者继续下。'))}</div>`;
      if (m.refusal) status += `<div class="note danger">${esc(this.refusalText(m.refusal))}</div>`;
    } else if (g.phase === 'scoring') {
      status += `<div class="result">${esc(t('Both players passed', '双方停手'))}</div>`;
      status += `<div class="note muted">${esc(online ? t('Either of you can tap a dead group (it can\'t avoid capture). When you both press Count, the game ends.', '双方都可以点按已死的棋块（无法避免被提）。两人都按「数子」后对局结束。') : t('Tap any group that is dead (can\'t avoid capture), then press Count.', '点按已经死掉（无法避免被提）的棋块，然后按「数子」。'))}</div>`;
      status += this.scoreLines(m.finalScore);
    } else {
      status += `<div class="result green">${esc(this.resultText())}</div>`;
      if (g.result && g.result.reason === 'score') status += this.scoreLines(m.finalScore);
    }
    status += `<div class="meta"><span>${dot(1, 11)}${esc(t(`captured ${g.captures[1]}`, `提子 ${g.captures[1]}`))}</span><span>${dot(2, 11)}${esc(t(`captured ${g.captures[2]}`, `提子 ${g.captures[2]}`))}</span><span class="spacer"></span><span class="faint">${esc(t(`move ${m.moveNumber}`, `第 ${m.moveNumber} 手`))}</span></div>`;

    let html = `<div class="panel">${status}</div>` + this.onlinePanel();
    if (g.phase === 'finished' && m.reviewLength > 0) html += replayPanel(this, m.reviewLength, m.review);
    if (g.phase === 'playing') { const text = this.coachText(); if (text) html += coachPanel(text); }

    const offer = online && app.online.record && app.online.record.offer;
    let row1 = '';
    if (g.phase === 'playing') {
      row1 = btn('pass', t('Pass', '停一手'), 'pass', { enabled: m.isHumanTurn }) +
        btn('undo', online ? t('Take back', '悔棋') : t('Undo', '悔棋'), 'undo', { enabled: m.canUndo && !offer }) +
        btn('flag', t('Resign', '认输'), 'resign');
    } else if (g.phase === 'scoring') {
      row1 = btn('check', t('Count', '数子'), 'count', { prominent: true }) + btn('play', t('Resume', '继续下'), 'resume');
    } else {
      const asked = online && app.online.record && app.online.record.rematch[String(m.onlineSeat)];
      row1 = btn('again', online ? t('Rematch', '再来') : t('Again', '再来'), 'again', { prominent: !asked }) +
        (online ? '' : btn('undo', t('Undo', '悔棋'), 'undo', { enabled: m.canUndo }));
    }
    html += `<div class="btn-row">${row1}</div><div class="btn-row">${btn('bulb', t('Coach', '教练'), 'coach', { active: m.coach })}${online ? '' : btn('plus', t('New game', '新对局'), 'newMenu')}</div>`;
    html += viewRow('go');
    if (hooks.board3D && app.view3D('go') !== 'off') {
      html += `<div class="panel legend">${icon('lizard')}<div>${esc(t('Connected stones become one animal, its body over all of them: Black\'s are snakes, White\'s dragons, growing up as they grow. Grey and flat: likely to be captured. Puffs of breath: one liberty (气) left.', '连在一起的棋子就是一条生灵，身体经过它所有的棋子：黑方是蛇，白方是龙，连得越大越成熟。灰而趴下：很可能被吃。冒出气息：只剩一口气。'))}</div></div>`;
    }
    return html;
  }

  extraAct(a) {
    const m = this.model;
    if (a === 'pass') m.pass();
    else if (a === 'count') m.finishScoring();
    else if (a === 'resume') m.resumePlay();
  }
}

// Gomoku

class GomokuScreen extends GameScreen {
  constructor() { super('gomoku', app.gomoku); }
  makeBoard() { this.board = new GridBoard(this.wrap, (r, c) => this.model.tap(r, c)); }
  get reviewing() { return this.model.review != null; }
  reviewLength() { return this.model.moves.length; }

  coachMarks() {
    const hints = [], rings = {};
    const coach = this.reviewing ? null : this.model.coachHints;
    if (!coach) return { hints, rings };
    const ranked = [[C.green, 0x51e68e], [C.gold, 0xe8b04a], [C.rust, 0xc76b4f]];
    coach.moves.forEach((m, i) => {
      const p = m.r * Gomoku.N + m.c;
      if (coach.kind === 'win') { hints.push({ row: m.r, col: m.c, color: C.gold, mark: '!' }); rings[p] = 0xe8b04a; }
      else if (coach.kind === 'block') { hints.push({ row: m.r, col: m.c, color: C.cyan, mark: '×' }); rings[p] = 0x45c7ff; }
      else if (coach.kind === 'build') { hints.push({ row: m.r, col: m.c, color: ranked[Math.min(i, 2)][0], mark: '' }); rings[p] = ranked[Math.min(i, 2)][1]; }
    });
    return { hints, rings };
  }

  boardState(interactive) {
    const m = this.model, last = m.shownMoves[m.shownMoves.length - 1];
    const ghost = new Set();
    if (m.isOnline && app.online) for (const mv of app.online.pendingMoves) { const p = mv.split(',').map(Number); ghost.add(p[0] * 15 + p[1]); }
    return { size: Gomoku.N, stones: m.shownBoard, columns: Gomoku.COLUMNS, stars: Gomoku.STARS, last: last ? [last.r, last.c] : null,
      hints: this.coachMarks().hints, winLine: m.shownWinLine, ghost, interactive: interactive && !this.reviewing };
  }

  updateBoard() {
    if (!(hooks.board3D && app.view3D('gomoku') === 'main')) this.board.set(this.boardState(true));
    if (hooks.board3D) hooks.board3D.update(this);
  }

  title() { return t('GOMOKU', '五子棋'); }
  subtitle() { return t('five in a row · 15×15', '连成五子 · 15×15') + (this.model.isOnline ? t(' · online', ' · 在线') : ''); }

  turnText() {
    const m = this.model, c = colorName(m.current);
    if (m.isOnline) {
      if (app.online.waitingForFriend) return t('Waiting for your friend', '等待好友加入');
      return m.current === m.onlineSeat ? t(`Your move (${c})`, `轮到你（${c}）`) : t(`Your friend's move (${c})`, `轮到好友（${c}）`);
    }
    if (m.seating === 'twoPlayers') return t(`${c} to play`, `轮到${c}`);
    if (isAI(m.seating, m.current)) return t('Computer is thinking…', '电脑思考中…');
    return t(`Your move (${c})`, `轮到你（${c}）`);
  }

  winnerText(w) {
    const m = this.model;
    if (m.isOnline) {
      const who = w === m.onlineSeat ? t('You win!', '你赢了！') : t('Your friend wins', '好友获胜');
      return m.resigned != null ? who + t(' (resigned)', '（对方认输）') : who;
    }
    if (m.seating === 'twoPlayers') return t(`${colorName(w)} wins!`, `${colorName(w)}获胜！`);
    return isAI(m.seating, w) ? t('The computer wins', '电脑获胜') : t('You win!', '你赢了！');
  }

  coachText() {
    const c = this.model.coachHints;
    if (!c) return null;
    const coords = c.moves.map(Gomoku.coordinate).join(', ');
    return ({
      win: t(`Win now: ${coords}`, `立即取胜：${coords}`),
      block: t(`Must block: ${coords}`, `必须封堵：${coords}`),
      build: t(`Build pressure: ${coords}. Rings are suggestions, not guarantees.`, `制造威胁：${coords}。圆环是建议，并非保证。`),
      quiet: t('No forced tactic yet. Grow open lines in more than one direction.', '暂无强制战术。尝试向多个方向发展活线。'),
    })[c.kind];
  }

  bodyHTML() {
    const m = this.model, online = m.isOnline;
    let status;
    if (m.winner != null) status = `<div class="status-line">${dot(m.winner, 16)}<span class="result">${esc(this.winnerText(m.winner))}</span></div>`;
    else if (m.isDraw) status = `<div class="result">${esc(t('Board full: draw', '棋盘已满：和棋'))}</div>`;
    else status = `<div class="status-line">${dot(m.current, 16)}<span>${esc(this.turnText())}</span></div>`;
    const line = online ? t('online with a friend', '与好友在线对局') : m.seating === 'twoPlayers' ? t('two players', '双人对局') : t(`computer: ${levelName(m.difficulty)}`, `电脑：${levelName(m.difficulty)}`);
    status += `<div class="meta"><span>${esc(line)}</span><span class="spacer"></span><span class="faint">${esc(t(`move ${m.moves.length}`, `第 ${m.moves.length} 手`))}</span></div>`;
    let html = `<div class="panel">${status}</div>` + this.onlinePanel();
    if (m.isOver && m.moves.length) html += replayPanel(this, m.moves.length, m.review);
    const text = this.coachText();
    if (text) html += coachPanel(text, 'scope');
    const offer = online && app.online.record && app.online.record.offer;
    let row = '';
    if (m.isOver) {
      const asked = online && app.online.record && app.online.record.rematch[String(m.onlineSeat)];
      row += btn('again', online ? t('Rematch', '再来') : t('Again', '再来'), 'again', { prominent: !asked });
    }
    if (!(online && m.isOver)) row += btn('undo', online ? t('Take back', '悔棋') : t('Undo', '悔棋'), 'undo', { enabled: m.canUndo && !offer });
    if (online && !m.isOver) row += btn('flag', t('Resign', '认输'), 'resign');
    row += btn('scope', t('Coach', '教练'), 'coach', { active: m.coach });
    html += `<div class="btn-row">${row}</div>`;
    if (!online) html += btn('plus', t('New game', '新对局'), 'newMenu', { wide: true });
    html += viewRow('gomoku');
    if (hooks.board3D && app.view3D('gomoku') !== 'off') {
      html += `<div class="panel legend">${icon('leaf')}<div>${esc(t('Black grows tomatoes, White cucumbers. Each one ripens as its line grows: alone it\'s small and green; vines join every line of two or more; five in a row is a prize harvest.', '黑方种番茄，白方种黄瓜。连线越长，果实越大越熟：单子又小又青；两子以上的线由藤蔓相连；五连就是大丰收。'))}</div></div>`;
    }
    return html;
  }
}

// Chess

const PIECE_NAMES = { en: ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'], zh: ['', '兵', '马', '象', '车', '后', '王'] };
const pieceName = (k) => PIECE_NAMES[app.lang][Math.abs(k)];
const sideName = (s) => (s === Chess.WHITE ? t('White', '白方') : t('Black', '黑方'));

class ChessScreen extends GameScreen {
  constructor() { super('chess', app.chess); }

  makeBoard() {
    this.board = new ChessBoard(this.wrap, this.model, {
      pieceName,
      farSide: () => {
        const m = this.model;
        if (!(m.faceToFace && m.seating === 'twoPlayers' && !m.isOnline) || m.game.isOver || m.game.current !== Chess.BLACK || m.review != null) return null;
        return m.game.inCheck ? t('Black: check!', '黑方：被将军！') : t('Black to move', '轮到黑方');
      },
    });
  }

  reviewLength() { return this.model.game.moves.length; }

  updateBoard() {
    if (!(hooks.board3D && app.view3D('chess') === 'main')) this.board.update(this.model.review == null);
    if (hooks.board3D) hooks.board3D.update(this);
  }

  title() { return t('CHESS', '国际象棋'); }
  subtitle() {
    const m = this.model;
    if (m.isOnline) return t(`online · you play ${sideName(m.onlineSeat)}`, `在线 · 你执${sideName(m.onlineSeat)}`);
    return m.seating === 'twoPlayers' ? t('two players · one board', '双人同屏') : t(`computer: ${levelName(m.level)}`, `电脑：${levelName(m.level)}`);
  }

  turnText() {
    const m = this.model, side = m.game.current;
    if (m.isOnline) {
      if (app.online.waitingForFriend) return t('Waiting for your friend', '等待好友加入');
      return side === m.onlineSeat ? t(`Your move (${sideName(side)})`, `轮到你（${sideName(side)}）`) : t(`Your friend's move (${sideName(side)})`, `轮到好友（${sideName(side)}）`);
    }
    if (m.seating === 'twoPlayers') return t(`${sideName(side)} to move`, `轮到${sideName(side)}`);
    if (m.thinking) return t('Computer is thinking…', '电脑思考中…');
    return t(`Your move (${sideName(side)})`, `轮到你（${sideName(side)}）`);
  }

  resultText(r) {
    const m = this.model, w = r.winner;
    let who;
    if (m.isOnline) who = w === m.onlineSeat ? t('You win', '你赢了') : t('Your friend wins', '好友获胜');
    else if (m.seating !== 'twoPlayers') who = isAI(m.seating, w) ? t('The computer wins', '电脑获胜') : t('You win', '你赢了');
    else who = t(`${sideName(w)} wins`, `${sideName(w)}获胜`);
    return ({
      checkmate: t(`Checkmate! ${who}.`, `将死！${who}。`),
      resign: t(`${who} by resignation.`, `${who}（对方认输）。`),
      stalemate: t('Stalemate: no legal move, not in check. A draw.', '逼和：无子可动又未被将军，和棋。'),
      fiftyMoves: t('Draw: fifty moves with no capture or pawn move.', '和棋：五十回合无吃子、无兵移动。'),
      repetition: t('Draw: the same position three times.', '和棋：同一局面出现三次。'),
      material: t('Draw: not enough pieces left to checkmate.', '和棋：双方子力都不足以将死。'),
      agreement: t('Draw agreed.', '双方同意和棋。'),
    })[r.reason];
  }

  coachText() {
    const h = this.model.coachHint;
    if (!h) return null;
    const square = h.square != null ? Chess.squareName(h.square) : '';
    const piece = pieceName(h.piece), other = pieceName(h.other);
    switch (h.kind) {
      case 'mate': return t(`Checkmate in one: ${h.san}.`, `一步将死：${h.san}。`);
      case 'check': return t('You\'re in check. Move the king, block the line, or take the piece giving check.', '你被将军了。移动王、挡住来路，或吃掉将军的棋子。');
      case 'capture': return h.free
        ? t(`Free ${other} on ${square}: your ${piece} can take it (${h.san}).`, `${square} 的${other}没人保护：用你的${piece}吃掉它（${h.san}）。`)
        : t(`Good trade: your ${piece} takes their ${other}, which is worth more (${h.san}).`, `划算的交换：用${piece}吃对方更值钱的${other}（${h.san}）。`);
      case 'defend': return t(`Your ${piece} on ${square} is attacked by a ${other} and could be lost. Move it or protect it.`, `你在 ${square} 的${piece}正被对方的${other}攻击，可能被吃。把它移开或保护好。`);
      case 'develop': return t('Opening: bring knights and bishops toward the centre, then castle to keep your king safe.', '开局：先把马和象向中心出动，然后王车易位，保护好王。');
      default: return t('Nothing is hanging. See what your opponent\'s last move attacks, then improve your least active piece.', '暂无危险。先看对方上一步在攻击什么，再改善最不活跃的棋子。');
    }
  }

  takenRow(side) {
    const g = this.model.game;
    const taken = g.taken[side].slice().sort((a, b) => b - a);
    const lead = (side === Chess.WHITE ? 1 : -1) * g.materialBalance;
    return `<span class="row" aria-label="${esc(t(`${sideName(side)} has taken ${taken.length} pieces`, `${sideName(side)}吃了 ${taken.length} 子`))}">${taken.map((k) => `<i data-pc="${k * Chess.sign(Chess.other(side))}" data-px="15"></i>`).join('')}${lead > 0 ? `<span class="lead">+${lead}</span>` : ''}</span>`;
  }

  moveList() {
    const san = this.model.game.san;
    if (!san.length) return t('No moves yet', '尚未落子');
    const parts = [];
    for (let i = Math.floor(Math.max(0, san.length - 6) / 2) * 2; i < san.length; i += 2) parts.push(`${i / 2 + 1}. ${san[i]}${san[i + 1] ? ' ' + san[i + 1] : ''}`);
    return parts.join('  ');
  }

  bodyHTML() {
    const m = this.model, g = m.game, online = m.isOnline, over = g.isOver;
    let status;
    if (g.result) status = `<div class="result">${esc(this.resultText(g.result))}</div>`;
    else {
      status = `<div class="status-line"><i data-pc="${Chess.KING * Chess.sign(g.current)}" data-px="20"></i><span>${esc(this.turnText())}</span></div>`;
      if (g.inCheck) status += `<div class="note danger"><b>${esc(t('Check!', '将军！'))}</b></div>`;
    }
    status += `<div class="taken">${this.takenRow(Chess.WHITE)}${this.takenRow(Chess.BLACK)}</div>`;
    status += `<div class="movelist"><span>${esc(this.moveList())}</span><span class="faint">${esc(t(`move ${g.position.fullmove}`, `第 ${g.position.fullmove} 回合`))}</span></div>`;
    let html = `<div class="panel">${status}</div>` + this.onlinePanel();
    if (over && g.moves.length) html += replayPanel(this, g.moves.length, m.review);
    const text = this.coachText();
    if (text) html += coachPanel(text);
    const offer = online && app.online.record && app.online.record.offer;
    let row = '';
    if (over) {
      const asked = online && app.online.record && app.online.record.rematch[String(m.onlineSeat)];
      row += btn('again', online ? t('Rematch', '再来') : t('Again', '再来'), 'again', { prominent: !asked });
    }
    if (!(online && over)) row += btn('undo', online ? t('Take back', '悔棋') : t('Undo', '悔棋'), 'undo', { enabled: m.canUndo && !offer });
    if (online && !over) row += btn('draw', t('Draw?', '提和'), 'offerDraw', { enabled: !offer });
    if (!over) row += btn('flag', t('Resign', '认输'), 'resign');
    row += btn('bulb', t('Coach', '教练'), 'coach', { active: m.coach });
    html += `<div class="btn-row">${row}</div>`;
    if (!online) {
      html += `<div class="btn-row">${m.seating === 'twoPlayers' ? btn('face', t('Face to face', '对坐'), 'f2f', { active: m.faceToFace }) : ''}${btn('plus', t('New game', '新对局'), 'newMenu')}</div>`;
    }
    html += viewRow('chess');
    return html;
  }

  extraAct(a) {
    if (a === 'f2f') this.model.setFaceToFace(!this.model.faceToFace);
    else if (a === 'offerDraw' && app.online) app.online.send('draw');
  }
}

// ── 屠龍 / 斬蛇 ───────────────────────────────────────────────────────────────

const INK = {
  dragon: { img: new URL('./ink/tulong.png', import.meta.url).href, ar: 445 / 884 },
  snake: { img: new URL('./ink/zhanshe.png', import.meta.url).href, ar: 444 / 813 },
};
const SEAL = new URL('./ink/seal-qi.png', import.meta.url).href;
// Load the ink, the seal and the 楷 caption's font before they are needed.
for (const src of [INK.dragon.img, INK.snake.img, SEAL]) { const i = new Image(); i.src = src; }
if (document.fonts && document.fonts.load) document.fonts.load('20px "TW-Kai Banner"', '一手提子').catch(() => {});

/** A number in Chinese numerals, as a classical caption writes it: 一手提二十六子. */
export function chineseNumber(n) {
  const d = '零一二三四五六七八九';
  if (n < 10) return d[n];
  if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
  if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
  if (n < 1000) {
    const rest = n % 100;
    return d[Math.floor(n / 100)] + '百' + (rest === 0 ? '' : (rest < 10 ? '零' : rest < 20 ? '一' : '') + chineseNumber(rest));
  }
  return String(n);
}

/** 屠龍! or 斬蛇! over the board when five stones or more are taken at once, as the app and
    the ads lay it out: the phrase in ink straight on the board (屠龍 in 苏轼's hand, gold;
    斬蛇 in 赵孟頫's, the snake's mint), the cinnabar 棊 seal at its foot, beside the column,
    and under it 一手提N子 in 楷书, or the ads' pixel type in English. */
export function showSlain(stage, slain) {
  stage.querySelectorAll('.slain').forEach((el) => el.remove());
  const dragon = slain.color === 2;
  const ink = dragon ? INK.dragon : INK.snake;
  const tint = dragon ? C.gold : C.mint;
  const box = stage.getBoundingClientRect();
  const side = Math.min(box.width, box.height);
  const h = Math.min(side * 0.5, side * 0.9);
  const el = document.createElement('div');
  el.className = 'slain';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', (dragon ? t('Dragon slain! ', '屠龙！') : t('Snake slain! ', '斩蛇！')) + t(`${slain.count} stones captured`, `提掉 ${slain.count} 子`));
  const title = dragon ? 'Dragon slain!' : 'Snake slain!', count = `${slain.count} stones captured`;
  const big = Math.min(h * 0.016, side * 0.9 / (title.length * 6)) * 7, small = Math.min(h * 0.009, side * 0.9 / (count.length * 6)) * 7;
  const words = app.lang === 'zh'
    ? `<div class="kai">一手提${chineseNumber(slain.count)}子</div>`
    : `<div class="px-title">${title}</div><div class="px-count">${count}</div>`;
  el.innerHTML = `<div class="ink-col" style="--h:${h}px;--ar:${ink.ar};--tint:${tint};--img:url('${ink.img}');--big:${big}px;--small:${small}px">
    <div class="ink"></div><img class="seal" src="${SEAL}" alt=""><div class="words">${words}</div></div>`;
  stage.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3050);
}

// ── The start screen ──────────────────────────────────────────────────────────

const GAMES = ['go', 'gomoku', 'chess'];
const CARD = {
  go: () => [t('Go · 围棋', '围棋 · Go'), t('Surround territory on 9×9 to 19×19, with a patient beginner opponent and a coach that explains every fight.', '9×9 到 19×19 围地取胜，耐心的入门对手，教练讲解每一场战斗。')],
  gomoku: () => [t('Gomoku · 五子棋', '五子棋 · Gomoku'), t('Five in a row. Three computer levels and a coach that spots wins and must-blocks.', '连成五子。三档电脑难度，教练提示必胜与必堵。')],
  chess: () => [t('Chess · 国际象棋', '国际象棋 · Chess'), t('Pebble and shell pieces on the pond. Three computer levels, a coach, and face to face on one tablet.', '卵石与贝壳棋子。三档电脑难度、教练提示，还能在一台平板上面对面下。')],
};

class Hub {
  constructor() {
    this.root = document.createElement('main');
    this.root.className = 'hub';
    this.minis = [];
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const a = el.dataset.act;
      if (a === 'open') go(el.dataset.arg);
      else if (a === 'sound') app.toggleSound();
      else if (a === 'lang') app.setLang(app.lang === 'en' ? 'zh' : 'en');
      else if (hooks.hubAct) hooks.hubAct(a, el.dataset.arg);
    });
  }
  mount(parent) { parent.appendChild(this.root); this.render(); }
  destroy() { this.minis.forEach((b) => b.destroy()); this.root.remove(); }

  render() {
    this.minis.forEach((b) => b.destroy());
    this.minis = [];
    const games = GAMES.concat(hooks.screens.mahjong ? ['mahjong'] : []);
    const count = games.length === 4 ? t('Four classic games. Learn as you play.', '四款经典棋牌游戏，边玩边学。') : t('Three classic games. Learn as you play.', '三款经典棋类游戏，边玩边学。');
    this.root.innerHTML = `
      <div class="hub-top">
        <a class="chip-btn" href="/arcade.html">${icon('back')}<span>${esc(t('Arcade', '游戏厅'))}</span></a>
        <span class="spacer"></span>
        <button class="chip-btn icon" data-act="sound" aria-label="${esc(app.soundOn ? t('Mute sounds', '静音') : t('Turn sounds on', '开启声音'))}">${icon(app.soundOn ? 'sound' : 'mute')}</button>
        <button class="chip-btn" data-act="lang">${icon('globe')}<span>${app.lang === 'en' ? '中文' : 'English'}</span></button>
      </div>
      <div class="hub-title"><h1><span>QI</span><span class="zh">· 棋</span></h1><p>${esc(count)}</p></div>
      <div class="cards${games.length === 4 ? ' four' : ''}">${games.map((g) => {
        const [title, blurb] = (CARD[g] || hooks.screens[g].card)();
        return `<button class="card" data-act="open" data-arg="${g}"><div class="mini" data-mini="${g}"></div><div><h2>${esc(title)}</h2><p>${esc(blurb)}</p><span class="go-on">${esc(t('Play', '开始'))} ${icon('back')}</span></div></button>`;
      }).join('')}</div>
      ${hooks.hubExtras ? hooks.hubExtras() : ''}
      <footer class="hub-foot">
        <span>${esc(hooks.openOnline ? t('Offline against the computer · online with a friend · no ads · no tracking', '离线对战电脑 · 在线约好友 · 无广告 · 无追踪')
          : t('Against the computer or two on one device · no ads · no tracking', '对战电脑或双人同屏 · 无广告 · 无追踪'))}</span>
        <a href="https://apps.apple.com/app/id6821608519" rel="noopener">${esc(t('Also on iPhone and iPad: Qi on the App Store →', '也有 iPhone 与 iPad 版：在 App Store 下载 Qi →'))}</a>
      </footer>`;
    this.root.querySelectorAll('[data-mini]').forEach((wrap) => this.minis.push(miniBoard(wrap, wrap.dataset.mini)));
  }
}

/** A small decorative board for the start screen's cards. */
function miniBoard(wrap, game) {
  if (game === 'chess') {
    const g = new Chess.ChessGame(Chess.Position.fromFEN('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'));
    const fake = { shownGame: g, game: g, bottomSide: 1, selected: null, legalTargets: [], coachHint: null, review: null, faceToFace: false, seating: 'youFirst', isOnline: false, promotion: null };
    const b = new ChessBoard(wrap, fake, { pieceName, farSide: () => null });
    b.update(false);
    return b;
  }
  if (hooks.screens[game] && hooks.screens[game].mini) return hooks.screens[game].mini(wrap);
  const go = game === 'go', size = go ? 9 : 15;
  const stones = new Array(size * size).fill(0);
  const black = go ? [[2, 2], [2, 6], [3, 3], [4, 4], [6, 2], [5, 3]] : [[7, 4], [6, 5], [5, 6], [4, 7], [8, 8]];
  const white = go ? [[2, 5], [3, 5], [4, 5], [4, 6], [6, 6], [5, 5]] : [[7, 5], [7, 6], [6, 7], [8, 6], [5, 8]];
  for (const [r, c] of black) stones[r * size + c] = 1;
  for (const [r, c] of white) stones[r * size + c] = 2;
  const b = new GridBoard(wrap, null);
  b.set({ size, stones, columns: go ? Go.COLUMNS : Gomoku.COLUMNS, stars: go ? Go.starPoints(9) : Gomoku.STARS,
    winLine: go ? [] : [{ r: 7, c: 4 }, { r: 4, c: 7 }], interactive: false, still: true });
  return b;
}

// ── Navigation and rendering ──────────────────────────────────────────────────

const root = document.getElementById('app');
let current = null;
const SCREENS = { go: () => new GoScreen(), gomoku: () => new GomokuScreen(), chess: () => new ChessScreen() };
export { GameScreen, GoScreen, GomokuScreen, ChessScreen, dot, coachPanel, viewRow, replayPanel };

function screenFromHash() {
  const h = location.hash.replace(/^#/, '');
  if (SCREENS[h] || (hooks.screens[h] && hooks.screens[h].make)) return h;
  return 'hub';
}

/** Shows a screen; the browser's back button returns to the start screen. */
export function go(screen) {
  if (screen === app.screen) return;
  if (screen === 'hub') {
    if (history.state && history.state.qi) history.back(); else { history.replaceState(null, '', location.pathname + location.search); show('hub'); }
  } else {
    history.pushState({ qi: screen }, '', '#' + screen);
    show(screen);
  }
}
addEventListener('popstate', () => show(screenFromHash()));

function show(screen) {
  closeSheet();
  if (current) current.destroy();
  app.screen = screen;
  const make = SCREENS[screen] || (hooks.screens[screen] && hooks.screens[screen].make);
  current = screen === 'hub' || !make ? new Hub() : make();
  if (screen !== 'hub' && !make) app.screen = 'hub';
  current.mount(root);
  window.scrollTo(0, 0);
  document.title = screen === 'hub' ? 'Qi · 棋: Go, Gomoku & Chess // Game Life' : `${current.title ? current.title() : ''} · Qi 棋`;
}

let pending = false;
export function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; if (current) current.render(); });
}
function rerender(full) {
  if (!current) return;
  if (full && current instanceof Hub) current.render();
  else scheduleRender();
}
export { rerender, show };

export function start() {
  // ?debug: the app on window, for tests and screenshots.
  if (/[?&]debug\b/.test(location.search)) window.qiApp = { app, show, go, showSlain, hooks };
  // A deep link (#go, #room/CODE, …) opens straight on its screen, with the hub behind it.
  const target = screenFromHash();
  if (target !== 'hub') {
    history.replaceState(null, '', location.pathname + location.search);
    show('hub');
    go(target);
  } else show('hub');
  // Computer moves pending from a saved game.
  app.go.scheduleAI();
  app.gomoku.scheduleAI();
  app.chess.scheduleAI();
}
