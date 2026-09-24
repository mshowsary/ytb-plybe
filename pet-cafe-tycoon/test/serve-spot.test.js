// Every register has a spot BEHIND it to serve from, and that spot is real floor.
//
// The owner used to serve from the customer's side of the till — on the very spot the head of the
// queue stands — so the two bodies overlapped on every sale (owner playtest recordings, 2026-09-17).
// The owner now serves from st.serve, behind the till (the hired cashier keeps st.cash beside
// it, which never overlapped anyone), so this pins that every checkout's serve spot lies on a free, walkable grid cell inside the café, clear of
// the queue's first slot and of the station's own footprint, in a fully built café.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { idx, isFree } from '../src/sim/nav.js';
import { clampToArea } from '../src/sim/ownerState.js';

function builtWorld() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) { let guard = 0; while (!w.built.has(z.id) && guard++ < 1000) payZone(w, z.id, 1e9, 1); }
  return w;
}

test('every checkout has a serve spot on free floor inside the café', () => {
  const w = builtWorld();
  const bad = [];
  for (const st of w.stations.values()) {
    if (st.type !== 'checkout') continue;
    assert.ok(st.serve, st.id + ' has no serve spot');
    const cell = idx(w.grid, st.serve.x, st.serve.z);
    if (!isFree(w.grid, cell, 0)) bad.push(st.id + ': serve spot (' + st.serve.x.toFixed(2) + ',' + st.serve.z.toFixed(2) + ') is a blocked cell');
    const c = clampToArea(AREA1, w.built, st.serve.x, st.serve.z);
    if (Math.hypot(c.x - st.serve.x, c.z - st.serve.z) > 0.01) bad.push(st.id + ': serve spot is outside the walkable area');
    // Not where the guest stands: the first queue slot is 1.4 m out in front.
    const d = Math.hypot(st.serve.x - st.front.x, st.serve.z - st.front.z);
    if (d < 1.0) bad.push(st.id + ': serve spot is ' + d.toFixed(2) + ' m from the customer\'s spot');
  }
  assert.deepEqual(bad, []);
});
