// Long-term progression for Pet Cafe: adaptive weekly rivals, weekly cups and recipe mastery.
// Pure simulation helpers only — safe to exercise from node:test and the headless economy bot.

export const WEEK_LENGTH = 7;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const LEGENDARY_REPUTATION = 220;

export const MASTERY = {
  cookie:   { label: 'Bakery',   thresholds: [0, 25, 75, 175, 350] },
  cupcake:  { label: 'Cupcakes', thresholds: [0, 25, 75, 175, 350] },
  coffee:   { label: 'Coffee',   thresholds: [0, 30, 90, 210, 420] },
  smoothie: { label: 'Smoothies',thresholds: [0, 25, 75, 175, 350] },
  treat:    { label: 'Pet Treats',thresholds: [0, 35, 110, 250, 500] },
};

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
  return c;
}

export function weekNumber(day) { return Math.max(1, Math.ceil(Math.max(1, day | 0) / WEEK_LENGTH)); }
export function weekdayIndex(day) { return (Math.max(1, day | 0) - 1) % WEEK_LENGTH; }
export function weekdayName(day) { return WEEKDAY_NAMES[weekdayIndex(day)]; }

function round25(n) { return Math.max(25, Math.round(n / 25) * 25); }

// Week 1 teaches the three contract verbs. Later weeks challenge the player's own previous
// same-weekday result, so difficulty follows actual skill/cafe power instead of an exploding day formula.
export function chooseCareerGoal(day, meta) {
  day = Math.max(1, day | 0);
  const c = ensureCareer(meta || {});
  const wd = weekdayIndex(day);
  const week = weekNumber(day);
  const previous = c.history[String(day - WEEK_LENGTH)] || null;
  const cupDay = wd === 6;

  if (previous) {
    let kind, target, previousValue;
    if (wd === 0 || wd === 3 || cupDay) {
      kind = 'serve'; previousValue = previous.served | 0;
      target = Math.min(cupDay ? 65 : 60, Math.max(cupDay ? 30 : 20, previousValue + (cupDay ? 3 : 2)));
    } else if (wd === 1 || wd === 4) {
      kind = 'earn'; previousValue = previous.earned | 0;
      target = round25(Math.max(200, previousValue * 1.05));
    } else {
      kind = 'streak'; previousValue = previous.bestStreak | 0;
      target = Math.min(24, Math.max(5, previousValue + 1));
    }
    return {
      kind, target, previous: previousValue, rival: true, cupDay,
      reward: 140 + week * 35 + (cupDay ? 100 : 0),
      eyebrow: cupDay ? 'WEEKLY CUP RIVAL' : `BEAT LAST ${WEEKDAY_NAMES[wd].toUpperCase()}`,
    };
  }

  // Fresh installs and migrated old saves with no per-shift history use bounded fallback goals.
  // These intentionally do NOT grow forever with the absolute day number.
  const firstWeek = [
    { kind: 'serve', target: 24, reward: 60 },
    { kind: 'earn', target: 250, reward: 80 },
    { kind: 'streak', target: 5, reward: 90 },
    { kind: 'serve', target: 34, reward: 110 },
    { kind: 'earn', target: 450, reward: 130 },
    { kind: 'streak', target: 8, reward: 150 },
    { kind: 'serve', target: 40, reward: 240, cupDay: true },
  ];
  const base = { ...firstWeek[wd] };
  if (week > 1) {
    // A migrated Day 8+ save has no history yet. Keep the first adaptive week challenging but sane.
    if (base.kind === 'serve') base.target = Math.min(48, base.target + 4);
    else if (base.kind === 'earn') base.target = round25(base.target * 1.2);
    else base.target = Math.min(12, base.target + 2);
    base.reward += Math.min(180, (week - 1) * 35);
  }
  base.rival = false;
  base.cupDay = cupDay;
  base.eyebrow = cupDay ? 'WEEKLY CUP' : `DAILY CONTRACT · ${WEEKDAY_NAMES[wd].toUpperCase()}`;
  return base;
}

export function careerGoalLabel(goal) {
  if (!goal) return '';
  const action = goal.kind === 'serve' ? `Serve ${goal.target}` : goal.kind === 'streak' ? `Reach ${goal.target}x service` : `Earn ${goal.target}`;
  return goal.rival ? `Rival · ${action}` : action;
}

export function careerGoalProgress(goal, stats) {
  if (!goal || !stats) return 0;
  if (goal.kind === 'serve') return stats.served | 0;
  if (goal.kind === 'streak') return stats.bestStreak | 0;
  return stats.earned | 0;
}

export function careerGoalMet(goal, stats) {
  return careerGoalProgress(goal, stats) >= (goal ? goal.target : Infinity);
}

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
