// test/pet-arrivals.test.js — WHICH pets visit, and WHEN (Batch E1, ship plan §1.6b).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES_UNLOCK, dailyPetPlan, fondestRegular, isNewFaceDay, isParadeDay,
  unlockedPetKeys, unlockedSpecies, unmetLegendaryKeys, unmetPetKeys,
} from '../src/sim/petArrivals.js';
import { PET_SPECIES, PET_PROFILES, petKey, LEGENDARY_VARIANT_INDEX, PET_LEGENDARY_PAW_STAR } from '../src/sim/petBook.js';
import { PAW_LEGENDARY_STAR } from '../src/sim/pawRating.js';
import { createCustomerSpawnSequence } from '../src/sim/customerSpawn.js';
import { resolveUniquePetIdentity, petIdentityPool } from '../src/sim/regularVisitors.js';

const book = keys => Object.fromEntries(keys.map(k => [k, 1]));
const day1 = new Set();
const withTreats = new Set(['z_bowl']);
const whole = new Set(['z_bowl', 'z_terrace']);

test('species arrive with the café, not all at once', () => {
  assert.deepEqual(unlockedSpecies(day1), ['cat', 'dog']);
  assert.deepEqual(unlockedSpecies(withTreats), ['cat', 'dog', 'bunny']);
  assert.deepEqual(unlockedSpecies(whole), PET_SPECIES.slice());
  assert.deepEqual(SPECIES_UNLOCK, { bunny: 'z_bowl', hamster: 'z_terrace' });
  // Null/array/Set all work, and the day-1 pair is the safe floor.
  assert.deepEqual(unlockedSpecies(null), ['cat', 'dog']);
  assert.deepEqual(unlockedSpecies(['z_bowl']), ['cat', 'dog', 'bunny']);
});

test('legendary coats wait for ★3 and nothing else lets them in', () => {
  assert.equal(PET_LEGENDARY_PAW_STAR, 3);
  assert.equal(PAW_LEGENDARY_STAR, PET_LEGENDARY_PAW_STAR, 'the two authored numbers must not drift');
  const early = unlockedPetKeys({ pawBest: 2 }, whole);
  assert.equal(early.length, 16, 'four species of four base coats');
  assert.equal(early.some(k => k.endsWith(`:${LEGENDARY_VARIANT_INDEX}`)), false);
  const late = unlockedPetKeys({ pawBest: 3 }, whole);
  assert.equal(late.length, 20);
  assert.equal(late.filter(k => k.endsWith(`:${LEGENDARY_VARIANT_INDEX}`)).length, 4);
});

test('a locked species cannot arrive even through the identity pool\'s congestion fallback', () => {
  // The fallback walks the WHOLE pool when every other identity is on screen, and whatever it
  // returns is rendered — so gating only the spawn roll would leave it as a working back door.
  const allowed = unlockedSpecies(day1);
  const pool = petIdentityPool({}, allowed);
  assert.equal(pool.every(row => allowed.includes(row.species)), true);
  const busy = new Set(pool.map(row => row.key));
  const picked = resolveUniquePetIdentity('bunny', 0, busy, 'bunny:0', {}, allowed);
  assert.ok(allowed.includes(picked.species), `fallback returned ${picked.species}`);
  // With no `allowed` argument every caller behaves exactly as before.
  assert.equal(petIdentityPool({}).length, 16);
});

test('the seeded spawn stream consumes the same RNG draws whatever the species gate says', () => {
  const wide = createCustomerSpawnSequence();
  const narrow = createCustomerSpawnSequence();
  for (let i = 0; i < 40; i++) {
    const a = wide.next(0, null, null);
    const b = narrow.next(0, null, ['cat', 'dog']);
    assert.equal(a.rngDraws, b.rngDraws, 'the rotation is a counter, never a draw');
    assert.equal(a.petVariant, b.petVariant, 'the same variant bag, in the same order');
    assert.deepEqual(a.variant, b.variant);
    assert.ok(['cat', 'dog'].includes(b.species));
  }
  assert.deepEqual(wide.snapshot().rngDraws, narrow.snapshot().rngDraws);
});

test('a new face is guaranteed at least every second day while the book is incomplete', () => {
  const meta = { petBook: {} };
  let lastNew = 0;
  for (let day = 1; day <= 12; day++) {
    const plan = dailyPetPlan(meta, day, whole);
    assert.ok(plan, `day ${day} promises somebody`);
    if (plan.kind === 'new' || plan.kind === 'parade') {
      assert.ok(day - lastNew <= 2, `gap of ${day - lastNew} days before day ${day}`);
      lastNew = day;
      meta.petBook[plan.key] = 1; // the guest actually turned up
    }
    assert.ok(day - lastNew <= 2, `day ${day} is at most one day after a new face`);
  }
});

test('the days between bring a named regular back', () => {
  const meta = { petBook: book(['cat:0', 'dog:0', 'bunny:0']), petFriendship: { 'cat:0': 6, 'dog:0': 2 } };
  const plan = dailyPetPlan(meta, 2, whole);
  assert.equal(plan.kind, 'regular');
  // Regulars (2+ visits) are ranked fondest-first and then ROTATED by day, so the same face is not
  // the answer every single time: cat:0 (6 visits) leads, dog:0 (2) takes the next regular day.
  assert.equal(fondestRegular(meta, whole, 1), 'cat:0');
  assert.equal(plan.key, 'dog:0');
  assert.equal(fondestRegular(meta, whole, 3), 'cat:0');
  // A café nobody has visited yet promises a new face instead of a fake "welcome back".
  assert.equal(dailyPetPlan({ petBook: {} }, 2, whole).kind, 'new');
  assert.equal(fondestRegular({ petBook: {}, petFriendship: {} }, whole, 2), null);
});

test('Sunday is the Pet Parade: a legendary once ★3, otherwise still somebody special', () => {
  for (const day of [7, 14, 21]) assert.equal(isParadeDay(day), true, `day ${day} is a Sunday`);
  for (const day of [1, 6, 8, 13]) assert.equal(isParadeDay(day), false);

  const everythingMet = book(unlockedPetKeys({ pawBest: 2 }, whole));
  const atStar3 = { pawBest: 3, petBook: everythingMet, petFriendship: { 'cat:0': 9 } };
  const parade = dailyPetPlan(atStar3, 7, whole);
  assert.equal(parade.kind, 'parade');
  assert.ok(parade.key.endsWith(`:${LEGENDARY_VARIANT_INDEX}`), 'a legendary leads the parade');
  assert.deepEqual(unmetLegendaryKeys(atStar3, whole).length, 4);

  // Before ★3 there are no legendaries, so the parade brings an unmet ordinary pet...
  const early = { pawBest: 1, petBook: book(['cat:0']), petFriendship: { 'cat:0': 4 } };
  assert.equal(dailyPetPlan(early, 7, whole).kind, 'parade');
  assert.equal(unmetLegendaryKeys(early, whole).length, 0);
  // ...and a café whose book is finished still gets a parade, with its fondest regular.
  const done = { pawBest: 5, petBook: book(unlockedPetKeys({ pawBest: 5 }, whole)), petFriendship: { 'dog:2': 30 } };
  const full = dailyPetPlan(done, 7, whole);
  assert.equal(full.kind, 'parade');
  assert.equal(full.key, 'dog:2');
});

test('the plan is pure and deterministic: the same inputs always name the same face', () => {
  const meta = { petBook: book(['cat:0', 'cat:1']), petFriendship: { 'cat:0': 3, 'cat:1': 3 } };
  const before = JSON.stringify(meta);
  for (let day = 1; day <= 20; day++) {
    assert.deepEqual(dailyPetPlan(meta, day, whole), dailyPetPlan(meta, day, whole));
  }
  assert.equal(JSON.stringify(meta), before, 'the plan writes nothing');
  assert.equal(isNewFaceDay(1), true);
  assert.equal(isNewFaceDay(2), false);
});

test('an unmet pet is never one the café has not opened', () => {
  const unmet = unmetPetKeys({ petBook: {} }, day1);
  assert.equal(unmet.length, PET_PROFILES.cat.length - 1 + PET_PROFILES.dog.length - 1, 'cats and dogs, no legendaries');
  for (const key of unmet) assert.ok(key.startsWith('cat:') || key.startsWith('dog:'), key);
  assert.equal(unmet.includes(petKey('bunny', 0)), false);
});
