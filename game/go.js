(function () {
  'use strict';

  const { GoGame, BLACK, WHITE, EMPTY, other, coordinate, starPoints, chooseBeginnerMove } = window.GoEngine;
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
  const HUMAN_COLOR = BLACK;
  const AI_COLOR = WHITE;

  let lang = 'en';
  let learnMode = true;
  let localMode = 'ai';
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
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let placementRipple = null;
  let rippleFrame = 0;
  let aiTimer = 0;
  let aiGeneration = 0;
  let aiThinking = false;
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
    if (room.code) return room.snap ? deadOf(room.snap.review && room.snap.review.dead) : [];
    return localDead.slice();
  }

  function currentResult() {
    if (room.code) {
      if (!room.snap) return null;
      if (room.snap.result && Number(room.snap.result.session) === Number(room.snap.session)) return room.snap.result;
      return game.result || null;
    }
    return game.result || localResult;
  }

  function roomWaiting() {
    return !!room.code && (!room.snap || !(room.snap.seats && room.snap.seats.white));
  }

  function localAiActive() {
    return !room.code && localMode === 'ai';
  }

  function localAiTurn() {
    return localAiActive() && game.phase === 'playing' && game.current === AI_COLOR && !currentResult();
  }

  function cancelAiTurn() {
    aiGeneration += 1;
    if (aiTimer) window.clearTimeout(aiTimer);
    aiTimer = 0;
    aiThinking = false;
  }

  function aiCoach(choice, outcome) {
    const coord = choice.type === 'play' ? coordinate(game.size, choice.row, choice.col) : '';
    if (choice.type === 'pass') {
      if (outcome.scoring) {
        setCoach('AI PASSES', 'AI 停一手', 'The beginner AI also passed. Review dead groups before finishing the area score.', '入门 AI 也停一手了。请先核对死棋，再完成面积计分。');
      } else {
        setCoach('AI PASSES', 'AI 停一手', 'The beginner AI found no useful local move and passed.', '入门 AI 没找到有用的局部落点，因此停一手。');
      }
      return;
    }
    if (choice.reason === 'capture') {
      setCoach('AI CAPTURES', 'AI 提子', `${coord} captures ${outcome.captured.length} stone${outcome.captured.length === 1 ? '' : 's'}.`, `${coord} 提走 ${outcome.captured.length} 颗棋子。`);
    } else if (choice.reason === 'save-atari') {
      setCoach('AI SAVES ATARI', 'AI 解打吃', `${coord} gives an endangered White group more liberties.`, `${coord} 为受威胁的白棋棋群增加了气。`);
    } else if (choice.reason === 'atari') {
      setCoach('AI ATTACKS', 'AI 打吃', `${coord} leaves one of Black’s nearby groups with a single liberty.`, `${coord} 让附近一块黑棋只剩一口气。`);
    } else {
      setCoach('BEGINNER AI', '入门 AI', `${coord} is a safe local-shape move. This learning-strength AI does not read far ahead.`, `${coord} 是一步较安全的局部棋形；这个入门 AI 不会深度计算。`);
    }
  }

  function scheduleAiTurn() {
    cancelAiTurn();
    if (!localAiTurn() || reviewAt != null) return;
    const ticket = aiGeneration;
    const scheduledGame = game;
    const scheduledEvents = game.events.length;
    aiThinking = true;
    render();
    const delay = reducedMotion.matches ? 80 : 560;
    aiTimer = window.setTimeout(() => {
      aiTimer = 0;
      if (ticket !== aiGeneration || game !== scheduledGame || game.events.length !== scheduledEvents || !localAiTurn() || reviewAt != null) {
        if (ticket === aiGeneration) { aiThinking = false; render(); }
        return;
      }
      const choice = chooseBeginnerMove(game);
      if (!choice) { aiThinking = false; render(); return; }
      let outcome;
      if (choice.type === 'play') outcome = game.play(choice.row, choice.col, AI_COLOR);
      else outcome = game.pass(AI_COLOR);
      if (ticket !== aiGeneration || !outcome || !outcome.ok) {
        aiThinking = false;
        render();
        return;
      }
      aiThinking = false;
      if (choice.type === 'play') {
        startPlacementRipple(choice.row, choice.col);
        selectedIndex = game.index(choice.row, choice.col);
        announce(`${tr('Beginner AI', '入门 AI')} ${coordinate(game.size, choice.row, choice.col)}.`);
      } else {
        announce(tr('Beginner AI passes.', '入门 AI 停一手。'));
      }
      aiCoach(choice, outcome);
      render();
    }, delay);
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
    cancelAiTurn();
    const nextSize = Number(size || game.size);
    if (nextSize !== 9 && localMode === 'ai') localMode = 'local';
    game = new GoGame({ size: nextSize, komi: 7.5 });
    localDead = [];
    localResult = null;
    keyboardCell = { r: Math.floor(nextSize / 2), c: Math.floor(nextSize / 2) };
    stopPlacementRipple();
    resetView();
    setCoach('OPENING', '开局', 'Black begins. Corners are easiest to surround; every stone still needs liberties.', '黑棋先行。角部最容易围地，但每颗棋子都需要气。');
    render();
    resizeCanvas();
    scheduleAiTurn();
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
    if (localAiTurn()) {
      toast(tr('The beginner AI is thinking. You play Black.', '入门 AI 正在思考；你执黑棋。'));
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
    startPlacementRipple(row, col);
    describeMove(outcome, row, col);
    announce(`${colorName(outcome.color)} ${coordinate(game.size, row, col)}. ${outcome.captured.length ? tr('Captured ', '提子 ') + outcome.captured.length : ''}`);
    render();
    scheduleAiTurn();
  }

  function passTurn() {
    if (reviewAt != null || currentResult() || game.phase !== 'playing' || roomWaiting()) return;
    if (room.code) {
      if (game.current !== room.color) { toast(tr('It is your friend’s turn.', '现在轮到好友。')); return; }
      sendRemoteEvent({ t: 'pass', by: room.color });
      return;
    }
    if (localAiTurn()) return;
    const outcome = game.pass();
    if (!outcome.ok) return;
    if (outcome.scoring) {
      setCoach('SCORING', '计分', 'Both players passed. Tap any stones you both agree are dead, then accept the score.', '双方均停一手。点击双方认定的死棋，然后同意结果。');
    } else {
      setCoach('PASS', '停一手', 'Passing gives the turn away. A second consecutive pass starts scoring.', '停一手会把回合交给对方；双方连续停一手后开始计分。');
    }
    render();
    scheduleAiTurn();
  }

  function askResign() {
    if (reviewAt != null || currentResult() || (game.phase !== 'playing' && game.phase !== 'scoring')) return;
    if (localAiTurn()) return;
    showPrompt(tr('Resign this game?', '确定认输本局吗？'), () => {
      if (room.code) sendRemoteEvent({ t: 'resign', by: room.color });
      else { cancelAiTurn(); game.resign(localAiActive() ? HUMAN_COLOR : game.current); setCoach('GAME OVER', '对局结束', 'The game ended by resignation. Use Review to walk through the moves.', '本局以认输结束。可用“复盘”回看每一步。'); render(); }
    });
  }

  function askNewGame() {
    cancelAiTurn();
    if (room.code) {
      sendRequest('new');
      return;
    }
    if (!game.events.length) { newLocal(game.size); return; }
    showPrompt(
      tr('Start a fresh game? The current moves will be cleared.', '开始新对局吗？当前棋谱会被清除。'),
      () => newLocal(game.size),
      scheduleAiTurn,
    );
  }

  function undoMove() {
    if (reviewAt != null || !game.events.length) return;
    if (room.code) { sendRequest('undo'); return; }
    cancelAiTurn();
    const events = game.events.slice();
    let replay;
    do {
      events.pop();
      replay = replayEvents(events, game.size, game.komi);
      if (replay.error) return;
    } while (localMode === 'ai' && events.length &&
      (replay.game.phase !== 'playing' || replay.game.current !== HUMAN_COLOR));
    if (replay.error) return;
    game = replay.game;
    stopPlacementRipple();
    localDead = [];
    localResult = null;
    selectedIndex = null;
    setCoach(
      'UNDO', '悔棋',
      localMode === 'ai' ? 'Returned to your previous Black decision. The AI reply and your preceding move were removed when needed.' : 'The last action was removed. The board, captures, and ko history were rebuilt.',
      localMode === 'ai' ? '已回到你上一次执黑决策之前；必要时会同时撤回 AI 应手和你此前的一手。' : '已撤回上一步；棋盘、提子数与劫争历史均已重建。',
    );
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
    scheduleAiTurn();
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
    if (next !== 9 && localMode === 'ai') {
      localMode = 'local';
      toast(tr('The beginner AI practises on 9×9. Switched to local two-player.', '入门 AI 仅在 9×9 上练习；已切换到本地双人。'));
    }
    newLocal(next);
    if (next !== 9) {
      setCoach('TWO PLAYERS', '双人同屏', `${next}×${next} is ready for Black and White to share this device.`, `${next}×${next} 棋盘已就绪，黑白双方可共用这台设备。`);
      render();
    }
  }

  function setLocalMode(mode) {
    if (room.code) {
      toast(tr('Opponent mode is fixed while you are in a room.', '联机房间中无法更改对手模式。'));
      return;
    }
    const next = mode === 'local' ? 'local' : 'ai';
    if (next === 'ai' && game.size !== 9) {
      toast(tr('The beginner AI is available on the 9×9 teaching board.', '入门 AI 可在 9×9 教学棋盘上使用。'));
      return;
    }
    if (next === localMode) return;
    cancelAiTurn();
    localMode = next;
    newLocal(game.size);
    setCoach(
      next === 'ai' ? 'BEGINNER AI' : 'TWO PLAYERS',
      next === 'ai' ? '入门 AI' : '双人同屏',
      next === 'ai' ? 'You play Black. The learning-strength AI answers as White.' : 'Black and White now take turns on this device.',
      next === 'ai' ? '你执黑棋，入门强度 AI 执白应手。' : '黑白双方现在共用这台设备轮流落子。',
    );
    render();
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
      if (room.code) {
        title.textContent = game.current === room.color
          ? tr(`${colorName(game.current)} — your turn`, `${colorName(game.current)}——轮到你`)
          : tr(`${colorName(game.current)} — friend’s turn`, `${colorName(game.current)}——好友回合`);
      } else if (localAiActive()) {
        title.textContent = game.current === HUMAN_COLOR
          ? tr('Black — your turn', '黑棋——轮到你')
          : (aiThinking ? tr('White beginner AI is thinking…', '白棋入门 AI 思考中…') : tr('White beginner AI to play', '白棋入门 AI 落子'));
      } else {
        title.textContent = tr(`${colorName(game.current)} to play`, `${colorName(game.current)}落子`);
      }
      if (aiThinking && localAiActive()) {
        sub.textContent = tr('Learning-strength tactics · captures, atari defense, and safe shape', '入门强度战术 · 提子、解打吃与安全棋形');
      } else {
        sub.textContent = game.passes === 1
          ? tr('One pass. Another pass starts scoring.', '已停一手；再次停一手将开始计分。')
          : tr('Tap an intersection to place a stone.', '点击交叉点落子。');
      }
    }
    stone.className = 'turn-stone ' + colorKey(shownColor);
    const modeBadge = $('modeBadge');
    modeBadge.textContent = room.code
      ? tr(`ROOM ${room.code} · YOU: ${colorKey(room.color).toUpperCase()}`, `房间 ${room.code} · 你执${room.color === BLACK ? '黑' : '白'}`)
      : (localAiActive() ? tr(`VS BEGINNER AI · ${game.size}×${game.size}`, `对阵入门 AI · ${game.size}×${game.size}`) : tr(`LOCAL 2P · ${game.size}×${game.size}`, `本地双人 · ${game.size}×${game.size}`));
    modeBadge.classList.toggle('thinking', aiThinking && localAiActive());
    $('blackCaptures').textContent = game.captures[BLACK];
    $('whiteCaptures').textContent = game.captures[WHITE];
    const boardLabel = tr(`${game.size} by ${game.size} Go board. `, `${game.size} 路围棋棋盘。`) + title.textContent;
    $('goBoard').setAttribute('aria-label', boardLabel);
  }

  function renderControls() {
    const result = currentResult();
    const reviewing = reviewAt != null;
    const myTurn = room.code ? game.current === room.color : !localAiTurn();
    const waiting = roomWaiting();
    $('passBtn').disabled = reviewing || !!result || game.phase !== 'playing' || !myTurn || remoteBusy || waiting;
    $('resignBtn').disabled = reviewing || !!result || (!room.color && !!room.code) || remoteBusy || waiting || localAiTurn();
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
      button.disabled = !!room.code || remoteBusy;
    });
    document.querySelectorAll('#playerModeButtons .seg').forEach((button) => {
      const active = button.dataset.mode === (room.code ? 'local' : localMode);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !!room.code || remoteBusy || (button.dataset.mode === 'ai' && game.size !== 9);
    });
    $('opponentHelp').textContent = room.code
      ? tr('Private friend room. Black and White play from separate devices; the beginner AI is off.', '私密好友房。黑白双方使用各自的设备对弈；入门 AI 已关闭。')
      : (localMode === 'ai'
        ? tr('You are Black. The learning-strength AI plays White and practices captures, atari defense, and safe shape — it is intentionally not a strong Go engine.', '你执黑棋。入门 AI 执白，会练习提子、解打吃与安全棋形；它刻意不是高水平围棋引擎。')
        : tr('Black and White take turns on this device. No computer moves are scheduled in this mode.', '黑白双方在同一设备上轮流落子；此模式不会安排电脑落子。'));
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
    } else if (localAiActive()) {
      $('approvalLine').textContent = tr('Check dead groups, then finish the score for this beginner practice game.', '请核对死棋，然后完成这局入门练习的计分。');
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

  function stopPlacementRipple() {
    placementRipple = null;
    if (rippleFrame) cancelAnimationFrame(rippleFrame);
    rippleFrame = 0;
  }

  function startPlacementRipple(row, col) {
    if (reducedMotion.matches || reviewAt != null) return;
    placementRipple = { row, col, at: performance.now(), duration: 760 };
    if (!rippleFrame) rippleFrame = requestAnimationFrame(animatePlacementRipple);
  }

  function animatePlacementRipple(now) {
    rippleFrame = 0;
    if (!placementRipple || now - placementRipple.at >= placementRipple.duration) {
      placementRipple = null;
      drawBoard();
      return;
    }
    drawBoard();
    rippleFrame = requestAnimationFrame(animatePlacementRipple);
  }

  function drawBoard() {
    if (!ctx || !canvasSize) return;
    const state = displayGame();
    if (state.size !== game.size) return;
    const dead = new Set(reviewAt == null ? currentDead() : []);
    const result = reviewAt == null ? currentResult() : null;
    const showTerritory = reviewAt == null && (state.phase === 'scoring' || (result && result.reason === 'score'));
    const score = showTerritory ? state.score(dead) : null;
    ctx.fillStyle = '#294347';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // A pixel-dithered slate board below a thin layer of water. Every mark is
    // snapped to CSS pixels and deterministic, so animation stays crisp.
    ctx.save();
    const chip = Math.max(2, Math.round(cell * .055));
    for (let i = 0; i < 132; i++) {
      const x = Math.floor(((i * 83) % 101) / 101 * canvasSize / chip) * chip;
      const y = Math.floor(((i * 47 + 19) % 103) / 103 * canvasSize / chip) * chip;
      ctx.fillStyle = i % 4 ? 'rgba(166,198,187,.09)' : 'rgba(2,14,17,.19)';
      ctx.fillRect(x, y, chip * (i % 5 === 0 ? 2 : 1), chip);
    }
    ctx.fillStyle = 'rgba(50,143,151,.1)';
    for (let y = 0; y < canvasSize; y += chip * 8) {
      const offset = ((y / chip) % 16) * chip;
      for (let x = -offset; x < canvasSize; x += chip * 18) ctx.fillRect(x, y, chip * 7, chip * 2);
    }
    ctx.fillStyle = 'rgba(4,47,59,.12)';
    ctx.fillRect(0, Math.floor(canvasSize * .72), canvasSize, Math.ceil(canvasSize * .28));
    ctx.restore();

    // Two hairlines make each grid line feel cut into the slab rather than
    // printed on top: a dark groove with a submerged highlight just below it.
    ctx.lineWidth = Math.max(.75, cell * .035);
    ctx.shadowColor = 'rgba(176,220,207,.22)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = Math.max(.55, cell * .018);
    ctx.beginPath();
    for (let i = 0; i < state.size; i++) {
      const p = pad + i * cell;
      ctx.moveTo(pad, p); ctx.lineTo(canvasSize - pad, p);
      ctx.moveTo(p, pad); ctx.lineTo(p, canvasSize - pad);
    }
    ctx.strokeStyle = 'rgba(4,18,19,.72)';
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = '#9abdb0';
    for (const [row, col] of starPoints(state.size)) {
      const s = Math.max(3, Math.round(cell * .16));
      ctx.fillRect(Math.round(pad + col * cell - s / 2), Math.round(pad + row * cell - s / 2), s, s);
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

    drawWaterGlaze();
    drawPlacementRipple();

    if (learnMode) drawAtariAndSelection(state, dead);
    drawLastMove(state);
    drawCursor(state);
  }

  function drawCoordinates(size) {
    if (cell < 18) return;
    ctx.save();
    ctx.fillStyle = '#a1bbb2';
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
    if (color === BLACK) drawRiverPebble(ctx, x, y, radius, row * 31 + col * 17);
    else drawIvoryShell(ctx, x, y, radius);
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

  function pebblePath(g, x, y, radius, seed) {
    // Three related silhouettes stop a group reading like stamped counters.
    // They stay grid-snapped, but each has different flats and chipped edges.
    const shapes = [
      [[-.52,-1],[.22,-1],[.22,-.94],[.62,-.94],[.62,-.78],[.84,-.78],[.84,-.5],[1,-.5],[1,.24],[.92,.24],[.92,.58],[.7,.58],[.7,.82],[.28,.82],[.28,.96],[-.44,.96],[-.44,.9],[-.72,.9],[-.72,.72],[-.92,.72],[-.92,.4],[-1,.4],[-1,-.34],[-.9,-.34],[-.9,-.68],[-.72,-.68],[-.72,-.9],[-.52,-.9]],
      [[-.26,-1],[.48,-1],[.48,-.9],[.72,-.9],[.72,-.72],[.92,-.72],[.92,-.34],[1,-.34],[1,.4],[.86,.4],[.86,.7],[.58,.7],[.58,.9],[.14,.9],[.14,1],[-.58,1],[-.58,.9],[-.82,.9],[-.82,.66],[-.96,.66],[-.96,.2],[-1,.2],[-1,-.5],[-.86,-.5],[-.86,-.76],[-.58,-.76],[-.58,-.94],[-.26,-.94]],
      [[-.62,-.94],[-.06,-.94],[-.06,-1],[.54,-1],[.54,-.84],[.78,-.84],[.78,-.62],[.94,-.62],[.94,-.16],[1,-.16],[1,.5],[.82,.5],[.82,.74],[.48,.74],[.48,.92],[-.14,.92],[-.14,1],[-.68,1],[-.68,.86],[-.9,.86],[-.9,.58],[-1,.58],[-1,-.18],[-.94,-.18],[-.94,-.56],[-.78,-.56],[-.78,-.82],[-.62,-.82]],
    ];
    const pts = shapes[Math.abs(seed) % shapes.length];
    g.beginPath();
    pts.forEach((p, i) => { const px = Math.round(x + p[0] * radius), py = Math.round(y + p[1] * radius); if (!i) g.moveTo(px, py); else g.lineTo(px, py); });
    g.closePath();
  }

  function drawRiverPebble(g, x, y, radius, seed) {
    const px = Math.max(1, Math.round(radius * .12));
    pebblePath(g, x, y + px, radius, seed);
    g.fillStyle = 'rgba(1,5,5,.72)'; g.fill();
    pebblePath(g, x, y, radius, seed);
    g.fillStyle = '#101817'; g.fill();
    g.strokeStyle = '#020605';
    g.lineWidth = Math.max(1, Math.round(cell * .03)); g.stroke();
    // Broad facets make this basalt rather than a glossy black Go counter.
    g.fillStyle = '#465650';
    g.beginPath();
    g.moveTo(Math.round(x - radius * .62), Math.round(y - radius * .58));
    g.lineTo(Math.round(x - radius * .18), Math.round(y - radius * .78));
    g.lineTo(Math.round(x + radius * .42), Math.round(y - radius * .62));
    g.lineTo(Math.round(x + radius * .12), Math.round(y - radius * .28));
    g.lineTo(Math.round(x - radius * .5), Math.round(y - radius * .2));
    g.closePath(); g.fill();
    g.fillStyle = '#273631';
    g.beginPath();
    g.moveTo(Math.round(x + radius * .14), Math.round(y - radius * .22));
    g.lineTo(Math.round(x + radius * .72), Math.round(y - radius * .36));
    g.lineTo(Math.round(x + radius * .68), Math.round(y + radius * .4));
    g.lineTo(Math.round(x + radius * .18), Math.round(y + radius * .62));
    g.closePath(); g.fill();
    g.fillStyle = '#728a82';
    const glintX = seed % 2 ? -.5 : -.34;
    g.fillRect(Math.round(x + radius * glintX), Math.round(y - radius * .56), px, px);
    g.fillStyle = '#17231f';
    g.fillRect(Math.round(x - radius * .58), Math.round(y + radius * .34), px * 2, px);
  }

  function shellPath(g, x, y, radius) {
    // A scallop seen from above: a broad fluted crown narrowing to the hinge.
    const pts = [
      [-.2,.96],[.2,.96],[.2,.86],[.4,.86],[.4,.7],[.6,.7],[.6,.52],[.78,.52],[.78,.3],[.94,.3],[.94,.04],[1,.04],
      [1,-.2],[.92,-.2],[.92,-.44],[.78,-.44],[.78,-.6],[.6,-.6],[.6,-.74],[.38,-.74],[.38,-.86],[.14,-.86],[.14,-.98],
      [-.12,-.98],[-.12,-.9],[-.36,-.9],[-.36,-.8],[-.58,-.8],[-.58,-.66],[-.76,-.66],[-.76,-.5],[-.9,-.5],[-.9,-.28],
      [-1,-.28],[-1,.02],[-.94,.02],[-.94,.3],[-.8,.3],[-.8,.5],[-.62,.5],[-.62,.68],[-.42,.68],[-.42,.84],[-.2,.84],
    ];
    g.beginPath();
    pts.forEach((p, i) => { const px = Math.round(x + p[0] * radius), py = Math.round(y + p[1] * radius); if (!i) g.moveTo(px, py); else g.lineTo(px, py); });
    g.closePath();
  }

  function pixelLine(g, x1, y1, x2, y2, size) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / size));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      g.fillRect(Math.round((x1 + (x2 - x1) * u) / size) * size, Math.round((y1 + (y2 - y1) * u) / size) * size, size, size);
    }
  }

  function drawIvoryShell(g, x, y, radius) {
    const p = Math.max(1, Math.round(radius * .09));
    shellPath(g, x, y + p, radius);
    g.fillStyle = 'rgba(48,33,20,.55)'; g.fill();
    shellPath(g, x, y, radius);
    g.fillStyle = '#eadfc6'; g.fill();
    g.strokeStyle = '#6f5a40';
    g.lineWidth = Math.max(1, Math.round(cell * .03)); g.stroke();
    // Radial ribs all meet at the hinge; this is the cue that makes the pale
    // side read immediately as shell rather than white stone.
    const hingeY = y + radius * .69;
    g.fillStyle = '#a58e68';
    [[-.78,-.12],[-.58,-.55],[-.3,-.79],[0,-.9],[.3,-.79],[.58,-.55],[.78,-.12]].forEach((end) => {
      pixelLine(g, x, hingeY, x + radius * end[0], y + radius * end[1], p);
    });
    g.fillStyle = '#fff7df';
    pixelLine(g, x - p, hingeY - p, x - radius * .2, y - radius * .78, p);
    g.fillStyle = '#c8b38e';
    g.fillRect(Math.round(x - radius * .28), Math.round(y + radius * .66), Math.max(p * 2, Math.round(radius * .56)), p * 2);
    g.fillStyle = '#f4ead1';
    g.fillRect(Math.round(x - radius * .13), Math.round(y + radius * .72), Math.max(p, Math.round(radius * .26)), p);
    // Two quiet mother-of-pearl pixels keep it organic without becoming glossy.
    g.fillStyle = '#efd8c7';
    g.fillRect(Math.round(x + radius * .45), Math.round(y - radius * .32), p * 2, p);
    g.fillStyle = '#c8ddd4';
    g.fillRect(Math.round(x - radius * .58), Math.round(y - radius * .25), p, p);
  }

  function drawWaterGlaze() {
    ctx.save();
    ctx.fillStyle = 'rgba(127,205,203,.035)';
    ctx.fillRect(0, 0, canvasSize, Math.round(canvasSize * .48));
    ctx.fillStyle = 'rgba(3,59,72,.055)';
    ctx.fillRect(0, Math.round(canvasSize * .66), canvasSize, Math.ceil(canvasSize * .34));
    ctx.strokeStyle = 'rgba(196,238,233,.09)';
    ctx.lineWidth = Math.max(1, Math.round(cell * .025));
    for (let band = 0; band < 3; band++) {
      const y = Math.round(canvasSize * (.2 + band * .29));
      ctx.beginPath();
      ctx.moveTo(-cell, y);
      const step = Math.max(10, Math.round(cell * .72));
      for (let x = -cell, i = 0; x <= canvasSize + cell; x += step, i++) {
        ctx.lineTo(Math.round(x), y + ((i + band) % 4 < 2 ? 0 : Math.max(1, Math.round(cell * .07))));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function strokeSegmentedOctagon(g, x, y, radius) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 8 + i * Math.PI / 4;
      pts.push([Math.round(x + Math.cos(a) * radius), Math.round(y + Math.sin(a) * radius)]);
    }
    for (let i = 0; i < 8; i++) {
      const a = pts[i], b = pts[(i + 1) % 8];
      g.beginPath();
      g.moveTo(Math.round(a[0] * .86 + b[0] * .14), Math.round(a[1] * .86 + b[1] * .14));
      g.lineTo(Math.round(a[0] * .14 + b[0] * .86), Math.round(a[1] * .14 + b[1] * .86));
      g.stroke();
    }
  }

  function drawPlacementRipple() {
    if (!placementRipple || reducedMotion.matches || reviewAt != null) return;
    const elapsed = performance.now() - placementRipple.at;
    const u = Math.max(0, Math.min(1, elapsed / placementRipple.duration));
    const x = pad + placementRipple.col * cell;
    const y = pad + placementRipple.row * cell;
    ctx.save();
    ctx.lineWidth = Math.max(.8, cell * .025) * (1 - u * .3);
    for (let ring = 0; ring < 2; ring++) {
      const ru = Math.max(0, Math.min(1, u * 1.25 - ring * .22));
      if (!ru) continue;
      ctx.globalAlpha = (1 - ru) * (ring ? .26 : .42);
      ctx.strokeStyle = ring ? '#89ced1' : '#d4f0e9';
      strokeSegmentedOctagon(ctx, x, y, cell * (.48 + ru * 1.8));
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
          strokeSegmentedOctagon(ctx, pad + c * cell, pad + r * cell, cell * .51);
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
      strokeSegmentedOctagon(ctx, pad + c * cell, pad + r * cell, cell * .54);
    });
    ctx.fillStyle = '#59f298';
    selected.liberties.forEach((liberty) => {
      const [r, c] = state.rowCol(liberty);
      const s = Math.max(4, Math.round(cell * .2));
      ctx.fillRect(Math.round(pad + c * cell - s / 2), Math.round(pad + r * cell - s / 2), s, s);
    });
    ctx.restore();
  }

  function drawLastMove(state) {
    const last = state.lastMove;
    if (!last || last.t !== 'play' || !state.at(last.r, last.c)) return;
    const x = pad + last.c * cell, y = pad + last.r * cell;
    ctx.save();
    ctx.fillStyle = last.by === BLACK ? '#e9f2ec' : '#14221a';
    const s = Math.max(3, Math.round(cell * .14));
    ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    ctx.restore();
  }

  function drawCursor(state) {
    if (reviewAt != null || currentResult() || localAiTurn()) return;
    let target = aimCell || hoverCell;
    if (document.activeElement === $('goBoard')) target = keyboardCell;
    if (!target || !state.inBounds(target.r, target.c)) return;
    const x = pad + target.c * cell, y = pad + target.r * cell;
    if (state.phase === 'playing' && state.at(target.r, target.c) === EMPTY) {
      const preview = state.preview(target.r, target.c);
      ctx.save();
      ctx.globalAlpha = preview.ok ? .45 : .22;
      if (state.current === BLACK) drawRiverPebble(ctx, x, y, cell * .42, target.r * 31 + target.c * 17);
      else drawIvoryShell(ctx, x, y, cell * .42);
      ctx.globalAlpha = .9;
      ctx.strokeStyle = preview.ok ? '#45f18b' : '#ff6b59';
      ctx.lineWidth = Math.max(1, cell * .045);
      strokeSegmentedOctagon(ctx, x, y, cell * .48);
      if (aimCell) {
        ctx.strokeStyle = '#f1b84b'; ctx.setLineDash([3, 3]);
        strokeSegmentedOctagon(ctx, x, y, cell * .58);
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
    cancelAiTurn();
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
      remoteBusy = false; render(); scheduleAiTurn();
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
    cancelAiTurn();
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
      remoteBusy = false; render(); scheduleAiTurn();
    }
  }

  function connectRoom(code, ref) {
    cancelAiTurn();
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
    cancelAiTurn();
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
    if (game.events.length > previousCount && reviewAt == null) {
      describeRemoteLastMove();
      const lastEvent = game.events[game.events.length - 1];
      if (lastEvent && lastEvent.t === 'play') startPlacementRipple(lastEvent.r, lastEvent.c);
    }
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
    cancelAiTurn();
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
    cancelAiTurn();
    stopPlacementRipple();
    const count = game.events.length;
    reviewAt = Math.max(0, Math.min(count, Number(value)));
    selectedIndex = null;
    render();
  }

  function returnToLive() {
    reviewAt = null;
    render();
    scheduleAiTurn();
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
    document.querySelectorAll('#playerModeButtons .seg').forEach((button) => button.addEventListener('click', () => setLocalMode(button.dataset.mode)));
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
    $('reviewLive').addEventListener('click', returnToLive);
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('beforeunload', () => {
      cancelAiTurn();
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
