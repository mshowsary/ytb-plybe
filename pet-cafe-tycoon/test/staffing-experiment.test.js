import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_STAFFING_VARIANT, STAFFING_CANDIDATES, areaForStaffingVariant, staffingDemand,
  staffingHireCost, firstHireEntryCost,
} from '../src/sim/staffingExperiment.js';
import { AREA1 } from '../data/area1.js';

test('early Desk makes second register optional without mutating live AREA1', () => {
  const candidate = STAFFING_CANDIDATES.find(v => v.deskCost === 180 && v.firstHireCost === 450);
  const area = areaForStaffingVariant(candidate);
  const zones = new Map(area.zones.map(z => [z.id, z]));
  assert.equal(zones.get('z_hire').requires, 'z_oven2');
  assert.equal(zones.get('z_hire').price, 180);
  assert.equal(zones.get('z_register2').requires, 'z_oven2');
  assert.equal(zones.get('z_coffee').requires, 'z_hire');
  const live = new Map(AREA1.zones.map(z => [z.id, z]));
  assert.equal(live.get('z_hire').requires, 'z_register2');
  assert.equal(live.get('z_hire').price, 480);
});

test('candidate arrival pressure does not rise merely because the Desk was built', () => {
  const candidate = STAFFING_CANDIDATES[0];
  const before = new Set(['z_seats1','z_oven2']);
  const after = new Set([...before, 'z_hire']);
  assert.deepEqual(staffingDemand(candidate, before, {}), staffingDemand(candidate, after, {}));
  const withCapacity = staffingDemand(candidate, new Set([...after, 'z_coffee']), {});
  assert.ok(withCapacity.interval < staffingDemand(candidate, after, {}).interval);
});

test('current arm retains live Desk-triggered demand behavior', () => {
  const before = staffingDemand(CURRENT_STAFFING_VARIANT, new Set(['z_seats1','z_oven2']), {});
  const after = staffingDemand(CURRENT_STAFFING_VARIANT, new Set(['z_seats1','z_oven2','z_register2','z_hire']), {});
  assert.ok(after.interval < before.interval);
  assert.ok(after.maxCustomers >= before.maxCustomers);
});

test('candidate discounts only the first Runner and preserves all later live hire prices', () => {
  const c = STAFFING_CANDIDATES.find(v => v.deskCost === 180 && v.firstHireCost === 450);
  assert.equal(c.firstHireKind, 'runner');
  assert.equal(staffingHireCost(c, 'runner', {cashier:0,runner:0,cleaner:0}), 450);
  assert.equal(staffingHireCost(c, 'cashier', {cashier:0,runner:0,cleaner:0}), 1550);
  assert.equal(staffingHireCost(c, 'runner', {cashier:1,runner:0,cleaner:0}), 1800);
  assert.equal(staffingHireCost(c, 'runner', {cashier:0,runner:1,cleaner:0}), 2800);
});

test('entry ledger includes the measured Desk and first Runner without hiding second register cost', () => {
  const c = STAFFING_CANDIDATES.find(v => v.deskCost === 180 && v.firstHireCost === 450);
  assert.deepEqual(firstHireEntryCost(c), { construction:490, firstHire:450, total:940 });
  assert.deepEqual(firstHireEntryCost(CURRENT_STAFFING_VARIANT), { construction:1130, firstHire:1550, total:2680 });
});
