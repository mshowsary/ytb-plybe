import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialCheckpoint, crossedBuildPaymentMilestone } from '../src/sim/checkpoint.js';

test('material checkpoint coalesces multiple mutations into one latest post-update snapshot', async () => {
  const writes = [];
  const state = { coins: 100, upgrades: 0 };
  const checkpoint = createMaterialCheckpoint(
    { save: async snapshot => { writes.push(structuredClone(snapshot)); return true; } },
    () => structuredClone(state),
  );

  checkpoint.mark('upgrade');
  state.coins = 70;
  state.upgrades = 1;
  checkpoint.mark('hire');
  state.coins = 20;

  assert.equal(checkpoint.dirty, true);
  assert.deepEqual(new Set(checkpoint.reasons), new Set(['upgrade', 'hire']));
  assert.equal(checkpoint.flush(), true);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(checkpoint.dirty, false);
  assert.deepEqual(writes, [{ coins: 20, upgrades: 1 }]);
  assert.equal(checkpoint.flush(), false);
  assert.equal(writes.length, 1);
});

test('reset lets a stronger immediate save supersede a pending material checkpoint', () => {
  let writes = 0;
  const checkpoint = createMaterialCheckpoint({ save: () => { writes++; } }, () => ({ ok: true }));
  checkpoint.mark('cash-collection');
  checkpoint.reset();
  assert.equal(checkpoint.dirty, false);
  assert.equal(checkpoint.flush(), false);
  assert.equal(writes, 0);
});

test('checkpoint transport rejection is contained by the boundary', async () => {
  const checkpoint = createMaterialCheckpoint(
    { save: async () => { throw new Error('offline'); } },
    () => ({ coins: 1 }),
  );
  checkpoint.mark('build-payment');
  assert.equal(checkpoint.flush(), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(checkpoint.dirty, false);
});

test('build payment checkpoints are milestone based rather than per-frame', () => {
  const price = 100;
  assert.equal(crossedBuildPaymentMilestone(0, 1, price), true, 'first contribution');
  assert.equal(crossedBuildPaymentMilestone(1, 24, price), false, 'same first-quarter stream');
  assert.equal(crossedBuildPaymentMilestone(1, 25, price), true, '25% boundary');
  assert.equal(crossedBuildPaymentMilestone(25, 49, price), false);
  assert.equal(crossedBuildPaymentMilestone(25, 50, price), true, '50% boundary');
  assert.equal(crossedBuildPaymentMilestone(50, 75, price), true, '75% boundary');
  assert.equal(crossedBuildPaymentMilestone(75, 99, price), false);
  assert.equal(crossedBuildPaymentMilestone(75, 100, price), true, 'completion');
  assert.equal(crossedBuildPaymentMilestone(40, 40, price), false, 'no new payment');
  assert.equal(crossedBuildPaymentMilestone(60, 55, price), false, 'never checkpoint backwards');
});
