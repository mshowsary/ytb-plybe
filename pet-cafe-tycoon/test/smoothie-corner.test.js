// test/smoothie-corner.test.js — the smoothie lane is one corner, not one errand across the café.
//
// Measured before (19-day playthrough, 2026-09-19): blender1 stood in the production row at
// (-5.5, -5.2) while bush1 grew at (8.6, 3.6) and barSmoothie stood at (8.6, -2.0). Bush front ->
// blender front was 15.4 m and blender -> counter 14.4 m, so harvest+blend swallowed 100-130 s of
// a 240 s day, nearly all of it walking. docs/SHIP-PLAN-2026-09-19.md §1.4 asks for a triangle of
// short hops instead, with z_garden's two extra bushes kept in the same corner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';

function builtWorld() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}
const hop = (a, b) => Math.hypot(a.front.x - b.front.x, a.front.z - b.front.z);

test('bush -> blender -> counter is a short triangle: no hop over 3 m', () => {
  const w = builtWorld();
  const blender = w.stations.get('blender1');
  const bush1 = w.stations.get('bush1');
  const bar = w.stations.get('barSmoothie');
  const toBush = hop(blender, bush1), toBar = hop(blender, bar);
  assert.ok(toBush <= 3.0, `bush1 -> blender is ${toBush.toFixed(2)} m`);
  assert.ok(toBar <= 3.0, `blender -> barSmoothie is ${toBar.toFixed(2)} m`);
  // And not so short that the two working spots are the same spot: harvesting and blending must
  // still be two stops, or the "no pickup in the stop that delivered an input" rule would mean
  // standing in one place doing nothing.
  assert.ok(toBush >= 0.8, `bush1 and the blender share a standing spot (${toBush.toFixed(2)} m)`);
});

test('z_garden\'s two extra bushes stay in the same corner as the blender', () => {
  const w = builtWorld();
  const blender = w.stations.get('blender1');
  for (const id of ['bush2', 'bush3']) {
    const d = hop(blender, w.stations.get(id));
    assert.ok(d <= 3.6, `${id} -> blender is ${d.toFixed(2)} m: the garden was left behind`);
  }
});

// The blender sat on nothing before it moved; it must not sit on a queue now. barSmoothie's guests
// line up along x 8.6 from z -0.6 to 2.8, which is why the blender is at x 7.8 and not in line with
// the counter and the bushes.
test('the blender stands clear of every queue line and every guest spot', () => {
  const w = builtWorld();
  const bl = AREA1.stations.find(s => s.id === 'blender1');
  let fw = bl.fw, fd = bl.fd;
  if (Math.abs(Math.sin(bl.rot || 0)) > 0.5) [fw, fd] = [fd, fw];
  const box = { x0: bl.x - fw / 2, x1: bl.x + fw / 2, z0: bl.z - fd / 2, z1: bl.z + fd / 2 };
  for (const st of w.stations.values()) {
    for (const [i, q] of (st.queue || []).entries()) {
      assert.ok(!(q.x > box.x0 && q.x < box.x1 && q.z > box.z0 && q.z < box.z1),
        `${st.id} queue slot ${i} at (${q.x.toFixed(2)}, ${q.z.toFixed(2)}) is inside the blender`);
    }
    if (st.pair) for (const [name, p] of [['human', st.pair.human], ['pet', st.pair.pet]]) {
      assert.ok(!(p.x > box.x0 && p.x < box.x1 && p.z > box.z0 && p.z < box.z1),
        `${st.id} ${name} spot is inside the blender`);
    }
  }
});

test('the Smoothie bar plot stands in the corner it builds', () => {
  const zone = AREA1.zones.find(z => z.id === 'z_blender');
  const w = builtWorld();
  for (const id of ['blender1', 'barSmoothie', 'bush1']) {
    const st = w.stations.get(id);
    const d = Math.hypot(zone.x - st.x, zone.z - st.z);
    assert.ok(d <= 4.5, `z_blender's pad is ${d.toFixed(2)} m from ${id}, the thing it builds`);
  }
});

// ── Batch G2: the machine that stands in that corner ────────────────────────────────────────────
// Moving the blender was Batch C's job and the four tests above pin it. What arrived at (7.8, 0.1)
// was a 0.5 m wooden cube with a 0.24 m cyan jug on it, which from the play camera read as "a small
// pale-blue cylinder standing on bare floor" (shots-production/batch-c/smoothie-corner-1280x720.png)
// — no base, no top, no colour, nothing saying what it makes or what it takes. These two pin the
// dressing that fixed that, and the one constraint the dressing had to respect.
import * as THREE from 'three';
import { blenderMesh } from '../src/render/props.js';
import { PRODUCTS } from '../src/sim/economy.js';

function blenderGeometry() {
  const g = blenderMesh(), geos = [];
  g.traverse(o => { if (o.isMesh && o.geometry) geos.push(o.geometry); });
  assert.equal(geos.length, 1, `the blender is ${geos.length} meshes: it must stay one draw call`);
  return geos[0];
}

test('the blender is dressed like a station: a body, a top, its own colour and its fruit', () => {
  const geo = blenderGeometry();
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.ok(b.max.x - b.min.x >= 0.9, `the blender is only ${(b.max.x - b.min.x).toFixed(2)} m wide: still a cube on the floor`);
  assert.ok(b.max.y >= 1.2, `the blender tops out at ${b.max.y.toFixed(2)} m: there is nothing on the counter`);
  // The smoothie's own colour, so the machine and the cups piled on barSmoothie read as one bar.
  const want = new THREE.Color(PRODUCTS.smoothie.color);
  const c = geo.getAttribute('color');
  let juice = 0;
  for (let i = 0; i < c.count; i++) {
    if (Math.abs(c.getX(i) - want.r) < 0.01 && Math.abs(c.getY(i) - want.g) < 0.01 && Math.abs(c.getZ(i) - want.b) < 0.01) juice++;
  }
  assert.ok(juice > 20, `only ${juice} vertices carry the smoothie colour: the corner has no palette`);
});

test('the dressed blender still fits inside its own footprint, so the queue keeps its lane', () => {
  // data/area1.js: x 7.8 (not 8.6) so the machine's east face stays clear of barSmoothie's queue
  // line at x 8.6. sim/collide.js measures the authored fw/fd and sim/ownerReach.js unions it with
  // the drawn box, so as long as the drawing is INSIDE the footprint neither can change.
  const def = AREA1.stations.find(s => s.id === 'blender1');
  const body = blenderGeometry().userData.bodyBox;
  assert.ok(body, 'the blender no longer reports a body box to sim/ownerReach.js');
  assert.ok(body.minx >= -def.fw / 2 && body.maxx <= def.fw / 2,
    `the drawn blender reaches x ${body.minx.toFixed(2)}..${body.maxx.toFixed(2)} outside its ${def.fw} m footprint`);
  assert.ok(body.minz >= -def.fd / 2 && body.maxz <= def.fd / 2,
    `the drawn blender reaches z ${body.minz.toFixed(2)}..${body.maxz.toFixed(2)} outside its ${def.fd} m footprint`);
  const queueX = 8.6;
  assert.ok(def.x + body.maxx <= queueX - 0.2,
    `the blender's east face at ${(def.x + body.maxx).toFixed(2)} leaves under 0.2 m to the queue at x ${queueX}`);
});
