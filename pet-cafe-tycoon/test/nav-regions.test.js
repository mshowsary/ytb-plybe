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
//   (f)-(l) the EAST axis, on a synthetic east region. The engine is data-driven for a region off
//       the east fence column (gap keyed on |z|); the Pet Spa was the only authored one and was
//       retired on 2026-09-19, so these assertions moved here from test/spa-foundation.test.js and
//       run against a fixture instead, keeping that generic code covered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refreshActive, putOnDisplay, stepRegisters } from '../src/sim/world.js';
import { createCustomer, stepCustomers } from '../src/sim/customers.js';
import { buildGrid, idx, isFree, findPath, regionEdge } from '../src/sim/nav.js';
import { clampToArea } from '../src/sim/ownerState.js';

// Builds every zone up to and including `throughId` (inclusive), in the area's own zone order —
// mirrors test/layout.test.js's buildAll but stops partway through the chain so (a)/(e) can
// observe the pre-terrace grid.
function buildThrough(w, throughId, area = AREA1) {
  for (const z of area.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    if (z.id === throughId) break;
  }
  refreshActive(w);
}

// A synthetic region off the EAST fence column, shaped like the retired spa (x 10..17.5 over the
// interior's own z span, gate gap |z| <= 2.4 at z 0), opened by a zone appended to the end of the
// real chain. No stations: these tests are about the region engine, not a layout.
const EAST = { id: 'east', x0: 10, x1: 17.5, z0: -7, z1: 7, builtBy: 'z_east', floor: 'tile', gateZ: 0, gateHalfW: 2.4 };
const EAST_AREA = {
  ...AREA1,
  regions: [...AREA1.regions, EAST],
  zones: [...AREA1.zones, { id: 'z_east', x: 9, z: 0.8, price: 1, adds: [], requires: 'z_splash', label: 'East wing' }],
};
const eastBuilt = () => { const w = createWorld(EAST_AREA); buildThrough(w, 'z_east', EAST_AREA); return w; };

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
  assert.deepEqual(AREA1.regions.map(r => r.id), ['terrace'], 'the authored regions, in order');
  const grid = buildGrid(AREA1, w); // fresh world: nothing built at all, including z_terrace
  assert.equal(isFree(grid, idx(grid, 0, 10), 0), false, 'an unbuilt region stays blocked even though it exists in area.regions');
  assert.equal(isFree(grid, idx(grid, 5, 12), 0), false, 'unbuilt region cells stay blocked deep inside the footprint too');
  // The same rule on the OTHER axis: an east region's cells exist in the array (the grid spans out
  // to its x1) but must be as solid as wall until its zone is bought.
  const ew = createWorld(EAST_AREA);
  const eg = buildGrid(EAST_AREA, ew);
  assert.equal(isFree(eg, idx(eg, 13, 0), 0), false, 'unbuilt east cells stay blocked (mid-region)');
  assert.equal(isFree(eg, idx(eg, 17, -5), 0), false, 'unbuilt east cells stay blocked (far corner)');
  assert.equal(isFree(eg, idx(eg, 10.2, 0), 0), false, 'the east fence column is solid at the gate line until the region is bought');
});

test('(e) days 1-12 unchanged: with only the authored 9 zones built, the grid is byte-identical to the pre-change grid', () => {
  const w = createWorld(AREA1);
  buildThrough(w, 'z_seats2'); // the authored day 1-12 chain, terrace never touched
  const grid = buildGrid(AREA1, w);

  // Reconstruct the OLD (pre-regions) grid algorithm inline, verbatim, over the same area/world,
  // and diff every interior cell (x in [-10,10], z in [-7,7]) against the new grid.
  //
  // "BYTE-IDENTICAL", stated exactly: ox and oz must not move (no region extends west of -halfW or
  // north of -halfD), so idx() maps every world coordinate to the same (gx, gz) it always did, and
  // every one of those cells carries the same blocked/lane value. With only the south terrace
  // authored the array is also exactly as wide as before regions existed (w 44), so the LINEAR
  // index i = gz * w + gx is identical too. An east region would widen the array and re-stride
  // that index — (h) below covers what must still hold then.
  const CELL = 0.5;
  const halfW = AREA1.size.w / 2, halfD = AREA1.size.d / 2;
  const oxOld = -halfW - 2, ozOld = -halfD;
  const wOld = Math.ceil((AREA1.size.w + 2) / CELL);
  const hOld = Math.ceil(AREA1.size.d / CELL);
  assert.equal(grid.ox, oxOld, 'ox must not move for a batch with no west-extending region');
  assert.equal(grid.oz, ozOld, 'oz must not move for a batch with no north-extending region');
  assert.equal(grid.w, wOld, 'no east region is authored, so the grid is exactly the interior + street margin wide');
  assert.equal(grid.h, Math.ceil((14 - -7) / CELL), 'grid height spans the interior and the south terrace');
  // Every OLD cell keeps its OLD coordinate: same (gx, gz), same world centre.
  for (let gz = 0; gz < hOld; gz++) {
    for (let gx = 0; gx < wOld; gx++) {
      const cxv = oxOld + (gx + 0.5) * CELL, czv = ozOld + (gz + 0.5) * CELL;
      assert.equal(idx(grid, cxv, czv), gz * grid.w + gx, `idx() moved for the cell at (${cxv},${czv})`);
    }
  }

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
      const i = gz * wOld + gx;     // same (gx, gz) AND the same linear index
      assert.equal(grid.blocked[i], isBlocked ? 1 : 0, `blocked mismatch at gx=${gx} gz=${gz} (x=${cxv},z=${czv})`);
      assert.equal(grid.lane[i], laneVal, `lane mismatch at gx=${gx} gz=${gz} (x=${cxv},z=${czv})`);
      compared++;
    }
  }
  assert.equal(compared, wOld * hOld, 'every pre-change interior cell must have been compared');
});

// ---- the EAST axis (ported from test/spa-foundation.test.js onto the synthetic region) ----------

test('(f) regionEdge derives the east axis for an east region, the south axis for the terrace, null for north/west', () => {
  assert.deepEqual(regionEdge(EAST, EAST_AREA), { axis: 'x', line: 10, gapCentre: 0, gapHalf: 2.4 },
    'an east region hangs off the fence COLUMN with its gap keyed on |z| at gateZ');
  // The terrace must still derive the other axis — one code path, two answers, no special case.
  const t = regionEdge(AREA1.regions.find(x => x.id === 'terrace'), AREA1);
  assert.equal(t.axis, 'z');
  assert.equal(t.line, 7);
  // A NORTH/WEST region is explicitly out of scope (walls, not fences) and must say so by
  // returning null rather than half-connecting itself.
  assert.equal(regionEdge({ id: 'roof', x0: -5, x1: 5, z0: -20, z1: -8 }, AREA1), null);
  assert.equal(regionEdge({ id: 'alley', x0: -25, x1: -12, z0: -5, z1: 5 }, AREA1), null);
});

test('(g) once built, a real route runs from inside the café through the east gate, whose gap is exactly |z| <= 2.4', () => {
  const w = eastBuilt();
  const grid = buildGrid(EAST_AREA, w);
  assert.equal(isFree(grid, idx(grid, 10.2, 0), 0), true, 'z=0 on the fence column is the gate');
  assert.equal(isFree(grid, idx(grid, 10.2, 1.9), 0), true, 'z=1.9 is still inside the 2.4 m gap');
  for (const z of [4, -4, 6]) assert.equal(isFree(grid, idx(grid, 10.2, z), 0), false, `z=${z} is fence, not gate`);
  const from = idx(grid, 0, 2), to = idx(grid, 14, 4);
  assert.equal(isFree(grid, to, 0), true, 'the built east region is floor');
  const out = new Int32Array(grid.w * grid.h);
  const n = findPath(grid, from, to, 0, out);
  assert.ok(n > 0, 'a pathfound route into the east region must exist');
  // It has to cross the fence COLUMN — otherwise it is a route around a boundary that is missing,
  // not a route through a gate that works.
  let crossedFence = false;
  for (let i = 0; i < n; i++) {
    const cxv = grid.ox + ((out[i] % grid.w) + 0.5) * grid.cell;
    if (cxv > 10 && cxv < 10.5) crossedFence = true;
  }
  assert.ok(crossedFence, 'the route must pass through the east fence column at the gate');
});

test('(h) extending east appends columns only: ox/oz hold, no row is added, interior cells keep (gx, gz)', () => {
  const w = eastBuilt();
  const grid = buildGrid(EAST_AREA, w);
  const CELL = 0.5;
  assert.equal(grid.ox, -12, 'ox is still -halfW - the 2 m street margin');
  assert.equal(grid.oz, -7, 'oz is still -halfD');
  assert.equal(grid.h, Math.ceil((14 - -7) / CELL), 'the east region adds no rows (its z span is the interior\'s)');
  assert.equal(grid.w, Math.ceil((17.5 - -10 + 2) / CELL), 'it adds exactly the columns out to x 17.5');
  // The linear index re-strides, but the coordinate -> (gx, gz) mapping does not move, and every
  // interior cell keeps its walkability: compare against the same world without the east region.
  const base = buildGrid(AREA1, w);
  for (let x = -9.75; x < 10; x += 0.5) {
    for (let z = -6.75; z < 7; z += 0.5) {
      const a = idx(grid, x, z), b = idx(base, x, z);
      assert.equal(a % grid.w, b % base.w, `gx moved at (${x},${z})`);
      assert.equal((a / grid.w) | 0, (b / base.w) | 0, `gz moved at (${x},${z})`);
      assert.equal(grid.blocked[a], base.blocked[b], `walkability changed at (${x},${z})`);
    }
  }
});

test('(i) the south gate still works with an east region present, and the dead corner past both fences stays solid', () => {
  const w = eastBuilt();
  const grid = buildGrid(EAST_AREA, w);
  assert.equal(isFree(grid, idx(grid, 0, 7.2), 0), true, 'the terrace gate must still be open');
  assert.equal(isFree(grid, idx(grid, 6, 7.2), 0), false, 'the terrace fence row must still be a fence');
  for (const [x, z] of [[12, 9], [16, 12], [11, 8]]) {
    assert.equal(isFree(grid, idx(grid, x, z), 0), false, `the dead corner (${x},${z}) belongs to no region`);
  }
});

test('(j) the owner clamp follows the L of interior + terrace + east region, not its bounding box', () => {
  const built = new Set(['z_terrace', 'z_east']);
  // Inside each real space: untouched.
  for (const [x, z] of [[0, 0], [8, 6], [14, 0], [16, -5], [0, 11]]) {
    const p = clampToArea(EAST_AREA, built, x, z);
    assert.equal(p.x, x, `(${x},${z}) is legal floor and must not move`);
    assert.equal(p.z, z, `(${x},${z}) is legal floor and must not move`);
  }
  // The dead south-east corner: inside the union BOX, inside no actual floor.
  const dead = clampToArea(EAST_AREA, built, 14, 11);
  assert.ok(!(dead.x === 14 && dead.z === 11), 'the owner must not be left standing in the dead corner');
  assert.ok(dead.z <= 6.5 + 1e-9 || dead.x <= 9.5 + 1e-9, 'the clamp must return the owner to real floor');
  // With nothing built the clamp is exactly the interior rectangle.
  assert.equal(clampToArea(EAST_AREA, new Set(), 14, 0).x, 9.5, 'region unbuilt: clamp to the interior');
});

test('(l) an ordinary guest never takes a seat inside a second region, even when it is the only free seat', () => {
  // sim/customers.js seatFor: an interior guest skips a seat inside ANY region, not merely the
  // terrace. One east-region table, active, clean and free, is the only seat that exists here.
  const area = {
    ...EAST_AREA,
    stations: [...EAST_AREA.stations, { id: 'eastSeat', type: 'seat', x: 13.4, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_east' }],
  };
  const w = createWorld(area, { built: ['z_east'] }, 23);
  putOnDisplay(w, 'dispCookie', 'cookie', 5);
  const c = createCustomer(1, 'cat', 0, area);
  const price = (k, seated) => (seated ? 999 : 5);
  for (let i = 0; i < 30 * 60 && !c.done; i++) {
    w.stations.get('register1').serving = 'owner';
    stepCustomers([c], w, price, 1 / 30);
    stepRegisters(w, 1 / 30);
    w.events.length = 0;
  }
  assert.equal(c.done, true);
  assert.equal(c.seatId, null, 'the only free seat is in another region, so the guest is never seated');
  assert.equal(w.stations.get('eastSeat').occupied, false);
});

test('(k) the shipped catalogue authors no east region: the east fence is solid with every zone built', () => {
  const w = createWorld(AREA1);
  buildThrough(w, AREA1.zones[AREA1.zones.length - 1].id);
  const grid = buildGrid(AREA1, w);
  assert.equal(grid.w, Math.ceil((AREA1.size.w + 2) / 0.5), 'nothing widens the grid east of the café');
  assert.equal(grid.ox + grid.w * grid.cell, AREA1.size.w / 2, 'the grid ends at the east fence line: no cell lies beyond it');
  assert.equal(clampToArea(AREA1, w.built, 14, 0).x, 9.5, 'the owner cannot leave through the east side');
  assert.equal(clampToArea(AREA1, w.built, 14, 11).x <= 9.5, true, 'nor through the corner past the terrace');
});
