import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceRecoveryCost, legacyServiceRecoveryCost, dirtyTablesBlockingSeats } from '../src/sim/serviceQuality.js';

test('Task 23 runtime recovery never deducts banked money', () => {
  for (const reason of ['counter', 'register', 'bowl', 'table', 'unknown']) {
    assert.equal(serviceRecoveryCost(reason, 999), 0);
    assert.equal(serviceRecoveryCost(reason, 1), 0);
  }
});

test('Task 22 retains the former reason-specific wallet-capped schedule only as measurement evidence', () => {
  assert.equal(legacyServiceRecoveryCost('counter', 99), 5);
  assert.equal(legacyServiceRecoveryCost('register', 99), 7);
  assert.equal(legacyServiceRecoveryCost('bowl', 99), 3);
  assert.equal(legacyServiceRecoveryCost('table', 99), 2);
  assert.equal(legacyServiceRecoveryCost('register', 4), 4);
  assert.equal(legacyServiceRecoveryCost('unknown', 99), 0);
});

test('dirty table pressure only triggers when a dirty free table is actually blocking seating', () => {
  const stations = new Map([
    ['a', { type: 'seat', active: true, occupied: false, dirty: true }],
    ['b', { type: 'seat', active: true, occupied: true, dirty: false }],
  ]);
  assert.equal(dirtyTablesBlockingSeats({ stations }), true);
  stations.get('a').dirty = false;
  assert.equal(dirtyTablesBlockingSeats({ stations }), false);
  stations.get('a').dirty = true;
  stations.set('c', { type: 'seat', active: true, occupied: false, dirty: false });
  assert.equal(dirtyTablesBlockingSeats({ stations }), false);
});
