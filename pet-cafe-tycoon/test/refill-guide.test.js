import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { refillGuideTarget } from '../src/sim/refillGuide.js';
import { createCarry, takeSack, useSack, isEmpty } from '../src/sim/carry.js';

const REFILL_BUILT = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl'];

test('an empty coffee machine routes an empty-handed player to the Pantry before the station', () => {
  const w = createWorld(AREA1, { built: REFILL_BUILT });
  w.stations.get('coffee1').beans = 0;
  w.stations.get('bowl1').stock = w.stations.get('bowl1').capacity;
  const t = refillGuideTarget(w, { carry: createCarry() });
  assert.equal(t.kind, 'supplies');
  assert.equal(t.stationId, 'pantry1');
});

// docs/SHIP-PLAN-2026-09-19.md §1.4: the treat bowl refills from its own kibble bin, so there is no
// pantry leg to teach — pointing an empty-handed player at the pantry would point at a pantry that
// no longer stocks kibble.
test('an empty treat bowl routes an empty-handed player straight to the bowl', () => {
  const w = createWorld(AREA1, { built: REFILL_BUILT });
  w.stations.get('coffee1').beans = 20;
  w.stations.get('bowl1').stock = 0;
  const t = refillGuideTarget(w, { carry: createCarry() });
  assert.equal(t.kind, 'refill');
  assert.equal(t.stationId, 'bowl1');
});

test('holding beans routes directly back to the machine that is out of them', () => {
  const w = createWorld(AREA1, { built: REFILL_BUILT });
  w.stations.get('coffee1').beans = 0;
  const beans = createCarry(); takeSack(beans, 'beans');
  const coffee = refillGuideTarget(w, { carry: beans });
  assert.equal(coffee.kind, 'refill'); assert.equal(coffee.stationId, 'coffee1');
});

// A sack is one refill, used up completely (docs/SHIP-PLAN-2026-09-19.md §1.4): a part-used sack in
// the hands is what blocked the next pickup and needed a RETURN crate to get rid of.
test('one pour empties the whole bean sack, whatever the machine had room for', () => {
  const c = createCarry(); takeSack(c, 'beans');
  assert.equal(c.sackLeft, 20);
  assert.equal(useSack(c, 3), 3, 'the machine only had room for three');
  assert.equal(isEmpty(c), true);
  assert.equal(c.sack, null); assert.equal(c.sackLeft, 0);
});

test('kibble is no longer carried at all: the bowl keeps its own bin', () => {
  const c = createCarry();
  assert.equal(takeSack(c, 'kibble'), false);
  assert.equal(isEmpty(c), true);
});
