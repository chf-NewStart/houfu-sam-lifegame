(function () {
  'use strict';

  const { GoGame, BLACK, WHITE, EMPTY, other, coordinate, starPoints } = window.GoEngine;
  const $ = (id) => document.getElementById(id);
  const colorKey = (color) => color === BLACK ? 'black' : 'white';
  const colorName = (color) => tr(color === BLACK ? 'Black' : 'White', color === BLACK ? '黑棋' : '白棋');
  const firebaseConfig = {
    apiKey: 'AIzaSyAedvXKKf0YZLuaNTwCm7_-Y_pJoZchqwo',
    authDomain: 'remoteplay-b5486.firebaseapp.com',
    databaseURL: 'https://remoteplay-b5486-default-rtdb.firebaseio.com',
    projectId: 'remoteplay-b5486',
    storageBucket: 'remoteplay-b5486.firebasestorage.app',
    messagingSenderId: '142560337765',
    appId: '1:142560337765:web:a0fad172347d04dc638b8c',
  };
  const ROOM_RE = /^[A-HJ-NP-Z2-9]{7}$/;
  const ROOM_TTL = 24 * 60 * 60 * 1000;
  const NETWORK_TIMEOUT = 12000;

  let lang = 'en';
  let learnMode = true;
  let game = new GoGame({ size: 9, komi: 7.5 });
  let localDead = [];
  let localResult = null;
  let reviewAt = null;
  let selectedIndex = null;
  let hoverCell = null;
  let aimCell = null;
  let keyboardCell = { r: 4, c: 4 };
  let coach = {
    headEn: 'LIBERTIES', headZh: '气',
    bodyEn: 'Empty points touching a group keep it alive. Tap a stone to see them.',
    bodyZh: '与棋群相邻的空点让它存活。点击棋子即可查看。',
  };
  let promptYes = null;
  let promptNo = null;
  let toastTimer = 0;
  let canvasSize = 0;
  let pad = 28;
  let cell = 1;
  let ctx = null;
  let db = null;
  let remoteBusy = false;
  let room = blankRoom();

  function blankRoom() {
    return {
      code: null, token: clientToken(), color: null, ref: null, snap: null,
      listener: null, presence: null, requestSeen: null, reactionSeen: null,
    };
  }

  function clientToken() {
    try {
      let value = localStorage.getItem('go_client_token') || sessionStorage.getItem('go_client_token');
      if (!value) {
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }
      localStorage.setItem('go_client_token', value);
      sessionStorage.setItem('go_client_token', value);
      return value;
    } catch (error) {
      return String(Date.now()) + Math.random().toString(16).slice(2);
    }
  }

  function tr(en, zh) { return lang === 'zh' ? zh : en; }
  function applyLanguage() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
    document.querySelectorAll('[data-en]').forEach((el) => {
      el.textContent = tr(el.dataset.en, el.dataset.zh || el.dataset.en);
    });
    document.querySelectorAll('[data-en-placeholder]').forEach((el) => {
      el.placeholder = tr(el.dataset.enPlaceholder, el.dataset.zhPlaceholder || el.dataset.enPlaceholder);
    });
    $('langBtn').textContent = lang === 'zh' ? 'English' : '中文';
    render();
  }

  function toggleLanguage() {
    lang = lang === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('arcade_lang', lang); } catch (error) {}
    applyLanguage();
  }

  function setCoach(headEn, headZh, bodyEn, bodyZh) {
    coach = { headEn, headZh, bodyEn, bodyZh };
    renderCoach();
  }

  function renderCoach() {
    const note = $('coachNote');
    if (!learnMode) {
      note.innerHTML = '<strong>' + tr('AIDS OFF', '辅助已关') + '</strong> · ' +
        tr('The rules are still enforced; visual hints are hidden.', '规则仍会执行，只是不显示视觉提示。');
      $('inspectInfo').textContent = '';
      return;
    }
    note.innerHTML = '<strong>' + tr(coach.headEn, coach.headZh) + '</strong> · ' + tr(coach.bodyEn, coach.bodyZh);
    renderInspection();
  }

  function announce(message) {
    $('liveRegion').textContent = '';
    window.setTimeout(() => { $('liveRegion').textContent = message; }, 20);
  }

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('show'), 1900);
  }

  function showPrompt(message, yes, no) {
    $('promptMessage').textContent = message;
    promptYes = yes;
    promptNo = no;
    $('promptModal').classList.add('show');
    $('promptYes').focus();
  }

  function closePrompt(which) {
    $('promptModal').classList.remove('show');
    const callback = which === 'yes' ? promptYes : promptNo;
    promptYes = null;
    promptNo = null;
    if (callback) callback();
  }

  function eventsOf(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(cleanEvent).filter(Boolean);
    return Object.keys(value).sort((a, b) => Number(a) - Number(b)).map((key) => cleanEvent(value[key])).filter(Boolean);
  }

  function cleanEvent(event) {
    if (!event || typeof event !== 'object' || !['play', 'pass', 'resume', 'resign'].includes(event.t)) return null;
    const by = Number(event.by);
    if (by !== BLACK && by !== WHITE) return null;
    const out = { t: event.t, by };
    if (event.t === 'play') {
      out.r = Number(event.r);
      out.c = Number(event.c);
      if (!Number.isInteger(out.r) || !Number.isInteger(out.c)) return null;
    }
    return out;
  }

  function deadOf(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    return Object.keys(value).filter((key) => value[key]).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  }

  function deadObject(points) {
    const out = {};
    points.forEach((point) => { out[point] = true; });
    return out;
  }

  function roomEvents(source) { return eventsOf(source && source.actions); }
  function currentDead() {
    if (room.code && room.snap) return deadOf(room.snap.review && room.snap.review.dead);
    return localDead.slice();
  }

  function currentResult() {
    if (room.code && room.snap && room.snap.result && Number(room.snap.result.session) === Number(room.snap.session)) return room.snap.result;
    return game.result || localResult;
  }

  function roomWaiting() {
    return !!room.code && (!room.snap || !(room.snap.seats && room.snap.seats.white));
  }

  function displayGame() {
    if (reviewAt == null) return game;
    const replay = GoGame.replay({ size: game.size, komi: game.komi, events: game.events.slice(0, reviewAt) });
    return replay.game;
  }

  function resetView() {
    reviewAt = null;
    selectedIndex = null;
    hoverCell = null;
    aimCell = null;
  }

  function newLocal(size) {
    const nextSize = Number(size || game.size);
    game = new GoGame({ size: nextSize, komi: 7.5 });
    localDead = [];
    localResult = null;
    keyboardCell = { r: Math.floor(nextSize / 2), c: Math.floor(nextSize / 2) };
    resetView();
    setCoach('OPENING', '开局', 'Black begins. Corners are easiest to surround; every stone still needs liberties.', '黑棋先行。角部最容易围地，但每颗棋子都需要气。');
    render();
    resizeCanvas();
  }

  function replayEvents(events, size, komi) {
    return GoGame.replay({ size: Number(size), komi: Number(komi), events });
  }

  function illegalMessage(reason) {
    const map = {
      occupied: tr('That intersection is occupied. Tap the stone to inspect its group.', '该交叉点已有棋子。点击棋子可查看棋群。'),
      suicide: tr('Suicide: that group would have no liberties after captures.', '自杀禁手：提子后你的棋群仍将没有气。'),
      superko: tr('Superko: this move would repeat an earlier board position.', '全局同形：这一步会重复此前的棋盘局面。'),
      'wrong-player': tr('It is the other player’s turn.', '现在轮到对方。'),
      'not-playing': tr('The game is not in the playing phase.', '当前不在对弈阶段。'),
      'out-of-bounds': tr('Choose an intersection on the board.', '请选择棋盘上的交叉点。'),
    };
    return map[reason] || tr('That move is not legal.', '这一步不合法。');
  }

  function describeMove(result, row, col) {
    const coord = coordinate(game.size, row, col);
    if (result.captured.length) {
      setCoach('CAPTURE', '提子', `${coord} removed ${result.captured.length} stone${result.captured.length === 1 ? '' : 's'}. Captured stones had no liberties.`, `${coord} 提走了 ${result.captured.length} 颗棋子；被提棋群已无气。`);
    } else if (result.liberties.length === 1) {
      setCoach('ATARI', '打吃', `${coord} leaves your new group with one liberty. Your friend can capture it next.`, `${coord} 让新棋群只剩一口气；好友下一手可能提掉它。`);
    } else {
      setCoach('GROUP', '棋群', `${coord} joins a ${result.group.length}-stone group with ${result.liberties.length} liberties.`, `${coord} 形成 ${result.group.length} 颗棋子的棋群，共有 ${result.liberties.length} 口气。`);
    }
    selectedIndex = game.index(row, col);
  }

  function attemptPlay(row, col) {
    if (reviewAt != null) {
      toast(tr('Return to Live before playing.', '返回“当前”后才能落子。'));
      return;
    }
    if (roomWaiting()) {
      toast(tr('Wait for your friend to join.', '请等待好友加入。'));
      return;
    }
    const result = currentResult();
    if (result) return;
    if (game.phase === 'scoring') {
      if (game.at(row, col) !== EMPTY) toggleDeadGroup(row, col);
      else toast(tr('Tap a stone group to mark it dead or alive.', '点击棋群以标记死活。'));
      return;
    }
    if (game.at(row, col) !== EMPTY && learnMode) {
      selectedIndex = game.index(row, col);
      const group = game.groupAt(row, col);
      setCoach('LIBERTIES', '气', `${colorName(group.color)}’s ${group.stones.length}-stone group has ${group.liberties.length} ${group.liberties.length === 1 ? 'liberty' : 'liberties'}.`, `${colorName(group.color)}的 ${group.stones.length} 子棋群有 ${group.liberties.length} 口气。`);
      render();
      return;
    }
    if (room.code) {
      if (!room.snap || !room.color) return;
      if (game.current !== room.color) {
        toast(tr('Your friend is thinking.', '正在等好友落子。'));
        return;
      }
      sendRemoteEvent({ t: 'play', r: row, c: col, by: room.color });
      return;
    }
    const outcome = game.play(row, col);
    if (!outcome.ok) {
      const message = illegalMessage(outcome.reason);
      setCoach('ILLEGAL MOVE', '禁手', message, message);
      toast(message);
      announce(message);
      render();
      return;
    }
    describeMove(outcome, row, col);
    announce(`${colorName(outcome.color)} ${coordinate(game.size, row, col)}. ${outcome.captured.length ? tr('Captured ', '提子 ') + outcome.captured.length : ''}`);
    render();
  }

  function passTurn() {
    if (reviewAt != null || currentResult() || game.phase !== 'playing' || roomWaiting()) return;
    if (room.code) {
      if (game.current !== room.color) { toast(tr('It is your friend’s turn.', '现在轮到好友。')); return; }
      sendRemoteEvent({ t: 'pass', by: room.color });
      return;
    }
    const outcome = game.pass();
    if (!outcome.ok) return;
    if (outcome.scoring) {
      setCoach('SCORING', '计分', 'Both players passed. Tap any stones you both agree are dead, then accept the score.', '双方均停一手。点击双方认定的死棋，然后同意结果。');
    } else {
      setCoach('PASS', '停一手', 'Passing gives the turn away. A second consecutive pass starts scoring.', '停一手会把回合交给对方；双方连续停一手后开始计分。');
    }
    render();
  }

  function askResign() {
    if (reviewAt != null || currentResult() || (game.phase !== 'playing' && game.phase !== 'scoring')) return;
    showPrompt(tr('Resign this game?', '确定认输本局吗？'), () => {
      if (room.code) sendRemoteEvent({ t: 'resign', by: room.color });
      else { game.resign(game.current); setCoach('GAME OVER', '对局结束', 'The game ended by resignation. Use Review to walk through the moves.', '本局以认输结束。可用“复盘”回看每一步。'); render(); }
    });
  }

  function askNewGame() {
    if (room.code) {
      sendRequest('new');
      return;
    }
    if (!game.events.length) { newLocal(game.size); return; }
    showPrompt(tr('Start a fresh game? The current moves will be cleared.', '开始新对局吗？当前棋谱会被清除。'), () => newLocal(game.size));
  }

  function undoMove() {
    if (reviewAt != null || !game.events.length) return;
    if (room.code) { sendRequest('undo'); return; }
    const replay = replayEvents(game.events.slice(0, -1), game.size, game.komi);
    if (replay.error) return;
    game = replay.game;
    localDead = [];
    localResult = null;
    selectedIndex = null;
    setCoach('UNDO', '悔棋', 'The last action was removed. The board, captures, and ko history were rebuilt.', '已撤回上一步；棋盘、提子数与劫争历史均已重建。');
    render();
  }

  function toggleDeadGroup(row, col) {
    if (game.phase !== 'scoring' || currentResult()) return;
    if (room.code) {
      mutateRemoteReview('mark', { row, col });
      return;
    }
    localDead = game.toggleDead(localDead, row, col);
    setCoach('DEAD STONES', '死棋', 'Marked stones are removed before area is counted. Tap the group again if it is alive.', '标记的棋子会在面积计分前移除；若该棋群仍活着，再点一次即可取消。');
    render();
  }

  function acceptScore() {
    if (reviewAt != null || game.phase !== 'scoring' || currentResult()) return;
    if (room.code) { mutateRemoteReview('accept'); return; }
    const score = game.score(localDead);
    localResult = scoreResult(score, 0, localDead);
    setCoach('FINAL SCORE', '最终结果', `${colorName(score.winner)} wins by ${formatNumber(score.margin)}.`, `${colorName(score.winner)}胜 ${formatNumber(score.margin)} 目。`);
    render();
  }

  function resumePlay() {
    if (reviewAt != null || game.phase !== 'scoring' || currentResult()) return;
    if (room.code) {
      sendRemoteEvent({ t: 'resume', by: room.color });
      return;
    }
    game.resume(game.current);
    localDead = [];
    setCoach('RESUME', '继续', 'Play resumed so uncertain groups can be settled on the board.', '对弈已继续，可在棋盘上解决有争议的棋群。');
    render();
  }

  function scoreResult(score, session, dead) {
    return {
      reason: 'score', session: Number(session || 0), winner: score.winner,
      margin: score.margin, black: score.black, white: score.white,
      dead: deadObject(dead || []),
    };
  }

  function formatNumber(value) {
    return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(1);
  }

  function setBoardSize(size) {
    const next = Number(size);
    if (room.code) { toast(tr('Board size is fixed for this room.', '房间内棋盘大小已固定。')); return; }
    if (next === game.size && !game.events.length) return;
    newLocal(next);
  }

  function toggleLearn() {
    learnMode = !learnMode;
    $('learnBtn').setAttribute('aria-pressed', String(learnMode));
    try { localStorage.setItem('go_learn', learnMode ? '1' : '0'); } catch (error) {}
    if (!learnMode) selectedIndex = null;
    render();
  }

  function renderInspection() {
    const state = displayGame();
    const el = $('inspectInfo');
    if (!learnMode || selectedIndex == null || state.board[selectedIndex] === EMPTY) { el.textContent = ''; return; }
    const rc = state.rowCol(selectedIndex);
    const group = state.groupAt(rc[0], rc[1]);
    el.textContent = tr(
      `${colorName(group.color)} group · ${group.stones.length} stone${group.stones.length === 1 ? '' : 's'} · ${group.liberties.length} ${group.liberties.length === 1 ? 'liberty' : 'liberties'}`,
      `${colorName(group.color)}棋群 · ${group.stones.length} 子 · ${group.liberties.length} 口气`,
    );
  }

  function render() {
    renderCoach();
    renderStatus();
    renderControls();
    renderScoring();
    renderReview();
    renderLog();
    drawBoard();
  }

  function renderStatus() {
    const result = currentResult();
    const title = $('turnTitle');
    const sub = $('turnSub');
    const stone = $('turnStone');
    let shownColor = game.current;
    if (reviewAt != null) {
      title.textContent = tr(`Reviewing ${reviewAt} of ${game.events.length} actions`, `正在复盘第 ${reviewAt}/${game.events.length} 步`);
      sub.textContent = tr('The live game is paused only on this screen.', '这里只暂停画面，不会改变实时对局。');
    } else if (result) {
      shownColor = Number(result.winner) || BLACK;
      if (result.reason === 'resign') {
        title.textContent = tr(`${colorName(shownColor)} wins by resignation`, `${colorName(shownColor)}中盘胜`);
        sub.textContent = tr('Review the game or request a rematch.', '可复盘棋局或请求再来一局。');
      } else {
        title.textContent = tr(`${colorName(shownColor)} wins by ${formatNumber(result.margin)}`, `${colorName(shownColor)}胜 ${formatNumber(result.margin)} 目`);
        sub.textContent = tr(`Black ${formatNumber(result.black)} · White ${formatNumber(result.white)}`, `黑 ${formatNumber(result.black)} · 白 ${formatNumber(result.white)}`);
      }
    } else if (game.phase === 'scoring') {
      title.textContent = tr('Scoring together', '共同计分');
      sub.textContent = tr('Tap dead groups, check the area, then agree.', '标记死棋、核对面积，然后共同确认。');
    } else {
      title.textContent = room.code
        ? (game.current === room.color ? tr(`${colorName(game.current)} — your turn`, `${colorName(game.current)}——轮到你`) : tr(`${colorName(game.current)} — friend’s turn`, `${colorName(game.current)}——好友回合`))
        : tr(`${colorName(game.current)} to play`, `${colorName(game.current)}落子`);
      sub.textContent = game.passes === 1
        ? tr('One pass. Another pass starts scoring.', '已停一手；再次停一手将开始计分。')
        : tr('Tap an intersection to place a stone.', '点击交叉点落子。');
    }
    stone.className = 'turn-stone ' + colorKey(shownColor);
    $('modeBadge').textContent = room.code
      ? tr(`ROOM ${room.code} · YOU: ${colorKey(room.color).toUpperCase()}`, `房间 ${room.code} · 你执${room.color === BLACK ? '黑' : '白'}`)
      : `LOCAL · ${game.size}×${game.size}`;
    $('blackCaptures').textContent = game.captures[BLACK];
    $('whiteCaptures').textContent = game.captures[WHITE];
    const boardLabel = tr(`${game.size} by ${game.size} Go board. `, `${game.size} 路围棋棋盘。`) + title.textContent;
    $('goBoard').setAttribute('aria-label', boardLabel);
  }

  function renderControls() {
    const result = currentResult();
    const reviewing = reviewAt != null;
    const myTurn = !room.code || game.current === room.color;
    const waiting = roomWaiting();
    $('passBtn').disabled = reviewing || !!result || game.phase !== 'playing' || !myTurn || remoteBusy || waiting;
    $('resignBtn').disabled = reviewing || !!result || (!room.color && !!room.code) || remoteBusy || waiting;
    $('undoBtn').disabled = reviewing || !game.events.length || remoteBusy || waiting;
    $('newBtn').disabled = remoteBusy || waiting;
    $('createRoomBtn').disabled = remoteBusy || !!room.code;
    $('joinRoomBtn').disabled = remoteBusy || !!room.code;
    $('joinCode').disabled = remoteBusy || !!room.code;
    $('leaveRoomBtn').disabled = !room.code;
    document.querySelectorAll('#sizeButtons .seg').forEach((button) => {
      const active = Number(button.dataset.size) === game.size;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !!room.code;
    });
    $('learnBtn').setAttribute('aria-pressed', String(learnMode));
  }

  function renderScoring() {
    const result = currentResult();
    const visible = game.phase === 'scoring' || (result && result.reason === 'score');
    $('scoringCard').classList.toggle('show', !!visible);
    if (!visible) return;
    const dead = result && result.dead ? deadOf(result.dead) : currentDead();
    const score = game.score(dead);
    $('blackArea').textContent = formatNumber(score.black);
    $('whiteArea').textContent = formatNumber(score.white);
    const accepted = room.snap && room.snap.review && room.snap.review.accepted || {};
    if (result) {
      $('approvalLine').innerHTML = '<span class="yes">✓ ' + tr('Final', '已确认') + '</span> · ' +
        tr(`${colorName(result.winner)} wins by ${formatNumber(result.margin)}.`, `${colorName(result.winner)}胜 ${formatNumber(result.margin)} 目。`);
    } else if (room.code) {
      $('approvalLine').innerHTML = tr('Black', '黑棋') + ': ' + (accepted.black ? '<span class="yes">✓</span>' : '…') + ' · ' +
        tr('White', '白棋') + ': ' + (accepted.white ? '<span class="yes">✓</span>' : '…');
    } else {
      $('approvalLine').textContent = tr('Both players on this device should check the board before finishing.', '同设备上的双方请先共同核对棋盘。');
    }
    $('acceptScoreBtn').disabled = reviewAt != null || !!result || remoteBusy || (room.code && accepted[colorKey(room.color)]);
    $('acceptScoreBtn').textContent = room.code && accepted[colorKey(room.color)]
      ? tr('Waiting for friend…', '等待好友…')
      : tr('Accept score', '同意结果');
    $('resumeBtn').disabled = reviewAt != null || !!result || remoteBusy;
  }

  function renderReview() {
    const count = game.events.length;
    $('reviewRange').max = String(count);
    $('reviewRange').value = String(reviewAt == null ? count : reviewAt);
    $('reviewStart').disabled = count === 0 || reviewAt === 0;
    $('reviewPrev').disabled = count === 0 || reviewAt === 0;
    $('reviewLive').disabled = reviewAt == null;
    if (reviewAt == null) {
      $('reviewCaption').textContent = count
        ? tr(`${count} action${count === 1 ? '' : 's'} · drag to revisit`, `${count} 步 · 拖动回看`)
        : tr('Play a move, then drag back through the game.', '落子后可拖动滑块回看棋局。');
    } else if (reviewAt === 0) {
      $('reviewCaption').textContent = tr('Before the first move', '第一手之前');
    } else {
      const event = game.events[reviewAt - 1];
      $('reviewCaption').textContent = eventLabel(event, reviewAt);
    }
  }

  function eventLabel(event, number) {
    if (event.t === 'play') return `${number}. ${colorName(event.by)} ${coordinate(game.size, event.r, event.c)}`;
    if (event.t === 'pass') return `${number}. ${colorName(event.by)} ${tr('passes', '停一手')}`;
    if (event.t === 'resume') return `${number}. ${tr('play resumes', '继续对弈')}`;
    return `${number}. ${colorName(event.by)} ${tr('resigns', '认输')}`;
  }

  function renderLog() {
    const log = $('moveLog');
    if (!game.events.length) {
      log.innerHTML = '<div class="empty-log">' + tr('The first move will appear here.', '第一手会显示在这里。') + '</div>';
      return;
    }
    log.innerHTML = game.events.map((event, index) => '<div>' + eventLabel(event, index + 1) + '</div>').join('');
    if (reviewAt == null) log.scrollTop = log.scrollHeight;
  }

  function resizeCanvas() {
    const canvas = $('goBoard');
    const size = Math.max(280, Math.floor(canvas.getBoundingClientRect().width));
    if (!size) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvasSize = size;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pad = game.size === 19 ? 23 : (game.size === 13 ? 26 : 30);
    cell = (canvasSize - pad * 2) / (game.size - 1);
    drawBoard();
  }

  function drawBoard() {
    if (!ctx || !canvasSize) return;
    const state = displayGame();
    if (state.size !== game.size) return;
    const dead = new Set(reviewAt == null ? currentDead() : []);
    const result = reviewAt == null ? currentResult() : null;
    const showTerritory = reviewAt == null && (state.phase === 'scoring' || (result && result.reason === 'score'));
    const score = showTerritory ? state.score(dead) : null;
    const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
    gradient.addColorStop(0, '#183c2c');
    gradient.addColorStop(.52, '#153326');
    gradient.addColorStop(1, '#10271d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.strokeStyle = '#56806a';
    ctx.lineWidth = Math.max(.75, cell * .035);
    ctx.beginPath();
    for (let i = 0; i < state.size; i++) {
      const p = pad + i * cell;
      ctx.moveTo(pad, p); ctx.lineTo(canvasSize - pad, p);
      ctx.moveTo(p, pad); ctx.lineTo(p, canvasSize - pad);
    }
    ctx.stroke();

    ctx.fillStyle = '#8cb29d';
    for (const [row, col] of starPoints(state.size)) {
      ctx.beginPath(); ctx.arc(pad + col * cell, pad + row * cell, Math.max(2, cell * .09), 0, Math.PI * 2); ctx.fill();
    }
    drawCoordinates(state.size);

    if (score) {
      for (let point = 0; point < score.owner.length; point++) {
        const owner = score.owner[point];
        if (!owner || state.board[point] !== EMPTY) continue;
        const [row, col] = state.rowCol(point);
        const x = pad + col * cell, y = pad + row * cell;
        ctx.fillStyle = owner === BLACK ? 'rgba(4,8,6,.58)' : 'rgba(244,241,226,.7)';
        ctx.fillRect(x - Math.max(2, cell * .105), y - Math.max(2, cell * .105), Math.max(4, cell * .21), Math.max(4, cell * .21));
      }
    }

    for (let point = 0; point < state.board.length; point++) {
      const color = state.board[point];
      if (color === EMPTY) continue;
      const [row, col] = state.rowCol(point);
      drawStone(row, col, color, dead.has(point));
    }

    if (learnMode) drawAtariAndSelection(state, dead);
    drawLastMove(state);
    drawCursor(state);
  }

  function drawCoordinates(size) {
    if (cell < 18) return;
    ctx.save();
    ctx.fillStyle = '#7e9c8c';
    ctx.font = `${Math.max(8, Math.min(11, cell * .3))}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let col = 0; col < size; col++) ctx.fillText(window.GoEngine.COLUMNS[col], pad + col * cell, pad * .42);
    ctx.textAlign = 'right';
    for (let row = 0; row < size; row++) ctx.fillText(String(size - row), pad * .62, pad + row * cell);
    ctx.restore();
  }

  function drawStone(row, col, color, isDead) {
    const x = pad + col * cell, y = pad + row * cell;
    const radius = Math.max(4.2, cell * .45);
    ctx.save();
    if (isDead) ctx.globalAlpha = .36;
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = Math.max(2, cell * .12);
    ctx.shadowOffsetY = Math.max(1, cell * .08);
    const grad = ctx.createRadialGradient(x - radius * .32, y - radius * .38, radius * .08, x, y, radius);
    if (color === BLACK) { grad.addColorStop(0, '#53615a'); grad.addColorStop(.3, '#202823'); grad.addColorStop(1, '#020403'); }
    else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(.38, '#f0eee4'); grad.addColorStop(1, '#bdbbb1'); }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = color === BLACK ? 'rgba(210,235,221,.22)' : 'rgba(0,0,0,.25)';
    ctx.lineWidth = Math.max(.6, cell * .025);
    ctx.stroke();
    if (isDead) {
      ctx.globalAlpha = .95;
      ctx.strokeStyle = '#ff745f';
      ctx.lineWidth = Math.max(1.4, cell * .07);
      ctx.beginPath();
      ctx.moveTo(x - radius * .48, y - radius * .48); ctx.lineTo(x + radius * .48, y + radius * .48);
      ctx.moveTo(x + radius * .48, y - radius * .48); ctx.lineTo(x - radius * .48, y + radius * .48);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAtariAndSelection(state, dead) {
    const visited = new Set();
    for (let point = 0; point < state.board.length; point++) {
      if (!state.board[point] || visited.has(point) || dead.has(point)) continue;
      const rc = state.rowCol(point);
      const group = state.groupAt(rc[0], rc[1]);
      group.stones.forEach((stone) => visited.add(stone));
      if (group.liberties.length === 1) {
        ctx.save(); ctx.strokeStyle = '#ff7867'; ctx.setLineDash([Math.max(2, cell * .12), Math.max(2, cell * .1)]); ctx.lineWidth = Math.max(1, cell * .045);
        group.stones.forEach((stone) => {
          const [r, c] = state.rowCol(stone);
          ctx.beginPath(); ctx.arc(pad + c * cell, pad + r * cell, cell * .49, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.restore();
      }
    }
    if (selectedIndex == null || !state.board[selectedIndex]) return;
    const rc = state.rowCol(selectedIndex);
    const selected = state.groupAt(rc[0], rc[1]);
    ctx.save();
    ctx.strokeStyle = '#45f18b'; ctx.lineWidth = Math.max(1.2, cell * .055);
    selected.stones.forEach((stone) => {
      const [r, c] = state.rowCol(stone);
      ctx.beginPath(); ctx.arc(pad + c * cell, pad + r * cell, cell * .51, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.fillStyle = '#59f298';
    selected.liberties.forEach((liberty) => {
      const [r, c] = state.rowCol(liberty);
      ctx.beginPath(); ctx.arc(pad + c * cell, pad + r * cell, Math.max(2.3, cell * .105), 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function drawLastMove(state) {
    const last = state.lastMove;
    if (!last || last.t !== 'play' || !state.at(last.r, last.c)) return;
    const x = pad + last.c * cell, y = pad + last.r * cell;
    ctx.save();
    ctx.fillStyle = last.by === BLACK ? '#e9f2ec' : '#14221a';
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.7, cell * .075), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCursor(state) {
    if (reviewAt != null || currentResult()) return;
    let target = aimCell || hoverCell;
    if (document.activeElement === $('goBoard')) target = keyboardCell;
    if (!target || !state.inBounds(target.r, target.c)) return;
    const x = pad + target.c * cell, y = pad + target.r * cell;
    if (state.phase === 'playing' && state.at(target.r, target.c) === EMPTY) {
      const preview = state.preview(target.r, target.c);
      ctx.save();
      ctx.globalAlpha = preview.ok ? .45 : .22;
      ctx.fillStyle = state.current === BLACK ? '#050706' : '#f2efe3';
      ctx.beginPath(); ctx.arc(x, y, cell * .42, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .9;
      ctx.strokeStyle = preview.ok ? '#45f18b' : '#ff6b59';
      ctx.lineWidth = Math.max(1, cell * .045);
      ctx.stroke();
      if (aimCell) {
        ctx.strokeStyle = '#f1b84b'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(x, y, cell * .55, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function pointFromEvent(event) {
    const rect = $('goBoard').getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvasSize / rect.width);
    const y = (event.clientY - rect.top) * (canvasSize / rect.height);
    const col = Math.round((x - pad) / cell);
    const row = Math.round((y - pad) / cell);
    if (!game.inBounds(row, col)) return null;
    if (Math.hypot(x - (pad + col * cell), y - (pad + row * cell)) > cell * .58) return null;
    return { r: row, c: col };
  }

  function onBoardPointerMove(event) {
    if (event.pointerType === 'touch') return;
    hoverCell = pointFromEvent(event);
    drawBoard();
  }

  function onBoardClick(event) {
    const point = pointFromEvent(event);
    if (!point) return;
    keyboardCell = point;
    const coarse = event.pointerType === 'touch' || window.matchMedia('(pointer: coarse)').matches;
    if (coarse && game.size === 19 && game.phase === 'playing' && game.at(point.r, point.c) === EMPTY) {
      if (!aimCell || aimCell.r !== point.r || aimCell.c !== point.c) {
        aimCell = point;
        const name = coordinate(game.size, point.r, point.c);
        toast(tr(`Aim ${name} · tap again to play`, `瞄准 ${name} · 再点一次落子`));
        announce(tr(`${name} selected. Tap again to play.`, `已选择 ${name}，再点一次落子。`));
        drawBoard();
        return;
      }
    }
    aimCell = null;
    attemptPlay(point.r, point.c);
  }

  function onBoardKey(event) {
    const key = event.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      event.preventDefault();
      if (key === 'ArrowUp') keyboardCell.r = Math.max(0, keyboardCell.r - 1);
      if (key === 'ArrowDown') keyboardCell.r = Math.min(game.size - 1, keyboardCell.r + 1);
      if (key === 'ArrowLeft') keyboardCell.c = Math.max(0, keyboardCell.c - 1);
      if (key === 'ArrowRight') keyboardCell.c = Math.min(game.size - 1, keyboardCell.c + 1);
      const value = game.at(keyboardCell.r, keyboardCell.c);
      announce(`${coordinate(game.size, keyboardCell.r, keyboardCell.c)} · ${value ? colorName(value) : tr('empty', '空')}`);
      drawBoard();
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault(); attemptPlay(keyboardCell.r, keyboardCell.c);
    } else if (key.toLowerCase() === 'p') {
      event.preventDefault(); passTurn();
    } else if (key === 'Escape') {
      selectedIndex = null; aimCell = null; drawBoard(); renderInspection();
    }
  }

  function showOverlay(title, subtitle) {
    $('overlayTitle').textContent = title;
    $('overlaySub').textContent = subtitle || '';
    $('boardOverlay').classList.add('show');
    $('boardOverlay').setAttribute('aria-hidden', 'false');
  }

  function hideOverlay() {
    $('boardOverlay').classList.remove('show');
    $('boardOverlay').setAttribute('aria-hidden', 'true');
  }

  function setRoomStatus(message, kind) {
    $('roomStatus').textContent = message;
    $('roomStatus').className = 'room-status' + (kind ? ' ' + kind : '');
  }

  function firebaseDb() {
    if (db) return db;
    if (!window.firebase || !firebase.database) throw new Error('firebase-unavailable');
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    return db;
  }

  function withTimeout(promise, milliseconds, label) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(label || 'timeout')), milliseconds); }),
    ]);
  }

  function once(ref) {
    return withTimeout(ref.once('value'), NETWORK_TIMEOUT, 'network-timeout');
  }

  function transaction(ref, update) {
    return withTimeout(new Promise((resolve, reject) => {
      ref.transaction(update, (error, committed, snapshot) => {
        if (error) reject(error);
        else resolve({ committed, value: snapshot && snapshot.val() });
      }, false);
    }), NETWORK_TIMEOUT, 'network-timeout');
  }

  function roomRef(code) { return firebaseDb().ref(`games/${code}/go`); }

  function makeRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(7);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
  }

  function validRoom(value) {
    if (!value || !value.meta || value.meta.kind !== 'go' || Number(value.meta.schema) !== 1) return false;
    const size = Number(value.meta.size);
    const komi = Number(value.meta.komi);
    const session = Number(value.session);
    const rev = Number(value.rev);
    const expires = Number(value.meta.expiresAt);
    return [9, 13, 19].includes(size) && komi === 7.5 && value.meta.rules === 'beginner-area-superko-v1' &&
      Number.isInteger(session) && session >= 1 && Number.isInteger(rev) && rev >= 0 && Number.isFinite(expires) &&
      value.seats && typeof value.seats.black === 'string';
  }

  async function createRoom() {
    if (remoteBusy) return;
    remoteBusy = true; renderControls();
    $('roomLine').classList.add('show');
    setRoomStatus(tr('Creating a private room…', '正在创建私人房间…'));
    showOverlay(tr('Opening a room…', '正在创建房间…'), tr('The board will unlock when your friend joins.', '好友加入后棋盘会解锁。'));
    try {
      let created = null;
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const code = makeRoomCode();
        const ref = roomRef(code);
        const now = Date.now();
        const result = await transaction(ref, (current) => {
          if (current != null) return;
          return {
            meta: { kind: 'go', schema: 1, rules: 'beginner-area-superko-v1', size: game.size, komi: 7.5, createdAt: now, expiresAt: now + ROOM_TTL },
            seats: { black: room.token }, session: 1, rev: 0,
          };
        });
        if (result.committed) created = { code, ref };
      }
      if (!created) throw new Error('room-collision');
      connectRoom(created.code, created.ref);
      setRoomStatus(tr('Waiting for your friend…', '正在等待好友…'));
    } catch (error) {
      hideOverlay();
      setRoomStatus(networkMessage(error), 'err');
    } finally {
      remoteBusy = false; render();
    }
  }

  function normalizeJoinCode(raw) {
    const value = String(raw || '').trim();
    let candidate = value;
    try {
      const match = value.match(/[?&]room=([^&#\s]+)/i);
      if (match) candidate = decodeURIComponent(match[1]);
    } catch (error) {}
    return candidate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function joinRoom(raw) {
    if (remoteBusy) return;
    const code = normalizeJoinCode(raw == null ? $('joinCode').value : raw);
    if (!ROOM_RE.test(code)) {
      setRoomStatus(tr('Enter the 7-character room code.', '请输入 7 位房间码。'), 'err');
      $('roomLine').classList.add('show');
      return;
    }
    remoteBusy = true; renderControls();
    $('roomLine').classList.add('show');
    setRoomStatus(tr('Looking up room…', '正在查找房间…'));
    showOverlay(tr('Joining room…', '正在加入房间…'), code);
    try {
      const ref = roomRef(code);
      const first = (await once(ref)).val();
      if (!validRoom(first)) throw new Error('room-not-found');
      if (Number(first.meta.expiresAt) < Date.now()) throw new Error('room-expired');
      const seats = first.seats || {};
      if (seats.black !== room.token && seats.white !== room.token) {
        /* Claim only the empty seat. A whole-room transaction can receive a
           cold-cache null on its first local pass; on this leaf, null is the
           exact state we want to replace, so the claim remains atomic. */
        const joined = await transaction(ref.child('seats/white'), (current) => {
          if (current == null || current === room.token) return room.token;
          return;
        });
        if (!joined.committed) throw new Error('room-full');
      }
      connectRoom(code, ref);
    } catch (error) {
      hideOverlay();
      setRoomStatus(networkMessage(error), 'err');
    } finally {
      remoteBusy = false; render();
    }
  }

  function connectRoom(code, ref) {
    leaveRoom(false);
    room.code = code;
    room.ref = ref;
    room.requestSeen = null;
    room.reactionSeen = null;
    $('roomCode').textContent = code;
    $('roomLine').classList.add('show');
    $('reactions').classList.add('show');
    history.replaceState(null, '', location.pathname + '?room=' + encodeURIComponent(code));
    room.listener = ref.on('value', (snapshot) => onRoomValue(snapshot.val()), (error) => {
      setRoomStatus(networkMessage(error), 'err');
      hideOverlay();
    });
  }

  function onRoomValue(value) {
    if (!validRoom(value)) {
      setRoomStatus(tr('This room is no longer available.', '该房间已不可用。'), 'err');
      hideOverlay();
      return;
    }
    const seats = value.seats || {};
    room.color = seats.black === room.token ? BLACK : (seats.white === room.token ? WHITE : null);
    if (!room.color) {
      setRoomStatus(tr('This room already has two players.', '该房间已有两位玩家。'), 'err');
      hideOverlay();
      return;
    }
    const events = roomEvents(value);
    if (Number(value.rev || 0) !== events.length) {
      setRoomStatus(tr('Room revision mismatch — waiting for recovery.', '房间版本不一致，正在等待恢复。'), 'err');
      return;
    }
    const replay = replayEvents(events, value.meta.size, value.meta.komi);
    if (replay.error) {
      setRoomStatus(tr(`Room rejected an invalid action at ${replay.index + 1}.`, `房间拒绝了第 ${replay.index + 1} 个无效动作。`), 'err');
      return;
    }
    const previousCount = game.events.length;
    const previousSession = room.snap && Number(room.snap.session || 1);
    const nextSession = Number(value.session || 1);
    room.snap = value;
    game = replay.game;
    if (previousSession != null && previousSession !== nextSession) {
      resetView();
      setCoach('REMATCH', '再来一局', 'Colors swapped. Black starts the fresh board.', '双方已交换黑白；新局由黑棋先行。');
    }
    keyboardCell.r = Math.min(keyboardCell.r, game.size - 1);
    keyboardCell.c = Math.min(keyboardCell.c, game.size - 1);
    if (reviewAt != null && reviewAt > game.events.length) reviewAt = game.events.length;
    if (!seats.white) {
      showOverlay(tr('Waiting for your friend…', '正在等待好友…'), tr('Copy the invite link or room code.', '请复制邀请链接或房间码。'));
      setRoomStatus(tr('Waiting for White to join…', '等待白棋加入…'));
    } else {
      hideOverlay();
      setRoomStatus(tr(`Connected · you play ${colorName(room.color)}`, `已连接 · 你执${room.color === BLACK ? '黑' : '白'}`), 'ok');
      attachPresence();
    }
    if (game.events.length > previousCount && reviewAt == null) describeRemoteLastMove();
    handleRemoteRequest(value.request);
    handleReaction(value.reaction);
    render();
    resizeCanvas();
  }

  function describeRemoteLastMove() {
    const event = game.events[game.events.length - 1];
    if (!event) return;
    if (event.t === 'play') {
      const group = game.groupAt(event.r, event.c);
      const caps = game.captures[event.by];
      setCoach('LAST MOVE', '上一手', `${colorName(event.by)} played ${coordinate(game.size, event.r, event.c)}. This group now has ${group ? group.liberties.length : 0} liberties. Captures so far: ${caps}.`, `${colorName(event.by)}落子 ${coordinate(game.size, event.r, event.c)}。该棋群现有 ${group ? group.liberties.length : 0} 口气，累计提子 ${caps}。`);
      selectedIndex = game.index(event.r, event.c);
    } else if (event.t === 'pass') {
      setCoach(game.phase === 'scoring' ? 'SCORING' : 'PASS', game.phase === 'scoring' ? '计分' : '停一手', game.phase === 'scoring' ? 'Both players passed. Mark dead groups together.' : `${colorName(event.by)} passed.`, game.phase === 'scoring' ? '双方均停一手，请共同标记死棋。' : `${colorName(event.by)}停一手。`);
    } else if (event.t === 'resume') {
      setCoach('RESUME', '继续', 'Play resumed to settle uncertain groups.', '继续对弈以解决有争议的棋群。');
    } else {
      setCoach('GAME OVER', '对局结束', `${colorName(other(event.by))} wins by resignation.`, `${colorName(other(event.by))}中盘胜。`);
    }
  }

  function attachPresence() {
    if (!room.ref || !room.color || room.presence) return;
    try {
      room.presence = room.ref.child('connections').child(room.token);
      room.presence.onDisconnect().remove();
      room.presence.set({ color: colorKey(room.color), at: firebase.database.ServerValue.TIMESTAMP });
    } catch (error) {}
  }

  function leaveRoom(startLocal) {
    if (room.ref && room.listener) room.ref.off('value', room.listener);
    if (room.presence) {
      try { room.presence.onDisconnect().cancel(); room.presence.remove(); } catch (error) {}
    }
    const oldSize = game.size;
    const token = room.token;
    room = blankRoom();
    room.token = token;
    $('roomCode').textContent = '—';
    $('roomStatus').textContent = '';
    $('reactions').classList.remove('show');
    hideOverlay();
    if (location.search) history.replaceState(null, '', location.pathname);
    if (startLocal !== false) newLocal(oldSize);
  }

  function networkMessage(error) {
    const code = error && (error.message || error.code) || '';
    if (/not-found/.test(code)) return tr('Room not found. Check the code.', '未找到房间，请检查房间码。');
    if (/expired/.test(code)) return tr('That room has expired. Create a new one.', '该房间已过期，请创建新房间。');
    if (/full/.test(code)) return tr('That room already has two players.', '该房间已有两位玩家。');
    if (/permission/i.test(code)) return tr('Online play is not enabled for this room path.', '该房间路径尚未启用在线权限。');
    if (/timeout/.test(code)) return tr('The network timed out. Local play still works.', '网络连接超时，本地对弈仍可使用。');
    if (/unavailable/.test(code)) return tr('Online service did not load. Local play still works.', '在线服务未加载，本地对弈仍可使用。');
    return tr('Could not reach the room. Try again.', '无法连接房间，请重试。');
  }

  async function sendRemoteEvent(event) {
    if (remoteBusy || !room.ref || !room.snap || !room.color) return;
    remoteBusy = true; renderControls();
    let abortReason = 'stale-room';
    const expectedSession = Number(room.snap.session || 1);
    const expectedRev = game.events.length;
    try {
      const result = await transaction(room.ref, (current) => {
        if (!validRoom(current) || Number(current.session || 1) !== expectedSession) { abortReason = 'stale-room'; return; }
        const events = roomEvents(current);
        if (events.length !== expectedRev || Number(current.rev || 0) !== expectedRev) { abortReason = 'stale-move'; return; }
        const seats = current.seats || {};
        if (seats[colorKey(event.by)] !== room.token) { abortReason = 'wrong-seat'; return; }
        const replay = replayEvents(events, current.meta.size, current.meta.komi);
        if (replay.error || current.result) { abortReason = 'game-over'; return; }
        let checked;
        if (event.t === 'play') checked = replay.game.play(event.r, event.c, event.by);
        else if (event.t === 'pass') checked = replay.game.pass(event.by);
        else if (event.t === 'resume') checked = replay.game.resume(event.by);
        else if (event.t === 'resign') checked = replay.game.resign(event.by);
        else checked = { ok: false, reason: 'invalid-event' };
        if (!checked.ok) { abortReason = checked.reason; return; }
        current.actions = events.concat([cleanEvent(event)]);
        current.rev = current.actions.length;
        current.updatedAt = Date.now();
        delete current.review;
        delete current.result;
        delete current.request;
        return current;
      });
      if (!result.committed) {
        const message = illegalMessage(abortReason);
        toast(message);
        if (['occupied', 'suicide', 'superko', 'wrong-player'].includes(abortReason)) setCoach('ILLEGAL MOVE', '禁手', message, message);
      }
    } catch (error) {
      setRoomStatus(networkMessage(error), 'err');
    } finally {
      remoteBusy = false; render();
    }
  }

  async function mutateRemoteReview(kind, payload) {
    if (remoteBusy || !room.ref || !room.snap || !room.color) return;
    remoteBusy = true; renderControls();
    let abortReason = 'stale-room';
    try {
      const result = await transaction(room.ref, (current) => {
        if (!validRoom(current) || Number(current.session || 1) !== Number(room.snap.session || 1)) return;
        const events = roomEvents(current);
        const replay = replayEvents(events, current.meta.size, current.meta.komi);
        const g = replay.game;
        if (replay.error || g.phase !== 'scoring' || current.result) { abortReason = 'not-scoring'; return; }
        if ((current.seats || {})[colorKey(room.color)] !== room.token) { abortReason = 'wrong-seat'; return; }
        const dead = deadOf(current.review && current.review.dead);
        if (kind === 'mark') {
          if (!g.inBounds(payload.row, payload.col) || !g.at(payload.row, payload.col)) { abortReason = 'occupied'; return; }
          const nextDead = g.toggleDead(dead, payload.row, payload.col);
          current.review = { rev: events.length, dead: deadObject(nextDead), accepted: {} };
        } else if (kind === 'accept') {
          current.review = current.review || { rev: events.length, dead: deadObject(dead), accepted: {} };
          if (Number(current.review.rev) !== events.length) { abortReason = 'stale-score'; return; }
          current.review.accepted = current.review.accepted || {};
          current.review.accepted[colorKey(room.color)] = true;
          if (current.review.accepted.black && current.review.accepted.white) {
            const score = g.score(dead);
            current.result = scoreResult(score, current.session, dead);
          }
        }
        current.updatedAt = Date.now();
        return current;
      });
      if (!result.committed) toast(illegalMessage(abortReason));
    } catch (error) {
      setRoomStatus(networkMessage(error), 'err');
    } finally {
      remoteBusy = false; render();
    }
  }

  async function sendRequest(type) {
    if (remoteBusy || !room.ref || !room.snap || !room.color) return;
    if (type === 'undo' && !game.events.length) return;
    remoteBusy = true; renderControls();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      const result = await transaction(room.ref, (current) => {
        if (!validRoom(current) || Number(current.session || 1) !== Number(room.snap.session || 1)) return;
        if ((current.seats || {})[colorKey(room.color)] !== room.token) return;
        if (current.request && current.request.status === 'pending') return;
        current.request = { id, type, by: room.color, status: 'pending', rev: roomEvents(current).length, session: current.session };
        return current;
      });
      if (!result.committed) toast(tr('Another request is already pending.', '已有请求等待处理。'));
      else setRoomStatus(tr(`Waiting for your friend to ${type === 'undo' ? 'allow the undo' : 'accept a rematch'}…`, `等待好友${type === 'undo' ? '同意悔棋' : '接受再来一局'}…`));
    } catch (error) {
      setRoomStatus(networkMessage(error), 'err');
    } finally {
      remoteBusy = false; render();
    }
  }

  function handleRemoteRequest(request) {
    if (!request || !room.color) return;
    if (request.status === 'declined' && Number(request.by) === room.color) {
      if (room.requestSeen !== request.id) {
        room.requestSeen = request.id;
        toast(tr('Your friend declined the request.', '好友拒绝了请求。'));
      }
      return;
    }
    if (request.status !== 'pending' || Number(request.by) === room.color || room.requestSeen === request.id) return;
    room.requestSeen = request.id;
    const message = request.type === 'undo'
      ? tr('Your friend asks to undo the last action. Allow it?', '好友请求撤回上一步，同意吗？')
      : tr('Your friend asks for a new game. Colors will swap. Accept?', '好友请求再来一局，双方将交换黑白。同意吗？');
    showPrompt(message, () => answerRequest(request, true), () => answerRequest(request, false));
  }

  async function answerRequest(request, allow) {
    if (!room.ref) return;
    try {
      await transaction(room.ref, (current) => {
        const req = current && current.request;
        if (!req || req.id !== request.id || req.status !== 'pending') return;
        if (Number(req.session) !== Number(current.session || 1)) { delete current.request; return current; }
        if (!allow) { current.request.status = 'declined'; return current; }
        const events = roomEvents(current);
        if (req.type === 'undo') {
          if (events.length !== Number(req.rev)) { delete current.request; return current; }
          if (events.length) events.pop();
          current.actions = events;
          current.rev = events.length;
          delete current.review;
          delete current.result;
        } else {
          const seats = current.seats || {};
          current.seats = { black: seats.white, white: seats.black };
          current.session = Number(current.session || 1) + 1;
          current.rev = 0;
          current.actions = [];
          delete current.review;
          delete current.result;
        }
        delete current.request;
        current.updatedAt = Date.now();
        return current;
      });
    } catch (error) {
      setRoomStatus(networkMessage(error), 'err');
    }
  }

  function roomLink() {
    return location.origin + location.pathname + '?room=' + encodeURIComponent(room.code || '');
  }

  async function copyInvite() {
    if (!room.code) return;
    const text = roomLink();
    try {
      await navigator.clipboard.writeText(text);
      toast(tr('Invite link copied.', '邀请链接已复制。'));
    } catch (error) {
      const input = document.createElement('textarea');
      input.value = text; input.className = 'sr-only'; document.body.appendChild(input); input.select();
      document.execCommand('copy'); input.remove(); toast(tr('Invite link copied.', '邀请链接已复制。'));
    }
  }

  async function shareInvite() {
    if (!room.code) return;
    if (navigator.share) {
      try { await navigator.share({ title: tr('Play Go with me', '和我下围棋'), text: tr(`Join my Go room ${room.code}`, `加入我的围棋房间 ${room.code}`), url: roomLink() }); }
      catch (error) { if (error.name !== 'AbortError') copyInvite(); }
    } else copyInvite();
  }

  function sendReaction(emoji) {
    if (!room.ref || !room.color) return;
    room.ref.child('reaction').set({ id: Date.now(), by: room.color, emoji: String(emoji).slice(0, 4) }).catch(() => {});
  }

  function handleReaction(reaction) {
    if (!reaction || reaction.id === room.reactionSeen || Number(reaction.by) === room.color) return;
    room.reactionSeen = reaction.id;
    const pop = $('reactionPop');
    pop.textContent = reaction.emoji;
    pop.classList.remove('go');
    void pop.offsetWidth;
    pop.classList.add('go');
    announce(tr(`Friend reacted ${reaction.emoji}`, `好友回应 ${reaction.emoji}`));
  }

  function startReview(value) {
    const count = game.events.length;
    reviewAt = Math.max(0, Math.min(count, Number(value)));
    selectedIndex = null;
    render();
  }

  function bindEvents() {
    $('langBtn').addEventListener('click', toggleLanguage);
    $('passBtn').addEventListener('click', passTurn);
    $('undoBtn').addEventListener('click', undoMove);
    $('newBtn').addEventListener('click', askNewGame);
    $('resignBtn').addEventListener('click', askResign);
    $('learnBtn').addEventListener('click', toggleLearn);
    $('acceptScoreBtn').addEventListener('click', acceptScore);
    $('resumeBtn').addEventListener('click', resumePlay);
    $('createRoomBtn').addEventListener('click', createRoom);
    $('joinRoomBtn').addEventListener('click', () => joinRoom());
    $('joinCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinRoom(); });
    $('leaveRoomBtn').addEventListener('click', () => leaveRoom(true));
    $('copyRoomBtn').addEventListener('click', copyInvite);
    $('shareRoomBtn').addEventListener('click', shareInvite);
    $('roomCode').addEventListener('click', copyInvite);
    document.querySelectorAll('#sizeButtons .seg').forEach((button) => button.addEventListener('click', () => setBoardSize(button.dataset.size)));
    document.querySelectorAll('#reactions .reaction').forEach((button) => button.addEventListener('click', () => sendReaction(button.textContent)));
    $('promptYes').addEventListener('click', () => closePrompt('yes'));
    $('promptNo').addEventListener('click', () => closePrompt('no'));
    $('promptModal').addEventListener('click', (event) => { if (event.target === $('promptModal')) closePrompt('no'); });
    $('goBoard').addEventListener('pointermove', onBoardPointerMove);
    $('goBoard').addEventListener('pointerleave', () => { hoverCell = null; drawBoard(); });
    $('goBoard').addEventListener('pointerup', onBoardClick);
    $('goBoard').addEventListener('keydown', onBoardKey);
    $('reviewRange').addEventListener('input', (event) => startReview(event.target.value));
    $('reviewStart').addEventListener('click', () => startReview(0));
    $('reviewPrev').addEventListener('click', () => startReview(reviewAt == null ? game.events.length - 1 : reviewAt - 1));
    $('reviewLive').addEventListener('click', () => { reviewAt = null; render(); });
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('beforeunload', () => {
      if (room.ref && room.listener) room.ref.off('value', room.listener);
    });
  }

  function init() {
    try { if (localStorage.getItem('arcade_lang') === 'zh') lang = 'zh'; } catch (error) {}
    try { learnMode = localStorage.getItem('go_learn') !== '0'; } catch (error) {}
    bindEvents();
    applyLanguage();
    resizeCanvas();
    if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe($('boardShell'));
    const code = new URLSearchParams(location.search).get('room');
    if (code) {
      $('joinCode').value = normalizeJoinCode(code);
      window.setTimeout(() => joinRoom(code), 120);
    }
  }

  init();
})();
