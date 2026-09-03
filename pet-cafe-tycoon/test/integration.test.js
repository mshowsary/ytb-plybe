// test/integration.test.js — sim + grid navigation integration (M3 T2/T3). Builds the full zone
// chain (M3 T3's new layout), keeps every counter continuously stocked, mans register1 (the
// owner-standing-at-the-front equivalent — see systems/stations.js), and runs a batch of
// customers through the grid mover system (src/sim/nav.js + mover.js) — no push-out, the sim
// resolves everyone's position each step. Asserts the same class of invariants the
// controller-authored full-house acceptance test (test/nav-fullhouse.test.js) checks, on a
// lighter, faster scale: everyone finishes, every seat frees up, nobody sustains a meaningful
// overlap, and nobody stalls making progress toward their current target for more than 3s.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, putOnDisplay, stepRegisters } from '../src/sim/world.js';
import { createCustomer, stepCustomers, SPECIES } from '../src/sim/customers.js';
import { overlapPenetration } from '../src/sim/mover.js';

const price = (key, seated) => seated ? 20 : 12;
const DT = 1 / 30, MINUTES = 3;

test('integration: 10 customers all reach done, every seat frees, no stalls, no overlaps', () => {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let r; do { r = payZone(w, z.id, 1e9, 1); } while (!r.done); }
  assert.equal(w.displays.length, 4); assert.equal(w.checkouts.length, 2);

  // Staggered spawn (matches the acceptance test's own spawn cadence) rather than all 10 created
  // exactly coincident at t=0: ten movers starting from the literal same point is a harsher edge
  // case than any real arrival pattern (even the 20-minute, MAXC=12 full-house run never has two
  // customers spawn closer than 1.5s apart) and isn't one of the invariants this test is meant to
  // hold to.
  const list = [];
  let seq = 1, spawnT = 0;

  const stalls = [], overlaps = new Map();
  const lastPos = new Map();

  for (let t = 0; t < MINUTES * 60; t += DT) {
    // stock every display continuously, each with its own product
    for (const id of w.displays) { const st = w.stations.get(id); putOnDisplay(w, id, st.product, st.capacity - st.stock); }

    spawnT -= DT;
    if (spawnT <= 0 && seq <= 10) {
      spawnT = 1.5;
      const variant = { shirt: seq % 5, hair: seq % 4, skin: seq % 3 };
      list.push(createCustomer(seq, SPECIES[seq % SPECIES.length], variant, AREA1));
      seq++;
    }

    w.stations.get('register1').serving = 'owner'; // M3 T3: money only flows while someone mans the register
    stepCustomers(list, w, price, DT);
    stepRegisters(w, DT);

    const movers = list.filter(c => !c.done).map(c => c.mover);
    for (const m of movers) {
      if (m.hasTarget) {
        const p = lastPos.get(m) || { x: m.x, z: m.z, t, d: Infinity };
        const d = Math.hypot(m.tx - m.x, m.tz - m.z);
        if (d < p.d - 0.02) { p.d = d; p.t = t; }
        else if (t - p.t > 3) { stalls.push({ t: +t.toFixed(1), x: +m.x.toFixed(2), z: +m.z.toFixed(2) }); p.t = t; }
        lastPos.set(m, p);
      } else lastPos.delete(m);
    }
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
      const pen = overlapPenetration(movers[i], movers[j]); const key = i * 64 + j;
      if (pen > 0.15) overlaps.set(key, (overlaps.get(key) || 0) + DT); else overlaps.delete(key);
      assert.ok((overlaps.get(key) || 0) <= 1.0, `overlap ${pen.toFixed(2)} m for >1 s at t=${t.toFixed(1)}`);
    }
  }

  assert.deepEqual(stalls, [], 'stalls > 3 s: ' + JSON.stringify(stalls.slice(0, 5)));
  assert.ok(list.every(c => c.done), 'every customer reached done: still active = ' + list.filter(c => !c.done).map(c => c.id + ':' + c.state).join(','));
  for (const st of w.stations.values()) if (st.type === 'seat') assert.equal(st.occupied, false, st.id + ' left occupied');
});
