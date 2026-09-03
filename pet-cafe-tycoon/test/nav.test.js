import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { buildGrid, idx, cx, cz, isFree, findPath, nearestFree, cachedPath, markDirty } from '../src/sim/nav.js';
import { createMover, setTarget, stepMover, overlapPenetration } from '../src/sim/mover.js';

// Synthetic 20x14 area (2m west margin) with an oven-like station, per Task 1 brief:
// Task 1 works on the current 16x12 AREA1, but the grid-dimension/door-lane acceptance
// numbers in the brief are specified against a 20x14 area, so we build that area here.
const TEST_AREA = { size: { w: 20, d: 14 }, door: { x: -9.6, z: 4.2 } };
function makeWorld(stations) {
  const m = new Map();
  for (const s of stations) {
    m.set(s.id, { id: s.id, type: s.type, x: s.x, z: s.z, rot: s.rot || 0, fw: s.fw, fd: s.fd, active: s.active !== false });
  }
  return { stations: m };
}
const OVEN = { id: 'oven1', type: 'oven', x: 5.5, z: -4.2, fw: 1.6, fd: 1.2 };

test('grid dimensions for a 20x14 area with 2m margin', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([OVEN]));
  assert.equal(grid.w, 44);
  assert.equal(grid.h, 28);
});

test('cell at (0,0) is free', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([OVEN]));
  assert.equal(isFree(grid, idx(grid, 0, 0), 0), true);
});

test('cell at active station centre is blocked', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([OVEN]));
  assert.equal(isFree(grid, idx(grid, OVEN.x, OVEN.z), 0), false);
});

test('inactive station does not block its footprint', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([{ ...OVEN, active: false }]));
  assert.equal(isFree(grid, idx(grid, OVEN.x, OVEN.z), 0), true);
});

test('door lanes: entry cells carry lane 1, exit cells carry lane 2, gated by mask', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([OVEN]));
  const entry = idx(grid, -11, 3.5);
  assert.equal(grid.lane[entry], 1);
  assert.equal(isFree(grid, entry, 1), true);
  assert.equal(isFree(grid, entry, 0), false);
  assert.equal(isFree(grid, entry, 2), false);

  const exit = idx(grid, -11, 4.8);
  assert.equal(grid.lane[exit], 2);
  assert.equal(isFree(grid, exit, 2), true);
  assert.equal(isFree(grid, exit, 0), false);
  assert.equal(isFree(grid, exit, 1), false);
});

test('wall cell outside the door gap is blocked', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([OVEN]));
  assert.equal(isFree(grid, idx(grid, -10, 0), 3), false);
});

test('the wall is exactly one grid column thick, keyed by index not by a distance tie', () => {
  // Regression for the fix-round-1 finding: ox = -halfW - 2 and CELL = 0.5 mean the margin is
  // exactly 4 cells wide, so a *distance*-based wall check (|cx - (-halfW)| <= 0.25) ties between
  // the last margin column and the first floor-side column — both land exactly 0.25m from the
  // wall line. buildGrid now keys the wall off a grid-column index instead, so exactly one column
  // is "the wall" and the margin column just west of it keeps its ordinary lane classification.
  const grid = buildGrid(TEST_AREA, makeWorld([OVEN]));
  const wallGx = Math.round(2 / grid.cell); // margin(2m) / CELL(0.5m) = 4
  const cellAt = (gx, z) => Math.floor((z - grid.oz) / grid.cell) * grid.w + gx;
  const doorZ = TEST_AREA.door.z;
  const zEntry = doorZ - 0.6; // inside [doorZ-1.2, doorZ)

  for (let gx = 0; gx < wallGx; gx++) {
    assert.equal(grid.lane[cellAt(gx, zEntry)], 1, `gx=${gx} should carry lane 1 at an entry-lane z`);
  }
  const wallCell = cellAt(wallGx, zEntry);
  assert.equal(isFree(grid, wallCell, 0), true, 'the wall column is free inside the door gap without needing a mask bit');
  assert.equal(grid.lane[wallCell], 0, 'the wall column never carries a lane value');

  const floorCell = cellAt(wallGx + 1, zEntry);
  assert.equal(grid.lane[floorCell], 0);
  assert.equal(isFree(grid, floorCell, 0), true, 'the first floor column beyond the wall is ordinary floor');

  // Discriminator: a column that is blocked at z=0 (outside every lane and the door gap) yet
  // free at the exact centre of the door gap with mask 0 (i.e. unconditionally, not via a lane
  // bit) can only be the wall itself — a margin/lane column needs its mask bit to be free there
  // instead, and a floor column is never blocked at z=0 in the first place. Before this fix, the
  // tied margin-side column (gx = wallGx-1) also passed this check, because the old distance
  // check routed it into the wall-band branch and it came out free-with-no-lane inside the gap.
  let wallLikeCount = 0;
  for (let gx = 0; gx <= wallGx + 2; gx++) {
    const blockedAtZ0 = !isFree(grid, cellAt(gx, 0), 0);
    const freeAtGapCentre = isFree(grid, cellAt(gx, doorZ), 0);
    if (blockedAtZ0 && freeAtGapCentre) wallLikeCount++;
  }
  assert.equal(wallLikeCount, 1, 'exactly one column is blocked between the margin and the floor');
});

test('AREA1: oven1 centre blocked, dispCookie first queue slot free', () => {
  const w = createWorld(AREA1);
  const grid = buildGrid(AREA1, w);
  const oven1 = w.stations.get('oven1');
  assert.equal(isFree(grid, idx(grid, oven1.x, oven1.z), 0), false);
  const dispCookie = w.stations.get('dispCookie');
  const slot0 = dispCookie.queue[0];
  assert.equal(isFree(grid, idx(grid, slot0.x, slot0.z), 0), true);
});

test('findPath on an empty floor is near-optimal (<=1.2x straight-line cell distance)', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const from = idx(grid, -9, 0), to = idx(grid, 9, 0);
  const out = new Int32Array(grid.w * grid.h);
  const n = findPath(grid, from, to, 0, out);
  assert.ok(n > 0, 'path found');
  const straightCells = 18 / grid.cell; // 9 - (-9) = 18m
  assert.ok(n - 1 <= straightCells * 1.2, `path too long: ${n - 1} steps vs straight ${straightCells}`);
});

test('findPath routes around a wall and never cuts a blocked corner', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  // Block a 6-cell wall segment across the middle (a vertical wall in x, spanning z).
  const wallGx = grid.w >> 1;
  const baseGz = (grid.h >> 1) - 3;
  for (let i = 0; i < 6; i++) grid.blocked[(baseGz + i) * grid.w + wallGx] = 1;
  const from = idx(grid, -9, 0), to = idx(grid, 9, 0);
  const out = new Int32Array(grid.w * grid.h);
  const n = findPath(grid, from, to, 0, out);
  assert.ok(n > 0, 'path found around the wall');
  for (let i = 0; i < n - 1; i++) {
    const a = out[i], b = out[i + 1];
    const ax = a % grid.w, az = (a / grid.w) | 0;
    const bx = b % grid.w, bz = (b / grid.w) | 0;
    const dx = bx - ax, dz = bz - az;
    if (dx !== 0 && dz !== 0) {
      // diagonal move: both orthogonal neighbours must be free (no corner cutting)
      const n1 = az * grid.w + bx, n2 = bz * grid.w + ax;
      assert.equal(grid.blocked[n1], 0, `corner-cut through blocked cell at step ${i}`);
      assert.equal(grid.blocked[n2], 0, `corner-cut through blocked cell at step ${i}`);
    }
  }
});

test('findPath from a fully enclosed cell returns 0', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const centre = idx(grid, 0, 0);
  const gx = centre % grid.w, gz = (centre / grid.w) | 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dz === 0) continue;
    grid.blocked[(gz + dz) * grid.w + (gx + dx)] = 1;
  }
  const to = idx(grid, 9, 0);
  const out = new Int32Array(grid.w * grid.h);
  const n = findPath(grid, centre, to, 0, out);
  assert.equal(n, 0);
});

test('nearestFree of a blocked cell returns an adjacent free cell', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([OVEN]));
  const blockedCell = idx(grid, OVEN.x, OVEN.z);
  assert.equal(isFree(grid, blockedCell, 0), false);
  const free = nearestFree(grid, blockedCell, 0);
  assert.ok(free >= 0, 'a free cell was found');
  assert.equal(isFree(grid, free, 0), true);
  const bx = blockedCell % grid.w, bz = (blockedCell / grid.w) | 0;
  const fx = free % grid.w, fz = (free / grid.w) | 0;
  const cheb = Math.max(Math.abs(fx - bx), Math.abs(fz - bz));
  assert.ok(cheb <= 6, 'within the ring search radius');
});

test('cachedPath memoises within a frame and clears when grid.frame changes', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const from = idx(grid, -9, 0), to = idx(grid, 9, 0);
  const out1 = new Int32Array(256), out2 = new Int32Array(256);
  const n1 = cachedPath(grid, from, to, 0, out1);
  const n2 = cachedPath(grid, from, to, 0, out2);
  assert.equal(n1, n2);
  assert.deepEqual(Array.from(out1.slice(0, n1)), Array.from(out2.slice(0, n2)));
  grid.frame++;
  markDirty(grid);
  const out3 = new Int32Array(256);
  const n3 = cachedPath(grid, from, to, 0, out3);
  assert.equal(n3, n1);
});

test('mover: reaches a target 8m away on an empty floor within budget', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const speed = 2.0;
  const m = createMover(-4, 0, 0.3, speed);
  setTarget(m, 4, 0, grid);
  const movers = [m];
  const dt = 1 / 30;
  let t = 0, arrived = false;
  const budget = 8 / speed + 0.5;
  while (t < budget + 2 && !arrived) {
    arrived = stepMover(m, grid, movers, dt) || arrived;
    t += dt;
  }
  assert.ok(arrived, 'mover arrived');
  assert.ok(t <= budget + dt, `too slow: ${t}s vs budget ${budget}s`);
  assert.equal(m.teleports, 0);
});

test('mover: two movers walking head-on pass without significant overlap and both arrive', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const speed = 2.0;
  const a = createMover(-4, 0, 0.3, speed);
  const b = createMover(4, 0, 0.3, speed);
  setTarget(a, 4, 0, grid);
  setTarget(b, -4, 0, grid);
  const movers = [a, b];
  const dt = 1 / 30;
  let maxPen = 0;
  let aArrived = false, bArrived = false;
  for (let t = 0; t < 15 && !(aArrived && bArrived); t += dt) {
    if (!aArrived) aArrived = stepMover(a, grid, movers, dt);
    if (!bArrived) bArrived = stepMover(b, grid, movers, dt);
    maxPen = Math.max(maxPen, overlapPenetration(a, b));
  }
  assert.ok(aArrived && bArrived, 'both movers arrived');
  assert.ok(maxPen <= 0.15, `overlap too deep: ${maxPen}`);
  assert.equal(a.teleports, 0);
  assert.equal(b.teleports, 0);
});

test('mover: re-plans within 1.5s when the path is walled off after planning, and arrives', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const speed = 2.0;
  const m = createMover(-4, 0, 0.3, speed);
  setTarget(m, 4, 0, grid);
  // Wall off a straight vertical segment across the mover's original straight-line path
  // (which runs along z=0), leaving a detour open only far to the side.
  const wallGx = idx(grid, 0, 0) % grid.w;
  for (let gz = 0; gz < grid.h; gz++) {
    const zv = grid.oz + (gz + 0.5) * grid.cell;
    if (Math.abs(zv) < 3) grid.blocked[gz * grid.w + wallGx] = 1; // blocks the original z=0 line
  }
  markDirty(grid);
  const movers = [m];
  const dt = 1 / 30;
  let arrived = false, t = 0;
  let replanSeenBy = -1;
  for (; t < 20 && !arrived; t += dt) {
    grid.frame++; // one sim tick: matches the real per-frame cache-invalidation contract
    arrived = stepMover(m, grid, movers, dt);
    if (m.replans > 0 && replanSeenBy < 0) replanSeenBy = t;
  }
  assert.ok(arrived, 'mover arrived despite the wall');
  assert.ok(replanSeenBy >= 0 && replanSeenBy <= 1.6, `re-plan too slow: ${replanSeenBy}`);
});

// Final review fix 3: teleport (the 4s blockedT escalation) must never fire for a genuinely
// pathless mover (n === 0 — no path exists, e.g. an unreachable target), and must never land a
// mover on a cell that's actually blocked.
test('fix: a mover with n === 0 (no path to its target) never teleports, no matter how long it stalls', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const m = createMover(0, 0, 0.3, 2.0);
  const centre = idx(grid, 0, 0);
  const gx = centre % grid.w, gz = (centre / grid.w) | 0;
  // Fully enclose the mover's own cell (all 8 neighbours blocked) so it genuinely cannot reach
  // anywhere else — same construction as the "findPath from a fully enclosed cell returns 0" test.
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dz === 0) continue;
    grid.blocked[(gz + dz) * grid.w + (gx + dx)] = 1;
  }
  setTarget(m, 9, 0, grid);
  assert.equal(m.n, 0, 'setup: genuinely no path out of the fully-enclosed cell');
  // Force blockedT straight to (and past) the teleport threshold, as if it had already stalled
  // for a long time, without triggering a re-plan (grid.version is untouched).
  m.blockedT = 5.0;
  stepMover(m, grid, [m], 1 / 30);
  assert.equal(m.teleports, 0, 'a pathless mover (n === 0) must never teleport, regardless of blockedT');
});

test('fix: a teleport never lands on a blocked cell (clamped to the nearest free cell centre)', () => {
  const grid = buildGrid(TEST_AREA, makeWorld([]));
  const m = createMover(-4, 0, 0.3, 2.0);
  setTarget(m, 4, 0, grid);
  assert.ok(m.n > 0, 'setup: a real path exists');
  // Wall off a band of floor immediately around the mover (both along its path and to the sides,
  // but NOT so wide it swallows the mover's own current cell) so an unclamped TELEPORT_DIST jump
  // would land inside a blocked cell; a free ring remains just outside this band for nearestFree
  // to find.
  for (let gx = 0; gx < grid.w; gx++) {
    const xv = grid.ox + (gx + 0.5) * grid.cell;
    if (xv <= -4.0 || xv >= -2.5) continue;
    for (let gz = 0; gz < grid.h; gz++) {
      const zv = grid.oz + (gz + 0.5) * grid.cell;
      if (zv > -0.5 && zv < 0.5) grid.blocked[gz * grid.w + gx] = 1;
    }
  }
  // Force the teleport threshold directly, without a markDirty/grid.version bump (which would
  // trigger a replan and reset blockedT before the teleport check ever runs).
  m.blockedT = 4.0;
  stepMover(m, grid, [m], 1 / 30);
  assert.equal(m.teleports, 1, 'teleport should still fire when a real path exists (n > 0)');
  const cell = idx(grid, m.x, m.z);
  assert.equal(isFree(grid, cell, m.mask), true, 'landing cell must not be blocked');
});

// Final review fix 7a: a mid-run payZone -> refreshActive rebuild replaces w.grid with a brand
// new grid object (bumping .version). Every in-flight mover must notice the version mismatch on
// its very next step, re-plan onto the NEW grid (gridVersion converges to it), and still reach
// its original target — nothing about an already-in-progress walk should get permanently stuck or
// silently frozen on the stale grid.
test('mid-run payZone rebuild: in-flight movers re-plan onto the new grid and still arrive', () => {
  const w = createWorld(AREA1);
  const targets = [{ x: 8, z: 6 }, { x: -8, z: 5 }, { x: 0, z: 6 }];
  const movers = targets.map((_, i) => createMover(-4 + i, -1, 0.3, 2.0));
  movers.forEach((m, i) => setTarget(m, targets[i].x, targets[i].z, w.grid));
  const dt = 1 / 30;
  const arrived = movers.map(() => false);
  // Walk a bit before the rebuild, so every mover is genuinely mid-route.
  for (let t = 0; t < 1; t += dt) movers.forEach((m, i) => { if (!arrived[i]) arrived[i] = stepMover(m, w.grid, movers, dt); });
  assert.ok(arrived.every(a => !a), 'setup: nobody should have arrived yet after just 1s');
  const oldVersion = w.grid.version;
  payZone(w, 'z_seats1', 100000, 10); // fully funds and builds seat1/seat2 -> refreshActive rebuilds w.grid
  assert.ok(w.grid.version > oldVersion, 'setup: the rebuild bumped grid.version');
  for (let t = 0; t < 30 && !arrived.every(a => a); t += dt) {
    movers.forEach((m, i) => { if (!arrived[i]) arrived[i] = stepMover(m, w.grid, movers, dt); });
  }
  assert.ok(arrived.every(a => a), 'every mover should have arrived despite the mid-walk grid rebuild');
  for (const m of movers) assert.equal(m.gridVersion, w.grid.version, 'each mover should have re-planned onto the new grid version');
});
