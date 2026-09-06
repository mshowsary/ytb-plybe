import test from 'node:test';
import assert from 'node:assert/strict';
import { installServiceFriction } from '../src/systems/serviceFriction.js';
import { emitWorld } from '../src/sim/events.js';
import { serviceRecoveryCost } from '../src/sim/serviceQuality.js';

function runtime() {
  const world = { events:[], area:{ zones:[] }, built:new Set(), partial:{} };
  const G = {
    coins:100,
    world,
    dayState:{ day:1 },
    dayStats:{ served:0, lost:0, serviceMisses:0, serviceFees:0, wasteFees:0 },
    stats:{},
    customers:[],
    carry:{ onReturn() { throw new Error('legacy return fee callback must be replaced'); } },
    update() {},
    requestCheckpoint() {},
    snapshot() { return {}; },
    restore() { return true; },
  };
  return { G, world };
}

test('waiting/substitution feedback increments service outcome without touching banked money', () => {
  const { G, world } = runtime();
  const system = installServiceFriction(G);
  emitWorld(world, { type:'settled', id:77 });
  assert.equal(G.dayStats.serviceMisses, 1);
  assert.equal(G.dayStats.serviceFees, 0);
  assert.equal(G.coins, 100);
  assert.equal(G.economicLedger.report().deduction, 0);
  system.destroy();
});

test('RETURN still handles the action but cannot charge the wallet', () => {
  const { G } = runtime();
  const system = installServiceFriction(G);
  G.carry.onReturn({ fruit:3, sack:'beans' });
  assert.equal(G.dayStats.returnActions, 1);
  assert.equal(G.dayStats.wasteFees, 0);
  assert.equal(G.coins, 100);
  assert.equal(G.economicLedger.report().deduction, 0);
  system.destroy();
});

test('lost-sale and dirty-table recovery reasons are permanently zero in the live cost API', () => {
  for (const reason of ['counter','register','bowl','table']) assert.equal(serviceRecoveryCost(reason, 100), 0);
});
