// test/resident-spots.test.js — where resident pets live, and how they get there (Batch B3).
//
// Two bugs from the 2026-09-19 hunt, pinned so they cannot come back:
//   - homes placed without checking the stations around them: the star-3 cat bed sat 0.54 m from
//     bush1's harvest spot with barSmoothie's queue running through it;
//   - the move-in walk lerped a straight line from the door, through the south fence, counters and
//     flower beds, floating 0.42 m over the lawn out in the garden.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createResidentPets, residentHomes, admitResident } from '../src/systems/residentPets.js';
import { createWorld } from '../src/sim/world.js';
import { idx } from '../src/sim/nav.js';
import { LAWN_Y } from '../src/render/environment.js';
import { AREA1 } from '../data/area1.js';

const inRegion = (st, r) => st.x >= r.x0 && st.x <= r.x1 && st.z >= r.z0 && st.z <= r.z1;

test('no resident home stands within a metre of a station front or a queue slot', () => {
  const world = createWorld(AREA1);
  const regions = AREA1.regions || [];
  for (const home of residentHomes()) {
    for (const st of world.stations.values()) {
      // A home's lawn spot only ever coexists with stations outside the region that paves it over.
      if (home.pavedBy && regions.some(r => r.builtBy === home.pavedBy && inRegion(st, r))) continue;
      const spots = [['front', st.front], ...(st.queue || []).map((q, i) => ['q' + i, q])];
      for (const [name, p] of spots) {
        if (!p) continue;
        const d = Math.hypot(p.x - home.x, p.z - home.z);
        assert.ok(d >= 1.0, `the home at (${home.x}, ${home.z}) is ${d.toFixed(2)} m from ${st.id}.${name}`);
      }
    }
  }
});

test('a home out on the lawn sits ON the lawn until its region is built, then at floor height', () => {
  const lawnHomes = residentHomes().filter(h => h.pavedBy);
  assert.ok(lawnHomes.length >= 2, 'the hutch and the dog basket both have a lawn and a paved placement');
  for (const h of lawnHomes) assert.ok(Math.abs(h.y - LAWN_Y) <= 0.021, `a lawn home floats at y ${h.y}`);
  for (const h of residentHomes().filter(h => h.builtBy)) assert.equal(h.y, 0);
});

function gameWith(world) {
  return {
    P: { x: 0, z: 0 },
    meta: { residents: [], petFriendship: {}, equipped: {} },
    dayState: { day: 1, phase: 'morning' },
    world,
    settings: {},
    time: 0,
  };
}

test('a new resident walks in along the guests\' own grid, never through a counter, fence or wall', () => {
  const world = createWorld(AREA1);
  const grid = world.grid;
  const scene = new THREE.Scene();
  const G = gameWith(world);
  const residents = createResidentPets({ scene, camera: null }, G, null);
  residents.update(1 / 60);
  admitResident(G.meta, 'cat:0', 0);   // slot 0: the north window cushion, across the whole café
  G.dayState.day = 2;
  residents.update(1 / 60);
  const walker = scene.children.find(o => o.name && /^pet:/.test(o.name)) || scene.children[scene.children.length - 1];
  const door = AREA1.door;
  assert.ok(Math.hypot(walker.position.x - door.x, walker.position.z - door.z) < 0.6, 'the walk starts at the door');
  let samples = 0, offGrid = [];
  for (let i = 0; i < 400 && walker.parent === scene; i++) {
    residents.update(1 / 30);
    if (walker.parent !== scene || walker.position.y > 0.01) continue;
    samples++;
    const p = walker.position;
    // Every sampled point lies on a walkable cell, or within half a cell of one (the path runs
    // between cell centres and the last metre goes from a cell to the furniture).
    const ok = [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].some(([dx, dz]) => !grid.blocked[idx(grid, p.x + dx, p.z + dz)]);
    if (!ok) offGrid.push([+p.x.toFixed(2), +p.z.toFixed(2)]);
  }
  assert.ok(samples > 20, `expected a walk, saw ${samples} floor samples`);
  assert.deepEqual(offGrid, [], 'the walk-in crossed blocked cells');
  for (let i = 0; i < 200; i++) residents.update(1 / 20);
  assert.equal(residents.count, 1, 'the pet settles on its furniture');
});

test('a lawn home waits for the deck to be laid before it moves onto it', () => {
  const world = createWorld(AREA1);
  const scene = new THREE.Scene();
  let laying = true;
  const G = { ...gameWith(world), environment: { revealing: id => id === 'terrace' && laying } };
  const residents = createResidentPets({ scene, camera: null }, G, null);
  residents.update(1 / 60);
  const hutch = residentHomes().find(h => h.pavedBy === 'z_terrace' && h.x === -6.0);
  const spotAt = (x, z) => scene.children.find(o => o.name === 'resident-spot' && Math.abs(o.position.x - x) < 1e-6 && Math.abs(o.position.z - z) < 1e-6);
  assert.ok(spotAt(hutch.x, hutch.z), 'the hutch starts on its lawn spot');
  world.built.add('z_terrace');
  residents.update(1 / 60);
  assert.ok(spotAt(hutch.x, hutch.z), 'while the deck is being laid the hutch stays on the lawn');
  laying = false;
  residents.update(1 / 60);
  const paved = residentHomes().find(h => h.builtBy === 'z_terrace' && Math.abs(h.x + 0.8) < 1e-6);
  const moved = spotAt(paved.x, paved.z);
  assert.ok(moved && moved.position.y === 0, 'once the deck is down the hutch stands on it at floor height');
});

test('a home the grid cannot reach gets its pet in a puff, at the home, never walking the lawn', () => {
  const world = createWorld(AREA1);
  const scene = new THREE.Scene();
  const G = gameWith(world);
  const residents = createResidentPets({ scene, camera: null }, G, null);
  residents.update(1 / 60);
  // Slots 0-4 are the base homes; the hutch (slot 4) stands on the garden lawn before the terrace.
  for (const key of ['cat:0', 'dog:0', 'bunny:0', 'cat:1', 'dog:1']) admitResident(G.meta, key, 5);
  G.dayState.day = 2;
  residents.update(1 / 60);
  const hutch = residentHomes().find(h => h.pavedBy && h.x === -6.0);
  const arrivals = scene.children.filter(o => o.name && /^pet:/.test(o.name));
  const atHutch = arrivals.find(o => Math.hypot(o.position.x - hutch.x, o.position.z - hutch.z) < 0.01);
  assert.ok(atHutch, 'the garden resident appears at its home, not at the door');
  assert.ok(atHutch.scale.x < 0.5, 'it pops in rather than just being there');
  for (let i = 0; i < 400; i++) residents.update(1 / 20);
  assert.equal(residents.count, 5);
});
