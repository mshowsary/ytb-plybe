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

test('a dry machine routes to the pantry that stocks ITS supply, not just any pantry', () => {
  const w = builtWorld();
  const cases = [
    ['coffee', 'beans', 'pantry1'],
    ['bowl', 'kibble', 'pantry1'],
  ];
  for (const [type, supply, pantryId] of cases) {
    drainAll(w);
    const st = byType(w, type);
    st[{ coffee: 'beans', bowl: 'stock' }[type]] = 0;
    assert.equal(supplyLevel(st), 0, `${type} did not actually drain`);
    assert.equal(isStarved(st), true, `${type} is dry but does not read as starved`);
    assert.equal(pantryFor(w, supply).id, pantryId, `${supply} should come from ${pantryId}`);

    const G = { P: { x: st.x, z: st.z }, carry: { sack: null, sackLeft: 0, fruit: 0 }, coins: 0, customers: [] };
    const guide = refillGuideTarget(w, G);
    assert.ok(guide, `a dry ${type} produced no guidance at all`);
    assert.equal(guide.kind, 'supplies');
    assert.equal(guide.stationId, pantryId, `a dry ${type} pointed at ${guide.stationId}`);
  }
});

test('holding the supply switches the guidance to the machine that needs it', () => {
  const w = builtWorld();
  for (const [type, supply, field] of [['coffee', 'beans', 'beans'], ['bowl', 'kibble', 'stock']]) {
    drainAll(w);
    const st = byType(w, type);
    st[field] = 0;
    const G = { P: { x: st.x, z: st.z }, carry: { sack: supply, sackLeft: 10, fruit: 0 }, coins: 0, customers: [] };
    const guide = refillGuideTarget(w, G);
    assert.ok(guide, `holding ${supply} produced no guidance`);
    assert.equal(guide.kind, 'refill');
    assert.equal(guide.stationId, st.id, `holding ${supply} pointed at ${guide.stationId}, not the dry ${type}`);
  }
});

test('a carried supply is deliverable to its machine, and is never routed to the RETURN crate', () => {
  const w = builtWorld();
  drainAll(w);
  for (const [supply, type] of [['beans', 'coffee'], ['kibble', 'bowl']]) {
    const st = byType(w, type);
    st[{ coffee: 'beans', bowl: 'stock' }[type]] = 0;
    const held = { type: 'sack', key: supply, count: 10 };
    assert.equal(canDeliverTo(st, held), true, `a ${supply} sack cannot be delivered to the ${type}`);
    const dest = destinationFor(w, held, { x: st.x, z: st.z });
    assert.equal(dest && dest.type, type, `${supply} was routed to a ${dest && dest.type}`);
    assert.equal(heldLabel(held), supply, `a ${supply} sack is labelled "${heldLabel(held)}"`);
  }
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
