// src/sim/adPacing.js — WHERE a rewarded offer may exist, and how a claim is recorded.
//
// Batch E2 (ship plan §1.7/§1.7a) rewrote this file's placement model. It used to carry eight keys
// — relief, gift (the mystery box), speed-build, rare-visitor, golden-shot — sharing one "in-shift"
// budget, plus a numeric summary key and a boot interstitial. Five of those were invisible (the calm
// HUD hid their chips), one had no writer at all, and the boot spot was never called. The measured
// result was about ONE rewarded view a day, all of it the day-summary button.
//
// There are now exactly FOUR placements, each one a thing in the world:
//
//   dayend    the ×2 button on the day summary            1 per game day
//   guest     the sparkly Special Guest at the door       1 per game day
//   service   the Helper Pup OR the Build Boost ▶ badge   1 per game day (they share this slot)
//   calendar  the daily gift                              1 per REAL day, keyed in meta.rewards
//
// The first three are shift-keyed in `meta.rewardedDays`; the calendar is real-day keyed in
// `meta.rewards.calendar` and deliberately consumes no shift budget (§1.7: "at most 3 rewarded
// offers per game day PLUS the daily gift"). Nothing here shows UI, requests an ad or grants a
// reward — src/systems/offers.js does that, and sim/offers.js decides when each one is earned.
//
// SAVE COMPATIBILITY. `dayend` keeps the bare numeric day key the old summary placement wrote, so a
// save that already claimed today's summary bonus still reads as claimed. The five retired keys are
// simply never written or read again; an old save carrying them loads unchanged and ignores them.
export const AD_PACING = Object.freeze({
  rewardedClaimsPerShift: 1, // per placement; the four placements are independent of each other
  interstitialMinGapMs: 4 * 60 * 1000,
  // §1.7.5: "only at CONTINUE after completed days 3, 5, 7 …". It used to be every second day from
  // day 2, which contradicted the file's own comment about two clean first shifts.
  interstitialFirstCompletedDay: 3,
  interstitialEveryCompletedShifts: 2,
});

/** The three shift-keyed placements, in the order the world offers them. */
export const SHIFT_PLACEMENTS = Object.freeze(['dayend', 'guest', 'service']);

// ---- the day-summary ×2 --------------------------------------------------------------------
//
// It was 35% of the day's sales, min 50 — a receipt, not a prize, and the research report's single
// clearest recommendation was the ×2 framing ("the most legible and most-watched rewarded pattern").
// §1.7a: "+100% of that day's sales, min 100". The rounding stays: a prize reads as a round number.
export const SUMMARY_BONUS_SHARE = 1.0;
export const SUMMARY_BONUS_MIN = 100;
export function summaryBonusAmount(earned) {
  const e = Math.max(0, Number(earned) || 0);
  const raw = e * SUMMARY_BONUS_SHARE;
  const step = raw >= 1000 ? 50 : 10;
  return Math.max(SUMMARY_BONUS_MIN, Math.round(raw / step) * step);
}

// ---- Build Boost ------------------------------------------------------------------------------
//
// §1.7a: "the pad is ≥40% paid and is not the player's first build" → "pays up to half the pad's
// price". The threshold constant survives from the dead `speed-build` wiring (it was the one part
// of that placement that was ever designed); the offer around it is new.
export const BUILD_BOOST_MIN_PAID_RATIO = 0.4;
export const BUILD_BOOST_MAX_SHARE = 0.5;

/** Pure eligibility, shared by the offer, the tests and the bot. A non-positive price never is. */
export function buildBoostEligible(paid, price) {
  const p = Number(price) || 0;
  if (p <= 0) return false;
  const owed = p - Math.max(0, Number(paid) || 0);
  if (owed <= 0) return false; // already paid off: there is nothing left to boost
  return (Math.max(0, Number(paid) || 0) / p) >= BUILD_BOOST_MIN_PAID_RATIO;
}

/** What watching pays into the pad: up to half the pad's price, never more than is still owed. */
export function buildBoostAmount(paid, price) {
  const p = Number(price) || 0;
  if (p <= 0) return 0;
  const owed = Math.max(0, p - Math.max(0, Number(paid) || 0));
  return Math.min(owed, Math.round(p * BUILD_BOOST_MAX_SHARE));
}

// ---- Special Guest ------------------------------------------------------------------------------
//
// §1.7a: "morning, day 3+, while the Pet Book is incomplete". Day 1-2 have met almost nobody, so
// "the next guest is a pet you have never seen" is not yet a reward the player can feel.
export const SPECIAL_GUEST_MIN_DAY = 3;
export function specialGuestEligible(day, phase) {
  return (day | 0) >= SPECIAL_GUEST_MIN_DAY && phase === 'morning';
}

// ---- Helper Pup ---------------------------------------------------------------------------------
//
// §1.7a: "rush, day 3+, when a counter is empty with a guest waiting, or 3+ guests have waited 5 s".
export const HELPER_PUP_MIN_DAY = 3;
export const HELPER_PUP_WAIT_SECONDS = 5;
export const HELPER_PUP_WAITING_GUESTS = 3;

// ---- claims -------------------------------------------------------------------------------------

export function guestRewardKey(day) { return `guest:${Math.max(1, day | 0)}`; }
export function serviceRewardKey(day) { return `service:${Math.max(1, day | 0)}`; }

function rewardedMap(meta) {
  return meta && meta.rewardedDays && typeof meta.rewardedDays === 'object' ? meta.rewardedDays : {};
}

/** The day-summary ×2, claimed iff the bare numeric day key exists (the legacy summary key). */
export function summaryClaimedForShift(meta, day) {
  const rewarded = rewardedMap(meta);
  const d = Math.max(1, day | 0);
  return !!(rewarded[d] || rewarded[String(d)]);
}
export function guestClaimedForShift(meta, day) { return !!rewardedMap(meta)[guestRewardKey(day)]; }
export function serviceClaimedForShift(meta, day) { return !!rewardedMap(meta)[serviceRewardKey(day)]; }

/** Is THIS placement already spent for this shift? One predicate for every caller. */
export function placementClaimedForShift(meta, placement, day) {
  if (placement === 'dayend') return summaryClaimedForShift(meta, day);
  if (placement === 'guest') return guestClaimedForShift(meta, day);
  if (placement === 'service') return serviceClaimedForShift(meta, day);
  return false;
}

/** Any rewarded claim at all this shift — what the interstitial rule reads. */
export function rewardedClaimedForShift(meta, day) {
  return SHIFT_PLACEMENTS.some(p => placementClaimedForShift(meta, p, day));
}

/**
 * Record a claim. Returns false when that placement is already spent, so a double tap (or a
 * reload mid-ad) can never pay twice. `placement` must be one of SHIFT_PLACEMENTS.
 */
export function markRewardedClaim(meta, day, placement = 'service') {
  if (!meta || typeof meta !== 'object') return false;
  if (!SHIFT_PLACEMENTS.includes(placement)) return false;
  if (!meta.rewardedDays || typeof meta.rewardedDays !== 'object') meta.rewardedDays = {};
  const d = Math.max(1, day | 0);
  if (placementClaimedForShift(meta, placement, d)) return false;
  if (placement === 'dayend') meta.rewardedDays[d] = 1;
  else if (placement === 'guest') meta.rewardedDays[guestRewardKey(d)] = 1;
  else meta.rewardedDays[serviceRewardKey(d)] = 1;
  return true;
}

// ---- interstitials --------------------------------------------------------------------------------

/**
 * §1.7.5 — at CONTINUE after completed days 3, 5, 7 … Never on days 1 and 2 (a new player gets
 * clean first shifts), and `rewardedJustWatched` skips the day the player already gave us a view.
 */
export function interstitialDueAfterShift(completedDay, rewardedJustWatched = false) {
  const day = completedDay | 0;
  if (rewardedJustWatched) return false;
  const first = AD_PACING.interstitialFirstCompletedDay;
  const cadence = AD_PACING.interstitialEveryCompletedShifts;
  if (day < first) return false;
  return (day - first) % cadence === 0;
}

export function interstitialGapSatisfied(lastAdAt, now = Date.now(), minGapMs = AD_PACING.interstitialMinGapMs) {
  const previous = Number(lastAdAt) || 0;
  const current = Number(now) || 0;
  const gap = Math.max(0, Number(minGapMs) || 0);
  return current - previous >= gap;
}
