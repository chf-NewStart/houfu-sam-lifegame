// usage: node shot.mjs <url> <out.png> <w> <h> <mobile 0/1> <steps JSON>
// steps: [["click","#goBtn"],["wait",3000],["eval","..."],["shot"]]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [url, out, wS = '1280', hS = '900', mob = '0', stepsS = '[]'] = process.argv.slice(2);
const W = +wS, H = +hS, mobile = mob === '1', steps = JSON.parse(stepsS);
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${out}.profile`, `--window-size=${W},${H}`, '--mute-audio', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errs = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) errs.push('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
try {
  let target; for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errs.push(d.params.type + ' ' + d.params.args.map(a => a.value ?? a.description).join(' ')); };
  await new Promise(r => (ws.onopen = r));
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile, ...(mobile ? { screenOrientation: { type: W > H ? 'landscapePrimary' : 'portraitPrimary', angle: W > H ? 90 : 0 } } : {}) });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url }); await sleep(1500);
  let shots = 0;
  for (const [op, a, b] of steps) {
    if (op === 'click') await evaluate(`document.querySelector(${JSON.stringify(a)}).click()`);
    else if (op === 'wait') await sleep(a);
    else if (op === 'eval') { const v = await evaluate(a); if (v !== undefined) console.log('eval →', JSON.stringify(v)); }
    else if (op === 'clip') {
      const r = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(a)}); const b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
      const s2 = await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 }, captureBeyondViewport: true }); const f = out.replace('.png', `-${++shots}-clip.png`); writeFileSync(f, Buffer.from(s2.data, 'base64')); console.log('saved', f);
    }
    else if (op === 'shot') {
      const full = b === 'full';
      let params = { format: 'png' };
      if (full) { const hh = await evaluate('document.documentElement.scrollHeight'); params = { format: 'png', clip: { x: 0, y: 0, width: W, height: hh, scale: 1 }, captureBeyondViewport: true }; }
      const s = await send('Page.captureScreenshot', params); const f = out.replace('.png', `-${++shots}${a ? '-' + a : ''}.png`); writeFileSync(f, Buffer.from(s.data, 'base64')); console.log('saved', f);
    }
  }
  console.log(errs.length ? errs.join('\n') : 'no errors');
} finally { try { ws?.close(); } catch {} chrome.kill('SIGKILL'); }
