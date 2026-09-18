// test/rewards.test.js — validates Gift Calendar and Mystery Paw Gift retention mechanics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_LENGTH,
  CALENDAR_REWARDS,
  dayKeyFor,
  isConsecutiveDay,
  normalizeCalendar,
  advanceCalendar,
  calendarSlotIndex,
  calendarRewardFor,
  calendarIsFinalSlot,
  MYSTERY_START_DAY,
  mysteryForDay,
  mysteryCoinsForDay,
  mysteryRewardKindForDay,
} from '../src/sim/rewards.js';

test('dayKeyFor formats UTC date strings accurately', () => {
  const ts = Date.parse('2026-09-07T12:00:00Z');
  assert.equal(dayKeyFor(ts), '2026-09-07');
});

test('isConsecutiveDay detects consecutive UTC days across month and year boundaries', () => {
  assert.equal(isConsecutiveDay('2026-09-07', '2026-09-08'), true);
  assert.equal(isConsecutiveDay('2026-09-30', '2026-10-01'), true);
  assert.equal(isConsecutiveDay('2026-12-31', '2027-01-01'), true);
  assert.equal(isConsecutiveDay('2026-09-07', '2026-09-07'), false);
  assert.equal(isConsecutiveDay('2026-09-07', '2026-09-09'), false);
  assert.equal(isConsecutiveDay(null, '2026-09-08'), false);
});

test('normalizeCalendar bounds streak and validates lastKey format', () => {
  assert.deepEqual(normalizeCalendar(null), { lastKey: null, streak: 0 });
  assert.deepEqual(normalizeCalendar({ lastKey: 'invalid', streak: 10 }), { lastKey: null, streak: 7 });
  assert.deepEqual(normalizeCalendar({ lastKey: '2026-09-07', streak: 3 }), { lastKey: '2026-09-07', streak: 3 });
  assert.deepEqual(normalizeCalendar({ lastKey: '2026-09-07', streak: -5 }), { lastKey: '2026-09-07', streak: 0 });
});

test('advanceCalendar advances streak on consecutive days and resets after a gap', () => {
  let cal = { lastKey: null, streak: 0 };
  cal = advanceCalendar(cal, '2026-09-01');
  assert.deepEqual(cal, { lastKey: '2026-09-01', streak: 1 });

  cal = advanceCalendar(cal, '2026-09-02');
  assert.deepEqual(cal, { lastKey: '2026-09-02', streak: 2 });

  // Same day claim preserves streak
  cal = advanceCalendar(cal, '2026-09-02');
  assert.deepEqual(cal, { lastKey: '2026-09-02', streak: 2 });

  // Gap resets streak to 1
  cal = advanceCalendar(cal, '2026-09-05');
  assert.deepEqual(cal, { lastKey: '2026-09-05', streak: 1 });
});

test('calendarSlotIndex returns null when already claimed today, else valid 0..6 slot index', () => {
  const cal = { lastKey: '2026-09-07', streak: 3 };
  assert.equal(calendarSlotIndex(cal, '2026-09-07'), null); // already claimed
  assert.equal(calendarSlotIndex(cal, '2026-09-08'), 3); // consecutive next day
  assert.equal(calendarSlotIndex(cal, '2026-09-10'), 0); // missed days reset to slot 0

  const fresh = { lastKey: null, streak: 0 };
  assert.equal(calendarSlotIndex(fresh, '2026-09-07'), 0);
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

test('mysteryForDay returns null before day 3 and is deterministic from day 3', () => {
  assert.equal(mysteryForDay(1), null);
  assert.equal(mysteryForDay(2), null);
  let found = 0;
  for (let d = 3; d <= 20; d++) {
    const m = mysteryForDay(d);
    if (m) {
      found++;
      assert.equal(m.day, d);
      assert.ok(m.startT >= 25 && m.startT <= 45);
    }
  }
  assert.ok(found >= 5, `expected ~55% mystery gifts, found ${found}/18`);
});

test('mysteryCoinsForDay stays within bounded limits', () => {
  for (let d = 3; d <= 20; d++) {
    const coins = mysteryCoinsForDay(d, 500);
    assert.ok(coins >= 80 && coins <= 500, `coins ${coins} out of range [80, 500] on day ${d}`);
  }
});

test('mysteryRewardKindForDay returns valid prize and avoids duplicate golden hour', () => {
  const validKinds = new Set(['coins', 'restock', 'golden']);
  for (let d = 3; d <= 30; d++) {
    const kind = mysteryRewardKindForDay(d, false);
    assert.ok(validKinds.has(kind));
    const kindWhenGolden = mysteryRewardKindForDay(d, true);
    assert.notEqual(kindWhenGolden, 'golden');
  }
});
