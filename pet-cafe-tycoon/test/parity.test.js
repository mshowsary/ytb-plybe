import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerSpawnSequence, CUSTOMER_SPAWN_SEED } from '../src/sim/customerSpawn.js';
import { compareParityStates, PARITY_TIME_TOLERANCE, PARITY_POSITION_TOLERANCE } from '../src/sim/parity.js';

test('shared customer spawn stream consumes pet + human draws in one documented order', () => {
  const a = createCustomerSpawnSequence();
  const b = createCustomerSpawnSequence(CUSTOMER_SPAWN_SEED);
  const firstA = a.next(), firstB = b.next();
  assert.deepEqual(firstA, firstB);
  assert.equal(firstA.id, 1);
  assert.equal(firstA.species, 'cat');
  assert.equal(firstA.rngDraws, 4);
  const second = a.next();
  assert.equal(second.id, 2);
  assert.equal(second.species, 'dog');
  assert.equal(second.rngDraws, 8);
  assert.deepEqual(a.snapshot(), { seed:CUSTOMER_SPAWN_SEED, nextId:3, speciesIndex:2, rngDraws:8 });
});

function fixture() {
  return {
    coins:100,
    day:{ day:1, t:10, phase:'morning', ended:false },
    stats:{ served:1 }, built:[], partial:{}, stars:{}, stations:[], spawn:null,
    ledger:{ openingWallet:90, sale:10, collection:10, bonus:0, spend:0, deduction:0, walletDelta:10, expectedWallet:100, actualWallet:100, reconciled:true },
    customers:[{ id:1, species:'cat', petVariant:0, variant:{ shirt:0,hair:0,skin:0 }, state:'queue', counterId:'dispCookie', registerId:null, slot:0, order:null, amount:0, paid:false, wish:{ product:'cookie',treat:false }, patience:17, done:false, x:1, z:2 }],
  };
}

test('parity permits only documented clock and position drift', () => {
  const runtime = fixture(), bot = structuredClone(runtime);
  bot.day.t += PARITY_TIME_TOLERANCE * 0.9;
  bot.customers[0].x += PARITY_POSITION_TOLERANCE * 0.9;
  assert.equal(compareParityStates(runtime, bot).ok, true);
});

test('parity never hides wallet or ledger mismatches behind timing tolerance', () => {
  const runtime = fixture(), bot = structuredClone(runtime);
  bot.coins += 1; bot.ledger.actualWallet += 1;
  const result = compareParityStates(runtime, bot);
  assert.equal(result.ok, false);
  assert.ok(result.mismatches.some(m => m.path === 'coins'));
  assert.ok(result.mismatches.some(m => m.path === 'ledger'));
});
