// Starts a Glyph Run preview battle with a chosen character, then runs a list of
// scripted triggers and grabs frames of the battlefield at given delays.
// usage: node fxshot.mjs <outDir> <charIndex> '<json steps>'
// steps: [["eval","Game.test.glyph('山')"],["shots",[150,350,600],"shan"], ["wait",2000]]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const [outDir, charIdx = '0', stepsS = '[]'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${outDir}/profile`, '--window-size=1280,800', '--force-device-scale-factor=1', '--mute-audio', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errs = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) errs.push('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
try {
  let target; for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text)); };
  await new Promise(r => (ws.onopen = r));
  await send('Runtime.enable'); await send('Page.enable');
  if (process.env.MOBILE) { await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  await send('Page.navigate', { url: 'http://localhost:8765/game/glyphrun-next.html?fx=' + Date.now() });
  await sleep(2500);
  await evaluate(`document.querySelectorAll('#charRow .char-card')[${+charIdx}].click()`);
  await sleep(300);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('GO TO BATTLE')).click()`);
  await sleep(900);
  await evaluate(`Game.test.god(true)`);
  const rect = process.env.MOBILE ? {x:0, y:0, width:844, height:390} : await evaluate(`(() => { const c = document.getElementById('cvs'); c.scrollIntoView({block:'center'}); const r = c.getBoundingClientRect(); return {x:r.left + scrollX, y:r.top + scrollY, width:r.width, height:r.height}; })()`);
  let n = 0;
  for (const [op, a, b] of JSON.parse(stepsS)) {
    if (op === 'wait') await sleep(a);
    else if (op === 'eval') { const v = await evaluate(a); if (v !== undefined) console.log('eval →', JSON.stringify(v).slice(0, 300)); }
    else if (op === 'key') { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: a, code: b }); await sleep(+(stepsS && 0) || 0); }
    else if (op === 'keyup') await send('Input.dispatchKeyEvent', { type: 'keyUp', key: a, code: b });
    else if (op === 'shots') {
      const t0 = Date.now();
      for (const ms of a) { const w = t0 + ms - Date.now(); if (w > 0) await sleep(w);
        const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { ...rect, scale: 1 } });
        writeFileSync(`${outDir}/${b}-${String(++n).padStart(2, '0')}-${ms}.jpg`, Buffer.from(s.data, 'base64')); }
    }
  }
  console.log(errs.length ? errs.join('\n') : 'no errors');
} finally { try { ws?.close(); } catch {} chrome.kill('SIGKILL'); }
