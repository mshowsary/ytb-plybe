import test from 'node:test';
import assert from 'node:assert/strict';
import { applySave } from '../src/sim/save.js';

function state() {
  return { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
}

test('old save without meta migrates to a safe modern meta + career shape', () => {
  const s = state();
  applySave(s, { coins: 50, upgrades: {}, staff: {}, stats: {}, settings: {} });
  assert.deepEqual(s.meta, {
    completedDays: 0,
    rewardedDays: {},
    reputation: 0,
    perfectShifts: 0,
    bestServiceStreak: 0,
    shiftRatings: {},
    petBook: {},
    petDiscoveries: 0,
    career: {
      history: {},
      weeklyCups: {},
      trophies: { bronze: 0, silver: 0, gold: 0 },
      recipeSales: { cookie: 0, cupcake: 0, coffee: 0, smoothie: 0, treat: 0 },
      contractStreak: 0,
      bestContractStreak: 0,
      bestWeekPoints: 0,
      renovationLevel: 0,
    },
  });
});

test('reputation, pets and career meta round-trip without sharing nested maps', () => {
  const s = state();
  const save = {
    coins: 50, upgrades: {}, staff: {}, stats: {}, settings: {},
    meta: {
      completedDays: 8,
      rewardedDays: { 7: 1 },
      reputation: 72,
      perfectShifts: 4,
      bestServiceStreak: 21,
      shiftRatings: { 1: 2, 2: 3 },
      petBook: { 'cat:0': 1, 'dog:2': 1 },
      petDiscoveries: 2,
      career: {
        history: { 1: { served: 31, lost: 1, earned: 500, bestStreak: 9, rating: 3, contractMet: true, points: 4 } },
        weeklyCups: { 1: { tier: 'gold', reward: 1600, points: 26 } },
        trophies: { bronze: 1, silver: 0, gold: 2 },
        recipeSales: { cookie: 78, cupcake: 22, coffee: 91, smoothie: 5, treat: 44 },
        contractStreak: 3,
        bestContractStreak: 5,
        bestWeekPoints: 26,
        renovationLevel: 2,
      },
    },
  };
  applySave(s, save);
  assert.equal(s.meta.reputation, 72);
  assert.equal(s.meta.perfectShifts, 4);
  assert.equal(s.meta.bestServiceStreak, 21);
  assert.deepEqual(s.meta.shiftRatings, { 1: 2, 2: 3 });
  assert.deepEqual(s.meta.petBook, { 'cat:0': 1, 'dog:2': 1 });
  assert.equal(s.meta.career.history[1].served, 31);
  assert.equal(s.meta.career.weeklyCups[1].tier, 'gold');
  assert.deepEqual(s.meta.career.trophies, { bronze: 1, silver: 0, gold: 2 });
  assert.equal(s.meta.career.recipeSales.coffee, 91);
  assert.equal(s.meta.career.contractStreak, 3);
  assert.equal(s.meta.career.bestContractStreak, 5);
  assert.equal(s.meta.career.bestWeekPoints, 26);
  assert.equal(s.meta.career.renovationLevel, 2);

  // Mutating restored nested structures must never mutate the original save payload.
  s.meta.shiftRatings[3] = 1;
  s.meta.petBook['bunny:1'] = 1;
  s.meta.career.history[1].served = 999;
  s.meta.career.weeklyCups[1].tier = 'bronze';
  s.meta.career.trophies.gold = 99;
  s.meta.career.recipeSales.coffee = 999;
  assert.equal(save.meta.shiftRatings[3], undefined);
  assert.equal(save.meta.petBook['bunny:1'], undefined);
  assert.equal(save.meta.career.history[1].served, 31);
  assert.equal(save.meta.career.weeklyCups[1].tier, 'gold');
  assert.equal(save.meta.career.trophies.gold, 2);
  assert.equal(save.meta.career.recipeSales.coffee, 91);
});
