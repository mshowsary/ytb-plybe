// test/save.test.js — snapshot/restore round trip at the sim level (T2). createGame needs three
// (Three.js + DOM), so this tests the pure parts instead: createWorld(area, save) reconstructing
// the same active/boxes/partial state, and the applySave(state, save) helper (src/sim/save.js)
// that G.restore uses for the flat coins/upgrades/staff/stats/settings fields.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { applySave } from '../src/sim/save.js';

test('createWorld(AREA1, save) with 3 built zones + partial: active set, boxes.length, partial', () => {
  const built = ['z_seats1', 'z_oven2', 'z_register2'];
  const partial = { z_coffee: 120 };
  const w1 = createWorld(AREA1, { built, partial });

  // Loop v2 Task 1: dispCookie/kiosk1/register1/return1 are active from the start (no zone); the
  // three built zones add seat1/seat2 (z_seats1), oven2 + dispCupcake (z_oven2) and register2.
  const expectedActive = ['dispCookie', 'kiosk1', 'oven1', 'register1', 'return1', 'oven2', 'dispCupcake', 'register2', 'seat1', 'seat2'].sort();
  const activeIds1 = [...w1.stations.values()].filter(st => st.active).map(st => st.id).sort();
  assert.deepEqual(activeIds1, expectedActive);
  assert.equal(w1.boxes.length, expectedActive.length);
  assert.deepEqual(w1.partial, partial);

  // a "restored" world built from the exact same save shape must land on the same active set,
  // the same box count and the same partial progress
  const w2 = createWorld(AREA1, { built, partial });
  const activeIds2 = [...w2.stations.values()].filter(st => st.active).map(st => st.id).sort();
  assert.deepEqual(activeIds2, activeIds1);
  assert.equal(w2.boxes.length, w1.boxes.length);
  assert.deepEqual(w2.partial, w1.partial);
});

test('applySave: coins/upgrades/staff/stats/settings are copied onto the state', () => {
  const state = { coins: 0, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 }, stats: { served: 0, lifetimeEarned: 0 }, settings: { sfx: true } };
  const save = { coins: 555, upgrades: { speed: 2, carry: 1, income: 0 }, staff: { runner: 1, cashier: 1 }, stats: { served: 12, lifetimeEarned: 4000 }, settings: { sfx: false } };
  applySave(state, save);
  assert.equal(state.coins, 555);
  assert.deepEqual(state.up, { speed: 2, carry: 1, income: 0 });
  assert.deepEqual(state.staff, { runner: 1, cashier: 1 });
  assert.deepEqual(state.stats, { served: 12, lifetimeEarned: 4000 });
  assert.deepEqual(state.settings, { sfx: false });
});

test('applySave: a falsy or non-object save is a no-op', () => {
  const state = { coins: 10, up: { speed: 1 }, staff: { runner: 2 }, stats: { served: 3 }, settings: { sfx: false } };
  applySave(state, null);
  assert.equal(state.coins, 10); assert.deepEqual(state.up, { speed: 1 });
  applySave(state, undefined);
  assert.equal(state.coins, 10);
});

// M3 T5 fix round 1, finding 4: staffLevels/machineLevels round-trip through applySave, and an M2
// save (neither field present) restores every level to 0 rather than leaving them undefined.
test('applySave: staffLevels and machineLevels round-trip', () => {
  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  const save = {
    coins: 100,
    staffLevels: { runner: { speed: 2, carry: 3 }, cashier: { speed: 1 }, cleaner: { speed: 1 } },
    machineLevels: { oven: 2, coffee: 1, display: 3 },
  };
  applySave(state, save);
  assert.deepEqual(state.staffLevels, { runner: { speed: 2, carry: 3 }, cashier: { speed: 1 }, cleaner: { speed: 1 } });
  assert.deepEqual(state.machineLevels, { oven: 2, coffee: 1, display: 3 });
});
test('applySave: a save without staffLevels/machineLevels (an M2 save) defaults every level to 0', () => {
  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  const save = { coins: 100, upgrades: {}, staff: {}, stats: {}, settings: {} }; // no levels fields at all
  applySave(state, save);
  assert.deepEqual(state.staffLevels, { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } });
  assert.deepEqual(state.machineLevels, { oven: 0, coffee: 0, display: 0 });
});
