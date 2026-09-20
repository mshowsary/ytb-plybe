// test/retired-zones.test.js — a save that bought a retired zone gets its coins back.
//
// The core validator keeps only zone ids that are still in data/area1.js, and drops their partial
// payments and station rows the same way, so removing a zone from the catalogue would silently take
// back every coin spent on it plus anything left on its trays. src/sim/save.js RETIRED_ZONES and
// retiredZoneRefund pay it back once, on load (docs/SHIP-PLAN-2026-09-19.md §3). Two retirements so
// far: the Pet Spa (5 zones, 36,500 coins) and the Ice cream garden's cuts (z_icecream folded into
// z_terrace; z_register3, z_restroom and z_splash cut — 15,100 coins). The fixture is the shape a
// HEAD-era (53ad816) save with the whole old terrace chain and the whole spa built actually had.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  RETIRED_ZONES, RECHAINED_ZONES, retiredZoneRefund, validateAndMigrateSave, applySave, SAVE_LIMITS,
} from '../src/sim/save.js';
import { normalizeOwnerState } from '../src/sim/ownerState.js';
import { photographerSpawnAllowed } from '../src/sim/staffState.js';

const SPA_ZONES = ['z_spa', 'z_groom', 'z_bath', 'z_boutique', 'z_photographer'];
const SPA_PRICE = 9000 + 6000 + 7000 + 6500 + 8000;
const GARDEN_CUTS = ['z_icecream', 'z_register3', 'z_restroom', 'z_splash'];
const GARDEN_CUT_PRICE = 3600 + 4000 + 3500 + 4000;
// The catalogue as it stood at 53ad816, before either retirement, in its authored order.
const HEAD_CHAIN = [
  'z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2',
  'z_terrace', 'z_icecream', 'z_register3', 'z_photo', 'z_terraceSeats', 'z_restroom', 'z_splash',
];
const LIVE_ZONES = AREA1.zones.map(z => z.id);

function headSave(over = {}) {
  return {
    v: 5,
    coins: 12345,
    builds: { a1: [...HEAD_CHAIN, ...SPA_ZONES] },
    partial: {},
    stationState: { v: 1, byId: { photo1: { pile: 0 }, register3: { pile: 333 }, groom1: { pile: 111 }, bath1: { pile: 222, water: 7 }, boutique1: { pile: 0 } } },
    ownerState: { v: 1, position: { x: 14.0, z: -1.0, rot: 0 }, products: [], carry: { sack: 'water', sackLeft: 12, fruit: 0 } },
    staff: { runner: 0, cashier: 0, cleaner: 0, barista: 0, photographer: 1 },
    dayState: { day: 3, t: 52.4, phase: 'morning' },
    meta: { completedDays: 2, reputation: 3, followers: 40, accessoriesBought: ['acc_beret', 'acc_scarf'] },
    ledger: { v: 1, day: 3, openingWallet: 12000, next: 2, entries: [{ id: 'd3:tx1', type: 'collection', category: 'register', amount: 345, delta: 345, day: 3, meta: null }] },
    ...over,
  };
}
const ALL_REFUND = GARDEN_CUT_PRICE + SPA_PRICE + 333 + 111 + 222;
const validate = raw => validateAndMigrateSave(raw, AREA1);

test('the table lists every retired zone as it was last authored, in chain order', () => {
  // The garden's cuts come first: the spa chain hangs off z_splash.
  assert.deepEqual(RETIRED_ZONES.map(z => z.id), [...GARDEN_CUTS, ...SPA_ZONES]);
  assert.deepEqual(RETIRED_ZONES.map(z => z.requires), [
    'z_terrace', 'z_icecream', 'z_terraceSeats', 'z_photo',
    'z_splash', 'z_spa', 'z_groom', 'z_bath', 'z_boutique',
  ]);
  assert.equal(RETIRED_ZONES.reduce((s, z) => s + z.price, 0), GARDEN_CUT_PRICE + SPA_PRICE);
  for (const z of RETIRED_ZONES) assert.equal(AREA1.zones.some(a => a.id === z.id), false, `${z.id} is no longer sold`);
  // A row's requires is live or an earlier row, so one pass over the table settles every chain.
  const seen = new Set(LIVE_ZONES);
  for (const z of RETIRED_ZONES) { assert.ok(seen.has(z.requires), `${z.id} requires ${z.requires}, not yet known`); seen.add(z.id); }
  assert.ok(Object.isFrozen(RETIRED_ZONES) && RETIRED_ZONES.every(z => Object.isFrozen(z) && Object.isFrozen(z.stations)));
});

test('the whole old chain refunds every retired zone price plus the cash left on their trays', () => {
  const r = validate(headSave());
  assert.equal(r.ok, true);
  assert.equal(r.data.coins, 12345 + ALL_REFUND);
  // Nothing retired survives into the canonical save: the refund cannot be paid twice.
  assert.equal(r.data.builds.a1.some(id => SPA_ZONES.includes(id) || GARDEN_CUTS.includes(id)), false);
  assert.deepEqual(r.data.builds.a1, LIVE_ZONES, 'every live zone is kept');
  for (const id of ['register3', 'groom1', 'bath1', 'boutique1']) assert.equal(id in r.data.stationState.byId, false);
});

test('the garden cuts alone: the terrace register\'s tray is refunded with its zone', () => {
  const r = validate(headSave({ builds: { a1: HEAD_CHAIN }, stationState: { v: 1, byId: { register3: { pile: 333 } } } }));
  assert.equal(r.data.coins, 12345 + GARDEN_CUT_PRICE + 333);
  // z_icecream's machine and counter moved into z_terrace: they are live stations, not refunded.
  assert.deepEqual(RETIRED_ZONES.find(z => z.id === 'z_icecream').stations, ['coldPantry1', 'return2']);
});

test('a partial payment on a retired zone is refunded exactly; a complete or junk partial is not', () => {
  // Built through z_spa, part-way into z_groom.
  const through = [...HEAD_CHAIN, 'z_spa'];
  const partial = validate(headSave({ builds: { a1: through }, partial: { z_groom: 2500 }, stationState: { v: 1, byId: {} } }));
  assert.equal(partial.data.coins, 12345 + GARDEN_CUT_PRICE + 9000 + 2500);
  assert.deepEqual(partial.data.partial, {}, 'the retired partial does not survive either');
  const complete = validate(headSave({ builds: { a1: through }, partial: { z_groom: 6000 }, stationState: { v: 1, byId: {} } }));
  assert.equal(complete.data.coins, 12345 + GARDEN_CUT_PRICE + 9000, 'a partial at or over the price is corruption, not credit');
  const junk = validate(headSave({ builds: { a1: through }, partial: { z_groom: -40, z_bath: 'lots' }, stationState: { v: 1, byId: {} } }));
  assert.equal(junk.data.coins, 12345 + GARDEN_CUT_PRICE + 9000);
  // Unbuilt z_spa itself, part-paid, straight off the old terrace chain.
  const pad = validate(headSave({ builds: { a1: HEAD_CHAIN }, partial: { z_spa: 4321 }, stationState: { v: 1, byId: {} } }));
  assert.equal(pad.data.coins, 12345 + GARDEN_CUT_PRICE + 4321);
  // And a part-paid terrace register, on a save that had just bought the ice cream lane.
  const lane = validate(headSave({ builds: { a1: HEAD_CHAIN.slice(0, 11) }, partial: { z_register3: 1500 }, stationState: { v: 1, byId: {} } }));
  assert.equal(lane.data.coins, 12345 + 3600 + 1500);
});

test('an orphan retired id refunds nothing: the chain has to hold, as it does for live zones', () => {
  // z_groom without z_spa, and the whole spa without the terrace chain it hangs off.
  const noSpa = validate(headSave({ builds: { a1: [...HEAD_CHAIN, 'z_groom', 'z_bath'] } }));
  assert.equal(noSpa.data.coins, 12345 + GARDEN_CUT_PRICE + 333);
  const noTerrace = validate(headSave({ builds: { a1: ['z_seats1', ...GARDEN_CUTS, ...SPA_ZONES] } }));
  assert.equal(noTerrace.data.coins, 12345);
  // A forged tray pile on a zone that does not refund pays nothing either.
  const forgedTray = validate(headSave({ builds: { a1: LIVE_ZONES }, stationState: { v: 1, byId: { groom1: { pile: 99999 }, register3: { pile: 99999 } } } }));
  assert.equal(forgedTray.data.coins, 12345);
  // A pile past the wallet cap is junk, not money.
  const hugePile = retiredZoneRefund(headSave({ stationState: { v: 1, byId: { groom1: { pile: 1e12 } } } }), AREA1, LIVE_ZONES);
  assert.equal(hugePile, GARDEN_CUT_PRICE + SPA_PRICE);
});

test('re-validating the migrated save refunds nothing more', () => {
  const once = validate(headSave());
  const twice = validate(once.data);
  assert.equal(twice.ok, true);
  assert.equal(twice.data.coins, once.data.coins);
  assert.equal(retiredZoneRefund(once.data, AREA1, once.data.builds.a1), 0);
});

test('the refund is capped at the wallet ceiling', () => {
  const r = validate(headSave({ coins: SAVE_LIMITS.maxCoins - 1000 }));
  assert.equal(r.data.coins, SAVE_LIMITS.maxCoins);
});

test('a paid refund starts a fresh ledger baseline; a save with nothing to refund keeps its ledger', () => {
  assert.equal(validate(headSave()).data.ledger, null, 'the refund moved the wallet outside any recorded transaction');
  const plain = validate(headSave({ builds: { a1: LIVE_ZONES }, stationState: { v: 1, byId: {} } }));
  assert.ok(plain.data.ledger && plain.data.ledger.entries.length === 1, 'no refund, ledger preserved as before');
});

test('the table is inert while a zone is still authored', () => {
  const withSpa = { ...AREA1, zones: [...AREA1.zones, { id: 'z_spa', x: 9, z: 0.8, price: 9000, adds: [], requires: 'z_photo', label: 'Pet spa' }] };
  assert.equal(retiredZoneRefund(headSave({ builds: { a1: [...LIVE_ZONES, 'z_spa'] } }), withSpa, [...LIVE_ZONES, 'z_spa']), 0);
  assert.equal(retiredZoneRefund(headSave(), null, LIVE_ZONES), 0, 'no catalogue, no refund');
});

test('bought accessories survive the migration, and applySave carries them onto the live meta', () => {
  const r = validate(headSave());
  assert.deepEqual(r.data.meta.accessoriesBought, ['acc_beret', 'acc_scarf']);
  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  assert.ok(applySave(state, headSave(), AREA1));
  assert.deepEqual(state.meta.accessoriesBought, ['acc_beret', 'acc_scarf']);
  assert.equal(state.coins, 12345 + ALL_REFUND, 'the live wallet gets the refund through applySave too');
});

test('a carried sack of a retired supply loads as empty hands: bath water and cream alike', () => {
  const r = validate(headSave());
  assert.deepEqual(r.data.ownerState.carry, { sack: null, sackLeft: 0, fruit: 0 });
  // And directly at the owner-state boundary, beside a sack kind that still exists.
  const water = normalizeOwnerState({ v: 1, position: { x: 0, z: 0 }, products: [], carry: { sack: 'water', sackLeft: 12, fruit: 0 } }, AREA1, {});
  assert.deepEqual(water.data.carry, { sack: null, sackLeft: 0, fruit: 0 });
  // The ice cream machine needs no supply since 2026-09-19 (the cold pantry was cut): a half-used
  // cream bag has nowhere to go, so it is not handed back as one.
  const cream = normalizeOwnerState({ v: 1, position: { x: 0, z: 0 }, products: [], carry: { sack: 'cream', sackLeft: 12, fruit: 0 } }, AREA1, {});
  assert.deepEqual(cream.data.carry, { sack: null, sackLeft: 0, fruit: 0 });
  const beans = normalizeOwnerState({ v: 1, position: { x: 0, z: 0 }, products: [], carry: { sack: 'beans', sackLeft: 12, fruit: 0 } }, AREA1, {});
  assert.deepEqual(beans.data.carry, { sack: 'beans', sackLeft: 12, fruit: 0 });
  // Cones on their way to the garden stand are kept like any other product.
  const cones = normalizeOwnerState({ v: 1, position: { x: 0, z: 0 }, products: ['icecream', 'icecream'], carry: null }, AREA1, {});
  assert.deepEqual(cones.data.products, ['icecream', 'icecream']);
  // An owner saved standing in the spa is back inside the café.
  assert.ok(r.data.ownerState.position.x <= AREA1.size.w / 2 - 0.5);
});

test('a hired Photographer survives and is allowed to spawn, because the photo booth is built', () => {
  const r = validate(headSave());
  assert.equal(r.data.staff.photographer, 1, 'the hire is kept: the role moved to the staff desk');
  assert.equal(photographerSpawnAllowed(new Set(r.data.builds.a1)), true, 'z_photo is built, so prepare() spawns it (at HIRE_SPAWN)');
});

// --- the garden's moved prerequisite -------------------------------------------------------------

test('a terrace bought when it followed the smoothie bar is kept, with the lounge it now follows', () => {
  // Old chain: z_terrace required z_blender, so this save skipped the fruit garden and the lounge.
  const early = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_terrace', 'z_photo'];
  assert.deepEqual(RECHAINED_ZONES.map(z => [z.id, z.oldRequires]), [['z_terrace', 'z_blender']]);
  const r = validate(headSave({ builds: { a1: early }, partial: {}, stationState: { v: 1, byId: {} } }));
  assert.equal(r.ok, true);
  for (const id of ['z_terrace', 'z_photo', 'z_garden', 'z_seats2']) assert.ok(r.data.builds.a1.includes(id), `${id} is built after migration`);
  assert.equal(r.data.coins, 12345, 'no refund: nothing was lost');
  // The caller's save object is not touched.
  assert.equal(early.includes('z_seats2'), false);
});

test('a part-payment on the terrace that the new chain hides is paid back', () => {
  const beforeLounge = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender'];
  const r = validate(headSave({ builds: { a1: beforeLounge }, partial: { z_terrace: 2000 }, stationState: { v: 1, byId: {} } }));
  assert.equal(r.data.coins, 12345 + 2000);
  assert.deepEqual(r.data.partial, {});
  // Once the lounge is built the plot is offered again, so the part-payment simply stays on it.
  const offered = validate(headSave({ builds: { a1: [...beforeLounge, 'z_garden', 'z_seats2'] }, partial: { z_terrace: 2000 }, stationState: { v: 1, byId: {} } }));
  assert.equal(offered.data.coins, 12345);
  assert.deepEqual(offered.data.partial, { z_terrace: 2000 });
});
