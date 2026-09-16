import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { destinationFor, canDeliverTo, heldState } from '../src/sim/interaction.js';

function fullWorld() {
  return createWorld(AREA1, { built: AREA1.zones.map(z => z.id) });
}

function item(key) { return { userData: { product: key } }; }

test('heldState keeps product, sack and fruit mutually legible', () => {
  assert.deepEqual(heldState([item('cookie')], { sack: null, sackLeft: 0, fruit: 0 }), { type: 'product', key: 'cookie', count: 1 });
  assert.deepEqual(heldState([], { sack: 'beans', sackLeft: 11, fruit: 0 }), { type: 'sack', key: 'beans', count: 11 });
  assert.deepEqual(heldState([], { sack: null, sackLeft: 0, fruit: 3 }), { type: 'fruit', key: 'fruit', count: 3 });
});

test('product guidance routes to its family display and falls back to RETURN when full', () => {
  const w = fullWorld();
  const cookie = w.stations.get('dispCookie');
  cookie.stock = 3;
  assert.equal(destinationFor(w, { type: 'product', key: 'cookie', count: 2 }).id, 'dispCookie');
  assert.equal(destinationFor(w, { type: 'product', key: 'brownie', count: 2 }).id, 'dispCookie', 'brownies share the cookie-family shelf');
  cookie.stock = cookie.capacity;
  assert.equal(destinationFor(w, { type: 'product', key: 'cookie', count: 2 }).id, 'return1');
});

test('coffee-family alt recipe routes to coffee bar', () => {
  const w = fullWorld();
  const bar = w.stations.get('barCoffee'); bar.stock = 0;
  assert.equal(destinationFor(w, { type: 'product', key: 'latte', count: 1 }).id, 'barCoffee');
  assert.equal(canDeliverTo(bar, { type: 'product', key: 'latte', count: 1 }), true);
});

test('beans, kibble and fruit route to their useful station before RETURN', () => {
  const w = fullWorld();
  const coffee = w.stations.get('coffee1'); coffee.beans = 6;
  const bowl = w.stations.get('bowl1'); bowl.stock = 2;
  const blender = w.stations.get('blender1'); blender.fruit = 1;
  assert.equal(destinationFor(w, { type: 'sack', key: 'beans', count: 14 }).id, 'coffee1');
  assert.equal(destinationFor(w, { type: 'sack', key: 'kibble', count: 14 }).id, 'bowl1');
  assert.equal(destinationFor(w, { type: 'fruit', key: 'fruit', count: 3 }).id, 'blender1');
});

test('full supply destinations deliberately point leftovers to RETURN', () => {
  const w = fullWorld();
  w.stations.get('coffee1').beans = 20;
  w.stations.get('bowl1').stock = w.stations.get('bowl1').capacity;
  w.stations.get('blender1').fruit = 9;
  assert.equal(destinationFor(w, { type: 'sack', key: 'beans', count: 5 }).id, 'return1');
  assert.equal(destinationFor(w, { type: 'sack', key: 'kibble', count: 5 }).id, 'return1');
  assert.equal(destinationFor(w, { type: 'fruit', key: 'fruit', count: 2 }).id, 'return1');
});
