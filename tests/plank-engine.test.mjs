import test from 'node:test';
import assert from 'node:assert/strict';
import { Flight, BrowSwitch, CoopFlight, FACE_FILTERS, TrackingPace } from '../game/plank-engine.js';

function steerSafe(flight) {
  const gate = flight.gates.find(g => !g.resolved);
  if (gate) flight.steer(1 - gate.lane);
}
function avoidUntil(flight, end) {
  while (!flight.done && flight.elapsed < end) {
    steerSafe(flight);
    flight.advance(Math.min(.1, end - flight.elapsed));
  }
}
function resolveNext(flight, hit = false) {
  if (!flight.gates.some(g => !g.resolved)) flight.advance(flight.nextGate - flight.elapsed);
  const gate = flight.gates.find(g => !g.resolved);
  assert.ok(gate, 'a next obstacle is available');
  flight.steer(hit ? gate.lane : 1 - gate.lane);
  return flight.advance(gate.arrival - flight.elapsed + 1e-9);
}

function obstacleSequence(flight) {
  const gates = new Map();
  while (!flight.done) {
    steerSafe(flight);
    flight.advance(.1);
    for (const gate of flight.gates) gates.set(gate.id, {...gate});
  }
  return [...gates.values()];
}

test('pace ramps up to more obstacles with readable approaches and time between turns', () => {
  const gates = obstacleSequence(new Flight(30, () => 0));
  assert.ok(gates.length >= 20, 'a 30-second round used to contain only 13 obstacles');
  assert.ok(gates[0].arrival >= 3.3, 'the first obstacle gives time to settle after countdown');
  const gaps = gates.slice(1).map((gate,i) => gate.arrival - gates[i].arrival);
  assert.ok(gaps.every(gap => gap >= 1.05 - 1e-10), 'opposite lanes never require an instant turn');
  assert.ok(gaps[0] > 1.4);
  assert.ok(gaps.at(-1) <= 1.06, 'pace reaches its cap during a normal 30-second round');
  assert.ok(gates[0].arrival - gates[0].born > gates.at(-1).arrival - gates.at(-1).born);
  assert.ok(gates.every(gate => gate.arrival - gate.born >= 2.1 - 1e-10));
});

test('obstacles encourage changes and never repeat a lane more than twice, even with unlucky randomness', () => {
  const switching = obstacleSequence(new Flight(30, () => .5));
  assert.ok(switching.slice(1).every((gate,i) => gate.lane !== switching[i].lane));
  const holding = obstacleSequence(new Flight(30, () => .99));
  assert.ok(holding.some((gate,i) => i && gate.lane === holding[i-1].lane), 'some holds keep the pattern varied');
  assert.ok(holding.every((gate,i) => i < 2 || gate.lane !== holding[i-1].lane || gate.lane !== holding[i-2].lane));
});

test('slow-camera pacing lengthens reaction windows without moving visible obstacles or breaking co-op sync', () => {
  const flight = new CoopFlight(30, 12345), gates = new Map();
  flight.advance(2);
  const visible = flight.games.map(game => JSON.stringify(game.gates));
  flight.setResponseGap(1.8);
  assert.deepEqual(flight.games.map(game => JSON.stringify(game.gates)), visible);
  while (!flight.done) {
    for (const game of flight.games) steerSafe(game);
    flight.advance(.1);
    assert.deepEqual(flight.games[0].gates, flight.games[1].gates);
    for (const gate of flight.games[0].gates) gates.set(gate.id,{...gate});
  }
  const sequence = [...gates.values()];
  for (const [i,gate] of sequence.entries()) {
    if (gate.born <= 2) continue;
    assert.ok(gate.arrival - gate.born >= 3.6 - 1e-10);
    assert.ok(gate.arrival - sequence[i-1].arrival >= 1.8 - 1e-10);
  }
  assert.equal(flight.health, 6);
  assert.equal(flight.elapsed, 30);
});

test('tracking pace follows sustained detection speed, ignores one spike, and excludes paused time', () => {
  const pace = new TrackingPace();
  let now = 0;
  const samples = (count,ms) => { for (let i=0;i<count;i++) pace.record(now += ms); };
  samples(10, 1000/15);
  assert.equal(pace.responseGap, 1.05);
  samples(1,500);
  assert.equal(pace.responseGap, 1.05, 'one delayed frame does not change the pace');
  samples(8,250);
  assert.equal(pace.responseGap, 1.5);
  assert.equal(pace.freshnessMs, 625);
  pace.interrupt(); samples(1,20000);
  assert.equal(pace.responseGap, 1.5, 'hidden time is not a camera speed measurement');
  samples(8,1000/15);
  assert.equal(pace.responseGap,1.05);
  assert.equal(pace.freshnessMs,350);
  samples(8,600);
  assert.equal(pace.responseGap,2.1, 'very slow input is capped at the old obstacle spacing');
  pace.reset();
  assert.equal(pace.responseGap,1.05);
});

test('camera recovery near the finish cannot spawn a retroactive collision', () => {
  const flight = new Flight(30, () => 0);
  flight.setResponseGap(2.1);
  avoidUntil(flight,29.8);
  const count = flight.serial;
  flight.setResponseGap(1.05);
  assert.deepEqual(flight.advance(1), []);
  assert.equal(flight.serial,count, 'no new obstacle can appear after its intended spawn time');
  assert.equal(flight.health,3);
  assert.equal(flight.elapsed,30);
});

for (const duration of [30, 45, 60, 90]) {
  test(`${duration}-second round finishes at its target, including after a delayed frame`, () => {
    const flight = new Flight(duration, () => 0);
    avoidUntil(flight, duration - 0.25);
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
    const obstacles = new Map();
    while (!flight.done) {
      steerSafe(flight);
      flight.advance(0.25);
      for (const gate of flight.gates) obstacles.set(gate.id, { ...gate });
    }
    assert.ok(obstacles.size > 0);
    for (const gate of obstacles.values()) {
      assert.ok(gate.arrival < duration, 'no gate should arrive at or after the finish');
      assert.ok(gate.arrival - gate.born >= 2.1 - 1e-10,
        'late gates must not have shortened approach time');
    }
    assert.equal(flight.hits + flight.cleared, obstacles.size,
      'every spawned gate should be resolved by the end');
  });
}

test('obstacles resolve once, using the lane occupied when they arrive', () => {
  const flight = new Flight(30, () => 0);
  flight.steer(1);
  assert.deepEqual(flight.advance(3), []);
  assert.equal(flight.score, 0);
  flight.steer(0); // Moving after spawning but before arrival must affect the result.
  assert.deepEqual(flight.advance(1).map(event => event.type), ['hit']);
  assert.equal(flight.hits, 1);
  assert.equal(flight.score, 0);
  assert.deepEqual(flight.advance(0.1), []);
  assert.equal(flight.hits, 1, 'a resolved obstacle cannot hit twice');
  assert.deepEqual(resolveNext(flight).map(event => event.type), ['clear']);
  assert.equal(flight.cleared, 1);
  assert.equal(flight.pickups, 1);
});

test('obstacles cost hearts, preserve earned pickups, and the third hit ends the round', () => {
  const flight = new Flight(30, () => 0);
  resolveNext(flight);
  assert.equal(flight.pickups, 1); assert.equal(flight.health, 3);
  resolveNext(flight, true);
  assert.equal(flight.health, 2); assert.equal(flight.pickups, 1);
  resolveNext(flight, true); assert.equal(flight.health, 1);
  const [fatal] = resolveNext(flight, true);
  assert.equal(flight.health, 0); assert.equal(flight.hits, 3);
  assert.equal(flight.pickups, 1); assert.equal(flight.done, true);
  assert.equal(flight.elapsed, fatal.gate.arrival, 'ends at the fatal collision');
  const snapshot = JSON.stringify(flight);
  assert.deepEqual(flight.advance(100), []);
  assert.equal(JSON.stringify(flight), snapshot);
});

test('each visible safe-lane pickup is collected exactly once', () => {
  const flight = new Flight(90, () => 0);
  while (!flight.done) {
    steerSafe(flight);
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
  const [first]=resolveNext(game);
  assert.ok(FACE_FILTERS.some(f=>f.id===first.filter));
  assert.equal(first.filter,game.activeFilter);
  const firstLook=game.activeFilter;
  resolveNext(game, true);
  assert.equal(game.health,2);
  assert.equal(game.activeFilter,firstLook,'a collision does not remove the cosmetic reward');
  const [second]=resolveNext(game);
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
