import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendSmartRelief, reliefClaimKey, returnWasteCost } from '../src/sim/relief.js';

function fakeWorld({ desk = true, dirty = 0, lowDisplays = 0 } = {}) {
  const stations = new Map();
  stations.set('hire1', { id: 'hire1', type: 'hire', active: desk });
  for (let i = 0; i < dirty; i++) stations.set(`seat${i}`, { id: `seat${i}`, type: 'seat', active: true, dirty: true });
  for (let i = 0; i < lowDisplays; i++) stations.set(`disp${i}`, { id: `disp${i}`, type: 'display', active: true, stock: 1, capacity: 8 });
  return { stations };
}
function state(overrides = {}) {
  return {
    coins: 350,
    staff: { runner: 0, cashier: 0, cleaner: 0 },
    up: { speed: 0, carry: 0, income: 0 },
    customers: [],
    dayState: { day: 3, phase: 'rush' },
    dayStats: { serviceMisses: 0 },
    ...overrides,
  };
}

test('return waste charges finished food/fruit but never supply sacks', () => {
  assert.equal(returnWasteCost([], 0), 0);
  assert.equal(returnWasteCost(['cookie'], 0), 1);
  assert.ok(returnWasteCost(['smoothie', 'smoothie', 'smoothie', 'smoothie', 'smoothie', 'smoothie'], 0) <= 20);
  assert.ok(returnWasteCost([], 4) > 0);
});

test('smart relief recommends a cashier only inside a genuine near-affordability bottleneck', () => {
  const G = state({ coins: 360, customers: [{ state: 'atRegister', mood: 'wait', done: false }] });
  const r = recommendSmartRelief(G, fakeWorld());
  assert.equal(r.key, 'cashier');
  assert.equal(r.cost, 600);
  assert.ok(r.reward > 0 && r.reward <= r.gap);
  assert.equal(r.remaining, r.gap - r.reward);
});

test('smart relief never advertises when player can already afford the useful purchase', () => {
  const G = state({ coins: 900, customers: [{ state: 'atRegister', mood: 'wait', done: false }] });
  assert.equal(recommendSmartRelief(G, fakeWorld()), null);
});

test('smart relief never advertises when player has barely begun saving', () => {
  const G = state({ coins: 40, customers: [{ state: 'atRegister', mood: 'wait', done: false }] });
  assert.equal(recommendSmartRelief(G, fakeWorld()), null);
});

test('cleaner relief is tied to dirty-table pressure rather than day number alone', () => {
  const G = state({ coins: 180 });
  assert.equal(recommendSmartRelief(G, fakeWorld({ dirty: 0 })), null);
  const r = recommendSmartRelief(G, fakeWorld({ dirty: 3 }));
  assert.equal(r.key, 'cleaner');
});

test('reward claim key is stable and namespaced away from end-of-day claims', () => {
  assert.equal(reliefClaimKey(7), 'relief:7');
});
