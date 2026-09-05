// Pure fee model for recoverable service friction. Full lost-sale penalties remain in
// sim/serviceQuality.js; these are smaller signals for service that succeeded but felt bad.
export const SERVICE_FRICTION_FEES = Object.freeze({
  shelfWait: Object.freeze({ min: 2, max: 5 }),
  substitute: Object.freeze({ min: 4, max: 8 }),
  registerWait: Object.freeze({ min: 3, max: 7 }),
});
export const SERVICE_FRICTION_DAILY_CAP = 40;

const clamp01 = n => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0));

export function serviceFrictionCost(kind, severity = 0, coins = Infinity, remainingCap = Infinity) {
  const band = SERVICE_FRICTION_FEES[kind];
  if (!band) return 0;
  const raw = Math.round(band.min + (band.max - band.min) * clamp01(severity));
  const wallet = Number.isFinite(Number(coins)) ? Math.max(0, Math.floor(Number(coins))) : raw;
  const cap = Number.isFinite(Number(remainingCap)) ? Math.max(0, Math.floor(Number(remainingCap))) : raw;
  return Math.max(0, Math.min(raw, wallet, cap));
}

export function frictionSeverity(waitSeconds, softAt, severeAt) {
  const lo = Math.max(0, Number(softAt) || 0), hi = Math.max(lo + 0.001, Number(severeAt) || lo + 1);
  return clamp01(((Number(waitSeconds) || 0) - lo) / (hi - lo));
}
