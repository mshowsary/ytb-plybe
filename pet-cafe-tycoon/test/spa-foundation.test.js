// test/spa-foundation.test.js — Batch 4b, the Pet Spa foundation (plan 3.9 / 7.1).
//
// The spa is the first region that is NOT south. Everything here exists to prove one of three
// claims:
//   ENGINE   the regions engine is axis-generic — a fence COLUMN with a gap on |z| works exactly
//            like the terrace's fence ROW with a gap on |x|, and a third region is data.
//   LAYOUT   every front, queue slot and seat spot the spa authors lands on a free grid cell, the
//            gate lane is genuinely clear, and no two queue slots crowd each other. Batch 1 lost
//            pathfinding to a décor piece 0.67 m from a gate and pinned runners on a queue slot
//            0.1 m from its own front; both were arithmetic nobody re-derived.
//   INDICES  extending EAST appends columns and moves nothing: ox/oz hold, every interior cell
//            keeps its (gx, gz) and its walkability. (test/nav-regions.test.js (e) proves the
//            values cell by cell; this file proves the shape and the spa's own side of it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, refreshActive } from '../src/sim/world.js';
import { buildGrid, idx, isFree, findPath, regionEdge } from '../src/sim/nav.js';
import { clampToArea } from '../src/sim/ownerState.js';
import { pawRatingState, pawZoneInCatalogue } from '../src/sim/pawRating.js';
import { PRODUCTS, STAFF, CONTENT_ZONE_PRICE } from '../src/sim/economyConfig.js';

const CELL = 0.5;
const SPA_ZONES = ['z_spa', 'z_groom', 'z_bath', 'z_boutique', 'z_photographer'];
const SPA_STATIONS = ['gate2', 'spaSeat1', 'spaSeat2', 'spaSeat3', 'planters', 'groom1', 'bath1', 'waterTank1', 'boutique1', 'photoDesk1'];
const spa = () => AREA1.regions.find(r => r.id === 'spa');
// Stations that take a line. groom1/bath1 want photo1's queue, but src/sim/world.js createWorld
// only grows st.queue for display/checkout/photo and world.js is not this task's file (see
// wiringNeeded). So their slots are re-derived here from world.js's OWN inline geometry — 5 slots
// at 1.4 + i*0.85 m forward of the station centre, queueRight 0 — and checked now, so the wiring
// lands on ground that is already proven rather than on arithmetic nobody re-ran.
const QUEUED_TYPES = new Set(['display', 'checkout', 'photo', 'groom', 'bath']);
function queuedSlots(st) {
  if (st.queue) return st.queue;
  if (!QUEUED_TYPES.has(st.type)) return [];
  const rot = st.rot || 0, s = Math.sin(rot), c = Math.cos(rot);
  return Array.from({ length: 5 }, (_, i) => {
    const forward = 1.4 + i * 0.85;
    return { x: st.x + forward * s, z: st.z + forward * c };
  });
}

// Builds every zone in AREA1.zones' own order up to and including `throughId`.
function buildThrough(w, throughId) {
  for (const z of AREA1.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    if (z.id === throughId) break;
  }
  refreshActive(w);
}
const builtSpa = () => { const w = createWorld(AREA1); buildThrough(w, 'z_photographer'); return w; };

// ---- ENGINE -------------------------------------------------------------------------------------

test('the spa is authored exactly as the plan specifies it, and regionEdge derives the east axis', () => {
  const r = spa();
  assert.ok(r, 'data/area1.js must author a region with id "spa"');
  assert.deepEqual(
    { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, builtBy: r.builtBy, floor: r.floor },
    { x0: 10, x1: 17.5, z0: -7, z1: 7, builtBy: 'z_spa', floor: 'tile' });
  const e = regionEdge(r, AREA1);
  assert.deepEqual(e, { axis: 'x', line: 10, gapCentre: 0, gapHalf: 2.4 },
    'the spa hangs off the EAST fence column with its gap keyed on |z| at z = 0');
  // The terrace must still derive the other axis — one code path, two answers, no special case.
  const t = regionEdge(AREA1.regions.find(x => x.id === 'terrace'), AREA1);
  assert.equal(t.axis, 'z');
  assert.equal(t.line, 7);
  // A hypothetical NORTH/WEST region is explicitly out of scope (walls, not fences) and must say so
  // by returning null rather than half-connecting itself.
  assert.equal(regionEdge({ id: 'roof', x0: -5, x1: 5, z0: -20, z1: -8 }, AREA1), null);
  assert.equal(regionEdge({ id: 'alley', x0: -25, x1: -12, z0: -5, z1: 5 }, AREA1), null);
});

test('before z_spa the whole east fence column is solid, gate line included', () => {
  const w = createWorld(AREA1);
  buildThrough(w, 'z_splash'); // everything up to and including the whole terrace chain
  const grid = buildGrid(AREA1, w);
  for (let z = -6.5; z <= 6.5 + 1e-9; z += 0.5) {
    assert.equal(isFree(grid, idx(grid, 10.2, z), 0), false, `east fence at z=${z.toFixed(1)} should be blocked pre-spa`);
  }
  for (const [x, z] of [[11, 0], [13, 3], [17, -6], [16, 6]]) {
    assert.equal(isFree(grid, idx(grid, x, z), 0), false, `unbuilt spa cell (${x},${z}) should be blocked`);
  }
});

test('after z_spa a real route runs from inside the café, through gate2, to a spa lounge seat', () => {
  const w = builtSpa();
  const grid = buildGrid(AREA1, w);
  const seat = w.stations.get('spaSeat1');
  assert.equal(seat.active, true);
  const from = idx(grid, 0, 2);                              // well inside the café
  const to = idx(grid, seat.pair.human.x, seat.pair.human.z); // where a guest actually sits
  assert.equal(isFree(grid, to, 0), true, 'spaSeat1 human spot must be walkable');
  const out = new Int32Array(grid.w * grid.h);
  const n = findPath(grid, from, to, 0, out);
  assert.ok(n > 0, 'a pathfound route into the spa must exist');
  // It has to cross the fence COLUMN — otherwise this is a route around a boundary that is missing,
  // not a route through a gate that works.
  let crossedFence = false;
  for (let i = 0; i < n; i++) {
    const cxv = grid.ox + ((out[i] % grid.w) + 0.5) * grid.cell;
    if (cxv > 10 && cxv < 10.5) crossedFence = true;
  }
  assert.ok(crossedFence, 'the route must pass through the east fence column at the gate');
});

test('the spa gate gap is exactly |z| <= 2.4 — the rest of the column stays a fence', () => {
  const w = builtSpa();
  const grid = buildGrid(AREA1, w);
  assert.equal(isFree(grid, idx(grid, 10.2, 0), 0), true, 'z=0 on the fence column is the gate');
  assert.equal(isFree(grid, idx(grid, 10.2, 1.9), 0), true, 'z=1.9 is still inside the 2.4 m gap');
  assert.equal(isFree(grid, idx(grid, 10.2, 4), 0), false, 'z=4 is fence, not gate');
  assert.equal(isFree(grid, idx(grid, 10.2, -4), 0), false, 'z=-4 is fence, not gate');
  assert.equal(isFree(grid, idx(grid, 10.2, 6), 0), false, 'z=6 is fence, not gate');
});

test('the south gate still works with an east region present (one engine, two gates)', () => {
  const w = builtSpa();
  const grid = buildGrid(AREA1, w);
  assert.equal(isFree(grid, idx(grid, 0, 7.2), 0), true, 'the terrace gate must still be open');
  assert.equal(isFree(grid, idx(grid, 6, 7.2), 0), false, 'the terrace fence row must still be a fence');
  // The dead corner past BOTH fences (south-east of the café) belongs to no region and must stay
  // solid even with every zone in the game bought.
  for (const [x, z] of [[12, 9], [16, 12], [11, 8]]) {
    assert.equal(isFree(grid, idx(grid, x, z), 0), false, `the dead corner (${x},${z}) belongs to no region`);
  }
});

// ---- INDICES ------------------------------------------------------------------------------------

test('extending east appends columns only: ox/oz hold and no row is added', () => {
  const w = builtSpa();
  const grid = buildGrid(AREA1, w);
  assert.equal(grid.ox, -12, 'ox is still -halfW - the 2 m street margin');
  assert.equal(grid.oz, -7, 'oz is still -halfD');
  assert.equal(grid.h, Math.ceil((14 - -7) / CELL), 'the spa adds no rows (its z span is the interior\'s)');
  assert.equal(grid.w, Math.ceil((17.5 - -10 + 2) / CELL), 'the spa adds exactly the columns out to x 17.5');
  // Every cell the spa introduced is EAST of the old east wall — nothing was inserted before the
  // interior's own columns, which is what keeps (gx, gz) stable for every pre-existing coordinate.
  const oldW = Math.ceil((AREA1.size.w + 2) / CELL);
  for (const st of SPA_STATIONS.map(id => w.stations.get(id))) {
    const gx = Math.floor((st.x - grid.ox) / CELL);
    assert.ok(gx >= oldW - 1, `${st.id} sits at column ${gx}, which is not in the appended range`);
  }
});

// ---- LAYOUT -------------------------------------------------------------------------------------

test('every spa station front, queue slot and seat spot lies on a free grid cell', () => {
  const w = builtSpa();
  const grid = buildGrid(AREA1, w);
  for (const id of SPA_STATIONS) {
    const st = w.stations.get(id);
    assert.ok(st, `${id} must exist`);
    assert.equal(st.active, true, `${id} must be active once its zone is built`);
    assert.ok(isFree(grid, idx(grid, st.front.x, st.front.z), 0), `${id} front (${st.front.x},${st.front.z}) is blocked`);
    // groom1/bath1 want photo1's queue, but world.js createWorld only grows st.queue for
    // display/checkout/photo and world.js is not this task's file (see wiringNeeded). So the slots
    // are derived here from data/area1.js's own queueSlots() helper — the SAME geometry world.js
    // inlines — and checked now, so the wiring lands on ground that is already proven.
    for (const [i, p] of queuedSlots(st).entries()) {
      assert.ok(isFree(grid, idx(grid, p.x, p.z), 0), `${id} queue slot ${i} at (${p.x},${p.z}) is blocked`);
    }
    if (st.pair) {
      assert.ok(isFree(grid, idx(grid, st.pair.human.x, st.pair.human.z), 0), `${id} human spot is blocked`);
      assert.ok(isFree(grid, idx(grid, st.pair.pet.x, st.pair.pet.z), 0), `${id} pet spot is blocked`);
    }
  }
});

test('the gate lane and its 1 m halo are clear of every spa footprint', () => {
  // The lane is the gap through gate2 (|z| <= 2.4) and the approach behind it; the halo is 1 m of
  // clearance around that rectangle. Nothing's NAV-expanded footprint may enter it, or the spa
  // repeats Batch 1's décor-beside-the-gate deadlock.
  const w = builtSpa();
  for (const id of SPA_STATIONS) {
    const st = w.stations.get(id);
    if (st.type === 'gate') continue;   // the gate marker is the lane, and blocks nothing
    let fw = st.fw != null ? st.fw : 1, fd = st.fd != null ? st.fd : 1;
    if (Math.abs(Math.sin(st.rot || 0)) > 0.5) { const t = fw; fw = fd; fd = t; }
    const hw = fw / 2 + 0.25, hd = fd / 2 + 0.25;
    const overlapsX = st.x - hw < 13.4 && st.x + hw > 10;
    const overlapsZ = Math.abs(st.z) - hd < 3.4;
    assert.ok(!(overlapsX && overlapsZ),
      `${id} at (${st.x},${st.z}) intrudes on the gate lane + 1 m halo (x 10..13.4, |z| <= 3.4)`);
  }
  // And the lane really is walkable end to end once built.
  const grid = buildGrid(AREA1, w);
  for (let x = 10.2; x <= 13.4; x += 0.5) {
    assert.ok(isFree(grid, idx(grid, x, 0), 0), `the gate lane is blocked at x=${x.toFixed(1)}`);
  }
});

test('no two spa queue slots (or a slot and another station front) crowd each other', () => {
  // >= 0.6 m apart, the separation Batch 1's display queue (0.1 m from its own front) failed and
  // spent months pinning runners on.
  const w = builtSpa();
  const points = [];
  for (const id of SPA_STATIONS) {
    const st = w.stations.get(id);
    queuedSlots(st).forEach((p, i) => points.push({ label: `${id}.queue[${i}]`, ...p }));
    points.push({ label: `${id}.front`, x: st.front.x, z: st.front.z });
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      // Points belonging to the SAME station's own queue are authored 0.85 m apart by
      // world.js's queue geometry; its own front is deliberately the head of that line, so skip
      // the front-vs-its-own-slot pair only.
      const a = points[i], b = points[j];
      const sameStation = a.label.split('.')[0] === b.label.split('.')[0];
      if (sameStation && (a.label.endsWith('.front') || b.label.endsWith('.front'))) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d >= 0.6, `${a.label} and ${b.label} are only ${d.toFixed(2)} m apart`);
    }
  }
});

test('no spa station footprint overlaps another', () => {
  const w = builtSpa();
  const box = st => {
    let fw = st.fw != null ? st.fw : 1, fd = st.fd != null ? st.fd : 1;
    if (Math.abs(Math.sin(st.rot || 0)) > 0.5) { const t = fw; fw = fd; fd = t; }
    return { x: st.x, z: st.z, hw: fw / 2, hd: fd / 2 };
  };
  const list = SPA_STATIONS.filter(id => w.stations.get(id).type !== 'gate').map(id => ({ id, ...box(w.stations.get(id)) }));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const clash = Math.abs(a.x - b.x) < a.hw + b.hw - 1e-9 && Math.abs(a.z - b.z) < a.hd + b.hd - 1e-9;
    assert.ok(!clash, `${a.id} and ${b.id} footprints overlap`);
  }
});

test('every spa station stands inside the spa region', () => {
  const r = spa();
  for (const id of SPA_STATIONS) {
    const st = AREA1.stations.find(s => s.id === id);
    assert.ok(st.x >= r.x0 && st.x <= r.x1 && st.z >= r.z0 && st.z <= r.z1, `${id} is outside the spa rectangle`);
  }
});

// ---- CATALOGUE ----------------------------------------------------------------------------------

test('the spa chain is linear, appended after the terrace chain, and every add names a real station', () => {
  const ids = AREA1.zones.map(z => z.id);
  assert.deepEqual(ids.slice(-5), SPA_ZONES, 'the spa chain is appended, in order, after the terrace chain');
  const zones = new Map(AREA1.zones.map(z => [z.id, z]));
  assert.equal(zones.get('z_spa').requires, 'z_splash', 'the spa opens off the end of the terrace chain');
  for (let i = 1; i < SPA_ZONES.length; i++) {
    assert.equal(zones.get(SPA_ZONES[i]).requires, SPA_ZONES[i - 1], `${SPA_ZONES[i]} must require ${SPA_ZONES[i - 1]}`);
  }
  assert.deepEqual(zones.get('z_spa').adds, ['gate2', 'spaSeat1', 'spaSeat2', 'spaSeat3', 'planters']);
  assert.deepEqual(zones.get('z_groom').adds, ['groom1']);
  assert.deepEqual(zones.get('z_bath').adds, ['bath1', 'waterTank1']);
  assert.deepEqual(zones.get('z_boutique').adds, ['boutique1']);
  assert.deepEqual(zones.get('z_photographer').adds, ['photoDesk1']);
  const stationIds = new Set(AREA1.stations.map(s => s.id));
  for (const id of SPA_ZONES) for (const add of zones.get(id).adds) assert.ok(stationIds.has(add), `${id} adds unknown station ${add}`);
  // NO STAR GATE. Deliberate (see the chain's own comment in data/area1.js): pawRating's ★4 row
  // already requires z_spa BUILT, so the space -> star link exists from the rating's side, and a
  // star gate on the zone as well would make it unbuyable by tools/bot.js, which cannot model ★2+.
  for (const id of SPA_ZONES) {
    const z = zones.get(id);
    assert.equal(z.star, undefined, `${id} must not carry a star gate`);
    assert.equal(z.requiresStar, undefined, `${id} must not carry a star gate`);
  }
  // Placeholder prices, but they still have to be "big content" to the bot's save policy.
  for (const id of SPA_ZONES) assert.ok(zones.get(id).price >= CONTENT_ZONE_PRICE, `${id} must price above CONTENT_ZONE_PRICE`);
});

test('adding z_spa turns pawRating r4.spa from a skipped row into a real one', () => {
  const rowFor = area => {
    const state = pawRatingState({ area, meta: { pawBest: 3 }, built: [] });
    return state.requirements.find(rq => rq.id === 'r4.spa');
  };
  // A catalogue WITHOUT the spa — exactly the pre-Batch-4b world pawRating was written to survive.
  const without = { ...AREA1, zones: AREA1.zones.filter(z => !SPA_ZONES.includes(z.id)) };
  assert.equal(pawZoneInCatalogue('z_spa', without), false);
  assert.equal(rowFor(without).skipped, true, 'absent content must be skipped (and met, so ★4 stays reachable)');
  assert.equal(rowFor(without).met, true);

  assert.equal(pawZoneInCatalogue('z_spa', AREA1), true);
  const now = rowFor(AREA1);
  assert.equal(now.skipped, false, 'z_spa now exists, so the ★4 row is real and drawn');
  assert.equal(now.met, false, 'and unmet until the zone is actually built');
  assert.equal(now.zoneId, 'z_spa');

  const built = pawRatingState({ area: AREA1, meta: { pawBest: 3 }, built: ['z_spa'] });
  assert.equal(built.requirements.find(rq => rq.id === 'r4.spa').met, true, 'building it satisfies the row');
});

test('the spa chain is REGIONAL, so ★2 "every interior zone" is unchanged by it', () => {
  const state = pawRatingState({ area: AREA1, meta: { pawBest: 1 }, built: [] });
  const row = state.requirements.find(rq => rq.id === 'r2.interior');
  assert.equal(row.target, 9, 'the nine original interior zones, and only those');
});

test('economyConfig carries the spa services and the Photographer role', () => {
  assert.equal(PRODUCTS.groom.price, 75);
  assert.equal(PRODUCTS.bath.price, 85);
  // Plan 3.9: spa guests pay 60-90 at register3.
  for (const k of ['groom', 'bath']) {
    assert.ok(PRODUCTS[k].price >= 60 && PRODUCTS[k].price <= 90, `${k} must price inside the plan's 60-90 band`);
    assert.equal(PRODUCTS[k].bake, undefined, `${k} is a service, not a baked good`);
    assert.equal(PRODUCTS[k].make, undefined, `${k} is a service, not a machine output`);
  }
  assert.deepEqual(STAFF.photographer, { costs: [3200, 7000], speed: 2.2 });
});

// ---- OWNER --------------------------------------------------------------------------------------

test('the owner clamp follows the L, not its bounding box', () => {
  const built = new Set(['z_terrace', 'z_spa']);
  // Inside each real space: untouched.
  for (const [x, z] of [[0, 0], [8, 6], [14, 0], [16, -5], [0, 11]]) {
    const p = clampToArea(AREA1, built, x, z);
    assert.equal(p.x, x, `(${x},${z}) is legal floor and must not move`);
    assert.equal(p.z, z, `(${x},${z}) is legal floor and must not move`);
  }
  // The dead south-east corner: inside the union BOX (x <= 17, z <= 13.5), inside no actual floor.
  const dead = clampToArea(AREA1, built, 14, 11);
  assert.ok(!(dead.x === 14 && dead.z === 11), 'the owner must not be left standing in the dead corner');
  assert.ok(dead.z <= 6.5 + 1e-9 || dead.x <= 9.5 + 1e-9, 'the clamp must return the owner to real floor');
  // With nothing built the clamp is exactly the old interior rectangle.
  const none = clampToArea(AREA1, new Set(), 14, 0);
  assert.equal(none.x, 9.5, 'no spa built: clamp to the interior as before');
});
