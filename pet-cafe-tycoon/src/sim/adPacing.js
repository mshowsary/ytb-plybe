// src/sim/adPacing.js — when each ad format may exist, and how claims are recorded.
//
// Placement model (owner brief: "best meta economics for us AND the player"):
// - Rewarded ads are USER-INITIATED offers. Each placement may be claimed once per shift, but the
//   placements are independent: a summary double-reward never silences the in-shift helper, and
//   vice versa. More opt-in value, zero forced interruptions.
// - The in-shift budget covers the relief helpers, the Mystery Paw Gift, AND the `speed-build`
//   offer together (one of them per shift), so the café never stacks two mid-shift ad offers at
//   once. `speed-build` (Task 1.7): while the owner stands on a build circle already
//   >= SPEED_BUILD_MIN_PAID_RATIO paid, watching finishes that build immediately for free.
// - The Gift Calendar is real-day keyed (meta.rewards.calendar), not shift keyed, and does not
//   consume any shift budget.
// - Interstitials stay host-paced: natural day transitions plus a once-per-session welcome-back
//   spot for returning players, always behind the shared minimum wall-clock gap.
export const AD_PACING = Object.freeze({
  rewardedClaimsPerShift: 1, // per placement; summary and in-shift budgets are independent
  interstitialMinGapMs: 4 * 60 * 1000,
  interstitialEveryCompletedShifts: 2,
  purchaseBridgeEnabled: false,
});

// Task 1.7 — `speed-build`: offered only while the owner stands on a build circle that is already
// this far paid off. Below the threshold there is nothing worth accelerating yet, so no offer.
export const SPEED_BUILD_MIN_PAID_RATIO = 0.4;

// Pure eligibility predicate so callers (zones/stations UI) and tests share one threshold instead
// of each hardcoding 0.4. `paid`/`price` are coins; a non-positive price is never eligible.
export function speedBuildEligible(paid, price) {
  const p = Number(price) || 0;
  if (p <= 0) return false;
  const ratio = Math.max(0, Number(paid) || 0) / p;
  return ratio >= SPEED_BUILD_MIN_PAID_RATIO;
}

// Returning-player boot spot: the pre-roll equivalent. New players (first two completed shifts)
// always get a clean first session; established players get one optional interstitial at boot.
export const BOOT_INTERSTITIAL_MIN_COMPLETED_DAYS = 3;

export function reliefRewardKey(day) { return `relief:${Math.max(1, day | 0)}`; }
export function giftRewardKey(day) { return `gift:${Math.max(1, day | 0)}`; }
export function speedBuildRewardKey(day) { return `speed-build:${Math.max(1, day | 0)}`; }

function numericClaimed(rewarded, d) { return !!(rewarded[d] || rewarded[String(d)]); }
function keyedClaimed(rewarded, key) { return !!rewarded[key]; }

// The summary double-reward placement: claimed iff the numeric day key exists.
export function summaryClaimedForShift(meta, day) {
  const rewarded = meta && meta.rewardedDays && typeof meta.rewardedDays === 'object' ? meta.rewardedDays : {};
  return numericClaimed(rewarded, Math.max(1, day | 0));
}

// The shared in-shift budget (relief helpers + mystery gift + speed-build): claimed iff any key
// exists. This is what keeps the café from ever stacking two mid-shift ad offers at once.
export function inShiftClaimedForShift(meta, day) {
  const rewarded = meta && meta.rewardedDays && typeof meta.rewardedDays === 'object' ? meta.rewardedDays : {};
  const d = Math.max(1, day | 0);
  return keyedClaimed(rewarded, reliefRewardKey(d))
    || keyedClaimed(rewarded, giftRewardKey(d))
    || keyedClaimed(rewarded, speedBuildRewardKey(d));
}

// Legacy predicate kept for older callers/tests: ANY rewarded claim this shift (summary or
// in-shift). New code should prefer the placement-scoped predicates above.
export function rewardedClaimedForShift(meta, day) {
  return summaryClaimedForShift(meta, day) || inShiftClaimedForShift(meta, day);
}

export function markRewardedClaim(meta, day, placement = 'relief') {
  if (!meta || typeof meta !== 'object') return false;
  if (!meta.rewardedDays || typeof meta.rewardedDays !== 'object') meta.rewardedDays = {};
  const d = Math.max(1, day | 0);
  if (placement === 'summary') {
    if (summaryClaimedForShift(meta, d)) return false;
    meta.rewardedDays[d] = 1;
    return true;
  }
  if (placement === 'gift') {
    if (inShiftClaimedForShift(meta, d)) return false;
    meta.rewardedDays[giftRewardKey(d)] = 1;
    return true;
  }
  if (placement === 'speed-build') {
    if (inShiftClaimedForShift(meta, d)) return false;
    meta.rewardedDays[speedBuildRewardKey(d)] = 1;
    return true;
  }
  if (inShiftClaimedForShift(meta, d)) return false;
  meta.rewardedDays[reliefRewardKey(d)] = 1;
  return true;
}

export function purchaseBridgeEnabled() {
  return AD_PACING.purchaseBridgeEnabled;
}

export function interstitialDueAfterShift(completedDay) {
  const day = completedDay | 0;
  const cadence = AD_PACING.interstitialEveryCompletedShifts;
  return day >= cadence && day % cadence === 0;
}

export function bootInterstitialDue(completedDays) {
  return (completedDays | 0) >= BOOT_INTERSTITIAL_MIN_COMPLETED_DAYS;
}

export function interstitialGapSatisfied(lastAdAt, now = Date.now(), minGapMs = AD_PACING.interstitialMinGapMs) {
  const previous = Number(lastAdAt) || 0;
  const current = Number(now) || 0;
  const gap = Math.max(0, Number(minGapMs) || 0);
  return current - previous >= gap;
}
