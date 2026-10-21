/* plank-online.js — the room contract for Plank Plank Plank! online: a duel between two people
   anywhere, in a browser (game/plank-duel.html) or the Plank Constant iOS app, which implements
   the same rules in Swift (PlankPilot/Remote/RelayDuel.swift) and is tested against sessions
   recorded from this file. No FaceTime, no Apple account: a room code or a link is enough.

   A room lives on the arcade's relay (relay/src/index.js) as a flat map of keys. Every key has
   exactly one writer, so nothing needs a transaction:

     room      {kind:"plank", v, host:<pid>, guest:<pid>|null}       the host
     j/<pid>   {v, app:"web"|"ios", at} "I'm here"; deleted on leaving   that player
     r/<pid>   {n, len}  ready for duel n (0: not ready), plank length (s) that player
     z/<pid>   {n, p, q} paused (p true) or resumed during duel n      that player
     go        {n, seed, len}  duel n starts: count down now            the host
     s         {n, d:<snapshot>}  the duel as the guest draws it        the host
     e         {n, q, k, side, place, round}  a moment worth a banner   the host
     fin       {n, d:<snapshot>}  duel n is over                        the host
     in        {n, a:0|1|2, vis}  the guest's move and face             the seated guest

   The creator hosts: their device runs the DuelMatch with both players' moves; the guest sends
   only its move (0 rest, 1 pull, 2 brace) and whether its face is in view, and draws the host's
   snapshots mirrored, so on both screens you are on the left. Snapshots use the app's
   DuelSnapshot shape. Duels are numbered: `go.n` counts up through the room's life, a ready
   names the duel it is for, and anything about an older duel is ignored.

   The relay is on Cloudflare's free plan, where every write is a stored row (about 100k a day
   for the whole arcade). So the room stays sparse: snapshots 4 times a second (and at once when
   the duel starts or stops waiting for a face), the guest's move only when it changes (at most
   about 8 times a second), events and control as they happen. The guest eases toward each
   snapshot and draws its own pose from its own input, so 4 Hz still looks smooth.

   Players have no names and send no pictures: nothing typed or filmed ever leaves a device. */

export const KIND = 'plank';
export const VERSION = 1;
export const ROOM_RE = /^[A-HJ-NP-Z2-9]{7}$/;
export const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const KEYS = {
  room: 'room', go: 'go', state: 's', event: 'e', finished: 'fin', input: 'in',
  join: pid => 'j/' + pid, ready: pid => 'r/' + pid, pause: pid => 'z/' + pid,
};
/** Milliseconds between the host's snapshots. */
export const STATE_INTERVAL = 250;
/** Milliseconds between the guest's move writes, at least. */
export const INPUT_INTERVAL = 120;
/** A friend missing from the room this long (ms) has left. */
export const AWAY_GRACE = 20000;
/** Where the relay lives when game/relay.json can't be read. Change both together. */
export const DEFAULT_RELAY = 'wss://lifegame-relay.houfuchen0702.workers.dev';
export const SITE = 'https://lifegameproject.com';
export const ACTIONS = ['rest', 'strike', 'block'];
/** The app's RemoteDuel numbering of duel events. */
export const EVENT_KINDS = ['windup', 'lunge', 'danger', 'fall', 'round', 'countered', 'blocked'];
const PLACES = ['river', 'volcano', 'fjord', 'pier', 'rooftops'];

const isInt = Number.isInteger;

function randomBytes(count, rng) {
  if (!rng && typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(count)));
  }
  return Array.from({ length: count }, () => Math.floor((typeof rng === 'function' ? rng() : Math.random()) * 256) & 255);
}

export function makeRoomCode(rng) {
  return randomBytes(7, rng).map(b => ROOM_CHARS[Math.min(ROOM_CHARS.length - 1, Math.floor(b / 256 * ROOM_CHARS.length))]).join('');
}

export function makePid(rng) {
  return randomBytes(16, rng).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** A typed code or a pasted invite link → the bare code (may still be invalid). */
export function normalizeRoomCode(raw) {
  const value = String(raw || '').trim();
  let candidate = value;
  try {
    const match = value.match(/[?&]room=([^&#\s]+)/i);
    if (match) candidate = decodeURIComponent(match[1]);
  } catch (error) {}
  return candidate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function roomLink(code, origin) {
  return (origin || SITE) + '/game/plank-duel.html?room=' + encodeURIComponent(code);
}

/** A relay address the page or the app may use: wss:// anywhere, ws:// only on this machine. */
export function acceptableRelay(url) {
  if (typeof url !== 'string') return false;
  return /^wss:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(url)
    || /^ws:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(url);
}

export function validRoom(room) {
  return !!room && room.kind === KIND && isInt(room.v) && room.v >= 1
    && typeof room.host === 'string' && PID_RE.test(room.host)
    && (room.guest == null || (typeof room.guest === 'string' && PID_RE.test(room.guest) && room.guest !== room.host));
}

const validN = n => isInt(n) && n >= 1;
const unit = x => typeof x === 'number' && Number.isFinite(x);

/** The app's DuelSnapshot, checked before anyone draws it. */
export function validSnapshot(d) {
  if (!d || !unit(d.elapsed) || !unit(d.line) || !Array.isArray(d.sides) || d.sides.length !== 2) return false;
  if (!isInt(d.round) || !isInt(d.place) || !unit(d.falling) || !unit(d.leftHeld) || typeof d.holding !== 'boolean') return false;
  if (d.loser != null && d.loser !== 0 && d.loser !== 1) return false;
  return d.sides.every(s => s && unit(s.stamina) && typeof s.striking === 'boolean' && typeof s.blocking === 'boolean'
    && typeof s.exhausted === 'boolean' && unit(s.staggered) && isInt(s.rounds));
}

export function actionCode(action) { return Math.max(0, ACTIONS.indexOf(action)); }
export function actionOf(code) { return ACTIONS[code] || 'rest'; }

/** A duel event as the room carries it (side in the host's numbering). */
export function eventRecord(n, q, event, round) {
  return { n, q, k: EVENT_KINDS.indexOf(event.kind), side: event.side || 0,
    place: event.place != null ? PLACES.indexOf(event.place) : -1, round };
}

/** A room event → the guest's own numbering (0 = you). */
export function guestEvent(record) {
  const kind = EVENT_KINDS[record.k];
  if (!kind) return null;
  const event = { kind, side: 1 - (record.side || 0) };
  if (isInt(record.place) && PLACES[record.place]) event.place = PLACES[record.place];
  return event;
}

/**
 * One device's side of a room: seating, presence, and the duel's hand-shakes. Transport-free:
 * feed it the relay's messages (opened, update, presence) and a clock (tick); it writes through
 * `write(key, value)`. Callbacks (on(name, fn)):
 *   role(role)           'host' or 'guest' once seated
 *   friend(here)         the friend joined (true) or left (false)
 *   start(seed, len)     both ready: count down (both devices)
 *   event(event, round)  guest: a banner-worthy moment, in the guest's numbering
 *   pause(paused)        the friend paused or resumed
 *   finished()           guest: the host's duel is over; the final snapshot is in `snapshot`
 *   problem(code)        notFound | full | taken | removed | hostLeft: this room can't be played
 *   change()             anything else changed
 */
export class PlankRoom {
  constructor({ code, pid, creating = false, app = 'web', write, now = () => Date.now(), random = Math.random }) {
    if (!ROOM_RE.test(code)) throw new Error('plank-room:code');
    if (!PID_RE.test(pid)) throw new Error('plank-room:pid');
    Object.assign(this, { code, pid, creating, app, write, now, random });
    this.map = {};
    this.live = new Set();
    this.everOpened = false;
    this.role = null;
    this.friend = null;
    this.friendHere = false;
    this.goneSince = 0;
    this.problem = null;
    // The duel.
    this.nextDuel = 1;
    this.playing = 0;
    this.finishedDuel = 0;
    this.localReady = false;
    this.peerReady = false;
    this.duration = 30;
    this.peerAction = 'rest';
    this.peerVisible = true;
    this.snapshot = null;
    this.lastStateAt = -Infinity;
    this.lastHolding = null;
    this.lastInput = null;
    this.lastInputAt = -Infinity;
    this.pendingInput = null;
    this.eventSeq = 0;
    this.pauseSeq = 0;
    this.handlers = {};
  }

  on(name, fn) { (this.handlers[name] ??= []).push(fn); return this; }
  emit(name, ...args) { for (const fn of this.handlers[name] || []) fn(...args); }

  get isHost() { return this.role === 'host'; }
  get isGuest() { return this.role === 'guest'; }
  get link() { return roomLink(this.code); }

  writeKey(key, value) {
    if (value == null) delete this.map[key]; else this.map[key] = JSON.parse(JSON.stringify(value));
    this.write(key, value == null ? null : value);
  }

  // MARK: The relay

  /** Connected (or reconnected): the whole room and who is in it. */
  opened(map, who) {
    if (this.problem) return;
    const first = !this.everOpened;
    this.everOpened = true;
    this.map = { ...(map || {}) };
    this.live = new Set(who || []);
    const room = validRoom(this.map.room) ? this.map.room : null;
    if (first) {
      const go = this.map.go;
      this.nextDuel = (go && validN(go.n) ? go.n : 0) + 1;
    }
    if (room && room.host === this.pid) {
      this.seat('host');
    } else if (this.creating && first && !room && !this.map.room) {
      this.writeKey(KEYS.room, { kind: KIND, v: VERSION, host: this.pid, guest: null });
      this.seat('host');
    } else if (this.creating && first) {
      return this.fail('taken');   // a code collision: someone else's room
    } else {
      if (!room) return this.fail('notFound');
      if (room.guest && room.guest !== this.pid && this.live.has(room.guest)) return this.fail('full');
      if (room.guest === this.pid) this.seat('guest');
    }
    const mine = this.map[KEYS.join(this.pid)];
    if (!mine || mine.v !== VERSION) this.writeKey(KEYS.join(this.pid), { v: VERSION, app: this.app, at: Date.now() });
    if (!first) {
      // Writes made while the connection was down never arrived: say them again.
      const ready = this.map[KEYS.ready(this.pid)];
      if (this.localReady && (!ready || ready.n !== this.nextDuel)) this.writeKey(KEYS.ready(this.pid), { n: this.nextDuel, len: this.duration });
      this.lastInput = null;
      this.lastStateAt = -Infinity;
    }
    this.reconcile();
    this.replay();
    this.emit('change');
  }

  /** A key changed (value null: deleted). Every update is echoed to its writer too. */
  update(key, value) {
    if (this.problem) return;
    const old = this.map[key];
    if (value == null) delete this.map[key]; else this.map[key] = value;
    if (this.owns(key)) return;
    if (key === KEYS.room) return this.roomChanged(old);
    if (key.startsWith('j/')) {
      if (this.friend && key === KEYS.join(this.friend) && value == null) return this.friendLeft();
      this.reconcile();
      return this.emit('change');
    }
    if (!this.friend) return;
    if (key === KEYS.ready(this.friend)) this.readyRecord(value);
    else if (key === KEYS.pause(this.friend)) this.pauseRecord(value);
    else if (this.isGuest) this.hostRecord(key, value);
    else if (this.isHost && key === KEYS.input) this.inputRecord(value);
    this.emit('change');
  }

  /** Who is connected. */
  presence(ids) {
    this.live = new Set(ids || []);
    if (this.problem) return;
    this.reconcile();
    this.emit('change');
  }

  /** Call a few times a second: notices a friend who is gone for good and sends a held-back move. */
  tick(now = this.now()) {
    if (this.problem) return;
    if (this.friend && this.goneSince && now - this.goneSince >= AWAY_GRACE) { this.friendLeft(); return; }
    if (this.pendingInput && now - this.lastInputAt >= INPUT_INTERVAL) this.sendInput(this.pendingInput, now);
  }

  owns(key) {
    if (key === KEYS.join(this.pid) || key === KEYS.ready(this.pid) || key === KEYS.pause(this.pid)) return true;
    if (this.isHost) return [KEYS.room, KEYS.go, KEYS.state, KEYS.event, KEYS.finished].includes(key);
    return this.isGuest && key === KEYS.input;
  }

  // MARK: Seating

  seat(role) {
    if (this.role === role) return;
    this.role = role;
    this.emit('role', role);
  }

  fail(code) {
    this.problem = code;
    this.setFriend(null);
    this.emit('problem', code);
  }

  roomChanged(old) {
    const room = validRoom(this.map.room) ? this.map.room : null;
    if (!room) { if (old) this.fail('notFound'); return; }
    if (room.guest === this.pid) this.seat('guest');
    else if (this.isGuest) return this.fail('removed');
    this.reconcile();
    this.emit('change');
  }

  /** Who the friend is, and whether they are here. The host also seats a newcomer in an empty place. */
  reconcile() {
    const room = validRoom(this.map.room) ? this.map.room : null;
    if (!room || !this.role) return this.setFriend(null);
    if (this.isGuest) return this.setFriend(this.map[KEYS.join(room.host)] ? room.host : null);
    let guest = room.guest && this.map[KEYS.join(room.guest)] ? room.guest : null;
    if (!guest) {
      // The earliest arrival who is connected and not the host.
      const waiting = Object.keys(this.map)
        .filter(k => k.startsWith('j/') && k !== KEYS.join(this.pid))
        .map(k => ({ pid: k.slice(2), at: Number(this.map[k] && this.map[k].at) || 0 }))
        .filter(j => PID_RE.test(j.pid) && this.live.has(j.pid))
        .sort((a, b) => a.at - b.at || (a.pid < b.pid ? -1 : 1));
      guest = waiting.length ? waiting[0].pid : null;
    }
    if ((room.guest || null) !== guest) this.writeKey(KEYS.room, { ...room, guest });
    this.setFriend(guest);
  }

  /** A friend counts as joined once seated and connected, and stays joined through short drop-outs
      until they leave or have been gone for AWAY_GRACE. */
  setFriend(pid) {
    if (pid !== this.friend) {
      if (this.friendActive) { this.friendActive = false; this.emit('friend', false); }
      this.resetDuel();
      this.friend = pid;
      this.goneSince = 0;
    }
    this.friendHere = !!pid && this.live.has(pid);
    if (!pid) return;
    if (this.friendHere) {
      this.goneSince = 0;
      if (!this.friendActive) { this.friendActive = true; this.emit('friend', true); }
    } else if (!this.goneSince) {
      this.goneSince = this.now();
    }
  }

  /** The friend deleted their join record or has been gone for good. A guest's room is over; a
      host's room waits for the next friend. */
  friendLeft() {
    const room = validRoom(this.map.room) ? this.map.room : null;
    this.setFriend(null);
    if (this.isGuest) return this.fail('hostLeft');
    if (room && room.guest) this.writeKey(KEYS.room, { ...room, guest: null });
    this.reconcile();
    this.emit('change');
  }

  resetDuel() {
    this.localReady = false; this.peerReady = false; this.snapshot = null;
    this.peerAction = 'rest'; this.peerVisible = true; this.lastInput = null; this.pendingInput = null;
  }

  // MARK: Receiving

  /** After a reconnect, what may have happened meanwhile. */
  replay() {
    if (!this.friend) return;
    this.readyRecord(this.map[KEYS.ready(this.friend)]);
    if (this.isGuest) {
      const go = this.map[KEYS.go];
      if (go && go.n > this.playing && go.n >= this.nextDuel && this.localReady) this.hostRecord(KEYS.go, go);
      for (const key of [KEYS.state, KEYS.finished]) {
        const v = this.map[key];
        if (v && v.n === this.playing && this.playing > this.finishedDuel) this.hostRecord(key, v);
      }
    } else {
      this.inputRecord(this.map[KEYS.input]);
    }
  }

  readyRecord(v) {
    const ready = !!v && v.n === this.nextDuel;
    if (ready === this.peerReady) return;
    this.peerReady = ready;
    if (!ready) return;
    if (this.isGuest && isInt(v.len) && v.len > 0) this.duration = v.len;
    this.startIfBothReady();
  }

  pauseRecord(v) {
    if (!v || v.n !== this.playing || typeof v.p !== 'boolean') return;
    this.emit('pause', v.p);
  }

  inputRecord(v) {
    if (!v || !isInt(v.a)) return;
    this.peerAction = actionOf(v.a);
    this.peerVisible = v.vis !== false;
  }

  hostRecord(key, v) {
    if (!v || !validN(v.n)) return;
    if (key === KEYS.go) {
      if (v.n < this.nextDuel || !isInt(v.len) || v.len <= 0) return;
      this.playing = v.n;
      this.nextDuel = v.n + 1;
      this.localReady = false; this.peerReady = false; this.snapshot = null;
      this.duration = v.len;
      this.emit('start', v.seed >>> 0, v.len);
      return;
    }
    if (v.n !== this.playing || v.n === this.finishedDuel) return;
    if (key === KEYS.state && validSnapshot(v.d)) this.snapshot = v.d;
    else if (key === KEYS.event) { const event = guestEvent(v); if (event) this.emit('event', event, v.round); }
    else if (key === KEYS.finished && validSnapshot(v.d)) { this.snapshot = v.d; this.finishedDuel = v.n; this.emit('finished'); }
  }

  // MARK: Both devices

  /** Set up and ready. When both are ready, the host starts the countdown on both. */
  setReady(duration) {
    this.localReady = true;
    this.duration = duration;
    this.writeKey(KEYS.ready(this.pid), { n: this.nextDuel, len: duration });
    this.startIfBothReady();
    this.emit('change');
  }

  /** Not ready after all (backed out of waiting). The Swift app keeps a friend ready until the start. */
  unready() {
    this.localReady = false;
    this.writeKey(KEYS.ready(this.pid), { n: 0, len: this.duration });
    this.emit('change');
  }

  sendPause(paused) {
    this.writeKey(KEYS.pause(this.pid), { n: this.playing, p: !!paused, q: ++this.pauseSeq });
  }

  /** After a duel, both set up again; a friend who is already ready stays ready. */
  resetForNextDuel() {
    this.localReady = false; this.snapshot = null; this.peerAction = 'rest'; this.peerVisible = true;
    this.emit('change');
  }

  leave() {
    this.writeKey(KEYS.join(this.pid), null);
    this.problem = this.problem || 'left';
  }

  startIfBothReady() {
    if (!this.isHost || !this.localReady || !this.peerReady) return;
    const seed = Math.floor(this.random() * 4294967296) >>> 0;
    const n = this.nextDuel;
    this.writeKey(KEYS.go, { n, seed, len: this.duration });
    this.playing = n;
    this.nextDuel = n + 1;
    this.localReady = false; this.peerReady = false;
    this.lastHolding = null;
    this.emit('start', seed, this.duration);
  }

  // MARK: Host

  /** Every frame: the duel as the guest should draw it (written 4 times a second). */
  hostTick(match, holding, now = this.now()) {
    if (!this.isHost || !this.playing) return;
    if (now - this.lastStateAt < STATE_INTERVAL && holding === this.lastHolding) return;
    this.lastStateAt = now;
    this.lastHolding = holding;
    this.writeKey(KEYS.state, { n: this.playing, d: match.snapshot(holding) });
  }

  sendEvent(event, round) {
    if (!this.isHost || !this.playing || EVENT_KINDS.indexOf(event.kind) < 0) return;
    this.writeKey(KEYS.event, eventRecord(this.playing, ++this.eventSeq, event, round));
  }

  finish(match) {
    if (!this.isHost || !this.playing) return;
    this.writeKey(KEYS.finished, { n: this.playing, d: match.snapshot(false) });
    this.lastHolding = null;
  }

  // MARK: Guest

  /** Every frame: the guest's move and face; written when it changes, at most every INPUT_INTERVAL. */
  guestTick(action, visible, now = this.now()) {
    if (!this.isGuest) return;
    const next = { n: this.playing, a: actionCode(action), vis: !!visible };
    const last = this.pendingInput || this.lastInput;
    if (last && last.a === next.a && last.vis === next.vis && last.n === next.n) return;
    if (now - this.lastInputAt < INPUT_INTERVAL) { this.pendingInput = next; return; }
    this.sendInput(next, now);
  }

  sendInput(record, now) {
    this.pendingInput = null;
    this.lastInput = record;
    this.lastInputAt = now;
    this.writeKey(KEYS.input, record);
  }
}
