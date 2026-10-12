// Scripted Glyph Run player for finding bugs: random-walk steering, takes the
// first upgrade, presses Space to continue past gates and summaries, restarts
// after a death. Logs uncaught errors, console errors and every screen change.
// usage: node bughunt.mjs <outDir> <seconds> [mobile]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, secS = '240', mobile = '', dashing = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = 9800 + Math.floor(Math.random()*150);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${outDir}/profile`,
  '--window-size=1280,800', '--mute-audio', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const events = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const keyCode = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', ' ': 'Space', 1: 'Digit1' };
const key = (k, type) => send('Input.dispatchKeyEvent', { type, key: k, code: keyCode[k], text: type === 'keyDown' && (k === '1' || k === ' ') ? k : undefined });
const tap = async (k) => { await key(k, 'keyDown'); await key(k, 'keyUp'); };
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1);

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') events.push({ t: ts(), kind: 'EXCEPTION', text: d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text });
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) events.push({ t: ts(), kind: d.params.type, text: d.params.args.map((a) => a.value ?? a.description).join(' ') });
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') events.push({ t: ts(), kind: 'log', text: d.params.entry.text + ' ' + (d.params.entry.url || '') });
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await send('Page.navigate', { url: (process.env.PAGE || 'http://localhost:8765/game/glyphrun-next.html') + '?hunt=' + Date.now() });
  await sleep(2500);
  if (process.env.CHAR) { await evaluate(`document.querySelectorAll('#charRow .char-card')[${process.env.CHAR}].click()`); await sleep(300); }
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('GO TO BATTLE')).click()`);

  const dirs = [['w'], ['a'], ['s'], ['d'], ['w', 'a'], ['w', 'd'], ['s', 'a'], ['s', 'd']];
  let held = [], lastScreen = '', shots = 0, deaths = 0;
  const end = Date.now() + (+secS) * 1000;
  while (Date.now() < end) {
    for (const k of held) await key(k, 'keyUp');
    held = dirs[Math.floor(Math.random() * dirs.length)];
    for (const k of held) await key(k, 'keyDown');
    const state = await evaluate(`(() => { const shown = [...document.querySelectorAll('.overlay.show')].map(o => o.id); return { shown, era: document.getElementById('hudEraName')?.textContent, lives: document.getElementById('hudLives')?.textContent, glyphs: document.getElementById('hudCoins')?.textContent, bei: (() => { try { return Game.dbg().bei; } catch (e) { return -1; } })() }; })()`);
    const screen = state.shown.join(',') || 'battle';
    if (screen !== lastScreen) { events.push({ t: ts(), kind: 'screen', text: `${screen} | ${state.era} | hp ${state.lives} | glyphs ${state.glyphs} | 貝 ${state.bei}` }); lastScreen = screen; }
    if (dashing && !state.shown.length && Math.random() < 0.6) await tap(' ');
    if (state.shown.includes('ovDesk')) await tap('1');
    if (state.shown.includes('ovClear')) await tap(' ');
    if (state.shown.includes('ovMarket')) { await evaluate(`(() => { const b = document.querySelector('#mkOffers .mkBuy:not([disabled])'); if (b) b.click(); })()`); await sleep(400); }
    if (state.shown.length && !state.shown.some((s) => ['ovDesk', 'ovClear'].includes(s))) {
      // a run ended or a summary is up: note it, then try the obvious buttons
      if (state.shown.some((s) => /over|dead|end|stage/i.test(s))) deaths++;
      await evaluate(`(() => { const o = document.querySelector('.overlay.show'); const b = o && [...o.querySelectorAll('button')].find(b => b.offsetParent && /again|retry|restart|next|continue|GO TO BATTLE|deeper|▶|⟶/i.test(b.innerText)); if (b) b.click(); })()`);
    }
    if (Date.now() - t0 > (shots + 1) * 30000) { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(`${outDir}/s${String(++shots).padStart(2, '0')}.jpg`, Buffer.from(s.data, 'base64')); }
    await sleep(700 + Math.random() * 900);
  }
  writeFileSync(`${outDir}/events.json`, JSON.stringify(events, null, 1));
  const errs = events.filter((e) => e.kind !== 'screen');
  console.log(`events ${events.length}, problems ${errs.length}, screenshots ${shots}`);
  for (const e of events.slice(0, 80)) console.log(e.t, e.kind, String(e.text).slice(0, 160));
} finally { try { ws?.close(); } catch {} chrome.kill('SIGKILL'); }
