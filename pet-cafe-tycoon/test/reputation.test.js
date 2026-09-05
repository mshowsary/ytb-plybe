import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureReputation,
  reputationLevel,
  reputationProgress,
  reputationTitle,
  recordShift,
} from '../src/sim/reputation.js';

test('reputation initializes old saves safely', () => {
  const meta = {};
  ensureReputation(meta);
  assert.deepEqual(meta, {
    reputation: 0,
    perfectShifts: 0,
    bestServiceStreak: 0,
    shiftRatings: {},
  });
  assert.equal(reputationLevel(meta), 0);
  assert.equal(reputationTitle(meta), 'Cozy Corner');
});

test('shift reputation is idempotent per day and levels up', () => {
  const meta = {};
  assert.deepEqual(recordShift(meta, 1, 3, 9), { awarded: 3, rating: 3, levelUp: false, level: 0 });
  assert.equal(meta.reputation, 3);
  assert.equal(meta.perfectShifts, 1);
  assert.equal(meta.bestServiceStreak, 9);

  const duplicate = recordShift(meta, 1, 3, 99);
  assert.equal(duplicate.awarded, 0);
  assert.equal(meta.reputation, 3);
  assert.equal(meta.bestServiceStreak, 9);

  const levelUp = recordShift(meta, 2, 2, 12);
  assert.equal(levelUp.levelUp, true);
  assert.equal(reputationLevel(meta), 1);
  assert.equal(reputationTitle(meta), 'Neighborhood Favorite');
  assert.equal(meta.bestServiceStreak, 12);
});

test('progress reports the next reputation milestone', () => {
  const meta = { reputation: 7 };
  const p = reputationProgress(meta);
  assert.equal(p.level, 1);
  assert.equal(p.current, 3);
  assert.equal(p.needed, 6);
  assert.equal(p.frac, 0.5);
});
