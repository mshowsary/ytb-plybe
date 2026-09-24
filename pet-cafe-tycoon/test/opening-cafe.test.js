// test/opening-cafe.test.js — THE FIRST THREE SECONDS (Batch E1, ship plan §1.6).
//
// t = 0 used to be an empty room with no tables and no coins. The state asserted here is what the
// player now opens on, and the affordability assertion is derived from data/area1.js rather than
// from a copied number, so a re-priced first pad cannot silently break the promise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, activeZones, sweepTipJars } from '../src/sim/world.js';
import { createCustomer, stepCustomers, EAT_TIME } from '../src/sim/customers.js';
import {
  OPENING_COINS, OPENING_GUESTS, OPENING_RESIDENT, OPENING_TABLE_TIP, openingSeatIds, seedOpeningCafe,
} from '../src/sim/opening.js';
import { parsePetKey } from '../src/sim/petBook.js';
import { unlockedSpecies } from '../src/sim/petArrivals.js';

const seed = (world, list = []) => {
  let id = 1000000;
  return { made: seedOpeningCafe(world, list, AREA1, () => id++), list };
};

test('the café owns two tables before anything is bought', () => {
  const w = createWorld(AREA1);
  const seats = [...w.stations.values()].filter(st => st.type === 'seat' && st.active).map(st => st.id);
  assert.deepEqual(seats.sort(), openingSeatIds().slice().sort());
  assert.equal(seats.length, 2);
  // ...and the purchased tables are still purchases.
  assert.equal(w.stations.get('seat3').active, false);
  assert.equal(w.stations.get('seat6').active, false);
  // The interior still has four tables in total, exactly as before Batch E1 — the two bought ones
  // just moved one zone later.
  assert.equal([...w.stations.values()].filter(st => st.type === 'seat' && !st.builtBy).length, 2);
});

test('two guests are seated with their pets at t = 0, mid-meal and already paid', () => {
  const w = createWorld(AREA1);
  const { made, list } = seed(w);
  assert.equal(made.length, 2);
  assert.equal(list.length, 2);
  for (const c of made) {
    assert.equal(c.state, 'eating');
    assert.equal(c.paid, true, 'a seated guest has already paid; they owe the register nothing');
    assert.ok(c.seat && c.seat.occupied, 'their table is theirs');
    assert.equal(c.done, false);
    assert.ok(c.timer >= 0 && c.timer < EAT_TIME, 'mid-meal, not about to vanish');
    // They are AT the table, not walking to it: the render layer seats them directly.
    assert.ok(Math.hypot(c.x - c.seat.pair.human.x, c.z - c.seat.pair.human.z) < 1e-9);
    assert.equal(c.mover.hasTarget, false);
  }
  // One cat and one dog: the only two species a day-1 café has opened (§1.6b).
  const species = made.map(c => c.species).sort();
  assert.deepEqual(species, ['cat', 'dog']);
  for (const s of species) assert.ok(unlockedSpecies(w.built).includes(s), `${s} visits from day 1`);
});

test('the opening pair finish their meal and leave through the normal sim, seeding no ghosts', () => {
  const w = createWorld(AREA1);
  const { list } = seed(w);
  const price = () => 5;
  for (let i = 0; i < 30 * 40 && list.some(c => !c.done); i++) stepCustomers(list, w, price, 1 / 30);
  assert.ok(list.every(c => c.done), 'both walk out on their own');
  for (const id of openingSeatIds()) assert.equal(w.stations.get(id).occupied, false, 'no seat leak');
});

test('the wallet plus the tips on the tables clears the first build pad inside the first minute', () => {
  const w = createWorld(AREA1);
  seed(w);
  const open = activeZones(w);
  assert.equal(open.length, 1, 'exactly one pad is open at t = 0');
  const firstPad = open[0];
  const tips = sweepTipJars(w);
  assert.equal(tips.total, OPENING_TABLE_TIP * 2);
  assert.equal(tips.spots.length, 2);
  // THE PROMISE (§1.6): the first build is affordable within the first half-minute WITHOUT a single
  // sale — the player only has to walk past the two tables their guests tipped on.
  assert.ok(OPENING_COINS + tips.total >= firstPad.price,
    `${OPENING_COINS} + ${tips.total} tips must cover the ${firstPad.price}-coin ${firstPad.id}`);
  // ...and it is not free either: the wallet alone is not enough.
  assert.ok(OPENING_COINS < firstPad.price, 'the first build is still something to reach for');
});

test('the tip sweep is idempotent and only ever touches active stations', () => {
  const w = createWorld(AREA1);
  seed(w);
  assert.ok(sweepTipJars(w).total > 0);
  assert.deepEqual(sweepTipJars(w), { total: 0, spots: [] }, 'a second sweep takes nothing');
  // An inert station's pile is left alone: it belongs to a room that is not open yet.
  const locked = w.stations.get('barIce');
  locked.pile = 500;
  assert.equal(sweepTipJars(w).total, 0);
  assert.equal(locked.pile, 500);
});

test('the café opens with a resident cat, and it is a real authored pet', () => {
  const parsed = parsePetKey(OPENING_RESIDENT);
  assert.ok(parsed, 'OPENING_RESIDENT is a valid pet key');
  assert.equal(parsed.species, 'cat');
  assert.notEqual(parsed.variant, 4, 'never a legendary coat: those are ★3 content');
  assert.equal(OPENING_COINS, 25, 'the plan\'s "~25 coins"');
});

test('seeding is refused rather than doubled when the tables are already in use', () => {
  const w = createWorld(AREA1);
  const first = seed(w);
  assert.equal(first.made.length, 2);
  const second = seed(w, first.list);
  assert.equal(second.made.length, 0, 'a restore must never get a second opening pair');
  assert.equal(first.list.length, 2);
  // And a world with no tables at all is a no-op rather than a throw.
  const bare = { stations: new Map(), built: new Set() };
  assert.deepEqual(seedOpeningCafe(bare, [], AREA1, () => 1), []);
  assert.deepEqual(seedOpeningCafe(null, [], AREA1, () => 1), []);
  assert.deepEqual(seedOpeningCafe(w, [], AREA1, null), []);
});

test('the opening pair are authored, so the seeded spawn stream is untouched', () => {
  // They take ids from a counter of their own; nothing here draws from createCustomerSpawnSequence.
  const w = createWorld(AREA1);
  const { made } = seed(w);
  for (const c of made) assert.ok(c.id >= 1000000, 'authored id range, never a spawn-sequence id');
  assert.equal(OPENING_GUESTS.length, 2);
  // A plain spawn-sequence guest can still take the id space below it.
  const ordinary = createCustomer(1, 'cat', { shirt: 0, hair: 0, skin: 0 }, AREA1);
  assert.equal(ordinary.id, 1);
});
