// test/treat-bar-bin.test.js — the treat bar's kibble bin exists in the world, not just in a comment.
//
// sim/supplies.js has said since Batch C that "the treat bowl keeps its own kibble bin, so standing
// at the bowl refills it and nobody walks a sack across the café" (REFILLED_IN_PLACE), and
// systems/stations.js tells the player the bin is "under it". Nothing drew one: the 900-coin Pet
// treat bar was a 0.35 m pink ring lying on bare tile, so the one station in the game that restocks
// itself looked exactly like one that cannot. That is the same defect as correct code nothing calls,
// pointed the other way — a rule with no object.
//
// This pins both halves: the rule is still the rule, and the mesh is now the object. It also pins
// the constraint the dressing had to respect, because the treat bar's footprint is the smallest in
// the café and growing the drawn box is how a station starts blocking ground it never blocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { refilledInPlace, supplyKind } from '../src/sim/supplies.js';
import { bowlMesh } from '../src/render/props.js';
import { ownerBodyBoxes } from '../src/sim/ownerReach.js';

function builtWorld() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}
function bowlGeometry() {
  const g = bowlMesh(), geos = [];
  g.traverse(o => { if (o.isMesh && o.geometry) geos.push(o.geometry); });
  assert.equal(geos.length, 1, `the treat bar is ${geos.length} meshes: it must stay one draw call`);
  return geos[0];
}

test('the rule the bin exists for is still the rule', () => {
  const w = builtWorld();
  const bowl = w.stations.get('bowl1');
  assert.ok(bowl, 'bowl1 is gone from the area');
  assert.equal(supplyKind(bowl), 'kibble', 'the treat bowl no longer drinks kibble');
  assert.equal(refilledInPlace(bowl), true, 'the treat bowl no longer refills from its own bin');
});

test('and the bin is drawn: the treat bar is a feeding station, not a ring on the floor', () => {
  const geo = bowlGeometry();
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.ok(b.max.y > 0.40, `the treat bar tops out at ${b.max.y.toFixed(2)} m: there is no bin on it`);
  assert.ok(b.max.x - b.min.x > 0.6, `the treat bar is ${(b.max.x - b.min.x).toFixed(2)} m wide: still just a bowl`);
});

test('and it claims no ground the 0.8 m footprint did not already claim', () => {
  const def = AREA1.stations.find(s => s.id === 'bowl1');
  const geo = bowlGeometry();
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.ok(b.min.x >= -def.fw / 2 && b.max.x <= def.fw / 2,
    `the drawn treat bar reaches x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} outside its ${def.fw} m footprint`);
  assert.ok(b.min.z >= -def.fd / 2 && b.max.z <= def.fd / 2,
    `the drawn treat bar reaches z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)} outside its ${def.fd} m footprint`);

  // And the box the owner's body is held out of is unchanged: ownerReach unions the footprint with
  // the DRAWN box, so a bin taller than the old bowl must not widen it.
  const w = builtWorld();
  const st = w.stations.get('bowl1');
  const body = geo.userData.bodyBox;
  assert.ok(body, 'the stand no longer reports a drawn box at all');
  st.body = { minx: st.x + body.minx, maxx: st.x + body.maxx, minz: st.z + body.minz, maxz: st.z + body.maxz };
  const box = ownerBodyBoxes(w).find(bx => Math.abs(bx.x - st.x) < 0.5 && Math.abs(bx.z - st.z) < 0.5);
  assert.ok(box, 'bowl1 has no collision box at all');
  assert.ok(Math.abs(box.hw - def.fw / 2) < 1e-6 && Math.abs(box.hd - def.fd / 2) < 1e-6,
    `the treat bar now blocks ${(box.hw * 2).toFixed(2)} x ${(box.hd * 2).toFixed(2)} m instead of ${def.fw} x ${def.fd}`);
});
