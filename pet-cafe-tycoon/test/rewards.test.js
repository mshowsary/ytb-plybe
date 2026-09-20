// test/rewards.test.js — the daily gift.
//
// REWRITTEN IN BATCH E2. Two of the old cases pinned behaviour the ship plan deliberately changed
// (§1.7.4) and one pinned a mechanic it cut:
//
//   * "advanceCalendar advances streak on consecutive days and RESETS AFTER A GAP" — a missed real
//     day now PAUSES the streak and never resets it, so the assertion that a gap sends the streak
//     back to 1 asserts the punishment the plan removes.
//   * "calendarSlotIndex ... missed days reset to slot 0" — same rule, same reason.
//   * isConsecutiveDay existed ONLY to implement that reset and is deleted with it.
//   * the Mystery Paw Gift (mysteryForDay / mysteryCoinsForDay / mysteryRewardKindForDay) is cut
//     outright by §1.7, so its three cases go with the code.
//
// Everything else — the UTC day key, normalization bounds, the reward table, the final slot — is
// unchanged, and the new rules get cases of their own below.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_LENGTH,
  CALENDAR_REWARDS,
  CALENDAR_DOUBLE_MULTIPLIER,
  calendarDoubledReward,
  dayKeyFor,
  normalizeCalendar,
  advanceCalendar,
  calendarSlotIndex,
  calendarRewardFor,
  calendarIsFinalSlot,
} from '../src/sim/rewards.js';

test('dayKeyFor formats UTC date strings accurately', () => {
  const ts = Date.parse('2026-09-07T12:00:00Z');
  assert.equal(dayKeyFor(ts), '2026-09-07');
});

test('normalizeCalendar bounds streak and validates lastKey format', () => {
  assert.deepEqual(normalizeCalendar(null), { lastKey: null, streak: 0 });
  assert.deepEqual(normalizeCalendar({ lastKey: 'invalid', streak: 10 }), { lastKey: null, streak: 7 });
  assert.deepEqual(normalizeCalendar({ lastKey: '2026-09-07', streak: 3 }), { lastKey: '2026-09-07', streak: 3 });
  assert.deepEqual(normalizeCalendar({ lastKey: '2026-09-07', streak: -5 }), { lastKey: '2026-09-07', streak: 0 });
});

test('a missed real day PAUSES the streak and never resets it', () => {
  let cal = { lastKey: null, streak: 0 };
  cal = advanceCalendar(cal, '2026-09-01');
  assert.deepEqual(cal, { lastKey: '2026-09-01', streak: 1 });

  cal = advanceCalendar(cal, '2026-09-02');
  assert.deepEqual(cal, { lastKey: '2026-09-02', streak: 2 });

  // Claiming twice on the same real day changes nothing.
  cal = advanceCalendar(cal, '2026-09-02');
  assert.deepEqual(cal, { lastKey: '2026-09-02', streak: 2 });

  // A three-day gap: the streak CONTINUES from where it paused. This is the whole change — a player
  // who missed a Tuesday used to lose six days of progress toward the 1,000-coin slot.
  cal = advanceCalendar(cal, '2026-09-05');
  assert.deepEqual(cal, { lastKey: '2026-09-05', streak: 3 });

  // ...and it still wraps at the end of the week rather than growing forever.
  for (let i = 0; i < 10; i++) cal = advanceCalendar(cal, `2026-10-${String(i + 1).padStart(2, '0')}`);
  assert.equal(cal.streak, CALENDAR_LENGTH);
});

test('calendarSlotIndex is null once today is claimed, and otherwise follows the paused streak', () => {
  const cal = { lastKey: '2026-09-07', streak: 3 };
  assert.equal(calendarSlotIndex(cal, '2026-09-07'), null, 'already claimed today');
  assert.equal(calendarSlotIndex(cal, '2026-09-08'), 3, 'the next day continues the streak');
  assert.equal(calendarSlotIndex(cal, '2026-09-10'), 3, 'and so does the day after a gap');

  const fresh = { lastKey: null, streak: 0 };
  assert.equal(calendarSlotIndex(fresh, '2026-09-07'), 0);

  // A full week wraps back to the first slot rather than stopping.
  assert.equal(calendarSlotIndex({ lastKey: '2026-09-07', streak: CALENDAR_LENGTH }, '2026-09-08'), 0);
});

test('calendarRewardFor and calendarIsFinalSlot match specifications', () => {
  assert.equal(CALENDAR_LENGTH, 7);
  for (let i = 0; i < CALENDAR_LENGTH; i++) {
    assert.equal(calendarRewardFor(i), CALENDAR_REWARDS[i]);
    assert.equal(calendarIsFinalSlot(i), i === 6);
  }
  assert.equal(calendarIsFinalSlot(6), true);
  assert.equal(calendarIsFinalSlot(5), false);
});

test('the optional ▶ doubles the gift, and nothing else changes', () => {
  assert.equal(CALENDAR_DOUBLE_MULTIPLIER, 2);
  for (const prize of CALENDAR_REWARDS) assert.equal(calendarDoubledReward(prize), prize * 2);
  assert.equal(calendarDoubledReward(0), 0);
  assert.equal(calendarDoubledReward(-50), 0);
  assert.equal(calendarDoubledReward('nonsense'), 0);
});

test('the Mystery Paw Gift is gone, not merely unreachable', async () => {
  // §1.7 cuts it. A module that still exported it would be the exact "correct code nothing calls"
  // this batch exists to remove, so the absence is asserted rather than assumed.
  const r = await import('../src/sim/rewards.js');
  for (const dead of ['mysteryForDay', 'mysteryCoinsForDay', 'mysteryRewardKindForDay', 'mysteryCoinsCap', 'isConsecutiveDay']) {
    assert.equal(dead in r, false, `${dead} must not survive its placement`);
  }
});
