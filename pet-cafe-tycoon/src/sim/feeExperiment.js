// Task 22 experiment configuration only. Nothing in the live runtime imports this module.
// It lets bot tools measure the existing direct deductions against a fee-free variant while
// preserving the exact lost-sale/customer simulation in both arms.
import { serviceRecoveryCost } from './serviceQuality.js';
import { serviceFrictionCost } from './serviceFriction.js';
import { returnWasteCost } from './relief.js';

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
  const raw = serviceRecoveryCost(reason, coins);
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
