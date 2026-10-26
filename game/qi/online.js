/* One online room (room.js has the contract), as the app runs it (Qi/Online/OnlineSession.swift
   and RelayConnection.swift). Connects to the arcade relay and plays this device's part: the
   host seats its friend, applies the friend's actions and publishes the game; the guest sends
   its actions and follows what the host publishes. Drops are reconnected with a growing pause;
   the room and this device's player id are remembered, so a closed tab comes back to the same
   seat. Runs in the page and, for tests, in Node (pass `WebSocket` and `storage`). */
import { RoomCode, newRecord, normalRecord, seatKeys, seatOf, isFull, apply, wantsRematch, nextRound } from './room.js?v=12';

export const DEFAULT_RELAY = 'wss://lifegame-relay.houfuchen0702.workers.dev';
const SAVED_KEY = 'qi_online_room';

/** The connection to one room on the relay: a flat map of key → JSON, every write echoed to
    everyone in one order, and who is connected. Pings every 10 s; a connection silent for
    25 s (or never opened within 12 s) is treated as gone. */
export class Relay {
  constructor(base, WS, headers) { this.base = base; this.WS = WS; this.headers = headers; this.onEvent = null; this.ws = null; this.isOpen = false; }

  open(room, pid) {
    this.close();
    const url = `${this.base.replace(/\/$/, '')}/room/${room}?id=${encodeURIComponent(pid)}`;
    const ws = this.headers ? new this.WS(url, { headers: this.headers }) : new this.WS(url);
    this.ws = ws;
    this.lastHeard = Date.now();
    const started = Date.now();
    let lastPing = Date.now();
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      this.lastHeard = Date.now();
      let m;
      try { m = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)); } catch (err) { return; }
      if (m.t === 'init') { this.isOpen = true; this.emit({ t: 'opened', map: m.d || {}, who: Array.isArray(m.who) ? m.who : [] }); }
      else if (m.t === 'u' && typeof m.p === 'string') this.emit({ t: 'update', key: m.p, value: m.v == null ? null : m.v });
      else if (m.t === 'who') this.emit({ t: 'who', ids: Array.isArray(m.ids) ? m.ids : [] });
    };
    const fail = (reason) => { if (ws !== this.ws) return; this.close(); this.emit({ t: 'closed', reason }); };
    ws.onclose = () => fail('closed');
    ws.onerror = () => fail('error');
    this.timer = setInterval(() => {
      if (ws !== this.ws) return;
      if (!this.isOpen) { if (Date.now() - started > 12000) fail('timeout'); return; }
      if (Date.now() - this.lastHeard > 25000) { fail('silent'); return; }
      if (Date.now() - lastPing >= 10000) { lastPing = Date.now(); try { ws.send('{"t":"ping"}'); } catch (err) { /* closing */ } }
    }, 2000);
  }

  emit(e) { if (this.onEvent) this.onEvent(e); }
  /** Writes a key; null deletes it. Dropped if the connection isn't open. */
  set(key, value) {
    if (!this.isOpen || !this.ws) return;
    try { this.ws.send(JSON.stringify({ t: 'set', p: key, v: value == null ? null : value })); } catch (e) { /* closing */ }
  }
  close() {
    clearInterval(this.timer);
    const ws = this.ws;
    this.ws = null;
    this.isOpen = false;
    if (ws) { ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch (e) { /* already */ } }
  }
}

function newPid() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export class OnlineSession {
  /** `options`: { WebSocket, headers (Node), storage ({get, set}), relay (URL) }. */
  constructor(options = {}) {
    this.WS = options.WebSocket || globalThis.WebSocket;
    this.headers = options.headers || null;
    this.storage = options.storage || {
      get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
      set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private */ } },
    };
    this.relayURL = options.relay || DEFAULT_RELAY;
    this.onChange = null;
    /** Mahjong (mahjong-room.js) adds its part here: { onOpened, refresh, apply, hostWork, ... }. */
    this.ext = options.ext || null;
    this.saved = this.storage.get(SAVED_KEY);
    this.reset();
  }

  // What the screens read.
  get active() { return this.code != null; }
  get isHost() { return !!this.info && this.info.host === this.pid; }
  get seat() { return this.info ? seatOf(this.info, this.pid) : null; }
  get friendPid() { if (!this.info) return null; for (const v of Object.values(this.info.seats || {})) if (v !== this.pid) return v; return null; }
  get friendHere() { const f = this.friendPid; return f != null && this.live.has(f); }
  get waitingForFriend() { return !!this.info && this.friendPid == null; }
  get waitingForSeat() { return !!this.info && !this.isHost && this.seat == null && this.problem == null; }
  /** Moves this device sent that the host hasn't applied yet (shown already, faded). */
  get pendingMoves() { return this.outbox.filter((i) => i.a === 'move' && i.m != null).map((i) => i.m); }

  setSaved(s) { this.saved = s; this.storage.set(SAVED_KEY, s); }
  changed() { if (this.onChange) this.onChange(); }

  // Opening, joining, leaving

  /** Opens a new room. `seat` is the creator's: 1 moves first. */
  create(game, size, seat) {
    this.reset();
    this.pid = newPid();
    if (this.ext && this.ext.newSecret) this.secret = this.ext.newSecret();
    const code = RoomCode.make();
    this.creating = { kind: 'qi', v: 1, game, ...(game === 'go' ? { size } : {}), host: this.pid,
      seats: { [game === 'mahjong' ? '0' : String(seat)]: this.pid }, createdAt: Date.now() };
    if (this.ext && this.ext.decorateRoom) this.ext.decorateRoom(this, this.creating);
    this.connect(code);
  }

  join(codeIn) {
    const code = String(codeIn).toUpperCase();
    this.reset();
    const again = this.saved && this.saved.code === code;
    this.pid = again ? this.saved.pid : newPid();
    this.secret = (again && this.saved.secret) || (this.ext && this.ext.newSecret ? this.ext.newSecret() : '');
    this.connect(code);
  }

  /** Back to the room saved on this device. */
  resumeSaved() {
    const s = this.saved;
    if (!s) return;
    this.reset();
    this.pid = s.pid;
    this.secret = s.secret || (this.ext && this.ext.newSecret ? this.ext.newSecret() : '');
    this.connect(s.code);
  }

  /** Leaves the room on this device. It stays on the relay (six hours), so it can be
      rejoined with the code; `forget` drops it from the start screen too. */
  leave(forget = false) {
    if (forget) this.setSaved(null);
    this.reset();
    this.changed();
  }
  forgetSaved() { this.setSaved(null); this.changed(); }

  /** Reconnects at once (the tab came back to the front, the network came back). */
  wake() {
    if (!this.active || this.connected) return;
    clearTimeout(this.retry);
    this.attempts = 0;
    this.open(this.code);
  }

  reset() {
    clearTimeout(this.retry);
    this.retry = null;
    if (this.connection) { this.connection.onEvent = null; this.connection.close(); }
    this.connection = null;
    this.code = null;
    this.pid = this.pid || '';
    this.info = null;
    this.record = null;
    this.map = {};
    this.live = new Set();
    this.connected = false;
    this.problem = null;
    this.outbox = [];
    this.creating = null;
    this.everOpened = false;
    this.attempts = 0;
    if (this.ext && this.ext.reset) this.ext.reset(this);
  }

  connect(code) { this.code = code; this.open(code); }

  open(code) {
    if (this.connection) { this.connection.onEvent = null; this.connection.close(); }
    const c = new Relay(this.relayURL, this.WS, this.headers);
    this.connection = c;
    c.onEvent = (e) => { if (c === this.connection) this.handle(e); };
    c.open(RoomCode.relayRoom(code), this.pid);
  }

  handle(e) {
    if (e.t === 'opened') {
      this.map = { ...e.map };
      this.live = new Set(e.who);
      this.connected = true;
      this.everOpened = true;
      this.attempts = 0;
      if (this.creating) {
        if (this.map.room != null) {
          // Someone else's room has this code: try another.
          this.map = {};
          this.connect(RoomCode.make());
          return;
        }
        const room = this.creating;
        this.creating = null;
        this.publish('room', room);
        const record = newRecord();
        if (this.ext && this.ext.newRecord) this.ext.newRecord(record, room);
        this.publish('g', record);
      }
      this.refresh();
      if (!this.info) { this.problem = 'notFound'; this.close(); return; }
      if (!this.isHost) {
        const join = { at: Date.now(), v: 1 };
        if (this.ext && this.ext.decorateJoin) this.ext.decorateJoin(this, join);
        this.write(`j/${this.pid}`, join);
      }
      this.hostWork();
      if (this.outbox.length) this.write(`i/${this.pid}`, this.outbox[0]);
    } else if (e.t === 'update') {
      // `room` and `g` have one writer, the host, which already holds what it wrote: the
      // relay's echo can arrive after a newer write and must not roll the game back. A
      // record older than the one here is never taken either.
      if (this.isHost && (e.key === 'room' || e.key === 'g')) return;
      if (e.key === 'g' && this.record && e.value && typeof e.value.seq === 'number' && e.value.seq < this.record.seq) return;
      if (e.value == null) delete this.map[e.key]; else this.map[e.key] = e.value;
      this.refresh();
      this.hostWork();
    } else if (e.t === 'who') {
      this.live = new Set(e.ids);
      if (this.info && this.info.game === 'mahjong') this.hostWork();
      this.changed();
    } else if (e.t === 'closed') {
      this.connected = false;
      this.changed();
      this.scheduleReconnect();
    }
  }

  close() {
    clearTimeout(this.retry);
    if (this.connection) { this.connection.onEvent = null; this.connection.close(); }
    this.connection = null;
    this.connected = false;
    this.code = null;
    this.changed();
  }

  /** 1, 2, 4, 8, 15 s, then every 15 s. Three failed first attempts: say so (and keep trying). */
  scheduleReconnect() {
    const code = this.code;
    if (!code) return;
    this.attempts++;
    if (!this.everOpened && this.attempts >= 3) this.problem = 'unreachable';
    const delay = Math.min(15, Math.pow(2, this.attempts - 1));
    clearTimeout(this.retry);
    this.retry = setTimeout(() => { if (this.code === code && !this.connected) this.open(code); }, delay * 1000);
  }

  refresh() {
    const room = this.map.room;
    this.info = room && room.kind === 'qi' ? room : null;
    this.record = this.map.g ? normalRecord(this.map.g) : null;
    if (this.info && !this.isHost && this.seat == null && isFull(this.info)) { this.problem = 'full'; this.close(); return; }
    if (this.info && this.seat != null && this.code) {
      const here = { code: this.code, pid: this.pid, game: this.info.game, ...(this.info.game === 'mahjong' ? { secret: this.secret } : {}) };
      if (JSON.stringify(here) !== JSON.stringify(this.saved)) this.setSaved(here);
    }
    if (this.ext && this.ext.refresh) this.ext.refresh(this);
    // The host has dealt with our first action: send the next one.
    if (this.record) {
      const acked = this.record.acks[this.pid] || 0;
      let advanced = false;
      while (this.outbox.length && this.outbox[0].n <= acked) { this.outbox.shift(); advanced = true; }
      if (advanced && this.outbox.length) this.write(`i/${this.pid}`, this.outbox[0]);
      // A new round (rematch): anything still queued belonged to the old one.
      this.outbox = this.outbox.filter((i) => i.round === this.record.round);
    }
    this.changed();
  }

  // Actions

  /** Does something in the game: the host applies it at once, a guest sends it to the host. */
  send(action, { move, point } = {}) {
    const info = this.info, record = this.record, seat = this.seat;
    if (!info || !record || seat == null) return;
    const intent = { n: 0, round: record.round, a: action };
    if (move != null) intent.m = move;
    if (point != null) intent.p = point;
    if (this.isHost) {
      if (info.game === 'mahjong') { if (this.ext) this.ext.hostSend(this, intent, seat); return; }
      let next = apply(intent, seat, record, info);
      if (!next) return;
      let room = info;
      if (wantsRematch(next)) [next, room] = nextRound(next, info);
      next.seq += 1;
      if (room !== info) this.publish('room', room);
      this.publish('g', next);
    } else {
      const last = Math.max(this.outbox.length ? this.outbox[this.outbox.length - 1].n : 0, record.acks[this.pid] || 0);
      intent.n = last + 1;
      this.outbox.push(intent);
      if (this.outbox.length === 1) this.write(`i/${this.pid}`, intent);
      this.changed();
    }
  }

  /** The host's chores: seat whoever joined, apply the guests' actions, start a rematch. */
  hostWork() {
    if (!this.isHost || !this.info || !this.record) return;
    let room = JSON.parse(JSON.stringify(this.info));
    let game = JSON.parse(JSON.stringify(this.record));
    let roomChanged = false, gameChanged = false;
    for (const key of Object.keys(this.map).sort()) {
      if (!key.startsWith('j/')) continue;
      const joiner = key.slice(2);
      if (seatOf(room, joiner) != null) continue;
      const free = seatKeys(room).find((k) => room.seats[k] == null);
      if (free == null) continue;
      room.seats[free] = joiner;
      roomChanged = true;
    }
    if (roomChanged) this.publish('room', room);
    const mahjong = room.game === 'mahjong';
    for (const [seatKey, guest] of Object.entries(room.seats)) {
      if (guest === this.pid) continue;
      const intent = this.map[`i/${guest}`];
      if (!intent || typeof intent.n !== 'number' || intent.n <= (game.acks[guest] || 0)) continue;
      const seat = Number(seatKey);
      const next = mahjong ? this.ext.apply(this, intent, seat, game, room) : apply(intent, seat, game, room);
      if (next) game = next;
      game.acks[guest] = intent.n;
      gameChanged = true;
    }
    if (mahjong) { this.ext.hostWork(this, game, gameChanged); return; }
    if (wantsRematch(game)) {
      [game, room] = nextRound(game, room);
      roomChanged = true;
      gameChanged = true;
    }
    if (roomChanged) this.publish('room', room);
    if (gameChanged) { game.seq += 1; this.publish('g', game); }
  }

  /** Writes a key and shows it here at once (the relay's echo brings the same value back). */
  publish(key, value) {
    this.map[key] = JSON.parse(JSON.stringify(value));
    if (this.connection) this.connection.set(key, value);
    this.refresh();
  }

  write(key, value) { if (this.connection) this.connection.set(key, value); }

  /** Where the relay lives: lifegameproject.com/game/truco-relay.json may name another. */
  static async relayFromSite(base = '') {
    try {
      const res = await fetch(base + '/game/truco-relay.json', { cache: 'no-cache' });
      const j = await res.json();
      if (typeof j.relay === 'string' && /^wss:\/\/[^/]+/.test(j.relay)) return j.relay;
    } catch (e) { /* the default */ }
    return DEFAULT_RELAY;
  }
}
