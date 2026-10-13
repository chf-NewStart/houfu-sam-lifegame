/* A room relay for the arcade's online games, on Cloudflare.
 *
 * Remote play used to run on Firebase, which is Google at both ends — the SDK
 * on gstatic and the database on firebaseio — and neither host is reachable
 * from mainland China. A game with a friend in Beijing could not connect at
 * all. This is the same job done somewhere that can be reached: one Durable
 * Object per room code, holding the room's state, with every player on a
 * WebSocket to it.
 *
 * It is deliberately dumb. The room is a flat map of key -> JSON value, and it
 * knows nothing about any game: whoever writes a key, everyone connected to
 * that room is told. Gomoku and Manilha (truco) both use it.
 *
 * The one thing it adds is presence, which a game cannot do for itself on a
 * map like this without writing a heartbeat every few seconds. A socket may
 * name itself with ?id=… when it connects; the room then tells everyone which
 * ids are connected, whenever someone arrives or leaves, and answers
 * {"t":"who"} with the same list. A socket that has not pinged for a while is
 * treated as gone and closed: a phone that went to sleep does not always say
 * goodbye.
 *
 * Messages, client → room:
 *   {"t":"set","p":key,"v":value}   write a key (null or missing v deletes it)
 *   {"t":"ping"}                    keep-alive, answered {"t":"pong"} without waking the room
 *   {"t":"who"}                     ask who is connected
 * Room → client:
 *   {"t":"init","d":{…},"who":[ids]}  on connect: the whole map, and who is here
 *   {"t":"u","p":key,"v":value}       a key changed (sent to the writer too)
 *   {"t":"who","ids":[ids]}           who is connected
 */

const ROOM_TTL = 6 * 60 * 60 * 1000;      // a room nobody has touched in six hours is gone
const STALE_AFTER = 45 * 1000;            // no ping for this long: the socket is gone
const MAX_VALUE = 64 * 1024;              // one key's JSON; a truco game state is ~5 KB
const MAX_ROOM = 256 * 1024;              // the whole map

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('lifegame relay: ok\n', { headers: { 'content-type': 'text/plain' } });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,16})$/);
    if (!m) return new Response('not found', { status: 404 });

    // Only the pages this is for. ALLOW_ORIGINS unset means allow anything,
    // so a fresh deploy works before it has been configured. The Manilha iOS
    // app sends Origin: https://lifegameproject.com.
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
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // Keep-alives are answered by the runtime itself, so a room full of idle
    // players pinging every few seconds never wakes up (or bills) the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    const raw = url.searchParams.get('id') || '';
    const who = /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : '';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation, not a held-open handler: players are idle almost all the
    // time, and this way an idle room costs nothing.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: who, at: Date.now() });
    const ids = this.live();
    server.send(JSON.stringify({ t: 'init', d: (await this.ctx.storage.get('d')) || {}, who: ids }));
    if (who) this.broadcast({ t: 'who', ids }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* Ids of the sockets that are still there. Anything silent for longer than
     STALE_AFTER is closed on the way, which also tells its owner to reconnect
     if it was only asleep. */
  live(except) {
    const now = Date.now();
    const ids = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      let a = null;
      try { a = ws.deserializeAttachment(); } catch (e) {}
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      const last = Math.max(a && a.at || 0, pinged ? pinged.getTime() : 0);
      if (now - last > STALE_AFTER) { try { ws.close(4000, 'stale'); } catch (e) {} continue; }
      if (a && a.id) ids.add(a.id);
    }
    return [...ids];
  }

  broadcast(message, except) {
    const out = JSON.stringify(message);
    for (const s of this.ctx.getWebSockets()) {
      if (s === except) continue;
      try { s.send(out); } catch (e) {}
    }
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    try {
      const a = ws.deserializeAttachment() || {};
      ws.serializeAttachment({ id: a.id || '', at: Date.now() });
    } catch (e) {}
    if (m.t === 'ping') { ws.send('{"t":"pong"}'); return; }
    if (m.t === 'who') { ws.send(JSON.stringify({ t: 'who', ids: this.live() })); return; }
    if (m.t !== 'set' || typeof m.p !== 'string' || !m.p || m.p.length > 64) return;
    const value = m.v === undefined ? null : m.v;
    if (value !== null && JSON.stringify(value).length > MAX_VALUE) return;

    // Read through storage every time rather than caching on `this`. A
    // hibernating object is reconstructed between messages, so anything held
    // in memory is not reliably there.
    const d = (await this.ctx.storage.get('d')) || {};
    if (value === null) delete d[m.p]; else d[m.p] = value;
    if (JSON.stringify(d).length > MAX_ROOM) return;
    await this.ctx.storage.put('d', d);

    // Echoed to the writer as well. That is what the games expect: a move is
    // applied when it comes back from the room, so every side runs the same
    // path and sees the same order.
    this.broadcast({ t: 'u', p: m.p, v: value });

    // Push the expiry back, but only once in a while: every alarm write is a
    // storage write, and a lively room would otherwise pay for one per move.
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm == null || alarm < Date.now() + ROOM_TTL - 10 * 60 * 1000) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch (e) {}
    this.broadcast({ t: 'who', ids: this.live(ws) }, ws);
  }

  async webSocketError(ws) {
    try { ws.close(); } catch (e) {}
    this.broadcast({ t: 'who', ids: this.live(ws) }, ws);
  }

  async alarm() { await this.ctx.storage.deleteAll(); }
}
