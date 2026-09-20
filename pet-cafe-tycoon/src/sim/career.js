// Long-term progression for Pet Cafe: adaptive weekly rivals, weekly cups, recipe mastery and
// visible late-game renovations. Pure simulation helpers only — safe in node:test/headless bot.

export const WEEK_LENGTH = 7;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const LEGENDARY_REPUTATION = 220;

export const MASTERY = {
  cookie:   { label: 'Bakery',    thresholds: [0, 25, 75, 175, 350] },
  cupcake:  { label: 'Cupcakes',  thresholds: [0, 25, 75, 175, 350] },
  coffee:   { label: 'Coffee',    thresholds: [0, 30, 90, 210, 420] },
  smoothie: { label: 'Smoothies', thresholds: [0, 25, 75, 175, 350] },
  treat:    { label: 'Pet Treats',thresholds: [0, 35, 110, 250, 500] },
};

// THE CAFÉ THEMES (ship plan §1.6c.1). Five visible makeovers of the room — the post-build coin
// sink, and the thing the Café card's goal row names once the last zone is standing.
//
// Batch E1 re-gated them. They used to wait on REPUTATION (30/70/100/140/185 at ~2.5/day, i.e. days
// ~12/26/37/52/70), which is a number the UI no longer draws anywhere, so the wait had no picture
// and no way to hurry it. They now wait on a Café Star and on coins, at the plan's prices.
//
// WHY THEMES 4 AND 5 SIT AT ★4 AND NOT AT ★5: ★5's own last row is "every theme owned", so gating
// the last theme behind ★5 would be a deadlock — the star would need the theme and the theme the
// star. ★4 opens the rest of the ladder and the 9,000/12,000 prices are what pace it from there.
export const RENOVATIONS = [
  { level: 1, name: 'Greenhouse Glow', cost: 2000, star: 3, desc: 'Hanging greenery and warm window lights' },
  { level: 2, name: 'Gallery Café', cost: 4000, star: 4, desc: 'Collector wall, art ledges and premium trim' },
  { level: 3, name: 'Pet Palace', cost: 6500, star: 4, desc: 'Signature pet lounge décor and service accents' },
  { level: 4, name: 'Grand Café', cost: 9000, star: 4, desc: 'Gold canopy lights and trophy presentation' },
  { level: 5, name: 'Legendary Finish', cost: 12000, star: 4, desc: 'A landmark entrance and star-lit final makeover' },
];

const FAMILY = { brownie: 'cookie', latte: 'coffee' };
export const masteryFamily = key => FAMILY[key] || key;

export function ensureCareer(meta) {
  if (!meta || typeof meta !== 'object') return null;
  if (!meta.career || typeof meta.career !== 'object') meta.career = {};
  const c = meta.career;
  if (!c.history || typeof c.history !== 'object') c.history = {};
  if (!c.weeklyCups || typeof c.weeklyCups !== 'object') c.weeklyCups = {};
  if (!c.trophies || typeof c.trophies !== 'object') c.trophies = { bronze: 0, silver: 0, gold: 0 };
  for (const k of ['bronze', 'silver', 'gold']) c.trophies[k] = Math.max(0, c.trophies[k] | 0);
  if (!c.recipeSales || typeof c.recipeSales !== 'object') c.recipeSales = {};
  for (const key of Object.keys(MASTERY)) c.recipeSales[key] = Math.max(0, c.recipeSales[key] | 0);
  c.contractStreak = Math.max(0, c.contractStreak | 0);
  c.bestContractStreak = Math.max(c.contractStreak, c.bestContractStreak | 0);
  c.bestWeekPoints = Math.max(0, c.bestWeekPoints | 0);
  c.renovationLevel = Math.max(0, Math.min(RENOVATIONS.length, c.renovationLevel | 0));
  return c;
}

export function weekNumber(day) { return Math.max(1, Math.ceil(Math.max(1, day | 0) / WEEK_LENGTH)); }
export function weekdayIndex(day) { return (Math.max(1, day | 0) - 1) % WEEK_LENGTH; }
export function weekdayName(day) { return WEEKDAY_NAMES[weekdayIndex(day)]; }

// THE DAILY GOAL MOVED OUT (Batch E1). The contract and the special-day theme merged into ONE goal
// with one reward; its whole implementation is src/sim/dailyGoal.js. These four re-exports are the
// compatibility seam for the harnesses under tools/ that still import the goal from here
// (barista-economy-bot, fee-removal-experiment, runtime-bot-parity, the staffing experiments and
// the third-party jev-* tools, which must not be edited). There is exactly one implementation; new
// code imports it from dailyGoal.js by its own names.
export {
  chooseDailyGoal as chooseCareerGoal,
  dailyGoalProgress as careerGoalProgress,
  dailyGoalMet as careerGoalMet,
  dailyGoalLabel as careerGoalLabel,
} from './dailyGoal.js';

export function masteryLevel(meta, product) {
  const c = ensureCareer(meta || {});
  const key = masteryFamily(product);
  const cfg = MASTERY[key];
  if (!cfg) return 0;
  const sales = c.recipeSales[key] | 0;
  let level = 0;
  for (let i = 1; i < cfg.thresholds.length; i++) {
    if (sales < cfg.thresholds[i]) break;
    level = i;
  }
  return level;
}

export function masteryMultiplier(meta, product) {
  return 1 + masteryLevel(meta, product) * 0.03; // +3% per mastery tier, max +12%.
}

export function masteryProgress(meta, product) {
  const c = ensureCareer(meta || {});
  const key = masteryFamily(product);
  const cfg = MASTERY[key];
  if (!cfg) return { key, label: key, level: 0, sales: 0, current: 0, needed: 1, frac: 0, max: true, bonus: 0 };
  const sales = c.recipeSales[key] | 0;
  const level = masteryLevel(meta, key);
  const next = cfg.thresholds[level + 1];
  if (next == null) return { key, label: cfg.label, level, sales, current: 1, needed: 1, frac: 1, max: true, bonus: level * 3 };
  const start = cfg.thresholds[level];
  return {
    key, label: cfg.label, level, sales,
    current: sales - start, needed: next - start,
    frac: Math.max(0, Math.min(1, (sales - start) / (next - start))),
    max: false, bonus: level * 3,
  };
}

export function allMasteryProgress(meta) { return Object.keys(MASTERY).map(k => masteryProgress(meta, k)); }

// `bestStar` is the Café Stars RATCHET (meta.pawBest via pawBestStar), passed in rather than read
// here so this module keeps its zero imports. Defaults to 0, which is the safe direction for a gate.
export function renovationState(meta, coins = 0, bestStar = 0) {
  const c = ensureCareer(meta || {});
  const level = c.renovationLevel | 0;
  const next = RENOVATIONS[level] || null;
  const stars = Math.max(0, Math.trunc(Number(bestStar) || 0));
  return {
    level, maxLevel: RENOVATIONS.length, next, stars,
    complete: !next,
    starReady: !next || stars >= next.star,
    coinReady: !next || (coins | 0) >= next.cost,
  };
}

export function buyRenovation(meta, coins, bestStar = 0) {
  const c = ensureCareer(meta || {});
  const state = renovationState(meta, coins, bestStar);
  if (!state.next) return { ok: false, reason: 'max', coins, level: c.renovationLevel };
  if (!state.starReady) return { ok: false, reason: 'stars', requiredStar: state.next.star, coins, level: c.renovationLevel };
  if (!state.coinReady) return { ok: false, reason: 'coins', cost: state.next.cost, coins, level: c.renovationLevel };
  c.renovationLevel++;
  return { ok: true, cost: state.next.cost, coins: (coins | 0) - state.next.cost, level: c.renovationLevel, renovation: state.next };
}

// Record all items in one paid order. Returns tier-ups so presentation can celebrate only the
// exact mastery milestones crossed by this payment.
export function recordRecipeOrder(meta, items) {
  const c = ensureCareer(meta || {});
  const before = {};
  for (const key of Object.keys(MASTERY)) before[key] = masteryLevel(meta, key);
  for (const raw of items || []) {
    const key = masteryFamily(raw);
    if (MASTERY[key]) c.recipeSales[key] = (c.recipeSales[key] | 0) + 1;
  }
  const levelUps = [];
  for (const key of Object.keys(MASTERY)) {
    const after = masteryLevel(meta, key);
    if (after > before[key]) levelUps.push({ key, label: MASTERY[key].label, level: after, bonus: after * 3 });
  }
  return levelUps;
}

export function recordCareerShift(meta, day, stats, rating, contractMet) {
  const c = ensureCareer(meta || {});
  const key = String(Math.max(1, day | 0));
  if (c.history[key]) return { record: c.history[key], fresh: false };
  const record = {
    served: Math.max(0, stats && stats.served | 0),
    lost: Math.max(0, stats && stats.lost | 0),
    earned: Math.max(0, Math.round(stats && stats.earned || 0)),
    bestStreak: Math.max(0, stats && stats.bestStreak | 0),
    rating: Math.max(1, Math.min(3, rating | 0)),
    contractMet: !!contractMet,
  };
  record.points = record.rating + (record.contractMet ? 1 : 0); // max 4 per day / 28 per week.
  c.history[key] = record;
  c.contractStreak = record.contractMet ? (c.contractStreak | 0) + 1 : 0;
  c.bestContractStreak = Math.max(c.bestContractStreak | 0, c.contractStreak | 0);
  return { record, fresh: true };
}

export function weeklyCupState(meta, day) {
  const c = ensureCareer(meta || {});
  const week = weekNumber(day);
  const start = (week - 1) * WEEK_LENGTH + 1;
  const shifts = [];
  let points = 0, played = 0;
  for (let i = 0; i < WEEK_LENGTH; i++) {
    const r = c.history[String(start + i)] || null;
    shifts.push(r);
    if (r) { played++; points += r.points | 0; }
  }
  const tier = points >= 24 ? 'gold' : points >= 20 ? 'silver' : points >= 14 ? 'bronze' : null;
  return { week, start, shifts, points, played, tier, complete: played >= WEEK_LENGTH };
}

export const CUP_REWARDS = { bronze: 600, silver: 1000, gold: 1600 };

export function awardWeeklyCup(meta, day) {
  const c = ensureCareer(meta || {});
  const state = weeklyCupState(meta, day);
  if ((day | 0) % WEEK_LENGTH !== 0 || !state.complete) return { ...state, awarded: false, reward: 0 };
  const key = String(state.week);
  if (c.weeklyCups[key]) return { ...state, ...c.weeklyCups[key], awarded: false };
  // Finishing all seven shifts guarantees at least a participation bronze cup even if the score
  // missed the normal 14-point bronze threshold; better cups still require quality/contracts.
  const tier = state.tier || 'bronze';
  const reward = CUP_REWARDS[tier];
  const result = { tier, reward, points: state.points };
  c.weeklyCups[key] = result;
  c.trophies[tier] = (c.trophies[tier] | 0) + 1;
  c.bestWeekPoints = Math.max(c.bestWeekPoints | 0, state.points | 0);
  return { ...state, ...result, awarded: true };
}
