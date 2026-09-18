// test/paw-rating-effects.test.js — Batch 3 (plan §3.4): the Paw Rating's four MECHANICAL effects.
//
// pawRating.js authors the numbers ("+10% arrivals, +1 resident slot, an awning set, a decor set");
// this file proves the four consumers actually read them, and — more importantly — that none of the
// effects can be reached without going through the RATCHET, and that the arrivals effect cannot
// compound past the demand model's own floor. test/paw-rating.test.js covers the rating itself.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAW_AWNING_SETS, PAW_LEGENDARY_STAR, PAW_MAX_STAR, PAW_RESIDENT_SLOTS_BASE, PAW_RESIDENT_SLOTS_MAX,
  pawArrivalMultiplier, pawAwningSetIndex, pawBestStar, pawResidentSlots,
} from '../src/sim/pawRating.js';
import {
  CROWD_CEILING, CROWD_FLOOR_INTERVAL, effectiveSpawnInterval, maxCustomers,
  pawSpawnIntervalMultiplier, spawnInterval,
} from '../src/sim/economy.js';
import { legendaryUnlocked, PET_LEGENDARY_PAW_STAR, PET_PROFILES } from '../src/sim/petBook.js';
import { PET_IDENTITY_POOL } from '../src/sim/regularVisitors.js';
import { currentResidentStars, residentSlotCount } from '../src/systems/residentPets.js';
import { AWNING_SETS } from '../src/render/props.js';
import { C } from '../src/render/palette.js';

const STARS = [0, 1, 2, 3, 4, 5];
const BUILT_LEVELS = [
  new Set(['z_counter']),
  new Set(['z_counter', 'z_oven2']),
  new Set(['z_counter', 'z_oven2', 'z_coffee', 'z_blender']),
];
// followers.spawnIntervalMultiplier's authored range: 1 at zero followers, hard-floored at 1/1.5.
const FOLLOWER_MULTS = [1, 1 / 1.2, 1 / 1.5];

// ---- effect 1: arrivals ---------------------------------------------------------------------------

test('+10% arrivals per star is a DIVISION of the interval, clamped to the authored star range', () => {
  assert.equal(pawArrivalMultiplier(0), 1);
  assert.ok(Math.abs(pawArrivalMultiplier(5) - 1.5) < 1e-12);
  assert.equal(pawSpawnIntervalMultiplier(0), 1);
  assert.ok(Math.abs(pawSpawnIntervalMultiplier(5) - 1 / 1.5) < 1e-12);
  // 10% MORE ARRIVALS is 1/1.1 of the interval, not 0.9 of it. Getting this backwards would make
  // every star ~1% weaker than authored and the error would compound five times over.
  assert.ok(Math.abs(pawSpawnIntervalMultiplier(1) - 1 / 1.1) < 1e-12);
  // Out-of-range stars cannot buy more than ★5's bonus, in either direction.
  assert.equal(pawSpawnIntervalMultiplier(99), pawSpawnIntervalMultiplier(PAW_MAX_STAR));
  assert.equal(pawSpawnIntervalMultiplier(-3), 1);
});

test('an unrated café with no followers gets exactly the old spawnInterval, to the bit', () => {
  for (const built of BUILT_LEVELS) {
    for (const level of [0, 8, 24, 500]) {
      assert.equal(effectiveSpawnInterval(built, { runner: 1 }, level), spawnInterval(built, { runner: 1 }, level));
    }
  }
});

test('no combination of stars, followers and café level outruns CROWD_FLOOR_INTERVAL', () => {
  // The compounding case this test exists for: before Batch 3 the follower multiplier landed at the
  // call site, PAST spawnInterval's own clamp, so 2000 followers alone already reached 1.47s against
  // a documented floor of 2.2s. Stacking ★5 on top of that reaches 0.98s.
  const built = BUILT_LEVELS[2];
  const staff = { runner: 1, cashier: 1 };
  assert.ok(spawnInterval(built, staff, 500) * (1 / 1.5) * (1 / 1.5) < CROWD_FLOOR_INTERVAL, 'the unclamped product really does breach the floor');
  for (const level of [0, 8, 12, 24, 60, 500]) {
    for (const followerMult of FOLLOWER_MULTS) {
      for (const pawStars of STARS) {
        const iv = effectiveSpawnInterval(built, staff, level, { followerMult, pawStars });
        assert.ok(iv >= CROWD_FLOOR_INTERVAL, `level ${level} / fm ${followerMult} / ★${pawStars} gave ${iv}`);
      }
    }
  }
});

test('stars only ever make the room busier, never slower, and never overshoot their own bonus', () => {
  const built = BUILT_LEVELS[1];
  for (const level of [0, 8, 20]) {
    for (const followerMult of FOLLOWER_MULTS) {
      let prev = Infinity;
      for (const pawStars of STARS) {
        const iv = effectiveSpawnInterval(built, {}, level, { followerMult, pawStars });
        assert.ok(iv <= prev + 1e-12, `★${pawStars} must not be slower than ★${pawStars - 1}`);
        prev = iv;
      }
      const zero = effectiveSpawnInterval(built, {}, level, { followerMult, pawStars: 0 });
      const five = effectiveSpawnInterval(built, {}, level, { followerMult, pawStars: 5 });
      // ★5 is worth at most the authored 1.5x arrival rate — the clamp may make it worth less, but
      // nothing may make it worth more.
      assert.ok(five >= zero / 1.5 - 1e-12, 'the arrivals bonus exceeded its authored size');
    }
  }
});

test('a bad opts object cannot silently turn the arrivals bonus into a spawn storm', () => {
  const built = BUILT_LEVELS[0];
  const base = spawnInterval(built, {}, 0);
  for (const opts of [{}, { followerMult: 0 }, { followerMult: -2 }, { followerMult: NaN }, { followerMult: null }, { pawStars: NaN }]) {
    assert.equal(effectiveSpawnInterval(built, {}, 0, opts), base, JSON.stringify(opts));
  }
});

test('the rating buys arrivals, not capacity: CROWD_CEILING is untouched by stars', () => {
  // A star is worth +1 RESIDENT slot, not +1 guest, so maxCustomers takes no Paw input at all.
  // Feeding it one anyway must change nothing — that is what stops a later "while we are at it"
  // capacity bonus from sliding past the ceiling the nav grid and seating are balanced against.
  for (const built of BUILT_LEVELS) {
    for (const level of [0, 8, 500]) {
      const cap = maxCustomers(built, { runner: 1, cashier: 1 }, level);
      assert.ok(cap <= CROWD_CEILING);
      assert.equal(maxCustomers(built, { runner: 1, cashier: 1 }, level, PAW_MAX_STAR), cap, 'stars must not buy guest capacity');
    }
  }
});

// ---- effect 2: resident slots -----------------------------------------------------------------------

test('currentResidentStars reads the ratchet on meta, and is null-safe at every level', () => {
  assert.equal(currentResidentStars({ meta: { pawBest: 3 } }), 3);
  assert.equal(currentResidentStars({ meta: {} }), 0);
  assert.equal(currentResidentStars({}), 0, 'main.js builds this module before G.restore() lands a meta');
  assert.equal(currentResidentStars(null), 0);
  assert.equal(currentResidentStars(undefined), 0);
  // meta.pawBest is clamped at the save boundary, but a forged in-memory value must not escape here.
  assert.equal(currentResidentStars({ meta: { pawBest: 99 } }), PAW_MAX_STAR);
  assert.equal(currentResidentStars({ meta: { pawBest: -4 } }), 0);
  assert.equal(currentResidentStars({ meta: { pawBest: 'five' } }), 0);
});

test('residentSlotCount(currentResidentStars(G)) is exactly pawResidentSlots(best)', () => {
  // Two files author the same 3/+1/8 rule (residentPets.js predates the rating). They must agree at
  // every star or a slot opens in one and not the other.
  for (const star of STARS) {
    const G = { meta: { pawBest: star } };
    assert.equal(residentSlotCount(currentResidentStars(G)), pawResidentSlots(star), `★${star}`);
  }
  assert.equal(pawResidentSlots(0), PAW_RESIDENT_SLOTS_BASE);
  assert.equal(pawResidentSlots(PAW_MAX_STAR), PAW_RESIDENT_SLOTS_BASE + PAW_MAX_STAR);
  assert.ok(PAW_RESIDENT_SLOTS_BASE + PAW_MAX_STAR <= PAW_RESIDENT_SLOTS_MAX);
});

// ---- effect 3: the awning set -------------------------------------------------------------------------

test('AWNING_SETS holds one set per star, and ★0 is bit-for-bit the pre-rating café', () => {
  assert.equal(AWNING_SETS.length, PAW_AWNING_SETS);
  assert.deepEqual(AWNING_SETS[0], [C.coral, C.cream], 'an unrated café must look exactly as it always did');
  for (const set of AWNING_SETS) {
    assert.equal(set.length, 2, 'setSet() retints exactly two stripe materials');
    for (const hex of set) assert.match(hex, /^#[0-9A-Fa-f]{6}$/);
  }
  const seen = new Set(AWNING_SETS.map(set => set.join('/')));
  assert.equal(seen.size, AWNING_SETS.length, 'every star must actually change the awning');
});

test('pawAwningSetIndex lands inside AWNING_SETS for every star, in and out of range', () => {
  for (const star of STARS) {
    const idx = pawAwningSetIndex(star);
    assert.equal(idx, star, `★${star} draws set ${star}`);
    assert.ok(AWNING_SETS[idx], `set ${idx} exists`);
  }
  assert.equal(pawAwningSetIndex(99), AWNING_SETS.length - 1);
  assert.equal(pawAwningSetIndex(-1), 0);
  assert.equal(pawAwningSetIndex(pawBestStar(null)), 0);
});

// ---- effect 4 (the ★4 unlock): legendary coats ------------------------------------------------------

test('legendaryUnlocked reads meta.pawBest and opens at exactly the authored star', () => {
  assert.equal(PET_LEGENDARY_PAW_STAR, PAW_LEGENDARY_STAR, 'petBook duplicates this number to stay a leaf; it must not drift');
  for (let star = 0; star < PAW_LEGENDARY_STAR; star++) {
    assert.equal(legendaryUnlocked({ pawBest: star }), false, `★${star} must stay locked`);
  }
  assert.equal(legendaryUnlocked({ pawBest: PAW_LEGENDARY_STAR }), true);
  assert.equal(legendaryUnlocked({ pawBest: PAW_MAX_STAR }), true);
});

test('legendaryUnlocked fails CLOSED for every shape that is not a rated meta', () => {
  // sim/completion.js calls it with no argument at all; the safe answer there is "still locked".
  assert.equal(legendaryUnlocked(), false);
  assert.equal(legendaryUnlocked(null), false);
  assert.equal(legendaryUnlocked({}), false);
  assert.equal(legendaryUnlocked('cat:4'), false);
  // Neither of the OTHER star-shaped fields in this save is the Paw Rating: `stars` is the per-
  // station star tier map, and there is no `paw` field at all.
  assert.equal(legendaryUnlocked({ stars: 99 }), false);
  assert.equal(legendaryUnlocked({ paw: 5, stars: 99 }), false);
});

test('the frozen identity pool is not, and must never become, the legendary gate', async () => {
  // THE MODULE-LOAD TRAP. regularVisitors.js builds PET_IDENTITY_POOL as a frozen top-level const.
  // While legendaryUnlocked() was a hardcoded `false` that was sound; now that it reads live meta,
  // any legendaryUnlocked() call left at module scope would freeze whatever the rating happened to
  // be at import time — which for a pool built before G.restore() is ALWAYS 0, so ★4 would unlock
  // nothing. The pool below is therefore the base 16 coats and must stay that way whatever the
  // rating says; the gate has to be applied per call, from the meta the caller holds.
  assert.equal(PET_IDENTITY_POOL.length, 16);
  for (const row of PET_IDENTITY_POOL) {
    assert.notEqual(PET_PROFILES[row.species][row.variant].rarity, 'legendary', `${row.key} must not be walk-in-able from the base pool`);
  }
  assert.equal(legendaryUnlocked({ pawBest: PAW_MAX_STAR }), true, 'the gate itself is open at ★5 even though the frozen pool is not');

  // Once wiringNeeded section A lands, regularVisitors.js exports the per-call resolver; from that
  // moment this becomes a real guard on both directions of the gate rather than documentation.
  const regulars = await import('../src/sim/regularVisitors.js');
  if (typeof regulars.petIdentityPool === 'function') {
    assert.equal(regulars.petIdentityPool(null).length, 16, 'no meta = locked');
    assert.equal(regulars.petIdentityPool({ pawBest: PAW_LEGENDARY_STAR - 1 }).length, 16);
    assert.equal(regulars.petIdentityPool({ pawBest: PAW_LEGENDARY_STAR }).length, 20);
    // The congestion fallback is the path Batch 2 closed: a locked legendary must not be reachable
    // as an anonymous coat either.
    const jammed = new Set(regulars.petIdentityPool(null).map(row => row.key));
    const pick = regulars.resolveUniquePetIdentity('cat', 4, jammed, null, { pawBest: 0 });
    assert.notEqual(PET_PROFILES[pick.species][pick.variant].rarity, 'legendary', 'a locked legendary leaked through the anonymous fallback');
  }
});
