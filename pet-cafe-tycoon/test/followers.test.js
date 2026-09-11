import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLLOWER_CAP, clampFollowers, followersForShot, followersForDiscovery, followersForBestie,
  followersForGoldenPaw, addFollowers, spawnIntervalMultiplier, weightedVariantWeights,
  FOLLOWER_MILESTONES, followerMilestoneTier, nextFollowerMilestone, cafeSignColor,
  followerTierUnlocked, CAFE_SIGN_COLORS,
} from '../src/sim/followers.js';
import { PET_VARIANT_WEIGHTS } from '../src/sim/petBook.js';

test('clampFollowers bounds to [0, cap] and rejects non-finite input', () => {
  assert.equal(clampFollowers(-5), 0);
  assert.equal(clampFollowers(4210.9), 4210);
  assert.equal(clampFollowers(FOLLOWER_CAP + 1), FOLLOWER_CAP);
  // Matches saveSchema's finiteNumber() convention: a non-finite value is treated as "not a real
  // number" and falls back to 0, the same as NaN, rather than being read as "arbitrarily large".
  assert.equal(clampFollowers(Infinity), 0);
  assert.equal(clampFollowers(NaN), 0);
  assert.equal(clampFollowers('lots'), 0);
});

test('followersForShot: first photo, other shot and Perfect bonus are additive', () => {
  assert.equal(followersForShot({ isFirstPhotoOfPet: true, isPerfect: false }), 10);
  assert.equal(followersForShot({ isFirstPhotoOfPet: false, isPerfect: false }), 1);
  assert.equal(followersForShot({ isFirstPhotoOfPet: false, isPerfect: true }), 1 + 3);
  assert.equal(followersForShot({ isFirstPhotoOfPet: true, isPerfect: true }), 10 + 3);
  assert.equal(followersForShot(), 1); // default: neither flag set
});

test('discovery/bestie/golden-paw sources match the plan', () => {
  assert.equal(followersForDiscovery(), 5);
  assert.equal(followersForBestie(), 15);
  assert.equal(followersForGoldenPaw(), 200);
});

test('addFollowers clamps the running total and never subtracts', () => {
  assert.equal(addFollowers(10, 5), 15);
  assert.equal(addFollowers(10, -5), 10); // negative deltas are ignored, not applied
  assert.equal(addFollowers(FOLLOWER_CAP - 2, 10), FOLLOWER_CAP);
  assert.equal(addFollowers(-40, 5), 5); // a corrupt negative base still yields a sane result
});

test('spawnIntervalMultiplier is 1 at zero followers and bottoms out at the hard cap', () => {
  assert.equal(spawnIntervalMultiplier(0), 1);
  assert.ok(Math.abs(spawnIntervalMultiplier(2000) - 1 / 1.5) < 1e-9);
  const atCap = spawnIntervalMultiplier(4000);
  const wayOver = spawnIntervalMultiplier(1_000_000);
  assert.ok(Math.abs(atCap - wayOver) < 1e-9, 'the multiplier must not keep shrinking past the cap');
  assert.ok(Math.abs(atCap - 1 / 1.5) < 1e-9);
  assert.ok(atCap > 0.66 && atCap < 0.67);
});

test('weightedVariantWeights redistributes toward rare/epic and never changes bag size', () => {
  const base = PET_VARIANT_WEIGHTS.slice(); // [0,0,0,1,1,1,2,2,3]
  const countOf = (arr, v) => arr.filter(x => x === v).length;

  const untouched = weightedVariantWeights(base, 0);
  assert.deepEqual(untouched, base);
  assert.notEqual(untouched, base, 'must return a fresh array, not the caller-owned one');

  // One 500-follower step moves exactly one slot from the lowest tier that has spare slots (0)
  // up to its neighbour (1); the total bag size and every other tier are untouched.
  const shifted = weightedVariantWeights(base, 500);
  assert.equal(shifted.length, base.length, 'bag size is invariant');
  assert.equal(countOf(shifted, 0), 2);
  assert.equal(countOf(shifted, 1), 4);
  assert.equal(countOf(shifted, 2), 2);
  assert.equal(countOf(shifted, 3), 1);

  // The epic tier is capped at 3x its authored count (1 -> 3), no matter how many followers.
  const capped = weightedVariantWeights(base, 1_000_000);
  assert.equal(countOf(capped, 3), 3);
  assert.equal(capped.length, base.length);
  // Bounded further: the array must still only contain the originally authored tier values.
  for (const v of capped) assert.ok(base.includes(v));
});

test('weightedVariantWeights is a no-op on degenerate input', () => {
  assert.deepEqual(weightedVariantWeights([], 5000), []);
  assert.deepEqual(weightedVariantWeights([2], 5000), [2]);
  assert.equal(weightedVariantWeights(null, 5000), null);
});

test('follower milestones gate accessory tiers in order', () => {
  assert.equal(followerMilestoneTier(0), 0);
  assert.equal(followerMilestoneTier(99), 0);
  assert.equal(followerMilestoneTier(100), 1);
  assert.equal(followerMilestoneTier(499), 1);
  assert.equal(followerMilestoneTier(500), 2);
  assert.equal(followerMilestoneTier(2000), 3);
  assert.equal(followerMilestoneTier(5000), 4);
  assert.equal(followerMilestoneTier(999_999), FOLLOWER_MILESTONES.length);

  assert.equal(nextFollowerMilestone(0), 100);
  assert.equal(nextFollowerMilestone(4999), 5000);
  assert.equal(nextFollowerMilestone(5000), null);

  assert.equal(followerTierUnlocked(0, 0), true); // tier 0 (base) is always unlocked
  assert.equal(followerTierUnlocked(1, 99), false);
  assert.equal(followerTierUnlocked(1, 100), true);
  assert.equal(followerTierUnlocked(4, 4999), false);
  assert.equal(followerTierUnlocked(4, 5000), true);
});

test('cafeSignColor stays within the authored palette at every follower count', () => {
  for (const f of [0, 100, 500, 2000, 5000, 999_999]) {
    assert.ok(CAFE_SIGN_COLORS.includes(cafeSignColor(f)));
  }
});
