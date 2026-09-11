import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { validateAndMigrateSave } from '../src/sim/save.js';
import {
  OWNER_STATE_VERSION, OWNER_SPAWN, normalizeOwnerState, snapshotOwnerState, restoreOwnerState,
} from '../src/sim/ownerState.js';

function fakeItem(key) {
  return {
    userData: { product: key },
    scale: { value: 0, setScalar(v) { this.value = v; } },
  };
}

function fakeOwner(initial = []) {
  return {
    items: initial.map(fakeItem),
    carryVisual: null,
    clearItems() { this.items.length = 0; },
    addItem(item) { this.items.push(item); },
    setCarryProps(sack, fruit) { this.carryVisual = { sack, fruit }; },
  };
}

test('owner payload round-trips bounded position, facing and a same-family product stack', () => {
  const P = { x: 1.75, z: 3.2, rot: 0.85 };
  const carry = { sack: null, sackLeft: 0, fruit: 0 };
  const items = [fakeItem('cookie'), fakeItem('brownie'), fakeItem('cookie')];
  const payload = snapshotOwnerState(P, carry, items, { carry: 0 }, AREA1);

  assert.equal(payload.v, OWNER_STATE_VERSION);
  assert.deepEqual(payload.position, P);
  assert.deepEqual(payload.products, ['cookie', 'brownie', 'cookie']);
  assert.deepEqual(payload.carry, { sack: null, sackLeft: 0, fruit: 0 });

  const restoredP = { x: -9, z: -6, rot: -2, vx: 4, vz: -3 };
  const restoredCarry = { sack: 'kibble', sackLeft: 9, fruit: 0 };
  const owner = fakeOwner(['cupcake']);
  assert.equal(restoreOwnerState(restoredP, restoredCarry, owner, payload, AREA1, { carry: 0 }, fakeItem), true);
  assert.deepEqual(
    { x: restoredP.x, z: restoredP.z, rot: restoredP.rot, vx: restoredP.vx, vz: restoredP.vz },
    { x: 1.75, z: 3.2, rot: 0.85, vx: 0, vz: 0 },
  );
  assert.deepEqual(owner.items.map(item => item.userData.product), ['cookie', 'brownie', 'cookie']);
  assert.ok(owner.items.every(item => item.scale.value === 1), 'restored products should not replay pickup scale-in');
  assert.deepEqual(restoredCarry, { sack: null, sackLeft: 0, fruit: 0 });
});

test('part-used supply sacks and harvested fruit survive as exclusive carry modes', () => {
  const beans = normalizeOwnerState({
    v: OWNER_STATE_VERSION,
    position: { x: 0, z: 0, rot: 0 },
    products: [],
    carry: { sack: 'beans', sackLeft: 7, fruit: 0 },
  }, AREA1, { carry: 0 });
  assert.equal(beans.ok, true);
  assert.deepEqual(beans.data.carry, { sack: 'beans', sackLeft: 7, fruit: 0 });

  const fruit = normalizeOwnerState({
    v: OWNER_STATE_VERSION,
    position: { x: 0, z: 0, rot: 0 },
    products: [],
    carry: { sack: null, sackLeft: 0, fruit: 8 },
  }, AREA1, { carry: 1 }); // carry tier 1 -> cap 9
  assert.equal(fruit.ok, true);
  assert.deepEqual(fruit.data.carry, { sack: null, sackLeft: 0, fruit: 8 });
});

test('contradictory, mixed-family and over-cap inventory clears instead of minting a preferred subset', () => {
  const cases = [
    {
      products: ['cookie'],
      carry: { sack: 'beans', sackLeft: 20, fruit: 0 },
    },
    {
      products: ['cookie', 'coffee'],
      carry: { sack: null, sackLeft: 0, fruit: 0 },
    },
    {
      products: Array.from({ length: 7 }, () => 'cookie'), // starter carry cap is 6
      carry: { sack: null, sackLeft: 0, fruit: 0 },
    },
    {
      products: [],
      carry: { sack: null, sackLeft: 0, fruit: 99 },
    },
    {
      products: ['not-a-product'],
      carry: { sack: null, sackLeft: 0, fruit: 0 },
    },
  ];

  for (const row of cases) {
    const result = normalizeOwnerState({ v: OWNER_STATE_VERSION, position: {}, ...row }, AREA1, { carry: 0 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.products, []);
    assert.deepEqual(result.data.carry, { sack: null, sackLeft: 0, fruit: 0 });
  }
});

test('position is finite, café-bounded and facing is normalized', () => {
  const result = normalizeOwnerState({
    v: OWNER_STATE_VERSION,
    position: { x: 9999, z: -9999, rot: Math.PI * 9 },
    products: [], carry: {},
  }, AREA1, {});
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.position, { x: 9.5, z: -6.5, rot: Math.PI });

  const badNumbers = normalizeOwnerState({
    v: OWNER_STATE_VERSION,
    position: { x: Infinity, z: NaN, rot: Infinity },
    products: [], carry: {},
  }, AREA1, {});
  assert.equal(badNumbers.ok, true);
  assert.deepEqual(badNumbers.data.position, OWNER_SPAWN);
});

test('missing owner payload is a legitimate legacy save with empty hands at the spawn', () => {
  const result = normalizeOwnerState(null, AREA1, { carry: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.legacy, true);
  assert.deepEqual(result.data, {
    v: OWNER_STATE_VERSION,
    position: OWNER_SPAWN,
    products: [],
    carry: { sack: null, sackLeft: 0, fruit: 0 },
  });
});

test('save validator rejects unsupported owner versions and wrong nested container shapes', () => {
  for (const ownerState of [
    { v: 99, position: {}, products: [], carry: {} },
    { v: OWNER_STATE_VERSION, position: [], products: [], carry: {} },
    { v: OWNER_STATE_VERSION, position: {}, products: {}, carry: {} },
    { v: OWNER_STATE_VERSION, position: {}, products: [], carry: [] },
  ]) {
    const result = validateAndMigrateSave({ v: 4, ownerState }, AREA1);
    assert.equal(result.ok, false);
    assert.match(result.reason, /^ownerState:/);
  }
});

test('save validator canonicalizes owner inventory against the restored carry upgrade tier', () => {
  const raw = {
    v: 4,
    upgrades: { carry: 1 },
    ownerState: {
      v: OWNER_STATE_VERSION,
      position: { x: 2, z: 1, rot: -0.4 },
      products: Array.from({ length: 8 }, (_, i) => i % 2 ? 'brownie' : 'cookie'),
      carry: { sack: null, sackLeft: 0, fruit: 0 },
    },
  };
  const result = validateAndMigrateSave(raw, AREA1);
  assert.equal(result.ok, true);
  assert.equal(result.data.upgrades.carry, 1);
  assert.equal(result.data.ownerState.products.length, 8);
  assert.deepEqual(result.data.ownerState.position, { x: 2, z: 1, rot: -0.4 });
});
