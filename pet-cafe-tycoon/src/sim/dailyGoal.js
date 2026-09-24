// src/sim/dailyGoal.js — ONE goal a day, and one coin reward for it (ship plan §1.6, Batch E1).
//
// WHAT THIS REPLACES
// The café used to run two daily challenges side by side and show both:
//   * the CONTRACT (sim/career.js chooseCareerGoal) — serve N / earn N / reach an N× service
//     streak, paid at settlement, drawn as the ring on the Café button; and
//   * the SPECIAL-DAY THEME (sim/specialDays.js) — a species/product theme with its own meter, its
//     own target and its own separate coin bonus, drawn as a second chip beside it.
// Two meters, two rewards, two things to read, and the streak verb ("reach 8× service") was the one
// goal a player could not see themselves doing. They are merged here into one goal with one reward.
// specialDays.js keeps only Golden Hour, which was never a goal.
//
// THE FIVE KINDS are all things the player watches happen in the room, and each one only appears
// once the café can actually do it:
//   serve     guests paid          — always
//   earn      coins taken today    — always
//   seated    meals eaten at a table — once there is a table (there is one from t = 0)
//   photos    shots taken          — once the Pet camera is built
//   icecream  cones sold           — once the Ice cream garden is built
//
// PURE SIMULATION: no DOM, no three.js, no Math.random(), no Date.now(). The goal for a day is a
// function of the day number and the built set, so the game, node:test and tools/bot.js all agree
// on it before the shift starts. It is cached on meta.career.currentContract so a reload mid-shift
// re-reads the same goal instead of rolling a new one (and so a player cannot reroll an awkward
// goal by bouncing the tab).
//
// NO IMPORT OF career.js, deliberately: career.js re-exports these four functions under their old
// chooseCareerGoal/careerGoal* names for the handful of legacy tools/ harnesses that still import
// them from there, and importing back would close that cycle. This module touches meta.career only
// through defensive property access.

export const DAILY_GOAL_KINDS = Object.freeze(['serve', 'earn', 'seated', 'photos', 'icecream']);

// What each kind reads off G.dayStats. One place, so the ring, the Café card, the day summary and
// the settlement can never disagree about what "progress" means.
const PROGRESS = Object.freeze({
  serve: s => s.served | 0,
  earn: s => Math.round(Number(s.earned) || 0),
  seated: s => s.seatedServed | 0,
  photos: s => s.photos | 0,
  icecream: s => s.iceCreams | 0,
});

// Which build makes a kind possible at all. `null` means "always available".
const REQUIRES = Object.freeze({
  serve: null, earn: null, seated: null, photos: 'z_photo', icecream: 'z_terrace',
});

// Five café sizes, by how much of the zone chain is standing. Targets are read off durable
// operating capacity, never off yesterday's score, so deliberately serving fewer guests can never
// buy an easier goal tomorrow.
const TARGETS = Object.freeze({
  serve: [14, 20, 26, 32, 38],
  earn: [220, 500, 950, 1700, 2800],
  seated: [3, 5, 8, 11, 14],
  photos: [2, 3, 4, 5, 6],
  icecream: [4, 6, 8, 10, 12],
});

// The reward is one number: a base that grows with the café plus a gentle per-day drift, rounded to
// something a coin chip can show. It is never a fine — a missed goal simply pays nothing.
const REWARD_BASE = [90, 170, 300, 520, 800];

export const DAILY_GOAL_TIERS = TARGETS.serve.length;

const builtHas = (built, id) => {
  if (!id) return true;
  if (!built) return false;
  if (typeof built.has === 'function') return built.has(id);
  return Array.isArray(built) && built.includes(id);
};

function builtSetOf(context) {
  if (!context) return null;
  if (context.world && context.world.built) return context.world.built;
  if (context.built) return context.built;
  return null;
}

/** How big the café is, 0..4, from the number of zones standing. */
export function cafeGoalTier(built) {
  const n = built ? (typeof built.size === 'number' ? built.size : (built.length | 0)) : 0;
  if (n >= 10) return 4;
  if (n >= 7) return 3;
  if (n >= 4) return 2;
  if (n >= 2) return 1;
  return 0;
}

/** The kinds this café can be asked for today, in DAILY_GOAL_KINDS order. Never empty. */
export function availableGoalKinds(built) {
  const out = DAILY_GOAL_KINDS.filter(kind => builtHas(built, REQUIRES[kind]));
  return out.length ? out : ['serve'];
}

export function dailyGoalReward(kind, tier, day) {
  const base = REWARD_BASE[Math.max(0, Math.min(REWARD_BASE.length - 1, tier | 0))];
  const drift = 10 * Math.min(20, Math.max(0, (day | 0) - 1));
  return Math.round((base + drift) / 10) * 10;
}

/**
 * The goal for `day`, given the café in `context` ({ world: { built } } or { built }).
 * Pure and total: a missing context reads as the smallest café, which is the safe direction.
 */
export function buildDailyGoal(day, context) {
  const d = Math.max(1, day | 0);
  const built = builtSetOf(context);
  const tier = cafeGoalTier(built);
  const kinds = availableGoalKinds(built);
  // Rotate, offset by the tier so the day a new kind unlocks is not always the same weekday.
  const kind = kinds[(d - 1 + tier) % kinds.length];
  const target = Math.max(1, TARGETS[kind][tier]);
  return { kind, target, reward: dailyGoalReward(kind, tier, d), tier };
}

/**
 * The live goal: the one cached for this day if there is one, else a fresh roll which is then
 * cached. Mirrors chooseCareerGoal's old contract exactly (same call shape, same caching field).
 */
export function chooseDailyGoal(day, meta, context) {
  const d = Math.max(1, day | 0);
  const m = meta && typeof meta === 'object' ? meta : null;
  if (m && (!m.career || typeof m.career !== 'object')) m.career = {};
  const career = m ? m.career : null;
  const saved = career && career.currentContract;
  if (saved && saved.day === d && saved.goal && DAILY_GOAL_KINDS.includes(saved.goal.kind)
      && Number.isFinite(saved.goal.target) && saved.goal.target > 0
      && Number.isFinite(saved.goal.reward) && saved.goal.reward >= 0) {
    return { ...saved.goal };
  }
  const goal = buildDailyGoal(d, context);
  if (career) career.currentContract = { day: d, tier: goal.tier, goal: { ...goal } };
  return goal;
}

/**
 * The goal already frozen for `day`, or null. Read-only: unlike chooseDailyGoal it never rolls and
 * never caches.
 *
 * WHY IT EXISTS: src/sim/save.js needs a goal on the restored state, but it runs BEFORE
 * src/game.js G.restore() has rebuilt world.built — so a roll there would be judged against an
 * empty café and then frozen, and a day-13 save with every zone standing came back asking for the
 * day-1 target (caught by tools/production-smoke-v2.js). applySave now reads the cache if the save
 * carries one and otherwise takes an UNCACHED roll, leaving game.js to do the real, cached roll
 * once the café is back.
 */
export function cachedDailyGoal(meta, day) {
  const saved = meta && meta.career && meta.career.currentContract;
  if (!saved || saved.day !== Math.max(1, day | 0) || !saved.goal) return null;
  const g = saved.goal;
  if (!DAILY_GOAL_KINDS.includes(g.kind) || !(g.target > 0) || !(g.reward >= 0)) return null;
  return { ...g };
}

export function dailyGoalProgress(goal, stats) {
  if (!goal || !stats) return 0;
  const read = PROGRESS[goal.kind];
  return read ? Math.max(0, read(stats)) : 0;
}

export function dailyGoalMet(goal, stats) {
  return dailyGoalProgress(goal, stats) >= (goal ? goal.target : Infinity);
}

// The only English in this module, and it is never painted on the play field — it is the aria text
// behind the goal ring and the day-summary row.
const VERB = {
  serve: 'Serve', earn: 'Earn', seated: 'Seat', photos: 'Photograph', icecream: 'Sell',
};
const UNIT = {
  serve: 'guests', earn: 'coins', seated: 'table meals', photos: 'pets', icecream: 'ice creams',
};
export function dailyGoalLabel(goal) {
  if (!goal || !VERB[goal.kind]) return '';
  return `${VERB[goal.kind]} ${goal.target} ${UNIT[goal.kind]}`;
}
export function dailyGoalUnit(goal) {
  return (goal && UNIT[goal.kind]) || '';
}
