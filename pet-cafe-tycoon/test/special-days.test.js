// test/special-days.test.js — Golden Hour, the one thing left in src/sim/specialDays.js.
//
// Batch E1 (ship plan §1.6) merged the special-day THEME into the one daily goal
// (src/sim/dailyGoal.js, covered by test/daily-goal.test.js). Two daily meters with two separate
// coin rewards were two things to read for one day's work, so THEMES, specialForDay,
// specialForDaySeasoned, saleMatchesTheme, specialProgress and specialReward are gone and the four
// tests that pinned them went with the catalogue they described. Golden Hour was never a goal — it
// is a short 2× tip window that announces itself — and every assertion about it is unchanged below.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOLDEN_HOUR_START_DAY,
  GOLDEN_HOUR_SECONDS,
  GOLDEN_HOUR_TIP_MULT,
  goldenHourForDay,
  createGoldenHourState,
  stepGoldenHour,
  goldenHourMult,
} from '../src/sim/specialDays.js';
import * as specialDays from '../src/sim/specialDays.js';

test('the theme catalogue is gone, not merely unused', () => {
  for (const name of ['THEMES', 'SPECIALS_START_DAY', 'specialForDay', 'specialForDaySeasoned',
    'saleMatchesTheme', 'specialProgress', 'specialReward', 'seasonFestivalDay', 'SEASON_FESTIVAL_IDS']) {
    assert.equal(name in specialDays, false, `${name} was deleted with the theme day`);
  }
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
