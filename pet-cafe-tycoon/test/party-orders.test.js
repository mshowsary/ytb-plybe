import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensurePartyOrders, availablePartyProducts, maybeStartPartyOrder, partyOrderComplete,
  partyOrderProgress, recordPartyOrderSale, expirePartyOrder, claimPartyOrder, clonePartyOrders,
} from '../src/sim/partyOrders.js';

function world(keys = ['cookie', 'cupcake']) {
  const stations = new Map(); const displays = [];
  for (const key of keys) {
    if (key === 'treat') { stations.set('bowl1', { id: 'bowl1', type: 'bowl', active: true }); continue; }
    const id = `disp-${key}`; displays.push(id); stations.set(id, { id, type: 'display', active: true, product: key });
  }
  return { stations, displays };
}

test('party orders begin after onboarding and only request unlocked product families', () => {
  const meta = {};
  assert.equal(maybeStartPartyOrder(meta, world(['cookie']), 2).active, null);
  const r = maybeStartPartyOrder(meta, world(['cookie', 'cupcake']), 3);
  assert.equal(r.started, true);
  assert.ok(r.active.requirements.every(x => ['cookie', 'cupcake'].includes(x.key)));
  assert.equal(r.active.expiresDay, 4);
});

test('coffee-family alternates count as coffee and treat appears only when bowl is active', () => {
  assert.deepEqual(availablePartyProducts(world(['cookie', 'latte'])), ['cookie', 'coffee']);
  assert.deepEqual(availablePartyProducts(world(['cookie', 'treat'])), ['cookie', 'treat']);
});

test('normal paid sales advance the active basket and completion is capped at targets', () => {
  const meta = {}; const active = maybeStartPartyOrder(meta, world(['cookie']), 3).active;
  active.requirements = [{ key: 'cookie', target: 2, count: 0 }];
  const a = recordPartyOrderSale(meta, ['cookie']);
  assert.equal(a.changed, true); assert.equal(a.completedNow, false);
  const b = recordPartyOrderSale(meta, ['brownie']);
  assert.equal(b.completedNow, true); assert.equal(partyOrderComplete(active), true);
  recordPartyOrderSale(meta, ['cookie', 'cookie']);
  assert.equal(active.requirements[0].count, 2);
  assert.deepEqual(partyOrderProgress(active), { count: 2, target: 2, frac: 1 });
});

test('claim is explicit, pays once and schedules a later opportunity', () => {
  const meta = {}; const active = maybeStartPartyOrder(meta, world(['cookie']), 3).active;
  active.requirements = [{ key: 'cookie', target: 1, count: 1 }]; active.reward = 140;
  const first = claimPartyOrder(meta); assert.deepEqual(first, { ok: true, reward: 140, completed: 1 });
  assert.equal(claimPartyOrder(meta).ok, false);
  assert.equal(maybeStartPartyOrder(meta, world(['cookie']), 4).active, null, 'no immediate replacement spam');
  assert.equal(maybeStartPartyOrder(meta, world(['cookie']), 6).started, true);
});

test('missing an order has no fine; it expires only after its final shift', () => {
  const meta = {}; const active = maybeStartPartyOrder(meta, world(['cookie']), 3).active;
  assert.equal(expirePartyOrder(meta, 4).expired, false);
  const r = expirePartyOrder(meta, 5); assert.equal(r.expired, true); assert.equal(ensurePartyOrders(meta).active, null);
});

test('party-order save clone never aliases nested requirement rows', () => {
  const meta = {}; const active = maybeStartPartyOrder(meta, world(['cookie', 'cupcake']), 3).active;
  const clone = clonePartyOrders(meta);
  clone.active.requirements[0].count = 99;
  assert.notEqual(active.requirements[0].count, 99);
});
