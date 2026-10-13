/* Talks to a running relay. Skipped unless RELAY_URL is set, e.g.
     (cd relay && npx wrangler dev --port 8787)
     RELAY_URL=ws://127.0.0.1:8787 node --test tests/relay-live.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';

const RELAY = process.env.RELAY_URL;
const skip = !RELAY && 'set RELAY_URL to run against a relay';

function client(code, id) {
  const ws = new WebSocket(`${RELAY}/room/${code}${id ? `?id=${id}` : ''}`);
  const inbox = [];
  const waiters = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    inbox.push(m);
    for (const w of waiters.splice(0)) w();
  };
  async function next(pred, ms = 3000) {
    const end = Date.now() + ms;
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() > end) throw new Error('timed out waiting; inbox: ' + JSON.stringify(inbox));
      await new Promise(r => { waiters.push(r); setTimeout(r, 50); });
    }
  }
  const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return { ws, inbox, next, open, send: m => ws.send(JSON.stringify(m)), close: () => ws.close() };
}

const room = () => 'T' + Math.random().toString(36).slice(2, 9).toUpperCase().replace(/[^A-Z0-9]/g, 'X');

test('set is broadcast to everyone, including the writer, and survives a reconnect', { skip }, async () => {
  const code = room();
  const a = client(code, 'alice'); await a.open;
  const initA = await a.next(m => m.t === 'init');
  assert.deepEqual(initA.d, {});
  assert.deepEqual(initA.who, ['alice']);
  const b = client(code, 'bob'); await b.open;
  await b.next(m => m.t === 'init');
  a.send({ t: 'set', p: 'room', v: { kind: 'truco', n: 1 } });
  assert.deepEqual((await a.next(m => m.t === 'u')).v, { kind: 'truco', n: 1 });
  assert.deepEqual((await b.next(m => m.t === 'u')).v, { kind: 'truco', n: 1 });
  b.send({ t: 'set', p: 'room', v: null });
  assert.equal((await a.next(m => m.t === 'u')).v, null);
  a.send({ t: 'set', p: 'g', v: [1, null, 'x'] });
  await a.next(m => m.t === 'u' && m.p === 'g');
  a.close(); b.close();
  const c = client(code, 'carol'); await c.open;
  const init = await c.next(m => m.t === 'init');
  assert.deepEqual(init.d, { g: [1, null, 'x'] });
  c.close();
});

test('presence: arrivals, departures and who requests list the connected ids', { skip }, async () => {
  const code = room();
  const a = client(code, 'host1'); await a.open;
  await a.next(m => m.t === 'init');
  const b = client(code, 'guest1'); await b.open;
  const initB = await b.next(m => m.t === 'init');
  assert.deepEqual(initB.who.sort(), ['guest1', 'host1']);
  assert.deepEqual((await a.next(m => m.t === 'who')).ids.sort(), ['guest1', 'host1']);
  b.close();
  assert.deepEqual((await a.next(m => m.t === 'who')).ids, ['host1']);
  a.send({ t: 'who' });
  assert.deepEqual((await a.next(m => m.t === 'who')).ids, ['host1']);
  const anon = client(code); await anon.open;
  const initAnon = await anon.next(m => m.t === 'init');
  assert.deepEqual(initAnon.who, ['host1']);
  a.close(); anon.close();
});

test('pings are answered and oversized or malformed writes are ignored', { skip }, async () => {
  const code = room();
  const a = client(code, 'p1'); await a.open;
  await a.next(m => m.t === 'init');
  a.send({ t: 'ping' });
  await a.next(m => m.t === 'pong');
  a.send({ t: 'set', p: 'x'.repeat(65), v: 1 });
  a.send({ t: 'set', p: 'big', v: 'y'.repeat(70 * 1024) });
  a.ws.send('not json');
  a.send({ t: 'set', p: 'ok', v: 2 });
  const u = await a.next(m => m.t === 'u');
  assert.equal(u.p, 'ok');
  a.close();
});
