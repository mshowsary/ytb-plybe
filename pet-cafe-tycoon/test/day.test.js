import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDay, phaseOf, phaseFrac, spawnMult, stepDay, DAY_LENGTH } from '../src/sim/day.js';

test('the first shift is slightly livelier without changing the normal day-two pace', () => {
  assert.equal(spawnMult({ day: 1, t: 10, phase: 'morning' }), 0.52);
  assert.equal(spawnMult({ day: 1, t: 90, phase: 'rush' }), 1.42);
  assert.equal(spawnMult({ day: 2, t: 10, phase: 'morning' }), 0.45);
  assert.equal(spawnMult({ day: 2, t: 90, phase: 'rush' }), 1.35);
});

test('day three onward opens afternoon with a 20 second recovery window', () => {
  assert.equal(spawnMult({ day: 2, t: 150, phase: 'afternoon' }), 0.48);
  assert.equal(spawnMult({ day: 3, t: 150, phase: 'afternoon' }), 0.16);
  assert.equal(spawnMult({ day: 3, t: 169.9, phase: 'afternoon' }), 0.16);
  assert.equal(spawnMult({ day: 3, t: 170, phase: 'afternoon' }), 0.48);
  assert.equal(spawnMult({ day: 3, t: 205, phase: 'afternoon' }), 0.48);
});

test('phase timing and fractions remain stable across the four-minute shift', () => {
  assert.equal(phaseOf(0), 'morning');
  assert.equal(phaseOf(60), 'rush');
  assert.equal(phaseOf(150), 'afternoon');
  assert.equal(phaseOf(210), 'closing');
  assert.equal(DAY_LENGTH, 240);
  assert.equal(phaseFrac({ phase: 'afternoon', t: 180 }), 0.5);

  const d = createDay();
  const events = stepDay(d, 60);
  assert.equal(d.phase, 'rush');
  assert.deepEqual(events, [{ type: 'phase', phase: 'rush' }]);
});

test('weekend rush keeps its value/pressure multiplier on top of the normal rush pace', () => {
  assert.ok(Math.abs(spawnMult({ day: 6, t: 90, phase: 'rush' }) - 1.35 * 1.25) < 1e-12);
  assert.equal(spawnMult({ day: 6, t: 220, phase: 'closing' }), 0);
});
