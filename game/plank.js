import { Flight, BrowSwitch, CoopFlight } from './plank-engine.js?v=2';
import { PlankCamera } from './plank-camera.js?v=2';
import { PlankRenderer } from './plank-renderer.js?v=2';

const $ = id => document.getElementById(id);
const copy = {
  soundOff:['Sound off','声音关'], soundOn:['Sound on','声音开'], remaining:['FLIGHT TIME','剩余时间'], score:['SCORE','得分'],
  sector:['SECTOR 01 — THE QUIET BELT','第 01 区 — 静谧星带'], tagline:['HANDS FREE. EYES ON THE STARS.','解放双手，目光飞向星空。'],
  title:['Make the<br>seconds fly.','让每一秒<br>飞起来。'], intro:['A little space adventure for your next plank. Dodge the barriers. Finish your flight.','平板支撑时来一场太空冒险。躲开障碍，完成飞行。'],
  duration:['CHOOSE YOUR FLIGHT','选择飞行时长'], control:['CAMERA CONTROL','摄像头操控'], faceControl:['Small face shift','轻微左右移动'], browControl:['Eyebrow switch','抬眉切换'],
  faceCopy:['A small left / right shift steers your ship. Keep both hands planted.','面部轻微左右移动即可转向，双手保持支撑。'], browCopy:['Raise your eyebrows once to switch lanes. Relax to prepare the next switch.','抬眉一次切换航道，放松后可再次切换。'],
  cameraStart:['Enable camera & set up <span>↗</span>','开启摄像头并设置 <span>↗</span>'], practiceStart:['Try with touch / keyboard','触屏 / 键盘试玩'],
  privacy:['Video stays on your device. Nothing is recorded. Camera mode downloads a tracking model.','画面仅在本机处理，不录制。摄像头模式需要下载追踪模型。'],
  cameraTag:['PREFLIGHT CHECK','飞行前检查'], left:['LEFT','左'], right:['RIGHT','右'], sensitivity:['Movement needed','移动幅度'], small:['small → more','小 → 大'],
  position:['Rest the phone securely in front of you, with your face in view. Keep movement comfortable and small. This tracks controls, not plank form.','把手机稳妥放在面前，让镜头能看见脸。动作保持轻微舒适。此功能只用于操控，不判断平板支撑姿势。'],
  calibrate:['Get ready · 5-second countdown','准备出发 · 5 秒倒计时'], back:['Back','返回'], resume:['Resume flight','继续飞行'], recalibrate:['Reposition & recalibrate','重新摆放并校准'],
  finish:['Finish here','到这里结束'], flightSeconds:['FLIGHT SECONDS','飞行秒数'], gates:['Gates cleared','通过障碍'], best:['Best this mode & duration','本模式与时长的最高分'],
  again:['Back to the launchpad ↗','返回发射台 ↗'], rest:['Take a breather. Your next flight can wait.','先休息一下，下一次飞行可以等等。'], pause:['Ⅱ Pause','Ⅱ 暂停'], end:['End','结束'],
  practiceBadge:['PRACTICE · NO CAMERA','试玩 · 无摄像头'], ready:['READY WHEN YOU ARE','准备好就出发'], lab:['← WIP Lab','← 实验室'],
  loading:['Waking up the camera…','正在开启摄像头…'], loadingCopy:['Allow camera access. The first model download may take a moment.','请允许访问摄像头，首次下载模型可能需要一点时间。'],
  framing:['Find your position.','找好位置。'], framingCopy:['Frame your face, then tap the countdown. You have 5 seconds to settle into position before calibration.','让整张脸出现在预览中，再点击倒计时。校准前有 5 秒时间就位。'],
  faceSeen:['FACE IN VIEW','已看到面部'], noFace:['FACE NOT VISIBLE','未看到面部'], cameraWaiting:['WAITING FOR CAMERA','等待摄像头'],
  prep:['Get comfortable.','准备就位。'], prepCopy:['Settle into your position. Calibration starts next.','调整到舒适的位置，随后自动开始校准。'],
  neutral:['Stay centered.','保持居中。'], neutralCopy:['Hold still with a relaxed face for two seconds.','面部放松，保持不动两秒。'],
  brow:['Raise your eyebrows.','抬起眉毛。'], browCalCopy:['Hold the raised expression for two seconds so we can learn your gesture.','保持抬眉两秒，让游戏学习你的动作。'],
  relax:['And relax.','放松眉毛。'], relaxCopy:['Return to your neutral expression. Each raise will switch lanes once.','恢复自然表情，之后每抬眉一次就切换一条航道。'],
  launch:['Ready for liftoff?','准备起飞？'], launchCopy:['Fly through the open lane. Coral barriers cost points.','穿过空航道，珊瑚色障碍会扣分。'],
  practiceCopy:['Use ← →, A / D, or the buttons to steer. Space pauses.','用 ← →、A / D 或屏幕按钮转向。空格键暂停。'],
  tracked:['CAMERA CONTROL · LOCAL PROCESSING','摄像头操控 · 本机处理'], practiceStatus:['PRACTICE FLIGHT · NO CAMERA','试玩飞行 · 无摄像头'],
  faceHint:['Small shift ← / →','轻微移动 ← / →'], browHint:['Raise eyebrows to switch','抬眉切换航道'], keysHint:['← → to dodge · Space to pause','← → 闪避 · 空格暂停'],
  tracking:['Flight on hold.','飞行已暂停。'], trackingCopy:['Bring your face back into view. Hazards and the clock are paused. We will count you back in.','让脸回到镜头中。障碍和计时已暂停，识别稳定后会倒计时继续。'],
  lostCal:['Bring your face into view to continue calibration.','让脸回到镜头中即可继续校准。'], paused:['Take your time.','慢慢来。'], pausedCopy:['Your flight is paused. Resume when you are ready.','飞行已暂停，准备好后再继续。'],
  cameraError:['Camera unavailable.','摄像头暂不可用。'], errorCopy:['Allow camera access in your browser and use HTTPS. You can also return to the launchpad and try touch / keyboard.','请在浏览器中允许摄像头权限，并使用 HTTPS。也可返回发射台，用触屏 / 键盘试玩。'],
  networkError:['Could not load camera tracking. Check your connection and try again, or use touch / keyboard practice.','无法加载追踪模型。检查网络后重试，或使用触屏 / 键盘试玩。'],
  nativeError:['For camera play, open this game in Safari or Chrome. Touch / keyboard practice is available here.','摄像头模式请在 Safari 或 Chrome 中打开，当前可使用触屏 / 键盘试玩。'],
  calibrationError:['Let’s try calibration again.','再试一次校准。'], unstable:['Keep your face relaxed and steady while we set the center point.','设置中心点时，请保持自然表情和稳定位置。'],
  weakBrow:['The eyebrow change was too small to distinguish. Try again, or choose small face shifts on the launchpad.','抬眉变化不够明显。请重试，或返回发射台选择轻微左右移动。'],
  complete:['FLIGHT COMPLETE','飞行完成'], landed:['Nicely landed.','顺利着陆。'], stopped:['FLIGHT SAVED','飞行已保存'], stoppedTitle:['A good place to stop.','在这里休息一下。'],
  completeCopy:['You made it through the belt. Time for a breather.','你已穿越星带，休息一下吧。'], stoppedCopy:['Your flight ends here. No need to finish the timer.','飞行在这里结束，不必坚持到计时结束。'],
  practiceResult:['Practice flight. Camera controls were not used.','试玩飞行，本轮未使用摄像头。'], resultStatus:['BACK AT BASE','已返回基地'], clear:['Clear!','通过！'], hit:['Shield hit · −25','护盾受击 · −25'],
  playersLegend:['WHO’S FLYING?','几人飞行？'], soloMode:['Solo','单人'], buddyMode:['Buddy · one phone','双人 · 一部手机'],
  buddyCopy:['One sideways phone, two pilots. P1 takes the left half; P2 takes the right. Clear gates together for bonus points.','一部横屏手机，两位飞行员。P1 操控左半屏，P2 操控右半屏，同时通过障碍可获额外分数。'],
  rotateHint:['Turn your phone sideways for two-player flight.','双人飞行建议将手机横放。'], playerOne:['P1 · LEFT','P1 · 左侧'], playerTwo:['P2 · RIGHT','P2 · 右侧'],
  faceBackground:['Live face background','实时面部背景'], teamScore:['TEAM SCORE','团队得分'],
  buddyPosition:['Set the phone sideways between you, far enough away to see both faces. Keep your preview sides: P1 left, P2 right.','将手机横放在你们中间，调整距离让两张脸都进入镜头。保持预览中的左右位置：P1 左，P2 右。'],
  buddyFramingCopy:['Both faces need to fit in the preview at once. The game zooms each face into its own half after calibration.','预览中需同时看到两张脸。校准后，每张脸会放大显示在各自半屏中。'],
  buddyNeutralCopy:['Both hold still with relaxed faces for two seconds. Stay on your own preview side.','两人保持自然表情两秒，留在各自的预览侧。'],
  buddyBrowCopy:['Both raise your eyebrows for two seconds. Each gesture will control only your own ship.','两人抬眉保持两秒，之后每人的动作只操控自己的飞船。'],
  buddyRelaxCopy:['Both relax your eyebrows before liftoff.','两人放松眉毛，准备起飞。'],
  buddyPracticeCopy:['P1 uses A / D. P2 uses ← / →. Or use the arrows in your half. Space pauses both.','P1 用 A / D，P2 用 ← / →，也可点击各自半屏箭头。空格暂停双方。'],
  buddyKeysHint:['P1: A / D · P2: ← / →','P1：A / D · P2：← / →'],
  buddyTrackingCopy:['Both faces must be visible on their original sides. Both flights and the clock are paused.','两张脸都需回到原来的预览侧，两人的飞行和计时均已暂停。'],
  buddyLostCal:['Bring both faces into view, with one on each side, to continue calibration.','让两张脸回到镜头中，一左一右，继续校准。'],
  buddyWeakBrow:['We could not distinguish both eyebrow raises. Try together again, or choose small face shifts.','未能清楚识别两人的抬眉动作。请同时再试一次，或选择轻微左右移动。'],
  bothFaces:['BOTH FACES READY','两张脸已就位'], needBoth:['NEED TWO SEPARATE FACES','需要两张分开的脸'], together:['Together! +25 team bonus','默契通过！团队加 25'],
  buddyResult:['Two pilots, one flight. Take a breather together.','两位飞行员，一起完成飞行。一起休息一下吧。'],
};
let lang = 'en';
try { lang = localStorage.getItem('arcade_lang') === 'zh' ? 'zh' : 'en'; } catch {}
const t = key => copy[key]?.[lang === 'zh' ? 1 : 0] ?? key;
let phase = 'setup', mode = 'face', players = 1, duration = 30, game = null, stepTime = 0, samples = [];
let centers = [.5,.5], faceWidths = [.15,.15], neutralBrows = [.05,.05], calibrated = false;
let browSwitches = [new BrowSwitch(),new BrowSwitch()], lastSample = {visible:false,time:0,faces:[],count:0}, filteredXs = [.5,.5];
let continuing = false, stableTime = 0, sound = false, audioContext = null, wakeLock = null, wakeEpoch = 0;
let phaseDetail = '', previousTime = performance.now(), hitGlows = [0,0], toastUntil = 0;
let pausedPhase = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const activePhases = new Set(['prep','neutral','brow','relax','countdown','playing','tracking']);
const isCamera = () => mode !== 'practice';
const getFaces = sample => sample.faces ?? (players === 1 ? [{x:sample.x,brow:sample.brow,width:.15}] : []);
const freshFace = now => lastSample.visible && getFaces(lastSample).length >= players && now - lastSample.time < 650;
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)];
const flightGames = () => game ? (players === 2 ? game.games : [game]) : [];
const newFlight = () => players === 2 ? new CoopFlight(duration) : new Flight(duration);
const resetGestures = () => browSwitches.forEach(control => control.reset());
const calibrationCopy = () => phase === 'neutral' ? (players === 2 ? 'buddyNeutralCopy':'neutralCopy') : phase === 'brow' ? (players === 2 ? 'buddyBrowCopy':'browCalCopy') : (players === 2 ? 'buddyRelaxCopy':'relaxCopy');
const camera = new PlankCamera($('camera'), {
  onSample(sample) {
    const faces = getFaces(sample);
    if (players === 2 && calibrated && ['playing','countdown','tracking'].includes(phase)) {
      const boundary = (centers[0] + centers[1]) / 2;
      if (faces.length !== 2 || faces[0].x <= boundary || faces[1].x >= boundary) sample = {...sample,visible:false};
    }
    lastSample = sample;
    if (!sample.visible) {
      if (phase === 'playing' || phase === 'countdown') enterTracking();
      if (['neutral','brow','relax'].includes(phase)) { stepTime = 0; samples = []; }
      return;
    }
    if (faces.length < players) return;
    if (['neutral','brow'].includes(phase)) samples.push(faces);
    for (let player = 0; player < players; player++) filteredXs[player] += (faces[player].x - filteredXs[player]) * .4;
    if (phase === 'playing' || phase === 'countdown') {
      for (let player = 0; player < players; player++) {
        if (mode === 'face') {
          const offset = centers[player] - filteredXs[player];
          // In a shared view each face is smaller; scale motion to its eye span.
          const threshold = players === 2 ? Math.max(.008,faceWidths[player] * Number($('sensitivity').value) / 10) : Number($('sensitivity').value) / 100;
          if (offset < -threshold) game.steer(0,player);
          else if (offset > threshold) game.steer(1,player);
        } else if (browSwitches[player].update(faces[player].brow, sample.time)) {
          game.steer(1 - flightGames()[player].lane,player); tone(410 + player*70, .06);
        }
      }
    }
  },
  onError(error) {
    if (phase === 'setup' || phase === 'results') return;
    phaseDetail = /model|load|fetch|timeout|network/i.test(error?.message ?? '') ? 'networkError' : 'errorCopy';
    setPhase('error'); releaseWake();
  },
  onStatus() {}
});

function translate() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-key]')) el.innerHTML = t(el.dataset.key);
  $('lang').textContent = lang === 'en' ? '中文' : 'EN';
  $('sound').textContent = t(sound ? 'soundOn' : 'soundOff');
  $('space').setAttribute('aria-label', players === 2
    ? (lang === 'en' ? 'Two side-by-side flight zones. Player 1 on the left, Player 2 on the right. Each pilot dodges coral barriers in their own two lanes.' : '左右两个飞行区：左侧 P1，右侧 P2。每人在自己的两条航道中躲避珊瑚色障碍。')
    : (lang === 'en' ? 'Two flight lanes. Avoid coral barriers and fly through the open lane.' : '两条飞行航道，躲开珊瑚色障碍，穿过空航道。'));
  $('control-copy').textContent = t(mode === 'brow' ? 'browCopy' : 'faceCopy');
  document.body.classList.toggle('buddy-mode',players === 2);
  $('buddy-copy').hidden = players !== 2;
  document.querySelector('[data-key="position"]').textContent = t(players === 2 ? 'buddyPosition' : 'position');
  renderPhase();
}
function setPhase(next) {
  phase = next; stepTime = 0; samples = []; stableTime = 0;
  renderPhase();
}
function renderPhase() {
  for (const id of ['setup','camera-panel','message','results']) $(id).hidden = true;
  $('resume').hidden = true; $('recalibrate').hidden = true; $('countdown').hidden = true;
  $('hud').hidden = !game || ['setup','starting','framing','results'].includes(phase);
  $('player-scores').hidden = players !== 2 || $('hud').hidden;
  $('face-left').hidden = $('face-right').hidden = players !== 2;
  const scoreLabel = document.querySelector('#hud [data-key="score"]');
  if (scoreLabel) scoreLabel.textContent = t(players === 2 ? 'teamScore' : 'score');
  if (game) {
    const remaining = Math.ceil(Math.max(0, duration - game.elapsed));
    $('clock').textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    $('score').textContent = String(game.score).padStart(4,'0');
    if (players === 2) {
      $('p1-score').textContent = game.games[0].score;
      $('p2-score').textContent = game.games[1].score;
    }
  }
  $('inflight-controls').hidden = phase !== 'playing';
  $('touch-controls').hidden = phase !== 'playing' || mode !== 'practice' || players !== 1;
  $('buddy-touch').hidden = phase !== 'playing' || mode !== 'practice' || players !== 2;
  document.body.classList.toggle('playing', !!game && !['setup','starting','framing'].includes(phase));
  $('control-hint').textContent = t(mode === 'practice' ? (players === 2 ? 'buddyKeysHint':'keysHint') : mode === 'brow' ? 'browHint' : 'faceHint');
  $('status').textContent = t(phase === 'setup' ? 'ready' : phase === 'results' ? 'resultStatus' : isCamera() ? 'tracked' : 'practiceStatus');
  if (phase === 'setup') { $('setup').hidden = false; return; }
  if (phase === 'starting' || phase === 'framing') {
    $('camera-panel').hidden = false;
    $('camera-title').textContent = t(phase === 'starting' ? 'loading' : phaseDetail ? 'calibrationError' : 'framing');
    $('camera-copy').textContent = t(phase === 'starting' ? 'loadingCopy' : phaseDetail || (players === 2 ? 'buddyFramingCopy':'framingCopy'));
    $('calibrate').disabled = phase === 'starting' || !freshFace(performance.now());
    $('sensitivity-label').hidden = mode !== 'face';
    return;
  }
  if (phase === 'playing') return;
  if (phase === 'results') { $('results').hidden = false; renderResults(); return; }
  $('message').hidden = false;
  $('message-kicker').textContent = t(mode === 'practice' ? 'practiceBadge' : 'cameraTag');
  const title = {prep:'prep',neutral:'neutral',brow:'brow',relax:'relax',countdown:'launch',tracking:'tracking',paused:'paused',error:'cameraError'}[phase];
  const details = {prep:'prepCopy',neutral:calibrationCopy(),brow:calibrationCopy(),relax:calibrationCopy(),countdown:mode==='practice'?(players===2?'buddyPracticeCopy':'practiceCopy'):'launchCopy',tracking:players===2?'buddyTrackingCopy':'trackingCopy',paused:'pausedCopy',error:phaseDetail || 'errorCopy'}[phase];
  $('message-title').textContent = t(title);
  $('message-copy').textContent = t(details);
  $('resume').hidden = phase !== 'paused';
  $('recalibrate').hidden = !isCamera() || !['tracking','paused'].includes(phase);
  $('countdown').hidden = !['prep','neutral','brow','relax','countdown'].includes(phase);
  if (!$('countdown').hidden) $('countdown').textContent = phase === 'prep' ? '5' : phase === 'countdown' ? '3' : '2';
}

async function requestWake() {
  if (!('wakeLock' in navigator) || wakeLock || document.hidden) return;
  const epoch = ++wakeEpoch;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (epoch !== wakeEpoch || !activePhases.has(phase)) { await lock.release(); return; }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch { /* Screen Wake Lock is an optional enhancement. */ }
}
function releaseWake() { wakeEpoch++; const lock = wakeLock; wakeLock = null; if (lock) lock.release().catch(()=>{}); }
function unlockAudio() {
  if (!sound) return;
  try { audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume().catch(()=>{}); } catch {}
}
function tone(frequency, length = .12) {
  if (!sound || !audioContext || audioContext.state !== 'running') return;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type = 'sine'; osc.frequency.value = frequency;
  gain.gain.setValueAtTime(.055, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + length);
  osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + length);
}
function backToSetup() {
  camera.stop(); releaseWake(); game = null; continuing = false; lastSample = {visible:false,time:0};
  calibrated = false;
  phaseDetail = ''; mode = document.querySelector('[data-control][aria-pressed=true]').dataset.control;
  $('toast').textContent = ''; setPhase('setup'); translate();
}
function enterTracking() {
  if (!isCamera()) return;
  resetGestures(); setPhase('tracking');
}
function startCountdown() {
  resetGestures(); filteredXs = centers.slice();
  setPhase('countdown'); requestWake();
}
function pause() {
  if (!activePhases.has(phase)) return;
  pausedPhase = phase; setPhase('paused'); camera.pause(); releaseWake();
}
function stopFlight() {
  camera.stop(); releaseWake();
  if (!game || game.elapsed === 0) { backToSetup(); return; }
  const key = players === 2 ? `plank_pilot_best_v2_buddy_${mode}_${duration}` : `plank_pilot_best_v1_${mode}_${duration}`;
  let best = game.score;
  try { best = Math.max(Number(localStorage.getItem(key)) || 0, game.score); localStorage.setItem(key, String(best)); } catch {}
  game.best = best; $('toast').textContent = ''; setPhase('results'); tone(660, .3);
}
function renderResults() {
  if (!game) return;
  $('result-kicker').textContent = t(game.done ? 'complete' : 'stopped');
  $('result-title').textContent = t(game.done ? 'landed' : 'stoppedTitle');
  $('result-copy').textContent = t(mode === 'practice' ? 'practiceResult' : players === 2 ? 'buddyResult' : game.done ? 'completeCopy' : 'stoppedCopy');
  $('result-time').textContent = `${Math.floor(game.elapsed)} / ${duration}`;
  $('result-score').textContent = game.score; $('result-gates').textContent = game.cleared;
  $('result-best').textContent = game.best ?? game.score;
  $('result-buddy').hidden = players !== 2;
  if (players === 2) $('result-buddy').textContent = `P1: ${game.games[0].score} · P2: ${game.games[1].score} · ${lang==='zh'?'默契加分':'Together bonus'}: +${game.teamBonus}`;
}

document.querySelectorAll('[data-players]').forEach(button => button.addEventListener('click', () => {
  players = Number(button.dataset.players); calibrated = false;
  document.querySelectorAll('[data-players]').forEach(el => el.setAttribute('aria-pressed',String(el === button)));
  if (players === 2) {
    mode = 'brow';
    document.querySelectorAll('[data-control]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.control === 'brow')));
  }
  translate();
}));

document.querySelectorAll('[data-duration]').forEach(button => button.addEventListener('click', () => {
  duration = Number(button.dataset.duration);
  document.querySelectorAll('[data-duration]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
}));
document.querySelectorAll('[data-control]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.control;
  document.querySelectorAll('[data-control]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
  $('control-copy').textContent = t(mode === 'brow' ? 'browCopy' : 'faceCopy');
}));
$('lang').onclick = () => { lang = lang === 'en' ? 'zh' : 'en'; try { localStorage.setItem('arcade_lang',lang); } catch {} translate(); };
$('sound').onclick = () => { sound = !sound; $('sound').setAttribute('aria-pressed', String(sound)); unlockAudio(); translate(); };
$('camera-start').onclick = async () => {
  unlockAudio(); phaseDetail = ''; continuing = false;
  if (window.Capacitor?.isNativePlatform?.()) { phaseDetail = 'nativeError'; setPhase('error'); return; }
  setPhase('starting');
  try { if (await camera.start({numFaces:players}) && phase === 'starting') setPhase('framing'); } catch { /* onError renders recovery. */ }
};
$('camera-cancel').onclick = backToSetup;
$('practice-start').onclick = () => {
  camera.stop(); unlockAudio(); mode = 'practice'; game = newFlight(); continuing = false; startCountdown();
};
$('calibrate').onclick = () => { phaseDetail = ''; calibrated = false; unlockAudio(); setPhase('prep'); requestWake(); };
$('resume').onclick = () => {
  unlockAudio();
  const interruptedCalibration = ['prep','neutral','brow','relax'].includes(pausedPhase);
  if (isCamera() && (!game || interruptedCalibration)) {
    continuing = !!game; phaseDetail = ''; setPhase('framing'); camera.resume(); return;
  }
  if (isCamera()) {
    lastSample = {visible:false,time:0}; enterTracking(); requestWake(); camera.resume();
  } else startCountdown();
};
$('recalibrate').onclick = () => {
  continuing = !!game; phaseDetail = ''; setPhase('framing'); releaseWake(); camera.resume();
};
$('finish').onclick = stopFlight; $('end').onclick = stopFlight; $('pause').onclick = pause; $('again').onclick = backToSetup;
for (const [id,lane] of [['touch-left',0],['touch-right',1]]) $(id).addEventListener('pointerdown', e => {
  e.preventDefault(); if (phase === 'playing' && mode === 'practice') game.steer(lane);
});
for (const [id,player,lane] of [['p1-left',0,0],['p1-right',0,1],['p2-left',1,0],['p2-right',1,1]]) $(id).addEventListener('pointerdown', e => {
  e.preventDefault(); if (phase === 'playing' && mode === 'practice' && players === 2) game.steer(lane,player);
});
window.addEventListener('keydown', e => {
  if (['INPUT','BUTTON','A','SELECT'].includes(document.activeElement?.tagName)) {
    if (!['ArrowLeft','ArrowRight','a','A','d','D','Escape'].includes(e.key)) return;
  }
  if (mode === 'practice' && phase === 'playing') {
    if (['ArrowLeft','a','A'].includes(e.key)) { e.preventDefault(); game.steer(0,players === 2 && e.key === 'ArrowLeft' ? 1:0); }
    if (['ArrowRight','d','D'].includes(e.key)) { e.preventDefault(); game.steer(1,players === 2 && e.key === 'ArrowRight' ? 1:0); }
  }
  if ((e.code === 'Space' || e.key === 'Escape') && activePhases.has(phase)) { e.preventDefault(); pause(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (phase === 'starting') backToSetup();
    else if (activePhases.has(phase)) pause();
    else camera.pause();
  } else if (phase === 'framing') camera.resume();
});
window.addEventListener('pagehide', () => { camera.stop(); releaseWake(); });
window.addEventListener('pageshow', e => { if (e.persisted) backToSetup(); });
window.addEventListener('orientationchange', () => {
  if (isCamera() && activePhases.has(phase)) {
    continuing = !!game; phaseDetail = ''; setPhase('framing'); releaseWake(); camera.resume();
  }
});

function progress(dt, now) {
  const visible = freshFace(now);
  if (phase === 'starting' || phase === 'framing') {
    $('tracking-label').textContent = t(phase === 'starting' ? 'cameraWaiting' : players === 2 ? (visible ? 'bothFaces':'needBoth') : visible ? 'faceSeen' : 'noFace');
    if (players === 2 && phase !== 'starting' && !visible) $('tracking-label').textContent += ` · ${lastSample.count ?? getFaces(lastSample).length}/2`;
    $('calibrate').disabled = phase !== 'framing' || !visible;
    const signal = mode === 'brow' ? getFaces(lastSample)[0]?.brow || 0 : .5 + (centers[0] - (getFaces(lastSample)[0]?.x ?? .5)) * 4;
    $('signal-dot').style.left = `${Math.max(0,Math.min(1,signal))*100}%`;
  }
  if (phase === 'playing') {
    if (isCamera() && !visible) { enterTracking(); return; }
    for (const event of game.advance(dt)) {
      const pilot = event.player ?? 0;
      $('toast').textContent = (players === 2 && !event.together ? `P${pilot+1} · ` : '') + t(event.together ? 'together' : event.type === 'hit' ? 'hit' : 'clear'); toastUntil = now + 1000;
      if (event.type === 'hit') { hitGlows[pilot] = .6; tone(125,.18); } else tone(520 + Math.min(flightGames()[pilot].streak,5)*50);
    }
    const remaining = Math.ceil(Math.max(0,duration - game.elapsed));
    $('clock').textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    $('score').textContent = String(game.score).padStart(4,'0');
    if (players === 2) { $('p1-score').textContent = game.games[0].score; $('p2-score').textContent = game.games[1].score; }
    if (game.done) stopFlight();
  } else if (phase === 'tracking') {
    stableTime = visible ? stableTime + dt : 0;
    if (stableTime >= 1.2) startCountdown();
  } else if (phase === 'prep') {
    stepTime += dt; $('countdown').textContent = Math.max(1,Math.ceil(5-stepTime));
    if (stepTime >= 5) setPhase('neutral');
  } else if (['neutral','brow','relax'].includes(phase)) {
    if (!visible) { stepTime = 0; samples = []; $('message-copy').textContent = t(players === 2 ? 'buddyLostCal':'lostCal'); $('countdown').textContent = '…'; return; }
    $('message-copy').textContent = t(calibrationCopy());
    if (phase === 'relax' && getFaces(lastSample).some((face,index) => index < players && face.brow >= browSwitches[index].low)) { stepTime = 0; return; }
    stepTime += dt; $('countdown').textContent = Math.max(1,Math.ceil(2-stepTime));
    if (stepTime < 2) return;
    if (phase !== 'relax' && samples.length < 10) { stepTime = 0; samples = []; return; }
    if (phase === 'neutral') {
      const nextCenters = [], nextBrows = [], nextWidths = [];
      for (let player = 0; player < players; player++) {
        const xs = samples.map(s=>s[player].x), brows = samples.map(s=>s[player].brow);
        if (Math.max(...xs)-Math.min(...xs) > .055 || (mode === 'brow' && Math.max(...brows)-Math.min(...brows) > .2)) {
          phaseDetail = 'unstable'; setPhase('framing'); releaseWake(); return;
        }
        nextCenters.push(median(xs)); nextBrows.push(median(brows)); nextWidths.push(median(samples.map(s=>s[player].width || .15)));
      }
      centers = nextCenters; filteredXs = centers.slice(); neutralBrows = nextBrows; faceWidths = nextWidths;
      calibrated = true;
      if (mode === 'brow') setPhase('brow');
      else { if (!continuing) game = newFlight(); startCountdown(); }
    } else if (phase === 'brow') {
      const nextSwitches = [];
      for (let player = 0; player < players; player++) {
        const raised = median(samples.map(s=>s[player].brow));
        if (raised - neutralBrows[player] < .12) { phaseDetail = players === 2 ? 'buddyWeakBrow':'weakBrow'; setPhase('framing'); releaseWake(); return; }
        nextSwitches.push(new BrowSwitch(neutralBrows[player],raised));
      }
      browSwitches = nextSwitches; setPhase('relax');
    } else { if (!continuing) game = newFlight(); startCountdown(); }
  } else if (phase === 'countdown') {
    if (isCamera() && !visible) { enterTracking(); return; }
    const old = Math.ceil(3-stepTime); stepTime += dt;
    $('countdown').textContent = Math.max(1,Math.ceil(3-stepTime));
    if (old !== Math.ceil(3-stepTime)) tone(330,.07);
    if (stepTime >= 3) {
      resetGestures(); setPhase('playing');
      // Remove button focus so Space pauses instead of activating the last menu control.
      document.activeElement?.blur();
    }
  }
  if (now > toastUntil) $('toast').textContent = '';
}

const renderer = new PlankRenderer($('space'), {reducedMotion});
function resize() {
  const rect = $('flight').getBoundingClientRect();
  renderer.resize(rect.width,rect.height,Math.min(devicePixelRatio || 1,2));
}
new ResizeObserver(resize).observe($('flight'));
function draw(now,dt) {
  hitGlows = hitGlows.map(value => Math.max(0,value-dt));
  renderer.draw({dt,phase,mode,players,games:flightGames(),duration,lang,hitGlows,
    video:$('camera'),faces:getFaces(lastSample),
    cameraActive:isCamera() && freshFace(now) && $('face-background').checked,
    cameraOpacity:Number($('face-opacity').value)/100});
}
function frame(now) {
  const gap = (now-previousTime)/1000; previousTime=now;
  if (gap > .8 && phase === 'playing') pause(); // Never fast-forward through a browser stall.
  const dt = Math.max(0,Math.min(.8,gap));
  if (!document.hidden) { progress(dt,now); draw(now,Math.min(.1,dt)); }
  requestAnimationFrame(frame);
}
translate(); resize(); requestAnimationFrame(frame);
