// src/sim/rewards.js — the Pawsome Gift Calendar and the Mystery Paw Gift.
//
// Two retention surfaces, both optional and rewarded-ad backed (dev preview: free):
//
// Gift Calendar — a real-world daily streak. Seven slots with escalating coin gifts; playing on
// consecutive real days advances the streak, missing real days resets it. Purely additive to the
// in-game "day" economy, capped so it can never dwarf shift income for long.
//
// Mystery Paw Gift — once per shift from day 3 (deterministic ~55% of shifts) a floating gift
// box appears in the café. Watching the ad opens it for one of three treats: coins, an instant
// restock of every display/machine, or a Golden Hour burst right now.
//
// Both modules are pure state machines: callers own the clock and persistence.

export const CALENDAR_LENGTH = 7;

// Escalating but deliberately modest next to developed-shift income; slot 7 is the celebratory
// finale. A brand-new café (day 1-2 income ~200-350/shift) still feels genuinely gifted; a day-20
// café treats it as a pleasant bonus, not an economy pillar.
export const CALENDAR_REWARDS = [120, 200, 300, 420, 560, 720, 1000];

// The final slot also tops every display and machine back up — the "grand opening" gift.
export const CALENDAR_FINAL_RESTOCK = true;

// Real-day key as YYYY-MM-DD in UTC from a Date.now()-style timestamp.
export function dayKeyFor(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Consecutive-UTC-day check. Returns true when prevKey is exactly the calendar day before key.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export function isConsecutiveDay(prevKey, key) {
  if (!prevKey || !key) return false;
  const a = Date.parse(`${prevKey}T00:00:00Z`);
  const b = Date.parse(`${key}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.round((b - a) / MS_PER_DAY) === 1;
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

// Advance the streak for a claim on real day `key`. Pure: returns the next record.
export function advanceCalendar(cal, key) {
  const streak = isConsecutiveDay(cal.lastKey, key)
    ? (cal.streak + 1)
    : (cal.lastKey === key ? cal.streak : 1);
  return { lastKey: key, streak: Math.min(CALENDAR_LENGTH, streak) };
}

// Slot index the player would claim right now (0-based). Streak wraps after a full week.
export function calendarSlotIndex(cal, key) {
  if (cal.lastKey === key) return null; // already claimed today
  const streak = isConsecutiveDay(cal.lastKey, key) ? cal.streak : 0;
  return streak % CALENDAR_LENGTH;
}

export function calendarRewardFor(slotIndex) {
  const i = Math.max(0, Math.min(CALENDAR_LENGTH - 1, slotIndex | 0));
  return CALENDAR_REWARDS[i];
}

export function calendarIsFinalSlot(slotIndex) {
  return (slotIndex | 0) === CALENDAR_LENGTH - 1;
}

// --- Mystery Paw Gift ---------------------------------------------------------

// Chance a given shift features a mystery gift box. Deterministic hash of the day so tools can
// reproduce a shift exactly. First appearance from day 3; never on the tutorial days.
export const MYSTERY_START_DAY = 3;
export const MYSTERY_CHANCE = 0.55;
export const MYSTERY_COINS_FRACTION = 0.3;
export const MYSTERY_COINS_MIN = 80;
export const MYSTERY_COINS_MAX = 500;

function hash01(n) {
  let h = (n | 0) * 2654435761;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mysteryForDay(day) {
  const d = day | 0;
  if (d < MYSTERY_START_DAY) return null;
  if (hash01(d * 17 + 5) >= MYSTERY_CHANCE) return null;
  // Appears a bit into the morning so the player has settled into the shift.
  return { startT: 25 + Math.floor(hash01(d * 23 + 1) * 15), day: d };
}

// The 500-coin ceiling and the 2000-coin baseline cap were both set while income plateaued around
// a fully-built café. The upgrade ladders now continue past that point, so a fixed ceiling would
// shrink to irrelevance as costs climb -- and an optional rewarded offer that is no longer worth a
// player's attention earns nothing for anybody.
//
// The ceiling therefore tracks café level, which is the same investment signal that drives demand,
// and stays BOUNDED: rewarded value that outruns its own economy just inflates it. Level is
// optional, so every existing caller and test keeps the authored numbers exactly.
export const MYSTERY_LEVEL_STEP = 0.055;   // per star tier past the authored build-out
export const MYSTERY_COINS_CEILING = 2200; // hard stop regardless of level
export function mysteryCoinsCap(level = 0) {
  const over = Math.max(0, (level | 0) - 8);
  return Math.min(MYSTERY_COINS_CEILING, Math.round(MYSTERY_COINS_MAX * (1 + MYSTERY_LEVEL_STEP * over)));
}
export function mysteryCoinsForDay(day, baseline, level = 0) {
  const cap = mysteryCoinsCap(level);
  // The baseline cap rises with the ceiling so the fraction can actually reach it.
  const base = Math.max(0, Math.min(Math.round(cap / MYSTERY_COINS_FRACTION), baseline | 0));
  const roll = 0.75 + hash01((day | 0) * 29 + 3) * 0.5; // 0.75–1.25 variance
  const raw = Math.round(base * MYSTERY_COINS_FRACTION * roll);
  return Math.max(MYSTERY_COINS_MIN, Math.min(cap, raw));
}

// Reward pick: deterministic per day so a reload mid-offer cannot reroll the prize.
// kinds: 'coins' | 'restock' | 'golden'
export function mysteryRewardKindForDay(day, goldenActive) {
  const r = hash01((day | 0) * 41 + 9);
  if (r < 0.45) return 'coins';
  if (r < 0.75) return 'restock';
  return goldenActive ? 'coins' : 'golden';
}
