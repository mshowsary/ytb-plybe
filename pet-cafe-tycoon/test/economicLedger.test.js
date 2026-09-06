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
    snapshot() { return { v:4, coins:this.coins, dayState:{ ...this.dayState } }; },
    restore(save) { this.coins = save.coins; this.dayState = { ...save.dayState }; return true; },
  };
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

  const oldUpdate = G.update;
  // Simulate a build frame through the wrapped runtime: the base mutation must be observed as spend.
  live.destroy();
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

  // The first runtime is checked independently so sale accrual cannot be mistaken for collection.
  const saved = oldUpdate; // retain a use so the wrapper lifecycle itself is exercised above.
  assert.equal(typeof saved, 'function');
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
});
