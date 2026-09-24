// src/sim/rewards.js — the daily gift.
//
// One retention surface, a real-world daily streak of seven escalating gifts. Batch E2 (ship plan
// §1.7.4) changed two things about it and deleted a third:
//
//   FREE.        The claim used to BE a rewarded ad ("CLAIM TODAY'S GIFT" called requestCafeReward).
//                It is free now, and an optional ▶ doubles it. An ad that gates a gift is a toll,
//                which is the opposite of rule 5 ("ads are wanted, not imposed").
//   NEVER RESET. Missing a real day used to send the streak back to slot 1, so a player who missed
//                a Tuesday lost six days of progress toward the 1,000-coin slot. A missed day now
//                simply PAUSES the streak: the next claim is the next slot, whenever it comes.
//   MYSTERY GIFT GONE. The floating mystery box (mysteryForDay / mysteryCoinsForDay /
//                mysteryRewardKindForDay) was one of the four placements the calm HUD hid; §1.7
//                cuts it outright, so its deterministic-hash machinery goes with it.
//
// Pure state machine: callers own the clock and persistence.

export const CALENDAR_LENGTH = 7;

// Escalating but deliberately modest next to developed-shift income; slot 7 is the celebratory
// finale. A brand-new café (day 1-2 income ~200-350/shift) still feels genuinely gifted; a day-20
// café treats it as a pleasant bonus, not an economy pillar.
export const CALENDAR_REWARDS = [120, 200, 300, 420, 560, 720, 1000];

// The final slot also tops every display and machine back up — the "grand opening" gift.
export const CALENDAR_FINAL_RESTOCK = true;

// The optional ▶ on the gift card and the Café card's tile (§1.7a: "the calendar prize, FREE; ▶
// doubles it"). One number, so the card, the tile and the tests cannot disagree.
export const CALENDAR_DOUBLE_MULTIPLIER = 2;
export function calendarDoubledReward(prize) {
  return Math.max(0, Math.round(Number(prize) || 0)) * CALENDAR_DOUBLE_MULTIPLIER;
}

// Real-day key as YYYY-MM-DD in UTC from a Date.now()-style timestamp.
export function dayKeyFor(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Normalize/validate the calendar record inside meta.rewards. Safe against malformed saves.
export function normalizeCalendar(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const lastKey = typeof src.lastKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.lastKey)
    ? src.lastKey
    : null;
  const streak = Number.isFinite(src.streak) ? Math.max(0, Math.min(CALENDAR_LENGTH, Math.trunc(src.streak))) : 0;
  return { lastKey, streak };
}

/**
 * Advance for a claim on real day `key`. A MISSED DAY PAUSES THE STREAK AND NEVER RESETS IT
 * (§1.7.4), so the only thing that matters is whether today has already been claimed. Pure.
 */
export function advanceCalendar(cal, key) {
  const c = normalizeCalendar(cal);
  if (c.lastKey === key) return { lastKey: key, streak: c.streak };
  return { lastKey: key, streak: Math.min(CALENDAR_LENGTH, c.streak + 1) };
}

/** The slot claimable right now (0-based), or null when today's gift is already taken. Wraps. */
export function calendarSlotIndex(cal, key) {
  const c = normalizeCalendar(cal);
  if (c.lastKey === key) return null;
  return c.streak % CALENDAR_LENGTH;
}

export function calendarRewardFor(slotIndex) {
  const i = Math.max(0, Math.min(CALENDAR_LENGTH - 1, slotIndex | 0));
  return CALENDAR_REWARDS[i];
}

export function calendarIsFinalSlot(slotIndex) {
  return (slotIndex | 0) === CALENDAR_LENGTH - 1;
}
