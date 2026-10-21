/* Plank Plank Plank! online (game/plank-duel.html): the Plank Constant app's plank duel in any
   browser, against a friend in another browser or in the app, by room code. Rooms run on the
   arcade's relay (relay/), reachable where Google is not; the room contract is plank-online.js.
   The creator hosts and runs the duel (plank-duel-engine.js); the guest sends only its move.
   Face tracking runs in this browser from files on this site (vendor/mediapipe), and the
   camera picture never leaves the device. */
import { DuelMatch, kitForRound, KIT_NAMES, RIVALS } from './plank-duel-engine.js?v=1';
import {
  PlankRoom, ROOM_RE, PID_RE, makeRoomCode, makePid, normalizeRoomCode, roomLink, acceptableRelay, DEFAULT_RELAY,
} from './plank-online.js?v=2';
import { DuelRenderer } from './plank-duel-renderer.js?v=1';
import { PlankCamera } from './plank-camera.js?v=11';

const $ = id => document.getElementById(id);
const copy = {
  brandSub: ['PLANK CONSTANT · ONLINE DUEL', '平板支撑常数 · 在线对决'],
  soundOn: ['Sound on', '声音开'], soundOff: ['Sound off', '声音关'],
  lobbyKicker: ['PLANK PLANK PLANK! · ONLINE', 'PLANK PLANK PLANK! · 在线'],
  lobbyTitle: ['Duel a friend, anywhere.', '和朋友对决，不论身在何处。'],
  lobbyIntro: ['Both of you hold a plank and fight on a plank over the water. Shift right to strike, left to block. Share a room code: any phone or laptop with a browser can join, no app or account needed.',
    '你们俩一边做平板支撑，一边在水面上的木板上对决。头向右移攻击，向左移格挡。分享房间码即可：任何有浏览器的手机或电脑都能加入，不用装 App，也不用注册。'],
  create: ['Create a room', '创建房间'], join: ['Join', '加入'], codePlaceholder: ['ROOM CODE', '房间码'],
  cpu: ['Practice against the computer', '先和电脑练练'],
  lobbyFine: ['Friends with the Plank Constant iPhone app can join with the same code. The camera picture never leaves your device: the room only hears your move.',
    '有 Plank Constant iPhone App 的朋友也可以用同一个房间码加入。摄像头画面不会离开你的设备：房间只收到你的动作。'],
  roomCode: ['ROOM', '房间'], share: ['Share', '分享'], copied: ['Invite link copied.', '邀请链接已复制。'],
  shareText: ['Duel me in Plank Plank Plank! Room', '来 Plank Plank Plank! 和我对决！房间'],
  roomKickerHost: ['YOUR ROOM · YOU HOST', '你的房间 · 你是房主'], roomKickerGuest: ['YOUR FRIEND\'S ROOM', '朋友的房间'],
  practiceKicker: ['PRACTICE · AGAINST THE COMPUTER', '练习 · 对战电脑'],
  lengthLegend: ['PLANK LENGTH', '平板支撑时长'],
  lengthHost: ['You pick the length for both of you.', '由你为双方选择时长。'],
  lengthGuest: ['Your friend picks the length.', '时长由朋友（房主）选择。'],
  controlLegend: ['HOW YOU PLAY', '操作方式'],
  faceControl: ['Head shift', '头部平移'], browControl: ['Eyebrows', '眉毛'], touchControl: ['Touch / keys', '触屏 / 键盘'],
  faceCopy: ['Shift your head right and hold to STRIKE, left to BLOCK, middle to rest. Block when your rival hits hard; strike when it tires.',
    '头向右移并保持＝攻击，向左＝格挡，回到中间＝休息。对方猛攻时格挡，对方没力气时进攻。'],
  browCopy: ['Hold your eyebrows up to STRIKE; relax them to rest.', '抬眉并保持＝攻击，放松＝休息。'],
  touchCopy: ['Hold the right half of the screen (or → / D) to STRIKE, the left half (or ← / A) to BLOCK.', '按住屏幕右半边（或 → / D）攻击，左半边（或 ← / A）格挡。'],
  setUp: ['Set up the camera', '设置摄像头'], imReady: ['I\'m ready', '我准备好了'],
  leave: ['Leave the room', '离开房间'], back: ['Back', '返回'],
  connecting: ['Connecting to the room…', '正在连接房间……'], reconnecting: ['Connection lost · reconnecting…', '连接中断 · 正在重新连接……'],
  waitingFriend: ['Waiting for a friend to join… Send them the link or the code.', '等待朋友加入……把链接或房间码发给对方。'],
  waitingHost: ['Joining… waiting for the host to let you in.', '正在加入……等待房主让你进入。'],
  friendHereWeb: ['Your friend is here (in a browser).', '朋友已进入（浏览器）。'],
  friendHereApp: ['Your friend is here (in the iPhone app).', '朋友已进入（iPhone App）。'],
  friendAway: ['Your friend\'s connection dropped · waiting for them…', '朋友掉线了 · 正在等待……'],
  friendJoined: ['Your friend is here!', '朋友来了！'], friendLeft: ['Your friend left.', '朋友离开了。'],
  setupKicker: ['CAMERA SETUP', '摄像头设置'],
  startingCamera: ['Starting the camera…', '正在启动摄像头……'],
  startingCopy: ['Allow the camera when asked. The first time, loading face tracking can take a few seconds.', '浏览器询问时请允许使用摄像头。第一次加载面部追踪可能需要几秒钟。'],
  frameTitle: ['Get into your plank.', '进入平板支撑姿势。'],
  frameCopy: ['Put the phone or laptop in front of you with your face in view, and face the screen.', '把手机或电脑放在面前，让脸出现在画面中，面向屏幕。'],
  noFace: ['Looking for your face…', '正在寻找你的脸……'],
  centerTitle: ['Hold still · 2 seconds', '保持不动 · 2 秒'],
  centerCopy: ['Relax in your plank and look at the screen. This becomes your middle.', '保持平板支撑，自然看着屏幕。这会被记为你的中间位置。'],
  rightTitle: ['Now shift a little to your right.', '现在头稍微向右移。'], rightCopy: ['That\'s STRIKE.', '这就是攻击。'],
  leftTitle: ['And a little to your left.', '再稍微向左移。'], leftCopy: ['That\'s BLOCK. Back to the middle is rest.', '这就是格挡。回到中间就是休息。'],
  browUpTitle: ['Raise your eyebrows and hold.', '抬起眉毛并保持。'], browUpCopy: ['That\'s STRIKE.', '这就是攻击。'],
  browRelaxTitle: ['Now relax them.', '现在放松眉毛。'], browRelaxCopy: ['Relaxed is rest.', '放松就是休息。'],
  cameraError: ['The camera or face tracking couldn\'t start in this browser.', '这个浏览器无法启动摄像头或面部追踪。'],
  cameraErrorCopy: ['Check the camera permission, or play with touch / keys.', '请检查摄像头权限，或改用触屏 / 键盘。'],
  useTouch: ['Play with touch / keys', '改用触屏 / 键盘'],
  readyKicker: ['READY', '已准备'], readyTitle: ['Ready!', '准备好了！'],
  readyCopy: ['Hold your plank position. When your friend is ready too, the duel starts with a countdown on both screens.', '保持平板支撑姿势。朋友也准备好后，双方屏幕会同时倒计时开始。'],
  readyAlone: ['Waiting for a friend to join the room. Send them the link or the code.', '等待朋友加入房间。把链接或房间码发给对方。'],
  enGarde: ['En garde…', '准备……'],
  you: ['YOU', '你'], friend: ['FRIEND', '朋友'],
  groundLabel: ['HP', '血量'], strengthLabel: ['STRENGTH', '力量'], tiredLabel: ['TIRED', '累了'],
  round: ['ROUND', '回合'], stop: ['End', '结束'],
  zoneBlock: ['HOLD · BLOCK', '按住 · 格挡'], zoneStrike: ['HOLD · STRIKE', '按住 · 攻击'],
  pillBlock: ['← BLOCK', '← 格挡'], pillStrike: ['STRIKE →', '攻击 →'], pillBrow: ['EYEBROWS UP · STRIKE', '抬眉 · 攻击'],
  youWinRound: ['YOU WIN THE ROUND!', '你赢下这一回合！'],
  friendWinsRound: ['SPLASH! YOUR FRIEND WINS THE ROUND', '扑通！朋友赢下这一回合'],
  rivalWinsRound: ['SPLASH! THE {r} WINS THE ROUND', '扑通！{r}赢下这一回合'],
  countered: ['COUNTERED!', '被反击了！'], blockedToast: ['BLOCKED! STRIKE →', '挡住了！快攻击 →'],
  holdMine: ['Duel on hold: bring your face back into view.', '对决暂停：请让脸回到画面中。'],
  holdFriend: ['Duel on hold: your friend\'s face is out of view.', '对决暂停：朋友的脸离开了画面。'],
  pausedFriend: ['Your friend paused the duel.', '朋友暂停了对决。'],
  quietHost: ['Waiting for your friend\'s screen… (is it locked, or another app in front?)', '等待朋友的画面……（对方是否锁屏或切换到了其他应用？）'],
  complete: ['DUEL COMPLETE', '对决结束'], stopped: ['DUEL ENDED', '对决已结束'],
  youWin: ['You won the duel!', '你赢了！'], friendWon: ['Your friend won the duel.', '朋友赢了。'],
  rivalWon: ['The {r} won the duel.', '{r}赢了。'], draw: ['Dead even.', '势均力敌。'],
  completeCopy: ['A whole plank, done. Time for a breather.', '完成了一整组平板支撑，休息一下吧。'],
  friendLeftDuring: ['Your friend left the duel.', '朋友离开了对决。'],
  roundsWon: ['Rounds won', '赢的回合'], roundsLost: ['Rounds lost', '输的回合'], seconds: ['Seconds', '秒'],
  again: ['Duel again', '再来一局'], rest: ['Take a breather. Your next duel can wait.', '休息一下，下一局不着急。'],
  problemKicker: ['ROOM', '房间'],
  notFound: ['No room with that code. Check the code, or ask for the link again.', '没有这个房间码对应的房间。请检查房间码，或重新索取链接。'],
  full: ['That room already has two players.', '这个房间已经有两位玩家了。'],
  taken: ['Couldn\'t create the room. Please try again.', '无法创建房间，请重试。'],
  removed: ['You\'re no longer in that room.', '你已不在这个房间中。'],
  hostLeft: ['Your friend closed the room.', '朋友关闭了房间。'],
  unreachable: ['Can\'t reach the game server. Check your connection and try again; practice against the computer still works.', '无法连接游戏服务器。请检查网络后重试；和电脑练习仍然可以玩。'],
  badCode: ['Enter the 7-character room code or paste the invite link.', '请输入 7 位房间码或粘贴邀请链接。'],
  online: ['Online', '在线'], offline: ['Offline', '离线'],
  toFlight: ['Plank Constant: the space flight →', '平板支撑常数：太空飞行 →'],
};
const RIVAL_ZH = { GOAT: '山羊', GOLEM: '石巨人', YETI: '雪人', CRAB: '螃蟹', ROBOT: '机器人' };

let lang = 'en';
try {
  const saved = localStorage.getItem('arcade_lang');
  lang = saved === 'zh' || (!saved && /^zh/i.test(navigator.language || '')) ? 'zh' : 'en';
} catch {}
const li = () => lang === 'zh' ? 1 : 0;
const t = (key, r) => (copy[key]?.[li()] ?? key).replace('{r}', r ?? '');
const rivalName = place => lang === 'zh' ? RIVAL_ZH[RIVALS[place]] : RIVALS[place];

/* Local testing only: ?relay=ws://127.0.0.1:8787 points at `wrangler dev`, &autoplay=1 plays this
   page's side by itself (and gets ready, and plays again), &len=30 picks the host's length. */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const params = new URLSearchParams(location.search);
const RELAY_OVERRIDE = LOCAL && acceptableRelay(params.get('relay')) ? params.get('relay') : '';
const AUTOPLAY = LOCAL && params.get('autoplay') === '1';

const TH = 0.04;            // a head shift this big (of the frame width) is a move, like the flight's default
const COUNTDOWN = 3000;     // ms, as in the app (3, 2, 1)
const FACE_FRESH = 700;     // ms: a face sample older than this means the face is gone

const arena = document.querySelector('.arena');
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const video = $('camera');
const renderer = new DuelRenderer();

const S = {
  phase: 'lobby',           // lobby | room | setup | waiting | countdown | playing | results | problem
  mode: null,               // 'online' | 'cpu'
  control: 'face',
  duration: 60,
  match: null,              // host/CPU: the duel; guest: the view of the host's duel
  role: null,               // 'host' | 'guest' | 'cpu' for the duel in progress
  action: 'rest',
  countdownEnd: 0,
  friendPaused: false,
  banner: { text: '', until: 0 },
  endNote: '',
  lastSnap: null, snapAt: 0, shownLine: 0,
  status: '', statusErr: false,
};
let room = null;
const net = { ws: null, connected: false, everOpened: false, attempts: 0, timer: null, lastHeard: 0, lastPing: 0, lastWho: 0, openDeadline: 0 };
let relayUrl = RELAY_OVERRIDE || DEFAULT_RELAY;
const idle = new DuelMatch({ duration: 60, seed: 0 });

// MARK: Sound

let sound = true, audio = null;
try { sound = localStorage.getItem('plank_duel_sound') !== '0'; } catch {}
function unlockAudio() {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch {}
}
function tone(frequency, length = 0.12, type = 'square', gain = 0.05) {
  if (!sound || !audio || audio.state !== 'running') return;
  const osc = audio.createOscillator(), g = audio.createGain();
  osc.type = type; osc.frequency.value = frequency;
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
  osc.connect(g).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + length);
}
function blow(kit, blocked) {
  if (blocked) { tone(kit === 'gloves' || kit === 'pillow' ? 300 : 1180, kit === 'sword' || kit === 'pan' ? 0.3 : 0.06, 'sine', 0.06); return; }
  const f = { sword: 180, gloves: 150, hammer: 120, pan: 520, pillow: 240 }[kit] || 150;
  tone(f * (0.94 + Math.random() * 0.12), 0.11, kit === 'pan' ? 'square' : 'sine', 0.09);
}
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });

// MARK: Camera

let camera = null, cameraReady = false, cameraStarting = false;
let lastSample = null, filteredX = 0.5, center = 0.5, neutralBrow = 0.05, calibrated = false;
const calib = { stage: null, since: 0, xs: [], brows: [], held: 0 };
const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

function faceVisible(now) {
  if (S.control === 'touch' || AUTOPLAY) return true;
  return !!lastSample && lastSample.visible && lastSample.faces.length > 0 && now - lastSample.time < FACE_FRESH;
}

async function startCamera() {
  if (cameraReady || cameraStarting) return cameraReady;
  cameraStarting = true;
  camera ??= new PlankCamera(video, { onSample, onError: () => {}, onStatus: () => {} });
  try {
    const ok = await camera.start({ numFaces: 1 });
    cameraReady = !!ok;
  } catch (error) {
    cameraReady = false;
  }
  cameraStarting = false;
  return cameraReady;
}
function stopCamera() {
  try { camera?.stop(); } catch {}
  cameraReady = false; calibrated = false; lastSample = null;
}

function onSample(sample) {
  lastSample = sample;
  const face = sample.visible ? sample.faces[0] : null;
  if (!face) {
    if (S.phase === 'setup' && (calib.stage === 'frame' || calib.stage === 'center')) { calib.since = 0; calib.xs = []; calib.brows = []; }
    if (S.phase !== 'setup') S.action = S.control === 'touch' ? S.action : 'rest';
    return;
  }
  filteredX += (face.x - filteredX) * 0.55;
  if (S.phase === 'setup') calibrate(sample.time, face);
  else if (calibrated && S.control !== 'touch') readMove(face);
}

/* Shift right (your right) and hold to strike, left to block; eyebrows up to strike. A little
   hysteresis so a move doesn't flicker at the threshold. The camera's x is not mirrored: a move
   to your right lowers it. */
function readMove(face) {
  if (AUTOPLAY) return;
  if (S.control === 'brow') {
    const lift = face.brow - neutralBrow;
    S.action = lift >= (S.action === 'strike' ? 0.08 : 0.12) ? 'strike' : 'rest';
    return;
  }
  const offset = center - filteredX;
  if (offset > TH * (S.action === 'strike' ? 0.6 : 1)) S.action = 'strike';
  else if (offset < -TH * (S.action === 'block' ? 0.6 : 1)) S.action = 'block';
  else S.action = 'rest';
}

function setStage(stage, now) {
  Object.assign(calib, { stage, since: now || 0, xs: [], brows: [], held: 0 });
  renderSetup();
}

function calibrate(now, face) {
  const holdFor = (ok, ms, next) => {
    if (!ok) { calib.held = 0; return; }
    calib.held ||= now;
    if (now - calib.held >= ms) next();
  };
  switch (calib.stage) {
    case 'frame':
      calib.since ||= now;
      if (now - calib.since >= 800) setStage('center', now);
      break;
    case 'center':
      calib.since ||= now;
      calib.xs.push(face.x); calib.brows.push(face.brow);
      if (Math.max(...calib.xs) - Math.min(...calib.xs) > 0.055) { calib.xs = [face.x]; calib.brows = [face.brow]; calib.since = now; }
      else if (now - calib.since >= 2000) {
        center = median(calib.xs); neutralBrow = median(calib.brows); filteredX = center;
        setStage(S.control === 'brow' ? 'browUp' : 'right', now);
      }
      break;
    case 'right': holdFor(center - filteredX > TH, 250, () => { tone(520, 0.08); setStage('left', now); }); break;
    case 'left': holdFor(filteredX - center > TH, 250, () => { tone(440, 0.08); calibrationDone(); }); break;
    case 'browUp': holdFor(face.brow - neutralBrow >= 0.12, 300, () => { tone(520, 0.08); setStage('browRelax', now); }); break;
    case 'browRelax': holdFor(face.brow - neutralBrow < 0.06, 300, () => { tone(440, 0.08); calibrationDone(); }); break;
  }
  if (S.phase === 'setup') renderSetupMeters();
}

function calibrationDone() {
  calibrated = true;
  calib.stage = null;
  getReady();
}

// MARK: Touch and keys

const held = { zones: new Map(), keyBlock: false, keyStrike: false };
function touchAction() {
  const zones = [...held.zones.values()];
  if (zones.includes('strike') || held.keyStrike) return 'strike';
  if (zones.includes('block') || held.keyBlock) return 'block';
  return 'rest';
}
function zoneOf(event) {
  const rect = $('zones').getBoundingClientRect();
  return event.clientX - rect.left < rect.width / 2 ? 'block' : 'strike';
}
$('zones').addEventListener('pointerdown', e => { e.preventDefault(); $('zones').setPointerCapture?.(e.pointerId); held.zones.set(e.pointerId, zoneOf(e)); renderZones(); });
$('zones').addEventListener('pointermove', e => { if (held.zones.has(e.pointerId)) { held.zones.set(e.pointerId, zoneOf(e)); renderZones(); } });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('zones').addEventListener(type, e => { held.zones.delete(e.pointerId); renderZones(); });
}
function renderZones() {
  const zones = [...held.zones.values()];
  for (const div of $('zones').children) div.classList.toggle('held', zones.includes(div.dataset.zone));
}
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) { held.keyBlock = true; e.preventDefault(); }
  if (['ArrowRight', 'd', 'D'].includes(e.key)) { held.keyStrike = true; e.preventDefault(); }
});
addEventListener('keyup', e => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) held.keyBlock = false;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) held.keyStrike = false;
});
addEventListener('blur', () => { held.zones.clear(); held.keyBlock = held.keyStrike = false; });

let autoNext = 0;
function autoAction(now) {
  if (now < autoNext) return S.action;
  const r = Math.random();
  autoNext = now + 400 + Math.random() * 1200;
  return r < 0.45 ? 'strike' : r < 0.75 ? 'block' : 'rest';
}

// MARK: The relay

async function loadRelay() {
  if (RELAY_OVERRIDE) return RELAY_OVERRIDE;
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2500);
    const response = await fetch('relay.json', { cache: 'no-cache', signal: abort.signal });
    clearTimeout(timer);
    const config = await response.json();
    if (acceptableRelay(config.relay)) return config.relay;
  } catch {}
  return DEFAULT_RELAY;
}

function pidFor(code) {
  try {
    const key = 'plank_pid_' + code;
    let pid = sessionStorage.getItem(key);
    if (!pid || !PID_RE.test(pid)) { pid = makePid(); sessionStorage.setItem(key, pid); }
    return pid;
  } catch { return makePid(); }
}

function connect() {
  closeSocket();
  const url = relayUrl.replace(/\/+$/, '') + '/room/' + encodeURIComponent(room.code) + '?id=' + encodeURIComponent(room.pid);
  let ws;
  try { ws = new WebSocket(url); } catch { socketClosed(); return; }
  net.ws = ws; net.connected = false; net.lastHeard = Date.now(); net.openDeadline = Date.now() + 12000;
  ws.onmessage = event => {
    if (ws !== net.ws || !room) return;
    net.lastHeard = Date.now();
    let m; try { m = JSON.parse(event.data); } catch { return; }
    if (m.t === 'init') { net.connected = true; net.everOpened = true; net.attempts = 0; room.opened(m.d || {}, Array.isArray(m.who) ? m.who : []); }
    else if (m.t === 'u') room.update(m.p, m.v ?? null);
    else if (m.t === 'who') room.presence(Array.isArray(m.ids) ? m.ids : []);
    renderRoom();
  };
  ws.onclose = () => { if (ws === net.ws) socketClosed(); };
  ws.onerror = () => {};
}

function closeSocket() {
  const ws = net.ws;
  net.ws = null; net.connected = false;
  if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch {} }
}

function socketClosed() {
  net.connected = false; net.ws = null;
  renderRoom();
  if (!room || room.problem) return;
  if (!net.everOpened && net.attempts >= 2) { problem('unreachable'); return; }
  const delay = Math.min(10000, 1000 * 2 ** net.attempts);
  net.attempts++;
  clearTimeout(net.timer);
  net.timer = setTimeout(() => { if (room && !net.connected) connect(); }, delay);
}

function send(message) {
  if (net.ws && net.connected && net.ws.readyState === 1) net.ws.send(JSON.stringify(message));
}

setInterval(() => {
  if (!room) return;
  const now = Date.now();
  if (net.ws && !net.connected && net.openDeadline && now > net.openDeadline) { net.openDeadline = 0; try { net.ws.close(); } catch {} socketClosed(); return; }
  if (net.connected) {
    if (now - net.lastHeard > 25000) { closeSocket(); socketClosed(); return; }
    if (now - net.lastPing >= 10000) { net.lastPing = now; send({ t: 'ping' }); }
    if (now - net.lastWho >= 15000) { net.lastWho = now; send({ t: 'who' }); }
  }
  room.tick(performance.now());
}, 250);

// MARK: Rooms

async function enterRoom(code, creating) {
  leaveRoom(false);
  S.mode = 'online';
  const pid = pidFor(code);
  room = new PlankRoom({ code, pid, creating, app: 'web', write: (p, v) => send({ t: 'set', p, v }), now: () => performance.now() });
  room.on('role', () => renderRoom())
    .on('friend', here => { toast(t(here ? 'friendJoined' : 'friendLeft')); if (!here) friendGone(); renderRoom(); })
    .on('start', (seed, len) => startDuel(seed, len))
    .on('event', (event, round) => react(event, round))
    .on('pause', paused => { S.friendPaused = paused; })
    .on('finished', () => guestFinished())
    .on('problem', code => problem(code))
    .on('change', () => renderRoom());
  Object.assign(net, { everOpened: false, attempts: 0 });
  history.replaceState(null, '', roomQuery(code));
  show('room');
  renderRoom();
  relayUrl = await loadRelay();
  if (room && room.code === code) connect();
}

function leaveRoom(toLobby = true) {
  clearTimeout(net.timer);
  if (room) {
    room.leave();
    const ws = net.ws;
    net.ws = null;
    if (ws) setTimeout(() => { try { ws.onclose = null; ws.close(); } catch {} }, 300);
  }
  room = null;
  net.connected = false;
  S.mode = null;
  if (toLobby) {
    S.match = null; S.role = null;
    history.replaceState(null, '', location.pathname + localQuery());
    show('lobby');
  }
}

function localQuery() {
  const keep = new URLSearchParams();
  if (RELAY_OVERRIDE) keep.set('relay', RELAY_OVERRIDE);
  if (AUTOPLAY) keep.set('autoplay', '1');
  if (LOCAL && params.get('len')) keep.set('len', params.get('len'));
  const q = keep.toString();
  return q ? '?' + q : '';
}
function roomQuery(code) {
  const q = localQuery();
  return location.pathname + '?room=' + encodeURIComponent(code) + (q ? '&' + q.slice(1) : '');
}
function inviteLink() {
  return RELAY_OVERRIDE ? location.origin + roomQuery(room.code) : roomLink(room.code);
}

function problem(code) {
  closeSocket();
  clearTimeout(net.timer);
  if (S.phase === 'countdown' || S.phase === 'playing') { S.endNote = t(code === 'hostLeft' ? 'friendLeftDuring' : code); endDuel(false); room = null; return; }
  room = null;
  S.mode = null;
  history.replaceState(null, '', location.pathname + localQuery());
  message({ kicker: t('problemKicker'), title: t(code), back: 'lobby' });
}

/** The friend left (or was gone too long). A duel in progress ends with the results. */
function friendGone() {
  if (S.phase === 'countdown' || S.phase === 'playing') {
    S.endNote = t('friendLeftDuring');
    endDuel(false);
  }
}

// MARK: Getting ready

function chooseControl(control) {
  S.control = control;
  for (const b of $('controls').children) b.setAttribute('aria-pressed', String(b.dataset.control === control));
  renderRoom();
}

async function readyClicked() {
  unlockAudio();
  if (S.control === 'touch' || AUTOPLAY) { getReady(); return; }
  if (calibrated && cameraReady) { getReady(); return; }
  show('setup');
  setStage('starting');
  const ok = await startCamera();
  if (S.phase !== 'setup') return;
  if (!ok) {
    message({ kicker: t('setupKicker'), title: t('cameraError'), copy: t('cameraErrorCopy'),
      primary: [t('useTouch'), () => { chooseControl('touch'); show('room'); }], back: 'room' });
    return;
  }
  setStage('frame');
}

function getReady() {
  if (S.mode === 'cpu') { startDuel(Math.floor(Math.random() * 4294967296) >>> 0, S.duration); return; }
  if (!room) return;
  room.setReady(S.duration);
  if (S.phase !== 'countdown' && S.phase !== 'playing') show('waiting');
}

function backFromWaiting() {
  if (room && room.localReady) room.unready();
  show(S.mode ? 'room' : 'lobby');
}

// MARK: The duel

function startDuel(seed, len) {
  S.duration = len;
  S.role = S.mode === 'cpu' ? 'cpu' : room && room.isGuest ? 'guest' : 'host';
  S.match = new DuelMatch({ duration: len, versusCPU: S.role === 'cpu', seed, twoMoves: S.control !== 'brow' || S.role !== 'cpu' });
  S.lastSnap = null; S.snapAt = 0; S.shownLine = 0;
  S.friendPaused = false;
  S.endNote = '';
  S.banner = { text: '', until: 0 };
  S.countdownEnd = performance.now() + COUNTDOWN;
  show('countdown');
  tone(440, 0.1);
}

function step(dt, now) {
  const match = S.match;
  if (S.role === 'guest') { followHost(dt, now); return; }
  const mine = faceVisible(now);
  const theirs = S.role === 'cpu' ? true : room ? room.peerVisible : true;
  const holding = !mine || !theirs || S.friendPaused;
  if (!holding) {
    const peer = S.role === 'cpu' ? 'rest' : room ? room.peerAction : 'rest';
    for (const event of match.advance(dt, [S.action, peer])) {
      if (room && S.role === 'host') room.sendEvent(event, match.round);
      react(event, match.round);
    }
  }
  if (room && S.role === 'host') room.hostTick(match, holding, now);
  S.holding = holding ? (!mine ? 'mine' : S.friendPaused ? 'paused' : 'friend') : null;
  if (match.done) {
    if (room && S.role === 'host') room.finish(match);
    endDuel(true);
  }
}

/** Guest: draw the host's duel mirrored (you on the left), eased between its 4-a-second snapshots,
    with your own pose straight from your own move so it answers at once. */
function followHost(dt, now) {
  const view = S.match, snap = room && room.snapshot;
  S.holding = !faceVisible(now) ? 'mine' : S.friendPaused ? 'paused' : null;
  if (snap && snap !== S.lastSnap) { S.lastSnap = snap; S.snapAt = now; }
  // Snapshots come 4 times a second while the host plays; silence means their screen stopped.
  if (!S.holding && now - Math.max(S.snapAt, S.countdownEnd) > 2500) S.holding = 'quiet';
  if (!snap) return;
  view.show(snap, true);
  const target = view.line;
  if (snap.loser != null || Math.abs(target - S.shownLine) > 0.6) S.shownLine = target;
  else S.shownLine += (target - S.shownLine) * Math.min(1, dt * 10);
  view.line = S.shownLine;
  if (!snap.holding) view.elapsed = Math.min(snap.elapsed + Math.min(0.4, (now - S.snapAt) / 1000), view.duration);
  if (snap.holding && !S.holding) S.holding = 'friend';
  const me = view.sides[0];
  if (!me.exhausted && !(view.elapsed < me.staggeredUntil) && snap.loser == null) {
    me.striking = S.action === 'strike';
    me.blocking = S.action === 'block';
  }
}

function guestFinished() {
  if (!S.match || !room || !room.snapshot) return;
  S.match.show(room.snapshot, true);
  endDuel(true);
}

function endDuel(complete) {
  if (S.phase !== 'countdown' && S.phase !== 'playing') return;
  S.complete = complete;
  tone(660, 0.3);
  if (room) room.resetForNextDuel();
  show('results');
  renderResults();
}

function stopClicked() {
  if (!S.match) return;
  const guest = S.role === 'guest';
  if (S.role === 'host' && room) room.finish(S.match);
  endDuel(false);
  // A guest who ends the duel leaves the room, as in the app; the host's End ends it for both.
  if (guest) { leaveRoom(false); S.mode = 'online'; renderResults(); }
}

function react(event, round) {
  const match = S.match;
  if (!match) return;
  const now = performance.now();
  switch (event.kind) {
    case 'lunge': tone(150, 0.14); break;
    case 'danger': if (event.side === 0) tone(90, 0.2); break;
    case 'fall': {
      const winner = 1 - event.side;
      tone(200, 0.1); setTimeout(() => tone(120, 0.3), 110);
      const text = winner === 0 ? t('youWinRound') : S.role === 'cpu' ? t('rivalWinsRound', rivalName(match.place)) : t('friendWinsRound');
      S.banner = { text, until: now + 1500 };
      break;
    }
    case 'round': {
      const n = round ?? match.round;
      S.banner = { text: `${t('round')} ${n} · ${KIT_NAMES[kitForRound(n)][li()]}`, until: now + 1800 };
      tone(660, 0.12);
      break;
    }
    case 'countered': S.banner = { text: t('countered'), until: now + 1300 }; tone(100, 0.25); break;
    case 'blocked': toast(t('blockedToast')); tone(880, 0.1); break;
  }
}

// MARK: Screens

function show(phase) {
  S.phase = phase;
  const panels = { lobby: 'lobby', room: 'room', setup: 'setup', waiting: 'message', problem: 'message', results: 'results' };
  for (const id of ['lobby', 'room', 'setup', 'message', 'results']) $(id).hidden = panels[phase] !== id;
  const playing = phase === 'countdown' || phase === 'playing';
  arena.classList.toggle('playing', playing);
  $('hud').hidden = !playing;
  $('moves').hidden = !playing || S.control === 'touch';
  $('zones').hidden = !playing || S.control !== 'touch';
  if (!playing) { $('notice').hidden = true; $('banner').textContent = ''; $('big-count').textContent = ''; }
  // The camera: a big preview while setting up, a small one in the corner during the duel.
  const camOn = cameraReady || cameraStarting;
  if (phase === 'setup') { $('viewfinder').appendChild(video); arena.dataset.camera = 'setup'; }
  else { if (video.parentElement !== arena) canvas.after(video); arena.dataset.camera = camOn && S.control !== 'touch' && (playing || phase === 'waiting') ? 'preview' : 'off'; }
  if (camOn) video.play?.().catch(() => {});
  if (phase === 'waiting') renderWaiting();
  if (phase === 'room') renderRoom();
  if (phase === 'setup') renderSetup();
  if (phase === 'lobby') { $('lobby-status').textContent = ''; }
  if (phase !== 'setup' && phase !== 'waiting' && !playing && phase !== 'results' && S.control !== 'touch' && !S.mode && cameraReady) stopCamera();
  renderNet();
}

function message({ kicker = '', title = '', copy: body = '', code = null, primary = null, back = 'lobby' }) {
  S.phase = back === 'waiting' ? 'waiting' : 'problem';
  for (const id of ['lobby', 'room', 'setup', 'results']) $(id).hidden = true;
  $('message').hidden = false;
  arena.classList.remove('playing');
  $('hud').hidden = $('moves').hidden = $('zones').hidden = true;
  $('message-kicker').textContent = kicker;
  $('message-title').textContent = title;
  $('message-copy').textContent = body;
  $('message-code').hidden = !code;
  if (code) $('message-code').querySelector('strong').textContent = code;
  $('message-primary').hidden = !primary;
  if (primary) { $('message-primary').textContent = primary[0]; $('message-primary').onclick = primary[1]; }
  $('message-back').onclick = () => {
    if (back === 'lobby') { leaveRoom(true); }
    else if (back === 'waiting') backFromWaiting();
    else show(back);
  };
}

function renderWaiting() {
  const friendHere = room && room.friend;
  message({ kicker: t('readyKicker'), title: t('readyTitle'),
    copy: S.mode === 'online' && !friendHere ? t('readyAlone') : t('readyCopy'),
    code: S.mode === 'online' && room && !friendHere ? room.code : null, back: 'waiting' });
  S.phase = 'waiting';
  arena.dataset.camera = (cameraReady && S.control !== 'touch') ? 'preview' : 'off';
}

function roomStatus() {
  if (!room) return ['', false];
  if (!net.connected) return [t(net.everOpened ? 'reconnecting' : 'connecting'), net.everOpened];
  if (!room.role) return [t('waitingHost'), false];
  if (!room.friend) return [t('waitingFriend'), false];
  if (!room.friendHere) return [t('friendAway'), true];
  const record = room.map['j/' + room.friend];
  return [t(record && record.app === 'ios' ? 'friendHereApp' : 'friendHereWeb'), false];
}

function renderRoom() {
  if (S.phase === 'waiting' && room) {
    const [status] = roomStatus();
    $('message-copy').textContent = room.friend ? t('readyCopy') + ' · ' + status : t('readyAlone');
    $('message-code').hidden = !!room.friend;
    if (!room.friend) $('message-code').querySelector('strong').textContent = room.code;
  }
  renderNet();
  if (S.phase !== 'room') return;
  const online = S.mode === 'online';
  $('room-kicker').textContent = !online ? t('practiceKicker') : room && room.isGuest ? t('roomKickerGuest') : t('roomKickerHost');
  $('room-code-wrap').hidden = $('invite').hidden = !online;
  $('leave').textContent = online ? t('leave') : t('back');
  if (online && room) {
    $('room-code').textContent = room.code;
    $('invite-link').value = inviteLink();
  }
  const [status, err] = online ? roomStatus() : ['', false];
  $('room-status').textContent = status;
  $('room-status').classList.toggle('err', err);
  const guest = online && room && room.isGuest;
  for (const b of $('lengths').children) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.len) === S.duration));
    b.disabled = !!guest;
  }
  $('length-field').hidden = !!guest;
  $('length-note').textContent = online ? t('lengthHost') : '';
  $('control-copy').textContent = t({ face: 'faceCopy', brow: 'browCopy', touch: 'touchCopy' }[S.control]);
  $('ready').textContent = S.control === 'touch' || (calibrated && cameraReady) ? t('imReady') : t('setUp');
  $('ready').disabled = online && (!room || !room.role);
}

function renderSetup() {
  const stage = calib.stage;
  const titles = { starting: ['startingCamera', 'startingCopy'], frame: ['frameTitle', 'frameCopy'], center: ['centerTitle', 'centerCopy'],
    right: ['rightTitle', 'rightCopy'], left: ['leftTitle', 'leftCopy'], browUp: ['browUpTitle', 'browUpCopy'], browRelax: ['browRelaxTitle', 'browRelaxCopy'] };
  const [title, body] = titles[stage] || titles.starting;
  $('setup-kicker').textContent = t('setupKicker');
  $('setup-title').textContent = t(title);
  $('setup-copy').textContent = t(body);
  $('signal').hidden = S.control === 'brow' || !['right', 'left'].includes(stage);
  renderSetupMeters();
}

function renderSetupMeters() {
  const now = performance.now();
  const face = lastSample && lastSample.visible && lastSample.faces.length && now - lastSample.time < FACE_FRESH;
  let progress = 0;
  if (calib.stage === 'frame' && calib.since) progress = Math.min(1, (now - calib.since) / 800) * 0.25;
  if (calib.stage === 'center' && calib.since) progress = 0.25 + Math.min(1, (now - calib.since) / 2000) * 0.45;
  if (['right', 'browUp'].includes(calib.stage)) progress = 0.75;
  if (['left', 'browRelax'].includes(calib.stage)) progress = 0.9;
  $('setup-progress').value = progress;
  if (!face && calib.stage && calib.stage !== 'starting') $('setup-copy').textContent = t('noFace');
  const offset = center - filteredX;   // positive: shifted right (strike)
  const pos = 50 + Math.max(-1, Math.min(1, offset / (TH * 2.5))) * 50;
  $('signal-dot').style.left = pos + '%';
  $('signal-mark-l').style.left = (50 - 40) + '%';
  $('signal-mark-r').style.left = (50 + 40) + '%';
}

function renderResults() {
  const m = S.match;
  const leader = m.leader;
  const vsRival = S.role === 'cpu';
  $('result-kicker').textContent = t(S.complete ? 'complete' : 'stopped');
  $('result-title').textContent = leader === 0 ? t('draw') : leader < 0 ? t('youWin') : vsRival ? t('rivalWon', rivalName(m.place)) : t('friendWon');
  $('result-copy').textContent = S.endNote || (S.complete ? t('completeCopy') : '');
  $('stat-won').textContent = m.sides[0].rounds;
  $('stat-lost').textContent = m.sides[1].rounds;
  $('stat-time').textContent = `${Math.floor(m.elapsed)} / ${m.duration}`;
  const inRoom = S.mode === 'online' && !!room && !room.problem;
  $('again').hidden = !(S.mode === 'cpu' || inRoom);
  $('results-leave').textContent = inRoom ? t('leave') : t('back');
}

function renderNet() {
  const dot = $('dot');
  if (!room) { dot.className = 'dot'; $('net').textContent = S.mode === 'cpu' ? t('practiceKicker') : ''; return; }
  dot.className = 'dot ' + (net.connected ? 'on' : net.everOpened ? 'warn' : 'off');
  $('net').textContent = (net.connected ? t('online') : t('offline')) + ' · ' + t('roomCode') + ' ' + room.code;
}

function toast(text) {
  S.toast = { text, until: performance.now() + 1800 };
}

// MARK: The frame loop

let last = 0, visualTime = 0;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pw = Math.ceil(w / 2), ph = Math.ceil(h / 2);
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  ctx.setTransform(pw / w, 0, 0, ph / h, 0, 0);
  return [w, h];
}

function frame(ts) {
  requestAnimationFrame(frame);
  const gap = last ? (ts - last) / 1000 : 0;
  last = ts;
  const dt = gap > 0.25 ? 0 : gap;
  const now = performance.now();
  if (S.control === 'touch' && !AUTOPLAY) S.action = touchAction();
  if (AUTOPLAY && (S.phase === 'countdown' || S.phase === 'playing')) S.action = autoAction(now);
  if (S.phase === 'countdown' && now >= S.countdownEnd) { S.phase = 'playing'; tone(880, 0.15); }
  if (S.phase === 'playing' && S.match) step(Math.min(0.1, dt), now);
  if (room && room.isGuest && (S.phase === 'countdown' || S.phase === 'playing')) room.guestTick(S.action, faceVisible(now), now);
  if (S.phase !== 'playing' || !S.holding) visualTime += dt;
  draw(now);
  if (S.phase === 'setup') renderSetupMeters();
  autoplay(now);
}

function draw(now) {
  const [w, h] = resize();
  if (!w || !h) return;
  const match = S.match && ['countdown', 'playing', 'results'].includes(S.phase) ? S.match : idle;
  renderer.draw(ctx, match, { width: w, height: h, time: visualTime, sound: (kit, blocked) => { if (S.phase === 'playing') blow(kit, blocked); } });
  if (S.phase !== 'countdown' && S.phase !== 'playing') return;
  renderHud(match, now);
}

function renderHud(match, now) {
  const vsRival = S.role === 'cpu';
  $('name-0').textContent = t('you');
  $('name-1').textContent = vsRival ? rivalName(match.place) : t('friend');
  const blink = Math.floor(now / 250) % 2 === 0;
  for (const side of [0, 1]) {
    const toward = side === 0 ? match.line : -match.line;
    const ground = 1 - Math.max(0, Math.min(1, toward));
    const s = match.sides[side];
    $('wins-' + side).textContent = s.rounds;
    const hp = $('hp-' + side);
    hp.style.width = (ground * 100).toFixed(1) + '%';
    hp.classList.toggle('low', ground < 0.3 && blink);
    const human = !(vsRival && side === 1);
    $('str-' + side).style.width = (human ? s.stamina * 100 : 0).toFixed(1) + '%';
    $('str-' + side).classList.toggle('low', s.exhausted);
    $('str-label-' + side).hidden = !human;
    $('str-' + side).parentElement.hidden = !human;
    $('str-label-' + side).textContent = s.exhausted ? t('tiredLabel') : t('strengthLabel');
    $('str-label-' + side).classList.toggle('warn', s.exhausted && blink);
  }
  const remaining = Math.max(0, Math.ceil(match.duration - match.elapsed));
  $('clock').textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  $('round-label').textContent = lang === 'zh' ? `第 ${match.round} ${t('round')}` : `${t('round')} ${match.round}`;
  const me = match.sides[0];
  $('pill-block').hidden = S.control === 'brow';
  $('pill-block').textContent = t('pillBlock');
  $('pill-strike').textContent = S.control === 'brow' ? t('pillBrow') : t('pillStrike');
  $('pill-block').classList.toggle('on', me.blocking);
  $('pill-strike').classList.toggle('on', me.striking);
  let banner = '';
  if (S.phase === 'countdown') {
    const left = Math.min(3, Math.ceil((S.countdownEnd - now) / 1000));
    $('big-count').textContent = left > 0 ? String(left) : '';
    banner = t('enGarde');
  } else {
    $('big-count').textContent = remaining <= 5 && remaining > 0 ? String(remaining) : '';
    if (now < S.banner.until) banner = S.banner.text;
    else if (S.toast && now < S.toast.until) banner = S.toast.text;
  }
  $('banner').textContent = banner;
  const notice = S.phase === 'playing' && S.holding ? t({ mine: 'holdMine', paused: 'pausedFriend', quiet: 'quietHost' }[S.holding] || 'holdFriend') : '';
  $('notice').hidden = !notice;
  $('notice').textContent = notice;
}

// MARK: Local test autopilot

let autoAt = 0;
function autoplay(now) {
  if (!AUTOPLAY || now < autoAt) return;
  autoAt = now + 700;
  if (S.phase === 'room' && !$('ready').disabled && (S.mode === 'cpu' || (room && room.friend))) {
    const len = Number(params.get('len'));
    if ([30, 45, 60, 90].includes(len)) S.duration = len;
    readyClicked();
  } else if (S.phase === 'results' && !$('again').hidden) {
    autoAt = now + 4000;
    if (S.autoplayedResults) { S.autoplayedResults = false; againClicked(); } else S.autoplayedResults = true;
  }
}

// MARK: Wiring

function againClicked() {
  if (S.mode === 'cpu') { show('room'); readyClicked(); return; }
  if (!room || room.problem) { leaveRoom(true); return; }
  if (S.control === 'touch' || (calibrated && cameraReady) || AUTOPLAY) getReady();
  else { show('room'); }
}

function translate() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of document.querySelectorAll('[data-key]')) {
    if (copy[el.dataset.key]) el.textContent = t(el.dataset.key);
  }
  $('code').placeholder = t('codePlaceholder');
  $('lang').textContent = lang === 'zh' ? 'EN' : '中文';
  $('sound').textContent = t(sound ? 'soundOn' : 'soundOff');
  $('sound').setAttribute('aria-pressed', String(sound));
  if (S.phase === 'room') renderRoom();
  if (S.phase === 'setup') renderSetup();
  if (S.phase === 'waiting') renderWaiting();
  if (S.phase === 'results') renderResults();
  renderNet();
}

$('lang').onclick = () => {
  lang = lang === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('arcade_lang', lang); } catch {}
  translate();
};
$('sound').onclick = () => {
  sound = !sound;
  try { localStorage.setItem('plank_duel_sound', sound ? '1' : '0'); } catch {}
  translate();
};
$('create').onclick = () => { unlockAudio(); enterRoom(makeRoomCode(), true); };
$('join-form').onsubmit = event => {
  event.preventDefault();
  unlockAudio();
  const code = normalizeRoomCode($('code').value);
  if (!ROOM_RE.test(code)) { $('lobby-status').textContent = t('badCode'); $('lobby-status').classList.add('err'); return; }
  enterRoom(code, false);
};
$('cpu').onclick = () => { unlockAudio(); leaveRoom(false); S.mode = 'cpu'; show('room'); };
$('lengths').onclick = event => {
  const len = Number(event.target.dataset?.len);
  if (!len) return;
  S.duration = len;
  renderRoom();
};
$('controls').onclick = event => { const c = event.target.dataset?.control; if (c) chooseControl(c); };
$('ready').onclick = readyClicked;
$('leave').onclick = () => { if (S.mode === 'online') leaveRoom(true); else { S.mode = null; show('lobby'); } };
$('setup-back').onclick = () => { calib.stage = null; show(S.mode ? 'room' : 'lobby'); };
$('share').onclick = async () => {
  if (!room) return;
  const url = inviteLink();
  try {
    if (navigator.share) { await navigator.share({ title: 'Plank Plank Plank!', text: `${t('shareText')} ${room.code}`, url }); return; }
  } catch {}
  try { await navigator.clipboard.writeText(url); $('room-status').textContent = t('copied'); }
  catch { $('invite-link').select(); }
};
$('stop').onclick = stopClicked;
$('again').onclick = againClicked;
$('results-leave').onclick = () => {
  if (S.mode === 'online') leaveRoom(true); else { S.mode = null; show('lobby'); }
};

// A page in the background stops drawing (and hosting): tell the friend, so their duel waits too.
document.addEventListener('visibilitychange', () => {
  if (room && room.playing && (S.phase === 'countdown' || S.phase === 'playing')) room.sendPause(document.hidden);
  if (!document.hidden) last = 0;
});

translate();
show('lobby');
requestAnimationFrame(frame);
{
  const invited = normalizeRoomCode(params.get('room'));
  if (ROOM_RE.test(invited)) enterRoom(invited, false);
}
