import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { refillGuideTarget } from '../src/sim/refillGuide.js';
import { createCarry, takeSack, useSack, isEmpty } from '../src/sim/carry.js';

const REFILL_BUILT = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl'];

test('empty coffee/bowl routes an empty-handed player to Pantry before the station', () => {
  const w = createWorld(AREA1, { built: REFILL_BUILT });
  w.stations.get('coffee1').beans = 0;
  w.stations.get('bowl1').stock = 0;
  const t = refillGuideTarget(w, { carry: createCarry() });
  assert.equal(t.kind, 'supplies');
  assert.equal(t.stationId, 'pantry1');
});

test('holding the correct supply routes directly back to its empty station', () => {
  const w = createWorld(AREA1, { built: REFILL_BUILT });
  w.stations.get('coffee1').beans = 0;
  w.stations.get('bowl1').stock = 0;
  const beans = createCarry(); takeSack(beans, 'beans');
  const coffee = refillGuideTarget(w, { carry: beans });
  assert.equal(coffee.kind, 'refill'); assert.equal(coffee.stationId, 'coffee1');
  const kibble = createCarry(); takeSack(kibble, 'kibble');
  const bowl = refillGuideTarget(w, { carry: kibble });
  assert.equal(bowl.kind, 'refill'); assert.equal(bowl.stationId, 'bowl1');
});

test('kibble is a single refill portion so a partial bowl refill leaves no useless sack in hand', () => {
  const c = createCarry();
  assert.equal(takeSack(c, 'kibble'), true);
  assert.equal(c.sackLeft, 10);
  assert.equal(useSack(c, 3), 3);
  assert.equal(isEmpty(c), true);
  assert.equal(c.sack, null); assert.equal(c.sackLeft, 0);
});

test('beans remain a reusable supply bag across partial coffee top-ups', () => {
  const c = createCarry(); takeSack(c, 'beans');
  assert.equal(c.sackLeft, 20);
  assert.equal(useSack(c, 3), 3);
  assert.equal(c.sack, 'beans'); assert.equal(c.sackLeft, 17);
});
