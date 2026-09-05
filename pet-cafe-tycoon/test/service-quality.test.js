import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceRecoveryCost, dirtyTablesBlockingSeats } from '../src/sim/serviceQuality.js';

test('service recovery costs are small, reason-specific and wallet-capped', () => {
  assert.equal(serviceRecoveryCost('counter', 99), 5);
  assert.equal(serviceRecoveryCost('register', 99), 7);
  assert.equal(serviceRecoveryCost('bowl', 99), 3);
  assert.equal(serviceRecoveryCost('table', 99), 2);
  assert.equal(serviceRecoveryCost('register', 4), 4);
  assert.equal(serviceRecoveryCost('unknown', 99), 0);
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
