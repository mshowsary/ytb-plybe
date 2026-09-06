import test from 'node:test';
import assert from 'node:assert/strict';
import { demandVisualState } from '../src/systems/visuals.js';

test('Task 31: stocked station is healthy', () => {
  assert.equal(demandVisualState({ type: 'display', active: true, stock: 4 }), 'healthy');
});

test('Task 31: calm empty display is information, not an alarm', () => {
  assert.equal(demandVisualState({ type: 'display', active: true, stock: 0 }, false), 'empty');
});

test('Task 31: customer-blocking empty display is the only strong actionable state', () => {
  assert.equal(demandVisualState({ type: 'display', active: true, stock: 0 }, true), 'actionable');
  assert.equal(demandVisualState({ type: 'bowl', active: true, stock: 0 }, true), 'actionable');
});

test('Task 31: machines distinguish recovering output from missing input', () => {
  assert.equal(demandVisualState({ type: 'coffee', active: true, stock: 0, beans: 8 }), 'paused');
  assert.equal(demandVisualState({ type: 'coffee', active: true, stock: 0, beans: 0 }), 'blocked');
  assert.equal(demandVisualState({ type: 'blender', active: true, stock: 0, fruit: 3 }), 'paused');
  assert.equal(demandVisualState({ type: 'blender', active: true, stock: 0, fruit: 0 }), 'blocked');
});

test('Task 31: visible garden growth reads healthy rather than as a false shortage', () => {
  // A growing bush already exposes truthful 1/3 or 2/3 stage pips; that is healthy progress, not a
  // blocked machine. Only a genuinely customer-actionable shortage earns the coral alarm state.
  assert.equal(demandVisualState({ type: 'bush', active: true, stage: 1 }), 'healthy');
  assert.equal(demandVisualState({ type: 'bush', active: true, stage: 3 }), 'healthy');
});
