import { Flight, BrowSwitch } from './plank-engine.js?v=1';
import { PlankCamera } from './plank-camera.js?v=1';

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
};
let lang = 'en';
try { lang = localStorage.getItem('arcade_lang') === 'zh' ? 'zh' : 'en'; } catch {}
const t = key => copy[key]?.[lang === 'zh' ? 1 : 0] ?? key;
let phase = 'setup', mode = 'face', duration = 30, game = null, stepTime = 0, samples = [], center = .5;
let neutralBrow = .05, browSwitch = new BrowSwitch(), lastSample = {visible:false,time:0}, filteredX = .5;
let continuing = false, stableTime = 0, sound = false, audioContext = null, wakeLock = null, wakeEpoch = 0;
let phaseDetail = '', previousTime = performance.now(), visualTime = 0, shipX = 0, hitGlow = 0, toastUntil = 0;
let pausedPhase = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const activePhases = new Set(['prep','neutral','brow','relax','countdown','playing','tracking']);
const isCamera = () => mode !== 'practice';
const freshFace = now => lastSample.visible && now - lastSample.time < 650;
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)];
const camera = new PlankCamera($('camera'), {
  onSample(sample) {
    lastSample = sample;
    if (!sample.visible) {
      if (phase === 'playing' || phase === 'countdown') enterTracking();
      if (['neutral','brow','relax'].includes(phase)) { stepTime = 0; samples = []; }
      return;
    }
    if (['neutral','brow'].includes(phase)) samples.push(sample);
    filteredX += (sample.x - filteredX) * .4;
    if (phase === 'playing' || phase === 'countdown') {
      if (mode === 'face') {
        const offset = center - filteredX; // Mirrored controls: your right is screen right.
        const threshold = Number($('sensitivity').value) / 100;
        if (offset < -threshold) game.steer(0);
        else if (offset > threshold) game.steer(1);
      } else if (browSwitch.update(sample.brow, sample.time)) { game.steer(1 - game.lane); tone(410, .06); }
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
  $('space').setAttribute('aria-label', lang === 'en' ? 'Two flight lanes. Avoid coral barriers and fly through the open lane.' : '两条飞行航道，躲开珊瑚色障碍，穿过空航道。');
  $('control-copy').textContent = t(mode === 'brow' ? 'browCopy' : 'faceCopy');
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
  if (game) {
    const remaining = Math.ceil(Math.max(0, duration - game.elapsed));
    $('clock').textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    $('score').textContent = String(game.score).padStart(4,'0');
  }
  $('inflight-controls').hidden = phase !== 'playing';
  $('touch-controls').hidden = phase !== 'playing' || mode !== 'practice';
  document.body.classList.toggle('playing', !!game && !['setup','starting','framing'].includes(phase));
  $('control-hint').textContent = t(mode === 'practice' ? 'keysHint' : mode === 'brow' ? 'browHint' : 'faceHint');
  $('status').textContent = t(phase === 'setup' ? 'ready' : phase === 'results' ? 'resultStatus' : isCamera() ? 'tracked' : 'practiceStatus');
  if (phase === 'setup') { $('setup').hidden = false; return; }
  if (phase === 'starting' || phase === 'framing') {
    $('camera-panel').hidden = false;
    $('camera-title').textContent = t(phase === 'starting' ? 'loading' : phaseDetail ? 'calibrationError' : 'framing');
    $('camera-copy').textContent = t(phase === 'starting' ? 'loadingCopy' : phaseDetail || 'framingCopy');
    $('calibrate').disabled = phase === 'starting' || !freshFace(performance.now());
    $('sensitivity-label').hidden = mode !== 'face';
    return;
  }
  if (phase === 'playing') return;
  if (phase === 'results') { $('results').hidden = false; renderResults(); return; }
  $('message').hidden = false;
  $('message-kicker').textContent = t(mode === 'practice' ? 'practiceBadge' : 'cameraTag');
  const title = {prep:'prep',neutral:'neutral',brow:'brow',relax:'relax',countdown:'launch',tracking:'tracking',paused:'paused',error:'cameraError'}[phase];
  const details = {prep:'prepCopy',neutral:'neutralCopy',brow:'browCalCopy',relax:'relaxCopy',countdown:mode==='practice'?'practiceCopy':'launchCopy',tracking:'trackingCopy',paused:'pausedCopy',error:phaseDetail || 'errorCopy'}[phase];
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
  phaseDetail = ''; mode = document.querySelector('[data-control][aria-pressed=true]').dataset.control;
  $('toast').textContent = ''; setPhase('setup'); translate();
}
function enterTracking() {
  if (!isCamera()) return;
  browSwitch.reset(); setPhase('tracking');
}
function startCountdown() {
  browSwitch.reset(); filteredX = lastSample.x ?? center;
  setPhase('countdown'); requestWake();
}
function pause() {
  if (!activePhases.has(phase)) return;
  pausedPhase = phase; setPhase('paused'); camera.pause(); releaseWake();
}
function stopFlight() {
  camera.stop(); releaseWake();
  if (!game || game.elapsed === 0) { backToSetup(); return; }
  const key = `plank_pilot_best_v1_${mode}_${duration}`;
  let best = game.score;
  try { best = Math.max(Number(localStorage.getItem(key)) || 0, game.score); localStorage.setItem(key, String(best)); } catch {}
  game.best = best; $('toast').textContent = ''; setPhase('results'); tone(660, .3);
}
function renderResults() {
  if (!game) return;
  $('result-kicker').textContent = t(game.done ? 'complete' : 'stopped');
  $('result-title').textContent = t(game.done ? 'landed' : 'stoppedTitle');
  $('result-copy').textContent = t(mode === 'practice' ? 'practiceResult' : game.done ? 'completeCopy' : 'stoppedCopy');
  $('result-time').textContent = `${Math.floor(game.elapsed)} / ${duration}`;
  $('result-score').textContent = game.score; $('result-gates').textContent = game.cleared;
  $('result-best').textContent = game.best ?? game.score;
}

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
  try { if (await camera.start() && phase === 'starting') setPhase('framing'); } catch { /* onError renders recovery. */ }
};
$('camera-cancel').onclick = backToSetup;
$('practice-start').onclick = () => {
  camera.stop(); unlockAudio(); mode = 'practice'; game = new Flight(duration); continuing = false; startCountdown();
};
$('calibrate').onclick = () => { phaseDetail = ''; unlockAudio(); setPhase('prep'); requestWake(); };
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
window.addEventListener('keydown', e => {
  if (['INPUT','BUTTON','A','SELECT'].includes(document.activeElement?.tagName)) {
    if (!['ArrowLeft','ArrowRight','a','A','d','D','Escape'].includes(e.key)) return;
  }
  if (mode === 'practice' && phase === 'playing') {
    if (['ArrowLeft','a','A'].includes(e.key)) { e.preventDefault(); game.steer(0); }
    if (['ArrowRight','d','D'].includes(e.key)) { e.preventDefault(); game.steer(1); }
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
    $('tracking-label').textContent = t(phase === 'starting' ? 'cameraWaiting' : visible ? 'faceSeen' : 'noFace');
    $('calibrate').disabled = phase !== 'framing' || !visible;
    const signal = mode === 'brow' ? lastSample.brow || 0 : .5 + (center - (lastSample.x ?? .5)) * 4;
    $('signal-dot').style.left = `${Math.max(0,Math.min(1,signal))*100}%`;
  }
  if (phase === 'playing') {
    if (isCamera() && !visible) { enterTracking(); return; }
    for (const event of game.advance(dt)) {
      $('toast').textContent = t(event.type === 'hit' ? 'hit' : 'clear'); toastUntil = now + 1000;
      if (event.type === 'hit') { hitGlow = .6; tone(125,.18); } else tone(520 + Math.min(game.streak,5)*50);
    }
    const remaining = Math.ceil(Math.max(0,duration - game.elapsed));
    $('clock').textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    $('score').textContent = String(game.score).padStart(4,'0');
    if (game.done) stopFlight();
  } else if (phase === 'tracking') {
    stableTime = visible ? stableTime + dt : 0;
    if (stableTime >= 1.2) startCountdown();
  } else if (phase === 'prep') {
    stepTime += dt; $('countdown').textContent = Math.max(1,Math.ceil(5-stepTime));
    if (stepTime >= 5) setPhase('neutral');
  } else if (['neutral','brow','relax'].includes(phase)) {
    if (!visible) { stepTime = 0; samples = []; $('message-copy').textContent = t('lostCal'); $('countdown').textContent = '…'; return; }
    $('message-copy').textContent = t(phase === 'neutral' ? 'neutralCopy' : phase === 'brow' ? 'browCalCopy' : 'relaxCopy');
    if (phase === 'relax' && lastSample.brow >= browSwitch.low) { stepTime = 0; return; }
    stepTime += dt; $('countdown').textContent = Math.max(1,Math.ceil(2-stepTime));
    if (stepTime < 2) return;
    if (phase !== 'relax' && samples.length < 10) { stepTime = 0; samples = []; return; }
    if (phase === 'neutral') {
      const xs = samples.map(s=>s.x), brows = samples.map(s=>s.brow);
      if (Math.max(...xs)-Math.min(...xs) > .055 || (mode === 'brow' && Math.max(...brows)-Math.min(...brows) > .2)) {
        phaseDetail = 'unstable'; setPhase('framing'); releaseWake(); return;
      }
      center = median(xs); filteredX = center; neutralBrow = median(brows);
      if (mode === 'brow') setPhase('brow');
      else { if (!continuing) game = new Flight(duration); startCountdown(); }
    } else if (phase === 'brow') {
      const raised = median(samples.map(s=>s.brow));
      if (raised - neutralBrow < .12) { phaseDetail = 'weakBrow'; setPhase('framing'); releaseWake(); return; }
      browSwitch = new BrowSwitch(neutralBrow,raised); setPhase('relax');
    } else { if (!continuing) game = new Flight(duration); startCountdown(); }
  } else if (phase === 'countdown') {
    if (isCamera() && !visible) { enterTracking(); return; }
    const old = Math.ceil(3-stepTime); stepTime += dt;
    $('countdown').textContent = Math.max(1,Math.ceil(3-stepTime));
    if (old !== Math.ceil(3-stepTime)) tone(330,.07);
    if (stepTime >= 3) {
      browSwitch.reset(); setPhase('playing');
      // Remove button focus so Space pauses instead of activating the last menu control.
      document.activeElement?.blur();
    }
  }
  if (now > toastUntil) $('toast').textContent = '';
}

const canvas = $('space'), ctx = canvas.getContext('2d');
let width = 1, height = 1;
const stars = Array.from({length:85},(_,i)=>({x:Math.sin(i*127.1)*.5+.5,y:Math.sin(i*311.7)*.5+.5,size:i%5===0?1.6:.8}));
function resize() {
  const rect = $('flight').getBoundingClientRect(); width = rect.width; height = rect.height;
  const dpr = Math.min(devicePixelRatio || 1,2); canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
new ResizeObserver(resize).observe($('flight'));
function draw(now,dt) {
  visualTime += reducedMotion || phase === 'paused' || phase === 'tracking' ? 0 : dt;
  ctx.fillStyle = '#080f1b'; ctx.fillRect(0,0,width,height);
  const inFlight = !!game && !['setup','framing','starting'].includes(phase);
  const cx = !inFlight && width > 799 ? width*.72 : width*.5;
  const horizon = height*.22, shipY = height*(mode === 'practice' && inFlight ? .69 : .76);
  const spread = Math.min(width*.28,240);
  const glow = ctx.createRadialGradient(cx,horizon,0,cx,horizon,height*.7);
  glow.addColorStop(0,'#123542'); glow.addColorStop(.45,'#0c1c2c'); glow.addColorStop(1,'#080f1b');
  ctx.fillStyle = glow; ctx.fillRect(0,0,width,height);
  for (const star of stars) {
    ctx.globalAlpha = .25+star.size*.22; ctx.fillStyle = '#b8d3df';
    const y = (star.y * height + visualTime*(star.size*7))%height;
    ctx.fillRect(star.x*width,y,star.size,star.size);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#244956'; ctx.lineWidth = 1;
  for (const s of [-1,0,1]) { ctx.beginPath(); ctx.moveTo(cx+s*12,horizon); ctx.lineTo(cx+s*spread*1.7,height+30); ctx.stroke(); }
  for (let i=0;i<11;i++) {
    const z = ((i/11 + visualTime*.07)%1)**2;
    const y = horizon + z*(height-horizon);
    ctx.globalAlpha = .1 + z*.26; ctx.beginPath(); ctx.moveTo(cx-spread*1.7*z,y); ctx.lineTo(cx+spread*1.7*z,y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // A distant planet and its thin orbit give the launchpad a quiet destination.
  ctx.strokeStyle = '#426675'; ctx.beginPath(); ctx.ellipse(cx,horizon-8,54,14,-.3,0,Math.PI*2); ctx.stroke();
  const planet = ctx.createRadialGradient(cx-9,horizon-20,2,cx,horizon-8,25); planet.addColorStop(0,'#679196'); planet.addColorStop(1,'#172c3a');
  ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(cx,horizon-8,24,0,Math.PI*2); ctx.fill();
  const renderGates = game && inFlight ? game.gates.map(g=>({...g,p:(game.elapsed-g.born)/3.2})) : [{lane:0,p:.55},{lane:1,p:.84}];
  for (const g of renderGates) {
    const z = Math.max(0,g.p)**1.7, y = horizon+(shipY-horizon)*z;
    if (y>height+50) continue;
    const x = cx+(g.lane===0?-1:1)*spread*.56*z;
    const gateWidth = Math.max(5,spread*.92*z), gateHeight = Math.max(3,18*z);
    ctx.globalAlpha = g.resolved ? .3 : .45 + Math.min(1,z)*.55;
    ctx.fillStyle = '#351d27'; ctx.strokeStyle = '#fa8d79'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x-gateWidth/2,y-gateHeight/2,gateWidth,gateHeight,3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-5*z,y-4*z); ctx.lineTo(x+5*z,y+4*z); ctx.moveTo(x+5*z,y-4*z); ctx.lineTo(x-5*z,y+4*z); ctx.stroke();
    if (g.p < .25 && inFlight) {
      ctx.globalAlpha = .75; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillStyle='#faab98';
      ctx.fillText('!',cx+(g.lane===0?-1:1)*spread*.56,shipY+45);
    }
  }
  ctx.globalAlpha = 1;
  const target = cx+(game && inFlight ? game.lane===0?-1:1 : 1)*spread*.56;
  if (!shipX) shipX=target; shipX+=(target-shipX)*(reducedMotion?1:Math.min(1,dt*14));
  const size = Math.min(25,width*.058);
  ctx.save(); ctx.translate(shipX,shipY);
  if (!reducedMotion) ctx.rotate(Math.max(-.22,Math.min(.22,(target-shipX)*.008)));
  ctx.fillStyle='#419d9c'; ctx.beginPath();ctx.moveTo(-size*.25,size*.5);ctx.lineTo(0,size*(1.4+Math.sin(visualTime*18)*.1));ctx.lineTo(size*.25,size*.5);ctx.fill();
  ctx.shadowColor='#83e5de';ctx.shadowBlur=16;
  ctx.fillStyle='#9ceae2';ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.8,size*.8);ctx.lineTo(0,size*.35);ctx.lineTo(-size*.8,size*.8);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='#2a6e73';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-size*.7);ctx.lineTo(0,size*.32);ctx.stroke();ctx.restore();
  if (inFlight) {
    const progressWidth = Math.max(0,Math.min(1,game.elapsed/duration))*width;
    ctx.fillStyle='#1f3e48';ctx.fillRect(0,height-3,width,3);ctx.fillStyle='#83e5de';ctx.fillRect(0,height-3,progressWidth,3);
  }
  if (hitGlow>0) { hitGlow=Math.max(0,hitGlow-dt); if(!reducedMotion){ctx.fillStyle=`rgba(250,141,121,${hitGlow*.16})`;ctx.fillRect(0,0,width,height);} }
}
function frame(now) {
  const gap = (now-previousTime)/1000; previousTime=now;
  if (gap > .8 && phase === 'playing') pause(); // Never fast-forward through a browser stall.
  const dt = Math.max(0,Math.min(.8,gap));
  if (!document.hidden) { progress(dt,now); draw(now,Math.min(.1,dt)); }
  requestAnimationFrame(frame);
}
translate(); resize(); requestAnimationFrame(frame);
