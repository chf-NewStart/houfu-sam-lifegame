/* Playing a friend online (the app's Qi/Views/OnlineViews.swift): the Play online sheet
   (start a room or join one), the room panel in a game's rail, invites, and the way back
   to a room after closing the tab. Rooms are shared with the iPhone and iPad app. */
import { app, hooks, sheet, updateSheet, sheetHead, closeSheet, esc, t, go, scheduleRender, toast, rerender } from './main.js?v=13';
import { icon } from './art.js?v=13';
import { OnlineSession } from './online.js?v=13';
import { RoomCode, ALPHABET } from './room.js?v=13';
import { loadCrypto } from './mahjong-keys.js?v=13';

/** Mahjong rooms seal each hand: the cryptography loads before a room is opened or joined
    (a join or a return may turn out to be Mahjong). Other games go on without it. */
async function withKeys(f) { try { await loadCrypto(); } catch (e) { /* not Mahjong, or offline */ } f(); }

const online = new OnlineSession();
app.online = online;
// Testing on this machine: ?relay=ws://127.0.0.1:8787 (a local relay; never on the site).
const localRelay = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('relay');
if (localRelay) online.relayURL = localRelay;
else OnlineSession.relayFromSite().then((url) => { online.relayURL = url; });

const MODELS = () => ({ go: app.go, gomoku: app.gomoku, chess: app.chess, ...(hooks.onlineModels || {}) });
let onlineGame = null;
let sheetState = null;

/** Points the right game at the room (and back to its local game when the room ends). */
function syncOnline() {
  const o = online;
  const models = MODELS();
  if (!o.active || !o.info || o.seat == null) {
    if (onlineGame) { Object.values(models).forEach((m) => m.endOnline()); onlineGame = null; }
  } else if (onlineGame !== o.info.game) {
    Object.values(models).forEach((m) => m.endOnline());
    onlineGame = o.info.game;
    const m = models[o.info.game];
    if (m) { m.beginOnline(o); go(o.info.game); }
  } else if (models[onlineGame]) {
    models[onlineGame].syncOnline();
  }
  if (sheetState && sheetState.pressed && o.seat != null) closeSheet();
  else if (sheetState) renderSheet();
  scheduleRender();
}
online.onChange = syncOnline;
document.addEventListener('visibilitychange', () => { if (!document.hidden) online.wake(); });
addEventListener('online', () => online.wake());

// ── Invites ───────────────────────────────────────────────────────────────────

export function roomLink(code) { return `https://lifegameproject.com/game/qi.html#room/${code}`; }
function inviteText(code) {
  const name = app.gameName(online.info ? online.info.game : 'chess');
  return t(`Play ${name} with me in Qi! Room code: ${code}\nIn a browser: ${roomLink(code)}\nIn the Qi app: tap Play online and enter the code, or open qigame://room/${code}`,
    `来 Qi 和我下${name}！房间码：${code}\n用浏览器打开：${roomLink(code)}\n在 Qi 应用里：点「在线对局」输入房间码，或打开 qigame://room/${code}`);
}
async function invite() {
  const code = online.code;
  if (!code) return;
  const text = inviteText(code);
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast(t('Invite copied: paste it to your friend', '邀请已复制，粘贴给好友即可')); }
  catch (e) { toast(code); }
}

// ── The room panel ────────────────────────────────────────────────────────────

function statusLine() {
  const o = online;
  if (o.problem === 'unreachable') return [t('Can\'t reach the room server. Check the connection; Qi keeps trying.', '连不上房间服务器。请检查网络，Qi 会继续尝试。'), true];
  if (!o.connected) return [t('Reconnecting…', '正在重新连接…'), true];
  if (o.waitingForSeat) return [t('Joining the room…', '正在加入房间…'), false];
  if (o.waitingForFriend) return [t('Waiting for your friend. Send them the room code: they open Qi (the app, or this page in a browser), tap Play online, and enter it.', '等待好友加入。把房间码发给对方：打开 Qi（应用或浏览器里的这个网页），点「在线对局」，输入房间码。'), false];
  if (!o.friendHere) {
    if (o.outbox.length) return [t('Your friend is away. Your move reaches them when they\'re back.', '好友暂时离开。他们回来时会收到你的这一步。'), true];
    return [t('Your friend is away. The game waits for them.', '好友暂时离开，对局会等他们回来。'), true];
  }
  return [t('Your friend is here.', '好友在线。'), false];
}

hooks.onlinePanel = (kind) => {
  const o = online;
  const dot = !o.connected ? 'var(--danger)' : o.friendHere ? 'var(--green)' : 'var(--gold)';
  const [line, warn] = statusLine();
  let html = `<div class="panel"><div class="room-line"><span class="dot" style="background:${dot}"></span><span class="label">${esc(t('ROOM', '房间'))}</span>
    <span class="code">${esc(o.code || '')}</span><button class="invite" data-act="oInvite">${icon('share')}${esc(t('Invite', '邀请'))}</button></div>
    <div class="room-status${warn ? ' warn' : ''}">${esc(line)}</div>`;
  const r = o.record, seat = o.seat;
  if (r && seat != null) {
    if (r.offer) {
      const mine = r.offer.by === seat, undo = r.offer.kind === 'undo';
      const text = mine ? (undo ? t('You asked to take back your last move.', '你请求悔棋。') : t('You offered a draw.', '你提出了和棋。'))
        : (undo ? t('Your friend asks to take back their last move.', '好友请求悔棋。') : t('Your friend offers a draw.', '好友提出和棋。'));
      html += `<div class="offer"><p>${esc(text)}</p><div class="btns">${mine
        ? `<button class="small-btn" data-act="oCancel">${esc(t('Cancel', '取消'))}</button>`
        : `<button class="small-btn prominent" data-act="oAccept">${esc(undo ? t('Allow', '同意') : t('Accept draw', '同意和棋'))}</button><button class="small-btn" data-act="oDecline">${esc(t('No', '拒绝'))}</button>`}</div></div>`;
    }
    const me = r.rematch[String(seat)] === true, friend = r.rematch[String(3 - seat)] === true;
    if (kind !== 'mahjong') {
      if (me && !friend) html += `<div class="note muted">${esc(t('Waiting for your friend to start another game. You\'ll swap sides.', '等待好友开始新的一局。双方会交换先后手。'))}</div>`;
      else if (friend && !me) html += `<div class="note gold">${esc(t('Your friend wants another game. Press Rematch to start (you swap sides).', '好友想再来一局。按「再来」开始（双方交换先后手）。'))}</div>`;
    }
    if (kind === 'go' && !r.result && app.go.game.phase === 'scoring') {
      const mine = r.agreed[String(seat)] === r.deadRev, theirs = r.agreed[String(3 - seat)] === r.deadRev;
      if (mine || theirs) {
        html += `<div class="note ${theirs && !mine ? 'gold' : 'muted'}">${esc(mine ? t('You pressed Count. Waiting for your friend to agree.', '你已按「数子」，等待好友同意。')
          : t('Your friend agrees with the dead stones. Press Count to finish.', '好友同意当前的死子标记。按「数子」结束对局。'))}</div>`;
      }
    }
  }
  return html + '</div>';
};

hooks.onlineAct = (a) => {
  switch (a) {
    case 'oInvite': invite(); return true;
    case 'oAccept': online.send('accept'); return true;
    case 'oDecline': online.send('decline'); return true;
    case 'oCancel': online.send('cancel'); return true;
    default: return false;
  }
};

// ── The Play online sheet ─────────────────────────────────────────────────────

const GAMES = () => ['go', 'gomoku', 'chess'].concat(hooks.onlineModels && hooks.onlineModels.mahjong ? ['mahjong'] : []);
function sideName(game, side) {
  if (game === 'chess') return side === 1 ? t('White (first)', '白方（先手）') : t('Black', '黑方');
  if (game === 'mahjong') return side === 1 ? t('East (deals first)', '东（先坐庄）') : t('South', '南');
  return side === 1 ? t('Black (first)', '黑棋（先手）') : t('White', '白棋');
}

hooks.openOnline = (game = 'chess', code = '') => {
  sheetState = { game: GAMES().includes(game) ? game : 'chess', size: 9, side: 0, code, pressed: null };
  renderSheet(true);
};

function seg(name, options, current) {
  return `<div class="seg" role="group">${options.map(([v, label]) => `<button data-act="seg" data-arg="${name}:${v}" class="${String(v) === String(current) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
}

function renderSheet(first) {
  const s = sheetState;
  if (!s) return;
  const valid = RoomCode.isValid(s.code);
  let status = '';
  if (s.pressed === 'join') {
    if (online.problem === 'notFound') status = `<p class="problem">${esc(t('No room with that code. Check the letters, or ask your friend for a new room (rooms close after six quiet hours).', '没有这个房间。请核对房间码，或请好友重新创建（房间六小时无人操作后关闭）。'))}</p>`;
    else if (online.problem === 'full') status = `<p class="problem">${esc(t('That room is already full.', '这个房间已经满了。'))}</p>`;
    else if (online.problem === 'unreachable') status = `<p class="problem">${esc(t('Can\'t reach the room server. Check your connection.', '连不上房间服务器，请检查网络。'))}</p>`;
    else if (online.active) status = `<p class="joining">${esc(online.waitingForSeat ? t('Waiting for your friend\'s Qi to let you in…', '等待好友的 Qi 让你加入…') : t('Joining…', '正在加入…'))}</p>`;
  } else if (s.pressed === 'create' && online.active && online.problem === 'unreachable') {
    status = `<p class="problem">${esc(t('Can\'t reach the room server. Check your connection.', '连不上房间服务器，请检查网络。'))}</p>`;
  }
  const html = sheetHead(t('Play a friend online', '和好友在线对局')) +
    `<h3>${esc(t('Start a room', '创建房间'))}</h3>` +
    seg('game', GAMES().map((g) => [g, { go: t('Go', '围棋'), gomoku: t('Gomoku', '五子棋'), chess: t('Chess', '国际象棋'), mahjong: t('Mahjong', '麻将') }[g]]), s.game) +
    (s.game === 'go' ? seg('size', [9, 13, 19].map((n) => [n, `${n}×${n}`]), s.size) : '') +
    (s.game === 'mahjong' ? '' : seg('side', [[0, t('Random', '随机')], [1, sideName(s.game, 1)], [2, sideName(s.game, 2)]], s.side)) +
    `<button class="big-btn" data-act="create">${esc(t('Create room', '创建房间'))}</button>` +
    `<h3>${esc(t('Join a friend', '加入好友的房间'))}</h3>` +
    `<input class="code-input" id="qiCode" value="${esc(s.code)}" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('ROOM CODE', '房间码'))}" aria-label="${esc(t('Room code', '房间码'))}">` +
    `<button class="big-btn" data-act="join"${valid ? '' : ' disabled'}>${esc(t('Join', '加入'))}</button>${status}` +
    `<p class="fine">${esc(t('Rooms run on lifegameproject.com\'s game server, shared with the Qi app on iPhone and iPad. Only the moves travel, never a name. A room closes after six quiet hours.', '房间运行在 lifegameproject.com 的游戏服务器上，与 iPhone、iPad 上的 Qi 应用互通。只传送棋步，不传送名字。房间六小时无人操作后关闭。'))}</p>`;
  const actions = {
    seg: (arg) => { const [k, v] = arg.split(':'); s[k] = k === 'game' ? v : Number(v); renderSheet(); },
    create: () => {
      s.pressed = 'create';
      const side = s.side === 0 ? (Math.random() < 0.5 ? 1 : 2) : s.side;
      const go = () => { online.create(s.game, s.size, s.game === 'mahjong' ? 0 : side); renderSheet(); };
      if (s.game === 'mahjong') withKeys(go); else go();
    },
    join: () => {
      if (!RoomCode.isValid(s.code)) return;
      s.pressed = 'join';
      withKeys(() => { online.join(s.code); renderSheet(); });
    },
  };
  const focused = document.activeElement && document.activeElement.id === 'qiCode';
  const caret = focused ? document.activeElement.selectionStart : null;
  if (first || !document.getElementById('qiCode')) sheet(html, { small: true, actions, onClose: () => { sheetState = null; } });
  else updateSheet(html, actions);
  if (focused) { const i = document.getElementById('qiCode'); i.focus(); i.setSelectionRange(caret, caret); }
  const input = document.getElementById('qiCode');
  input.addEventListener('input', () => {
    const cleaned = (RoomCode.find(input.value) || input.value.toUpperCase().split('').filter((c) => ALPHABET.includes(c)).join('')).slice(0, 7);
    if (cleaned !== input.value) input.value = cleaned;
    s.code = cleaned;
    const b = document.querySelector('.sheet [data-act="join"]');
    if (b) b.disabled = !RoomCode.isValid(cleaned);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join(); });
}

// ── The start screen ──────────────────────────────────────────────────────────

hooks.hubExtras = () => {
  const s = online.saved;
  const back = s && !online.active ? `<div class="saved-room">
      <button class="resume" data-act="oResume"><b>${esc(t('Back to your room', '回到你的房间'))}</b><small>${esc(app.gameName(s.game))} · ${esc(s.code)}</small></button>
      <button class="forget" data-act="oForget" aria-label="${esc(t('Forget this room', '忘记这个房间'))}">${icon('close')}</button></div>` : '';
  return `<div class="online-row"><button class="online-btn" data-act="oOpen">${icon('globe')}<span><b>${esc(t('Play online', '在线对局'))}</b><small>${esc(t('Invite a friend with a room code, on the web or in the Qi app', '用房间码邀请好友，网页和 Qi 应用都能加入'))}</small></span></button>${back}</div>`;
};

hooks.hubAct = (a) => {
  if (a === 'oOpen') hooks.openOnline('chess');
  else if (a === 'oResume') withKeys(() => online.resumeSaved());
  else if (a === 'oForget') { online.forgetSaved(); rerender(true); }
};

/** #room/CODE (an invite link): open the online sheet on that code. */
export function openFromHash() {
  const code = RoomCode.find(location.hash);
  if (/^#room\//i.test(location.hash) && code) {
    history.replaceState(null, '', location.pathname + location.search);
    hooks.openOnline('chess', code);
    return true;
  }
  return false;
}
addEventListener('hashchange', () => openFromHash());
