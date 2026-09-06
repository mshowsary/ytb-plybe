// Live Barista worker: one specialized coffee-lane employee. It uses the same navigation grid and
// local avoidance as customers/staff, but remains outside the generic Runner system so it can never
// drift into bakery/smoothie work. Hiring lives in the normal Workers sheet via STAFF.barista.
import * as THREE from 'three';
import { createMover } from '../sim/mover.js';
import { BARISTA } from '../sim/barista.js';
import { stepBaristaState } from '../sim/baristaState.js';
import { createHuman } from '../render/human.js';
import { itemFor } from '../render/props.js';
import { baristaUniformMesh } from '../render/barista.js';
import { coffeeCupGeometry } from '../render/coffeePolish.js';
import { toonMaterial } from '../render/palette.js';

const VARIANT = { shirt: '#72C9B8', hair: 1, skin: 1 };
const FALLBACK_SPAWN = { x: 0.5, z: -3.3 };

function carriedDrinkMesh(key) {
  if (key === 'coffee' || key === 'latte') {
    const m = new THREE.Mesh(coffeeCupGeometry(key === 'latte'), toonMaterial());
    m.userData.product = key; m.castShadow = false; m.receiveShadow = true;
    return m;
  }
  return itemFor(key);
}

export function createBaristaWorker(G, scene) {
  if (!G || !G.world || !scene) return { update() {}, destroy() {}, get active() { return false; } };
  if (G.staff.barista == null) G.staff.barista = 0;
  const world = G.world;
  let s = null, human = null, uniform = null, itemMeshes = [], px = 0, pz = 0;

  function laneSpawn() {
    const coffee = [...world.stations.values()].find(st => st.active && st.type === 'coffee');
    return coffee ? coffee.front : FALLBACK_SPAWN;
  }
  function spawn() {
    if (s) return;
    const p = laneSpawn();
    const mover = createMover(p.x, p.z, 0.30, BARISTA.speed); mover.kind = 'barista';
    s = { mover, x: p.x, z: p.z, state: 'idle', job: null, items: [], workT: 0, idleT: 0 };
    // Use the neutral customer silhouette, then layer the authored café apron/visor over it. This
    // avoids inheriting the Runner's chef cap, so the two jobs are readable at a glance.
    human = createHuman(VARIANT, 'customer');
    uniform = baristaUniformMesh(); human.group.add(uniform);
    human.group.position.set(p.x, 0, p.z); scene.add(human.group);
    px = p.x; pz = p.z;
  }
  function teardown() {
    if (human) scene.remove(human.group);
    if (human) for (const m of itemMeshes) human.stack.remove(m);
    if (human && uniform) human.group.remove(uniform);
    s = null; human = null; uniform = null; itemMeshes = [];
  }
  function syncCarryRender() {
    if (!s || !human) return;
    while (itemMeshes.length < s.items.length) {
      const key = s.items[itemMeshes.length]; const m = carriedDrinkMesh(key);
      m.position.set(0, itemMeshes.length * 0.17, 0); human.stack.add(m); itemMeshes.push(m);
    }
    while (itemMeshes.length > s.items.length) { const m = itemMeshes.pop(); human.stack.remove(m); }
    human.setCarry(itemMeshes.length);
  }
  const simulationHooks = {
    onTap: () => human?.tap(),
    onRefill: () => { G.stats.baristaBeanRefills = (G.stats.baristaBeanRefills | 0) + 1; },
    onDelivery: () => { G.stats.baristaCupsMoved = (G.stats.baristaCupsMoved | 0) + 1; },
  };
  function stepSim(dt) { stepBaristaState(s, world, dt, simulationHooks); }

  // Restore can replace G.staff and clear the generic staff list. Reset our external render/sim in
  // the same transaction so a saved Barista respawns exactly once from the restored count.
  const baseRestore = G.restore;
  const wrappedRestore = save => { const ok = baseRestore(save); if (ok === false) return false; teardown(); if (G.staff.barista == null) G.staff.barista = 0; return ok; };
  G.restore = wrappedRestore;

  const api = {
    prepare() {
      const wanted = (G.staff.barista | 0) > 0;
      if (!wanted) { if (s) teardown(); return; }
      if (!s) spawn();
      return s;
    },
    update(dt) {
      api.prepare();
      stepSim(dt);
      if (!s || !human) return;
      syncCarryRender();
      const safe = Math.max(dt, 1e-4), vx = (s.x - px) / safe, vz = (s.z - pz) / safe;
      human.group.position.set(s.x, 0, s.z); human.update(dt, vx, vz); px = s.x; pz = s.z;
    },
    get active() { return !!s; },
    get state() { return s && s.state; },
    // Read-only diagnostics used by the browser acceptance gate. Keeping this on the worker API
    // avoids leaking mutable sim records while still making navigation regressions actionable.
    get debug() {
      if (!s) return null;
      const m = s.mover;
      return {
        x:s.x, z:s.z, state:s.state, job:s.job && { ...s.job }, items:[...s.items],
        mover:{ x:m.x, z:m.z, tx:m.tx, tz:m.tz, hasTarget:m.hasTarget, n:m.n, k:m.k, blockedT:m.blockedT, replans:m.replans, teleports:m.teleports },
      };
    },
    destroy() { teardown(); if (G.restore === wrappedRestore) G.restore = baseRestore; },
  };
  G.baristaWorker = api;
  return api;
}
