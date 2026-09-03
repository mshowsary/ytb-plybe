// test/carry.test.js — Task 4: the pure carry-slot helper (src/sim/carry.js). No three.js.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { createCarry, isEmpty, canTakeItems, takeSack, useSack, addFruit, dropFruit } from '../src/sim/carry.js';

test('createCarry starts empty', () => {
  const c = createCarry();
  assert.deepEqual(c, { sack: null, sackLeft: 0, fruit: 0 });
  assert.equal(isEmpty(c), true);
  assert.equal(canTakeItems(c), true);
});

test('takeSack succeeds only while empty, always takes a full 20', () => {
  const c = createCarry();
  assert.equal(takeSack(c, 'beans'), true);
  assert.equal(c.sack, 'beans'); assert.equal(c.sackLeft, 20);
  assert.equal(isEmpty(c), false);
  assert.equal(canTakeItems(c), false, 'a carry holding a sack cannot also take product items');
  assert.equal(takeSack(c, 'kibble'), false, 'already holding a sack');
});

test('useSack draws down and clears the sack once emptied', () => {
  const c = createCarry();
  takeSack(c, 'beans');
  assert.equal(useSack(c, 5), 5);
  assert.equal(c.sackLeft, 15);
  assert.equal(c.sack, 'beans', 'not yet empty');
  assert.equal(useSack(c, 20), 15, 'capped at what remained');
  assert.equal(c.sack, null); assert.equal(c.sackLeft, 0);
  assert.equal(isEmpty(c), true);
});

test('useSack on an empty carry is a no-op', () => {
  const c = createCarry();
  assert.equal(useSack(c, 5), 0);
});

test('addFruit adds up to the given cap, only while no sack is held; dropFruit empties it', () => {
  const c = createCarry();
  assert.equal(addFruit(c, 3, 9), 3);
  assert.equal(c.fruit, 3);
  assert.equal(canTakeItems(c), false, 'a carry holding fruit cannot also take product items');
  assert.equal(addFruit(c, 10, 9), 6, 'capped at 9 total');
  assert.equal(c.fruit, 9);
  assert.equal(dropFruit(c), 9);
  assert.equal(c.fruit, 0);
  assert.equal(isEmpty(c), true);
});

test('addFruit refuses while a sack is held', () => {
  const c = createCarry();
  takeSack(c, 'kibble');
  assert.equal(addFruit(c, 3, 9), 0);
  assert.equal(c.fruit, 0);
});

test('takeSack refuses while fruit is held', () => {
  const c = createCarry();
  addFruit(c, 2, 9);
  assert.equal(takeSack(c, 'beans'), false);
});
