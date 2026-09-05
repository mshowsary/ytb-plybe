import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refreshActive } from '../src/sim/world.js';
import { buildGrid, idx, isFree } from '../src/sim/nav.js';

function buildAll(w) {
  for (const z of AREA1.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
  }
  refreshActive(w);
}

test('every display/register queue slot lies on a free grid cell', () => {
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

test('every seat pair spot lies on a free grid cell', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  for (const st of w.stations.values()) {
    if (st.type !== 'seat') continue;
    assert.ok(isFree(grid, idx(grid, st.pair.human.x, st.pair.human.z), 0), `${st.id} human spot blocked`);
    assert.ok(isFree(grid, idx(grid, st.pair.pet.x, st.pair.pet.z), 0), `${st.id} pet spot blocked`);
  }
});

test('every station front lies on a free grid cell', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  for (const st of w.stations.values()) {
    assert.ok(isFree(grid, idx(grid, st.front.x, st.front.z), 0), `${st.id} front at (${st.front.x},${st.front.z}) is blocked`);
  }
});

test('no zone disc centre lies inside a station footprint', () => {
  for (const z of AREA1.zones) {
    for (const s of AREA1.stations) {
      let fw = s.fw ?? 1, fd = s.fd ?? 1;
      if (Math.abs(Math.sin(s.rot || 0)) > 0.5) [fw, fd] = [fd, fw];
      const inside = Math.abs(z.x - s.x) < fw / 2 && Math.abs(z.z - s.z) < fd / 2;
      assert.ok(!inside, `zone ${z.id} lies inside ${s.id}`);
    }
  }
});

test('exit corridor remains entirely free', () => {
  const w = createWorld(AREA1); buildAll(w);
  const grid = buildGrid(AREA1, w);
  for (let z = 3.0; z <= 4.6 + 1e-9; z += 0.1) {
    for (let x = -9; x <= 6 + 1e-9; x += 0.1) {
      assert.ok(isFree(grid, idx(grid, x, z), 0), `corridor cell (${x.toFixed(1)},${z.toFixed(1)}) is blocked`);
    }
  }
});

test('display/register queues stay north of the exit corridor', () => {
  const w = createWorld(AREA1); buildAll(w);
  for (const id of [...w.displays, ...w.checkouts]) {
    const st = w.stations.get(id);
    for (const p of st.queue) assert.ok(p.z <= 2.85, `${id} queue at z=${p.z} exceeds 2.85`);
  }
});

test('smoothie display leaves a genuine player-width passage beside cupcakes', () => {
  const cupcake = AREA1.stations.find(s => s.id === 'dispCupcake');
  const smoothie = AREA1.stations.find(s => s.id === 'barSmoothie');
  const gap = (smoothie.x - smoothie.fw / 2) - (cupcake.x + cupcake.fw / 2);
  assert.ok(gap >= 1.0, `cupcake/smoothie passage is only ${gap.toFixed(2)}m`);
});

test('pantry, return and blender are physically separated', () => {
  const ids = ['pantry1', 'return1', 'blender1'];
  const stations = ids.map(id => AREA1.stations.find(s => s.id === id));
  for (let i = 0; i < stations.length; i++) for (let j = i + 1; j < stations.length; j++) {
    const a = stations[i], b = stations[j];
    const centreGap = Math.abs(a.x - b.x);
    const edgeGap = centreGap - (a.fw + b.fw) / 2;
    assert.ok(edgeGap >= 0.2, `${a.id}/${b.id} edge gap is ${edgeGap.toFixed(2)}m`);
  }
});

test('zone chain unlocks a complete smoothie loop before garden expansion', () => {
  const order = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2'];
  assert.deepEqual(AREA1.zones.map(z => z.id), order);
  const stationIds = new Set(AREA1.stations.map(s => s.id));
  assert.equal(AREA1.zones[0].requires, undefined);
  for (let i = 1; i < order.length; i++) assert.equal(AREA1.zones[i].requires, order[i - 1], `${order[i]} should require ${order[i - 1]}`);
  for (const z of AREA1.zones) for (const id of z.adds) assert.ok(stationIds.has(id), `zone ${z.id} adds unknown station ${id}`);

  const smoothie = AREA1.zones.find(z => z.id === 'z_blender');
  assert.ok(smoothie.adds.includes('blender1'), 'smoothie unlock must include blender');
  assert.ok(smoothie.adds.includes('barSmoothie'), 'smoothie unlock must include display');
  assert.ok(smoothie.adds.some(id => id.startsWith('bush')), 'smoothie unlock must include starter fruit source');

  const garden = AREA1.zones.find(z => z.id === 'z_garden');
  assert.ok(garden.adds.every(id => id.startsWith('bush')), 'garden expansion should add fruit capacity only');
  assert.ok(garden.adds.length >= 2, 'garden expansion should materially increase fruit throughput');
});
