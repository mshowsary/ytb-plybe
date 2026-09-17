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

function footprint(z) {
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
