// test/nav-regions.test.js — Batch 1, Task 1.1: the regions engine (plan 7.1).
//
// Covers, in order:
//   (a) before z_terrace: a cell at z=10 is blocked, and the fence row is solid.
//   (b) after z_terrace: that cell is walkable, and a real pathfound route exists from inside the
//       café through the gate to seat7's front.
//   (c) the gate gap is exactly |x| <= 1.2 — a cell at x=3 on the fence row is still blocked.
//   (d) an unbuilt region's cells stay blocked even when the region exists in area.regions.
//   (e) days 1-12 unchanged: with only the authored 9 zones built, the grid is byte-identical to
//       the pre-change grid for every interior cell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refreshActive } from '../src/sim/world.js';
import { buildGrid, idx, isFree, findPath } from '../src/sim/nav.js';

// Builds every zone up to and including `throughId` (inclusive), in AREA1.zones' own order —
// mirrors test/layout.test.js's buildAll but stops partway through the chain so (a)/(e) can
// observe the pre-terrace grid.
function buildThrough(w, throughId) {
  for (const z of AREA1.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    if (z.id === throughId) break;
  }
  refreshActive(w);
}

// Probed at x=5 (not x=0) so the point never lands inside fountain1's own footprint (x 0, z 10.6,
// fw/fd 2.4) once the terrace is built — this test is about the REGION, not station placement.
test('(a) before z_terrace: a cell at z=10 is blocked, and the fence row is solid', () => {
  const w = createWorld(AREA1);
  buildThrough(w, 'z_seats2'); // every authored day 1-12 zone, terrace not yet bought
  const grid = buildGrid(AREA1, w);
  assert.equal(isFree(grid, idx(grid, 5, 10), 0), false, 'z=10 (inside the unbuilt terrace region) should be blocked');
  // The whole fence row, not just the gate's own x, is solid pre-terrace — sample across it.
  for (let x = -9; x <= 9; x += 1.5) {
    assert.equal(isFree(grid, idx(grid, x, 7.2), 0), false, `fence row at x=${x} should be blocked pre-terrace`);
  }
});

test('(b) after z_terrace: z=10 is walkable, and a path exists through the gate to seat7 front', () => {
  const w = createWorld(AREA1);
  buildThrough(w, 'z_terrace');
  const grid = buildGrid(AREA1, w);
  assert.equal(isFree(grid, idx(grid, 5, 10), 0), true, 'z=10 should be walkable once the terrace is built');

  const seat7 = w.stations.get('seat7');
  assert.equal(seat7.active, true);
  const from = idx(grid, 0, 2); // well inside the café, north of the seating row
  const to = idx(grid, seat7.front.x, seat7.front.z);
  assert.equal(isFree(grid, to, 0), true, 'seat7 front should be walkable');
  const out = new Int32Array(grid.w * grid.h);
  const n = findPath(grid, from, to, 0, out);
  assert.ok(n > 0, 'a real pathfound route from inside the café to seat7 front should exist');
  // The route must actually cross the fence line — otherwise it would just be findPath failing
  // closed (n===0 already ruled that out) or, worse, a route that never needed the gate at all.
  let crossedFence = false;
  for (let i = 0; i < n; i++) {
    const cell = out[i];
    const cz = grid.oz + (((cell / grid.w) | 0) + 0.5) * grid.cell;
    if (cz > 7 && cz < 7.4) crossedFence = true;
  }
  assert.ok(crossedFence, 'the path should cross the fence row (through the gate), not go around a boundary that does not exist');
});

test('(c) the gate gap is exactly |x| <= 1.2 — a cell at x=3 on the fence row is still blocked', () => {
  const w = createWorld(AREA1);
  buildThrough(w, 'z_terrace');
  const grid = buildGrid(AREA1, w);
  assert.equal(isFree(grid, idx(grid, 0, 7.2), 0), true, 'x=0 at the fence line should be open (inside the 1.2m gate gap)');
  // 0.6, not 1.1: CELL=0.5 and ox=-12 put cell centres at .25/.75 offsets, so a probe near the
  // 1.2m gate edge itself can land in the cell centred at 1.25 (just outside) purely from grid
  // quantization — 0.6 is unambiguously inside the gap on any such offset.
  assert.equal(isFree(grid, idx(grid, 0.6, 7.2), 0), true, 'x=0.6 should still be inside the gate gap');
  assert.equal(isFree(grid, idx(grid, 3, 7.2), 0), false, 'x=3 at the fence line should be blocked (outside the gate gap)');
  assert.equal(isFree(grid, idx(grid, -3, 7.2), 0), false, 'x=-3 at the fence line should be blocked (outside the gate gap)');
});

test('(d) an unbuilt region stays blocked even though it already exists in area.regions', () => {
  // area.regions is static data, present from the very first frame — buildGrid must never treat
  // "the region is defined" as "the region is walkable". Build z_terrace itself but NOT
  // z_icecream/z_photo/etc: the terrace is walkable, but nothing about the region *definition*
  // itself grants access — this is the same grid, re-derived, so re-assert the base case too.
  const w = createWorld(AREA1);
  assert.equal(AREA1.regions.length, 1, 'exactly one region is authored this batch');
  assert.equal(AREA1.regions[0].id, 'terrace');
  const grid = buildGrid(AREA1, w); // fresh world: nothing built at all, including z_terrace
  assert.equal(isFree(grid, idx(grid, 0, 10), 0), false, 'an unbuilt region stays blocked even though it exists in area.regions');
  assert.equal(isFree(grid, idx(grid, 5, 12), 0), false, 'unbuilt region cells stay blocked deep inside the footprint too');
});

test('(e) days 1-12 unchanged: with only the authored 9 zones built, the grid is byte-identical to the pre-change grid', () => {
  const w = createWorld(AREA1);
  buildThrough(w, 'z_seats2'); // the authored day 1-12 chain, terrace never touched
  const grid = buildGrid(AREA1, w);

  // Reconstruct the OLD (pre-regions) grid algorithm inline, verbatim, over the same area/world,
  // and diff every interior cell (x in [-10,10], z in [-7,7]) against the new grid. `regions` must
  // never move ox/oz/w for the interior side (no region in this batch extends west or north), so
  // old and new interior cell indices must match, not just their blocked/lane VALUES.
  const CELL = 0.5;
  const halfW = AREA1.size.w / 2, halfD = AREA1.size.d / 2;
  const oxOld = -halfW - 2, ozOld = -halfD;
  const wOld = Math.ceil((AREA1.size.w + 2) / CELL);
  const hOld = Math.ceil(AREA1.size.d / CELL);
  assert.equal(grid.ox, oxOld, 'ox must not move for a batch with no west/north-extending region');
  assert.equal(grid.oz, ozOld, 'oz must not move for a batch with no west/north-extending region');
  assert.equal(grid.w, wOld, 'grid width (x-axis) must not change — no region extends past halfW/margin');

  const doorZ = AREA1.door.z;
  const wallGx = Math.round(2 / CELL);
  const boxes = [];
  for (const st of w.stations.values()) {
    if (!st.active || st.type === 'gate') continue;
    let fw = st.fw != null ? st.fw : 1, fd = st.fd != null ? st.fd : 1;
    if (Math.abs(Math.sin(st.rot || 0)) > 0.5) { const t = fw; fw = fd; fd = t; }
    boxes.push({ x: st.x, z: st.z, hw: fw / 2 + 0.25, hd: fd / 2 + 0.25 });
  }
  let compared = 0;
  for (let gz = 0; gz < hOld; gz++) {
    for (let gx = 0; gx < wOld; gx++) {
      const cxv = oxOld + (gx + 0.5) * CELL;
      const czv = ozOld + (gz + 0.5) * CELL;
      let isBlocked = false, laneVal = 0;
      for (const b of boxes) if (Math.abs(cxv - b.x) < b.hw && Math.abs(czv - b.z) < b.hd) { isBlocked = true; break; }
      if (!isBlocked) {
        if (gx === wallGx) {
          if (!(czv >= doorZ - 1.2 && czv <= doorZ + 1.2)) isBlocked = true;
        } else if (gx < wallGx) {
          if (czv >= doorZ - 1.2 && czv < doorZ) laneVal = 1;
          else if (czv >= doorZ && czv < doorZ + 1.2) laneVal = 2;
          else isBlocked = true;
        } else if (cxv > halfW || czv < -halfD || czv > halfD) {
          isBlocked = true;
        }
      }
      const i = gz * wOld + gx;
      assert.equal(grid.blocked[i], isBlocked ? 1 : 0, `blocked mismatch at gx=${gx} gz=${gz} (x=${cxv},z=${czv})`);
      assert.equal(grid.lane[i], laneVal, `lane mismatch at gx=${gx} gz=${gz} (x=${cxv},z=${czv})`);
      compared++;
    }
  }
  assert.equal(compared, wOld * hOld, 'every pre-change interior cell must have been compared');
});
