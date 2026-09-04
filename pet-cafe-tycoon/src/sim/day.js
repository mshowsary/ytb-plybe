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

// Customer-volume rhythm. Day 1 gets a small activity lift after the tutorial cap so a competent
// first-time player is not set up to miss the very first contract by one guest. From Day 3 onward,
// the first 20 seconds of afternoon are an explicit recovery window. It slows arrivals enough to
// clear the rush backlog without making the café suddenly feel empty or starving the economy.
export function spawnMult(d) {
  let base = 0;
  if (d.phase === 'morning') base = d.day === 1 ? 0.52 : 0.45;
  else if (d.phase === 'rush') base = d.day === 1 ? 1.42 : 1.35;
  else if (d.phase === 'afternoon') {
    const recovering = d.day >= 3 && phaseFrac(d) < (20 / AFTERNOON);
    base = recovering ? 0.30 : 0.48;
  }
  return (d.phase === 'rush' && isWeekend(d.day)) ? base * 1.25 : base;
}
// After the teaching shift, rush difficulty comes slightly more from value/tempo and slightly less
// from raw simultaneous bodies. This keeps the room readable on phones and prevents rush backlog
// from becoming the entire afternoon, while good service remains economically worth the pressure.
export function tipMult(d) {
  const base = d.phase === 'rush' ? (d.day === 1 ? 1.5 : 1.6) : 1.0;
  return isWeekend(d.day) ? base * 1.25 : base;
}
export function capBonus(d) {
  if (d.phase !== 'rush') return 0;
  return d.day === 1 ? 3 : 2;
}
