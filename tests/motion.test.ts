import test from 'node:test';
import assert from 'node:assert/strict';
import { brakingSpeed, stepMotion, TRAIN_MOTION, type MotionState } from '../src/game/motion.ts';

function simulate(initial: MotionState, target: number, seconds: number): MotionState {
  let state = initial;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    state = stepMotion(state, target, 1 / 60);
  }
  return state;
}

test('train gains speed progressively instead of jumping to the selected pace', () => {
  const first = stepMotion({ speed: 0, acceleration: 0 }, 135, 1 / 60);
  assert.ok(first.speed > 0 && first.speed < 1);
  assert.ok(first.acceleration > 0 && first.acceleration < TRAIN_MOTION.traction);

  const later = simulate(first, 135, 8);
  assert.equal(later.speed, 135);
  assert.equal(later.acceleration, 0);
});

test('service braking is smooth and never produces reverse motion', () => {
  const first = stepMotion({ speed: 135, acceleration: 0 }, 0, 1 / 60);
  assert.ok(first.speed < 135);
  assert.ok(first.acceleration < 0 && first.acceleration > -TRAIN_MOTION.brake);

  const stopped = simulate(first, 0, 8);
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.acceleration, 0);
});

test('station approach limit follows stopping-distance physics', () => {
  assert.equal(brakingSpeed(0), 0);
  assert.ok(Math.abs(brakingSpeed(100) ** 2 - 2 * TRAIN_MOTION.brake * 100) < 0.001);
  assert.ok(brakingSpeed(400) > brakingSpeed(100));
});
