// The café used to end. Every sink was a fixed array returning null once exhausted, total authored
// spend was about 110k coins, and the headless bot reached the end on day 12 — which is exactly the
// wall players described, and it was a stated design target rather than an accident.
//
// These tests guard the two halves of the fix, because either one alone reintroduces the problem:
//   1. costs must keep rising and never terminate  (there is always a goal)
//   2. effects must approach a ceiling             (power never outruns the floor)
// and the third property that makes it a game rather than a spreadsheet:
//   3. difficulty must rise with the café, bounded (a finished café can still be overwhelmed)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPGRADES, upgradeCost, playerSpeed, carryCap, incomeMult,
  WORKER_UPGRADES, MACHINE_UPGRADES, workerUpgradeCost, machineUpgradeCost,
  machineSpeedMult, workerSpeedMult,
  nextStarCost, displayStarCap, DISPLAY_STAR_CAP,
  spawnInterval, maxCustomers, CROWD_FLOOR_INTERVAL, CROWD_CEILING,
  BASE_SPEED,
} from '../src/sim/economy.js';
import { AREA1 } from '../data/area1.js';

const DEEP = 40; // far past anything reachable in play; the curves must still behave

test('player upgrade ladders never terminate and always cost more than the tier before', () => {
  for (const key of Object.keys(UPGRADES)) {
    let prev = 0;
    for (let t = 0; t <= DEEP; t++) {
      const cost = upgradeCost(key, { [key]: t });
      assert.ok(cost != null, `${key} tier ${t} must remain purchasable`);
      assert.ok(cost > prev, `${key} tier ${t} (${cost}) must cost more than tier ${t - 1} (${prev})`);
      prev = cost;
    }
  }
});

test('authored tiers are returned verbatim, so days 1-12 are unchanged', () => {
  for (const [key, cfg] of Object.entries(UPGRADES)) {
    cfg.costs.forEach((authored, t) => {
      assert.equal(upgradeCost(key, { [key]: t }), authored, `${key} tier ${t}`);
    });
  }
  assert.equal(playerSpeed({ speed: 0 }), BASE_SPEED);
  assert.ok(Math.abs(playerSpeed({ speed: 2 }) - BASE_SPEED * 1.3) < 1e-9);
  assert.equal(carryCap({ carry: 3 }), 16);
  assert.equal(incomeMult({ income: 0 }, {}, 0), 1);
  assert.ok(Math.abs(incomeMult({ income: 3 }, {}, 0) - 1.6) < 1e-9);
});

test('effects rise monotonically but approach a ceiling instead of running away', () => {
  // Speed: an owner who outruns their own café cannot read the floor any more.
  assert.ok(playerSpeed({ speed: DEEP }) > playerSpeed({ speed: 4 }));
  assert.ok(playerSpeed({ speed: DEEP }) < BASE_SPEED * 1.9, 'player speed must stay bounded');
  // Income: past roughly 2.2x, price inflation outpaces every cost curve in this file.
  assert.ok(incomeMult({ income: DEEP }, {}, 0) > incomeMult({ income: 4 }, {}, 0));
  assert.ok(incomeMult({ income: DEEP }, {}, 0) < 2.3, 'income multiplier must stay bounded');
  // Machines and workers follow the same rule.
  assert.ok(machineSpeedMult({ oven: DEEP }, 'oven') > machineSpeedMult({ oven: 4 }, 'oven'));
  // Designed ceilings: machines approach 1.75 + 0.70 = 2.45x, workers 1.6 + 0.55 = 2.15x.
  assert.ok(machineSpeedMult({ oven: DEEP }, 'oven') < 2.5);
  assert.ok(workerSpeedMult({ runner: { speed: DEEP } }, 'runner') < 2.2);
  // Carry is a capacity and stays linear, which is legible rather than unbounded power.
  assert.ok(carryCap({ carry: 9 }) > carryCap({ carry: 3 }));
});

test('worker, machine and star ladders also continue', () => {
  for (const key of Object.keys(WORKER_UPGRADES)) {
    const levels = { runner: { speed: DEEP, carry: DEEP } };
    assert.ok(workerUpgradeCost('runner', key, levels) != null, `worker ${key} must continue`);
  }
  for (const key of Object.keys(MACHINE_UPGRADES)) {
    assert.ok(machineUpgradeCost(key, { [key]: DEEP }) != null, `machine ${key} must continue`);
  }
  let prev = 0;
  for (let tier = 1; tier < 20; tier++) {
    const cost = nextStarCost(AREA1, 'coffee1', tier);
    assert.ok(cost != null, `star tier ${tier} must remain purchasable`);
    assert.ok(cost > prev, `star tier ${tier} must cost more than the tier before`);
    prev = cost;
  }
});

test('display capacity keeps growing past the authored three tiers', () => {
  for (const [tier, authored] of Object.entries(DISPLAY_STAR_CAP)) {
    assert.equal(displayStarCap(Number(tier)), authored, `authored tier ${tier} unchanged`);
  }
  assert.ok(displayStarCap(6) > displayStarCap(3));
});

test('a developed café gets genuinely busier, and stays bounded', () => {
  const built = new Set(['z_seats1', 'z_oven2', 'z_hire', 'z_coffee', 'z_blender']);
  const staff = { runner: 2, cashier: 1 };

  // Below the authored build-out nothing changes: omitting the level, or passing a low one, must
  // reproduce the old numbers exactly so existing balance work stays valid.
  assert.equal(spawnInterval(built, staff, 0), spawnInterval(built, staff));
  assert.equal(maxCustomers(built, staff, 0), maxCustomers(built, staff));
  assert.equal(spawnInterval(built, staff, 8), spawnInterval(built, staff));

  // Past it, arrivals speed up and the floor holds more guests.
  assert.ok(spawnInterval(built, staff, 24) < spawnInterval(built, staff, 8));
  assert.ok(maxCustomers(built, staff, 24) > maxCustomers(built, staff, 8));

  // Both are clamped: an unbounded rush would be unplayable rather than exciting.
  assert.ok(spawnInterval(built, staff, 500) >= CROWD_FLOOR_INTERVAL);
  assert.ok(maxCustomers(built, staff, 500) <= CROWD_CEILING);

  // Monotonic, never oscillating.
  let last = Infinity;
  for (let lvl = 0; lvl <= 60; lvl += 3) {
    const iv = spawnInterval(built, staff, lvl);
    assert.ok(iv <= last + 1e-9, `interval must not rise as the café grows (level ${lvl})`);
    last = iv;
  }
});

// Rewarded offers have to keep pace with the ladders, or the whole meta-economy quietly dies with
// them: an optional ad worth 500 coins is compelling beside a 900-coin upgrade and meaningless
// beside a 15,000-coin one, and an offer nobody accepts earns nothing for anybody.
//
// This used to be measured on the Mystery Paw Gift's coin cap, which needed a per-level ceiling
// precisely because it paid a FIXED number. Batch E2 cut that offer (ship plan 1.7) and the
// day-end offer became "double today", which is a SHARE of the day the player just played -- so it
// tracks the café by construction, at every scale, with no ceiling to maintain. Same requirement,
// measured against the offer that now carries it.
test('rewarded value tracks the cafe, and never falls behind it', async () => {
  const { summaryBonusAmount, SUMMARY_BONUS_MIN } = await import('../src/sim/adPacing.js');
  // A day of any size is doubled, within the rounding the prize is printed at.
  for (const sales of [180, 420, 1_240, 4_486, 9_871, 28_500, 120_000]) {
    const bonus = summaryBonusAmount(sales);
    assert.ok(bonus >= sales * 0.99 && bonus <= sales * 1.01,
      `a ${sales}-coin day must offer about ${sales}, offered ${bonus}`);
  }
  // Monotonic: a bigger day is never worth less to watch.
  let prev = 0;
  for (let sales = 0; sales <= 60_000; sales += 2_500) {
    const bonus = summaryBonusAmount(sales);
    assert.ok(bonus >= prev, `the offer must not fall as the day grows (sales ${sales})`);
    prev = bonus;
  }
  // ...and a quiet day still pays a floor rather than nothing.
  assert.equal(summaryBonusAmount(0), SUMMARY_BONUS_MIN);
});
