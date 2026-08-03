/* A room relay for gomoku, on Cloudflare.
 *
 * Remote play used to run on Firebase, which is Google at both ends — the SDK
 * on gstatic and the database on firebaseio — and neither host is reachable
 * from mainland China. A game with a friend in Beijing could not connect at
 * all. This is the same job done somewhere that can be reached: one Durable
 * Object per room code, holding the room's state, with both players on a
 * WebSocket to it.
 *
 * It is deliberately dumb. The room is a flat map of key -> JSON value, and it
 * knows nothing about gomoku: whoever writes a key, everyone connected to that
 * room is told. That is the entire contract the game already used, so the game
 * did not have to learn anything new.
 */

const ROOM_TTL = 6 * 60 * 60 * 1000;      // a room nobody has touched in six hours is gone

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('gomoku relay: ok\n', { headers: { 'content-type': 'text/plain' } });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,16})$/);
    if (!m) return new Response('not found', { status: 404 });

    // Only the pages this is for. ALLOW_ORIGINS unset means allow anything,
    // so a fresh deploy works before it has been configured.
    const allow = (env.ALLOW_ORIGINS || '').trim();
    if (allow) {
      const origin = req.headers.get('Origin') || '';
      const ok = allow.split(',').map(s => s.trim()).filter(Boolean)
        .some(a => origin === a || (a.startsWith('*.') && origin.endsWith(a.slice(1))));
      if (!ok) return new Response('forbidden', { status: 403 });
    }
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426 });
    }
    const id = env.ROOM.idFromName(m[1].toUpperCase());
    return env.ROOM.get(id).fetch(req);
  },
};

export class Room {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation, not a held-open handler: two people playing gomoku are idle
    // almost all the time, and this way an idle room costs nothing.
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ t: 'init', d: (await this.ctx.storage.get('d')) || {} }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'ping') { ws.send('{"t":"pong"}'); return; }
    if (m.t !== 'set' || typeof m.p !== 'string' || m.p.length > 64) return;

    // Read through storage every time rather than caching on `this`. A
    // hibernating object is reconstructed between messages, so anything held
    // in memory is not reliably there.
    const d = (await this.ctx.storage.get('d')) || {};
    if (m.v === null || m.v === undefined) delete d[m.p]; else d[m.p] = m.v;
    await this.ctx.storage.put('d', d);

    // Echoed to the writer as well. That is what the game expects: a move is
    // applied when it comes back from the room, so both sides run the same
    // path and neither can get ahead of the other.
    const out = JSON.stringify({ t: 'u', p: m.p, v: m.v === undefined ? null : m.v });
    for (const s of this.ctx.getWebSockets()) { try { s.send(out); } catch (e) {} }
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
  }

  async webSocketClose(ws) { try { ws.close(); } catch (e) {} }
  async webSocketError(ws) { try { ws.close(); } catch (e) {} }
  async alarm() { await this.ctx.storage.deleteAll(); }
}
