// test/station-star-looks.test.js — a starred machine looks starred.
//
// Ship plan §1.6c item 3: "Station stars become visible. The upgrade ladders are the endless coin
// sink and today they are invisible +%: a starred machine must look better than an unstarred one (a
// copper coffee machine, a bigger oven, a second case on the counter)." The economy-ads report
// measured 129k coins going into those ladders across a playthrough with nothing to show for it.
//
// Four properties have to hold, and each is a thing a later change could quietly undo:
//
//   1. EVERY LADDER THE GAME SELLS HAS A LOOK. economy.js STAR_IDS is the list; a station type that
//      falls off the dressing goes back to being an invisible +%.
//   2. IT COSTS NO DRAW CALL. stationStarParts() returns GEOMETRY and systems/visuals.js merges it
//      into the station's own mesh, exactly as the sign is merged. A revision that returned a Mesh
//      would put eight draw calls into a frame measured against 200.
//   3. IT CHANGES NOTHING THE SIMULATION CAN FEEL. The body box handed to sim/ownerReach.js is
//      carried over unchanged, and no star part reaches further across the floor than the machine
//      already did — buying a star must never move where a body can stand.
//   4. THE CALL PATH EXISTS. A tier the render layer reads but nothing ever writes is this
//      program's recurring defect, so the path Shop -> economy.buyStar -> G.stars -> starTierOf is
//      pinned here as well as driven live by tools/batch-g2-smoke.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { STAR_IDS, buyStar, nextStarCost } from '../src/sim/economy.js';
import { stationStarParts, STAR_VISIBLE_TIERS, ovenMesh, counterMesh, coffeeMesh, blenderMesh } from '../src/render/props.js';
import { applyStarLook, starTierOf } from '../src/systems/visuals.js';

const SHOP_SRC = fs.readFileSync(new URL('../src/ui/shop.js', import.meta.url), 'utf8');
const MESH_FOR = { oven: ovenMesh, display: counterMesh, coffee: coffeeMesh, blender: blenderMesh };

function builtWorld() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}
function xzExtent(geoms) {
  const b = { minx: Infinity, maxx: -Infinity, minz: Infinity, maxz: -Infinity, maxy: -Infinity };
  for (const g of geoms) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      b.minx = Math.min(b.minx, p.getX(i)); b.maxx = Math.max(b.maxx, p.getX(i));
      b.minz = Math.min(b.minz, p.getZ(i)); b.maxz = Math.max(b.maxz, p.getZ(i));
      b.maxy = Math.max(b.maxy, p.getY(i));
    }
  }
  return b;
}
const verts = g => g.getAttribute('position').count;
// A merged geometry's vertex colours, as a set of "r,g,b" strings rounded to a byte.
function colours(geoms) {
  const out = new Set();
  for (const g of geoms) {
    const c = g.getAttribute('color');
    for (let i = 0; i < c.count; i++) {
      out.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => Math.round(v * 255)).join(','));
    }
  }
  return out;
}
const hex = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b].map(v => Math.round(v * 255)).join(','); };

test('every ladder the Shop sells has a look, and ★1 has none', () => {
  const w = builtWorld();
  assert.ok(STAR_IDS.length >= 8, `STAR_IDS is down to ${STAR_IDS.length} entries`);
  for (const id of STAR_IDS) {
    const st = w.stations.get(id);
    assert.ok(st, `${id} is sold as a star ladder but is not a station`);
    assert.equal(stationStarParts(st, 1), null, `${id} is dressed at ★1: an unstarred machine must look unstarred`);
    for (let t = 2; t <= STAR_VISIBLE_TIERS; t++) {
      const parts = stationStarParts(st, t);
      assert.ok(parts && parts.length, `${id} (${st.type}) gets nothing at ★${t} — the ladder is still invisible`);
    }
  }
});

test('each tier adds to the last, and ★4 turns the trim from copper to gold', () => {
  const st = { type: 'coffee' };
  const n2 = verts(mergeAll(stationStarParts(st, 2))), n3 = verts(mergeAll(stationStarParts(st, 3)));
  const n4 = verts(mergeAll(stationStarParts(st, 4)));
  assert.ok(n3 > n2, `★3 (${n3} vertices) adds nothing to ★2 (${n2})`);
  assert.ok(n4 > n3, `★4 (${n4} vertices) adds nothing to ★3 (${n3})`);
  const c2 = colours(stationStarParts(st, 2)), c4 = colours(stationStarParts(st, 4));
  assert.ok(c2.has(hex('#C9793E')), '★2 does not wear the copper band');
  assert.ok(!c4.has(hex('#C9793E')), '★4 still wears copper: the gold upgrade never happened');
  assert.ok(c4.has(hex('#FFD84D')), '★4 does not wear gold');
  // The ladder never ends (economy.js nextStarCost), but the LOOK tops out, or a ★9 machine would
  // grow into the one behind it.
  assert.equal(verts(mergeAll(stationStarParts(st, 9))), n4, 'the look keeps growing past its cap');
});

test('a star never claims ground the machine did not already occupy', () => {
  // The bound is the union of the two things that already describe where a station is: the
  // footprint data/area1.js authors (what sim/collide.js and sim/nav.js measure) and the silhouette
  // the mesh already draws (the oven's output tray, for instance, reaches past its own footprint,
  // and its second tray is allowed to sit under the first). A star part outside BOTH would be new
  // ground — something the player could suddenly walk into, or a machine leaning into its neighbour.
  const w = builtWorld();
  const pad = 0.05;   // a trim band stands a little proud of the body it wraps
  for (const id of STAR_IDS) {
    const st = w.stations.get(id);
    const base = MESH_FOR[st.type](st);
    const baseGeo = [];
    base.traverse(o => { if (o.isMesh && o.geometry) baseGeo.push(o.geometry); });
    const b = xzExtent(baseGeo);
    const bound = {
      minx: Math.min(b.minx, -st.fw / 2) - pad, maxx: Math.max(b.maxx, st.fw / 2) + pad,
      minz: Math.min(b.minz, -st.fd / 2) - pad, maxz: Math.max(b.maxz, st.fd / 2) + pad,
    };
    const s = xzExtent(stationStarParts(st, STAR_VISIBLE_TIERS));
    assert.ok(s.minx >= bound.minx && s.maxx <= bound.maxx,
      `${id}'s star dressing reaches x ${s.minx.toFixed(2)}..${s.maxx.toFixed(2)}, past ${bound.minx.toFixed(2)}..${bound.maxx.toFixed(2)}`);
    assert.ok(s.minz >= bound.minz && s.maxz <= bound.maxz,
      `${id}'s star dressing reaches z ${s.minz.toFixed(2)}..${s.maxz.toFixed(2)}, past ${bound.minz.toFixed(2)}..${bound.maxz.toFixed(2)}`);
    // And it never grows so tall it hides the station behind it: the tallest thing in the room is
    // the garden stand's canopy at 2.44 m.
    assert.ok(s.maxy < 2.3, `${id} reaches ${s.maxy.toFixed(2)} m at ★${STAR_VISIBLE_TIERS}`);
  }
});

test('applying a tier grows the mesh, keeps ONE mesh, and leaves the body box alone', () => {
  const w = builtWorld();
  const st = w.stations.get('coffee1');
  const group = coffeeMesh(st);
  const base = group.children.find(o => o.isMesh);
  const v = { base, baseGeo: base.geometry, starTier: 1 };
  const before = verts(base.geometry);
  const body = { ...base.geometry.userData.bodyBox };
  assert.ok(Number.isFinite(body.minx), 'the coffee machine has no body box to preserve');

  assert.equal(applyStarLook(st, v, 1), false, '★1 rebuilt a mesh that did not change');
  assert.equal(applyStarLook(st, v, 3), true, '★3 did not rebuild the mesh');
  assert.ok(verts(base.geometry) > before, 'the ★3 machine is the same geometry as the ★1 one');
  assert.equal(group.children.filter(o => o.isMesh).length, 1, 'a star added a second mesh — that is a draw call');
  assert.deepEqual(base.geometry.userData.bodyBox, body, 'a star moved the body box: the owner can now stand somewhere new');

  // And back down (a reload of an older save, or a dev tool): it starts from the base every time
  // rather than piling ★3's parts under ★2's.
  applyStarLook(st, v, 2);
  const at2 = verts(base.geometry);
  applyStarLook(st, v, 3);
  applyStarLook(st, v, 2);
  assert.equal(verts(base.geometry), at2, '★2 after ★3 is not ★2: the dressing accumulated');
  applyStarLook(st, v, 1);
  assert.equal(verts(base.geometry), before, '★1 after ★3 is not the plain machine');
});

test('the call path is real: the Shop buys a star, economy writes it, the render layer reads it', () => {
  // 1. the door. ui/shop.js is what the Café card and the staff desk open.
  assert.match(SHOP_SRC, /buyStar:\s*id\s*=>\s*settle\(buyStar\(G, G\.world, id\)/,
    'ui/shop.js no longer buys stars through economy.buyStar');
  // 2. the write, for real.
  const w = builtWorld();
  const G = { coins: 1e9, stars: {}, world: w };
  assert.equal(starTierOf(G, 'coffee1'), 1, 'an unbought machine does not read as ★1');
  const cost = nextStarCost(AREA1, 'coffee1', 1);
  assert.ok(cost > 0, 'the coffee machine has no next star to buy');
  const r = buyStar(G, w, 'coffee1');
  assert.equal(r.ok, true, 'buyStar refused a purchase the wallet could afford');
  // 3. the read the render layer actually performs.
  assert.equal(starTierOf(G, 'coffee1'), 2, 'systems/visuals.js cannot see the star that was just bought');
  assert.ok(stationStarParts(w.stations.get('coffee1'), starTierOf(G, 'coffee1')).length > 0,
    'the tier the Shop just sold produces no dressing');
});

function mergeAll(parts) {
  // Cheap stand-in for geo.js merge(): this file only needs the totals, not a drawable geometry.
  const g = new THREE.BufferGeometry();
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return g;
}
