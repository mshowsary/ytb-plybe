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
