import test from 'node:test';
import assert from 'node:assert/strict';
import { Flight, BrowSwitch } from '../game/plank-engine.js';

for (const duration of [30, 45, 60, 90]) {
  test(`${duration}-second round finishes at its target, including after a delayed frame`, () => {
    const flight = new Flight(duration, () => 0);
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
  assert.equal(flight.score, 50);
});

test('hits reset the streak and reduce points without extending or ending the round', () => {
  const flight = new Flight(30, () => 0);
  flight.steer(1);
  flight.advance(4);
  assert.equal(flight.score, 50);
  assert.equal(flight.streak, 1);
  flight.steer(0);
  flight.advance(2.2);
  assert.equal(flight.score, 25);
  assert.equal(flight.streak, 0);
  assert.equal(flight.duration, 30);
  assert.equal(flight.elapsed, 6.2);
  assert.equal(flight.done, false);
  flight.steer(1);
  flight.advance(2.1);
  assert.equal(flight.score, 75, 'the next clear restarts the streak reward at 50');
  flight.steer(0);
  flight.advance(100);
  assert.ok(flight.hits > 5);
  assert.equal(flight.elapsed, 30);
  assert.equal(flight.duration, 30);
  assert.equal(flight.done, true);
  assert.equal(flight.score, 0, 'repeated hits cannot make the score negative');
});

test('clear rewards increase with streaks and cap at 100 points per obstacle', () => {
  const flight = new Flight(90, () => 0);
  flight.steer(1);
  const rewards = [];
  while (!flight.done) {
    const previousScore = flight.score;
    const events = flight.advance(0.25);
    if (events.length) {
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'clear');
      rewards.push(flight.score - previousScore);
    }
    assert.ok(flight.score >= 0);
  }
  assert.deepEqual(rewards.slice(0, 6), [50, 60, 70, 80, 90, 100]);
  assert.ok(rewards.length > 6);
  assert.ok(rewards.slice(6).every(reward => reward === 100));
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
  for (const key of ['elapsed', 'score', 'hits', 'cleared', 'streak', 'done']) {
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
