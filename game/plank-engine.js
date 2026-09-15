// Pure game rules; seconds advance only when the UI calls advance during flight.
export class Flight {
  constructor(duration = 30, random = Math.random) {
    this.duration = duration;
    this.random = random;
    this.elapsed = 0;
    this.lane = 0;
    this.score = 0;
    this.cleared = 0;
    this.hits = 0;
    this.streak = 0;
    this.gates = [];
    this.nextGate = 0.8;
    this.serial = 0;
    this.done = false;
  }
  steer(lane) { this.lane = lane === 1 ? 1 : 0; }
  advance(seconds) {
    if (this.done || !Number.isFinite(seconds) || seconds <= 0) return [];
    const end = Math.min(this.duration, this.elapsed + seconds);
    const events = [];
    // Resolve chronologically so results are independent of render frame rate.
    while (this.nextGate <= end && this.nextGate + 3.2 < this.duration) {
      this.gates.push({ id: this.serial++, lane: this.random() < .5 ? 0 : 1,
        born: this.nextGate, arrival: this.nextGate + 3.2, resolved: false });
      this.nextGate += 2.1;
    }
    for (const gate of this.gates) {
      if (!gate.resolved && gate.arrival <= end) {
        gate.resolved = true;
        if (gate.lane === this.lane) {
          this.hits++; this.streak = 0; this.score = Math.max(0, this.score - 25);
          events.push({ type: 'hit', gate });
        } else {
          this.cleared++; this.streak++; this.score += 50 + Math.min(5, this.streak - 1) * 10;
          events.push({ type: 'clear', gate });
        }
      }
    }
    this.elapsed = end;
    this.gates = this.gates.filter(g => end < g.arrival + .65);
    this.done = end >= this.duration;
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

// Local co-op uses one clock and the same obstacle sequence on both halves.
// Each player still earns (or loses) their own points. Clearing a gate together
// adds a team bonus exactly once, even across pauses or different frame rates.
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
  }
  get elapsed() { return this.games[0].elapsed; }
  get done() { return this.games.every(game => game.done); }
  get score() { return this.games[0].score + this.games[1].score + this.teamBonus; }
  get cleared() { return this.games[0].cleared + this.games[1].cleared; }
  get hits() { return this.games[0].hits + this.games[1].hits; }
  get teamBonus() { return this.togetherIds.size * 25; }
  steer(lane, player = 0) { this.games[player === 1 ? 1 : 0].steer(lane); }
  advance(dt) {
    const events = this.games.flatMap((game, player) =>
      game.advance(dt).map(event => ({ ...event, player })));
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
