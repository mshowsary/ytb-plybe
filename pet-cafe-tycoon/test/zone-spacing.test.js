// Two plots the player can be offered at the same time must not share ground.
//
// Owner playtest, 2026-09-17: "the extended tables build sit so close to the terrace build ...
// trying to build some of them lead to spreading the coins on both". z_seats2's marker sat 0.7 m
// from z_terrace's, so one standing spot armed both plots and every payment tick split between
// them. Beyond the exclusive-arming rule in systems/zones.js, this pins the layout itself: any two
// zones that can be active together keep their build footprints apart.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { insideBuildFootprint } from '../src/sim/buildIntent.js';
import { createWorld, payZone } from '../src/sim/world.js';

// The ground a plot actually covers, exactly as systems/zones.js draws it: the shape of the station
// it builds, or the zone's own `pad` when that station has no floor footprint to stand in (the
// photo wall hangs on a wall, 0.3 m deep).
function footprint(z) {
  if (z.pad) return { fw: z.pad.w, fd: z.pad.d, rot: 0 };
  const st = AREA1.stations.find(s => s.id === z.adds[0]);
  return { fw: (st && st.fw) || 1.6, fd: (st && st.fd) || 1.6, rot: (st && st.rot) || 0 };
}
// a requires b, transitively?
function dependsOn(a, b) {
  const byId = new Map(AREA1.zones.map(z => [z.id, z]));
  let cur = a; const seen = new Set();
  while (cur && cur.requires && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.requires === b.id) return true;
    cur = byId.get(cur.requires);
  }
  return false;
}
// Can both be unbuilt-and-offered at once? Only if neither is an ancestor of the other.
const coActive = (a, b) => !dependsOn(a, b) && !dependsOn(b, a);

test('no two co-active plots overlap: a standing spot arms at most one of them', () => {
  const zones = AREA1.zones;
  const bad = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i], b = zones[j];
      if (!coActive(a, b)) continue;
      const fa = footprint(a), fb = footprint(b);
      // Sample b's footprint corners and centre against a's, and vice versa, with the same margin
      // zones.js uses. Coarse but sufficient: a real overlap always includes a corner or a centre.
      const pts = f => { const hw = f.fw / 2, hd = f.fd / 2; return [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd], [hw, 0], [-hw, 0], [0, hd], [0, -hd]]; };
      const hit = (za, fa2, zb, fb2) => pts(fb2).some(([r, f]) => {
        const s = Math.sin(fb2.rot), c = Math.cos(fb2.rot);
        const p = { x: zb.x + r * c + f * s, z: zb.z - r * s + f * c };
        return insideBuildFootprint(p, za, fa2.fw, fa2.fd, fa2.rot);
      });
      if (hit(a, fa, b, fb) || hit(b, fb, a, fa)) bad.push(`${a.id} (${a.x},${a.z}) overlaps ${b.id} (${b.x},${b.z})`);
    }
  }
  assert.deepEqual(bad, [], 'co-active plots share ground:\n  ' + bad.join('\n  '));
});

test('co-active plot centres are at least a body apart', () => {
  const zones = AREA1.zones, bad = [];
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    const a = zones[i], b = zones[j];
    if (!coActive(a, b)) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 1.6) bad.push(`${a.id} and ${b.id} are ${d.toFixed(2)} m apart`);
  }
  assert.deepEqual(bad, []);
});

// docs/SHIP-PLAN-2026-09-19.md §1.4: a build pad sits >= 1.6 m from every station's working spot —
// its front (where the owner takes, stocks, taps a button), a till's serving spot behind it and its
// cash tray — which also puts it outside every action-button radius (pantry/kiosk/desk 1.35 m,
// return 1.05 m, till 1.1 m, cash 1.2 m). Measured before this rule (onboarding playthrough):
// z_coffee's pad 0.30 m from the coffee machine loaded the owner with four coffees within ten
// seconds of buying it; z_hire's pad sat 0.10 m from the desk and raised HIRE at once; z_blender's
// raised the pantry's SUPPLIES. Tables, the gate, the fountain and a wall-mounted board have no working spot to arm.
const PAD_CLEARANCE = 1.6;
const NO_WORK_SPOT = new Set(['seat', 'gate', 'decor', 'wall']);
function allBuilt() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}
function workSpots(w) {
  const out = [];
  for (const st of w.stations.values()) {
    if (NO_WORK_SPOT.has(st.type)) continue;
    out.push({ id: `${st.id}.front`, ...st.front });
    if (st.serve) out.push({ id: `${st.id}.serve`, ...st.serve });
    if (st.cash) out.push({ id: `${st.id}.cash`, ...st.cash });
  }
  return out;
}

test('every build pad stands >= 1.6 m from every station working spot', () => {
  const w = allBuilt();
  const spots = workSpots(w);
  assert.ok(spots.some(s => s.id === 'coffee1.front') && spots.some(s => s.id === 'register1.serve') && spots.some(s => s.id === 'barIce.cash'));
  const bad = [];
  for (const z of AREA1.zones) for (const s of spots) {
    const d = Math.hypot(z.x - s.x, z.z - s.z);
    if (d < PAD_CLEARANCE) bad.push(`${z.id} (${z.x},${z.z}) is ${d.toFixed(2)} m from ${s.id}`);
  }
  assert.deepEqual(bad, [], 'pads too close to a working spot:\n  ' + bad.join('\n  '));
});

test('the owner can stand on every pad: its centre is clear of every station footprint by a body', () => {
  const R = 0.46;
  const bad = [];
  for (const z of AREA1.zones) for (const s of AREA1.stations) {
    if (s.type === 'gate' || s.type === 'wall') continue; // a doorway and a hung board are not bodies
    let fw = s.fw ?? 1, fd = s.fd ?? 1;
    if (Math.abs(Math.sin(s.rot || 0)) > 0.5) [fw, fd] = [fd, fw];
    const dx = Math.abs(z.x - s.x) - fw / 2, dz = Math.abs(z.z - s.z) - fd / 2;
    if (Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) < R) bad.push(`${z.id} is inside ${s.id}'s body`);
  }
  assert.deepEqual(bad, []);
});
