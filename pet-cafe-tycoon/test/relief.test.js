import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendSmartRelief, recommendRushHelp, reliefClaimKey, returnWasteCost,
  RUSH_HELP_COOLDOWN_SECONDS,
} from '../src/sim/relief.js';

function fakeWorld({ desk = true, dirty = 0, lowDisplays = 0, register = false } = {}) {
  const stations = new Map();
  stations.set('hire1', { id: 'hire1', type: 'hire', active: desk });
  if (register) stations.set('reg1', { id: 'reg1', type: 'checkout', active: true, serving: '' });
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
    time: 120,
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
  const G = state({ coins: 650, customers: [{ state: 'atRegister', mood: 'wait', done: false }] });
  const r = recommendSmartRelief(G, fakeWorld());
  assert.equal(r.key, 'cashier');
  assert.equal(r.cost, 1550);
  assert.ok(r.reward > 0 && r.reward <= r.gap);
  assert.equal(r.remaining, r.gap - r.reward);
});

test('smart relief never advertises when player can already afford the useful purchase', () => {
  const G = state({ coins: 1550, customers: [{ state: 'atRegister', mood: 'wait', done: false }] });
  assert.equal(recommendSmartRelief(G, fakeWorld()), null);
});

test('smart relief never advertises when player has barely begun saving', () => {
  const G = state({ coins: 40, customers: [{ state: 'atRegister', mood: 'wait', done: false }] });
  assert.equal(recommendSmartRelief(G, fakeWorld()), null);
});

test('cleaner relief is tied to dirty-table pressure rather than day number alone', () => {
  const G = state({ coins: 500 });
  assert.equal(recommendSmartRelief(G, fakeWorld({ dirty: 0 })), null);
  const r = recommendSmartRelief(G, fakeWorld({ dirty: 3 }));
  assert.equal(r.key, 'cleaner');
  assert.equal(r.cost, 1350);
});

test('reward claim key is stable and namespaced away from end-of-day claims', () => {
  assert.equal(reliefClaimKey(7), 'relief:7');
});

test('rush help is absent outside a real rush and during a calm rush', () => {
  const world = fakeWorld({ register: true });
  assert.equal(recommendRushHelp(state({ dayState: { day: 3, phase: 'morning' } }), world), null);
  assert.equal(recommendRushHelp(state({ dayState: { day: 2, phase: 'rush' } }), world), null);
  assert.equal(recommendRushHelp(state(), world), null);
});

test('rush help chooses temporary cashier help for a concrete checkout bottleneck', () => {
  const customers = [
    { state: 'atRegister', registerId: 'reg1', mood: 'wait', patience: 3, done: false },
    { state: 'atRegister', registerId: 'reg1', mood: 'wait', patience: 8, done: false },
    { state: 'eating', mood: 'none', patience: 17, done: false },
  ];
  const r = recommendRushHelp(state({ customers }), fakeWorld({ register: true }));
  assert.equal(r.kind, 'crew');
  assert.equal(r.role, 'cashier');
  assert.equal(r.label, 'Rush Cashier');
});

test('rush help chooses temporary runner help for guests blocked by empty displays', () => {
  const customers = [
    { state: 'queue', slot: 0, mood: 'wait', patience: 7, done: false },
    { state: 'queue', slot: 1, mood: 'wait', patience: 9, done: false },
    { state: 'eating', mood: 'none', patience: 17, done: false },
  ];
  const r = recommendRushHelp(state({ customers }), fakeWorld({ lowDisplays: 2 }));
  assert.equal(r.kind, 'crew');
  assert.equal(r.role, 'runner');
});

test('rush help can nominate Roomba only when cleaning pressure exists during a populated rush', () => {
  const customers = Array.from({ length: 4 }, (_, i) => ({ id: i, state: 'eating', mood: 'none', patience: 17, done: false }));
  assert.equal(recommendRushHelp(state({ customers }), fakeWorld({ dirty: 1 })), null);
  const r = recommendRushHelp(state({ customers }), fakeWorld({ dirty: 3 }));
  assert.equal(r.kind, 'roomba');
});

test('rush help uses Pet Play Break for broad low-patience pressure without a specific service bottleneck', () => {
  const customers = Array.from({ length: 5 }, (_, i) => ({ id: i, state: 'atBowl', mood: 'wait', patience: i < 3 ? 2 : 7, done: false }));
  const r = recommendRushHelp(state({ customers }), fakeWorld());
  assert.equal(r.kind, 'petLounge');
  assert.equal(r.slots, 2);
  assert.equal(r.suggestedPauseSeconds, 15);
});

test('rush help obeys a runtime cooldown without mutating the runtime', () => {
  const customers = [
    { state: 'atRegister', registerId: 'reg1', mood: 'wait', patience: 3, done: false },
    { state: 'atRegister', registerId: 'reg1', mood: 'wait', patience: 8, done: false },
  ];
  const G = state({ customers, time: 200 });
  const context = { now: 200, lastOfferedAt: 200 - RUSH_HELP_COOLDOWN_SECONDS + 1 };
  const copy = { ...context };
  assert.equal(recommendRushHelp(G, fakeWorld({ register: true }), context), null);
  assert.deepEqual(context, copy);
  assert.equal(recommendRushHelp(G, fakeWorld({ register: true }), { now: 200, lastOfferedAt: 200 - RUSH_HELP_COOLDOWN_SECONDS }).role, 'cashier');
});
