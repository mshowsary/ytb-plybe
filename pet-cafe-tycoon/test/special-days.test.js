// test/special-days.test.js — validates deterministic theme challenges and Golden Hour.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEMES,
  SPECIALS_START_DAY,
  GOLDEN_HOUR_START_DAY,
  GOLDEN_HOUR_SECONDS,
  GOLDEN_HOUR_TIP_MULT,
  specialForDay,
  saleMatchesTheme,
  specialProgress,
  specialReward,
  goldenHourForDay,
  createGoldenHourState,
  stepGoldenHour,
  goldenHourMult,
} from '../src/sim/specialDays.js';
import { familyOf } from '../src/sim/economy.js';

test('specials start only from day 3; day 1 and 2 return null', () => {
  assert.equal(specialForDay(1), null);
  assert.equal(specialForDay(2), null);
  const day3 = specialForDay(3);
  assert.ok(day3);
  assert.ok(THEMES.some(t => t.id === day3.id));
  assert.ok(day3.target >= 6);
  assert.ok(day3.reward >= 130);
});

test('special theme for a given day is deterministic and pure', () => {
  const a = specialForDay(5);
  const b = specialForDay(5);
  assert.deepEqual(a, b);
  assert.notEqual(specialForDay(4), null);
});

test('saleMatchesTheme checks product family accurately', () => {
  const puppyTheme = { family: 'treat' };
  assert.equal(saleMatchesTheme(puppyTheme, 'treat', familyOf), true);
  assert.equal(saleMatchesTheme(puppyTheme, 'cookie', familyOf), false);

  const coffeeTheme = { family: 'coffee' };
  assert.equal(saleMatchesTheme(coffeeTheme, 'coffee', familyOf), true);
  assert.equal(saleMatchesTheme(coffeeTheme, 'latte', familyOf), true);
  assert.equal(saleMatchesTheme(coffeeTheme, 'smoothie', familyOf), false);
});

test('specialProgress tracks met status and fractional completion', () => {
  const special = { target: 6, reward: 150 };
  assert.deepEqual(specialProgress(special, 0), { count: 0, target: 6, met: false, frac: 0 });
  assert.deepEqual(specialProgress(special, 3), { count: 3, target: 6, met: false, frac: 0.5 });
  assert.deepEqual(specialProgress(special, 6), { count: 6, target: 6, met: true, frac: 1 });
  assert.deepEqual(specialProgress(special, 9), { count: 6, target: 6, met: true, frac: 1 });
  assert.equal(specialReward(special), 150);
});

test('goldenHourForDay starts from day 2, is deterministic, and schedules in afternoon', () => {
  assert.equal(goldenHourForDay(1), null);
  // Scan days 2..20 to verify golden hours exist and match schedule parameters
  let scheduledCount = 0;
  for (let d = 2; d <= 20; d++) {
    const gh = goldenHourForDay(d);
    if (gh) {
      scheduledCount++;
      assert.ok(gh.startT >= 150);
      assert.equal(gh.duration, GOLDEN_HOUR_SECONDS);
      assert.equal(gh.tipMult, GOLDEN_HOUR_TIP_MULT);
    }
  }
  assert.ok(scheduledCount >= 4, `expected ~38% golden hours, got ${scheduledCount}/19`);
});

test('stepGoldenHour tracks countdown and allows only one trigger per shift', () => {
  const ghSchedule = { startT: 160, duration: 25, tipMult: 2 };
  const state = createGoldenHourState();

  assert.equal(state.active, false);
  assert.equal(goldenHourMult(state), 1);

  // Before start time
  assert.equal(stepGoldenHour(state, ghSchedule, 150, 1), false);
  assert.equal(state.active, false);

  // Reaching start time triggers it
  assert.equal(stepGoldenHour(state, ghSchedule, 160, 1), true);
  assert.equal(state.active, true);
  assert.equal(state.usedToday, true);
  assert.equal(goldenHourMult(state), 2);

  // Stepping counts down
  stepGoldenHour(state, ghSchedule, 161, 5);
  assert.equal(state.active, true);
  assert.equal(state.remaining, 19);

  // Expiring clears active state
  stepGoldenHour(state, ghSchedule, 180, 20);
  assert.equal(state.active, false);
  assert.equal(state.remaining, 0);
  assert.equal(goldenHourMult(state), 1);

  // Cannot trigger again in same shift
  assert.equal(stepGoldenHour(state, ghSchedule, 200, 1), false);
  assert.equal(state.active, false);
});
