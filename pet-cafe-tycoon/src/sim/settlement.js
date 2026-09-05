// End-of-shift settlement is one explicit, serializable transaction.
// Presentation may open/close/reopen around it, but permanent rewards/progression commit once per day.
import { ensureReputation, recordShift, reputationLevel } from './reputation.js';
import {
  ensureCareer, careerGoalProgress, careerGoalMet, recordCareerShift,
  weeklyCupState, awardWeeklyCup,
} from './career.js';

const clampRating = n => Math.max(1, Math.min(3, n | 0));
const nonNegative = n => Math.max(0, Math.round(Number(n) || 0));

export function shiftRating(stats, bestStreak = 0, contractMet = false) {
  const served = Math.max(0, stats && stats.served | 0);
  const lost = Math.max(0, stats && stats.lost | 0);
  const outcomes = Math.max(1, served + lost);
  const lostRate = lost / outcomes;
  return lostRate <= 0.06 && (contractMet || (bestStreak | 0) >= 8) ? 3 : lostRate <= 0.16 ? 2 : 1;
}

function snapshotGoal(goal, stats, forcedMet = null) {
  const g = goal && typeof goal === 'object' ? goal : {};
  const progress = Math.max(0, careerGoalProgress(g, stats));
  const met = forcedMet == null ? careerGoalMet(g, stats) : !!forcedMet;
  return {
    kind: typeof g.kind === 'string' ? g.kind : 'serve',
    target: nonNegative(g.target),
    reward: nonNegative(g.reward),
    previous: g.previous == null ? null : nonNegative(g.previous),
    rival: !!g.rival,
    cupDay: !!g.cupDay,
    progress,
    met,
  };
}

function snapshotStats(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  return {
    served: nonNegative(s.served), lost: nonNegative(s.lost), earned: nonNegative(s.earned),
    serviceFees: nonNegative(s.serviceFees), serviceMisses: nonNegative(s.serviceMisses),
    wasteFees: nonNegative(s.wasteFees), bestStreak: nonNegative(s.bestStreak),
  };
}

function snapshotCup(meta, day, cupAward = null, preserveAward = false) {
  if ((day | 0) % 7 !== 0) return null;
  const week = weeklyCupState(meta, day);
  const saved = ensureCareer(meta).weeklyCups[String(week.week)] || null;
  const src = cupAward && cupAward.tier ? cupAward : saved;
  if (!src || !src.tier) return null;
  return {
    awarded: preserveAward ? true : !!(cupAward && cupAward.awarded),
    tier: src.tier,
    reward: nonNegative(src.reward),
    points: nonNegative(src.points == null ? week.points : src.points),
    week: week.week | 0,
  };
}

function buildSettlement({ state, day, goal, stats, rating, reputation, cup, coinsBefore, legacy }) {
  const contractReward = goal.met ? nonNegative(goal.reward) : 0;
  const cupReward = cup ? nonNegative(cup.reward) : 0;
  return {
    v: 1,
    committed: true,
    day,
    legacy: !!legacy,
    rating: clampRating(rating),
    goal,
    stats,
    rewards: { contract: contractReward, cup: cupReward, total: contractReward + cupReward },
    reputation: {
      awarded: nonNegative(reputation && reputation.awarded),
      rating: clampRating(reputation && reputation.rating == null ? rating : reputation.rating),
      levelUp: !!(reputation && reputation.levelUp),
      level: Math.max(0, reputation && reputation.level | 0),
    },
    cup,
    coinsBefore: nonNegative(coinsBefore),
    coinsAfter: nonNegative(state.coins),
  };
}

export function restoreSettlement(raw) {
  if (!raw || typeof raw !== 'object' || !raw.committed) return null;
  const day = Math.max(1, raw.day | 0);
  const stats = snapshotStats(raw.stats);
  const goal = snapshotGoal(raw.goal, stats, raw.goal && raw.goal.met);
  const cup = raw.cup && typeof raw.cup === 'object' && raw.cup.tier ? {
    awarded: !!raw.cup.awarded,
    tier: String(raw.cup.tier),
    reward: nonNegative(raw.cup.reward),
    points: nonNegative(raw.cup.points),
    week: Math.max(1, raw.cup.week | 0),
  } : null;
  const rating = clampRating(raw.rating);
  const contractReward = nonNegative(raw.rewards && raw.rewards.contract);
  const cupReward = nonNegative(raw.rewards && raw.rewards.cup);
  return {
    v: 1, committed: true, day, legacy: !!raw.legacy, rating, goal, stats,
    rewards: { contract: contractReward, cup: cupReward, total: contractReward + cupReward },
    reputation: {
      awarded: nonNegative(raw.reputation && raw.reputation.awarded),
      rating: clampRating(raw.reputation && raw.reputation.rating == null ? rating : raw.reputation.rating),
      levelUp: !!(raw.reputation && raw.reputation.levelUp),
      level: Math.max(0, raw.reputation && raw.reputation.level | 0),
    },
    cup,
    coinsBefore: nonNegative(raw.coinsBefore),
    coinsAfter: nonNegative(raw.coinsAfter),
  };
}

export function cloneSettlement(raw) {
  const s = restoreSettlement(raw);
  if (!s) return null;
  return {
    ...s,
    goal: { ...s.goal }, stats: { ...s.stats }, rewards: { ...s.rewards },
    reputation: { ...s.reputation }, cup: s.cup ? { ...s.cup } : null,
  };
}

export function settleShift(state) {
  if (!state || typeof state !== 'object' || !state.meta || !state.dayState) throw new Error('settleShift requires live game state');
  ensureReputation(state.meta); ensureCareer(state.meta);
  const day = Math.max(1, state.dayState.day | 0);

  const existing = restoreSettlement(state.meta.settlement);
  if (existing && existing.day === day) {
    state.meta.settlement = existing;
    return { settlement: cloneSettlement(existing), fresh: false, legacy: !!existing.legacy };
  }

  const stats = snapshotStats(state.dayStats);
  const history = ensureCareer(state.meta).history[String(day)] || null;
  const existingRating = state.meta.shiftRatings && state.meta.shiftRatings[day];

  // Compatibility path for saves made by the pre-transaction build while its summary was open.
  // Their career/reputation records prove settlement already happened; reconstruct the display
  // record but never pay coins or trophies a second time.
  if (history || existingRating != null) {
    const met = history ? !!history.contractMet : careerGoalMet(state.goal, stats);
    const goal = snapshotGoal(state.goal, stats, met);
    const rating = clampRating(existingRating == null ? history && history.rating : existingRating);
    const cup = snapshotCup(state.meta, day, null, true);
    state.meta.completedDays = Math.max(state.meta.completedDays | 0, day);
    const settlement = buildSettlement({
      state, day, goal, stats, rating,
      reputation: { awarded: existingRating == null ? 0 : rating, rating, levelUp: false, level: reputationLevel(state.meta) },
      cup, coinsBefore: state.coins, legacy: true,
    });
    state.meta.settlement = settlement;
    return { settlement: cloneSettlement(settlement), fresh: false, legacy: true };
  }

  const goal = snapshotGoal(state.goal, stats);
  const rating = shiftRating(stats, state.shiftBestStreak == null ? stats.bestStreak : state.shiftBestStreak, goal.met);
  const coinsBefore = nonNegative(state.coins);
  state.coins = coinsBefore + (goal.met ? goal.reward : 0);

  const repResult = recordShift(state.meta, day, rating, state.shiftBestStreak == null ? stats.bestStreak : state.shiftBestStreak);
  recordCareerShift(state.meta, day, stats, rating, goal.met);
  const cupAward = awardWeeklyCup(state.meta, day);
  if (cupAward.awarded) state.coins += nonNegative(cupAward.reward);
  state.meta.completedDays = Math.max(state.meta.completedDays | 0, day);

  const cup = snapshotCup(state.meta, day, cupAward, false);
  const settlement = buildSettlement({ state, day, goal, stats, rating, reputation: repResult, cup, coinsBefore, legacy: false });
  state.meta.settlement = settlement;
  return { settlement: cloneSettlement(settlement), fresh: true, legacy: false };
}
