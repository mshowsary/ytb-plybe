// Task 39 launch policy. Keep this intentionally small and inspectable: it controls WHEN an
// already-authored voluntary benefit may be offered, never the economy value of that benefit.
export const AD_PACING = Object.freeze({
  rewardedClaimsPerShift: 1,
  interstitialMinGapMs: 4 * 60 * 1000,
  interstitialEveryCompletedShifts: 3,
  purchaseBridgeEnabled: false,
});

export function reliefRewardKey(day) { return `relief:${Math.max(1, day | 0)}`; }

export function rewardedClaimedForShift(meta, day) {
  const rewarded = meta && meta.rewardedDays && typeof meta.rewardedDays === 'object' ? meta.rewardedDays : {};
  const d = Math.max(1, day | 0);
  // Historical saves used the numeric completed-day key for summary rewards and relief:<day> for
  // in-shift help. Launch pacing treats either as the one voluntary rewarded claim for that shift.
  return !!(rewarded[d] || rewarded[String(d)] || rewarded[reliefRewardKey(d)]);
}

export function markRewardedClaim(meta, day, placement = 'relief') {
  if (!meta || typeof meta !== 'object') return false;
  if (!meta.rewardedDays || typeof meta.rewardedDays !== 'object') meta.rewardedDays = {};
  const d = Math.max(1, day | 0);
  if (rewardedClaimedForShift(meta, d)) return false;
  if (placement === 'summary') meta.rewardedDays[d] = 1;
  else meta.rewardedDays[reliefRewardKey(d)] = 1;
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

export function interstitialGapSatisfied(lastAdAt, now = Date.now(), minGapMs = AD_PACING.interstitialMinGapMs) {
  const previous = Number(lastAdAt) || 0;
  const current = Number(now) || 0;
  const gap = Math.max(0, Number(minGapMs) || 0);
  return current - previous >= gap;
}
