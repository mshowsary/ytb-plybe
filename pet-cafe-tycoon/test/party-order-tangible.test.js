import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { emitWorld } from '../src/sim/events.js';
import { installEconomicLedger } from '../src/systems/economicLedger.js';
import {
  clonePartyOrders, expirePartyOrder, recordPartyOrderSale,
} from '../src/sim/partyOrders.js';
import { createPartyOrderCrate, partyOrderCrateModel } from '../src/render/partyOrderCrate.js';

function activeOrder() {
  return {
    id: 37, title: 'Puppy Birthday', subtitle: '', createdDay: 3, expiresDay: 4,
    reward: 140, claimed: false,
    requirements: [
      { key: 'cookie', target: 2, count: 0 },
      { key: 'coffee', target: 1, count: 0 },
    ],
  };
}

function ledgerFixture() {
  const world = { area: { zones: [] }, built: new Set(), partial: {}, events: [] };
  const G = {
    coins: 100, world, dayState: { day: 3 },
    customers: [{ id: 9, order: ['cookie'] }],
    requestCheckpoint() {}, update() {},
  };
  G.snapshot = () => ({ v: 4, coins: G.coins, dayState: { ...G.dayState } });
  G.restore = save => { G.coins = save.coins; G.dayState = { ...save.dayState }; return true; };
  return { G, world };
}

test('Task 37: crate model is derived only from persisted party-order counts', () => {
  const active = activeOrder();
  active.requirements[0].count = 1;
  const model = partyOrderCrateModel(active);
  assert.deepEqual(model, {
    id: 37, target: 3, fulfilled: 1, complete: false,
    byFamily: { cookie: 1, coffee: 0 },
  });
  assert.deepEqual(partyOrderCrateModel(null), { id: null, target: 0, fulfilled: 0, complete: false, byFamily: {} });
});

test('Task 37: one paid event records one ledger sale and fills the crate once without consuming inventory', () => {
  const { G, world } = ledgerFixture();
  const live = installEconomicLedger(G);
  const meta = { partyOrders: { nextId: 38, completed: 0, lastOfferDay: 3, active: activeOrder() } };
  const crate = createPartyOrderCrate(AREA1);
  crate.setOrder(meta.partyOrders.active);
  const order = ['cookie'];
  const beforeOrder = [...order];

  emitWorld(world, { type: 'pay', id: 9, amount: 18, checkoutId: 'register1' });
  // This is the same single game-loop consumption of the already-paid customer order used by game.js.
  const progress = recordPartyOrderSale(meta, order);
  assert.equal(progress.changed, true);
  crate.setOrder(progress.active);

  const report = live.report();
  assert.equal(report.sale, 18);
  assert.equal(report.transactionCount, 1, 'one pay event must create one sale transaction');
  assert.equal(meta.partyOrders.active.requirements[0].count, 1, 'one pay event advances one matching requirement once');
  assert.equal(crate.fulfilled, 1, 'the physical crate mirrors that same persisted count once');
  assert.equal(crate.visibleFamilyCounts.cookie, 1);
  assert.deepEqual(order, beforeOrder, 'party-order presentation/progress must not consume or rewrite sold inventory');

  // Re-rendering is idempotent: visual synchronization itself cannot double progress.
  crate.setOrder(meta.partyOrders.active);
  assert.equal(crate.fulfilled, 1);
  assert.equal(meta.partyOrders.active.requirements[0].count, 1);
  assert.equal(live.report().transactionCount, 1);
});

test('Task 37: completion exposes one contextual collection cue and never overfills', () => {
  const meta = { partyOrders: { nextId: 38, completed: 0, lastOfferDay: 3, active: activeOrder() } };
  const crate = createPartyOrderCrate(AREA1);
  recordPartyOrderSale(meta, ['cookie', 'cookie']);
  recordPartyOrderSale(meta, ['latte']); // same coffee family
  recordPartyOrderSale(meta, ['cookie', 'coffee']); // already complete: ignored
  crate.setOrder(meta.partyOrders.active);

  assert.equal(crate.complete, true);
  assert.equal(crate.fulfilled, 3);
  assert.equal(crate.target, 3);
  assert.deepEqual(crate.visibleFamilyCounts, { cookie: 2, cupcake: 0, coffee: 1, smoothie: 0, treat: 0 });
  const cue = crate.group.getObjectByName('party-order-ready-cue');
  assert.ok(cue && cue.visible, 'completion should add one world-space collection cue at the crate');
});

test('Task 37: reload restores the same physical fill and expiry clears it', () => {
  const meta = { partyOrders: { nextId: 38, completed: 0, lastOfferDay: 3, active: activeOrder() } };
  recordPartyOrderSale(meta, ['cookie', 'latte']);
  const saved = clonePartyOrders(meta);

  const restoredMeta = { partyOrders: saved };
  const restored = createPartyOrderCrate(AREA1);
  restored.setOrder(restoredMeta.partyOrders.active);
  assert.equal(restored.group.visible, true);
  assert.equal(restored.fulfilled, 2);
  assert.equal(restored.visibleFamilyCounts.cookie, 1);
  assert.equal(restored.visibleFamilyCounts.coffee, 1);

  const expired = expirePartyOrder(restoredMeta, 5);
  assert.equal(expired.expired, true);
  restored.setOrder(restoredMeta.partyOrders.active);
  assert.equal(restored.group.visible, false);
  assert.equal(restored.fulfilled, 0);
  assert.deepEqual(restored.visibleFamilyCounts, { cookie: 0, cupcake: 0, coffee: 0, smoothie: 0, treat: 0 });
});
