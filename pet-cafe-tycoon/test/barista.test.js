import test from 'node:test';
import assert from 'node:assert/strict';
import { BARISTA, baristaHireState, baristaDecision, baristaRoleSummary } from '../src/sim/barista.js';

function world({ beans = 20, machineStock = 0, barStock = 0, barCapacity = 8, pantry = true, product = 'coffee' } = {}) {
  const stations = new Map();
  stations.set('coffee1', { id: 'coffee1', type: 'coffee', active: true, beans, stock: machineStock, product });
  stations.set('barCoffee', { id: 'barCoffee', type: 'display', active: true, stock: barStock, capacity: barCapacity, product: 'coffee' });
  if (pantry) stations.set('pantry1', { id: 'pantry1', type: 'pantry', active: true });
  // Unrelated production proves the role selector cannot drift into Runner work.
  stations.set('oven1', { id: 'oven1', type: 'oven', active: true, stock: 12, product: 'cookie' });
  stations.set('dispCookie', { id: 'dispCookie', type: 'display', active: true, stock: 0, capacity: 8, product: 'cookie' });
  return { stations };
}

test('barista is a later coffee unlock, not an early Day-3 staff purchase', () => {
  assert.equal(BARISTA.unlockDay, 5);
  assert.equal(BARISTA.cost, 2300);
  assert.equal(baristaHireState(4, new Set(['z_coffee']), 9999, 0).reason, 'day');
  assert.equal(baristaHireState(5, new Set(), 9999, 0).reason, 'coffee');
  assert.equal(baristaHireState(5, new Set(['z_coffee']), 2200, 0).reason, 'coins');
  assert.equal(baristaHireState(5, new Set(['z_coffee']), 2300, 0).available, true);
  assert.equal(baristaHireState(8, new Set(['z_coffee']), 9999, 1).reason, 'full');
});

test('barista prioritizes a real Pantry bean top-up before moving drinks', () => {
  const d = baristaDecision(world({ beans: 5, machineStock: 6, barStock: 0 }));
  assert.equal(d.kind, 'refillBeans');
  assert.equal(d.pantryId, 'pantry1');
  assert.equal(d.machineId, 'coffee1');
  assert.equal(d.amount, 13); // tops 5 -> 18, not above the machine's 20 cap
});

test('barista moves only ready coffee-family stock and respects carry/display room', () => {
  const d = baristaDecision(world({ beans: 12, machineStock: 7, barStock: 6, barCapacity: 8 }));
  assert.deepEqual(d, { kind: 'restockCoffee', sourceId: 'coffee1', targetId: 'barCoffee', product: 'coffee', count: 2 });
});

test('barista supports latte batches without becoming a generic Runner', () => {
  const d = baristaDecision(world({ beans: 12, machineStock: 3, barStock: 0, product: 'latte' }));
  assert.equal(d.kind, 'restockCoffee');
  assert.equal(d.product, 'latte');
  assert.equal(d.count, 3);
  const scope = baristaRoleSummary();
  assert.ok(scope.excludes.includes('cookies'));
  assert.match(scope.runnerStillOwns, /cross-product/);
});

test('barista never fabricates beans when Pantry is unavailable', () => {
  const d = baristaDecision(world({ beans: 2, machineStock: 0, pantry: false }));
  assert.equal(d.kind, 'idle');
  assert.equal(d.reason, 'pantry-unavailable');
});
