import { Flight, BrowSwitch, CoopFlight, FACE_FILTERS } from './plank-engine.js?v=8';
import { PlankCamera } from './plank-camera.js?v=8';
import { PlankRenderer } from './plank-renderer.js?v=9';

const $ = id => document.getElementById(id);
const copy = {
  soundOff:['Sound off','声音关'], soundOn:['Sound on','声音开'], remaining:['FLIGHT TIME','剩余时间'], score:['MAKEOVERS','变装次数'],
  sector:['SECTOR 01 — THE QUIET BELT','第 01 区 — 静谧星带'], tagline:['HANDS FREE. EYES ON THE STARS.','解放双手，目光飞向星空。'],
  title:['Make the<br>seconds fly.','让每一秒<br>飞起来。'], intro:['A little space adventure for your next plank. Dodge rocks. Grab a ? box. Give your face a ridiculous new look.','平板支撑时来一场太空冒险。躲开障碍，捡问号盒子，让像素大头变得更搞笑。'],
  duration:['CHOOSE YOUR FLIGHT','选择飞行时长'], control:['CAMERA CONTROL','摄像头操控'], faceControl:['Small face shift','轻微左右移动'], browControl:['Eyebrow switch','抬眉切换'],
  customSeconds:['Custom seconds','自定秒数'], durationInvalid:['Enter a whole number from 1 to 3,600 seconds.','请输入 1 至 3,600 之间的整数秒数。'],
  faceCopy:['A small left / right shift steers your pixel face. Keep both hands planted.','面部轻微左右移动即可转向，双手保持支撑。'], browCopy:['Raise your eyebrows once to switch lanes. Relax to prepare the next switch.','抬眉一次切换航道，放松后可再次切换。'],
  cameraStart:['Enable camera & set up <span>↗</span>','开启摄像头并设置 <span>↗</span>'], practiceStart:['Try with touch / keyboard','触屏 / 键盘试玩'],
  privacy:['Your pixel selfie stays in memory for this round. No photos or video are saved or uploaded. Camera mode downloads a tracking model.','像素头像仅留在本轮内存中，不保存或上传照片和视频。摄像头模式需下载追踪模型。'],
  cameraTag:['PREFLIGHT CHECK','飞行前检查'], left:['LEFT','左'], right:['RIGHT','右'], sensitivity:['Movement needed','移动幅度'], small:['small → more','小 → 大'],
  position:['Rest the phone securely in front of you, with your face in view. Keep movement comfortable and small. This tracks controls, not plank form.','把手机稳妥放在面前，让镜头能看见脸。动作保持轻微舒适。此功能只用于操控，不判断平板支撑姿势。'],
  calibrate:['Start now · otherwise automatic','立即开始 · 也会自动开始'], back:['Back','返回'], resume:['Resume flight','继续飞行'], recalibrate:['Reposition & recalibrate','重新摆放并校准'],
  finish:['Finish here','到这里结束'], flightSeconds:['FLIGHT SECONDS','飞行秒数'], gates:['Gates cleared','通过障碍'], best:['Most makeovers · this mode & duration','本模式与时长的最多变装次数'],
  again:['Back to the launchpad ↗','返回发射台 ↗'], rest:['Take a breather. Your next flight can wait.','先休息一下，下一次飞行可以等等。'], pause:['Ⅱ Pause','Ⅱ 暂停'], end:['End','结束'],
  practiceBadge:['PRACTICE · NO CAMERA','试玩 · 无摄像头'], ready:['READY WHEN YOU ARE','准备好就出发'], lab:['← WIP Lab','← 实验室'],
  loading:['Waking up the camera…','正在开启摄像头…'], loadingCopy:['Allow camera access. The first model download may take a moment.','请允许访问摄像头，首次下载模型可能需要一点时间。'],
  framing:['Get your face in view.','让脸进入镜头。'], framingCopy:['Position the phone so you can see your whole face. Setup starts automatically when your face is in view. You have five seconds to settle.','摆好手机，让整张脸出现在预览中。入镜后自动开始，你有五秒时间调整姿势。'],
  faceSeen:['FACE IN VIEW','已看到面部'], noFace:['FACE NOT VISIBLE','未看到面部'], cameraWaiting:['WAITING FOR CAMERA','等待摄像头'],
  prep:['Settle into your plank.','进入平板支撑姿势。'], prepCopy:['You have five seconds to get comfortable. We are not measuring your center yet.','你有五秒时间调整到舒适姿势，此时还没有开始记录中心位置。'],
  neutral:['Center & hold still.','确定中心，保持不动。'], neutralCopy:['Look at the screen with a relaxed face. Hold your comfortable position for two seconds: this becomes your steering center.','自然看向屏幕，放松面部。在舒适位置保持两秒，这就是你的转向中心。'],
  brow:['Raise your eyebrows.','抬起眉毛。'], browCalCopy:['Hold the raised expression for two seconds so we can learn your gesture.','保持抬眉两秒，让游戏学习你的动作。'],
  relax:['Gesture found. Now relax.','已识别抬眉，现在放松。'], relaxCopy:['Lower your eyebrows and hold your relaxed expression for two seconds. Then we will count you in.','放下眉毛，保持自然表情两秒，然后进入起飞倒计时。'],
  launch:['Ready for liftoff?','准备起飞？'], launchCopy:['Fly through the open lane. Rocks cost a heart. Mystery boxes in the safe lane change your face.','穿过空航道，碰到障碍少一颗心，安全航道的神秘盒子会让你的脸变装。'],
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
  practiceResult:['Practice flight. Camera controls were not used.','试玩飞行，本轮未使用摄像头。'], resultStatus:['BACK AT BASE','已返回基地'], clear:['New look!','新造型！'], hit:['Ouch! −1 heart','哎哟！−1 颗心'],
  playersLegend:['WHO’S FLYING?','几人飞行？'], soloMode:['Solo','单人'], buddyMode:['Buddy · one phone','双人 · 一部手机'],
  buddyCopy:['One sideways phone, two pilots. P1 takes the left half; P2 takes the right. Grab mystery boxes for two ridiculous makeovers.','一部横屏手机，两位飞行员。P1 操控左半屏，P2 操控右半屏，各自捡盒子，看看谁的造型更搞笑。'],
  rotateHint:['Turn your phone sideways for two-player flight.','双人飞行建议将手机横放。'], playerOne:['P1 · LEFT','P1 · 左侧'], playerTwo:['P2 · RIGHT','P2 · 右侧'],
  faceBackground:['Live face background','实时面部背景'], teamScore:['TEAM MAKEOVERS','团队变装'],
  buddyPosition:['Set the phone sideways between you, far enough away to see both faces. Keep your preview sides: P1 left, P2 right.','将手机横放在你们中间，调整距离让两张脸都进入镜头。保持预览中的左右位置：P1 左，P2 右。'],
  buddyFramingCopy:['Fit both faces in the preview: P1 left, P2 right. Setup starts automatically once both faces are in view.','让两张脸同时进入预览：P1 在左，P2 在右。两人入镜后自动开始准备。'],
  buddyNeutralCopy:['Each look at your own half and hold a relaxed, comfortable position for two seconds. We save a separate center for each of you.','各自看向自己的半屏，在舒适位置放松保持两秒。游戏会分别记录两人的中心位置。'],
  buddyBrowCopy:['Both raise your eyebrows for two seconds. Each gesture will control only your own pixel face.','两人抬眉保持两秒，之后每人的动作只操控自己的像素头像。'],
  buddyRelaxCopy:['Both lower your eyebrows and hold relaxed for two seconds. The countdown waits until you are both ready.','两人放下眉毛，保持自然表情两秒。两人都准备好后才会进入倒计时。'],
  buddyPracticeCopy:['P1 uses A / D. P2 uses ← / →. Or use the arrows in your half. Space pauses both.','P1 用 A / D，P2 用 ← / →，也可点击各自半屏箭头。空格暂停双方。'],
  buddyKeysHint:['P1: A / D · P2: ← / →','P1：A / D · P2：← / →'],
  buddyTrackingCopy:['Both faces must be visible on their original sides. Both flights and the clock are paused.','两张脸都需回到原来的预览侧，两人的飞行和计时均已暂停。'],
  buddyLostCal:['Bring both faces into view, with one on each side, to continue calibration.','让两张脸回到镜头中，一左一右，继续校准。'],
  buddyWeakBrow:['We could not distinguish both eyebrow raises. Try together again, or choose small face shifts.','未能清楚识别两人的抬眉动作。请同时再试一次，或选择轻微左右移动。'],
  bothFaces:['BOTH FACES READY','两张脸已就位'], needBoth:['NEED TWO SEPARATE FACES','需要两张分开的脸'], together:['Double makeover!','双人变装！'],
  buddyResult:['Two pilots, one flight. Take a breather together.','两位飞行员，一起完成飞行。一起休息一下吧。'],
  prepFrame:['Frame','入镜'], prepCenter:['Center','定中心'], prepControls:['Controls','试操控'], prepLaunch:['Fly','起飞'],
  frameStep:['STEP 1 / 4 · CAMERA FRAMING','第 1 / 4 步 · 镜头取景'], settleStep:['GET INTO POSITION · CENTERING IS NEXT','先就位 · 下一步确定中心'],
  centerStep:['STEP 2 / 4 · SET YOUR CENTER','第 2 / 4 步 · 确定中心'], controlsStep:['STEP 3 / 4 · CHECK YOUR CONTROLS','第 3 / 4 步 · 试一下操控'], launchStep:['STEP 4 / 4 · READY TO FLY','第 4 / 4 步 · 准备起飞'],
  nextSettle:['Next: 5 seconds to settle, then center your face.','接下来：5 秒就位，然后记录面部中心。'],
  nextCenter:['Next: hold still when the CENTER stage lights up.','接下来：定中心步骤亮起时，保持不动。'],
  nextBrow:['Next: raise your eyebrows when prompted.','接下来：看到提示后抬眉。'], nextShift:['Next: try a small shift left, then right.','接下来：轻微左移，再右移。'],
  nextRelax:['Next: lower your eyebrows to finish the check.','接下来：放下眉毛，完成操控检查。'], nextCountdown:['Next: a separate 3-second countdown to play.','接下来：单独的 3 秒起飞倒计时。'],
  nextRight:['Next: move right to check the other lane.','接下来：右移，检查另一条航道。'],
  launchReady:['Controls ready. Liftoff in…','操控就绪，起飞倒计时…'],
  testLeft:['Try a small shift left.','试着轻微左移。'], testRight:['Now shift right.','现在轻微右移。'],
  testLeftCopy:['Move your face a little left in the mirrored preview. Keep your hands planted; the flight timer has not started.','在镜像预览中轻微向左移动面部。双手保持支撑，飞行还没有开始计时。'],
  testRightCopy:['Move a little right past your resting center. We will count you in once both directions work.','越过刚才的中心位置，轻微向右移动。两个方向都能识别后，进入起飞倒计时。'],
  buddyTestLeftCopy:['Both shift a little left in the preview, staying on your own sides. Each ready indicator checks its own pilot.','两人在预览中轻微向左移动，保持各自的左右位置。就绪提示分别检查每个人。'],
  buddyTestRightCopy:['Both shift a little right past your own resting centers. The flight waits until both controls work.','两人越过各自的中心位置，轻微向右移动。两人的操控都通过后才开始飞行。'],
  centerStarts:['Centering starts in','距离开始定中心'], holdProgress:['Hold still · 2 seconds','保持不动 · 2 秒'], browProgress:['Hold both eyebrows raised · 2 seconds','抬眉保持 · 2 秒'],
  relaxProgress:['Hold relaxed · 2 seconds','放松保持 · 2 秒'], shiftProgress:['Hold the direction briefly','短暂保持方向'], launchProgress:['Flight starts in','距离起飞'],
  notInView:['Find your face','请入镜'], inView:['In view','已入镜'], settleStatus:['Get comfortable','调整姿势'], holdStatus:['Hold still','保持不动'],
  raiseStatus:['Raise eyebrows','抬起眉毛'], raisedStatus:['Raised ✓','已抬眉 ✓'], lowerStatus:['Relax eyebrows','放松眉毛'], relaxedStatus:['Relaxed ✓','已放松 ✓'],
  leftStatus:['Shift left','向左移动'], rightStatus:['Shift right','向右移动'], controlReady:['Ready ✓','就绪 ✓'],
  waitingFaces:['Waiting for faces · progress paused','等待入镜 · 进度暂停'], centerRetry:['Movement detected. Hold still again; the center check has restarted.','检测到移动，请重新保持不动，定中心进度已重置。'],
  waitingBoth:['Both faces needed','等待两人入镜'],
  hearts:['HEARTS','生命'], out:['OUT OF HEARTS','爱心用完啦'], outTitle:['Bonk. Back to base!','撞晕啦，返回基地！'], outCopy:['Three bumps, one goofy face. Your last ridiculous look stays until you leave. Take a breather.','撞了三次，大头回家。最后的搞笑造型会保留到你离开本轮，先休息一下吧。'],
  reconnect:['Finding your face… time and hearts are safe.','正在寻找面部…时间和爱心已冻结。'], reconnectBuddy:['Finding both pilots… time and hearts are safe.','正在寻找两位玩家…时间和爱心已冻结。'], returning:['Found you! Back in 1…','找到啦！1 秒后继续…'],
  noFilter:['GRAB A ? BOX','捡一个问号盒子'],
  cueStay:['STAY HERE','保持不动'], cueLeft:['MOVE LEFT','向左移动'], cueRight:['MOVE RIGHT','向右移动'], cueBrow:['EYEBROWS UP','抬起眉毛'], cueRelax:['RELAX','放松眉毛'], cueFrame:['FACE THE CAMERA','看向镜头'], cueGo:['GET READY','准备起飞'], autoSetup:['Starting automatically…','即将自动开始…'],
  steeringRoom:['Leave a little more room to steer: keep each face away from the preview edges and each other, or reduce Movement needed. Then start setup again.','请给转向留出更多空间：让脸离开预览边缘，两人之间留出距离，或调小移动幅度，然后重新开始准备。'],
};
let lang = 'en';
try { lang = localStorage.getItem('arcade_lang') === 'zh' ? 'zh' : 'en'; } catch {}
const t = key => copy[key]?.[lang === 'zh' ? 1 : 0] ?? key;
const filterLabel = id => FACE_FILTERS.find(filter => filter.id === id)?.[lang] ?? t('noFilter');
let phase = 'setup', mode = 'face', players = 1, duration = 30, game = null, stepTime = 0, samples = [];
let customDurationActive = false;
let centers = [.5,.5], faceWidths = [.15,.15], neutralBrows = [.05,.05], calibrated = false;
let browSwitches = [new BrowSwitch(),new BrowSwitch()], lastSample = {visible:false,time:0,faces:[],count:0}, filteredXs = [.5,.5];
let continuing = false, stableTime = 0, sound = false, audioContext = null, wakeLock = null, wakeEpoch = 0;
let phaseDetail = '', previousTime = performance.now(), hitGlows = [0,0], toastUntil = 0;
let pausedPhase = null;
let centerResetUntil = 0;
let missingSince = null, recoveryPhase = 'playing', hiddenPhase = null, autoFrameTime = 0, avatarTime = -Infinity;
const TRACKING_GRACE_MS = 1000;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const calibrationPhases = new Set(['prep','neutral','brow','relax','testLeft','testRight']);
const activePhases = new Set([...calibrationPhases,'starting','framing','countdown','playing','tracking']);
const cameraPrep = () => isCamera() && (['starting','framing','countdown'].includes(phase) || calibrationPhases.has(phase));
const isCamera = () => mode !== 'practice';
const getFaces = sample => sample.faces ?? (players === 1 ? [{x:sample.x,brow:sample.brow,width:.15}] : []);
const freshFace = now => lastSample.visible && getFaces(lastSample).length >= players && now - lastSample.time < 1000;
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)];
const flightGames = () => game ? (players === 2 ? game.games : [game]) : [];
const newFlight = () => players === 2 ? new CoopFlight(duration) : new Flight(duration);
const resetGestures = () => browSwitches.forEach(control => control.reset());
const moveThreshold = player => players === 2 ? Math.max(.008,faceWidths[player] * Number($('sensitivity').value) / 10) : Number($('sensitivity').value) / 100;
const directionReady = (face,player) => phase === 'testLeft' ? face.x - centers[player] > moveThreshold(player) : centers[player] - face.x > moveThreshold(player);
const calibrationCopy = () => phase === 'neutral' ? (players === 2 ? 'buddyNeutralCopy':'neutralCopy') : phase === 'brow' ? (players === 2 ? 'buddyBrowCopy':'browCalCopy') : (players === 2 ? 'buddyRelaxCopy':'relaxCopy');
const camera = new PlankCamera($('camera'), {
  onSample(sample) {
    const faces = getFaces(sample);
    if (players === 2 && calibrated && ['playing','countdown','tracking','brow','relax','testLeft','testRight'].includes(phase)) {
      const boundary = (centers[0] + centers[1]) / 2;
      if (faces.length !== 2 || faces[0].x <= boundary || faces[1].x >= boundary) sample = {...sample,visible:false};
    }
    lastSample = sample;
    if (!sample.visible) {
      resetGestures();
      if (calibrationPhases.has(phase) && phase !== 'prep') { stepTime = 0; samples = []; }
      return;
    }
    if (faces.length < players) return;
    if (sample.time - avatarTime >= 750 && ['neutral','brow','relax','testLeft','testRight','countdown','playing'].includes(phase)) {
      renderer.captureFaces($('camera'), faces); avatarTime = sample.time;
    }
    if (phase === 'neutral') {
      const trial = [...samples, faces];
      const moved = faces.some((_,player) => {
        const xs = trial.map(s=>s[player].x), brows = trial.map(s=>s[player].brow);
        return Math.max(...xs)-Math.min(...xs) > .055 || (mode === 'brow' && Math.max(...brows)-Math.min(...brows) > .2);
      });
      if (moved) { samples = []; stepTime = 0; centerResetUntil = sample.time + 700; }
      samples.push(faces);
    } else if (phase === 'brow') {
      if (faces.every((face,player) => face.brow - neutralBrows[player] >= .12)) samples.push(faces);
      else { samples = []; stepTime = 0; }
    }
    for (let player = 0; player < players; player++) filteredXs[player] += (faces[player].x - filteredXs[player]) * .4;
    if (phase === 'playing' || phase === 'countdown' || phase === 'tracking') {
      for (let player = 0; player < players; player++) {
        if (mode === 'face') {
          const offset = centers[player] - filteredXs[player];
          // In a shared view each face is smaller; scale motion to its eye span.
          const threshold = moveThreshold(player);
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
    ? (lang === 'en' ? 'Two side-by-side flight zones. Player 1 on the left, Player 2 on the right. Each pilot dodges rocks and collects mystery boxes to change their pixel face.' : '左右两个飞行区：左侧 P1，右侧 P2。每人在自己的两条航道中躲避珊瑚色障碍。')
    : (lang === 'en' ? 'Two flight lanes. Dodge rocks and collect mystery boxes to change your pixel face.' : '两条飞行航道，躲开珊瑚色障碍，穿过空航道。'));
  $('control-copy').textContent = t(mode === 'brow' ? 'browCopy' : 'faceCopy');
  document.body.classList.toggle('buddy-mode',players === 2);
  $('buddy-copy').hidden = players !== 2;
  document.querySelector('[data-key="position"]').textContent = t(players === 2 ? 'buddyPosition' : 'position');
  renderDuration();
  renderPhase();
}

function customSeconds() {
  const value = $('custom-duration').value.trim(), seconds = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds : null;
}
function renderDuration() {
  const invalid = customDurationActive && customSeconds() === null;
  $('custom-duration').setAttribute('data-active',String(customDurationActive));
  $('custom-duration').setAttribute('aria-invalid',String(invalid));
  $('duration-error').hidden = !invalid;
  $('duration-error').textContent = invalid ? t('durationInvalid') : '';
  $('camera-start').disabled = $('practice-start').disabled = invalid;
}
function acceptDuration() {
  if (!customDurationActive) return true;
  const seconds = customSeconds();
  renderDuration();
  if (seconds === null) return false;
  duration = seconds;
  return true;
}
function setPhase(next) {
  phase = next; stepTime = 0; samples = []; stableTime = 0; missingSince = null; autoFrameTime = 0;
  if (next === 'neutral') centerResetUntil = 0;
  renderPhase();
  if (cameraPrep()) $('camera-panel').scrollTop = 0;
}
function renderPhase() {
  for (const id of ['setup','camera-panel','message','results']) $(id).hidden = true;
  $('resume').hidden = true; $('recalibrate').hidden = true; $('countdown').hidden = true;
  $('hud').hidden = !game || cameraPrep() || ['setup','results'].includes(phase);
  $('player-scores').hidden = players !== 2 || $('hud').hidden;
  $('face-left').hidden = $('face-right').hidden = players !== 2;
  const scoreLabel = document.querySelector('#hud [data-key="score"]');
  if (scoreLabel) scoreLabel.textContent = t(players === 2 ? 'teamScore' : 'score');
  if (game) {
    const remaining = Math.ceil(Math.max(0, duration - game.elapsed));
    $('clock').textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    $('score').textContent = String(game.score);
    if (players === 2) {
      $('p1-score').textContent = game.games[0].score;
      $('p2-score').textContent = game.games[1].score;
    }
  }
  $('inflight-controls').hidden = !['playing','tracking'].includes(phase);
  $('tracking-notice').hidden = phase !== 'tracking';
  $('hearts').hidden = !game || players !== 1 || $('hud').hidden;
  renderHealth();
  $('touch-controls').hidden = phase !== 'playing' || mode !== 'practice' || players !== 1;
  $('buddy-touch').hidden = phase !== 'playing' || mode !== 'practice' || players !== 2;
  document.body.classList.toggle('playing', !!game && !['setup','starting','framing'].includes(phase));
  $('control-hint').textContent = t(mode === 'practice' ? (players === 2 ? 'buddyKeysHint':'keysHint') : mode === 'brow' ? 'browHint' : 'faceHint');
  $('status').textContent = t(phase === 'setup' ? 'ready' : phase === 'results' ? 'resultStatus' : isCamera() ? 'tracked' : 'practiceStatus');
  if (phase === 'setup') { $('setup').hidden = false; return; }
  if (cameraPrep()) { renderPrep(); return; }
  if (phase === 'playing' || phase === 'tracking') return;
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

function renderPrep() {
  const framing = phase === 'starting' || phase === 'framing';
  const stage = framing ? 'frame' : phase === 'prep' ? 'settle' : phase === 'neutral' ? 'center' : phase === 'countdown' ? 'launch' : 'controls';
  const stages = ['frame','center','controls','launch'], current = stages.indexOf(stage === 'settle' ? 'frame' : stage);
  $('camera-panel').hidden = false;
  $('camera-panel').setAttribute('data-stage',stage);
  $('camera-kicker').textContent = t({frame:'frameStep',settle:'settleStep',center:'centerStep',controls:'controlsStep',launch:'launchStep'}[stage]);
  for (const [index,step] of stages.entries()) {
    const el = $(`prep-step-${step}`);
    el.setAttribute('data-state',index < current ? 'done' : index === current ? 'current' : 'pending');
    el.setAttribute('aria-current',index === current ? 'step' : 'false');
  }
  const titles = {starting:'loading',framing:phaseDetail?'calibrationError':'framing',prep:'prep',neutral:'neutral',brow:'brow',relax:'relax',testLeft:'testLeft',testRight:'testRight',countdown:'launchReady'};
  const details = {starting:'loadingCopy',framing:phaseDetail||(players===2?'buddyFramingCopy':'framingCopy'),prep:'prepCopy',neutral:calibrationCopy(),brow:calibrationCopy(),relax:calibrationCopy(),testLeft:players===2?'buddyTestLeftCopy':'testLeftCopy',testRight:players===2?'buddyTestRightCopy':'testRightCopy',countdown:'launchCopy'};
  const next = {starting:'nextSettle',framing:'nextSettle',prep:'nextCenter',neutral:mode==='brow'?'nextBrow':'nextShift',brow:'nextRelax',relax:'nextCountdown',testLeft:'nextRight',testRight:'nextCountdown'};
  const cue = {starting:['frame','cueFrame'],framing:['frame','cueFrame'],prep:['stay','cueStay'],neutral:['stay','cueStay'],brow:['up','cueBrow'],relax:['stay','cueRelax'],testLeft:['left','cueLeft'],testRight:['right','cueRight'],countdown:['go','cueGo']}[phase];
  $('prep-cue').setAttribute('data-action',cue[0]);
  $('prep-cue-label').textContent = t(cue[1]);
  $('camera-title').textContent = t(titles[phase]);
  $('camera-copy').textContent = t(details[phase]);
  $('prep-next').hidden = phase === 'countdown';
  $('prep-next').textContent = next[phase] ? t(next[phase]) : '';
  $('camera-position').hidden = !framing;
  $('camera-options').hidden = !framing;
  $('camera-signal').hidden = true; // Readiness now describes the actual action for each pilot.
  $('calibrate').hidden = !framing;
  $('calibrate').disabled = phase !== 'framing' || !freshFace(performance.now());
  $('camera-cancel').textContent = t(framing ? 'back' : 'finish');
  $('sensitivity-label').hidden = mode !== 'face';
  $('prep-p2').hidden = players !== 2;
  $('prep-progress-wrap').hidden = phase === 'starting';
  $('prep-progress-label').textContent = t({prep:'centerStarts',neutral:'holdProgress',brow:'browProgress',relax:'relaxProgress',testLeft:'shiftProgress',testRight:'shiftProgress',countdown:'launchProgress'}[phase] || 'holdProgress');
  updatePrep(performance.now());
}

function updatePrep(now) {
  const visible = freshFace(now), faces = getFaces(lastSample);
  $('tracking-label').textContent = t(phase === 'starting' ? 'cameraWaiting' : players === 2 ? (visible ? 'bothFaces':'needBoth') : visible ? 'faceSeen' : 'noFace');
  if (players === 2 && !visible && phase !== 'starting') $('tracking-label').textContent += ` · ${lastSample.count ?? faces.length}/2`;
  $('calibrate').disabled = phase !== 'framing' || !visible;
  for (let player = 0; player < players; player++) {
    const face = faces[player], el = $(`prep-p${player+1}`);
    let ready = visible, key = 'inView';
    if (!visible) { ready = false; key = players === 2 ? 'waitingBoth' : 'notInView'; }
    else if (phase === 'prep') { ready = false; key = 'settleStatus'; }
    else if (phase === 'neutral') { ready = false; key = 'holdStatus'; }
    else if (phase === 'brow') { ready = face.brow - neutralBrows[player] >= .12; key = ready ? 'raisedStatus' : 'raiseStatus'; }
    else if (phase === 'relax') { ready = face.brow < browSwitches[player].low; key = ready ? 'relaxedStatus' : 'lowerStatus'; }
    else if (phase === 'testLeft' || phase === 'testRight') { ready = directionReady(face,player); key = ready ? 'controlReady' : phase === 'testLeft' ? 'leftStatus' : 'rightStatus'; }
    else if (phase === 'countdown') key = 'controlReady';
    el.textContent = `${players === 2 ? `P${player+1} · ` : ''}${t(key)}`;
    el.setAttribute('data-state',ready ? 'ready' : 'waiting');
  }
  const limit = phase === 'framing' ? .8 : phase === 'prep' ? 5 : phase === 'countdown' ? 3 : phase === 'testLeft' || phase === 'testRight' ? .35 : 2;
  $('prep-progress').value = Math.min(1,(phase === 'framing' ? autoFrameTime : stepTime) / limit);
  if (phase === 'framing') $('prep-progress-label').textContent = t(phaseDetail ? 'cameraTag' : visible ? 'autoSetup' : 'notInView');
  $('prep-timer').textContent = phase === 'prep' || phase === 'countdown' ? String(Math.max(1,Math.ceil(limit-stepTime))) : `${Math.round(Math.min(1,stepTime/limit)*100)}%`;
  if (!visible && calibrationPhases.has(phase) && phase !== 'prep') {
    $('camera-copy').textContent = t(players === 2 ? 'buddyLostCal':'lostCal');
    $('prep-progress-label').textContent = t('waitingFaces');
  } else if (phase === 'neutral') {
    $('camera-copy').textContent = t(now < centerResetUntil ? 'centerRetry' : calibrationCopy());
    $('prep-progress-label').textContent = t('holdProgress');
  } else if (phase === 'brow' || phase === 'relax') {
    $('camera-copy').textContent = t(calibrationCopy());
    $('prep-progress-label').textContent = t(phase === 'brow' ? 'browProgress':'relaxProgress');
  } else if (phase === 'testLeft' || phase === 'testRight') {
    $('camera-copy').textContent = t(phase === 'testLeft' ? (players === 2 ? 'buddyTestLeftCopy':'testLeftCopy') : (players === 2 ? 'buddyTestRightCopy':'testRightCopy'));
    $('prep-progress-label').textContent = t('shiftProgress');
  }
}

async function requestWake() {
  if (!('wakeLock' in navigator) || wakeLock || document.hidden) return;
  const epoch = ++wakeEpoch;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (epoch !== wakeEpoch || !activePhases.has(phase)) { await lock.release(); return; }
    wakeLock = lock;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) { wakeLock = null; if (!document.hidden && activePhases.has(phase)) requestWake(); }
    });
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
  osc.type = 'square'; osc.frequency.value = frequency;
  gain.gain.setValueAtTime(.055, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + length);
  osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + length);
}
function backToSetup() {
  camera.stop(); releaseWake(); game = null; continuing = false; lastSample = {visible:false,time:0};
  calibrated = false; hiddenPhase = null; renderer.clearFaces(); avatarTime = -Infinity;
  phaseDetail = ''; mode = document.querySelector('[data-control][aria-pressed=true]').dataset.control;
  $('toast').textContent = ''; setPhase('setup'); translate();
}
function enterTracking() {
  if (!isCamera()) return;
  if (phase !== 'tracking') recoveryPhase = phase === 'countdown' ? 'countdown' : 'playing';
  resetGestures(); setPhase('tracking');
  $('tracking-notice').textContent = t(players === 2 ? 'reconnectBuddy' : 'reconnect');
}
function startCountdown() {
  resetGestures(); filteredXs = centers.slice();
  setPhase('countdown'); requestWake();
}
function pause() {
  if (!activePhases.has(phase)) return;
  hiddenPhase = null; pausedPhase = phase; setPhase('paused'); camera.pause(); releaseWake();
}
function stopFlight() {
  camera.stop(); releaseWake();
  if (!game || game.elapsed === 0) { backToSetup(); return; }
  const key = players === 2 ? `plank_pilot_makeovers_v4_buddy_${mode}_${duration}` : `plank_pilot_makeovers_v4_${mode}_${duration}`;
  let best = game.score;
  try { best = Math.max(Number(localStorage.getItem(key)) || 0, game.score); localStorage.setItem(key, String(best)); } catch {}
  game.best = best; $('toast').textContent = ''; setPhase('results'); tone(660, .3);
}
function renderHealth() {
  const hearts = flight => '♥'.repeat(flight.health) + '♡'.repeat(flight.maxHealth - flight.health);
  if (!game) return;
  if (players === 1) {
    $('active-filter').textContent = filterLabel(game.activeFilter);
    $('hearts').textContent = hearts(game); $('hearts').setAttribute('aria-label',`${t('hearts')}: ${game.health}/3`);
  } else for (const [i,flight] of game.games.entries()) {
    $(`p${i+1}-filter`).textContent = filterLabel(flight.activeFilter);
    $(`p${i+1}-hearts`).textContent = hearts(flight);
    $(`p${i+1}-hearts`).setAttribute('aria-label',`P${i+1} ${t('hearts')}: ${flight.health}/3`);
  }
}
function renderResults() {
  if (!game) return;
  const out = game.health === 0;
  $('result-kicker').textContent = t(out ? 'out' : game.done ? 'complete' : 'stopped');
  $('result-title').textContent = t(out ? 'outTitle' : game.done ? 'landed' : 'stoppedTitle');
  $('result-copy').textContent = t(out ? 'outCopy' : mode === 'practice' ? 'practiceResult' : players === 2 ? 'buddyResult' : game.done ? 'completeCopy' : 'stoppedCopy');
  $('result-time').textContent = `${Math.floor(game.elapsed)} / ${duration}`;
  $('result-score').textContent = game.score; $('result-gates').textContent = game.cleared;
  $('result-best').textContent = game.best ?? game.score;
  $('result-buddy').hidden = players !== 2;
  if (players === 2) $('result-buddy').textContent = `P1: ${game.games[0].score} · P2: ${game.games[1].score} · ${lang==='zh'?'同步变装':'Shared makeovers'}: ${game.togetherCount}`;
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
  if (phase !== 'setup') return;
  customDurationActive = false; $('custom-duration').value = '';
  duration = Number(button.dataset.duration);
  document.querySelectorAll('[data-duration]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
  renderDuration();
}));
$('custom-duration').addEventListener('input', () => {
  if (phase !== 'setup') return;
  customDurationActive = true;
  document.querySelectorAll('[data-duration]').forEach(el=>el.setAttribute('aria-pressed','false'));
  const seconds = customSeconds();
  if (seconds !== null) duration = seconds;
  renderDuration();
});
document.querySelectorAll('[data-control]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.control;
  document.querySelectorAll('[data-control]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
  $('control-copy').textContent = t(mode === 'brow' ? 'browCopy' : 'faceCopy');
}));
$('lang').onclick = () => { lang = lang === 'en' ? 'zh' : 'en'; try { localStorage.setItem('arcade_lang',lang); } catch {} translate(); };
$('sound').onclick = () => { sound = !sound; $('sound').setAttribute('aria-pressed', String(sound)); unlockAudio(); translate(); };
$('camera-start').onclick = async () => {
  if (!acceptDuration()) return;
  unlockAudio(); phaseDetail = ''; continuing = false;
  if (window.Capacitor?.isNativePlatform?.()) { phaseDetail = 'nativeError'; setPhase('error'); return; }
  renderer.clearFaces(); avatarTime = -Infinity;
  setPhase('starting'); requestWake();
  try { if (await camera.start({numFaces:players}) && phase === 'starting') setPhase('framing'); } catch { /* onError renders recovery. */ }
};
$('camera-cancel').onclick = () => game?.elapsed > 0 ? stopFlight() : backToSetup();
$('practice-start').onclick = () => {
  if (!acceptDuration()) return;
  camera.stop(); unlockAudio(); mode = 'practice'; game = newFlight(); continuing = false; startCountdown();
};
function beginPrep() { phaseDetail = ''; calibrated = false; unlockAudio(); setPhase('prep'); requestWake(); }
$('calibrate').onclick = beginPrep;
$('resume').onclick = () => {
  unlockAudio();
  const interruptedCalibration = calibrationPhases.has(pausedPhase);
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
// Ignore focus/blur: browser chrome and permission UI can steal focus while the
// page remains visible. Only real backgrounding suspends the camera/round.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (phase !== 'paused' && activePhases.has(phase)) hiddenPhase = phase;
    camera.pause(); releaseWake();
  } else {
    previousTime = performance.now();
    if (hiddenPhase) {
      const resumePhase = hiddenPhase; hiddenPhase = null;
      lastSample = {visible:false,time:0,faces:[],count:0};
      if (game && ['playing','tracking','countdown'].includes(resumePhase)) {
        if (isCamera()) { enterTracking(); camera.resume(); } else startCountdown();
      } else {
        if (resumePhase !== 'starting') setPhase(calibrationPhases.has(resumePhase) ? 'prep' : 'framing');
        camera.resume();
      }
      requestWake();
    }
  }
});
window.addEventListener('pagehide', e => {
  // A cached page can return to its round. A real navigation releases tracks.
  if (e.persisted) { camera.pause(); releaseWake(); }
  else { camera.stop(); releaseWake(); }
});
window.addEventListener('pageshow', e => {
  if (e.persisted && isCamera() && activePhases.has(phase) && !document.hidden) {
    if (game) enterTracking();
    camera.resume(); requestWake();
  }
});
// ResizeObserver handles rotation without throwing away calibration or progress.

function progress(dt, now) {
  const visible = freshFace(now);
  if (cameraPrep()) updatePrep(now);
  if (['playing','countdown'].includes(phase) && isCamera() && !visible) {
    missingSince ??= now;
    // Brief misses freeze hazards quietly. Never charge health for lost input.
    if (now - missingSince >= TRACKING_GRACE_MS) enterTracking();
    return;
  }
  if (visible) missingSince = null;
  if (phase === 'framing' && !phaseDetail) {
    autoFrameTime = visible ? autoFrameTime + dt : 0;
    if (autoFrameTime >= .8) beginPrep();
  } else if (phase === 'playing') {
    for (const event of game.advance(dt)) {
      const pilot = event.player ?? 0;
      $('toast').textContent = (players === 2 && !event.together ? `P${pilot+1} · ` : '') + (event.type === 'hit' ? t('hit') : event.together ? t('together') : filterLabel(event.filter)); toastUntil = now + 1500;
      if (event.type === 'hit') { hitGlows[pilot] = .6; tone(125,.18); } else tone(520 + Math.min(flightGames()[pilot].streak,5)*50);
    }
    const remaining = Math.ceil(Math.max(0,duration - game.elapsed));
    $('clock').textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    $('score').textContent = String(game.score);
    if (players === 2) { $('p1-score').textContent = game.games[0].score; $('p2-score').textContent = game.games[1].score; }
    renderHealth();
    if (game.done) stopFlight();
  } else if (phase === 'tracking') {
    stableTime = visible ? stableTime + dt : 0;
    $('tracking-notice').textContent = t(visible ? 'returning' : players === 2 ? 'reconnectBuddy' : 'reconnect');
    if (stableTime >= .75) {
      if (recoveryPhase === 'countdown') startCountdown();
      else { resetGestures(); setPhase('playing'); requestWake(); }
    }
  } else if (phase === 'prep') {
    stepTime += dt;
    if (stepTime >= 5) setPhase('neutral');
  } else if (['neutral','brow','relax'].includes(phase)) {
    if (!visible) { stepTime = 0; samples = []; return; }
    const faces = getFaces(lastSample);
    if (phase === 'brow' && faces.some((face,index) => face.brow - neutralBrows[index] < .12)) { stepTime = 0; samples = []; return; }
    if (phase === 'relax' && faces.some((face,index) => face.brow >= browSwitches[index].low)) { stepTime = 0; return; }
    stepTime += dt;
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
      if (mode === 'face' && centers.slice(0,players).some((center,player) => {
        const room = Math.min(center,1-center,players === 2 ? Math.abs(centers[0]-centers[1])/2 : 1);
        return room <= moveThreshold(player) * 1.1;
      })) { phaseDetail = 'steeringRoom'; setPhase('framing'); releaseWake(); return; }
      calibrated = true;
      setPhase(mode === 'brow' ? 'brow' : 'testLeft');
    } else if (phase === 'brow') {
      const nextSwitches = [];
      for (let player = 0; player < players; player++) {
        const raised = median(samples.map(s=>s[player].brow));
        if (raised - neutralBrows[player] < .12) { phaseDetail = players === 2 ? 'buddyWeakBrow':'weakBrow'; setPhase('framing'); releaseWake(); return; }
        nextSwitches.push(new BrowSwitch(neutralBrows[player],raised));
      }
      browSwitches = nextSwitches; setPhase('relax');
    } else { if (!continuing) game = newFlight(); startCountdown(); }
  } else if (phase === 'testLeft' || phase === 'testRight') {
    if (!visible || !getFaces(lastSample).every(directionReady)) { stepTime = 0; return; }
    stepTime += dt;
    if (stepTime >= .35) {
      if (phase === 'testLeft') setPhase('testRight');
      else { if (!continuing) game = newFlight(); startCountdown(); }
    }
  } else if (phase === 'countdown') {
    const old = Math.ceil(3-stepTime); stepTime += dt;
    if (mode === 'practice') $('countdown').textContent = Math.max(1,Math.ceil(3-stepTime));
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
  // Drop stalled time instead of forcing a manual pause or fast-forwarding hits.
  const dt = gap > .25 ? 0 : Math.max(0,gap);
  if (!document.hidden) { progress(dt,now); draw(now,Math.min(.1,dt)); }
  requestAnimationFrame(frame);
}
translate(); resize(); requestAnimationFrame(frame);
