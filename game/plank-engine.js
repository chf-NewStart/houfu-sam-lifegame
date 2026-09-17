// Every pickup changes the face immediately; effects last until the next pickup.
export const FACE_FILTERS = [
  { id: 'frog', en: 'FROG BOSS', zh: '青蛙老大' },
  { id: 'shades', en: 'DEAL WITH IT', zh: '墨镜大佬' },
  { id: 'moustache', en: 'VERY SERIOUS', zh: '胡子绅士' },
  { id: 'googly', en: 'ABSOLUTELY FOCUSED', zh: '瞪眼专家' },
  { id: 'clown', en: 'HONK HONK', zh: '小丑鼻子' },
  { id: 'crown', en: 'PLANK ROYALTY', zh: '平板国王' },
];

// Pure game rules. The app advances time only while tracking/input is usable.
export class Flight {
  constructor(duration = 30, random = Math.random) {
    this.duration = duration;
    this.random = random;
    this.elapsed = 0;
    this.lane = 0;
    this.pickups = 0;
    this.activeFilter = null;
    this.filterChangedAt = -Infinity;
    this.maxHealth = 3;
    this.health = this.maxHealth;
    this.cleared = 0;
    this.hits = 0;
    this.streak = 0;
    this.gates = [];
    this.nextGate = 0.8;
    this.serial = 0;
    this.done = false;
  }
  get score() { return this.pickups; }
  steer(lane) { if (!this.done) this.lane = lane === 1 ? 1 : 0; }
  advance(seconds) {
    if (this.done || !Number.isFinite(seconds) || seconds <= 0) return [];
    let end = Math.min(this.duration, this.elapsed + seconds);
    const events = [];
    while (this.nextGate <= end && this.nextGate + 3.2 < this.duration) {
      const lane = this.random() < .5 ? 0 : 1;
      this.gates.push({ id: this.serial++, lane, pickupLane: 1 - lane, surprise: this.random(),
        born: this.nextGate, arrival: this.nextGate + 3.2, resolved: false });
      this.nextGate += 2.1;
    }
    // Chronological resolution keeps health and rewards independent of frame rate.
    for (const gate of this.gates) {
      if (!gate.resolved && gate.arrival <= end) {
        gate.resolved = true;
        if (gate.lane === this.lane) {
          this.hits++; this.streak = 0; this.health--;
          events.push({ type: 'hit', gate });
          if (this.health === 0) { end = gate.arrival; break; }
        } else {
          this.cleared++; this.streak++; this.pickups++;
          const options = FACE_FILTERS.filter(filter => filter.id !== this.activeFilter);
          this.activeFilter = options[Math.min(options.length - 1, Math.floor(gate.surprise * options.length))].id;
          this.filterChangedAt = gate.arrival;
          events.push({ type: 'clear', gate, filter: this.activeFilter });
        }
      }
    }
    this.elapsed = end;
    this.gates = this.gates.filter(g => g.born <= end && end < g.arrival + .65);
    this.done = this.health === 0 || end >= this.duration;
    return events;
  }
}

// One switch per eyebrow raise. A sustained expression cannot repeat the action.
export class BrowSwitch {
  constructor(neutral = .05, raised = .55) {
    this.low = neutral + (raised - neutral) * .3;
    this.high = neutral + (raised - neutral) * .65;
    this.reset();
  }
  reset() { this.armed = false; this.since = null; }
  update(value, now) {
    if (!Number.isFinite(value) || !Number.isFinite(now)) { this.reset(); return false; }
    if (value < this.low) { this.armed = true; this.since = null; }
    if (!this.armed || value < this.high) { this.since = null; return false; }
    if (this.since === null) this.since = now;
    if (now - this.since < 110) return false;
    this.armed = false; this.since = null;
    return true;
  }
}

// Independent hearts and face filters, shared clock/pattern. An out-of-hearts pilot
// spectates while their buddy finishes; the round ends when both are out.
export class CoopFlight {
  constructor(duration = 30, seed = Math.floor(Math.random() * 0xffffffff)) {
    const random = () => {
      let state = seed >>> 0;
      return () => {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    };
    this.duration = duration;
    this.games = [new Flight(duration, random()), new Flight(duration, random())];
    this.clearedIds = [new Set(), new Set()];
    this.togetherIds = new Set();
    this.elapsed = 0;
  }
  get done() { return this.games.every(game => game.done); }
  get health() { return this.games.reduce((total, game) => total + game.health, 0); }
  get pickups() { return this.games[0].pickups + this.games[1].pickups; }
  get score() { return this.pickups; }
  get cleared() { return this.games[0].cleared + this.games[1].cleared; }
  get hits() { return this.games[0].hits + this.games[1].hits; }
  get togetherCount() { return this.togetherIds.size; }
  steer(lane, player = 0) { this.games[player === 1 ? 1 : 0].steer(lane); }
  advance(dt) {
    if (this.done || !Number.isFinite(dt) || dt <= 0) return [];
    const end = Math.min(this.duration, this.elapsed + dt), events = [];
    // Split at arrivals so a large advance stops at the same fatal hit as small
    // advances, even when one pilot has already become a spectator.
    while (this.elapsed < end && !this.done) {
      let next = end;
      for (const game of this.games.filter(game => !game.done)) {
        for (const gate of game.gates) if (!gate.resolved && gate.arrival > this.elapsed) next = Math.min(next, gate.arrival);
        if (game.nextGate + 3.2 > this.elapsed && game.nextGate + 3.2 < this.duration) next = Math.min(next, game.nextGate + 3.2);
      }
      const seconds = next - this.elapsed;
      for (const [player, game] of this.games.entries()) events.push(...game.advance(seconds).map(event => ({ ...event, player })));
      this.elapsed = next;
      for (const game of this.games) game.elapsed = next;
    }
    for (const event of events) {
      if (event.type !== 'clear') continue;
      this.clearedIds[event.player].add(event.gate.id);
      if (this.clearedIds[1 - event.player].has(event.gate.id) && !this.togetherIds.has(event.gate.id)) {
        this.togetherIds.add(event.gate.id);
        event.together = true;
      }
    }
    return events;
  }
}
