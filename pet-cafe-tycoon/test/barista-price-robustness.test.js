import test from 'node:test';
import assert from 'node:assert/strict';
import { recoupMilestones, summarizeBaristaCandidate } from '../tools/barista-price-sweep-lib.js';
import { aggregateBaristaRobustness, recommendBaristaPrice } from '../tools/barista-price-robustness-lib.js';

const rows = values => values.map(([day, earnings]) => ({ day, earnings }));

test('durable recoup ignores a temporary first crossing that later falls back below price', () => {
  const baseline = rows([[10, 100], [11, 100], [12, 100], [13, 100], [14, 100]]);
  const arm = rows([[10, 900], [11, 900], [12, 900], [13, -1500], [14, 300]]);
  const m = recoupMilestones(2000, baseline, arm, 10);
  assert.equal(m.firstRecoupDay, 12);
  assert.equal(m.durableRecoupDay, null);
  assert.equal(m.finalIncrement, 1000);
});

test('durable recoup starts at the later recovery when the curve stays above price afterward', () => {
  const baseline = rows([[10, 100], [11, 100], [12, 100], [13, 100], [14, 100], [15, 100]]);
  const arm = rows([[10, 900], [11, 900], [12, 900], [13, -1500], [14, 1700], [15, 500]]);
  const m = recoupMilestones(2000, baseline, arm, 10);
  assert.equal(m.firstRecoupDay, 12);
  assert.equal(m.durableRecoupDay, 14);
  assert.equal(m.finalIncrement, 2800);
});

test('candidate summary rebuilds payback from day reports instead of trusting stale first-crossing output', () => {
  const baselineDayReport = rows([[12, 100], [13, 100], [14, 100]]);
  const armDayReport = rows([[12, 2200], [13, -1000], [14, 600]]);
  const row = summarizeBaristaCandidate(2000, {
    baseline: { ownerCoffeeTicks: 6000, dayReport: baselineDayReport },
    withBarista: {
      dayReport: armDayReport,
      daysToComplete: 9,
      finalCoins: 12000,
      ownerCoffeeTicks: 3000,
      stalls: 0,
      teleports: 0,
      barista: { hiredDay: 12, hiredAt: 2800, cupsMoved: 100, beanRefills: 10, jobs: 80 },
    },
    delta: {
      daysToComplete: 0,
      totalEarnings: 1400,
      day12: 2100,
      avgLost: 0,
      rushFriction: -0.08,
      coffeeWaitOver6: -0.1,
      ownerCoffeeTicks: -3000,
      cumulativeServiceIncrementAfterHire: 9999,
      recoupDay: 12,
    },
  });
  assert.equal(row.firstRecoupDay, 12);
  assert.equal(row.durableRecoupDay, null);
  assert.equal(row.recoupDay, null);
  assert.equal(row.incrementalAfterHire, 1500);
  assert.equal(row.recoupCoveragePct, 75);
});

test('robust recommendation keeps the highest price that still repays itself safely across seeds', () => {
  const make = (cost, coverage, durable, service = 1200) => Array.from({ length: 5 }, (_, i) => ({
    cost,
    hireMinute: 45 + i * 0.1,
    totalServiceDelta: service + i * 10,
    rushDeltaPp: -7,
    coffeeWaitDeltaPp: -8,
    ownerCoffeeReliefPct: 50,
    recoupCoveragePct: coverage,
    firstRecoupDay: durable ? 20 : null,
    durableRecoupDay: durable ? 21 : null,
    lostDeltaPp: 0,
    finalCoins: 14000,
    areaDaysDelta: 0,
    stalls: 0,
    teleports: 0,
  }));
  const a1800 = aggregateBaristaRobustness(1800, make(1800, 120, true));
  const a2000 = aggregateBaristaRobustness(2000, make(2000, 105, true));
  const a2100 = aggregateBaristaRobustness(2100, make(2100, 80, false));
  const pick = recommendBaristaPrice([a1800, a2000, a2100]);
  assert.equal(a1800.robustPayback, true);
  assert.equal(a2000.robustPayback, true);
  assert.equal(a2100.robustPayback, false);
  assert.equal(pick.cost, 2000);
});