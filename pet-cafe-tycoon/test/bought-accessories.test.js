// test/bought-accessories.test.js — accessories a player bought in the retired spa's boutique.
//
// The coin shop is gone (docs/SHIP-PLAN-2026-09-19.md: the spa and its boutique were retired), so
// nothing sells an accessory any more; they unlock by follower tier and by season. What a save
// already bought stays owned: meta.accessoriesBought is still the third accessoryUnlocked door, the
// save boundary keeps catalogue ids with NO zone gate (the boutique that gated them no longer
// exists), and applySave carries the list onto the live meta (it used to drop it on every reload).
// Replaces test/boutique.test.js, whose shop-side assertions went with the shop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { ACCESSORIES, accessoryUnlocked } from '../data/accessories.js';
import * as economy from '../src/sim/economy.js';
import { validateAndMigrateSave, applySave } from '../src/sim/save.js';
import * as sheets from '../src/ui/sheets.js';
import { buildKioskModel } from '../src/ui/models.js';
import { createWorld } from '../src/sim/world.js';

function validate(raw) { return validateAndMigrateSave(raw, AREA1); }
function v4Fixture(over = {}) {
  return {
    v: 4,
    coins: 500,
    builds: { a1: ['z_seats1', 'z_oven2'] },
    dayState: { day: 6, t: 120 },
    ...over,
    meta: { completedDays: 5, reputation: 9, ...(over.meta || {}) },
  };
}

// ---------------------------------------------------------------------------------------------
// catalogue: the authored price + icon data is kept for whichever door sells cosmetics next
test('every accessory keeps a price inside the décor band, rising with tier, and an icon', () => {
  const byTier = new Map();
  for (const item of ACCESSORIES) {
    assert.ok(Number.isInteger(item.price) && item.price >= 60 && item.price <= 900, `${item.id} price ${item.price}`);
    assert.ok(typeof item.icon === 'string' && item.icon.startsWith('<svg'), `${item.id} icon`);
    if (!byTier.has(item.tier)) byTier.set(item.tier, []);
    byTier.get(item.tier).push(item.price);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  let prevMax = -Infinity;
  for (const tier of tiers) {
    const prices = byTier.get(tier);
    const min = Math.min(...prices);
    assert.ok(min > prevMax, `tier ${tier} (min ${min}) must price above every lower tier (${prevMax})`);
    prevMax = Math.max(...prices);
  }
});

// ---------------------------------------------------------------------------------------------
// accessoryUnlocked: the bought path
test('accessoryUnlocked treats meta.accessoriesBought as a third door, independent of tier/season', () => {
  const highTierItem = ACCESSORIES.find(i => i.tier >= 2 && !i.seasonal);
  assert.equal(accessoryUnlocked(highTierItem.id, { followers: 0 }), false, 'fixture assumption: locked with no followers');
  assert.equal(accessoryUnlocked(highTierItem.id, { followers: 0, accessoriesBought: [highTierItem.id] }), true);
  assert.equal(accessoryUnlocked(highTierItem.id, { followers: 0, accessoriesBought: ['some-other-id'] }), false);
  assert.equal(accessoryUnlocked(highTierItem.id, { followers: 0, accessoriesBought: 'not-an-array' }), false, 'a malformed list must not crash or grant');
  assert.equal(accessoryUnlocked('not-a-real-id', { accessoriesBought: ['not-a-real-id'] }), false, 'an unknown id is never unlocked, however it got into the list');
});

// ---------------------------------------------------------------------------------------------
// no shop: nothing sells an accessory for coins any more
test('there is no accessory shop: the economy sells none and the kiosk has no Boutique tab', () => {
  for (const name of ['buyAccessory', 'boutiqueCatalogue', 'affordableAccessories', 'cheapestAccessory']) {
    assert.equal(economy[name], undefined, `sim/economy.js must not export ${name}`);
  }
  assert.equal(sheets.boutiqueRows, undefined, 'ui/sheets.js must not draw boutique rows');
  const w = createWorld(AREA1);
  const model = buildKioskModel({ coins: 999999, up: {}, staff: {}, staffLevels: { runner: {}, cashier: {}, cleaner: {} }, meta: {} }, w, 'player');
  assert.equal('boutiqueActive' in model, false);
  assert.equal('boutiqueItems' in model, false);
});

// ---------------------------------------------------------------------------------------------
// save boundary: meta.accessoriesBought
test('v4 migrates to v5 with an empty accessoriesBought default', () => {
  const result = validate(v4Fixture({ builds: {} }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.accessoriesBought, []);
});

// Inverted from the boutique era, when a list with no z_boutique built was dropped whole: the zone
// no longer exists, so that gate would confiscate every real purchase on the next load.
test('bought accessories survive with no boutique (or any zone) built', () => {
  const item = ACCESSORIES.find(i => i.tier >= 1);
  const result = validate(v4Fixture({
    builds: { a1: [] },
    meta: { accessoriesBought: [item.id] },
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.accessoriesBought, [item.id]);
  // A save that built the whole retired spa chain keeps them too (the refund does not touch them).
  const spa = validate(v4Fixture({
    builds: { a1: [...AREA1.zones.map(z => z.id), 'z_spa', 'z_groom', 'z_bath', 'z_boutique', 'z_photographer'] },
    meta: { accessoriesBought: [item.id] },
  }));
  assert.deepEqual(spa.data.meta.accessoriesBought, [item.id]);
});

test('accessoriesBought keeps catalogue ids only, deduped and in catalogue order', () => {
  const a = ACCESSORIES[3].id, b = ACCESSORIES[0].id;
  const result = validate(v4Fixture({
    meta: { accessoriesBought: [a, a, 'not-a-real-id', 7, b] },
  }));
  assert.equal(result.ok, true);
  // catalogue order: ACCESSORIES[0] before ACCESSORIES[3]
  assert.deepEqual(result.data.meta.accessoriesBought, [b, a]);
  // re-validating the canonical shape is a no-op
  assert.deepEqual(validate(result.data).data.meta.accessoriesBought, [b, a]);
});

test('a non-array accessoriesBought normalises to empty rather than crashing', () => {
  const result = validate(v4Fixture({ meta: { accessoriesBought: { 0: ACCESSORIES[0].id } } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.accessoriesBought, []);
});

// The regression: every reload used to lose the list, because applySave rebuilt state.meta
// field by field and this field was not among them.
test('applySave carries meta.accessoriesBought onto the live state, as a fresh array', () => {
  const ids = [ACCESSORIES[0].id, ACCESSORIES[4].id];
  const save = v4Fixture({ meta: { accessoriesBought: ids } });
  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  assert.ok(applySave(state, save, AREA1));
  assert.deepEqual(state.meta.accessoriesBought, ids);
  assert.ok(accessoryUnlocked(ACCESSORIES[4].id, state.meta), 'a bought piece is still wearable after the reload');
  assert.notEqual(state.meta.accessoriesBought, save.meta.accessoriesBought, 'replaced, never aliased');
});
