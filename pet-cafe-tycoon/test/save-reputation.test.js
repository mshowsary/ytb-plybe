import test from 'node:test';
import assert from 'node:assert/strict';
import { applySave } from '../src/sim/save.js';

function state() {
  return { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
}

test('old save without meta migrates to a safe modern meta shape', () => {
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
  });
});

test('reputation and pet meta round-trip without sharing nested maps', () => {
  const s = state();
  const save = {
    coins: 50, upgrades: {}, staff: {}, stats: {}, settings: {},
    meta: {
      completedDays: 8,
      rewardedDays: { 7: 1 },
      reputation: 19,
      perfectShifts: 4,
      bestServiceStreak: 21,
      shiftRatings: { 1: 2, 2: 3 },
      petBook: { 'cat:0': 1, 'dog:2': 1 },
      petDiscoveries: 2,
    },
  };
  applySave(s, save);
  assert.equal(s.meta.reputation, 19);
  assert.equal(s.meta.perfectShifts, 4);
  assert.equal(s.meta.bestServiceStreak, 21);
  assert.deepEqual(s.meta.shiftRatings, { 1: 2, 2: 3 });
  assert.deepEqual(s.meta.petBook, { 'cat:0': 1, 'dog:2': 1 });
  s.meta.shiftRatings[3] = 1;
  s.meta.petBook['bunny:1'] = 1;
  assert.equal(save.meta.shiftRatings[3], undefined);
  assert.equal(save.meta.petBook['bunny:1'], undefined);
});
