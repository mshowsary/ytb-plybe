// test/garden-layout.test.js — the Ice cream garden's layout rules (docs/SHIP-PLAN-2026-09-19.md
// §1.2), checked against the real data with every zone built.
//
// What these replace: two 0.5 m corridors between the lounge tables fed the 4.8 m gate, and the owner
// walking at the gate centre stopped against seat4; guests left the deck through the photo booth;
// seat8 stood inside the ice cream lane's triangle and the owner wedged between two deck tables on
// the way to the cream supply. The rules are about BODIES: the guests' nav grid for guests, the
// owner-body grid (sim/ownerReach.js, the owner's own collision boxes and room shape) for the owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { gateApron, idx, isFree, regionAt } from '../src/sim/nav.js';
import { ownerBodyBoxes, ownerReachGrid, ownerReachComponent, ownerReachCell } from '../src/sim/ownerReach.js';
import { OWNER_SPAWN } from '../src/sim/ownerState.js';

function allBuilt() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}
function footprint(s, margin = 0) {
  let fw = s.fw ?? 1, fd = s.fd ?? 1;
  if (Math.abs(Math.sin(s.rot || 0)) > 0.5) [fw, fd] = [fd, fw];
  return { x0: s.x - fw / 2 - margin, x1: s.x + fw / 2 + margin, z0: s.z - fd / 2 - margin, z1: s.z + fd / 2 + margin };
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const inside = (p, r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;

test('the gate apron is |x| <= 2.9, z 4.0-8.5, and no footprint (nav-expanded) touches it on either side of the fence', () => {
  const [apron] = gateApron(AREA1);
  assert.deepEqual(apron, { x0: -2.9, x1: 2.9, z0: 4, z1: 8.5 });
  const bad = [];
  for (const s of AREA1.stations) {
    if (s.type === 'gate') continue; // the opening itself
    if (overlaps(footprint(s, 0.25), apron)) bad.push(s.id);
  }
  assert.deepEqual(bad, [], 'footprints in the gate apron: ' + bad.join(', '));
  // And the guests' grid agrees: every cell of the apron is floor once everything is built.
  const w = allBuilt();
  const blocked = [];
  for (let x = -2.75; x <= 2.75; x += 0.5) for (let z = 4.25; z <= 8.25; z += 0.5) {
    if (z > 7 && z < 7.5 && Math.abs(x) > 2.4) continue; // the fence row either side of the gap
    if (!isFree(w.grid, idx(w.grid, x, z), 0)) blocked.push(`(${x},${z})`);
  }
  assert.deepEqual(blocked, []);
});

test('every station front, till spot and queue slot has a corridor of at least 1.0 m for the owner', () => {
  // A 0.5 m radius (1.0 m wide) body on the owner grid: the owner's own is 0.46 (0.92 m wide).
  const w = allBuilt();
  const g = ownerReachGrid(AREA1, w.built, ownerBodyBoxes(w), 0.5);
  const reach = ownerReachComponent(g, ownerReachCell(g, OWNER_SPAWN.x, OWNER_SPAWN.z, 2));
  const points = [];
  for (const st of w.stations.values()) {
    // 'gate' is a doorway, 'decor' the fountain, 'wall' the photo board hung above the floor:
    // none of the three has a spot anyone ever stands at.
    if (st.type === 'gate' || st.type === 'decor' || st.type === 'wall') continue;
    points.push({ id: `${st.id}.front`, ...st.front });
    if (st.serve) points.push({ id: `${st.id}.serve`, ...st.serve });
    for (const [i, q] of (st.queue || []).entries()) points.push({ id: `${st.id}.queue${i}`, ...q });
  }
  const bad = [];
  for (const p of points) {
    const k = ownerReachCell(g, p.x, p.z, 0.5);
    if (k < 0 || !reach[k]) bad.push(`${p.id} (${p.x.toFixed(2)},${p.z.toFixed(2)})`);
  }
  assert.deepEqual(bad, [], 'no 1.0 m corridor from the café centre to:\n  ' + bad.join('\n  '));
});

test('no spawn, exit, door, queue or seat point lies inside any station body', () => {
  const w = allBuilt();
  const points = [];
  for (const k of ['door', 'exit', 'spawnStart', 'terraceDoor', 'terraceSpawn', 'terraceSpawnOut']) points.push({ id: k, ...AREA1[k] });
  for (const st of w.stations.values()) {
    for (const [i, q] of (st.queue || []).entries()) points.push({ id: `${st.id}.queue${i}`, ...q });
    if (st.pair) { points.push({ id: `${st.id}.human`, ...st.pair.human }); points.push({ id: `${st.id}.pet`, ...st.pair.pet }); }
  }
  const bad = [];
  for (const p of points) for (const s of AREA1.stations) {
    if (s.type === 'gate') continue;
    if (inside(p, footprint(s))) bad.push(`${p.id} is inside ${s.id}`);
  }
  assert.deepEqual(bad, []);
});

test('the stand: the machine stands directly behind the counter, both worked from one spot on the owner side', () => {
  const w = allBuilt();
  const stand = w.stations.get('barIce'), machine = w.stations.get('icecream1');
  assert.equal(stand.selfServe, true);
  assert.equal(machine.z, stand.z, 'in line with the counter');
  assert.ok(machine.x > stand.x, 'behind it, away from the guests');
  assert.ok(Math.hypot(stand.front.x - machine.front.x, stand.front.z - machine.front.z) < 0.3, 'machine -> counter is one step');
  assert.ok(stand.front.x > stand.x && stand.front.x < machine.x, 'the owner stands between them, not in the queue');
  // The guests' side: the queue runs west toward the garden's arch, clear of the gate apron.
  const [apron] = gateApron(AREA1);
  for (const q of stand.queue) {
    assert.ok(q.x < stand.x, 'queue on the counter\'s guest side');
    assert.ok(!(q.x >= apron.x0 && q.x <= apron.x1 && q.z >= apron.z0 && q.z <= apron.z1), `queue slot (${q.x},${q.z}) in the apron`);
  }
});

test('the garden\'s arch opens the street margin only once the garden is built, with entry and exit lanes', () => {
  const before = createWorld(AREA1);
  const after = allBuilt();
  const { terraceDoor: door, terraceSpawn: spawn } = AREA1;
  const cell = (w, x, z) => idx(w.grid, x, z);
  // On the street beside the arch: blocked before, laned after (entry below the door's z, exit above).
  assert.equal(isFree(before.grid, cell(before, spawn.x, door.z - 0.5), 1), false);
  assert.equal(isFree(after.grid, cell(after, spawn.x, door.z - 0.5), 1), true, 'entry lane open to an arriving guest');
  assert.equal(isFree(after.grid, cell(after, spawn.x, door.z - 0.5), 0), false, 'but not to a guest already inside');
  assert.equal(isFree(after.grid, cell(after, spawn.x, door.z + 0.5), 2), true, 'exit lane open to a leaving guest');
  assert.equal(isFree(after.grid, cell(after, -10.25, door.z + 0.5), 2), true, 'the arch itself, on the region edge');
  // Only the arch: the street beside the rest of the deck stays closed.
  assert.equal(isFree(after.grid, cell(after, spawn.x, 9.5), 3), false);
  assert.ok(regionAt(AREA1, door.x, door.z), 'the door point is on the deck');
  assert.equal(regionAt(AREA1, spawn.x, spawn.z), null, 'the spawn point is on the street');
});
