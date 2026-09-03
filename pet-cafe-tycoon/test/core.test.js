import { test } from 'node:test'; import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.js';
import { clamp, lerp, damp, easeOutBack, Spring } from '../src/core/tween.js';
test('rng is deterministic and in range', () => {
  const a = makeRng(7), b = makeRng(7);
  const xs = Array.from({ length: 5 }, () => a.f());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b.f()));
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  assert.ok([1, 2, 3].includes(a.pick([1, 2, 3])));
  const n = a.i(2, 4); assert.ok(n >= 2 && n <= 4 && Number.isInteger(n));
});
test('helpers', () => {
  assert.equal(clamp(5, 0, 3), 3); assert.equal(lerp(0, 10, .5), 5);
  assert.ok(Math.abs(damp(0, 10, 10, 1) - 10) < 0.01);
  assert.ok(easeOutBack(0.5) > 0.9); assert.equal(easeOutBack(1), 1);
});
test('spring settles to target', () => {
  const s = new Spring(0); s.target = 1;
  for (let i = 0; i < 300; i++) s.step(1 / 60);
  assert.ok(Math.abs(s.value - 1) < 1e-3);
  s.kick(5); assert.equal(s.vel, 5);
});
