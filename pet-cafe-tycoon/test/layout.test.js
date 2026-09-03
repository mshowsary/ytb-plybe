// test/layout.test.js — M3 T3: geometry checks for the new area1 layout (data/area1.js) once the
// whole zone chain is built (every station active, the grid at its final, most-crowded shape).
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refreshActive } from '../src/sim/world.js';
import { buildGrid, idx, isFree } from '../src/sim/nav.js';

function buildAll(w) {
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  refreshActive(w);
}

test('every counter/checkout queue slot lies on a free grid cell', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  for (const id of [...w.displays, ...w.checkouts]) {
    const st = w.stations.get(id);
    for (let i = 0; i < st.queue.length; i++) {
      const p = st.queue[i];
      assert.ok(isFree(grid, idx(grid, p.x, p.z), 0), `${id} queue slot ${i} at (${p.x},${p.z}) is blocked`);
    }
  }
});

test('every seat pair spot (human and pet) lies on a free grid cell', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  for (const st of w.stations.values()) {
    if (st.type !== 'seat') continue;
    assert.ok(isFree(grid, idx(grid, st.pair.human.x, st.pair.human.z), 0), `${st.id} human spot blocked`);
    assert.ok(isFree(grid, idx(grid, st.pair.pet.x, st.pair.pet.z), 0), `${st.id} pet spot blocked`);
  }
});

test('the bowl front and every bush front lie on a free grid cell', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  const bowl = w.stations.get('bowl1');
  assert.ok(isFree(grid, idx(grid, bowl.front.x, bowl.front.z), 0), `bowl1 front at (${bowl.front.x},${bowl.front.z}) is blocked`);
  for (const id of ['bush1', 'bush2', 'bush3']) {
    const st = w.stations.get(id);
    assert.ok(isFree(grid, idx(grid, st.front.x, st.front.z), 0), `${id} front at (${st.front.x},${st.front.z}) is blocked`);
  }
});

test('every station front (the generic proximity/interaction spot) lies on a free grid cell', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  for (const st of w.stations.values()) {
    assert.ok(isFree(grid, idx(grid, st.front.x, st.front.z), 0), `${st.id} front at (${st.front.x},${st.front.z}) is blocked`);
  }
});

test('no zone disc centre lies inside any active-or-eventually-active station footprint', () => {
  const w = createWorld(AREA1); buildAll(w); // active flags no longer matter here — check every station's footprint regardless
  for (const z of AREA1.zones) {
    for (const s of AREA1.stations) {
      let fw = s.fw != null ? s.fw : 1, fd = s.fd != null ? s.fd : 1;
      if (Math.abs(Math.sin(s.rot || 0)) > 0.5) { const t = fw; fw = fd; fd = t; }
      const inside = Math.abs(z.x - s.x) < fw / 2 && Math.abs(z.z - s.z) < fd / 2;
      assert.ok(!inside, `zone ${z.id} at (${z.x},${z.z}) lies inside ${s.id}'s footprint`);
    }
  }
});

// M3 T3 fix round 2 (controller ruling): the exit corridor every 'leave' customer walks through
// (door at z 4.2) must stay clear on a wide swath of open floor between the counter row (z <=
// -1.25 once its nav-grid margin is included) and the single seat row (z >= 5.05 once its own
// margin is included) — the prior two-seat-row layout pinched this down to ~0.6m, under the
// two-movers-never-overlap floor (2 * 0.30m radius) by construction.
test('the exit corridor (z 3.0-4.6, x -9..6) is entirely free of blocked cells', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  for (let z = 3.0; z <= 4.6 + 1e-9; z += 0.1) {
    for (let x = -9; x <= 6 + 1e-9; x += 0.1) {
      assert.ok(isFree(grid, idx(grid, x, z), 0), `corridor cell (${x.toFixed(1)},${z.toFixed(1)}) is blocked`);
    }
  }
});

test('every counter/checkout queue slot lies at z <= 2.85 (clear of the exit corridor)', () => {
  const w = createWorld(AREA1); buildAll(w);
  for (const id of [...w.displays, ...w.checkouts]) {
    const st = w.stations.get(id);
    for (let i = 0; i < st.queue.length; i++) {
      assert.ok(st.queue[i].z <= 2.85, `${id} queue slot ${i} at z=${st.queue[i].z} exceeds 2.85`);
    }
  }
});

test('the 9-zone chain is a single sequential requires-chain in the given order, and every adds id exists', () => {
  // Loop v2 Task 1: the nine-zone chain from the design doc's unlock table — see data/area1.js's
  // zones comment (z_counter2/z_counter3/z_kiosk/z_gate are gone; the kiosk is free and area 2's
  // gate doesn't exist yet).
  const order = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_garden', 'z_seats2', 'z_bowl', 'z_blender'];
  assert.deepEqual(AREA1.zones.map(z => z.id), order);
  const stationIds = new Set(AREA1.stations.map(s => s.id));
  assert.equal(AREA1.zones[0].requires, undefined);
  for (let i = 1; i < order.length; i++) assert.equal(AREA1.zones[i].requires, order[i - 1], `${order[i]} should require ${order[i - 1]}`);
  for (const z of AREA1.zones) for (const id of z.adds) assert.ok(stationIds.has(id), `zone ${z.id} adds unknown station ${id}`);
});
