/* Plank Plank Plank!, the duel from the Plank Constant iOS app (PlankPilot/Engine/DuelEngine.swift),
   ported line for line so a browser can host a duel with an app, or with another browser. The
   Swift ParityTests replay matches recorded from this file and must agree exactly.

   Two sides plank head to head on a plank over the water and hold a line between them. Shift
   your head right and hold to PULL (harder the longer you hold, draining stamina), or left to
   BRACE (the line barely moves toward you, but you gain nothing and slowly tire). Whoever is
   dragged over their edge falls in and loses the round; the line resets at a new place, with a
   new kit. The plank timer never ends early. Solo, a CPU rival pulls at moments and strengths
   you can't predict; online, the host's page runs this for both players. */

export const DUEL_ACTIONS = ['rest', 'strike', 'block'];
export const DUEL_KITS = ['sword', 'gloves', 'hammer', 'pan', 'pillow'];
export const KIT_NAMES = {
  sword: ['SWORD & SHIELD', '剑与盾'], gloves: ['BOXING GLOVES', '拳击手套'], hammer: ['HAMMERS', '大锤'],
  pan: ['FRYING PANS', '平底锅'], pillow: ['PILLOW FIGHT', '枕头大战'],
};
export const DUEL_PLACES = ['river', 'volcano', 'fjord', 'pier', 'rooftops'];
export const PLACE_NAMES = {
  river: ['MOUNTAIN RIVER', '山间溪流'], volcano: ['VOLCANO', '火山'], fjord: ['ICE FJORD', '冰峡湾'],
  pier: ['SUNSET PIER', '日落码头'], rooftops: ['ROOFTOPS', '屋顶'],
};
export const RIVALS = { river: 'GOAT', volcano: 'GOLEM', fjord: 'YETI', pier: 'CRAB', rooftops: 'ROBOT' };
/** The order the Swift app numbers duel events in (RemoteDuel.kinds); the room protocol sends these codes. */
export const EVENT_KINDS = ['windup', 'lunge', 'danger', 'fall', 'round', 'countered', 'blocked'];

/** A new kit each round, so a long plank keeps changing. */
export const kitForRound = round => DUEL_KITS[Math.max(0, round - 1) % DUEL_KITS.length];

/** Same generator as the app's LCG: state = 1664525 * state + 1013904223 (mod 2^32). */
export class LCG {
  constructor(seed) { this.state = seed >>> 0; }
  next() {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

function newSide() {
  return { stamina: 1, grip: 0, striking: false, blocking: false, exhausted: false,
    staggeredUntil: -Infinity, rounds: 0, force: DuelMatch.IDLE };
}

export class DuelMatch {
  /** Force while just holding on; a full pull adds 0.8. */
  static IDLE = 0.3;
  static DRAIN = 0.22;
  static REGEN = 0.25;
  static ROPE_SPEED = 0.5;
  static FALL_TIME = 1.6;
  /** Bracing tires you slowly, and lets only this share of a pull toward you through. */
  static BLOCK_DRAIN = 0.09;
  static BLOCK_LEAK = 0.25;
  static STAGGER_TIME = 1.3;
  /** Stamina an exhausted side needs back before it can pull again. */
  static RECOVERED = 0.4;
  /** The CPU's steady tension between moves. */
  static CPU_HOLD = 0.5;

  /**
   * duration: seconds; versusCPU: side 1 is the computer; seed: uint32; twoMoves: pull and brace
   * as separate moves (false: one input that only pulls); windupTime: how long the rival's
   * wind-up shows before a big hit.
   */
  constructor({ duration, versusCPU = false, seed = 0, twoMoves = true, windupTime = 0.45 }) {
    this.duration = duration;
    this.versusCPU = versusCPU;
    this.twoMoves = twoMoves;
    this.windupTime = windupTime;
    this.random = new LCG(seed);
    this.elapsed = 0;
    /** −1 … 1. Positive drags the left side toward its edge; ±1 is over the edge. */
    this.line = 0;
    this.sides = [newSide(), newSide()];
    this.round = 1;
    this.place = DUEL_PLACES[(seed >>> 0) % DUEL_PLACES.length];
    /** null while fighting; { loser, since } while someone falls in. */
    this.falling = null;
    /** The CPU's current move: hold | breather | windup | jab | lunge | press. */
    this.move = 'hold';
    this.windupUntil = -Infinity;
    /** Seconds the line spent on the left side's half. */
    this.leftHeld = 0;
    this.velocity = 0;
    this.moveUntil = 1.5;
    this.cpuTarget = DuelMatch.IDLE;
    this.feint = false;
    this.dangerArmed = [true, true];
    this.lungeBlocked = false;
  }

  get done() { return this.elapsed >= this.duration; }
  /** The CPU is winding up (a real yank or a fake: from the outside they look the same). */
  get cpuWindingUp() { return this.versusCPU && this.move === 'windup'; }
  /** 0 … 1, how taut the line is. */
  get tension() { return Math.min(1, (this.sides[0].force + this.sides[1].force - 2 * DuelMatch.IDLE) / 1.2 + 0.25); }
  /** −1 left ahead, 0 even, 1 right ahead: rounds first, then the line's position. */
  get leader() {
    const [a, b] = this.sides;
    if (a.rounds !== b.rounds) return a.rounds > b.rounds ? -1 : 1;
    return Math.abs(this.line) < 0.05 ? 0 : this.line < 0 ? -1 : 1;
  }

  /** actions[i]: 'rest' | 'strike' | 'block' for side i (the CPU side's entry is ignored). Returns events. */
  advance(dt, actions) {
    if (this.done || !Number.isFinite(dt) || !(dt > 0)) return [];
    const step = Math.min(dt, this.duration - this.elapsed);
    this.elapsed += step;
    const events = [];
    if (this.falling) {
      if (this.elapsed - this.falling.since >= DuelMatch.FALL_TIME) this.nextRound(events);
      return events;
    }
    for (let i = 0; i < 2; i++) {
      if (this.versusCPU && i === 1) {
        this.sides[1].force = this.cpuForce(events);
        this.sides[1].striking = this.sides[1].force > DuelMatch.IDLE + 0.1;
        continue;
      }
      const side = this.sides[i];
      const staggered = this.elapsed < side.staggeredUntil;
      const action = i < actions.length && !side.exhausted && !staggered ? actions[i] : 'rest';
      side.striking = action === 'strike';
      side.blocking = action === 'block' && this.twoMoves;
      side.grip = side.striking ? Math.min(1, Math.max(0.35, side.grip) + step * 2) : Math.max(0, side.grip - step * 4);
      if (side.striking || side.blocking) {
        side.stamina = Math.max(0, side.stamina - (side.striking ? DuelMatch.DRAIN : DuelMatch.BLOCK_DRAIN) * step);
        if (side.stamina === 0) { side.exhausted = true; side.striking = false; side.blocking = false; }
      } else {
        side.stamina = Math.min(1, side.stamina + DuelMatch.REGEN * step);
        if (side.exhausted && side.stamina >= DuelMatch.RECOVERED) side.exhausted = false;
      }
      // Gassed or stumbling arms barely hold on: that's how you get dragged in.
      side.force = side.exhausted || staggered ? DuelMatch.IDLE * 0.4
        : side.blocking ? DuelMatch.IDLE + 0.15 : DuelMatch.IDLE + side.grip * 0.8;
    }
    if (this.versusCPU && this.move === 'lunge' && this.sides[0].blocking && !this.lungeBlocked) {
      this.lungeBlocked = true;
      events.push({ kind: 'blocked', side: 0 });
    }
    let target = (this.sides[1].force - this.sides[0].force) * DuelMatch.ROPE_SPEED;
    // A braced side only lets a little of a pull toward it through.
    if ((target > 0 && this.sides[0].blocking) || (target < 0 && this.sides[1].blocking)) target *= DuelMatch.BLOCK_LEAK;
    // Stumbling forward, a side gets dragged faster.
    if ((target > 0 && this.elapsed < this.sides[0].staggeredUntil) || (target < 0 && this.elapsed < this.sides[1].staggeredUntil)) target *= 1.35;
    this.velocity += (target - this.velocity) * Math.min(1, step * 6);
    this.line += this.velocity * step;
    if (this.line <= 0) this.leftHeld += step;
    for (let side = 0; side < 2; side++) {
      const toward = side === 0 ? this.line : -this.line;
      if (toward > 0.7 && this.dangerArmed[side]) { this.dangerArmed[side] = false; events.push({ kind: 'danger', side }); }
      else if (toward < 0.5) this.dangerArmed[side] = true;
    }
    if (Math.abs(this.line) >= 1) {
      const loser = this.line > 0 ? 0 : 1;
      this.line = this.line > 0 ? 1 : -1;
      this.velocity = 0;
      this.sides[1 - loser].rounds += 1;
      this.falling = { loser, since: this.elapsed };
      events.push({ kind: 'fall', side: loser });
    }
    return events;
  }

  nextRound(events) {
    this.round += 1;
    this.place = DUEL_PLACES[(DUEL_PLACES.indexOf(this.place) + 1) % DUEL_PLACES.length];
    this.line = 0; this.velocity = 0;
    for (const side of this.sides) {
      side.stamina = 1; side.grip = 0; side.exhausted = false; side.striking = false;
      side.blocking = false; side.staggeredUntil = -Infinity;
      side.force = DuelMatch.IDLE;
    }
    this.falling = null;
    this.dangerArmed = [true, true];
    this.move = 'hold'; this.moveUntil = this.elapsed + 1.2 + this.random.next(); this.windupUntil = -Infinity;
    events.push({ kind: 'round', side: 0, place: this.place });
  }

  cpuForce(events) {
    const intensity = Math.min(1, this.elapsed / Math.max(30, this.duration) + (this.round - 1) * 0.06);
    if (this.elapsed >= this.moveUntil) this.nextMove(intensity, events);
    const brace = Math.max(0, -this.line - 0.5) * 0.4;
    let force;
    switch (this.move) {
      case 'hold': force = DuelMatch.CPU_HOLD; break;
      case 'breather': force = 0.25; break;
      case 'windup': force = DuelMatch.CPU_HOLD - 0.08; break;
      default: force = this.cpuTarget;
    }
    return force + brace;
  }

  nextMove(intensity, events) {
    switch (this.move) {
      case 'windup':
        if (this.feint) this.hold(intensity); else this.lunge(intensity, events);
        return;
      case 'lunge': case 'press': {
        // Hard work sometimes needs a breather, and a yank you blocked almost always does.
        const blocked = this.move === 'lunge' && this.lungeBlocked;
        if (this.random.next() < (blocked ? 0.85 : 0.45)) {
          this.move = 'breather'; this.moveUntil = this.elapsed + (blocked ? 1.6 : 1) + 1.2 * this.random.next();
        } else {
          this.hold(intensity);
        }
        return;
      }
      case 'jab': case 'breather':
        this.hold(intensity);
        return;
    }
    const roll = this.random.next();
    const desperate = this.line < -0.5;
    if (roll < 0.32 + intensity * 0.15 || (desperate && roll < 0.6)) {
      if (this.random.next() < 0.7) {
        this.move = 'windup'; this.feint = false;
        this.moveUntil = this.elapsed + this.windupTime; this.windupUntil = this.moveUntil;
        events.push({ kind: 'windup', side: 0 });
      } else {
        this.lunge(intensity, events);
      }
    } else if (roll < 0.55) {
      this.move = 'jab'; this.cpuTarget = 0.75 + 0.15 * this.random.next(); this.moveUntil = this.elapsed + 0.4 + 0.6 * this.random.next();
    } else if (roll < 0.75) {
      this.move = 'press'; this.cpuTarget = 0.7 + 0.12 * this.random.next(); this.moveUntil = this.elapsed + 1.8 + 2 * this.random.next();
    } else if (roll < 0.87) {
      // A fake: the same wind-up, then nothing.
      this.move = 'windup'; this.feint = true;
      this.moveUntil = this.elapsed + this.windupTime; this.windupUntil = this.moveUntil;
      events.push({ kind: 'windup', side: 0 });
    } else {
      this.move = 'breather'; this.moveUntil = this.elapsed + 0.8 + 1.2 * this.random.next();
    }
  }

  lunge(intensity, events) {
    this.move = 'lunge';
    this.cpuTarget = 1.25 + 0.35 * this.random.next() + 0.15 * intensity;
    this.moveUntil = this.elapsed + 0.7 + 0.8 * this.random.next();
    this.lungeBlocked = false;
    events.push({ kind: 'lunge', side: 0 });
    // Caught striking when the yank lands: off balance.
    if (this.twoMoves && this.sides[0].striking) {
      this.sides[0].staggeredUntil = this.elapsed + DuelMatch.STAGGER_TIME;
      this.sides[0].grip = 0; this.sides[0].striking = false;
      events.push({ kind: 'countered', side: 0 });
    }
  }

  hold(intensity) {
    this.move = 'hold'; this.feint = false;
    this.moveUntil = this.elapsed + (0.9 + 2 * this.random.next()) * (1 - 0.4 * intensity);
  }

  /**
   * What a host sends its guest: everything the scene and the HUD draw, in the app's DuelSnapshot
   * shape (Swift Codable: `loser` is left out while fighting). Times are relative.
   */
  snapshot(holding) {
    const out = {
      elapsed: this.elapsed, line: this.line,
      sides: this.sides.map(s => ({ stamina: s.stamina, striking: s.striking, blocking: s.blocking,
        exhausted: s.exhausted, staggered: Math.max(0, s.staggeredUntil - this.elapsed), rounds: s.rounds })),
      round: this.round, place: DUEL_PLACES.indexOf(this.place), falling: 0, leftHeld: this.leftHeld, holding: !!holding,
    };
    if (this.falling) { out.loser = this.falling.loser; out.falling = this.elapsed - this.falling.since; }
    return out;
  }

  /** The guest's view of the host's duel. mirrored: the guest is the host's side 1 but sees itself on the left. */
  show(snapshot, mirrored) {
    this.elapsed = snapshot.elapsed;
    this.line = mirrored ? -snapshot.line : snapshot.line;
    const order = mirrored ? [1, 0] : [0, 1];
    order.forEach((theirs, mine) => {
      const side = snapshot.sides[theirs];
      if (!side) return;
      const s = this.sides[mine];
      s.stamina = side.stamina;
      s.striking = side.striking;
      s.blocking = side.blocking;
      s.exhausted = side.exhausted;
      s.staggeredUntil = snapshot.elapsed + side.staggered;
      s.rounds = side.rounds;
    });
    this.round = snapshot.round;
    this.place = DUEL_PLACES[snapshot.place] ?? 'river';
    if (snapshot.loser != null) {
      this.falling = { loser: mirrored ? 1 - snapshot.loser : snapshot.loser, since: snapshot.elapsed - snapshot.falling };
    } else {
      this.falling = null;
    }
    this.leftHeld = mirrored ? Math.max(0, snapshot.elapsed - snapshot.leftHeld) : snapshot.leftHeld;
  }
}
