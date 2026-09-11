export const BARISTA_ROBUSTNESS_SEEDS = Object.freeze([1, 17, 41, 73, 101]);

const round = (n, digits = 1) => {
  const p = 10 ** digits;
  return Math.round(Number(n || 0) * p) / p;
};

const nums = (rows, key) => rows.map(r => Number(r[key]) || 0).sort((a, b) => a - b);
const median = values => {
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
};
const min = values => values.length ? values[0] : 0;
const max = values => values.length ? values[values.length - 1] : 0;

export function aggregateBaristaRobustness(cost, rows) {
  if (!Number.isFinite(cost) || cost <= 0) throw new Error('robustness cost must be positive');
  if (!Array.isArray(rows) || rows.length < 3) throw new Error('robustness requires at least three seeded rows');
  if (rows.some(r => r.cost !== cost)) throw new Error('robustness rows must match candidate cost');

  const hire = nums(rows, 'hireMinute');
  const service = nums(rows, 'totalServiceDelta');
  const rush = nums(rows, 'rushDeltaPp');
  const coffee = nums(rows, 'coffeeWaitDeltaPp');
  const owner = nums(rows, 'ownerCoffeeReliefPct');
  const coverage = nums(rows, 'recoupCoveragePct');
  const lost = nums(rows, 'lostDeltaPp');
  const wallet = nums(rows, 'finalCoins');
  const area = nums(rows, 'areaDaysDelta');
  const firstRecoupSeeds = rows.filter(r => r.firstRecoupDay != null).length;
  const durableRecoupSeeds = rows.filter(r => r.durableRecoupDay != null).length;
  const stallsMax = Math.max(...rows.map(r => r.stalls || 0));
  const teleportsMax = Math.max(...rows.map(r => r.teleports || 0));

  const summary = {
    cost,
    seeds: rows.length,
    hireMinuteMedian: round(median(hire), 1),
    hireMinuteMin: round(min(hire), 1),
    hireMinuteMax: round(max(hire), 1),
    serviceDeltaMedian: round(median(service), 0),
    serviceDeltaMin: round(min(service), 0),
    serviceDeltaMax: round(max(service), 0),
    rushDeltaMedianPp: round(median(rush), 1),
    rushDeltaWorstPp: round(max(rush), 1),
    coffeeDeltaMedianPp: round(median(coffee), 1),
    coffeeDeltaWorstPp: round(max(coffee), 1),
    ownerReliefMedianPct: round(median(owner), 1),
    ownerReliefMinPct: round(min(owner), 1),
    recoupCoverageMedianPct: round(median(coverage), 1),
    recoupCoverageMinPct: round(min(coverage), 1),
    firstRecoupSeeds,
    durableRecoupSeeds,
    durableRecoupRate: round(durableRecoupSeeds / rows.length, 2),
    lostDeltaWorstPp: round(max(lost), 1),
    finalWalletMedian: round(median(wallet), 0),
    areaDaysDeltaMax: round(max(area), 0),
    stallsMax,
    teleportsMax,
  };
  summary.safe = stallsMax === 0
    && teleportsMax === 0
    && summary.areaDaysDeltaMax <= 1
    && summary.lostDeltaWorstPp <= 2
    && summary.ownerReliefMinPct >= 25
    && summary.serviceDeltaMedian > 0;
  summary.robustPayback = summary.safe
    && summary.durableRecoupRate >= 0.8
    && summary.recoupCoverageMedianPct >= 100;
  return summary;
}

// Prefer the most expensive candidate that still robustly pays for itself. That preserves a
// meaningful savings decision instead of automatically choosing the cheapest worker. If none meet
// the strong payback bar, prefer the safest candidate with the best median retained coverage.
export function recommendBaristaPrice(summaries) {
  if (!Array.isArray(summaries) || !summaries.length) throw new Error('price recommendation needs summaries');
  const safe = summaries.filter(s => s.safe);
  if (!safe.length) return null;
  const robust = safe.filter(s => s.robustPayback).sort((a, b) => b.cost - a.cost);
  if (robust.length) return robust[0];
  return [...safe].sort((a, b) =>
    (b.recoupCoverageMedianPct - a.recoupCoverageMedianPct)
    || (b.serviceDeltaMedian - a.serviceDeltaMedian)
    || (b.cost - a.cost)
  )[0];
}