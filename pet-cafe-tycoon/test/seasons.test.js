// test/seasons.test.js — Seasons (plan §3.8): derivation-not-accumulation, reload safety, and
// goal-content reachability.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEASON_IDS,
  SEASON_LENGTH_DAYS,
  SEASON_CONTENT,
  SEASON_GOAL_REWARD,
  seasonIndexForDay,
  seasonStartDay,
  seasonCycle,
  seasonForDay,
  deriveSeasonMeta,
  seasonRolledOver,
  seasonContentFor,
  seasonAccessoryReachable,
  seasonGoalWindow,
  seasonGoalProgress,
  seasonSummary,
} from '../src/sim/seasons.js';
import { WEEK_LENGTH } from '../src/sim/career.js';
import { accessoryUnlocked } from '../data/accessories.js';

// ---- identity: cycles Blossom -> Splash -> Harvest -> Lights every 7 days ----------------------

test('season length mirrors the career week length exactly (plan: purely additive)', () => {
  assert.equal(SEASON_LENGTH_DAYS, WEEK_LENGTH);
  assert.equal(SEASON_LENGTH_DAYS, 7);
});

test('day 1 is Blossom, dayStart 1', () => {
  const s = seasonForDay(1);
  assert.equal(s.id, 'blossom');
  assert.equal(s.index, 0);
  assert.equal(s.dayStart, 1);
  assert.equal(s.dayEnd, 7);
  assert.equal(s.dayOfSeason, 1);
  assert.equal(s.cycle, 0);
});

test('cycles Blossom -> Splash -> Harvest -> Lights, one per career week', () => {
  const expected = ['blossom', 'splash', 'harvest', 'lights'];
  for (let week = 0; week < 4; week++) {
    const day = week * 7 + 1;
    assert.equal(seasonForDay(day).id, expected[week], `day ${day} should be ${expected[week]}`);
  }
});

test('the 4-season cycle repeats forever, incrementing seasonCycle', () => {
  assert.equal(seasonForDay(1).id, 'blossom');
  assert.equal(seasonForDay(1).cycle, 0);
  assert.equal(seasonForDay(29).id, 'blossom'); // 4 seasons * 7 days later
  assert.equal(seasonForDay(29).cycle, 1);
  assert.equal(seasonForDay(57).id, 'blossom');
  assert.equal(seasonForDay(57).cycle, 2);
});

test('a season boundary never splits mid-week: last day of one season is dayOfSeason 7', () => {
  for (let week = 0; week < 8; week++) {
    const lastDay = week * 7 + 7;
    const nextDay = lastDay + 1;
    const a = seasonForDay(lastDay);
    const b = seasonForDay(nextDay);
    assert.equal(a.dayOfSeason, 7);
    assert.equal(b.dayOfSeason, 1);
    assert.equal(b.dayStart, lastDay + 1);
    // every 4th boundary wraps the id back to blossom; the rest simply advance one id.
    if (week % 4 === 3) assert.equal(b.id, 'blossom');
    else assert.equal(SEASON_IDS.indexOf(b.id), SEASON_IDS.indexOf(a.id) + 1);
  }
});

test('seasonStartDay is always <= day (satisfies saveSchema normalizeSeason\'s dayStart bound)', () => {
  for (const day of [1, 2, 7, 8, 13, 100, 1000]) {
    assert.ok(seasonStartDay(day) <= day);
    assert.ok(seasonStartDay(day) >= 1);
  }
});

test('non-integer / out-of-range day input clamps to day 1 rather than throwing', () => {
  assert.deepEqual(seasonForDay(0).dayStart, 1);
  assert.deepEqual(seasonForDay(-5).dayStart, 1);
  assert.equal(seasonForDay(0).id, 'blossom');
});

// ---- derivation, not accumulation: the core anti-regression property ---------------------------

test('seasonForDay is a pure total function: identical input, identical output, every time', () => {
  const first = seasonForDay(22);
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(seasonForDay(22), first);
  }
});

test('calling deriveSeasonMeta many times in a row for the same day never advances it -- ' +
  'this is the exact shape of bug a counter-based season would have (a reload re-processing the ' +
  'same "day advanced" event twice would increment it twice)', () => {
  const results = [];
  for (let i = 0; i < 25; i++) results.push(deriveSeasonMeta(15));
  for (const r of results) assert.deepEqual(r, { index: results[0].index, dayStart: results[0].dayStart });
  assert.deepEqual(deriveSeasonMeta(15), { index: 2, dayStart: 15 }); // day 15 = week 3 = harvest
});

test('simulated reload: re-deriving from a freshly loaded save (JSON round-trip) matches the ' +
  'live value exactly, and does not skip or repeat a season', () => {
  // Day 10 is played live.
  const liveSeason = deriveSeasonMeta(10);
  assert.deepEqual(liveSeason, { index: 1, dayStart: 8 }); // splash

  // The save is written, then "reloaded" -- simulate exactly what a host boundary does: serialise
  // to JSON and parse it back, discarding any live JS object identity/closures.
  const savedMeta = JSON.parse(JSON.stringify({ season: liveSeason }));

  // The reload happens without the day having moved (the player just re-opened the same day).
  // A counter-based implementation driven by a "day advanced" event could double-fire here if the
  // load path replays that event; a derived value cannot, because there is no event to replay.
  const rederived = deriveSeasonMeta(10);
  assert.deepEqual(rederived, savedMeta.season);
  assert.equal(seasonRolledOver(savedMeta.season, 10), false);

  // Reloading again, and again, still agrees -- and the day never silently advanced past 10.
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(deriveSeasonMeta(10), savedMeta.season);
    assert.equal(seasonForDay(10).dayOfSeason, 3); // day 10 is the 3rd day of splash (8,9,10)
  }
});

test('reload mid-season does not roll the season over early or late', () => {
  // Player reaches day 9 (still splash, dayOfSeason 2), saves, reloads several times before
  // playing day 10.
  const saved = deriveSeasonMeta(9);
  for (let i = 0; i < 5; i++) {
    assert.equal(seasonRolledOver(saved, 9), false, 'reloading the SAME day must never look like a rollover');
  }
  // Only advancing the actual day number to 15 (the next season's start) reports a rollover.
  assert.equal(seasonRolledOver(saved, 14), false); // still splash (8-14)
  assert.equal(seasonRolledOver(saved, 15), true);  // harvest starts
});

// ---- rollover predicate: fires exactly once per boundary crossing -------------------------------

test('seasonRolledOver is false while meta.season already matches the current day\'s season', () => {
  const day1Default = { index: 0, dayStart: 1 }; // game.js's authored initial meta.season
  assert.equal(seasonRolledOver(day1Default, 1), false);
  assert.equal(seasonRolledOver(day1Default, 7), false); // still blossom all week
});

test('seasonRolledOver is true exactly at each 7-day boundary and nowhere else', () => {
  let prev = deriveSeasonMeta(1);
  for (let day = 1; day <= 35; day++) {
    const expectRollover = day > 1 && (day - 1) % SEASON_LENGTH_DAYS === 0;
    assert.equal(seasonRolledOver(prev, day), expectRollover, `day ${day}`);
    if (expectRollover) prev = deriveSeasonMeta(day); // caller writes the fresh value back, once
  }
});

test('seasonRolledOver treats a missing/garbage prevSeason as a rollover (needs initialising) ' +
  'rather than throwing', () => {
  assert.equal(seasonRolledOver(undefined, 1), true);
  assert.equal(seasonRolledOver(null, 1), true);
  assert.equal(seasonRolledOver({}, 1), true);
  assert.equal(seasonRolledOver({ index: 'nope', dayStart: 'nope' }, 1), true);
});

test('a caller that (mis)applies seasonRolledOver\'s one-time effect twice for the same boundary ' +
  'is protected by the predicate itself going false immediately after the write-back', () => {
  const before = deriveSeasonMeta(7); // blossom, about to roll into splash on day 8
  assert.equal(seasonRolledOver(before, 8), true);
  const after = deriveSeasonMeta(8); // caller writes this back onto meta.season, once
  assert.equal(seasonRolledOver(after, 8), false); // a second check the same shift sees no rollover
});

// ---- content: palette / theme / accessory ids exist and are internally consistent --------------

test('every season id has full content: palette, special-day theme, accessory, goal', () => {
  for (const id of SEASON_IDS) {
    const content = seasonContentFor(id);
    assert.ok(content, `missing content for ${id}`);
    assert.equal(typeof content.paletteId, 'string');
    assert.equal(typeof content.specialThemeId, 'string');
    assert.equal(typeof content.accessoryId, 'string');
    assert.ok(content.goal && content.goal.target > 0 && content.goal.target <= SEASON_LENGTH_DAYS);
  }
});

test('seasonContentFor returns null for an unknown id instead of throwing', () => {
  assert.equal(seasonContentFor('nope'), null);
  assert.equal(seasonContentFor(undefined), null);
});

test('each season\'s accessory id is a real, existing accessory (data/accessories.js)', () => {
  for (const id of SEASON_IDS) {
    const content = seasonContentFor(id);
    // accessoryUnlocked returns false (not throws) for both "locked" and "unknown id" -- calling it
    // at 0 and at max followers distinguishes a real-but-locked id from a typo'd one.
    const lockedResult = accessoryUnlocked(content.accessoryId, { followers: 0 });
    const maxedResult = accessoryUnlocked(content.accessoryId, { followers: 1_000_000 });
    assert.equal(typeof lockedResult, 'boolean');
    assert.equal(maxedResult, true, `${content.accessoryId} (season ${id}) is not a real accessory id`);
  }
});

// ---- the reachability gate the task calls out explicitly ----------------------------------------

test('KNOWN GAP (reported, not silently fixed): the Lights accessory (acc_party_hat) is NOT ' +
  'reachable at the follower count Seasons itself unlocks at (star 5 = 2000 followers), because ' +
  'data/accessories.js gates it at tier 4 = 5000 followers', () => {
  const star5Followers = 2000; // plan §3.4 star 5 requirement
  assert.equal(seasonAccessoryReachable('lights', { followers: star5Followers }), false);
  assert.equal(seasonAccessoryReachable('lights', { followers: 4999 }), false);
  assert.equal(seasonAccessoryReachable('lights', { followers: 5000 }), true);
});

test('the other three seasonal accessories ARE reachable at the followers Seasons unlocks with', () => {
  const star5Followers = 2000;
  assert.equal(seasonAccessoryReachable('blossom', { followers: star5Followers }), true);
  assert.equal(seasonAccessoryReachable('splash', { followers: star5Followers }), true);
  assert.equal(seasonAccessoryReachable('harvest', { followers: star5Followers }), true);
});

test('seasonAccessoryReachable is false for an unknown season id, never throws', () => {
  assert.equal(seasonAccessoryReachable('nope', { followers: 1_000_000 }), false);
});

// ---- goal progress: derived from meta.career.history, never a fresh counter ---------------------

function historyDay({ served = 10, lost = 0, earned = 500, bestStreak = 3, rating = 2, contractMet = false } = {}) {
  return { served, lost, earned, bestStreak, rating, contractMet, points: rating + (contractMet ? 1 : 0) };
}

test('seasonGoalWindow matches the season\'s dayStart/dayEnd', () => {
  const w = seasonGoalWindow(10);
  assert.deepEqual(w, { start: 8, end: 14 });
});

test('goal progress is 0 with no career history at all (fresh save, day 1)', () => {
  const progress = seasonGoalProgress({}, 1);
  assert.equal(progress.seasonId, 'blossom');
  assert.equal(progress.current, 0);
  assert.equal(progress.playedDays, 0);
  assert.equal(progress.met, false);
  assert.equal(progress.target, SEASON_CONTENT.blossom.goal.target);
});

test('goal progress counts ONLY days with contractMet true, within THIS season\'s window', () => {
  const meta = {
    career: {
      history: {
        '1': historyDay({ contractMet: true }),
        '2': historyDay({ contractMet: true }),
        '3': historyDay({ contractMet: false }),
        '4': historyDay({ contractMet: true }),
        // days 5-7 not yet played
        '8': historyDay({ contractMet: true }), // next season (splash) -- must NOT count toward blossom
      },
    },
  };
  const progress = seasonGoalProgress(meta, 4); // still inside blossom (day 1-7), currently day 4
  assert.equal(progress.seasonId, 'blossom');
  assert.equal(progress.current, 3); // days 1,2,4 met; day 3 did not
  assert.equal(progress.playedDays, 4);
  assert.equal(progress.met, progress.current >= progress.target);
});

test('goal progress never reads a day later than "now", even if history has one planted there ' +
  '(a tampered save must not be able to pre-claim a season)', () => {
  const meta = {
    career: {
      history: {
        '1': historyDay({ contractMet: true }),
        '5': historyDay({ contractMet: true }), // not reached yet if "now" is day 3
        '6': historyDay({ contractMet: true }),
        '7': historyDay({ contractMet: true }),
      },
    },
  };
  const progress = seasonGoalProgress(meta, 3); // "now" is day 3
  assert.equal(progress.current, 1); // only day 1 counts; days 5-7 are in the future relative to day 3
  assert.equal(progress.playedDays, 1);
});

test('goal progress resets naturally at a season boundary because the window itself moves -- ' +
  'no explicit reset step is needed, and no cross-season leakage occurs either direction', () => {
  const meta = {
    career: {
      history: {
        '7': historyDay({ contractMet: true }),  // last day of blossom
        '8': historyDay({ contractMet: false }), // first day of splash
      },
    },
  };
  const blossom = seasonGoalProgress(meta, 7);
  const splash = seasonGoalProgress(meta, 8);
  assert.equal(blossom.seasonId, 'blossom');
  assert.equal(blossom.current, 1);
  assert.equal(splash.seasonId, 'splash');
  assert.equal(splash.current, 0); // day 7's success does not leak into splash's tally
});

test('goal target is always achievable within the 7-day window (<= SEASON_LENGTH_DAYS), for ' +
  'every season -- the goal can never demand more days than the season has', () => {
  for (const id of SEASON_IDS) {
    assert.ok(SEASON_CONTENT[id].goal.target <= SEASON_LENGTH_DAYS);
    assert.ok(SEASON_CONTENT[id].goal.target > 0);
  }
});

test('the season goal reward is a positive, finite coin amount', () => {
  assert.ok(Number.isFinite(SEASON_GOAL_REWARD));
  assert.ok(SEASON_GOAL_REWARD > 0);
});

// ---- one-call convenience -----------------------------------------------------------------------

test('seasonSummary aggregates identity, content, progress and reachability in one read', () => {
  const meta = { followers: 2000, career: { history: { '1': historyDay({ contractMet: true }) } } };
  const summary = seasonSummary(meta, 1, { index: 0, dayStart: 1 });
  assert.equal(summary.id, 'blossom');
  assert.equal(summary.paletteId, 'blossom');
  assert.equal(summary.accessoryId, 'acc_flower_crown');
  assert.equal(summary.accessoryReachable, true);
  assert.equal(summary.progress.current, 1);
  assert.equal(summary.reward, SEASON_GOAL_REWARD);
  assert.equal(summary.rolledOver, false);
});

test('seasonSummary omits rolledOver (null) when no prevSeason is supplied, rather than guessing', () => {
  const summary = seasonSummary({}, 1);
  assert.equal(summary.rolledOver, null);
});

test('seasonIndexForDay and seasonForDay agree on every day across two full cycles', () => {
  for (let day = 1; day <= 56; day++) {
    assert.equal(seasonForDay(day).index, seasonIndexForDay(day));
  }
});
