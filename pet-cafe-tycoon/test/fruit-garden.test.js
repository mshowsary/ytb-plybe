// test/fruit-garden.test.js — z_garden buys a garden, not two more spheres in a corner.
//
// Ship plan §1.4: "z_garden becomes a visible 'Fruit garden' patch (soil, picket, the two bushes)".
// Before this batch the 1400-coin purchase added bush2 and bush3 to bare tile, and the corner Batch C
// built (the blender beside the bushes beside the smoothie counter) read as three unrelated objects
// standing on a floor.
//
// render/props.js fruitGardenMesh() is the bed. Its numbers are AUTHORED, because a bed has to be a
// deliberate shape, so this file is what keeps them honest against the data file that owns where the
// bushes actually are (data/area1.js, another lane's): the bed must cover every bush, nothing
// standing in it may reach into a station, a station's front or a queue slot, and every bush must
// still be worked from outside the picket. If a bush moves, this fails rather than leaving a bed in
// the wrong corner.
//
// The clearances below are exactly the ones tools/prop-overlap-smoke.js measures in a real browser
// on the real scene graph (body band 0.15-1.6 m, 0.06 m of footprint grace, 0.3 m around a spot) —
// checked here too because a unit test names the offending vertex in a second.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { fruitGardenMesh, GARDEN_BED_RECTS, GARDEN_PICKET_RUNS, GARDEN_PROPS } from '../src/render/props.js';

const BODY_LO = 0.15, BODY_HI = 1.6, EDGE = 0.06, SPOT_R = 0.3;
const BUSHES = ['bush1', 'bush2', 'bush3'];

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
function* worldVerts(group) {
  group.updateMatrixWorld(true);
  for (const o of meshesOf(group)) {
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) yield new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
  }
}
const onBed = (x, z, pad = 0) => GARDEN_BED_RECTS.some(([x0, x1, z0, z1]) =>
  x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad);
// A station's footprint, turned by its own yaw, eroded by EDGE — prop-overlap-smoke.js's inside().
function insideStation(st, x, z) {
  const dx = x - st.x, dz = z - st.z, c = Math.cos(st.rot || 0), s = Math.sin(st.rot || 0);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < st.fw / 2 - EDGE && Math.abs(lz) < st.fd / 2 - EDGE;
}

test('the bed covers every bush the corner has, with soil to spare', () => {
  const w = builtWorld();
  for (const id of BUSHES) {
    const st = w.stations.get(id);
    assert.ok(st, `${id} is gone from the area: the garden dresses stations that no longer exist`);
    for (const cx of [st.x - st.fw / 2, st.x + st.fw / 2]) {
      for (const cz of [st.z - st.fd / 2, st.z + st.fd / 2]) {
        assert.ok(onBed(cx, cz), `${id}'s footprint corner (${cx.toFixed(2)}, ${cz.toFixed(2)}) is off the soil`);
      }
    }
  }
});

test('every bush is still picked from OUTSIDE the bed, so the picket is never in the owner\'s way', () => {
  const w = builtWorld();
  for (const id of BUSHES) {
    const f = w.stations.get(id).front;
    assert.ok(!onBed(f.x, f.z), `${id}'s working spot (${f.x.toFixed(2)}, ${f.z.toFixed(2)}) is inside the bed`);
  }
});

test('nothing the garden stands in the body band is inside a station, a front or a queue slot', () => {
  const w = builtWorld();
  const stations = [...w.stations.values()].filter(st => st.active && st.fw && st.fd && st.type !== 'gate');
  const spots = [];
  for (const st of stations) {
    if (st.front) spots.push({ id: st.id + '.front', x: st.front.x, z: st.front.z });
    (st.queue || []).forEach((q, i) => spots.push({ id: `${st.id}.q${i}`, x: q.x, z: q.z }));
  }
  assert.ok(spots.length > 20, 'the built world produced no fronts or queue slots to check against');
  let checked = 0;
  for (const v of worldVerts(fruitGardenMesh())) {
    if (v.y < BODY_LO || v.y > BODY_HI) continue;
    checked++;
    const at = `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
    for (const st of stations) {
      assert.ok(!insideStation(st, v.x, v.z), `garden geometry stands inside ${st.id} at ${at}`);
    }
    for (const sp of spots) {
      assert.ok(Math.hypot(v.x - sp.x, v.z - sp.z) >= SPOT_R, `garden geometry stands on ${sp.id} at ${at}`);
    }
  }
  assert.ok(checked > 200, `only ${checked} vertices reach body height: the picket has gone flat`);
});

test('only the picket, the can and the crate reach body height — soil and ground cover never do', () => {
  // The bed's floor dressing (soil, kerb, clover, windfall, the turned patches) must stay below
  // 0.15 m, the height at which tools/prop-overlap-smoke.js starts treating geometry as an
  // obstacle. Anything that rises above it has to be one of the three things that is meant to.
  const near = (v, x, z, r) => Math.hypot(v.x - x, v.z - z) <= r;
  const onRun = v => GARDEN_PICKET_RUNS.some(([x0, z0, x1, z1]) => {
    const dx = x1 - x0, dz = z1 - z0, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((v.x - x0) * dx + (v.z - z0) * dz) / len2));
    return Math.hypot(v.x - (x0 + dx * t), v.z - (z0 + dz * t)) <= 0.12;
  });
  let picket = 0, props = 0;
  for (const v of worldVerts(fruitGardenMesh())) {
    if (v.y < BODY_LO) continue;
    if (onRun(v)) { picket++; continue; }
    if (near(v, GARDEN_PROPS.can.x, GARDEN_PROPS.can.z, 0.45) || near(v, GARDEN_PROPS.crate.x, GARDEN_PROPS.crate.z, 0.55)) { props++; continue; }
    assert.fail(`ground cover reaches body height at (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
  }
  assert.ok(picket > 150, `the picket contributes only ${picket} body-band vertices: it has gone flat`);
  assert.ok(props > 50, `the can and the crate contribute only ${props} body-band vertices`);
});

test('the watering can and the crate stand on soil, and the picket runs along the bed\'s own edge', () => {
  assert.ok(onBed(GARDEN_PROPS.can.x, GARDEN_PROPS.can.z), 'the watering can is standing on tile');
  assert.ok(onBed(GARDEN_PROPS.crate.x, GARDEN_PROPS.crate.z), 'the fruit crate is standing on tile');
  for (const [x0, z0, x1, z1] of GARDEN_PICKET_RUNS) {
    for (const [x, z] of [[x0, z0], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
      assert.ok(onBed(x, z, 0.001), `a picket run passes through (${x}, ${z}), which is not the bed's edge`);
    }
  }
});

test('the whole garden is one draw call, casts no sun shadow, and starts hidden', () => {
  const g = fruitGardenMesh();
  const meshes = meshesOf(g);
  assert.equal(meshes.length, 1, `the garden is ${meshes.length} meshes: one per draw call, and the frame has 26 to spare`);
  assert.equal(meshes[0].castShadow, false, 'the garden casts a sun shadow — a second whole pass for a picket');
  assert.equal(g.visible, false, 'the bed is visible before z_garden is bought');
  assert.equal(g.name, 'gardenPatch', 'tools/prop-overlap-smoke.js and the batch smoke find it by name');
});
