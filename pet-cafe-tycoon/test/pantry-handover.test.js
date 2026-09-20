// test/pantry-handover.test.js — the pantry hands over what the café is short of, with no sheet.
//
// Before (19-day playthrough / terrace research, 2026-09-19): standing at the pantry raised a
// SUPPLIES button, tapping it opened a bottom sheet titled PANTRY with one or two rows, and a
// 20-unit kibble sack outsized the bowl's 10-unit capacity so the leftovers had to be walked to a
// RETURN crate. docs/SHIP-PLAN-2026-09-19.md §1.4 replaces the whole of that with: stop at the
// pantry, take the sack the neediest connected machine wants, pour it, done.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refillBowl } from '../src/sim/world.js';
import { pantryHandout, pantryFor, refilledInPlace, supplyRoom } from '../src/sim/supplies.js';
import { createCarry, takeSack, useSack } from '../src/sim/carry.js';

function builtWorld() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}

test('a dry coffee machine is what the pantry hands a sack of', () => {
  const w = builtWorld();
  const pantry = w.stations.get('pantry1');
  w.stations.get('coffee1').beans = 0;
  assert.equal(pantryHandout(w, pantry), 'beans');
});

test('the pantry hands over nothing when nothing it stocks has room', () => {
  const w = builtWorld();
  const pantry = w.stations.get('pantry1');
  w.stations.get('coffee1').beans = 20;
  assert.equal(pantryHandout(w, pantry), null, 'walking past a pantry must not fill the hands');
});

test('the pantry never hands over kibble: the treat bowl keeps its own bin', () => {
  const w = builtWorld();
  const pantry = w.stations.get('pantry1');
  w.stations.get('coffee1').beans = 20;
  w.stations.get('bowl1').stock = 0;
  assert.equal(pantryHandout(w, pantry), null);
  assert.equal(pantryFor(w, 'kibble', true), null);
  assert.equal(refilledInPlace(w.stations.get('bowl1')), true);
  assert.equal(refilledInPlace(w.stations.get('coffee1')), false);
});

test('one sack fills the coffee machine from empty and leaves nothing in hand', () => {
  const w = builtWorld();
  const coffee = w.stations.get('coffee1');
  coffee.beans = 0;
  const carry = createCarry();
  assert.equal(takeSack(carry, pantryHandout(w, w.stations.get('pantry1'))), true);
  const used = Math.min(carry.sackLeft, 20 - coffee.beans);
  coffee.beans += used;
  useSack(carry, used);
  assert.equal(coffee.beans, 20, 'one sack is one full refill');
  assert.equal(carry.sack, null, 'and nothing is left over to carry');
});

test('standing at the bowl fills it from its own bin, no sack involved', () => {
  const w = builtWorld();
  const bowl = w.stations.get('bowl1');
  bowl.stock = 0;
  assert.ok(supplyRoom(bowl) > 0);
  const filled = refillBowl(w, bowl.id, supplyRoom(bowl));
  assert.equal(filled, bowl.capacity);
  assert.equal(bowl.stock, bowl.capacity);
});
