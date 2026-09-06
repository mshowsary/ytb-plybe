import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { createNavGrid, worldToCell } from '../src/sim/nav.js';

function cellFree(grid, p) {
  const c = worldToCell(grid, p.x, p.z);
  return !!c && grid.blocked[c.i] === 0;
}

function footprint(st) {
  const rot90 = Math.abs(Math.sin(st.rot || 0)) > 0.7;
  const fw = st.fw || 1, fd = st.fd || 1;
  return { x:st.x, z:st.z, hw:(rot90 ? fd : fw) / 2, hd:(rot90 ? fw : fd) / 2 };
}

function pointInsideBox(p, b, margin = 0) {
  return Math.abs(p.x - b.x) < b.hw + margin && Math.abs(p.z - b.z) < b.hd + margin;
}

test('every display/register queue slot lies on a free grid cell', () => {
  const w = createWorld(AREA1, { built:AREA1.zones.map(z => z.id) });
  const grid = createNavGrid(AREA1, w.stations);
  for (const id of [...w.displays, ...w.checkouts]) {
    const st = w.stations.get(id);
    for (const [i, p] of st.queue.entries()) assert.ok(cellFree(grid, p), `${id} queue[${i}] blocked`);
  }
});

test('every seat pair spot lies on a free grid cell', () => {
  const w = createWorld(AREA1, { built:AREA1.zones.map(z => z.id) });
  const grid = createNavGrid(AREA1, w.stations);
  for (const id of w.seats) {
    const st = w.stations.get(id);
    assert.ok(cellFree(grid, st.pair.human), `${id} human spot blocked`);
    assert.ok(cellFree(grid, st.pair.pet), `${id} pet spot blocked`);
  }
});

test('every station front lies on a free grid cell', () => {
  const w = createWorld(AREA1, { built:AREA1.zones.map(z => z.id) });
  const grid = createNavGrid(AREA1, w.stations);
  for (const st of w.stations.values()) if (st.active) assert.ok(cellFree(grid, st.front), `${st.id} front blocked`);
});

test('no zone disc centre lies inside a station footprint', () => {
  for (const z of AREA1.zones) for (const st of AREA1.stations) {
    assert.equal(pointInsideBox(z, footprint(st), 0.15), false, `${z.id} overlaps ${st.id}`);
  }
});

test('exit corridor remains entirely free', () => {
  const w = createWorld(AREA1, { built:AREA1.zones.map(z => z.id) });
  const grid = createNavGrid(AREA1, w.stations);
  for (let x = -9.5; x <= -4.2; x += 0.5) for (let z = 3.3; z <= 5.1; z += 0.5) {
    assert.ok(cellFree(grid, {x,z}), `exit corridor blocked at ${x.toFixed(1)},${z.toFixed(1)}`);
  }
});

test('display/register queues stay north of the exit corridor', () => {
  const w = createWorld(AREA1, { built:AREA1.zones.map(z => z.id) });
  for (const id of [...w.displays, ...w.checkouts]) {
    const st = w.stations.get(id);
    for (const p of st.queue) {
      const inExit = p.x <= -4.2 && p.z >= 3.3 && p.z <= 5.1;
      assert.equal(inExit, false, `${id} queue intrudes exit corridor`);
    }
  }
});

test('smoothie display leaves a genuine player-width passage beside cupcakes', () => {
  const a = AREA1.stations.find(s => s.id === 'dispCupcake');
  const b = AREA1.stations.find(s => s.id === 'barSmoothie');
  const edgeGap = Math.abs(b.x - a.x) - (a.fw + b.fw) / 2;
  assert.ok(edgeGap >= 1.0, `display passage only ${edgeGap.toFixed(2)}m`);
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

test('Task 25 progression makes Staff Desk and second register parallel after Cupcakes', () => {
  const order = ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2'];
  assert.deepEqual(AREA1.zones.map(z => z.id), order);
  const zones = new Map(AREA1.zones.map(z => [z.id, z]));
  const stationIds = new Set(AREA1.stations.map(s => s.id));

  assert.equal(zones.get('z_seats1').requires, undefined);
  assert.equal(zones.get('z_oven2').requires, 'z_seats1');
  assert.equal(zones.get('z_register2').requires, 'z_oven2');
  assert.equal(zones.get('z_hire').requires, 'z_oven2');
  assert.equal(zones.get('z_hire').price, 300);
  assert.equal(zones.get('z_coffee').requires, 'z_hire');

  // From Coffee onward the productive expansion remains intentionally ordered.
  const tail = ['z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2'];
  for (let i = 1; i < tail.length; i++) assert.equal(zones.get(tail[i]).requires, tail[i - 1], `${tail[i]} should require ${tail[i - 1]}`);
  for (const z of AREA1.zones) for (const id of z.adds) assert.ok(stationIds.has(id), `zone ${z.id} adds unknown station ${id}`);

  // The optional register cannot accidentally become a hidden prerequisite for staff/coffee.
  assert.notEqual(zones.get('z_hire').requires, 'z_register2');
  assert.notEqual(zones.get('z_coffee').requires, 'z_register2');
});

test('zone chain still unlocks a complete smoothie loop before garden expansion', () => {
  const smoothie = AREA1.zones.find(z => z.id === 'z_blender');
  assert.ok(smoothie.adds.includes('blender1'), 'smoothie unlock must include blender');
  assert.ok(smoothie.adds.includes('barSmoothie'), 'smoothie unlock must include display');
  assert.ok(smoothie.adds.some(id => id.startsWith('bush')), 'smoothie unlock must include starter fruit source');

  const garden = AREA1.zones.find(z => z.id === 'z_garden');
  assert.ok(garden.adds.every(id => id.startsWith('bush')), 'garden expansion should add fruit capacity only');
  assert.ok(garden.adds.length >= 2, 'garden expansion should materially increase fruit throughput');
});
