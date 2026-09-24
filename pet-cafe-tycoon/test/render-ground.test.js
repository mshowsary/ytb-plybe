// test/render-ground.test.js — Batch B3: the ground, the deck and the garden look finished.
//
// Ship plan §1.9 names the root causes, and each has a check here that fails if it comes back:
//   - the lawn is ONE plane (170 boxes 0-20 mm apart fought in the depth buffer as hatching);
//   - the café floor is flush (2 cm tile gaps made the outline pass crawl across the room);
//   - the deck is walked at y 0 like the café, with a threshold through the gate (feet sank 4.5 cm
//     into the planks and the gate had a trench with a lip);
//   - garden pieces are classified by footprint, not centre point (a bench and flower beds stayed
//     half on the deck after the build);
//   - the terrace goes in as a reveal during play and as a plain state on load, never a one-frame
//     swap mid-shift;
//   - the play yard survives the terrace; the string lights leave an opened gate; the awning stands
//     on no machine; the scene depth buffer is 24-bit.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildEnvironment, LAWN_Y, playYardRect, WINDOW_BOXES } from '../src/render/environment.js';
import { buildRegion, buildStatic, groundCutouts, terraceDoorOf } from '../src/render/props.js';
import { createAmbience } from '../src/render/ambience.js';
import { setRegionBuiltState } from '../src/render/regionState.js';
import { createCashTrays } from '../src/render/cashTrays.js';
import { createPostFX } from '../src/render/post.js';
import { part, mesh } from '../src/render/geo.js';
import { AREA1 } from '../data/area1.js';

const TERRACE = { id: 'terrace', x0: -10, x1: 10, z0: 7.4, z1: 14, gateX: 0, gateHalfW: 2.4 };
const AREA = () => ({ size: { w: 20, d: 14 }, door: { x: -9.6, z: 4.2 }, stations: [], regions: [{ ...TERRACE }] });
const alwaysVisible = g => g.children.filter(c => c !== g.garden && c !== g.deck && c.geometry);

function* verts(node) {
  const list = [];
  node.traverse(o => { if (o.geometry) list.push(o); });
  for (const o of list) {
    o.updateWorldMatrix(true, false);
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) yield new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
  }
}
// Up-facing triangles of one mesh, in world space, as [{ y, area, cx, cz }].
function upTriangles(o) {
  o.updateWorldMatrix(true, false);
  const geo = o.geometry, g = geo.index ? geo.toNonIndexed() : geo, p = g.getAttribute('position'), out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
    b.fromBufferAttribute(p, i + 1).applyMatrix4(o.matrixWorld);
    c.fromBufferAttribute(p, i + 2).applyMatrix4(o.matrixWorld);
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const area = n.length() / 2;
    if (area < 1e-9 || n.y / (2 * area) < 0.999) continue;
    if (Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.y - c.y) > 1e-6) continue;
    out.push({ y: a.y, area, cx: (a.x + b.x + c.x) / 3, cz: (a.z + b.z + c.z) / 3, xz: [[a.x, a.z], [b.x, b.z], [c.x, c.z]] });
  }
  return out;
}
const flush = () => new Promise(r => setTimeout(r, 0));
// Does triangle t (as upTriangles returns it) cover the point (x, z)?
function covers(t, x, z) {
  const [[ax, az], [bx, bz], [cx, cz]] = t.xz;
  const s = (px, pz, qx, qz, rx, rz) => (px - rx) * (qz - rz) - (qx - rx) * (pz - rz);
  const d1 = s(x, z, ax, az, bx, bz), d2 = s(x, z, bx, bz, cx, cz), d3 = s(x, z, cx, cz, ax, az);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// ---- the lawn ----------------------------------------------------------------------------------

test('the lawn is one plane: nothing else lies within 1 cm of it, and it costs less than the slabs did', () => {
  const g = buildEnvironment(AREA(), 'blossom');
  const solid = alwaysVisible(g).find(o => o.isMesh && o.material === alwaysVisible(g)[1].material) || alwaysVisible(g)[1];
  let lawn = 0, near = 0;
  for (const n of alwaysVisible(g)) {
    if (!n.isMesh) continue;
    for (const t of upTriangles(n)) {
      if (Math.abs(t.y - LAWN_Y) < 1e-6) lawn++;
      else if (Math.abs(t.y - LAWN_Y) < 0.01) near++;
    }
  }
  assert.ok(solid, 'environment has an always-visible lit mesh');
  assert.ok(lawn > 500, `expected the lawn plane in the always-visible ground, saw ${lawn} triangles`);
  assert.equal(near, 0, `${near} flat faces lie within 1 cm of the lawn — stacked ground fights in the depth buffer`);
  // 147 surviving 12-triangle slabs = 1,764 before.
  assert.ok(lawn < 1764, `the lawn plane is ${lawn} triangles, more than the 170 slabs it replaced`);
});

test('the lawn is never drawn under the paving', () => {
  const area = AREA(), g = buildEnvironment(area, 'splash');
  const cut = groundCutouts(area);
  const lawnCentres = [];
  for (const n of alwaysVisible(g)) if (n.isMesh) for (const t of upTriangles(n)) if (Math.abs(t.y - LAWN_Y) < 1e-6) lawnCentres.push(t);
  for (const r of [cut.plinth, cut.north, cut.west, cut.sidewalk]) {
    const under = lawnCentres.filter(t => t.cx > r.x0 + 1.6 && t.cx < r.x1 - 1.6 && t.cz > r.z0 + 1.6 && t.cz < r.z1 - 1.6).length;
    assert.equal(under, 0, `lawn triangles are drawn under the paving at ${JSON.stringify(r)}`);
  }
});

// ---- garden, deck and yard ---------------------------------------------------------------------

test('garden pieces go with the deck by FOOTPRINT: nothing always-visible stands on the built deck or its border', () => {
  const g = buildEnvironment(AREA(), 'harvest');
  g.setTerraceBuilt(true);
  // The deck and its stone border cover x -10.35..10.35, z 7.05..14.35; the border top is -0.085.
  // North of z 7.45 is the café fence's own dressing (window boxes, festoon), which stays; its
  // blooms lean out over the first boards (y 0.35 and up, within 0.8 m of the fence), which is fine.
  const offenders = [];
  for (const n of alwaysVisible(g)) {
    for (const v of verts(n)) {
      if (v.x > -10.35 && v.x < 10.35 && v.z > 7.45 && v.z < 14.35 && v.y > -0.085 && (v.y < 0.35 || v.z > 7.8)) offenders.push([v.x, v.y, v.z].map(k => +k.toFixed(2)));
      if (offenders.length > 3) break;
    }
  }
  assert.deepEqual(offenders, [], 'garden content left standing through the deck');
});

test('the deck is walked at y 0: plank tops are the floor, and a threshold runs through the gate', () => {
  const area = AREA(), deck = buildRegion(area, TERRACE, null);
  const ups = [];
  deck.traverse(o => { if (o.geometry) ups.push(...upTriangles(o)); });
  const floorTop = Math.max(...ups.filter(t => t.cz > 8 && t.cz < 13.5 && Math.abs(t.cx) < 9 && t.y < 0.05).map(t => t.y));
  assert.ok(Math.abs(floorTop) < 1e-6, `plank tops are at y ${floorTop}, not the café floor's 0`);
  // The threshold: floor at y 0 spanning the gate from the fence line (z 7.0) to the first plank.
  const gateFloor = ups.filter(t => Math.abs(t.y) < 1e-6 && Math.abs(t.cx) < 2.4 && t.cz > 7.0 && t.cz < 7.6);
  assert.ok(gateFloor.length > 0, 'nothing at floor height between the café tiles and the first plank');
  const lip = ups.filter(t => Math.abs(t.cx) < 2.4 && t.cz > 6.95 && t.cz < 7.6 && t.y > 0.001 && t.y < 0.15);
  assert.equal(lip.length, 0, 'a lip stands proud of the floor in the gate');
});

test('the terrace street entrance is an arch in the deck\'s west edge with a clear opening', () => {
  const area = { ...AREA(), terraceDoor: { x: -9.6, z: 12.6 } };
  assert.deepEqual(terraceDoorOf({ size: area.size }), { x: -9.6, z: 12.6 }, 'the plan\'s coordinates are the fallback');
  const deck = buildRegion(area, TERRACE, null);
  let posts = 0, inOpening = 0;
  for (const v of verts(deck)) {
    if (v.x > -10.6 && v.x < -9.9 && v.y > 0.2 && v.y < 1.6) {
      if (Math.abs(v.z - 12.6) < 0.95) inOpening++;
      if (Math.abs(Math.abs(v.z - 12.6) - 1.08) < 0.12) posts++;
    }
  }
  assert.ok(posts > 0, 'no arch posts at the terrace door');
  assert.equal(inOpening, 0, 'something stands in the terrace door opening');
});

test('the play yard is always-visible scenery: buying the terrace keeps the pond and the agility course', () => {
  const area = AREA(), yard = playYardRect(area);
  const g = buildEnvironment(area, 'blossom');
  const count = node => [...verts(node)].filter(v => v.x > yard.x0 && v.x < yard.x1 && v.z > yard.z0 && v.z < yard.z1 && v.y > -0.1).length;
  const before = alwaysVisible(g).reduce((n, m) => n + count(m), 0);
  assert.ok(before > 800, `expected the yard's pond, agility course, benches and picket, saw ${before} vertices`);
  assert.equal(count(g.garden), 0, 'nothing in the yard may belong to the garden the deck replaces');
  g.setTerraceBuilt(true);
  assert.equal(alwaysVisible(g).reduce((n, m) => n + count(m), 0), before);
});

test('the fence dressing leaves the gate lane and its arch posts clear', () => {
  const gapEdge = TERRACE.gateHalfW + 0.15 + 0.12;   // the arch post's outer face
  for (const b of WINDOW_BOXES) assert.ok(Math.abs(b.x) - (b.w + 0.08) / 2 > gapEdge, `window box at x ${b.x} reaches the gate`);
});

// ---- the reveal ----------------------------------------------------------------------------------

test('on load the terrace simply is there: no reveal, garden hidden, floor shown', () => {
  const g = buildEnvironment(AREA(), 'blossom');
  g.setTerraceBuilt(false);
  g.setTerraceBuilt(true);          // outside any game step: a load or a restore
  assert.equal(g.revealing('terrace'), false);
  assert.equal(g.garden.visible, false);
  assert.equal(g.deck.visible, true);
  assert.equal(g.deck.children.some(c => /^reveal:/.test(c.name)), false);
});

test('bought during play, the deck is laid row by row from the gate and the garden sinks away', async () => {
  const g = buildEnvironment(AREA(), 'blossom');
  g.setTerraceBuilt(false);         // the load-time sync
  await flush();
  g.updateFireflies(1 / 60);        // a game step...
  g.setTerraceBuilt(true);          // ...in which the 'built' event arrives
  assert.equal(g.revealing('terrace'), true, 'a purchase during play must be revealed');
  const temp = g.deck.children.find(c => /^reveal:/.test(c.name));
  assert.ok(temp, 'the reveal lays its own pieces');
  assert.equal(g.garden.visible, true, 'the garden is still there at the moment of purchase');
  const rows = temp.children.filter(m => m.geometry && m.position.z > 7.4);
  assert.ok(rows.length >= 10, `expected a mesh per plank row, saw ${rows.length}`);
  // Part way through: rows near the gate are down, rows at the far edge not yet shown.
  for (let i = 0; i < 24; i++) g.updateFireflies(1 / 60);   // 0.4 s
  const shown = rows.filter(m => m.visible).map(m => m.position.z);
  const hidden = rows.filter(m => !m.visible).map(m => m.position.z);
  assert.ok(shown.length > 0 && hidden.length > 0, 'part way through, some rows are down and some are not');
  assert.ok(Math.max(...shown) < Math.min(...hidden), 'rows are laid outward from the gate, never out of order');
  assert.ok(g.garden.scale.y < 1, 'the garden is sinking');
  for (let i = 0; i < 120; i++) g.updateFireflies(1 / 60);  // well past the end
  assert.equal(g.revealing('terrace'), false);
  assert.equal(g.garden.visible, false);
  assert.equal(g.deck.children.some(c => /^reveal:/.test(c.name)), false, 'the reveal cleans up after itself');
  const floor = g.deck.children.find(c => c.isGroup);
  assert.equal(floor.visible, true, 'the merged floor takes over once the rows are down');
});

test('under reduced motion a purchase during play is not animated', async () => {
  const had = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const g = buildEnvironment(AREA(), 'blossom');
    g.setTerraceBuilt(false);
    await flush();
    g.updateFireflies(1 / 60);
    g.setTerraceBuilt(true);
    assert.equal(g.revealing('terrace'), false);
    assert.equal(g.garden.visible, false);
  } finally {
    if (had) globalThis.matchMedia = had; else delete globalThis.matchMedia;
  }
});

// ---- string lights, the static café, cost -------------------------------------------------------

test('the fence string lights leave an opened gate and come back if it closes', () => {
  const area = AREA();
  const amb = createAmbience(area);
  const lights = amb.group.children.find(o => o.isInstancedMesh && o.count > 20);
  // Read the instance matrices raw: a hidden bulb is a zero-scale matrix, which decompose() reports
  // as unit scale.
  const inGap = () => {
    const m = new THREE.Matrix4();
    let shown = 0;
    for (let i = 0; i < lights.count; i++) {
      lights.getMatrixAt(i, m);
      const e = m.elements;
      if (Math.abs(e[14] - 6.92) < 0.05 && Math.abs(e[12]) < 2.4 && Math.hypot(e[0], e[1], e[2]) > 0.5) shown++;
    }
    return shown;
  };
  assert.ok(inGap() > 0, 'a closed gate is just fence, and keeps its bulbs');
  setRegionBuiltState(area, 'terrace', true);
  amb.update(0);
  assert.equal(inGap(), 0, 'bulbs hang in mid-air over the open gate');
  setRegionBuiltState(area, 'terrace', false);
  amb.update(0);
  assert.ok(inGap() > 0);
});

test('buildStatic: the floor is flush, the sidewalk is at floor height, and the awning stands on no machine', () => {
  const g = buildStatic(AREA1);
  const floor = [];
  g.traverse(o => { if (o.isMesh && o.geometry) for (const t of upTriangles(o)) floor.push(t); });
  const tiles = floor.filter(t => Math.abs(t.y) < 1e-6 && Math.abs(t.cx) < 10 && Math.abs(t.cz) < 7);
  const area = tiles.reduce((s, t) => s + t.area, 0);
  assert.ok(Math.abs(area - 280) < 0.01, `the tile floor covers ${area.toFixed(2)} m², not the room's 280 with no gaps`);
  // Guests spawn at the street (AREA1.spawnStart) and walk at y 0: there must be pavement there.
  const at = (x, z) => floor.some(t => Math.abs(t.y) < 1e-6 && covers(t, x, z));
  assert.ok(at(AREA1.spawnStart.x, AREA1.spawnStart.z), 'no sidewalk at floor height where guests spawn');
  assert.ok(at(-11.2, 12.6), 'no sidewalk at floor height along the terrace');
  // Nothing of the static café stands inside a production-row machine below the awning.
  for (const v of verts(g)) {
    if (v.y < 0.15 || v.y > 2.3) continue;
    for (const st of AREA1.stations.filter(s => s.z < -4)) {
      assert.ok(!(Math.abs(v.x - st.x) < st.fw / 2 - 0.05 && Math.abs(v.z - st.z) < st.fd / 2 - 0.05),
        `static geometry stands inside ${st.id} at (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
    }
  }
});

test('a cash tray is two draws, and neither casts a sun shadow; small props cast none either', () => {
  const scene = new THREE.Scene();
  const world = { stations: new Map([['r', { type: 'checkout', active: true, rot: 0, cash: { x: 0, z: 0 }, pile: 0 }]]) };
  createCashTrays(world, scene);
  const tray = scene.children.find(o => o.name === 'cashTray');
  const meshes = [];
  tray.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 2);
  assert.equal(meshes.some(m => m.castShadow), false);
  assert.equal(mesh([part('box', [0.5, 0.3, 0.3], '#ffffff')]).castShadow, false, 'a 0.5 m prop still casts');
  assert.equal(mesh([part('box', [1.4, 0.8, 1.4], '#ffffff')]).castShadow, true, 'furniture keeps its shadow');
});

test('the scene depth buffer is 24-bit, and the outline pass reads the live near plane', () => {
  const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true } };
  const camera = new THREE.PerspectiveCamera(40, 1, 2.5, 200);
  const post = createPostFX(renderer, new THREE.Scene(), camera);
  assert.equal(post.uniforms.tDepth.value.type, THREE.UnsignedIntType);
  assert.equal(post.uniforms.cameraNear.value, 2.5);
});
