// src/sim/specialDays.js — deterministic per-shift themed challenges and the Golden Hour bonus.
//
// Design goals (owner brief: more days, more bonuses, more challenges, icon-first):
// - Every shift from day 3 rolls ONE special theme from a fixed rotation, seeded only by the day
//   number, so game/bot/tests all agree on what a given shift looks like before it starts.
// - Themes bias WHO visits (species) and WHAT they crave (product family), never adding traffic.
// - Serving themed guests fills a visible star meter; meeting the target pays a settlement bonus
//   that is listed separately in the day reconciliation (never mixed into product sales).
// - Golden Hour is a short 2x-tip celebration window in the afternoon on roughly a third of
//   shifts. It is scheduled by the same deterministic roll so bots and tools can reproduce it.
//
// Everything here is pure: no clocks, no RNG consumption at module scope, no save writes.

export const THEMES = [
  {
    id: 'puppy',
    icon: 'dog',
    species: 'dog',
    family: 'treat',
    tipBonus: 0.3,
    target: 6,
    baseBonus: 130,
  },
  {
    id: 'catcafe',
    icon: 'cat',
    species: 'cat',
    family: 'coffee',
    tipBonus: 0.3,
    target: 6,
    baseBonus: 130,
  },
  {
    id: 'bunnybrunch',
    icon: 'bunny',
    species: 'bunny',
    family: 'cookie',
    tipBonus: 0.3,
    target: 6,
    baseBonus: 130,
  },
  {
    id: 'latte-rush',
    icon: 'coffee',
    species: null,
    family: 'coffee',
    tipBonus: 0.35,
    target: 8,
    baseBonus: 150,
  },
  {
    id: 'sweet-tooth',
    icon: 'cupcake',
    species: null,
    family: 'cookie',
    tipBonus: 0.35,
    target: 8,
    baseBonus: 150,
  },
  {
    id: 'berry-blast',
    icon: 'smoothie',
    species: null,
    family: 'smoothie',
    tipBonus: 0.35,
    target: 7,
    baseBonus: 140,
  },
];

// Before this day the café is still learning the basics; specials start once the room has a
// second production lane unlocked (oven2 is the usual day-2/3 purchase).
export const SPECIALS_START_DAY = 3;

// Golden hour scheduling: a deterministic pseudo-random pick per day. ~38% of qualifying shifts
// get one; it always lands early in the afternoon so the rush backlog has been cleared first.
export const GOLDEN_HOUR_START_DAY = 2;
export const GOLDEN_HOUR_SECONDS = 25;
export const GOLDEN_HOUR_TIP_MULT = 2;

// Small integer hash (mulberry-ish mix) so the sequence of themed days feels varied but is fully
// reproducible from the day number alone.
function dayHash(day) {
  let h = (day | 0) * 2654435761;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function specialForDay(day) {
  const d = day | 0;
  if (d < SPECIALS_START_DAY) return null;
  const pick = Math.floor(dayHash(d * 7 + 3) * THEMES.length) % THEMES.length;
  const theme = THEMES[pick];
  // Difficulty scales gently but stays beatable: +1 themed serve every 6 days, capped.
  const target = theme.target + Math.min(4, Math.floor((d - SPECIALS_START_DAY) / 6));
  return {
    id: theme.id,
    icon: theme.icon,
    species: theme.species,
    family: theme.family,
    tipBonus: theme.tipBonus,
    target,
    reward: theme.baseBonus + 15 * Math.min(12, d - SPECIALS_START_DAY),
  };
}

export function themeFamilyOf(familyOf, key) {
  return familyOf(key);
}

// A themed sale is any product whose family matches the theme's family. Treats count for the
// treat family so Puppy Day rewards the pet-treat loop, not just human products.
export function saleMatchesTheme(special, productKey, familyOf) {
  if (!special || !productKey) return false;
  return familyOf(productKey) === special.family;
}

export function specialProgress(special, themedSales) {
  if (!special) return { count: 0, target: 0, met: false, frac: 0 };
  const count = Math.min(themedSales | 0, special.target);
  return {
    count,
    target: special.target,
    met: count >= special.target,
    frac: special.target > 0 ? count / special.target : 0,
  };
}

export function specialReward(special) {
  return special ? special.reward | 0 : 0;
}

// --- Golden Hour -------------------------------------------------------------

export function goldenHourForDay(day) {
  const d = day | 0;
  if (d < GOLDEN_HOUR_START_DAY) return null;
  // Afternoon starts at MORNING(60) + RUSH(90) = 150; give it a couple of seconds to breathe.
  const start = 154 + Math.floor(dayHash(d * 13 + 11) * 20);
  const scheduled = dayHash(d * 31 + 7) < 0.38;
  if (!scheduled) return null;
  return { startT: start, duration: GOLDEN_HOUR_SECONDS, tipMult: GOLDEN_HOUR_TIP_MULT };
}

// Stateful per-shift tracker. Kept as a tiny explicit object so the game can snapshot/restore it
// and bots can step it identically.
export function createGoldenHourState() {
  return { active: false, remaining: 0, usedToday: false };
}

export function stepGoldenHour(state, schedule, dayT, dt) {
  if (!schedule || !state) return false;
  let started = false;
  if (!state.usedToday && !state.active && dayT >= schedule.startT) {
    state.active = true;
    state.remaining = schedule.duration;
    state.usedToday = true;
    started = true;
  }
  if (state.active) {
    state.remaining -= dt;
    if (state.remaining <= 0) {
      state.active = false;
      state.remaining = 0;
    }
  }
  return started;
}

export function goldenHourMult(state) {
  return state && state.active ? GOLDEN_HOUR_TIP_MULT : 1;
}
