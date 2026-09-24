import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleShift, cloneSettlement, shiftRating } from '../src/sim/settlement.js';
import { recordShift } from '../src/sim/reputation.js';
import { recordCareerShift } from '../src/sim/career.js';
import { applySave } from '../src/sim/save.js';

function makeState(day = 1) {
  return {
    coins: 100,
    up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0, cleaner: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 }, boosts: {}, stats: {}, settings: {}, intro: {},
    meta: { rewardedDays: {}, completedDays: 0, reputation: 0, perfectShifts: 0, bestServiceStreak: 0, shiftRatings: {}, career: {}, partyOrders: {} },
    dayState: { day, t: 240, phase: 'closing', _ended: true },
    dayStats: { served: 24, lost: 0, earned: 412, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 8 },
    shiftBestStreak: 8,
    goal: { kind: 'serve', target: 24, reward: 60, previous: null, rival: false, cupDay: day % 7 === 0 },
  };
}

function metaSave(meta) {
  return {
    completedDays: meta.completedDays | 0,
    rewardedDays: { ...(meta.rewardedDays || {}) },
    reputation: meta.reputation | 0,
    perfectShifts: meta.perfectShifts | 0,
    bestServiceStreak: meta.bestServiceStreak | 0,
    shiftRatings: { ...(meta.shiftRatings || {}) },
    petBook: {}, petDiscoveries: 0,
    settlement: cloneSettlement(meta.settlement),
    career: {
      history: Object.fromEntries(Object.entries(meta.career.history || {}).map(([k, v]) => [k, { ...v }])),
      weeklyCups: Object.fromEntries(Object.entries(meta.career.weeklyCups || {}).map(([k, v]) => [k, { ...v }])),
      trophies: { ...(meta.career.trophies || {}) }, recipeSales: { ...(meta.career.recipeSales || {}) },
      contractStreak: meta.career.contractStreak | 0, bestContractStreak: meta.career.bestContractStreak | 0,
      bestWeekPoints: meta.career.bestWeekPoints | 0, renovationLevel: meta.career.renovationLevel | 0,
    },
    partyOrders: {},
  };
}

test('shift rating preserves the existing lost-rate contract', () => {
  assert.equal(shiftRating({ served: 24, lost: 0 }, 8, false), 3);
  assert.equal(shiftRating({ served: 20, lost: 2 }, 2, false), 2);
  assert.equal(shiftRating({ served: 20, lost: 6 }, 20, true), 1);
});

test('fresh settlement commits contract coins, reputation and career history exactly once', () => {
  const s = makeState(1);
  const first = settleShift(s);
  assert.equal(first.fresh, true);
  assert.equal(first.settlement.goal.met, true);
  assert.equal(first.settlement.rewards.contract, 60);
  assert.equal(first.settlement.rating, 3);
  assert.equal(s.coins, 160);
  assert.equal(s.meta.reputation, 3);
  assert.equal(s.meta.completedDays, 1);
  assert.equal(s.meta.career.history['1'].contractMet, true);

  const frozen = JSON.stringify({ coins: s.coins, meta: s.meta });
  const second = settleShift(s);
  assert.equal(second.fresh, false);
  assert.deepEqual(second.settlement, first.settlement);
  assert.equal(JSON.stringify({ coins: s.coins, meta: s.meta }), frozen);
});

test('weekly cup reward joins the same transaction and cannot double-pay', () => {
  const s = makeState(7);
  for (let day = 1; day <= 6; day++) {
    recordShift(s.meta, day, 3, 10);
    recordCareerShift(s.meta, day, { served: 40, lost: 0, earned: 600, bestStreak: 10 }, 3, true);
  }
  s.goal = { kind: 'serve', target: 24, reward: 240, cupDay: true };
  const before = s.coins;
  const first = settleShift(s);
  assert.equal(first.fresh, true);
  assert.equal(first.settlement.cup.awarded, true);
  assert.equal(first.settlement.cup.tier, 'gold');
  assert.equal(first.settlement.cup.reward, 1600);
  assert.equal(s.coins, before + 240 + 1600);
  assert.equal(s.meta.career.trophies.gold, 1);

  const after = s.coins;
  const second = settleShift(s);
  assert.equal(second.fresh, false);
  assert.equal(s.coins, after);
  assert.equal(s.meta.career.trophies.gold, 1);
});

test('settlement survives JSON save/restore and remains idempotent after reload', () => {
  const s = makeState(1);
  const first = settleShift(s).settlement;
  const save = JSON.parse(JSON.stringify({
    coins: s.coins, upgrades: s.up, staff: s.staff, stats: s.stats, settings: s.settings,
    staffLevels: s.staffLevels, machineLevels: s.machineLevels, intro: s.intro,
    meta: metaSave(s.meta), dayState: s.dayState, dayStats: s.dayStats, stars: {}, boosts: {},
  }));
  const restored = makeState(1);
  restored.coins = 0;
  applySave(restored, save);
  assert.deepEqual(restored.meta.settlement, first);
  const before = restored.coins;
  const again = settleShift(restored);
  assert.equal(again.fresh, false);
  assert.equal(restored.coins, before);
  assert.deepEqual(again.settlement, first);
});

test('legacy terminal save reconstructs a settlement record without paying old rewards again', () => {
  const s = makeState(1);
  s.coins = 160; // old build already added the 60-coin contract reward before saving the summary
  recordShift(s.meta, 1, 3, 8);
  recordCareerShift(s.meta, 1, s.dayStats, 3, true);
  s.meta.completedDays = 1;
  delete s.meta.settlement;

  const result = settleShift(s);
  assert.equal(result.fresh, false);
  assert.equal(result.legacy, true);
  assert.equal(result.settlement.legacy, true);
  assert.equal(result.settlement.rewards.contract, 60);
  assert.equal(s.coins, 160);
  assert.equal(s.meta.reputation, 3);
  assert.equal(Object.keys(s.meta.career.history).length, 1);
});
