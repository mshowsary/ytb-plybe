// test/daily-goal.test.js — ONE daily goal (Batch E1, ship plan §1.6).
//
// This replaces the two contract tests that used to live in test/career.test.js. They pinned the
// adaptive weekly "rival" mechanic (week two beats last week's same weekday) and the three verbs
// serve/earn/streak. Both were deliberately removed by the plan: the streak verb was the one goal a
// player could not watch themselves doing, and the rival targets were derived from yesterday's
// score, which is the shape that rewards underperforming. Targets now come from durable café
// capacity, and that is asserted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_GOAL_KINDS, availableGoalKinds, buildDailyGoal, cafeGoalTier, chooseDailyGoal,
  dailyGoalLabel, dailyGoalMet, dailyGoalProgress,
} from '../src/sim/dailyGoal.js';
import { chooseCareerGoal, careerGoalMet, careerGoalProgress, careerGoalLabel } from '../src/sim/career.js';
import { applySave } from '../src/sim/save.js';
import { AREA1 } from '../data/area1.js';

const worldOf = (...ids) => ({ world: { built: new Set(ids) } });
const CHAIN = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2', 'z_photo', 'z_terrace', 'z_terraceSeats'];

test('the five kinds are all things the player can watch happen in the room', () => {
  assert.deepEqual([...DAILY_GOAL_KINDS], ['serve', 'earn', 'seated', 'photos', 'icecream']);
  assert.equal(DAILY_GOAL_KINDS.includes('streak'), false, 'the abstract service-streak verb is retired');
});

test('a kind is only asked for once the café can do it', () => {
  assert.deepEqual(availableGoalKinds(new Set()), ['serve', 'earn', 'seated']);
  assert.deepEqual(availableGoalKinds(new Set(['z_photo'])), ['serve', 'earn', 'seated', 'photos']);
  assert.deepEqual(availableGoalKinds(new Set(['z_photo', 'z_terrace'])), DAILY_GOAL_KINDS.slice());
  // Never empty, whatever it is handed.
  assert.deepEqual(availableGoalKinds(null), ['serve', 'earn', 'seated']);
  // A day-1 café is never asked for a photo or a cone: nothing can produce either.
  for (let day = 1; day <= 30; day++) {
    const kind = buildDailyGoal(day, worldOf()).kind;
    assert.ok(['serve', 'earn', 'seated'].includes(kind), `day ${day} asked for ${kind}`);
  }
});

test('the kinds rotate: no long run of the same goal', () => {
  const built = worldOf(...CHAIN);
  const kinds = [];
  for (let day = 1; day <= 15; day++) kinds.push(buildDailyGoal(day, built).kind);
  for (const kind of DAILY_GOAL_KINDS) assert.ok(kinds.includes(kind), `${kind} comes round`);
  for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1], 'never twice in a row');
});

test('targets scale with the café, never with yesterday\'s score', () => {
  assert.equal(cafeGoalTier(new Set()), 0);
  assert.equal(cafeGoalTier(new Set(CHAIN)), 4);
  const small = buildDailyGoal(1, worldOf());
  const big = buildDailyGoal(1, worldOf(...CHAIN));
  assert.equal(small.kind, 'serve');
  assert.ok(big.target > small.target || big.kind !== small.kind);
  // The same day on the same café is the same goal, whatever happened yesterday.
  assert.deepEqual(buildDailyGoal(9, worldOf(...CHAIN)), buildDailyGoal(9, worldOf(...CHAIN)));
  // Serving fewer guests yesterday cannot buy an easier goal: history is not an input at all.
  const meta = { career: { history: { 8: { served: 1, earned: 1, bestStreak: 0 } } } };
  const meta2 = { career: { history: { 8: { served: 90, earned: 9000, bestStreak: 30 } } } };
  assert.deepEqual(
    chooseDailyGoal(9, meta, worldOf(...CHAIN)),
    chooseDailyGoal(9, meta2, worldOf(...CHAIN)),
  );
});

test('every goal pays exactly one coin reward, and never a fine', () => {
  for (let day = 1; day <= 40; day++) {
    for (const built of [worldOf(), worldOf(...CHAIN.slice(0, 5)), worldOf(...CHAIN)]) {
      const goal = buildDailyGoal(day, built);
      assert.ok(Number.isInteger(goal.reward) && goal.reward > 0, `day ${day} pays a whole positive reward`);
      assert.ok(Number.isInteger(goal.target) && goal.target > 0);
      assert.equal(Object.keys(goal).sort().join(','), 'kind,reward,target,tier');
    }
  }
});

test('the goal is frozen for the day it was chosen on and survives a mid-shift reload', () => {
  const meta = {};
  const first = chooseDailyGoal(4, meta, worldOf(...CHAIN.slice(0, 4)));
  assert.equal(meta.career.currentContract.day, 4);
  // The café grows mid-shift (a zone is bought): the goal already in play does not move.
  const again = chooseDailyGoal(4, meta, worldOf(...CHAIN));
  assert.deepEqual(again, first);
  // Tomorrow rolls a fresh one against the bigger café.
  const tomorrow = chooseDailyGoal(5, meta, worldOf(...CHAIN));
  assert.equal(meta.career.currentContract.day, 5);
  assert.ok(tomorrow.kind !== first.kind || tomorrow.target !== first.target);
});

test('a cached goal of a retired kind is refused and re-rolled', () => {
  const meta = { career: { currentContract: { day: 3, tier: 0, goal: { kind: 'streak', target: 8, reward: 150 } } } };
  const goal = chooseDailyGoal(3, meta, worldOf());
  assert.ok(DAILY_GOAL_KINDS.includes(goal.kind));
  assert.notEqual(goal.kind, 'streak');
});

test('progress reads the right counter for each kind', () => {
  const stats = { served: 7, earned: 480.4, seatedServed: 3, photos: 2, iceCreams: 5 };
  assert.equal(dailyGoalProgress({ kind: 'serve', target: 9 }, stats), 7);
  assert.equal(dailyGoalProgress({ kind: 'earn', target: 9 }, stats), 480);
  assert.equal(dailyGoalProgress({ kind: 'seated', target: 9 }, stats), 3);
  assert.equal(dailyGoalProgress({ kind: 'photos', target: 9 }, stats), 2);
  assert.equal(dailyGoalProgress({ kind: 'icecream', target: 9 }, stats), 5);
  assert.equal(dailyGoalProgress(null, stats), 0);
  assert.equal(dailyGoalProgress({ kind: 'nope', target: 1 }, stats), 0);
  assert.equal(dailyGoalMet({ kind: 'seated', target: 3 }, stats), true);
  assert.equal(dailyGoalMet({ kind: 'seated', target: 4 }, stats), false);
});

test('the label is aria text only, never prose on the play field', () => {
  assert.equal(dailyGoalLabel({ kind: 'icecream', target: 8 }), 'Sell 8 ice creams');
  assert.equal(dailyGoalLabel(null), '');
  assert.equal(dailyGoalLabel({ kind: 'streak', target: 8 }), '');
});

test('career.js re-exports the same implementation for the legacy tools/ harnesses', () => {
  // tools/barista-economy-bot.js, tools/runtime-bot-parity.js, the staffing experiments and the
  // third-party jev-* tools still import the goal from career.js. There must be exactly one
  // implementation behind both names.
  assert.equal(chooseCareerGoal, chooseDailyGoal);
  assert.equal(careerGoalMet, dailyGoalMet);
  assert.equal(careerGoalProgress, dailyGoalProgress);
  assert.equal(careerGoalLabel, dailyGoalLabel);
  assert.deepEqual(chooseCareerGoal(3, {}, worldOf()), buildDailyGoal(3, worldOf()));
});

test('a mid-shift reload keeps the progress of every goal kind', () => {
  // SHIFT_STAT_KEYS in src/sim/saveSchema.js is a whitelist: applySave replaces dayStats with
  // EXACTLY those keys, so a counter missing from it is silently zeroed on every reload. Two of the
  // five kinds count brand-new fields, and a "seat 8 table meals" goal resetting to 0/8 because the
  // player backgrounded the tab is the sort of quiet loss this list exists to prevent.
  const live = { served: 12, lost: 0, earned: 640, serviceFees: 0, serviceMisses: 0, wasteFees: 0,
    bestStreak: 4, missedSeats: 0, seatedServed: 6, iceCreams: 3, photos: 2, returnActions: 0 };
  const save = {
    v: 5, coins: 100, builds: { a1: ['z_seats1'] }, dayState: { day: 4, t: 120 },
    stats: { served: 40 }, dayStats: { ...live }, meta: { completedDays: 3 },
  };
  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  assert.ok(applySave(state, save, AREA1));
  for (const kind of DAILY_GOAL_KINDS) {
    assert.equal(
      dailyGoalProgress({ kind, target: 99 }, state.dayStats),
      dailyGoalProgress({ kind, target: 99 }, live),
      `${kind} progress survives the reload`,
    );
  }
});
