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
//
// Program §6.2 adds exactly ONE qualified answer to that question and nothing else: a dirty-table
// seat miss, once the mature policy is live. This is NOT the old blanket schedule coming back --
// an unqualified two-argument call still returns 0 for every reason, 'table' included, because it
// carries neither the policy context nor the receipt the bounded refund is derived from. A caller
// that genuinely holds both passes them as the third argument.
//
// ON PARITY -- the previous wording of this comment overclaimed it, so state it exactly:
// sim/servicePolicy.js is still the ONE place that charges a live fee, and nothing passes ctx
// today. This helper reproduces serviceIncident()'s table number only when the caller hands over
// the whole policy state, all four fields:
//
//   const p = G.meta.servicePolicy;
//   serviceRecoveryCost('table', G.coins, {
//     active: world.servicePolicyActive,
//     receipt: c.paid ? c.amount : 0, paid: c.paid,  // serviceIncident's customer.paid guard
//     baseline: p.baseline, spent: p.spent,          // serviceIncident's per-shift budget clamp
//   });
//
// Omit the policy state and what comes back is the CEILING only -- 25 % of the receipt, max 18,
// never more than the wallet holds -- measured against a default, untouched shift budget. That
// ceiling is a preview/display bound, never a charge: only servicePolicy.js may move coins.
export const SERVICE_POLICY_DAY = 8;
export const TABLE_RECOVERY_SHARE = 0.25;
export const TABLE_RECOVERY_CAP = 18;
// Mirrors servicePolicy.js: the per-shift ceiling is 8 % of the shift baseline, and
// normalizeServicePolicy() clamps that baseline into [400, 2000] with a 700 default.
export const SERVICE_BUDGET_SHARE = 0.08;
export const SERVICE_BASELINE_DEFAULT = 700;

export function serviceRecoveryCost(reason, coins = Infinity, ctx = null) {
  if (!ctx || reason !== 'table') return 0;
  const active = ctx.active != null ? !!ctx.active : (ctx.day | 0) >= SERVICE_POLICY_DAY;
  if (!active) return 0;
  // serviceIncident(): `customer.paid ? Math.min(18, Math.floor(amount * .25)) : 0`. A caller that
  // knows the guest never paid may say so outright; passing receipt 0 says the same thing.
  if (ctx.paid === false) return 0;
  const receipt = Math.max(0, Math.floor(Number(ctx.receipt) || 0));
  const requested = Math.min(Math.floor(receipt * TABLE_RECOVERY_SHARE), TABLE_RECOVERY_CAP);
  // serviceIncident(): `Math.min(requested, Math.floor(baseline * .08) - spent, G.coins)`.
  const baseline = Math.max(400, Math.min(2000, Math.floor(Number(ctx.baseline) || 0) || SERVICE_BASELINE_DEFAULT));
  const spent = Math.max(0, Math.floor(Number(ctx.spent) || 0));
  const budget = Math.floor(baseline * SERVICE_BUDGET_SHARE) - spent;
  const wallet = Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : Infinity;
  return Math.max(0, Math.min(requested, budget, wallet));
}

// Program §6.2 accounting for a guest who paid and then never got a clean seat. It lives here,
// beside dirtyTablesBlockingSeats, rather than in whichever system happens to observe the
// 'seatMissed' event, so the sim, the day summary and the tests all read one rule. Reputation is
// floored at 0: a bad shift can stall progress, never invert it.
export function applySeatMiss(G) {
  if (!G) return { missedSeats: 0, reputation: 0, delta: 0 };
  const stats = G.dayStats || (G.dayStats = {});
  stats.missedSeats = Math.max(0, stats.missedSeats | 0) + 1;
  const meta = G.meta || (G.meta = {});
  const before = Math.max(0, meta.reputation | 0);
  const after = Math.max(0, before - 1);
  meta.reputation = after;
  return { missedSeats: stats.missedSeats, reputation: after, delta: before - after };
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
