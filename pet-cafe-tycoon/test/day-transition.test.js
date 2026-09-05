import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_LENGTH, createDay, stepDay, nextDay } from '../src/sim/day.js';

test('day primitive emits one terminal event and then remains terminal', () => {
  const d = createDay();
  d.t = DAY_LENGTH - 0.01; d.phase = 'closing';
  assert.deepEqual(stepDay(d, 0.02), [{ type: 'dayEnd', day: 1 }]);
  assert.equal(d.t, DAY_LENGTH); assert.equal(d._ended, true);
  assert.deepEqual(stepDay(d, 1), []);
  assert.deepEqual(stepDay(d, 100), []);
});

test('JSON round-trip of a settled day does not silently create a second settlement', () => {
  const d = createDay();
  d.t = DAY_LENGTH; d.phase = 'closing'; d._ended = true;
  const restored = JSON.parse(JSON.stringify(d));
  assert.deepEqual(stepDay(restored, 1), []);
  assert.equal(restored.day, 1); assert.equal(restored.t, DAY_LENGTH); assert.equal(restored._ended, true);
});

test('nextDay is the explicit primitive that advances exactly one day and clears terminal state', () => {
  const d = { day: 7, t: DAY_LENGTH, phase: 'closing', _ended: true };
  nextDay(d);
  assert.deepEqual(d, { day: 8, t: 0, phase: 'morning', _ended: false });
});
