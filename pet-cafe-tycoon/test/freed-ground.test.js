// test/freed-ground.test.js — the two tiles Batch C emptied are dressed, and cost nothing to draw.
//
// Batch C deleted the upgrade kiosk (it stood at 9.0, -3.5, and its 1.35 m button radius overlapped
// oven1's standing spot) and the RETURN crate (at -3.8, -5.2; hands auto-return now). Both sat in
// the middle of the room and both left a rectangle of blank tile, which in a café whose whole job is
// to look finished reads as "something used to be here".
//
// render/props.js dresses both inside buildStatic's own merged geometry. Three things have to stay
// true, and each of them is a thing a later change could quietly undo:
//
//   1. THE TILES ARE ACTUALLY DRESSED. Geometry a person could see, at each of the two spots.
//   2. IT COSTS NO DRAW CALL. The dressing is in the SAME merged mesh as the café's walls. A
//      revision that returned a Group instead would put two more draw calls into a frame that is
//      already measured against a 200-call budget in each pass.
//   3. IT IS NOT IN ANYONE'S WAY. Nothing of it stands inside a station, on a front, in a queue
//      slot, in the doorway — the checks tools/prop-overlap-smoke.js runs on the real scene graph —
//      nor inside the two resident homes near it, which that smoke only checks against décor.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { buildStatic } from '../src/render/props.js';

const BODY_LO = 0.15, BODY_HI = 1.6, EDGE = 0.06, SPOT_R = 0.3;
// The two tiles, and the two things near them that the browser smoke does not measure: the
// windowsill cushion and the cat tree (systems/residentPets.js RESIDENT_SPOTS).
const KIOSK_TILE = { x: 9.0, z: -3.5 };
const RETURN_TILE = { x: -3.8, z: -5.2 };
const RESIDENT_HOMES = [
  { id: 'windowCushion@(-5.0,-6.5)', x0: -5.9, x1: -4.1, z0: -6.95, z1: -6.05 },
  { id: 'catTree@(9.15,-4.85)', x0: 8.75, x1: 9.55, z0: -5.45, z1: -4.28 },
];

function builtWorld() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}
function meshesOf(group) {
  const out = [];
  group.traverse(o => { if (o.isMesh && o.geometry) out.push(o); });
  return out;
}
function worldVerts(o) {
  o.updateWorldMatrix(true, false);
  const p = o.geometry.getAttribute('position'), out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  return out;
}
function insideStation(st, x, z) {
  const dx = x - st.x, dz = z - st.z, c = Math.cos(st.rot || 0), s = Math.sin(st.rot || 0);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < st.fw / 2 - EDGE && Math.abs(lz) < st.fd / 2 - EDGE;
}

test('both freed tiles carry something a person can see', () => {
  const all = meshesOf(buildStatic(AREA1)).flatMap(worldVerts);
  for (const [name, tile] of [['the upgrade kiosk\'s tile', KIOSK_TILE], ['the RETURN crate\'s slot', RETURN_TILE]]) {
    const near = all.filter(v => v.y > 0.2 && v.y < 2.0 && Math.hypot(v.x - tile.x, v.z - tile.z) < 1.3);
    assert.ok(near.length > 40, `${name} at (${tile.x}, ${tile.z}) is still bare floor (${near.length} vertices near it)`);
    const top = near.reduce((m, v) => Math.max(m, v.y), 0);
    assert.ok(top > 0.55, `${name} has only ${top.toFixed(2)} m of dressing: it reads as litter, not a fixture`);
  }
});

test('the dressing rides the café\'s own merged mesh, so it costs no draw call', () => {
  const g = buildStatic(AREA1);
  // The one big merged scenery mesh — the walls, the floor, the fence, the plants — is by a wide
  // margin the largest. Everything the two freed tiles gained has to be in it too.
  const meshes = meshesOf(g);
  const main = meshes.reduce((a, b) => (worldVerts(a).length >= worldVerts(b).length ? a : b));
  const mainVerts = worldVerts(main);
  assert.ok(mainVerts.length > 2000, `the merged scenery mesh is only ${mainVerts.length} vertices`);
  // The rest of the group is the gate infill, the two awning stripe parities and the awning arms:
  // four small meshes that each exist for a reason (they retint or hide independently).
  assert.ok(meshes.length <= 5, `buildStatic draws ${meshes.length} meshes; the dressing must not add one`);
  for (const [name, tile] of [['kiosk tile', KIOSK_TILE], ['return slot', RETURN_TILE]]) {
    const near = mainVerts.filter(v => v.y > 0.2 && v.y < 2.0 && Math.hypot(v.x - tile.x, v.z - tile.z) < 1.3);
    assert.ok(near.length > 40, `the ${name}'s dressing is not in the merged mesh — it is costing its own draw call`);
  }
});

test('nothing on either tile stands inside a station, on a working spot, in the doorway or in a resident home', () => {
  const w = builtWorld();
  const stations = [...w.stations.values()].filter(st => st.active && st.fw && st.fd && st.type !== 'gate');
  const spots = [];
  for (const st of stations) {
    if (st.front) spots.push({ id: st.id + '.front', x: st.front.x, z: st.front.z });
    (st.queue || []).forEach((q, i) => spots.push({ id: `${st.id}.q${i}`, x: q.x, z: q.z }));
  }
  const W = AREA1.size.w;
  const door = { x0: -W / 2 - 1, x1: -W / 2 + 1, z0: AREA1.door.z - 1.2, z1: AREA1.door.z + 1.2 };
  let checked = 0;
  for (const m of meshesOf(buildStatic(AREA1))) {
    for (const v of worldVerts(m)) {
      if (v.y < BODY_LO || v.y > BODY_HI) continue;
      // Only the two tiles this batch dressed; the rest of buildStatic is Batch B3's and has its
      // own check in test/render-ground.test.js.
      if (Math.hypot(v.x - KIOSK_TILE.x, v.z - KIOSK_TILE.z) > 1.6
        && Math.hypot(v.x - RETURN_TILE.x, v.z - RETURN_TILE.z) > 1.6) continue;
      checked++;
      const at = `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
      for (const st of stations) assert.ok(!insideStation(st, v.x, v.z), `dressing stands inside ${st.id} at ${at}`);
      for (const sp of spots) {
        assert.ok(Math.hypot(v.x - sp.x, v.z - sp.z) >= SPOT_R, `dressing stands on ${sp.id} at ${at}`);
      }
      assert.ok(!(v.x > door.x0 && v.x < door.x1 && v.z > door.z0 && v.z < door.z1), `dressing stands in the doorway at ${at}`);
      for (const h of RESIDENT_HOMES) {
        assert.ok(!(v.x > h.x0 && v.x < h.x1 && v.z > h.z0 && v.z < h.z1), `dressing stands inside ${h.id} at ${at}`);
      }
    }
  }
  assert.ok(checked > 60, `only ${checked} vertices of dressing reach body height across both tiles`);
});
