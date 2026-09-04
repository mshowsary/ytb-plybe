import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cappedVisualStep } from '../src/core/visualMotion.js';

test('normal customer movement inside the visual speed cap is copied exactly', () => {
  const r = cappedVisualStep(0, 0, 0.022, 0, 2.8, 0.01); // 2.2 m/s simulation step
  assert.equal(r.x, 0.022);
  assert.equal(r.z, 0);
  assert.equal(r.lag, 0);
});

test('a navigation rescue jump is visually absorbed instead of teleporting', () => {
  let x = 0, z = 0;
  const dt = 1 / 60, max = 2.8;
  let maxObserved = 0;
  for (let i = 0; i < 20; i++) {
    const r = cappedVisualStep(x, z, 0.5, 0, max, dt);
    const speed = Math.hypot(r.x - x, r.z - z) / dt;
    maxObserved = Math.max(maxObserved, speed);
    x = r.x; z = r.z;
  }
  assert.ok(maxObserved <= max + 1e-9);
  assert.ok(x >= 0.49); // catches up smoothly in well under half a second
});

test('zero dt never creates infinite render velocity', () => {
  const r = cappedVisualStep(1, 2, 9, 9, 2.8, 0);
  assert.deepEqual(r, { x: 1, z: 2, speed: 0, lag: 10.63014581273465 });
});
