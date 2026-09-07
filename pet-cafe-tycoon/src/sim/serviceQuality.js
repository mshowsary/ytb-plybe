// Task 23: base-game service failures change the service outcome, never banked money.
// Keep the former recovery schedule only as an explicit Task-22 measurement reference so the
// fee-removal experiment remains reproducible after the live runtime becomes fee-free.
export const LEGACY_SERVICE_RECOVERY = Object.freeze({
  counter: 5,
  register: 7,
  bowl: 3,
  table: 2,
});

// Compatibility alias for diagnostics that display the historical reason labels/schedule.
export const SERVICE_RECOVERY = LEGACY_SERVICE_RECOVERY;

export const SERVICE_LABEL = Object.freeze({
  counter: 'Empty shelf',
  register: 'Register wait',
  bowl: 'Pet treat wait',
  table: 'Dirty tables',
});

function boundedLegacyCost(reason, coins = Infinity) {
  const base = LEGACY_SERVICE_RECOVERY[reason] || 0;
  const wallet = Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : base;
  return Math.max(0, Math.min(base, wallet));
}

// Legacy/unqualified calls remain fee-free. Mature financial incidents use servicePolicy.js,
// which requires onboarding, a durable visit identity and the bounded per-shift policy.
export function serviceRecoveryCost(_reason, _coins = Infinity) {
  return 0;
}

// Experiment-only reference to the former live schedule. Do not import this from runtime systems.
export function legacyServiceRecoveryCost(reason, coins = Infinity) {
  return boundedLegacyCost(reason, coins);
}

export function dirtyTablesBlockingSeats(world) {
  if (!world || !world.stations) return false;
  let hasSeat = false, hasDirtyFreeSeat = false, hasCleanFreeSeat = false;
  for (const st of world.stations.values()) {
    if (st.type !== 'seat' || !st.active) continue;
    hasSeat = true;
    if (!st.occupied && st.dirty) hasDirtyFreeSeat = true;
    if (!st.occupied && !st.dirty) hasCleanFreeSeat = true;
  }
  return hasSeat && hasDirtyFreeSeat && !hasCleanFreeSeat;
}
