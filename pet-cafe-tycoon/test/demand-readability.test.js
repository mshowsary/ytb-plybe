import test from 'node:test';
import assert from 'node:assert/strict';
import { demandVisualState, demandDetailVisible, stationNeed, stationGauge } from '../src/systems/visuals.js';

test('Task 31: display truth is empty -> ready -> full', () => {
  assert.equal(demandVisualState({ type: 'display', active: true, stock: 0, capacity: 8 }), 'empty');
  assert.equal(demandVisualState({ type: 'display', active: true, stock: 4, capacity: 8 }), 'ready');
  assert.equal(demandVisualState({ type: 'display', active: true, stock: 8, capacity: 8 }), 'full');
});

test('Task 31: machines distinguish producing from missing required input', () => {
  assert.equal(demandVisualState({ type: 'coffee', active: true, stock: 0, buffer: 6, beans: 8 }), 'producing');
  assert.equal(demandVisualState({ type: 'coffee', active: true, stock: 0, buffer: 6, beans: 0 }), 'blocked');
  assert.equal(demandVisualState({ type: 'blender', active: true, stock: 0, buffer: 6, fruit: 3 }), 'producing');
  assert.equal(demandVisualState({ type: 'blender', active: true, stock: 0, buffer: 6, fruit: 0 }), 'blocked');
  assert.equal(demandVisualState({ type: 'oven', active: true, stock: 0, buffer: 6, timer: 1.2 }), 'producing');
});

test('Task 31: available output reads ready/full even while a machine can keep producing', () => {
  assert.equal(demandVisualState({ type: 'coffee', active: true, stock: 2, buffer: 6, beans: 8 }), 'ready');
  assert.equal(demandVisualState({ type: 'coffee', active: true, stock: 6, buffer: 6, beans: 8 }), 'full');
});

test('Task 31: garden growth is producing until harvest-ready full stage', () => {
  assert.equal(demandVisualState({ type: 'bush', active: true, stage: 0 }), 'producing');
  assert.equal(demandVisualState({ type: 'bush', active: true, stage: 1 }), 'producing');
  assert.equal(demandVisualState({ type: 'bush', active: true, stage: 2 }), 'producing');
  assert.equal(demandVisualState({ type: 'bush', active: true, stage: 3 }), 'full');
});

test('Task 31: numbers stay contextual instead of permanently labeling calm stock', () => {
  const st = { type: 'display', active: true, stock: 4, capacity: 8, front: { x: 4, z: 0 } };
  assert.equal(demandDetailVisible(st, { x: 0, z: 0 }, false, 'ready'), false);
  assert.equal(demandDetailVisible(st, { x: 3.2, z: 0 }, false, 'ready'), true);
  assert.equal(demandDetailVisible(st, { x: 0, z: 0 }, true, 'empty'), true);
});

test('Task 31: blocked input stays numerically explicit even with no guest present', () => {
  const coffee = { type: 'coffee', active: true, stock: 0, buffer: 6, beans: 0, front: { x: 8, z: 0 } };
  assert.equal(demandVisualState(coffee), 'blocked');
  assert.equal(demandDetailVisible(coffee, { x: 0, z: 0 }, false, 'blocked'), true);
});

// ---- Station NEEDS and GAUGES (2026-09-18) ------------------------------------------------------
// The grey "n/cap" pill over every station became a picture of what to bring, shown only when the
// player is needed, plus a no-digits gauge when standing next to it. See systems/visuals.js.
test('a dry machine asks for exactly what it eats, and nothing while it has some', () => {
  assert.equal(stationNeed({ type: 'coffee', active: true, beans: 0 }), 'beans');
  assert.equal(stationNeed({ type: 'coffee', active: true, beans: 4 }), null);
  // The garden's ice cream machine drinks nothing since 2026-09-19, so even empty it asks for nothing.
  assert.equal(stationNeed({ type: 'icecream', active: true, stock: 0 }), null);
  assert.equal(stationNeed({ type: 'blender', active: true, fruit: 0 }), 'fruit');
  assert.equal(stationNeed({ type: 'bowl', active: true, stock: 0, capacity: 10 }), 'kibble');
  assert.equal(stationNeed({ type: 'bowl', active: true, stock: 3, capacity: 10 }), null);
});

test('a machine the Barista looks after never asks the player', () => {
  assert.equal(stationNeed({ type: 'coffee', active: true, beans: 0 }, { baristaOnDuty: true }), null);
});

test('an empty counter only asks while a guest is actually waiting at it', () => {
  const st = { type: 'display', active: true, stock: 0, capacity: 8, product: 'cookie' };
  assert.equal(stationNeed(st), null, 'empty and nobody waiting: the empty case is its own message');
  assert.equal(stationNeed(st, { waiter: true }), 'product');
  assert.equal(stationNeed({ ...st, stock: 2 }, { waiter: true }), null);
});

test('a ripe bush asks to be picked only when the blender has room for the fruit', () => {
  const ripe = { type: 'bush', active: true, stage: 3 };
  assert.equal(stationNeed(ripe, { blenderRoom: 6 }), 'pick');
  assert.equal(stationNeed(ripe, { blenderRoom: 1 }), null, 'a nearly full blender: the fruit on the branches says enough');
  assert.equal(stationNeed({ ...ripe, stage: 2 }, { blenderRoom: 9 }), null);
});

test('an inactive station never asks for anything', () => {
  assert.equal(stationNeed({ type: 'coffee', active: false, beans: 0 }), null);
});

test('gauges: machines show what they EAT, counters show what they HOLD, props that show themselves show nothing', () => {
  assert.deepEqual(stationGauge({ type: 'coffee', active: true, beans: 5, stock: 3, buffer: 6 }), { icon: 'beans', frac: 0.25 });
  assert.deepEqual(stationGauge({ type: 'blender', active: true, fruit: 9, stock: 0, buffer: 6 }), { icon: 'fruit', frac: 1 });
  assert.deepEqual(stationGauge({ type: 'display', active: true, stock: 6, capacity: 8 }), { icon: 'product', frac: 0.75 });
  assert.equal(stationGauge({ type: 'oven', active: true, stock: 4, buffer: 12 }), null, 'the tray of cookies is the gauge');
  assert.equal(stationGauge({ type: 'bush', active: true, stage: 2 }), null, 'the fruit on the branches is the gauge');
});
