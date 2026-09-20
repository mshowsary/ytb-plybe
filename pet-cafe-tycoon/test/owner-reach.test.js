// test/owner-reach.test.js — no pockets (docs/SHIP-PLAN-2026-09-19.md §1.2: "after every zone
// build a real-movement search from where the build leaves the owner reaches the café centre").
//
// The known trap: buying the photo studio (z_photo) from its old pad at (-9.0, 8.6) closed the owner
// into the terrace's west corner — photo1 behind, seat7 beside, register3 and the fence ahead, every
// gap under the 0.92 m body. The playthrough probe (real stick input from every reachable cell)
// found no way back to the café. The Ice cream garden's layout (Batch B1) removed the trap itself:
// register3 is cut, the tables moved to the fence row and the pad moved into open deck. Two things
// are pinned here: no build in the catalogue leaves the owner in a pocket (walked with the owner's
// own movement step, sim/ownerReach.js moveOwnerBody — the function systems/stations.js moves the
// player with), and the safety net that would rescue one (ownerPocketRescue, applied by
// systems/zones.js on every build) still works, on a pocket built for the purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { insideBuildFootprint } from '../src/sim/buildIntent.js';
import { OWNER_SPAWN, clampToArea } from '../src/sim/ownerState.js';
import { ownerBodyBoxes, ownerPocketRescue, ownerReachGrid, ownerPath, moveOwnerBody, OWNER_BODY_R } from '../src/sim/ownerReach.js';
import { BASE_SPEED } from '../src/sim/economyConfig.js';

function buildThrough(throughId) {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    if (z.id === throughId) break;
  }
  return w;
}
const bodyClear = (boxes, p) => boxes.every(b => {
  const dx = Math.abs(p.x - b.x) - b.hw, dz = Math.abs(p.z - b.z) - b.hd;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) >= OWNER_BODY_R - 1e-9;
});

// A pocket built for the purpose: four walls around (x, z) on open deck, their inner faces 0.8 m
// from the centre — room for the 0.46 m body to stand, no way out between them.
const POCKET = { x: -2.2, z: 12.9 };
function sealPocket(w) {
  const walls = [
    { id: 'pw', x: POCKET.x - 1.1, z: POCKET.z, fw: 0.6, fd: 2.8 },
    { id: 'pe', x: POCKET.x + 1.1, z: POCKET.z, fw: 0.6, fd: 2.8 },
    { id: 'pn', x: POCKET.x, z: POCKET.z - 1.1, fw: 2.8, fd: 0.6 },
    { id: 'ps', x: POCKET.x, z: POCKET.z + 1.1, fw: 2.8, fd: 0.6 },
  ];
  for (const s of walls) w.stations.set(s.id, { ...s, type: 'decor', rot: 0, active: true });
}

// The owner's real movement, headless: from `start`, every 8-way stick push for 0.1 s at walking
// speed, by the owner's own step (moveOwnerBody), breadth first over 0.25 m cells, until within
// 1 m of the café centre. Returns whether it got there and how many cells it explored.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
function walkHome(w, start) {
  const boxes = ownerBodyBoxes(w);
  const step = BASE_SPEED * 0.1;
  const key = p => `${Math.round(p.x * 4)},${Math.round(p.z * 4)}`;
  // The first frame digs the owner out of whatever it was standing in, exactly like the game's.
  const P0 = { x: start.x, z: start.z };
  moveOwnerBody(P0, P0.x, P0.z, boxes, AREA1, w.built);
  const seen = new Set([key(P0)]), queue = [P0];
  for (let q = 0; q < queue.length && q < 20000; q++) {
    const p = queue[q];
    if (Math.hypot(p.x - OWNER_SPAWN.x, p.z - OWNER_SPAWN.z) < 1) return { reached: true, explored: seen.size };
    for (const [dx, dz] of DIRS) {
      const n = { x: p.x, z: p.z };
      moveOwnerBody(n, p.x + dx * step, p.z + dz * step, boxes, AREA1, w.built);
      const k = key(n);
      if (seen.has(k)) continue;
      seen.add(k); queue.push(n);
    }
  }
  return { reached: false, explored: seen.size };
}

test('after every build in catalogue order, the owner walks back to the café centre from its pad', () => {
  const w = createWorld(AREA1);
  const stuck = [];
  for (const z of AREA1.zones) {
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    const r = walkHome(w, { x: z.x, z: z.z });
    if (!r.reached) stuck.push(`${z.id} from (${z.x},${z.z}): explored ${r.explored} cells`);
  }
  assert.deepEqual(stuck, [], 'a build left the owner unable to walk home:\n  ' + stuck.join('\n  '));
});

test('after every build, wherever on the pad the owner stood, there is no pocket to be rescued from', () => {
  const w = createWorld(AREA1);
  const pockets = [];
  for (const z of AREA1.zones) {
    // Every spot the build can complete from: the pad's own footprint (sim/buildIntent.js).
    const def = AREA1.stations.find(s => s.id === z.adds[0]);
    const fw = (def && def.fw) || 1.6, fd = (def && def.fd) || 1.6, rot = (def && def.rot) || 0;
    const spots = [];
    for (let x = z.x - 2; x <= z.x + 2; x += 0.25) {
      for (let q = z.z - 2; q <= z.z + 2; q += 0.25) if (insideBuildFootprint({ x, z: q }, z, fw, fd, rot)) spots.push({ x, z: q });
    }
    let guard = 0;
    while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1);
    const boxes = ownerBodyBoxes(w);
    for (const at of spots) {
      // Only an owner who is clear of every box and inside the rooms can be IN a pocket; one standing
      // inside the station that just appeared is pushed out by the next frame of movement.
      const legal = JSON.stringify(clampToArea(AREA1, w.built, at.x, at.z)) === JSON.stringify(at);
      if (!legal || !bodyClear(boxes, at)) continue;
      if (ownerPocketRescue(AREA1, w.built, boxes, at)) pockets.push(`${z.id} at (${at.x},${at.z})`);
    }
  }
  assert.deepEqual(pockets, [], 'no build may seal a clear owner in');
});

test('a sealed pocket is found, and the rescue names the nearest connected spot', () => {
  const w = buildThrough(AREA1.zones[AREA1.zones.length - 1].id);
  const open = ownerBodyBoxes(w);
  assert.ok(bodyClear(open, POCKET), 'fixture: the pocket centre is open deck before the walls go up');
  assert.equal(ownerPocketRescue(AREA1, w.built, open, POCKET), null, 'and connected to the café');
  sealPocket(w);
  const boxes = ownerBodyBoxes(w);
  assert.ok(bodyClear(boxes, POCKET), 'the owner is not inside anything — this is a pocket, not an overlap');
  assert.equal(walkHome(w, POCKET).reached, false, 'real movement cannot get out');
  const to = ownerPocketRescue(AREA1, w.built, boxes, POCKET);
  assert.ok(to, 'standing inside the walls is a pocket');
  assert.ok(bodyClear(boxes, to), `rescue spot (${to.x},${to.z}) must be clear of every box`);
  assert.deepEqual(clampToArea(AREA1, w.built, to.x, to.z), to, 'and inside the rooms the owner is clamped to');
  assert.equal(ownerPocketRescue(AREA1, w.built, boxes, to), null, 'a rescued owner is not in a pocket');
  assert.ok(walkHome(w, to).reached, 'and walks home from there');
  assert.ok(Math.hypot(to.x - POCKET.x, to.z - POCKET.z) < 3, 'the nearest connected spot, not somewhere across the café');
});

test('the pocket is genuinely sealed: none of its floor is connected to the café centre', () => {
  const w = buildThrough(AREA1.zones[AREA1.zones.length - 1].id);
  sealPocket(w);
  const boxes = ownerBodyBoxes(w);
  const g = ownerReachGrid(AREA1, w.built, boxes);
  let probed = 0;
  for (let k = 0; k < g.free.length; k++) {
    if (!g.free[k]) continue;
    const p = { x: g.ox + (k % g.w) * g.cell, z: g.oz + ((k / g.w) | 0) * g.cell };
    if (Math.hypot(p.x - POCKET.x, p.z - POCKET.z) > 0.4) continue;
    probed++;
    assert.ok(ownerPocketRescue(AREA1, w.built, boxes, p), `(${p.x},${p.z}) should be inside the pocket`);
  }
  assert.ok(probed > 0);
});

test('an owner standing clear on the café floor is never moved', () => {
  const w = buildThrough(AREA1.zones[AREA1.zones.length - 1].id);
  const boxes = ownerBodyBoxes(w);
  // (7.8, 1.4) is blender1's own standing spot in the new smoothie corner (Batch C): the fixture
  // that used to sit at (8.5, 0.5) is inside the blender's body now, which is the point.
  for (const p of [OWNER_SPAWN, { x: -6, z: 0 }, { x: -2.5, z: 8.3 }, { x: -1.8, z: 13 }, { x: 7.8, z: 1.4 }, { x: 7.5, z: 12.4 }]) {
    assert.ok(bodyClear(boxes, p), `fixture: (${p.x},${p.z}) is clear floor`);
    assert.equal(ownerPocketRescue(AREA1, w.built, boxes, p), null, `(${p.x},${p.z}) is connected floor`);
  }
});

test('the pocket check runs on every build, and the headless walk moves by the player\'s own step', () => {
  // The call path from normal play: systems/zones.js update -> payZone completes -> 'built' event
  // -> onBuilt -> freeOwnerFromPocket. And the owner's per-frame movement (systems/stations.js) is
  // moveOwnerBody against ownerBodyBoxes, so the check, the walk above and the player agree.
  const zones = fs.readFileSync(new URL('../src/systems/zones.js', import.meta.url), 'utf8');
  assert.match(zones, /for \(const e of world\.events\) if \(e\.type === 'built'\) onBuilt\(e\);/);
  assert.match(zones, /function onBuilt\(e\) \{[\s\S]*?freeOwnerFromPocket\(\);\s*\}/);
  assert.match(zones, /ownerPocketRescue\(area, world\.built, ownerBodyBoxes\(world\), P\)/);
  const stations = fs.readFileSync(new URL('../src/systems/stations.js', import.meta.url), 'utf8');
  assert.match(stations, /bodyBoxes = ownerBodyBoxes\(world\);/);
  assert.match(stations, /import \{[^}]*OWNER_BODY_R[^}]*\} from '\.\.\/sim\/ownerReach\.js';/);
  assert.doesNotMatch(stations, /const BODY_R = 0\.46/, 'no private copy of the body radius');
  assert.match(stations, /moveOwnerBody\(P, P\.x \+ P\.vx \* dt, P\.z \+ P\.vz \* dt, playerBoxes\(\), area, world\.built\)/);
});

// ---- the guidance trail (docs/SHIP-PLAN-2026-09-19.md 1.4) ----------------------------------
// systems/objective.js used to plan on the GUESTS' 0.5 m grid, sized for a 0.30 m guest against
// the sim footprints, so on the built cafe the trail walked the 0.92 m owner into gaps he cannot
// enter (the playthrough measured seat7, register3, coldPantry1 and seat12 all unreachable by
// following it). It plans on the owner's own grid now, and every point it emits has to be a place
// the owner's body actually fits.
test('the trail is planned where the owner fits, and following it arrives', () => {
  const w = buildThrough(AREA1.zones[AREA1.zones.length - 1].id);
  const boxes = ownerBodyBoxes(w);
  const grid = ownerReachGrid(AREA1, w.built, boxes);
  const spots = [];
  for (const st of w.stations.values()) {
    if (!st.active || st.type === 'gate' || st.type === 'decor' || st.type === 'wall') continue;
    const spot = st.type === 'checkout' && st.serve ? st.serve : st.front;
    if (spot) spots.push({ id: st.id, ...spot });
  }
  assert.ok(spots.length >= 20, `only ${spots.length} working spots on the built cafe`);
  const unreachable = [];
  for (const s of spots) {
    const route = ownerPath(grid, OWNER_SPAWN.x, OWNER_SPAWN.z, s.x, s.z);
    if (!route.length) { unreachable.push(`${s.id}: no trail at all`); continue; }
    for (const pt of route) {
      if (!bodyClear(boxes, pt)) { unreachable.push(`${s.id}: the trail crosses (${pt.x.toFixed(2)}, ${pt.z.toFixed(2)}), where the body does not fit`); break; }
    }
    // Walk it with the owner's own movement step, leg by leg, and check the arrival bar
    // systems/objective.js itself uses (ARRIVE_METERS 1.6).
    const P = { x: OWNER_SPAWN.x, z: OWNER_SPAWN.z, vx: 0, vz: 0 };
    const legs = [...route.slice(1), { x: s.x, z: s.z }];
    let wedged = false;
    for (const pt of legs) {
      let frames = 0;
      while (frames++ < 160) {
        const dx = pt.x - P.x, dz = pt.z - P.z, d = Math.hypot(dx, dz);
        if (d < 0.28) break;
        moveOwnerBody(P, P.x + (dx / d) * BASE_SPEED / 30, P.z + (dz / d) * BASE_SPEED / 30, boxes, AREA1, w.built);
      }
      if (frames >= 160) { wedged = true; break; }
    }
    if (wedged || Math.hypot(P.x - s.x, P.z - s.z) > 1.6) {
      unreachable.push(`${s.id}: following the trail stopped at (${P.x.toFixed(2)}, ${P.z.toFixed(2)})`);
    }
  }
  assert.deepEqual(unreachable, [], 'the trail leads somewhere the owner cannot follow: ' + unreachable.join(' | '));
});

test('the objective draws the trail from the owner grid, not the guest grid', () => {
  // The call path from normal play: objective.update -> the 'full' walkthrough branch -> ownerPath
  // on a grid built from ownerBodyBoxes. A regression to sim/nav.js's findPath would reintroduce
  // the guest-sized trail, so that import must not come back either.
  const src = fs.readFileSync(new URL('../src/systems/objective.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ ownerBodyBoxes, ownerReachGrid, ownerPath \} from '\.\.\/sim\/ownerReach\.js';/);
  assert.match(src, /ownerPath\(walkGrid\(\), G\.P\.x, G\.P\.z, stand\.x, stand\.z\)/);
  assert.match(src, /walkCells = ownerReachGrid\(world\.area, world\.built, ownerBodyBoxes\(world\)\)/);
  assert.doesNotMatch(src, /from '\.\.\/sim\/nav\.js'/, 'the trail must not be planned on the guest grid again');
});
