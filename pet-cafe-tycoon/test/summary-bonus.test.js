// The end-of-day rewarded bonus must be worth watching at every stage of the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryBonusAmount, SUMMARY_BONUS_SHARE, SUMMARY_BONUS_MIN } from '../src/sim/adPacing.js';

test('the bonus is about a third of the day, at the start, mid-game and late', () => {
  for (const earned of [372, 808, 2305, 3633, 7080, 9871]) {
    const bonus = summaryBonusAmount(earned);
    const share = bonus / earned;
    assert.ok(share >= SUMMARY_BONUS_SHARE - 0.03 && share <= SUMMARY_BONUS_SHARE + 0.03,
      `a ${earned}-coin day offered ${bonus} (${(share * 100).toFixed(1)}%)`);
  }
});

test('the bonus reads as a round prize: tens under a thousand, fifties above', () => {
  assert.equal(summaryBonusAmount(2305) % 10, 0);
  assert.equal(summaryBonusAmount(9871) % 50, 0);
  assert.equal(summaryBonusAmount(2305), 810);
});

test('a quiet or broken day still offers the floor, never zero or NaN', () => {
  assert.equal(summaryBonusAmount(0), SUMMARY_BONUS_MIN);
  assert.equal(summaryBonusAmount(-40), SUMMARY_BONUS_MIN);
  assert.equal(summaryBonusAmount('nonsense'), SUMMARY_BONUS_MIN);
  assert.equal(summaryBonusAmount(undefined), SUMMARY_BONUS_MIN);
});
