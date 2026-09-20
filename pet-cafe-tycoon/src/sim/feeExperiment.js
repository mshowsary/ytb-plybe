// Task 22 experiment configuration only. Nothing in the live runtime imports this module.
// It compares the former direct-deduction schedule with a fee-free variant while preserving the
// exact lost-sale/customer simulation. The legacy helpers are intentionally experiment-only so
// Task 23 can remove live punishment without erasing the evidence baseline.
import { legacyServiceRecoveryCost } from './serviceQuality.js';
import { serviceFrictionCost } from './serviceFriction.js';
import { PRODUCTS } from './economy.js';

// The former Return "food waste" fee, kept HERE and nowhere else. The live game has charged nothing
// for a return since the never-punishing rule retired it, and sim/relief.js — the module that used
// to own this arithmetic alongside the rush-help classifiers — went with the dead ad placements in
// Batch E2. This experiment is the only remaining reader, so the formula moved in with it rather
// than leaving a sim module alive for one tools-only caller.
export const RETURN_WASTE_RATE = 0.18;
export const RETURN_WASTE_CAP = 20;
export function returnWasteCost(productKeys = [], fruit = 0) {
  let retail = 0;
  for (const key of productKeys || []) retail += PRODUCTS[key] ? PRODUCTS[key].price : 0;
  retail += Math.max(0, fruit | 0) * 3;
  if (retail <= 0) return 0;
  return Math.min(RETURN_WASTE_CAP, Math.max(1, Math.round(retail * RETURN_WASTE_RATE)));
}

export const FEE_VARIANTS = Object.freeze({
  current: Object.freeze({ id:'current', directFees:true }),
  feeFree: Object.freeze({ id:'fee-free', directFees:false }),
});

// These are stress policies, not proposed live tuning. "slow" represents a player executing the
// same priorities at 80% owner movement speed. "staff-first" keeps normal execution but reserves
// banked coins for the essential Cashier -> Runner -> Cleaner sequence once the Desk exists.
export const FEE_EXPERIMENT_POLICIES = Object.freeze({
  baseline: Object.freeze({ id:'baseline', ownerSpeedScale:1, reserveEssentialStaff:false }),
  slow: Object.freeze({ id:'slow', ownerSpeedScale:0.8, reserveEssentialStaff:false }),
  staffFirst: Object.freeze({ id:'staff-first', ownerSpeedScale:1, reserveEssentialStaff:true }),
});

export function measuredRecoveryFee(reason, coins, variant = FEE_VARIANTS.current) {
  const raw = legacyServiceRecoveryCost(reason, coins);
  return { raw, charged:variant.directFees ? raw : 0 };
}

export function measuredFrictionFee(kind, severity, coins, remainingCap, variant = FEE_VARIANTS.current) {
  const raw = serviceFrictionCost(kind, severity, coins, remainingCap);
  return { raw, charged:variant.directFees ? raw : 0 };
}

export function measuredWasteFee(productKeys, fruit, coins, variant = FEE_VARIANTS.current) {
  const raw = Math.min(Math.max(0, Math.floor(Number(coins) || 0)), returnWasteCost(productKeys, fruit));
  return { raw, charged:variant.directFees ? raw : 0 };
}

export function feeRemovalRead(current, feeFree) {
  const walletDelta = (feeFree.finalWallet || 0) - (current.finalWallet || 0);
  const spendBase = Math.max(1, current.spend || 0);
  const surplusShareOfSpend = walletDelta / spendBase;
  const completionDelta = (current.daysToComplete ?? 99) - (feeFree.daysToComplete ?? 99);
  return { walletDelta, surplusShareOfSpend, completionDelta };
}
