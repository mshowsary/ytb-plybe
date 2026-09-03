// test/nav-fullhouse.test.js — controller-authored acceptance test. 20 simulated minutes at full house; any jam fails.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, putOnDisplay, refreshActive } from '../src/sim/world.js';
import { buildGrid } from '../src/sim/nav.js';
import { overlapPenetration } from '../src/sim/mover.js';
import { createCustomer, stepCustomers, SPECIES } from '../src/sim/customers.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
const DT = 1 / 30, MINUTES = 20, MAXC = 12;
function buildAll(w) { for (const z of AREA1.zones) { let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1); } refreshActive(w); }
test('full house: 20 minutes, no stalls, no teleports, no overlaps, no leaked seats', () => {
  const w = createWorld(AREA1); buildAll(w); w.grid = buildGrid(AREA1, w);
  const price = (k, seated) => seated ? 8 : 5;
  const staff = [createStaff('runner', { x: 4, z: -3.5 }), createStaff('runner', { x: 0, z: -3.5 }), createStaff('cashier', { x: -5.5, z: -0.6 }), createStaff('cleaner', { x: -6, z: 4 })];
  const customers = []; let seq = 1, spawnT = 0;
  const stalls = [], overlaps = new Map(); let teleports = 0, served = 0;
  const lastPos = new Map();
  const t0 = Date.now();
  for (let t = 0; t < MINUTES * 60; t += DT) {
    // Loop v2 Task 1 edit (the ONLY permitted change in this file, per the plan): stock every
    // active display to capacity with ITS OWN product — was alternating cookie/cupcake onto
    // shared counters, which no longer exist (one dedicated display per product now).
    for (const id of w.displays) { const st = w.stations.get(id); putOnDisplay(w, id, st.product, st.capacity - st.stock); }
    for (const st of w.stations.values()) if (st.type === 'bowl' && st.active) st.stock = st.capacity;
    spawnT -= DT;
    // stop spawning 90 s before the end so the café drains (controller fix: seats occupied by legitimate eaters at the cutoff are not leaks)
    if (spawnT <= 0 && customers.length < MAXC && t < MINUTES * 60 - 90) { spawnT = 1.5; customers.push(createCustomer(seq, SPECIES[seq % SPECIES.length], { shirt: seq % 5, hair: seq % 4, skin: seq % 3 }, AREA1)); seq++; }
    stepCustomers(customers, w, price, DT); stepStaff(staff, w, DT, () => {});
    const movers = [...customers.filter(c => !c.done).map(c => c.mover), ...staff.map(s => s.mover)];
    for (const m of movers) {
      teleports += m.teleports; m.teleports = 0;
      if (m.hasTarget) { const p = lastPos.get(m) || { x: m.x, z: m.z, t: t, d: Infinity }; const d = Math.hypot(m.tx - m.x, m.tz - m.z);
        if (d < p.d - 0.02) { p.d = d; p.t = t; } else if (t - p.t > 3) { stalls.push({ t: +t.toFixed(1), x: +m.x.toFixed(2), z: +m.z.toFixed(2), tx: m.tx, tz: m.tz, kind: m.kind }); p.t = t; }
        lastPos.set(m, p); } else lastPos.delete(m);
    }
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) { const pen = overlapPenetration(movers[i], movers[j]); const key = i * 64 + j;
      if (pen > 0.15) { overlaps.set(key, (overlaps.get(key) || 0) + DT); } else overlaps.delete(key);
      assert.ok((overlaps.get(key) || 0) <= 1.0, `overlap ${pen.toFixed(2)} m for >1 s at t=${t.toFixed(1)}`); }
    for (const e of w.events) if (e.type === 'pay') served++;
    w.events.length = 0;
    for (let i = customers.length - 1; i >= 0; i--) if (customers[i].done) customers.splice(i, 1);
  }
  assert.equal(customers.length, 0, 'customers still present after the 90 s drain: ' + customers.map(c => c.state).join(','));
  for (const st of w.stations.values()) if (st.type === 'seat') assert.equal(st.occupied, false, `seat ${st.id} leaked`);
  assert.equal(teleports, 0, 'teleports happened');
  assert.deepEqual(stalls, [], 'stalls > 3 s: ' + JSON.stringify(stalls.slice(0, 5)));
  assert.ok(served > 400, 'throughput too low: ' + served);
  assert.ok(Date.now() - t0 < 25000, 'too slow: ' + (Date.now() - t0) + ' ms');
});
