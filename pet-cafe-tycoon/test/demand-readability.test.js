import test from 'node:test';
import assert from 'node:assert/strict';
import { demandVisualState, demandDetailVisible } from '../src/systems/visuals.js';

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
