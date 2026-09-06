import test from 'node:test';
import assert from 'node:assert/strict';
import { emitWorld } from '../src/sim/events.js';
import { installEconomicLedger } from '../src/systems/economicLedger.js';

function fixture(coins = 100) {
  const world = { area:{ zones:[{ id:'tables', price:90 }] }, built:new Set(), partial:{}, events:[] };
  const G = {
    coins,
    world,
    dayState:{ day:1 },
    customers:[{ id:7, order:['cookie'] }],
    requestCheckpoint() {},
    update() {},
  };
  // Production game.js uses closure-based snapshot/restore functions. Keep this fixture equivalent
  // so the adapter is free to preserve a function reference without manufacturing a `this` binding.
  G.snapshot = () => ({ v:4, coins:G.coins, dayState:{ ...G.dayState } });
  G.restore = save => { G.coins = save.coins; G.dayState = { ...save.dayState }; return true; };
  return { G, world };
}

test('live adapter classifies sale, collection, spend, deduction and bonus without changing wallet', () => {
  const { G, world } = fixture();
  const live = installEconomicLedger(G);

  emitWorld(world, { type:'pay', id:7, amount:30, checkoutId:'reg1' });
  G.coins += 30;
  G.requestCheckpoint('cash-collection');
  G.coins -= 5; // service/waste path: no material-purchase checkpoint
  G.update(1 / 30);
  const first = live.report();
  assert.equal(first.sale, 30);
  assert.equal(first.collection, 30);
  assert.equal(first.deduction, 5);
  assert.equal(first.expectedWallet, 125);
  assert.equal(first.reconciled, true);

  // Simulate a build frame through the wrapped runtime: the zone delta classifies the spend even
  // though continuous partial construction intentionally does not checkpoint every frame.
  const { G:G2, world:world2 } = fixture(125);
  G2.update = () => { G2.coins -= 10; world2.partial.tables = 10; };
  const live2 = installEconomicLedger(G2);
  G2.update(1 / 30);
  G2.coins += 20;
  const r2 = live2.report();
  assert.equal(r2.spend, 10);
  assert.equal(r2.bonus, 20);
  assert.equal(r2.expectedWallet, 135);
  assert.equal(r2.reconciled, true);
});

test('live adapter keeps sale and collection distinct and persists them through restore', () => {
  const { G, world } = fixture();
  const live = installEconomicLedger(G);
  emitWorld(world, { type:'pay', id:7, amount:30, checkoutId:'reg1' });
  G.coins += 30;
  G.requestCheckpoint('cash-collection');
  G.coins -= 5;
  const report = live.report();
  assert.equal(report.sale, 30);
  assert.equal(report.collection, 30);
  assert.equal(report.deduction, 5);
  assert.equal(report.expectedWallet, 125);
  assert.equal(report.reconciled, true);

  const save = G.snapshot();
  assert.ok(save.ledger);
  const { G:restored } = fixture(0);
  const restoredLive = installEconomicLedger(restored);
  assert.equal(restored.restore(save), true);
  const after = restoredLive.report();
  assert.equal(after.sale, 30);
  assert.equal(after.collection, 30);
  assert.equal(after.deduction, 5);
  assert.equal(after.reconciled, true);

  // A post-reload transaction gets a fresh ledger-owned ID rather than colliding with the saved
  // counter and being silently de-duplicated.
  restored.coins += 7;
  const afterBonus = restoredLive.report();
  assert.equal(afterBonus.bonus, 7);
  assert.equal(afterBonus.actualWallet, 132);
  assert.equal(afterBonus.reconciled, true);
  assert.equal(new Set(restoredLive.ledger.entries.map(e => e.id)).size, restoredLive.ledger.entries.length);
});

test('day transition closes the previous reconciliation and opens a new wallet baseline', () => {
  const { G } = fixture(80);
  const live = installEconomicLedger(G);
  G.coins += 20;
  assert.equal(live.report().expectedWallet, 100);

  G.dayState.day = 2;
  G.update(1 / 30);
  const day2 = live.report();
  assert.equal(day2.day, 2);
  assert.equal(day2.openingWallet, 100);
  assert.equal(day2.transactionCount, 0);
  assert.equal(day2.reconciled, true);

  G.coins -= 15;
  G.requestCheckpoint('player-upgrade');
  const spent = live.report();
  assert.equal(spent.spend, 15);
  assert.equal(spent.expectedWallet, 85);
  assert.equal(spent.reconciled, true);
});
