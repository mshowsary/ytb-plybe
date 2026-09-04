// src/sim/day.js — four-minute café shift with an intentional emotional rhythm:
// prepare calmly → feel a real rush → recover/restock → close cleanly.
const MORNING = 60, RUSH = 90, AFTERNOON = 60, CLOSING = 30;
export const DAY_LENGTH = MORNING + RUSH + AFTERNOON + CLOSING;

export function createDay() { return { day: 1, t: 0, phase: 'morning' }; }
export function phaseOf(t) {
  if (t < MORNING) return 'morning';
  if (t < MORNING + RUSH) return 'rush';
  if (t < MORNING + RUSH + AFTERNOON) return 'afternoon';
  return 'closing';
}
export function stepDay(d, dt) {
  const events = [];
  if (d.t >= DAY_LENGTH) {
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
export function nextDay(d) {
  d.day += 1; d.t = 0; d.phase = 'morning'; d._ended = false;
  return d;
}
export function isWeekend(day) { return day % 7 === 6 || day % 7 === 0; }
export function isHoliday(day) { return day % 7 === 0; }

// Customer-volume rhythm. The old afternoon multiplier produced more >6s waits than rush in the
// long-run bot. Afternoon is now explicitly a decompression phase; rush remains the only crowd peak.
export function spawnMult(d) {
  const base = d.phase === 'morning' ? 0.45 : d.phase === 'rush' ? 1.35 : d.phase === 'afternoon' ? 0.48 : 0;
  return (d.phase === 'rush' && isWeekend(d.day)) ? base * 1.25 : base;
}
// Rush is valuable as well as busy, so good service is rewarded rather than pressure existing only
// to create failure. Weekend guests continue to tip more in every phase.
export function tipMult(d) {
  const base = d.phase === 'rush' ? 1.5 : 1.0;
  return isWeekend(d.day) ? base * 1.25 : base;
}
// Rush expands the active crowd, but by three rather than four so queues can recover afterward.
export function capBonus(d) { return d.phase === 'rush' ? 3 : 0; }

const PHASE_BOUNDS = {
  morning: [0, MORNING],
  rush: [MORNING, MORNING + RUSH],
  afternoon: [MORNING + RUSH, MORNING + RUSH + AFTERNOON],
  closing: [MORNING + RUSH + AFTERNOON, DAY_LENGTH],
};
export function phaseFrac(d) {
  const [start, end] = PHASE_BOUNDS[d.phase] || [0, DAY_LENGTH];
  return end > start ? (d.t - start) / (end - start) : 1;
}
