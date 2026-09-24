// src/sim/specialDays.js — the Golden Hour, and nothing else any more.
//
// WHAT LEFT (Batch E1, ship plan §1.6: "One daily goal (the contract and the theme day merged)").
// This module used to own a second daily challenge beside the career contract: six THEMES rotating
// by a day hash, each with its own meter, its own target, its own coin bonus and its own chip on
// the Café card. Two goals with two rewards is two things to read for one day's work, so the theme
// is gone and src/sim/dailyGoal.js is the single daily goal. Deleted with it: THEMES,
// SPECIALS_START_DAY, specialForDay, specialForDaySeasoned, seasonFestivalDay, SEASON_FESTIVAL_IDS,
// saleMatchesTheme, specialProgress, specialReward and the themed-sale tip bonus in game.js's
// price().
//
// WHAT STAYED: Golden Hour, which was never a goal — a short 2× tip window in the afternoon on
// roughly a third of shifts, scheduled deterministically from the day number so the game, the bot
// and node:test all agree on it before the shift starts.
//
// Everything here is pure: no clocks, no RNG consumption at module scope, no save writes.

// Golden hour scheduling: a deterministic pseudo-random pick per day. ~38% of qualifying shifts
// get one; it always lands early in the afternoon so the rush backlog has been cleared first.
export const GOLDEN_HOUR_START_DAY = 2;
export const GOLDEN_HOUR_SECONDS = 25;
export const GOLDEN_HOUR_TIP_MULT = 2;

// Small integer hash (mulberry-ish mix) so the sequence of golden hours feels varied but is fully
// reproducible from the day number alone.
function dayHash(day) {
  let h = (day | 0) * 2654435761;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function goldenHourForDay(day) {
  const d = day | 0;
  if (d < GOLDEN_HOUR_START_DAY) return null;
  // Afternoon starts at MORNING(60) + RUSH(90) = 150; give it a couple of seconds to breathe.
  const start = 154 + Math.floor(dayHash(d * 13 + 11) * 20);
  const scheduled = dayHash(d * 31 + 7) < 0.38;
  if (!scheduled) return null;
  return { startT: start, duration: GOLDEN_HOUR_SECONDS, tipMult: GOLDEN_HOUR_TIP_MULT };
}

// Stateful per-shift tracker. Kept as a tiny explicit object so the game can snapshot/restore it
// and bots can step it identically.
export function createGoldenHourState() {
  return { active: false, remaining: 0, usedToday: false };
}

export function stepGoldenHour(state, schedule, dayT, dt) {
  if (!schedule || !state) return false;
  let started = false;
  if (!state.usedToday && !state.active && dayT >= schedule.startT) {
    state.active = true;
    state.remaining = schedule.duration;
    state.usedToday = true;
    started = true;
  }
  if (state.active) {
    state.remaining -= dt;
    if (state.remaining <= 0) {
      state.active = false;
      state.remaining = 0;
    }
  }
  return started;
}

export function goldenHourMult(state) {
  return state && state.active ? GOLDEN_HOUR_TIP_MULT : 1;
}
