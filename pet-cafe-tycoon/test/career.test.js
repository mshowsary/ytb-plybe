import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureCareer, recordCareerShift,
  weeklyCupState, awardWeeklyCup, recordRecipeOrder, masteryLevel,
  masteryMultiplier, masteryProgress, renovationState, buyRenovation,
  RENOVATIONS, LEGENDARY_REPUTATION,
} from '../src/sim/career.js';

test('migrated meta receives safe long-term career state', () => {
  const meta = { reputation: 25 };
  const c = ensureCareer(meta);
  assert.deepEqual(c.trophies, { bronze: 0, silver: 0, gold: 0 });
  assert.equal(c.recipeSales.cookie, 0);
  assert.deepEqual(c.history, {});
  assert.equal(c.renovationLevel, 0);
  assert.equal(LEGENDARY_REPUTATION, 220);
});

// THE DAILY GOAL LEFT THIS FILE (Batch E1, ship plan 1.6). The adaptive weekly "rival" contract and
// the special-day theme merged into one goal with one reward, implemented in src/sim/dailyGoal.js
// and covered by test/daily-goal.test.js. The two contract tests that lived here -- week-one
// variety, and week two beating last week's same weekday -- pinned the rival mechanic itself, which
// the plan deliberately removed: targets now come from durable cafe capacity, so deliberately
// serving fewer guests can never buy an easier goal, and that IS asserted in the new file.
// career.js keeps four compatibility re-exports for legacy tools/ harnesses; the seam is tested in
// test/daily-goal.test.js too.

test('weekly cup scores ratings + completed contracts and awards once', () => {
  const meta = {};
  for (let day = 1; day <= 7; day++) recordCareerShift(meta, day, { served: 40, lost: 0, earned: 600, bestStreak: 10 }, 3, day !== 5);
  const before = weeklyCupState(meta, 7);
  assert.equal(before.played, 7);
  assert.equal(before.points, 27); // six 4-point days + one 3-point day
  assert.equal(before.tier, 'gold');
  const award = awardWeeklyCup(meta, 7);
  assert.equal(award.awarded, true); assert.equal(award.tier, 'gold'); assert.equal(award.reward, 1600);
  assert.equal(meta.career.trophies.gold, 1);
  const repeat = awardWeeklyCup(meta, 7);
  assert.equal(repeat.awarded, false); assert.equal(meta.career.trophies.gold, 1);
});

test('recipe mastery is family-aware, permanent and economically small', () => {
  const meta = {};
  for (let i = 0; i < 24; i++) recordRecipeOrder(meta, ['cookie']);
  assert.equal(masteryLevel(meta, 'cookie'), 0);
  const ups = recordRecipeOrder(meta, ['brownie']); // brownie shares Bakery mastery
  assert.equal(masteryLevel(meta, 'cookie'), 1);
  assert.equal(ups.length, 1); assert.equal(ups[0].label, 'Bakery');
  assert.equal(masteryMultiplier(meta, 'brownie'), 1.03);
  const p = masteryProgress(meta, 'cookie');
  assert.equal(p.level, 1); assert.equal(p.sales, 25); assert.equal(p.bonus, 3);
  assert.ok(p.frac >= 0 && p.frac <= 1);
});

// CAFE THEMES: the same five makeovers, re-gated in Batch E1 on a Cafe Star instead of on
// reputation (a number the UI no longer draws anywhere, so the wait had no picture and no way to
// hurry it). Same shape of gate, same buy-once-per-level rule, new currency for the lock.
test('cafe themes are a late-game coin sink gated by a Cafe Star and buy exactly once per level', () => {
  const meta = {};
  const r = renovationState(meta, 99999, 0);
  assert.equal(r.level, 0); assert.equal(r.next.name, 'Greenhouse Glow'); assert.equal(r.starReady, false);
  const refused = buyRenovation(meta, 99999, 0);
  assert.equal(refused.reason, 'stars');
  assert.equal(refused.requiredStar, RENOVATIONS[0].star);

  assert.equal(buyRenovation(meta, RENOVATIONS[0].cost - 1, RENOVATIONS[0].star).reason, 'coins');
  const bought = buyRenovation(meta, RENOVATIONS[0].cost + 250, RENOVATIONS[0].star);
  assert.equal(bought.ok, true); assert.equal(bought.level, 1); assert.equal(bought.coins, 250);
  assert.equal(meta.career.renovationLevel, 1);
  assert.equal(renovationState(meta, 0, 5).next.name, 'Gallery Café');
});

test('the theme prices and star gates are the ship plan 1.6c ladder', () => {
  assert.deepEqual(RENOVATIONS.map(r => r.cost), [2000, 4000, 6500, 9000, 12000]);
  assert.deepEqual(RENOVATIONS.map(r => r.star), [3, 4, 4, 4, 4]);
  // No theme may wait on star 5: star 5's own last row is "every theme owned", so a theme gated
  // there would be an unopenable deadlock.
  for (const r of RENOVATIONS) assert.ok(r.star < 5, `${r.name} must not need the final star`);
  // Every level costs strictly more than the one before it.
  for (let i = 1; i < RENOVATIONS.length; i++) assert.ok(RENOVATIONS[i].cost > RENOVATIONS[i - 1].cost);
});

test('the theme track has a finite visible endpoint', () => {
  const meta = {};
  let coins = 999999;
  for (let i = 0; i < RENOVATIONS.length; i++) {
    const b = buyRenovation(meta, coins, 5); assert.equal(b.ok, true); coins = b.coins;
  }
  const done = renovationState(meta, coins, 5);
  assert.equal(done.complete, true); assert.equal(done.level, RENOVATIONS.length); assert.equal(done.next, null);
  assert.equal(buyRenovation(meta, coins, 5).reason, 'max');
});
