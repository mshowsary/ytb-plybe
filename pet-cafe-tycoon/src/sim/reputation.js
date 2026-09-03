// Long-term cafe reputation: permanent progression earned from good shifts, never from ads.
// Kept pure so the economy can be tuned with node:test and the headless bot.
export const REPUTATION_LEVELS = [0, 4, 10, 18, 30, 46];
export const REPUTATION_TITLES = [
  'Cozy Corner',
  'Neighborhood Favorite',
  'Pet Hotspot',
  'City Darling',
  'Iconic Café',
  'Legendary Café',
];

export function ensureReputation(meta) {
  if (!meta || typeof meta !== 'object') return;
  meta.reputation = Math.max(0, meta.reputation | 0);
  meta.perfectShifts = Math.max(0, meta.perfectShifts | 0);
  meta.bestServiceStreak = Math.max(0, meta.bestServiceStreak | 0);
  if (!meta.shiftRatings || typeof meta.shiftRatings !== 'object') meta.shiftRatings = {};
}

export function reputationLevel(meta) {
  const rep = Math.max(0, (meta && meta.reputation) | 0);
  let level = 0;
  for (let i = 1; i < REPUTATION_LEVELS.length; i++) {
    if (rep < REPUTATION_LEVELS[i]) break;
    level = i;
  }
  return level;
}

export function reputationTitle(meta) {
  return REPUTATION_TITLES[reputationLevel(meta)] || REPUTATION_TITLES[0];
}

export function reputationProgress(meta) {
  const rep = Math.max(0, (meta && meta.reputation) | 0);
  const level = reputationLevel(meta);
  const start = REPUTATION_LEVELS[level];
  const next = REPUTATION_LEVELS[level + 1];
  if (next == null) return { level, rep, start, next: null, current: 1, needed: 1, frac: 1 };
  const current = rep - start;
  const needed = next - start;
  return { level, rep, start, next, current, needed, frac: Math.max(0, Math.min(1, current / needed)) };
}

// Idempotent by day. Reloading while the day-summary card is visible can never award reputation twice.
export function recordShift(meta, day, rating, bestStreak = 0) {
  ensureReputation(meta);
  day = Math.max(1, day | 0);
  rating = Math.max(1, Math.min(3, rating | 0));
  if (meta.shiftRatings[day] != null) {
    return { awarded: 0, rating: meta.shiftRatings[day] | 0, levelUp: false, level: reputationLevel(meta) };
  }

  const beforeLevel = reputationLevel(meta);
  meta.shiftRatings[day] = rating;
  meta.reputation += rating;
  if (rating === 3) meta.perfectShifts++;
  meta.bestServiceStreak = Math.max(meta.bestServiceStreak | 0, bestStreak | 0);
  const level = reputationLevel(meta);
  return { awarded: rating, rating, levelUp: level > beforeLevel, level };
}
