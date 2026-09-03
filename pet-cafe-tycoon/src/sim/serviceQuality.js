// Small, predictable service-recovery costs. The lost sale remains the main penalty;
// these fees create consequence without ever sending the wallet negative.
export const SERVICE_RECOVERY = Object.freeze({
  counter: 5,
  register: 7,
  bowl: 3,
  table: 2,
});

export const SERVICE_LABEL = Object.freeze({
  counter: 'Empty shelf',
  register: 'Register wait',
  bowl: 'Pet treat wait',
  table: 'Dirty tables',
});

export function serviceRecoveryCost(reason, coins = Infinity) {
  const base = SERVICE_RECOVERY[reason] || 0;
  const wallet = Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : base;
  return Math.max(0, Math.min(base, wallet));
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
