// test/boutique.test.js — the BOUTIQUE (plan §3.5/§3.9): accessories bought for coins, "an
// alternative to milestones". Exercises the third accessoryUnlocked door (data/accessories.js),
// its economy (src/sim/economy.js buyAccessory + the affordable/cheapest helpers), the save
// boundary (src/sim/saveSchema.js meta.accessoriesBought), and the kiosk boutique tab's row model
// (src/ui/sheets.js boutiqueRows).
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  ACCESSORIES, ACCESSORY_BY_ID, accessoryUnlocked,
} from '../data/accessories.js';
import {
  buyAccessory, ownedAccessories, ownsAccessory,
  boutiqueCatalogue, affordableAccessories, cheapestAccessory,
} from '../src/sim/economy.js';
import { validateAndMigrateSave } from '../src/sim/save.js';
import { boutiqueRows } from '../src/ui/sheets.js';

// The exact zone chain economy.buyAccessory and saveSchema.normalizeAccessoriesBought gate on --
// derived from the authored catalogue rather than hand-copied, so a future re-price/re-chain of the
// spa cannot silently desync this fixture from reality.
function zoneChainTo(id) {
  const chain = [];
  let cur = AREA1.zones.find(z => z.id === id);
  while (cur) {
    chain.unshift(cur.id);
    cur = cur.requires ? AREA1.zones.find(z => z.id === cur.requires) : null;
  }
  return chain;
}
const BOUTIQUE_CHAIN = zoneChainTo('z_boutique');

function state(over = {}) {
  return { coins: 0, meta: { reputation: 0 }, ...over };
}
function withBoutique(over = {}) {
  return state({ world: { built: new Set(BOUTIQUE_CHAIN) }, ...over });
}
function validate(raw) { return validateAndMigrateSave(raw, AREA1); }
function v4Fixture(over = {}) {
  return {
    v: 4,
    coins: 500,
    builds: { a1: BOUTIQUE_CHAIN, ...(over.builds || {}) },
    dayState: { day: 6, t: 120 },
    meta: { completedDays: 5, reputation: 9, ...(over.meta || {}) },
    ...over,
  };
}

// ---------------------------------------------------------------------------------------------
// catalogue: price + icon
test('every accessory has a boutique price inside the décor band, rising with tier', () => {
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
// economy: buyAccessory contract (mirrors buyDecor exactly)
test('buyAccessory requires z_boutique BUILT and never mutates the wallet on refusal', () => {
  const item = ACCESSORIES.find(i => i.tier >= 1);
  const s = state({ coins: 999999 }); // no world at all
  assert.deepEqual(buyAccessory(s, item.id), { ok: false, cost: item.price });
  assert.equal(s.coins, 999999);
  assert.equal(ownedAccessories(s).length, 0);

  const s2 = state({ coins: 999999, world: { built: new Set(['z_spa', 'z_groom', 'z_bath']) } }); // boutique itself not built
  assert.deepEqual(buyAccessory(s2, item.id), { ok: false, cost: item.price });
  assert.equal(s2.coins, 999999);

  assert.deepEqual(buyAccessory(state({ coins: 0 }), 'not-a-real-id'), { ok: false, cost: null });
});

test('buyAccessory succeeds once z_boutique is built and the price is affordable, and REPLACES the list (never pushes)', () => {
  const item = ACCESSORIES.find(i => i.tier >= 1);
  const s = withBoutique({ coins: item.price + 50 });
  const before = s.meta; // no accessoriesBought field yet
  assert.equal(before.accessoriesBought, undefined);

  const r = buyAccessory(s, item.id);
  assert.equal(r.ok, true);
  assert.equal(r.cost, item.price);
  assert.equal(s.coins, 50);
  assert.deepEqual(ownedAccessories(s), [item.id]);
  assert.equal(ownsAccessory(s, item.id), true);
  assert.equal(accessoryUnlocked(item.id, s.meta), true, 'a bought accessory reads as unlocked immediately');

  const afterFirstBuy = s.meta.accessoriesBought;
  const second = ACCESSORIES.find(i => i.tier >= 1 && i.id !== item.id);
  s.coins = second.price;
  buyAccessory(s, second.id);
  // REPLACED with a new array, not pushed into the one buyAccessory itself just returned --
  // rule 7 (nested save state is replaced, never mutated in place).
  assert.notEqual(s.meta.accessoriesBought, afterFirstBuy);
  assert.deepEqual(afterFirstBuy, [item.id], 'the earlier array must be untouched by the second buy');
  assert.deepEqual(s.meta.accessoriesBought, [item.id, second.id]);
});

test('buyAccessory refuses on insufficient coins without touching the wallet', () => {
  const item = ACCESSORIES.find(i => i.tier >= 1);
  const s = withBoutique({ coins: item.price - 1 });
  assert.deepEqual(buyAccessory(s, item.id), { ok: false, cost: item.price });
  assert.equal(s.coins, item.price - 1);
  assert.equal(ownedAccessories(s).length, 0);
});

test('buyAccessory refuses an item already unlocked (follower tier, season, or a prior purchase) as owned:true', () => {
  const tier0 = ACCESSORIES.find(i => i.tier === 0); // unlocked from the start regardless of followers
  const s = withBoutique({ coins: 999999 });
  const r = buyAccessory(s, tier0.id);
  assert.equal(r.ok, false);
  assert.equal(r.owned, true);
  assert.equal(s.coins, 999999, 'refusing an already-free item must not charge for it');

  const other = ACCESSORIES.find(i => i.tier >= 1);
  assert.equal(buyAccessory(s, other.id).ok, true);
  const afterFirst = s.coins;
  const second = buyAccessory(s, other.id);
  assert.equal(second.ok, false);
  assert.equal(second.owned, true);
  assert.equal(s.coins, afterFirst, 'buying an already-bought accessory a second time must not charge again');
});

// ---------------------------------------------------------------------------------------------
// economy: boutiqueCatalogue / affordableAccessories / cheapestAccessory (invariant-A shape)
test('boutiqueCatalogue is empty until z_boutique is built', () => {
  assert.deepEqual(boutiqueCatalogue(state({ coins: 999999 })), []);
  assert.deepEqual(boutiqueCatalogue(state({ coins: 999999, world: { built: new Set(['z_spa']) } })), []);
  assert.ok(boutiqueCatalogue(withBoutique({ coins: 0 })).length > 0, 'once built, something is on the shelf');
});

test('boutiqueCatalogue lists only what is not yet unlocked through any door, and shrinks after a purchase', () => {
  const s = withBoutique({ coins: 0, meta: { reputation: 0, followers: 0 } });
  const catalogueIds = new Set(boutiqueCatalogue(s).map(i => i.id));
  const tier0Ids = ACCESSORIES.filter(i => i.tier === 0).map(i => i.id);
  for (const id of tier0Ids) assert.equal(catalogueIds.has(id), false, `${id} is already free at tier 0 and must not be sold`);

  const item = ACCESSORIES.find(i => i.tier >= 1);
  s.coins = item.price;
  const before = boutiqueCatalogue(s).length;
  assert.equal(buyAccessory(s, item.id).ok, true);
  assert.equal(boutiqueCatalogue(s).length, before - 1);
  assert.equal(boutiqueCatalogue(s).some(i => i.id === item.id), false);
});

test('affordableAccessories/cheapestAccessory track the wallet, and cheapest is the min-price row in the catalogue', () => {
  const s = withBoutique({ coins: 0, meta: { reputation: 0, followers: 0 } });
  assert.deepEqual(affordableAccessories(s), []);
  const cheapest = cheapestAccessory(s);
  assert.ok(cheapest, 'something must always be on the shelf once the boutique exists');
  assert.equal(cheapest.price, Math.min(...boutiqueCatalogue(s).map(i => i.price)));

  s.coins = cheapest.price;
  assert.ok(affordableAccessories(s).some(i => i.id === cheapest.id));
  assert.ok(affordableAccessories(s).every(i => i.price <= s.coins));
});

test('cheapestAccessory is null once nothing remains to buy (boutique absent, or catalogue exhausted)', () => {
  assert.equal(cheapestAccessory(state({ coins: 999999 })), null, 'no world.built at all');
  // Every accessory unlocked by follower tier already -> the boutique shelf is empty even though
  // it is built, because there is nothing left that a purchase would grant.
  const maxTier = Math.max(...ACCESSORIES.map(i => i.tier));
  const s = withBoutique({ coins: 999999, meta: { reputation: 0, followers: 10 ** 9, season: null } });
  // seasonal items still need a season door OR the follower door OR a purchase; at this follower
  // count every tier (including the highest, maxTier) is met, so all 12 are unlocked already.
  assert.equal(boutiqueCatalogue(s).length, 0, `expected the whole tier ladder (up to tier ${maxTier}) cleared`);
  assert.equal(cheapestAccessory(s), null);
});

// ---------------------------------------------------------------------------------------------
// save boundary: meta.accessoriesBought
test('v4 migrates to v5 with an empty accessoriesBought default', () => {
  const result = validate(v4Fixture({ builds: {} }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.accessoriesBought, []);
});

test('a hand-edited save cannot own a boutique purchase before the boutique exists', () => {
  const item = ACCESSORIES.find(i => i.tier >= 1);
  // z_boutique is deliberately left OUT of the built chain here.
  const preBoutiqueChain = BOUTIQUE_CHAIN.slice(0, BOUTIQUE_CHAIN.indexOf('z_boutique'));
  const result = validate(v4Fixture({
    builds: { a1: preBoutiqueChain },
    meta: { completedDays: 5, reputation: 9, accessoriesBought: [item.id] },
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.accessoriesBought, [], 'the whole list is dropped, not just the ungated pieces');
});

test('accessoriesBought survives once z_boutique is built, deduped and in catalogue order, unknown ids dropped', () => {
  const a = ACCESSORIES[3].id, b = ACCESSORIES[0].id;
  const result = validate(v4Fixture({
    meta: { completedDays: 5, reputation: 9, accessoriesBought: [a, a, 'not-a-real-id', 7, b] },
  }));
  assert.equal(result.ok, true);
  // catalogue order: ACCESSORIES[0] before ACCESSORIES[3]
  assert.deepEqual(result.data.meta.accessoriesBought, [b, a]);
  // re-validating the canonical shape is a no-op
  assert.deepEqual(validate(result.data).data.meta.accessoriesBought, [b, a]);
});

test('a non-array accessoriesBought normalises to empty rather than crashing', () => {
  const result = validate(v4Fixture({ meta: { completedDays: 5, reputation: 9, accessoriesBought: { 0: ACCESSORIES[0].id } } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.accessoriesBought, []);
});

// ---------------------------------------------------------------------------------------------
// kiosk boutique tab row model (icon + price rows, no words -- same idiom as decorRows)
test('boutiqueRows derives icon+price rows from model.boutiqueItems, disabled below the wallet', () => {
  const item = ACCESSORY_BY_ID.get(ACCESSORIES[0].id);
  const rows = boutiqueRows({ coins: item.price - 1, boutiqueItems: [item] });
  assert.deepEqual(rows.map(r => r.id), [item.id]);
  assert.equal(rows[0].price, item.price);
  assert.equal(rows[0].icon, item.icon);
  assert.equal(rows[0].disabled, true);

  const rows2 = boutiqueRows({ coins: item.price, boutiqueItems: [item] });
  assert.equal(rows2[0].disabled, false);
});

test('boutiqueRows prefers a pre-built model.boutique list when supplied', () => {
  assert.deepEqual(boutiqueRows({ boutique: [{ id: 'x', price: 1, icon: '<svg/>' }] }).map(r => r.id), ['x']);
});

test('boutiqueRows renders nothing when the model carries no boutique items (pre-z_boutique)', () => {
  assert.deepEqual(boutiqueRows({ coins: 999999 }), []);
});
