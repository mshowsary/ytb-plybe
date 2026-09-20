// Every supply lane routes: a dry machine sends the player to the place that stocks its supply,
// and a full pair of hands sends them on to the machine.
//
// Before src/sim/supplies.js this knew beans and kibble only, so a dry ice cream machine produced
// no guidance at all — and canDeliverTo did not recognise the sack either, so the game routed an
// owner holding cream to the RETURN crate. (The retired spa bath's water lane went with the spa,
// and the cream lane with the cold pantry on 2026-09-19: the ice cream machine needs no supply.)
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { refillGuideTarget } from '../src/sim/refillGuide.js';
import { pendingJobs, jobTarget } from '../src/sim/jobs.js';
import { canDeliverTo, destinationFor, heldLabel } from '../src/sim/interaction.js';
import { SUPPLY_OF, isStarved, pantryFor, supplyLevel } from '../src/sim/supplies.js';

// Build the whole café so the terrace stations exist and are active.
function builtWorld() {
  const w = createWorld(AREA1);
  // payZone meters the spend over time, so each zone needs repeated calls until it reports done —
  // the same loop test/layout.test.js uses to stand the whole café up.
  for (const z of AREA1.zones) { let guard = 0; while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}
const byType = (w, type) => [...w.stations.values()].find(s => s.active && s.type === type);
const drainAll = w => {
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'coffee') st.beans = 20;
    if (st.type === 'bowl') st.stock = st.capacity;
  }
};

test('the whole café builds, and every supply-consuming machine is present', () => {
  const w = builtWorld();
  for (const type of Object.keys(SUPPLY_OF)) {
    assert.ok(byType(w, type), `no active ${type} station after building every zone`);
  }
});

test('a dry espresso machine routes to the pantry that stocks ITS supply, not just any pantry', () => {
  const w = builtWorld();
  drainAll(w);
  const st = byType(w, 'coffee');
  st.beans = 0;
  assert.equal(supplyLevel(st), 0, 'the coffee machine did not actually drain');
  assert.equal(isStarved(st), true, 'the coffee machine is dry but does not read as starved');
  assert.equal(pantryFor(w, 'beans').id, 'pantry1', 'beans should come from pantry1');

  const G = { P: { x: st.x, z: st.z }, carry: { sack: null, sackLeft: 0, fruit: 0 }, coins: 0, customers: [] };
  const guide = refillGuideTarget(w, G);
  assert.ok(guide, 'a dry coffee machine produced no guidance at all');
  assert.equal(guide.kind, 'supplies');
  assert.equal(guide.stationId, 'pantry1', `a dry coffee machine pointed at ${guide.stationId}`);
});

// docs/SHIP-PLAN-2026-09-19.md 1.4: the treat bowl keeps its own kibble bin, so nobody walks a
// sack across the cafe for it. There is no first leg to teach, so the guidance points straight at
// the bowl -- and a pantry trip for kibble would now be a trip to a pantry that stocks none.
test('a dry treat bowl points at itself: its kibble is in its own bin, not at the pantry', () => {
  const w = builtWorld();
  drainAll(w);
  const bowl = byType(w, 'bowl');
  bowl.stock = 0;
  assert.equal(isStarved(bowl), true);
  assert.equal(pantryFor(w, 'kibble', true), null, 'no pantry hands out kibble any more');
  const G = { P: { x: 0, z: 0 }, carry: { sack: null, sackLeft: 0, fruit: 0 }, coins: 0, customers: [] };
  const guide = refillGuideTarget(w, G);
  assert.ok(guide, 'a dry treat bowl produced no guidance at all');
  assert.equal(guide.kind, 'refill');
  assert.equal(guide.stationId, bowl.id, `a dry bowl pointed at ${guide.stationId}`);
});

test('holding beans switches the guidance to the machine that needs them', () => {
  const w = builtWorld();
  drainAll(w);
  const st = byType(w, 'coffee');
  st.beans = 0;
  const G = { P: { x: st.x, z: st.z }, carry: { sack: 'beans', sackLeft: 20, fruit: 0 }, coins: 0, customers: [] };
  const guide = refillGuideTarget(w, G);
  assert.ok(guide, 'holding beans produced no guidance');
  assert.equal(guide.kind, 'refill');
  assert.equal(guide.stationId, st.id, `holding beans pointed at ${guide.stationId}, not the dry machine`);
});

test('a carried sack is deliverable to its machine, and has nowhere else it could be sent', () => {
  const w = builtWorld();
  drainAll(w);
  const st = byType(w, 'coffee');
  st.beans = 0;
  const held = { type: 'sack', key: 'beans', count: 20 };
  assert.equal(canDeliverTo(st, held), true, 'a beans sack cannot be delivered to the coffee machine');
  const dest = destinationFor(w, held, { x: st.x, z: st.z });
  assert.equal(dest && dest.type, 'coffee', `beans were routed to a ${dest && dest.type}`);
  assert.equal(heldLabel(held), 'beans');
  // And with the machine full there is no crate left to fall back to.
  st.beans = 20;
  assert.equal(destinationFor(w, held, { x: st.x, z: st.z }), null);
});

test('a dry espresso machine or treat bowl is a pending job', () => {
  const w = builtWorld();
  const G = { P: { x: 0, z: 0 }, carry: { sack: null, sackLeft: 0, fruit: 0 }, coins: 0, customers: [] };
  for (const [type, field] of [['coffee', 'beans'], ['bowl', 'stock']]) {
    drainAll(w);
    for (const st of w.stations.values()) if (st.type === 'bush' && st.active) st.stage = 0;
    byType(w, type)[field] = 0;
    assert.equal(pendingJobs(w, G).sacksEmpty, 1, `a dry ${type} is not counted as an empty supply`);
    assert.equal(jobTarget(w, G).kind, 'refill', `a dry ${type} does not make "refill" the next job`);
  }
});

test('the garden ice cream machine drinks nothing: never starved, never a refill job, never a pantry trip', () => {
  const w = builtWorld();
  drainAll(w);
  for (const st of w.stations.values()) if (st.type === 'bush' && st.active) st.stage = 0;
  const ice = byType(w, 'icecream');
  assert.ok(ice, 'the garden builds its ice cream machine');
  ice.stock = 0;
  assert.equal(SUPPLY_OF.icecream, undefined, 'no supply kind for the ice cream machine');
  assert.equal('cream' in ice, false, 'the machine carries no supply field');
  assert.equal(isStarved(ice), false);
  const G = { P: { x: ice.x, z: ice.z }, carry: { sack: null, sackLeft: 0, fruit: 0 }, coins: 0, customers: [] };
  assert.equal(pendingJobs(w, G).sacksEmpty, 0);
  assert.equal(refillGuideTarget(w, G), null, 'an empty ice cream machine sent the player to a pantry');
  // Nor does any pantry hand out cream: the cold pantry is gone and the café pantry never did.
  assert.equal(pantryFor(w, 'cream', true), null);
});

test('a dry blender is NOT a refill errand — its fruit comes off the bushes', () => {
  const w = builtWorld();
  drainAll(w);
  const blender = byType(w, 'blender');
  blender.fruit = 0;
  for (const st of w.stations.values()) if (st.type === 'bush' && st.active) st.stage = 0;
  const G = { P: { x: blender.x, z: blender.z }, carry: { sack: null, sackLeft: 0, fruit: 0 }, coins: 0, customers: [] };
  assert.equal(pendingJobs(w, G).sacksEmpty, 0, 'an empty blender was counted as an empty sack');
  assert.equal(refillGuideTarget(w, G), null, 'an empty blender sent the player shopping for fruit');

  // Carrying fruit, though, the blender is exactly where it belongs.
  const carrying = { ...G, carry: { sack: null, sackLeft: 0, fruit: 3 } };
  const guide = refillGuideTarget(w, carrying);
  assert.ok(guide, 'carrying fruit produced no guidance');
  assert.equal(guide.stationId, blender.id);
});
