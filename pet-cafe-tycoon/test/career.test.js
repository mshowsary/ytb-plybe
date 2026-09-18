import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureCareer, chooseCareerGoal, careerGoalMet, recordCareerShift,
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

test('week-one contracts are bounded and varied instead of exploding by day number', () => {
  const meta = {};
  const kinds = [];
  for (let day = 1; day <= 7; day++) kinds.push(chooseCareerGoal(day, meta).kind);
  assert.deepEqual(kinds, ['serve', 'earn', 'streak', 'serve', 'earn', 'streak', 'serve']);
  assert.equal(chooseCareerGoal(7, meta).target, 40);
  // A migrated day-10 save with no history is still sane (the old formula produced Serve 110).
  const d10 = chooseCareerGoal(10, meta);
  assert.equal(d10.kind, 'streak');
  assert.ok(d10.target <= 12);
});

test('week two challenges the same weekday result from last week', () => {
  const meta = {};
  recordCareerShift(meta, 1, { served: 41, lost: 0, earned: 600, bestStreak: 8 }, 3, true);
  recordCareerShift(meta, 2, { served: 40, lost: 0, earned: 775, bestStreak: 9 }, 3, true);
  recordCareerShift(meta, 3, { served: 40, lost: 0, earned: 700, bestStreak: 11 }, 3, true);
  const mon = chooseCareerGoal(8, meta);
  const tue = chooseCareerGoal(9, meta);
  const wed = chooseCareerGoal(10, meta);
  assert.deepEqual({ kind: mon.kind, target: mon.target, previous: mon.previous, rival: mon.rival }, { kind: 'serve', target: 43, previous: 41, rival: true });
  assert.equal(tue.kind, 'earn'); assert.equal(tue.previous, 775); assert.ok(tue.target > 775);
  assert.deepEqual({ kind: wed.kind, target: wed.target, previous: wed.previous }, { kind: 'streak', target: 12, previous: 11 });
  assert.equal(careerGoalMet(wed, { bestStreak: 12 }), true);
});

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

test('renovations are a late-game coin sink gated by reputation and buy exactly once per level', () => {
  const meta = { reputation: 0 };
  let r = renovationState(meta, 99999);
  assert.equal(r.level, 0); assert.equal(r.next.name, 'Greenhouse Glow'); assert.equal(r.repReady, false);
  assert.equal(buyRenovation(meta, 99999).reason, 'reputation');

  meta.reputation = RENOVATIONS[0].rep;
  assert.equal(buyRenovation(meta, RENOVATIONS[0].cost - 1).reason, 'coins');
  const bought = buyRenovation(meta, RENOVATIONS[0].cost + 250);
  assert.equal(bought.ok, true); assert.equal(bought.level, 1); assert.equal(bought.coins, 250);
  assert.equal(meta.career.renovationLevel, 1);
  assert.equal(renovationState(meta, 0).next.name, 'Gallery Café');
});

test('renovation track has a finite visible endpoint', () => {
  const meta = { reputation: 999 };
  let coins = 999999;
  for (let i = 0; i < RENOVATIONS.length; i++) {
    const b = buyRenovation(meta, coins); assert.equal(b.ok, true); coins = b.coins;
  }
  const done = renovationState(meta, coins);
  assert.equal(done.complete, true); assert.equal(done.level, RENOVATIONS.length); assert.equal(done.next, null);
  assert.equal(buyRenovation(meta, coins).reason, 'max');
});
