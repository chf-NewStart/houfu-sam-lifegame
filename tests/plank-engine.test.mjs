import test from 'node:test';
import assert from 'node:assert/strict';
import { Flight, BrowSwitch, CoopFlight, FACE_FILTERS } from '../game/plank-engine.js';

for (const duration of [30, 45, 60, 90]) {
  test(`${duration}-second round finishes at its target, including after a delayed frame`, () => {
    const flight = new Flight(duration, () => 0);
    flight.steer(1);
    flight.advance(duration - 0.25);
    assert.equal(flight.done, false);
    assert.equal(flight.elapsed, duration - 0.25);
    flight.advance(5);
    assert.equal(flight.done, true);
    assert.equal(flight.elapsed, duration);
    const finalState = JSON.stringify(flight);
    assert.deepEqual(flight.advance(100), []);
    assert.equal(JSON.stringify(flight), finalState);
  });

  test(`${duration}-second round gives every obstacle its full approach before the target`, () => {
    const flight = new Flight(duration, () => 0);
    flight.steer(1);
    const obstacles = new Map();
    while (!flight.done) {
      flight.advance(0.25);
      for (const gate of flight.gates) obstacles.set(gate.id, { ...gate });
    }
    assert.ok(obstacles.size > 0);
    for (const gate of obstacles.values()) {
      assert.ok(gate.arrival < duration, 'no gate should arrive at or after the finish');
      assert.ok(Math.abs(gate.arrival - gate.born - 3.2) < 1e-10,
        'late gates must not have shortened approach time');
    }
    assert.equal(flight.hits + flight.cleared, obstacles.size,
      'every spawned gate should be resolved by the end');
  });
}

test('obstacles resolve once, using the lane occupied when they arrive', () => {
  const flight = new Flight(30, () => 0); // Every obstacle blocks the left lane.
  flight.steer(1);
  assert.deepEqual(flight.advance(3), []);
  assert.equal(flight.score, 0);
  flight.steer(0); // Moving after spawning but before arrival must affect the result.
  assert.deepEqual(flight.advance(1).map(event => event.type), ['hit']);
  assert.equal(flight.hits, 1);
  assert.equal(flight.score, 0);
  assert.deepEqual(flight.advance(0.1), []);
  assert.equal(flight.hits, 1, 'a resolved obstacle cannot hit twice');
  flight.steer(1);
  assert.deepEqual(flight.advance(2.1).map(event => event.type), ['clear']);
  assert.equal(flight.cleared, 1);
  assert.equal(flight.pickups, 1);
});

test('obstacles cost hearts, preserve earned pickups, and the third hit ends the round', () => {
  const flight = new Flight(30, () => 0);
  flight.steer(1); flight.advance(4);
  assert.equal(flight.pickups, 1); assert.equal(flight.health, 3);
  flight.steer(0); flight.advance(2.11);
  assert.equal(flight.health, 2); assert.equal(flight.pickups, 1);
  flight.advance(2.1); assert.equal(flight.health, 1);
  flight.advance(100);
  assert.equal(flight.health, 0); assert.equal(flight.hits, 3);
  assert.equal(flight.pickups, 1); assert.equal(flight.done, true);
  assert.ok(Math.abs(flight.elapsed - 10.3) < 1e-8, 'ends at the fatal collision');
  const snapshot = JSON.stringify(flight);
  assert.deepEqual(flight.advance(100), []);
  assert.equal(JSON.stringify(flight), snapshot);
});

test('each visible safe-lane pickup is collected exactly once', () => {
  const flight = new Flight(90, () => 0);
  flight.steer(1);
  while (!flight.done) {
    const previous = flight.pickups;
    const events = flight.advance(.25);
    assert.equal(flight.pickups - previous, events.filter(e => e.type === 'clear').length);
    for (const gate of flight.gates) assert.equal(gate.pickupLane, 1 - gate.lane);
  }
  assert.equal(flight.health, 3);
  assert.equal(flight.pickups, flight.cleared);
});

test('a long frame and short frames produce the same flight outcome', () => {
  const createFlight = () => {
    let n = 0;
    const flight = new Flight(45, () => (n++ % 3 === 0 ? 0.1 : 0.9));
    flight.steer(1);
    return flight;
  };
  const whole = createFlight();
  const stepped = createFlight();
  const wholeEvents = whole.advance(45).map(({ type, gate }) => [type, gate.id]);
  const stepEvents = [];
  for (let frame = 0; frame < 180; frame++) {
    stepEvents.push(...stepped.advance(0.25).map(({ type, gate }) => [type, gate.id]));
  }
  assert.deepEqual(stepEvents, wholeEvents);
  for (const key of ['elapsed', 'score', 'hits', 'cleared', 'streak', 'done', 'activeFilter', 'filterChangedAt']) {
    assert.equal(stepped[key], whole[key], `${key} should not depend on frame size`);
  }
});

test('time does not progress through steering, eyebrow input, or invalid advance requests', async () => {
  const flight = new Flight(30, () => 0);
  flight.advance(5);
  const before = { elapsed: flight.elapsed, score: flight.score, hits: flight.hits };
  const brows = new BrowSwitch();
  brows.update(0.05, 0);
  flight.steer(1);
  brows.update(0.7, 20);
  brows.update(0.7, 150);
  for (const seconds of [0, -1, NaN, Infinity, -Infinity]) {
    assert.deepEqual(flight.advance(seconds), []);
  }
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual({ elapsed: flight.elapsed, score: flight.score, hits: flight.hits }, before);
  flight.advance(1);
  assert.equal(flight.elapsed, 6);
});

test('eyebrows must first return neutral, then hold a raise long enough to switch', () => {
  const brows = new BrowSwitch();
  assert.equal(brows.update(0.7, 0), false);
  assert.equal(brows.update(0.7, 1000), false, 'starting raised cannot trigger');
  assert.equal(brows.update(0.05, 1010), false);
  assert.equal(brows.update(0.7, 1020), false);
  assert.equal(brows.update(0.7, 1129), false);
  assert.equal(brows.update(0.7, 1130), true);
  assert.equal(brows.update(0.7, 2000), false);
  assert.equal(brows.update(0.7, 5000), false, 'holding a raise must not repeat');
  assert.equal(brows.update(0.3, 5100), false);
  assert.equal(brows.update(0.7, 5200), false);
  assert.equal(brows.update(0.7, 5400), false, 'partial lowering does not rearm');
  assert.equal(brows.update(0.05, 5500), false);
  assert.equal(brows.update(0.7, 5600), false);
  assert.equal(brows.update(0.7, 5710), true, 'a fresh neutral-to-raise gesture switches again');
});

test('brief eyebrow spikes do not accumulate into a switch', () => {
  const brows = new BrowSwitch();
  brows.update(0.05, 0);
  assert.equal(brows.update(0.7, 10), false);
  assert.equal(brows.update(0.7, 100), false);
  assert.equal(brows.update(0.3, 105), false);
  assert.equal(brows.update(0.7, 110), false);
  assert.equal(brows.update(0.7, 200), false);
  assert.equal(brows.update(0.7, 220), true);
});

test('resetting eyebrow control discards a pending gesture and requires a fresh neutral', () => {
  const brows = new BrowSwitch(0.2, 0.8);
  brows.update(0.2, 0);
  brows.update(0.8, 10);
  brows.reset();
  assert.equal(brows.update(0.8, 1000), false);
  brows.update(0.2, 1010);
  brows.update(0.8, 1020);
  assert.equal(brows.update(0.8, 1130), true);
});

test('co-op clocks and gate patterns remain synchronized through the full selected duration', () => {
  for (const duration of [30, 45, 60, 90]) {
    const flight = new CoopFlight(duration, 12345);
    for (let frame = 0; !flight.done; frame++) {
      for (const [i, game] of flight.games.entries()) {
        const next = game.gates.find(gate => !gate.resolved);
        if (next) flight.steer(1-next.lane, i);
      }
      flight.advance(frame % 3 === 0 ? .4 : .25);
      assert.equal(flight.games[0].elapsed, flight.games[1].elapsed);
      assert.deepEqual(flight.games[0].gates, flight.games[1].gates);
    }
    assert.equal(flight.elapsed, duration);
    assert.ok(flight.games.every(game => game.done && game.elapsed === duration));
  }
});

test('co-op steering and collisions are independent for each player', () => {
  const flight = new CoopFlight(30, 12345);
  flight.advance(.8);
  const blockedLane = flight.games[0].gates[0].lane;
  flight.steer(blockedLane, 0); flight.steer(1 - blockedLane, 1);
  assert.deepEqual(flight.games.map(game => game.lane), [blockedLane, 1 - blockedLane]);
  const events = flight.advance(3.2);
  assert.deepEqual(events.map(({type, player}) => [type, player]), [['hit', 0], ['clear', 1]]);
  assert.deepEqual(flight.games.map(game => [game.hits, game.cleared, game.score]), [[1, 0, 0], [0, 1, 1]]);
  assert.equal(flight.togetherCount, 0);
  assert.equal(flight.pickups, 1);
});

test('clearing the same gate together changes both faces and counts the shared pickup once', () => {
  const flight = new CoopFlight(30, 12345);
  flight.advance(.8);
  const safeLane = 1 - flight.games[0].gates[0].lane;
  flight.steer(safeLane, 0); flight.steer(safeLane, 1);
  const events = flight.advance(3.2);
  assert.equal(events.filter(event => event.together).length, 1);
  assert.equal(flight.togetherCount, 1);
  assert.equal(flight.pickups, 2);
  assert.equal(flight.cleared, 2);
  assert.deepEqual(flight.advance(.1), []);
  assert.equal(flight.togetherCount, 1);
  assert.equal(flight.pickups, 2);
});

test('co-op steering while paused and invalid frame deltas do not advance either flight', () => {
  const flight = new CoopFlight(30, 12345);
  flight.advance(5);
  const before = flight.games.map(({elapsed, score, hits, cleared}) => ({elapsed, score, hits, cleared}));
  flight.steer(1, 0); flight.steer(0, 1);
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) assert.deepEqual(flight.advance(dt), []);
  assert.deepEqual(flight.games.map(({elapsed, score, hits, cleared}) => ({elapsed, score, hits, cleared})), before);
  flight.advance(100);
  assert.equal(flight.games[0].elapsed, flight.games[1].elapsed);
  assert.equal(flight.done, true);
  const finalScore = flight.score;
  assert.deepEqual(flight.advance(1), []);
  assert.equal(flight.score, finalScore);
});

test('an eliminated buddy spectates while the other keeps their hearts and shared clock', () => {
  const flight = new CoopFlight(30, 12345);
  let spectating = false;
  while (!flight.done) {
    const next = flight.games[1].gates.find(g => !g.resolved);
    if (next) { flight.steer(next.lane,0); flight.steer(1-next.lane,1); }
    flight.advance(.1);
    if (flight.games[0].health === 0) {
      spectating = true;
      assert.equal(flight.games[0].hits, 3);
      assert.equal(flight.games[0].elapsed, flight.games[1].elapsed);
    }
  }
  assert.equal(spectating, true);
  assert.equal(flight.elapsed, 30);
  assert.equal(flight.games[1].health, 3);
  assert.ok(flight.games[1].pickups > 3);
});

test('co-op fatal time, pickups and shared pickups agree for one long advance and many short advances', () => {
  const a = new CoopFlight(90, 12345), b = new CoopFlight(90, 12345);
  a.steer(1, 1); b.steer(1, 1);
  a.advance(90);
  for (let i = 0; i < 900; i++) b.advance(.1);
  assert.equal(a.elapsed,b.elapsed);
  assert.equal(a.pickups,b.pickups);
  assert.equal(a.togetherCount,b.togetherCount);
  assert.deepEqual(a.games.map(g=>[g.health,g.hits,g.pickups]),b.games.map(g=>[g.health,g.hits,g.pickups]));
});

test('each mystery pickup applies a known, different look that survives a hit until the next pickup', () => {
  const game=new Flight(30,()=>0);
  assert.equal(game.activeFilter,null);
  game.steer(1);
  const [first]=game.advance(4);
  assert.ok(FACE_FILTERS.some(f=>f.id===first.filter));
  assert.equal(first.filter,game.activeFilter);
  const firstLook=game.activeFilter;
  game.steer(0);game.advance(2.2);
  assert.equal(game.health,2);
  assert.equal(game.activeFilter,firstLook,'a collision does not remove the cosmetic reward');
  game.steer(1);
  const [second]=game.advance(2.1);
  assert.notEqual(second.filter,firstLook);
  assert.equal(game.pickups,2);
  const snapshot=game.activeFilter;
  game.advance(0);game.advance(NaN);
  assert.equal(game.activeFilter,snapshot);
  assert.equal(new Flight().activeFilter,null,'looks do not leak into a new round');
});

test('only the buddy collecting the box changes their face', () => {
  const game=new CoopFlight(30,12345);
  game.advance(.8);
  const lane=game.games[0].gates[0].lane;
  game.steer(lane,0);game.steer(1-lane,1);
  game.advance(3.2);
  assert.equal(game.games[0].activeFilter,null);
  assert.ok(game.games[1].activeFilter);
  assert.equal(game.pickups,1);
});
