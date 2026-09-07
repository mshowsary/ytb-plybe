import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_STAFFING_VARIANT, STAFFING_CANDIDATES, areaForStaffingVariant, staffingDemand,
  staffingHireCost, firstHireEntryCost,
} from '../src/sim/staffingExperiment.js';
import { AREA1 } from '../data/area1.js';
import { STAFF, hireCost, spawnInterval, maxCustomers } from '../src/sim/economy.js';

test('Task 24 candidate cloning stays isolated from the shipped Task 25 area', () => {
  const candidate = STAFFING_CANDIDATES.find(v => v.deskCost === 180 && v.firstHireCost === 450);
  const area = areaForStaffingVariant(candidate);
  const zones = new Map(area.zones.map(z => [z.id, z]));
  assert.equal(zones.get('z_hire').requires, 'z_oven2');
  assert.equal(zones.get('z_hire').price, 180);
  assert.equal(zones.get('z_register2').requires, 'z_oven2');
  assert.equal(zones.get('z_coffee').requires, 'z_hire');

  // The experiment clone may use a different sweep price, but it can never mutate the live winner.
  const live = new Map(AREA1.zones.map(z => [z.id, z]));
  assert.equal(live.get('z_hire').requires, 'z_oven2');
  assert.equal(live.get('z_hire').price, 300);
  assert.equal(live.get('z_register2').requires, 'z_oven2');
  assert.equal(live.get('z_coffee').requires, 'z_hire');
});

test('candidate arrival pressure does not rise merely because the Desk was built', () => {
  const candidate = STAFFING_CANDIDATES[0];
  const before = new Set(['z_seats1','z_oven2']);
  const after = new Set([...before, 'z_hire']);
  assert.deepEqual(staffingDemand(candidate, before, {}), staffingDemand(candidate, after, {}));
  const withCapacity = staffingDemand(candidate, new Set([...after, 'z_coffee']), {});
  assert.ok(withCapacity.interval < staffingDemand(candidate, after, {}).interval);
});

test('Task 24 historical control remains frozen after Task 25 changes the live economy', () => {
  const before = staffingDemand(CURRENT_STAFFING_VARIANT, new Set(['z_seats1','z_oven2']), {});
  const after = staffingDemand(CURRENT_STAFFING_VARIANT, new Set(['z_seats1','z_oven2','z_register2','z_hire']), {});
  assert.equal(before.mode, 'historical');
  assert.equal(after.mode, 'historical');
  assert.ok(after.interval < before.interval);
  assert.ok(after.maxCustomers >= before.maxCustomers);

  // Live Task 25 intentionally behaves differently: Desk construction alone adds zero pressure.
  const liveBefore = new Set(['z_seats1','z_oven2']);
  const liveAfter = new Set([...liveBefore, 'z_hire']);
  assert.equal(spawnInterval(liveAfter, {}), spawnInterval(liveBefore, {}));
  assert.equal(maxCustomers(liveAfter, {}), maxCustomers(liveBefore, {}));
});

test('candidate discounts only its first Runner and preserves the measured historical fallback prices', () => {
  const c = STAFFING_CANDIDATES.find(v => v.deskCost === 180 && v.firstHireCost === 450);
  assert.equal(c.firstHireKind, 'runner');
  assert.equal(staffingHireCost(c, 'runner', {cashier:0,runner:0,cleaner:0}), 450);
  assert.equal(staffingHireCost(c, 'cashier', {cashier:0,runner:0,cleaner:0}), 1550);
  assert.equal(staffingHireCost(c, 'runner', {cashier:1,runner:0,cleaner:0}), 1800);
  assert.equal(staffingHireCost(c, 'runner', {cashier:0,runner:1,cleaner:0}), 2800);
});

test('Task 25 live winner is Desk 300 + first Runner 150 with later hire prices preserved', () => {
  // The authored opening prices are the thing this test protects; later entries were added so a
  // developed café can answer a rush it can now actually face.
  assert.equal(STAFF.runner.costs[0], 150);
  assert.equal(STAFF.runner.costs[1], 2800);
  assert.equal(STAFF.cashier.costs[0], 1550);
  assert.equal(STAFF.cleaner.costs[0], 1350);
  assert.equal(hireCost('runner', {runner:0}), 150);
  assert.equal(hireCost('runner', {runner:1}), 2800);
});

test('entry ledger remains reproducible for the historical control and measured candidates', () => {
  const c = STAFFING_CANDIDATES.find(v => v.deskCost === 180 && v.firstHireCost === 450);
  assert.deepEqual(firstHireEntryCost(c), { construction:490, firstHire:450, total:940 });
  assert.deepEqual(firstHireEntryCost(CURRENT_STAFFING_VARIANT), { construction:1130, firstHire:1550, total:2680 });
});
