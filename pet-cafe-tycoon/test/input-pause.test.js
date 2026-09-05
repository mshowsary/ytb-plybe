import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput, resetActiveInputs } from '../src/core/input.js';

function classList() {
  const values = new Set(['hidden']);
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value),
  };
}

function eventHarness() {
  const listeners = new Map();
  const oldAdd = globalThis.addEventListener;
  const oldRemove = globalThis.removeEventListener;
  globalThis.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  globalThis.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  return {
    dispatch(type, event = {}) {
      const e = { target:{ closest:() => null }, ...event };
      for (const fn of [...(listeners.get(type) || [])]) fn(e);
    },
    restore() {
      if (oldAdd === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = oldAdd;
      if (oldRemove === undefined) delete globalThis.removeEventListener; else globalThis.removeEventListener = oldRemove;
    },
  };
}

function elements() {
  return {
    joy:{ style:{}, classList:classList() },
    knob:{ style:{} },
  };
}

test('reset clears an active pointer drag and a stale release cannot restart motion', () => {
  const h = eventHarness();
  const { joy, knob } = elements();
  const input = createInput(joy, knob);
  try {
    h.dispatch('pointerdown', { pointerId:7, clientX:100, clientY:100 });
    h.dispatch('pointermove', { pointerId:7, clientX:140, clientY:100 });
    input.update();
    assert.equal(input.active, true);
    assert.notEqual(input.x, 0);

    resetActiveInputs();
    input.update();
    assert.equal(input.active, false);
    assert.equal(input.pressed, false);
    assert.equal(input.x, 0);
    assert.equal(input.z, 0);
    assert.equal(joy.classList.contains('hidden'), true);

    h.dispatch('pointerup', { pointerId:7 });
    h.dispatch('pointermove', { pointerId:7, clientX:200, clientY:100 });
    input.update();
    assert.equal(input.active, false, 'release/move from the pre-pause pointer cannot regain ownership');
  } finally {
    input.dispose(); h.restore();
  }
});

test('reset clears held keyboard state; movement requires a fresh keydown after resume', () => {
  const h = eventHarness();
  const { joy, knob } = elements();
  const input = createInput(joy, knob);
  try {
    h.dispatch('keydown', { code:'KeyW', repeat:false });
    input.update();
    assert.equal(input.active, true);

    input.reset();
    input.update();
    assert.equal(input.active, false);

    // A keyup delivered during pause is harmless; no motion appears after resume until a new press.
    h.dispatch('keyup', { code:'KeyW' });
    input.update();
    assert.equal(input.active, false);
    h.dispatch('keydown', { code:'KeyW', repeat:false });
    input.update();
    assert.equal(input.active, true);
  } finally {
    input.dispose(); h.restore();
  }
});

test('pointercancel and window blur perform the same full reset', () => {
  const h = eventHarness();
  const { joy, knob } = elements();
  const input = createInput(joy, knob);
  try {
    h.dispatch('pointerdown', { pointerId:3, clientX:50, clientY:50 });
    h.dispatch('pointermove', { pointerId:3, clientX:75, clientY:50 });
    input.update();
    assert.equal(input.active, true);
    h.dispatch('pointercancel', { pointerId:3 });
    input.update();
    assert.equal(input.active, false);

    h.dispatch('keydown', { code:'KeyD', repeat:false });
    input.update();
    assert.equal(input.active, true);
    h.dispatch('blur');
    input.update();
    assert.equal(input.active, false);
  } finally {
    input.dispose(); h.restore();
  }
});
