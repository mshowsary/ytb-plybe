export const BARISTA_PRICE_CANDIDATES = Object.freeze([1800, 2000, 2100, 2300]);

const round = (n, digits = 1) => {
  const p = 10 ** digits;
  return Math.round(Number(n || 0) * p) / p;
};

const dayValue = (rows, day) => rows.find(r => r.day === day)?.earnings ?? 0;

// A first crossing can be misleading when later purchase timing makes the incremental service
// curve dip back below the hire price. "Durable" means the cumulative service gain is at/above
// price on that day and never falls below it again through the end of the measured career.
export function recoupMilestones(cost, baselineRows, armRows, hiredDay) {
  if (!Number.isFinite(cost) || cost <= 0) throw new Error('recoup cost must be positive');
  if (!Array.isArray(baselineRows) || !Array.isArray(armRows)) throw new Error('recoup rows must be arrays');
  if (!Number.isFinite(hiredDay)) return { firstRecoupDay: null, durableRecoupDay: null, finalIncrement: 0, path: [] };

  const days = [...new Set(armRows.map(r => Number(r.day)).filter(d => Number.isFinite(d) && d >= hiredDay))].sort((a, b) => a - b);
  let cumulative = 0;
  const path = days.map(day => {
    cumulative += dayValue(armRows, day) - dayValue(baselineRows, day);
    return { day, cumulative };
  });
  const firstRecoupDay = path.find(p => p.cumulative >= cost)?.day ?? null;
  let durableRecoupDay = null;
  for (let i = 0; i < path.length; i++) {
    if (path[i].cumulative < cost) continue;
    if (path.slice(i).every(p => p.cumulative >= cost)) { durableRecoupDay = path[i].day; break; }
  }
  return { firstRecoupDay, durableRecoupDay, finalIncrement: cumulative, path };
}

export function summarizeBaristaCandidate(cost, report) {
  if (!Number.isFinite(cost) || cost <= 0) throw new Error('candidate cost must be positive');
  const baseline = report && report.baseline;
  const arm = report && report.withBarista;
  const delta = report && report.delta;
  if (!baseline || !arm || !delta) throw new Error('candidate report is missing baseline/withBarista/delta');
  if (arm.barista?.hiredDay == null || arm.barista?.hiredAt == null) throw new Error(`Barista was never hired at ${cost}`);

  const baselineCoffee = Math.max(1, Number(baseline.ownerCoffeeTicks) || 0);
  const canRebuildRecoup = Array.isArray(baseline.dayReport) && Array.isArray(arm.dayReport) && baseline.dayReport.length && arm.dayReport.length;
  const rebuilt = canRebuildRecoup
    ? recoupMilestones(cost, baseline.dayReport, arm.dayReport, arm.barista.hiredDay)
    : null;
  const incremental = rebuilt ? rebuilt.finalIncrement : (Number(delta.cumulativeServiceIncrementAfterHire) || 0);
  const firstRecoupDay = rebuilt ? rebuilt.firstRecoupDay : (delta.firstRecoupDay ?? delta.recoupDay ?? null);
  const durableRecoupDay = rebuilt ? rebuilt.durableRecoupDay : (delta.durableRecoupDay ?? delta.recoupDay ?? null);
  return {
    cost,
    hireDay: arm.barista.hiredDay,
    hireAt: round(arm.barista.hiredAt, 1),
    hireMinute: round(arm.barista.hiredAt / 60, 1),
    daysToComplete: arm.daysToComplete,
    areaDaysDelta: Number(delta.daysToComplete) || 0,
    totalServiceDelta: Number(delta.totalEarnings) || 0,
    day12Delta: Number(delta.day12) || 0,
    lostDeltaPp: round((Number(delta.avgLost) || 0) * 100, 1),
    rushDeltaPp: round((Number(delta.rushFriction) || 0) * 100, 1),
    coffeeWaitDeltaPp: round((Number(delta.coffeeWaitOver6) || 0) * 100, 1),
    ownerCoffeeTicksDelta: Number(delta.ownerCoffeeTicks) || 0,
    ownerCoffeeReliefPct: round((1 - (Number(arm.ownerCoffeeTicks) || 0) / baselineCoffee) * 100, 1),
    incrementalAfterHire: incremental,
    recoupCoveragePct: round((incremental / cost) * 100, 1),
    firstRecoupDay,
    durableRecoupDay,
    recoupDay: durableRecoupDay,
    finalCoins: arm.finalCoins,
    cupsMoved: arm.barista?.cupsMoved || 0,
    beanRefills: arm.barista?.beanRefills || 0,
    jobs: arm.barista?.jobs || 0,
    stalls: arm.stalls || 0,
    teleports: arm.teleports || 0,
  };
}

export function comparePriceSensitivity(rows, liveCost = 2300) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('price sensitivity needs at least two candidates');
  const sorted = [...rows].sort((a, b) => a.cost - b.cost);
  const live = sorted.find(r => r.cost === liveCost) || sorted[sorted.length - 1];
  const cheapest = sorted[0];
  const hireAdvanceSeconds = round((Number(live.hireAt) || 0) - (Number(cheapest.hireAt) || 0), 1);
  const absAdvance = Math.max(0, hireAdvanceSeconds);
  return {
    liveCost: live.cost,
    cheapestCost: cheapest.cost,
    hireAdvanceSeconds,
    hireAdvanceMinutes: round(hireAdvanceSeconds / 60, 1),
    timingBand: absAdvance >= 120 ? 'material-earlier' : absAdvance >= 30 ? 'modest-earlier' : 'same-window',
    areaCompletionDeltaVsLive: (cheapest.daysToComplete ?? 0) - (live.daysToComplete ?? 0),
    serviceDeltaVsLive: (cheapest.totalServiceDelta || 0) - (live.totalServiceDelta || 0),
    finalWalletDeltaVsLive: (cheapest.finalCoins || 0) - (live.finalCoins || 0),
    rushReliefDeltaVsLivePp: round((cheapest.rushDeltaPp || 0) - (live.rushDeltaPp || 0), 1),
    coffeeReliefDeltaVsLivePp: round((cheapest.coffeeWaitDeltaPp || 0) - (live.coffeeWaitDeltaPp || 0), 1),
    recoupCoverageDeltaVsLivePp: round((cheapest.recoupCoveragePct || 0) - (live.recoupCoveragePct || 0), 1),
  };
}