// The end-of-day rewarded bonus must be worth watching at every stage of the game.
//
// BATCH E2 CHANGED THE NUMBER (ship plan §1.7a: "Double today ... +100% of that day's sales, min
// 100"). It was 35% with a floor of 50, which the economy report measured at 210 coins for a
// 30-second ad on a 2,300-coin day and called "a receipt, not a prize". The two cases that pinned
// 35% and the 810-coin example were rewritten to the new rule; the shape assertions (round prizes,
// a floor, never NaN) are unchanged because they were never about the share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryBonusAmount, SUMMARY_BONUS_SHARE, SUMMARY_BONUS_MIN } from '../src/sim/adPacing.js';

test('the bonus doubles the day, at the start, mid-game and late', () => {
  assert.equal(SUMMARY_BONUS_SHARE, 1.0);
  for (const earned of [372, 808, 2305, 3633, 7080, 9871]) {
    const bonus = summaryBonusAmount(earned);
    const share = bonus / earned;
    assert.ok(share >= SUMMARY_BONUS_SHARE - 0.02 && share <= SUMMARY_BONUS_SHARE + 0.02,
      `a ${earned}-coin day offered ${bonus} (${(share * 100).toFixed(1)}%)`);
  }
});

test('the bonus reads as a round prize: tens under a thousand, fifties above', () => {
  assert.equal(summaryBonusAmount(305) % 10, 0);
  assert.equal(summaryBonusAmount(9871) % 50, 0);
  assert.equal(summaryBonusAmount(2305), 2300);
  assert.equal(summaryBonusAmount(305), 310);
});

test('a quiet or broken day still offers the floor, never zero or NaN', () => {
  assert.equal(SUMMARY_BONUS_MIN, 100);
  assert.equal(summaryBonusAmount(0), SUMMARY_BONUS_MIN);
  assert.equal(summaryBonusAmount(-40), SUMMARY_BONUS_MIN);
  assert.equal(summaryBonusAmount('nonsense'), SUMMARY_BONUS_MIN);
  assert.equal(summaryBonusAmount(undefined), SUMMARY_BONUS_MIN);
  // A tiny day is lifted to the floor rather than offering 30 coins for a video.
  assert.equal(summaryBonusAmount(40), SUMMARY_BONUS_MIN);
});
