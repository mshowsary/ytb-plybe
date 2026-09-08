// test/save.test.js — snapshot/restore round trip at the sim level (T2). createGame needs three
// (Three.js + DOM), so this tests the pure parts instead: createWorld(area, save) reconstructing
// the same active/boxes/partial state, and the applySave(state, save) helper (src/sim/save.js)
// that G.restore uses for the flat coins/upgrades/staff/stats/settings fields.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { applySave, validateAndMigrateSave } from '../src/sim/save.js';

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

test('applySave: legacy flat state is migrated onto canonical known fields', () => {
  const state = { coins: 0, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 }, stats: { served: 0, lifetimeEarned: 0 }, settings: { sfx: true } };
  const save = { coins: 555, upgrades: { speed: 2, carry: 1, income: 0 }, staff: { runner: 1, cashier: 1 }, stats: { served: 12, lifetimeEarned: 4000 }, settings: { sfx: false } };
  const canonical = applySave(state, save, AREA1);
  assert.ok(canonical);
  assert.equal(state.coins, 555);
  assert.deepEqual(state.up, { speed: 2, carry: 1, income: 0 });
  assert.deepEqual(state.staff, { runner: 1, cashier: 1, cleaner: 0, barista: 0 });
  assert.deepEqual(state.stats, {
    served: 12, lifetimeEarned: 4000, serviceFees: 0, wasteFees: 0,
    rewardedReliefCoins: 0, partyOrderCoins: 0,
  });
  assert.deepEqual(state.settings, { sfx: false, music: true });
  assert.equal(canonical.v, 5);
});

test('applySave: a falsy or non-object save is a no-op', () => {
  const state = { coins: 10, up: { speed: 1 }, staff: { runner: 2 }, stats: { served: 3 }, settings: { sfx: false } };
  assert.equal(applySave(state, null, AREA1), null);
  assert.equal(state.coins, 10); assert.deepEqual(state.up, { speed: 1 });
  assert.equal(applySave(state, undefined, AREA1), null);
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
  applySave(state, save, AREA1);
  assert.deepEqual(state.staffLevels, { runner: { speed: 2, carry: 3 }, cashier: { speed: 1 }, cleaner: { speed: 1 } });
  assert.deepEqual(state.machineLevels, { oven: 2, coffee: 1, display: 3 });
});
test('applySave: a save without staffLevels/machineLevels (an M2 save) defaults every level to 0', () => {
  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  const save = { coins: 100, upgrades: {}, staff: {}, stats: {}, settings: {} }; // no levels fields at all
  applySave(state, save, AREA1);
  assert.deepEqual(state.staffLevels, { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } });
  assert.deepEqual(state.machineLevels, { oven: 0, coffee: 0, display: 0 });
});

function migrationState() {
  return { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
}
function oldDeskSave(partial, built = ['z_seats1', 'z_oven2', 'z_register2']) {
  return {
    v: 4,
    coins: 100,
    builds: { a1: built },
    partial: { z_hire: partial },
    upgrades: {}, staff: {}, stats: {}, settings: {},
  };
}

test('Task 25 migration preserves a valid legacy Desk partial below the new 300 price', () => {
  const canonical = applySave(migrationState(), oldDeskSave(250), AREA1);
  assert.ok(canonical);
  assert.deepEqual(canonical.builds.a1, ['z_seats1', 'z_oven2', 'z_register2']);
  assert.equal(canonical.partial.z_hire, 250);
});

test('Task 25 migration promotes 300–479 of valid legacy Desk investment to a completed Desk', () => {
  for (const invested of [300, 301, 420, 479]) {
    const canonical = applySave(migrationState(), oldDeskSave(invested), AREA1);
    assert.ok(canonical, `canonical save missing for ${invested}`);
    assert.ok(canonical.builds.a1.includes('z_hire'), `Desk not promoted for ${invested}`);
    assert.equal(canonical.partial.z_hire, undefined, `over-complete partial survived for ${invested}`);
    assert.equal(canonical.coins, 100, 'migration must not mint or charge wallet coins');
  }
});

test('Task 25 migration never turns orphaned over-complete Desk partial into a free unlock', () => {
  const canonical = applySave(migrationState(), oldDeskSave(420, ['z_seats1', 'z_oven2']), AREA1);
  assert.ok(canonical);
  assert.equal(canonical.builds.a1.includes('z_hire'), false);
  assert.equal(canonical.partial.z_hire, undefined);
  assert.equal(canonical.coins, 100);
});

test('Task 25 migration preserves an already-built legacy Desk and second register', () => {
  const canonical = applySave(migrationState(), {
    v: 4,
    coins: 100,
    builds: { a1: ['z_seats1', 'z_oven2', 'z_register2', 'z_hire'] },
    upgrades: {}, staff: {}, stats: {}, settings: {},
  }, AREA1);
  assert.ok(canonical);
  assert.deepEqual(canonical.builds.a1, ['z_seats1', 'z_oven2', 'z_register2', 'z_hire']);
  assert.equal(canonical.coins, 100);
});

test('Task 29: canonical host load gate preserves only demonstrated known mechanic IDs', () => {
  const raw = {
    v: 4,
    coins: 42,
    builds: { a1: ['z_seats1', 'z_oven2', 'z_register2', 'z_hire'] },
    upgrades: {}, staff: {}, stats: {}, settings: {},
    learning: {
      v: 1,
      proven: ['refillCoffee', 'hire', 'not-real', 'refillCoffee'],
      shown: ['pantry', 'refillBowl'],
      prose: 'localized UI text must never become learning state',
    },
  };
  const checked = validateAndMigrateSave(raw, AREA1);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.data.learning, { v: 1, proven: ['hire', 'refillCoffee'] });
  assert.equal('shown' in checked.data.learning, false);
  assert.equal('prose' in checked.data.learning, false);
});

test('Task 29: legacy host save receives conservative mechanic proof from canonical progress', () => {
  const raw = {
    v: 4,
    coins: 0,
    intro: { step: 5 },
    upgrades: { speed: 1 },
    staff: { runner: 1 },
    stats: { served: 2 },
    settings: {},
  };
  const checked = validateAndMigrateSave(raw, AREA1);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.data.learning.proven, ['build', 'cash', 'hire', 'kiosk', 'move', 'pickup', 'serve']);
});
