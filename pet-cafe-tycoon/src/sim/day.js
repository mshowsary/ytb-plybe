// src/sim/day.js — Loop v2 Task 3: the day clock. Pure, no Math.random. A day is 240 real
// seconds split into four phases: morning 60s, rush 90s, afternoon 60s, closing 30s. Spawns/tips/
// capacity all read off the CURRENT phase via spawnMult/tipMult/capBonus below; weekends (day % 7
// === 6 or 0) add a rush-only spawn bump and an all-day tip bump; holidays (day % 7 === 0, so day
// 7 is always both) add a special high-price wish (see economy.js's wishFor/FAMILY and
// customers.js's holiday-doubling at the register).
//
// stepDay(d, dt) advances d.t/d.phase and returns this tick's events ({type:'phase', phase} on
// every phase change, {type:'dayEnd', day} exactly once when closing's own 30s fully elapses).
// Deliberately does NOT auto-advance into the next day on its own — once dayEnd fires, d.t freezes
// at DAY_LENGTH and every further stepDay call is a no-op until the caller explicitly calls
// nextDay(d) (the summary card's CONTINUE button in the real game; tools/bot.js calls it itself
// the instant it sees dayEnd, since a headless bot has nobody to tap CONTINUE).
const MORNING = 60, RUSH = 90, AFTERNOON = 60, CLOSING = 30;
export const DAY_LENGTH = MORNING + RUSH + AFTERNOON + CLOSING; // 240

export function createDay() {
  return { day: 1, t: 0, phase: 'morning' };
}
export function phaseOf(t) {
  if (t < MORNING) return 'morning';
  if (t < MORNING + RUSH) return 'rush';
  if (t < MORNING + RUSH + AFTERNOON) return 'afternoon';
  return 'closing';
}
export function stepDay(d, dt) {
  const events = [];
  if (d.t >= DAY_LENGTH) {
    // Frozen at the end of closing — dayEnd already fired once; wait for nextDay().
    if (!d._ended) { d._ended = true; events.push({ type: 'dayEnd', day: d.day }); }
    return events;
  }
  const prevPhase = d.phase;
  d.t = Math.min(DAY_LENGTH, d.t + dt);
  const phase = phaseOf(d.t);
  if (phase !== prevPhase) { d.phase = phase; events.push({ type: 'phase', phase }); }
  if (d.t >= DAY_LENGTH && !d._ended) { d._ended = true; events.push({ type: 'dayEnd', day: d.day }); }
  return events;
}
// Starts the next day fresh — called on the summary card's CONTINUE (or immediately by the
// headless bot, which auto-continues every day).
export function nextDay(d) {
  d.day += 1; d.t = 0; d.phase = 'morning'; d._ended = false;
  return d;
}
export function isWeekend(day) { return day % 7 === 6 || day % 7 === 0; }
export function isHoliday(day) { return day % 7 === 0; }
// Base per-phase spawn-rate multiplier (multiplies economy.js's spawnInterval — i.e. divides the
// gap between spawns, so 2.0 means twice as many customers/second); rush adds the weekend bump on
// top. Closing is 0 — spawns fully stop.
// Loop v2 Task 3 tuning pass (within the task's own -25% bound on phase spawn multipliers): the
// bot's day-by-day run measured friction ~65-70% in every phase (target 30-60% rush, <20%
// outside) even after easing economy.js's base spawn/max formulas — trimmed the full -25% here too.
export function spawnMult(d) {
  const base = d.phase === 'morning' ? 0.525 : d.phase === 'rush' ? 1.5 : d.phase === 'afternoon' ? 0.75 : 0;
  return (d.phase === 'rush' && isWeekend(d.day)) ? base * 1.5 : base;
}
// Tip multiplier for salePrice — 1.5x in rush, further x1.25 on a weekend (any phase).
export function tipMult(d) {
  const base = d.phase === 'rush' ? 1.5 : 1.0;
  return isWeekend(d.day) ? base * 1.25 : base;
}
// +4 customer cap during rush only.
export function capBonus(d) { return d.phase === 'rush' ? 4 : 0; }
// 0-1 progress THROUGH THE CURRENT PHASE (not the whole day) — the HUD day pill's thin bar.
const PHASE_BOUNDS = { morning: [0, MORNING], rush: [MORNING, MORNING + RUSH], afternoon: [MORNING + RUSH, MORNING + RUSH + AFTERNOON], closing: [MORNING + RUSH + AFTERNOON, DAY_LENGTH] };
export function phaseFrac(d) {
  const [start, end] = PHASE_BOUNDS[d.phase] || [0, DAY_LENGTH];
  return end > start ? (d.t - start) / (end - start) : 1;
}
