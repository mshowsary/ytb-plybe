import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARISTA_PRICE_CANDIDATES,
  comparePriceSensitivity,
  summarizeBaristaCandidate,
} from '../tools/barista-price-sweep-lib.js';

test('Barista price sweep keeps the intended four candidate anchors', () => {
  assert.deepEqual([...BARISTA_PRICE_CANDIDATES], [1800, 2000, 2100, 2300]);
});

test('candidate summary measures payback and owner coffee relief without inventing gameplay power', () => {
  const row = summarizeBaristaCandidate(2000, {
    baseline: { ownerCoffeeTicks: 6000 },
    withBarista: {
      daysToComplete: 9,
      finalCoins: 12000,
      ownerCoffeeTicks: 3000,
      stalls: 0,
      teleports: 0,
      barista: { hiredDay: 11, hiredAt: 2500, cupsMoved: 100, beanRefills: 10, jobs: 80 },
    },
    delta: {
      daysToComplete: 0,
      totalEarnings: 800,
      day12: 120,
      avgLost: -0.01,
      rushFriction: -0.08,
      coffeeWaitOver6: -0.12,
      ownerCoffeeTicks: -3000,
      cumulativeServiceIncrementAfterHire: 1000,
      recoupDay: null,
    },
  });
  assert.equal(row.ownerCoffeeReliefPct, 50);
  assert.equal(row.recoupCoveragePct, 50);
  assert.equal(row.rushDeltaPp, -8);
  assert.equal(row.hireMinute, 41.7);
});

test('sensitivity read distinguishes a materially earlier cheaper hire from a same-window change', () => {
  const common = { daysToComplete: 9, totalServiceDelta: 700, finalCoins: 10000, rushDeltaPp: -8, coffeeWaitDeltaPp: -10, recoupCoveragePct: 35 };
  const material = comparePriceSensitivity([
    { ...common, cost: 1800, hireAt: 2400 },
    { ...common, cost: 2300, hireAt: 2580 },
  ], 2300);
  assert.equal(material.timingBand, 'material-earlier');
  assert.equal(material.hireAdvanceMinutes, 3);

  const sameWindow = comparePriceSensitivity([
    { ...common, cost: 1800, hireAt: 2560 },
    { ...common, cost: 2300, hireAt: 2580 },
  ], 2300);
  assert.equal(sameWindow.timingBand, 'same-window');
});
