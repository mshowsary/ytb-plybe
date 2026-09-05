// Live Barista worker: one specialized coffee-lane employee. It uses the same navigation grid and
// local avoidance as customers/staff, but remains outside the generic Runner system so it can never
// drift into bakery/smoothie work. Hiring lives in the normal Workers sheet via STAFF.barista.
import * as THREE from 'three';
import { createMover, setTarget, stepMover } from '../sim/mover.js';
import { baristaDecision, BARISTA } from '../sim/barista.js';
import { refillBeans, takeFromMachine, putOnDisplay } from '../sim/world.js';
import { createHuman } from '../render/human.js';
import { itemFor } from '../render/props.js';
import { baristaUniformMesh } from '../render/barista.js';
import { coffeeCupGeometry } from '../render/coffeePolish.js';
import { toonMaterial } from '../render/palette.js';

const VARIANT = { shirt: '#72C9B8', hair: 1, skin: 1 };
const FALLBACK_SPAWN = { x: 0.5, z: -3.3 };
// Busy station fronts can leave a mover orbiting a few centimetres outside mover.js's exact
// 0.05m arrival epsilon. Generic Runner/Cleaner paths already use a station-side fallback for
// this reason. Keep the Barista equally strict: 0.14m is still well inside the interaction/front
// spot and cannot ever turn a remote station into an instant action.
const STATION_ARRIVE_EPS = 0.14;
const IDLE_ARRIVE_EPS = 0.35;

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
  function stop() { if (s) { s.mover.hasTarget = false; s.mover.vx = 0; s.mover.vz = 0; } }
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
  function targetPoint(id) {
    const st = id && world.stations.get(id);
    return st && st.active ? st.front : null;
  }
  function moveTo(point, dt) {
    if (!point || !s) return false;
    const m = s.mover;
    // Mirror sim/staff.js's proven walkTo contract instead of re-arming an idle mover every frame.
    // Re-plan only when the commanded point actually changes. If mover.js reaches its exact epsilon,
    // honor that immediately; if local avoidance leaves us just outside it at a station front, the
    // tiny station tolerance ends the orbit. An idle mover can only count as arrived inside the
    // broader waypoint capture radius; otherwise it is explicitly re-planned from its real position.
    if (m.tx !== point.x || m.tz !== point.z) setTarget(m, point.x, point.z, world.grid);
    const movers = world._movers || [];
    movers.push(m);
    const justArrived = stepMover(m, world.grid, movers, dt);
    movers.pop();
    s.x = m.x; s.z = m.z;
    if (justArrived) return true;
    const distance = Math.hypot(point.x - s.x, point.z - s.z);
    if (distance < STATION_ARRIVE_EPS) { m.hasTarget = false; return true; }
    if (!m.hasTarget) {
      if (distance < IDLE_ARRIVE_EPS) return true;
      setTarget(m, point.x, point.z, world.grid);
    }
    return false;
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
  function startDecision() {
    if (!s) return;
    if (s.items.length) {
      const lane = [...world.stations.values()].find(st => st.active && st.type === 'display' && (st.product === 'coffee' || st.product === 'latte'));
      if (lane) { s.job = { kind: 'restockCoffee', targetId: lane.id, product: s.items[0], count: s.items.length }; s.state = 'toBar'; return; }
    }
    const d = baristaDecision(world); s.job = d;
    if (d.kind === 'refillBeans') s.state = 'toPantry';
    else if (d.kind === 'restockCoffee') s.state = 'toMachine';
    else { s.state = 'idle'; s.idleT = 0.25; stop(); }
  }
  function stepSim(dt) {
    if (!s) return;
    if (s.state === 'idle') {
      s.idleT -= dt; if (s.idleT <= 0) startDecision(); return;
    }
    const j = s.job || {};
    if (s.state === 'toPantry') {
      const p = targetPoint(j.pantryId); if (!p) { s.state = 'idle'; return; }
      if (moveTo(p, dt)) { stop(); if (human) human.tap(); s.workT = 0.35; s.state = 'fetchBeans'; }
    } else if (s.state === 'fetchBeans') {
      s.workT -= dt; if (s.workT <= 0) s.state = 'toRefill';
    } else if (s.state === 'toRefill') {
      const p = targetPoint(j.machineId); if (!p) { s.state = 'idle'; return; }
      if (moveTo(p, dt)) {
        stop(); const used = refillBeans(world, j.machineId, j.amount);
        if (used > 0) { G.stats.baristaBeanRefills = (G.stats.baristaBeanRefills | 0) + 1; if (human) human.tap(); }
        s.state = 'idle'; s.idleT = 0.18;
      }
    } else if (s.state === 'toMachine') {
      const p = targetPoint(j.sourceId); if (!p) { s.state = 'idle'; return; }
      if (moveTo(p, dt)) { stop(); s.workT = Math.max(0.18, (j.count | 0) * 0.16); s.state = 'loading'; }
    } else if (s.state === 'loading') {
      s.workT -= dt;
      if (s.workT <= 0) {
        const src = world.stations.get(j.sourceId);
        const wanted = Math.min(BARISTA.carry, j.count | 0, src ? src.stock | 0 : 0);
        const got = wanted > 0 ? takeFromMachine(world, j.sourceId, wanted) : 0;
        for (let i = 0; i < got; i++) s.items.push(j.product);
        if (got > 0 && human) human.tap();
        s.state = s.items.length ? 'toBar' : 'idle';
      }
    } else if (s.state === 'toBar') {
      const p = targetPoint(j.targetId); if (!p) { s.state = 'idle'; return; }
      if (moveTo(p, dt)) { stop(); s.workT = 0.08; s.state = 'dropping'; }
    } else if (s.state === 'dropping') {
      s.workT -= dt;
      if (s.workT > 0) return;
      const key = s.items[0];
      if (!key) { s.state = 'idle'; s.idleT = 0.12; return; }
      const put = putOnDisplay(world, j.targetId, key, 1);
      if (put > 0) {
        s.items.shift(); G.stats.baristaCupsMoved = (G.stats.baristaCupsMoved | 0) + 1; s.workT = 0.08;
        if (human) human.tap();
      } else {
        // Bar filled while we were walking. Keep the coffee and retry later; never throw it away.
        s.state = 'idle'; s.idleT = 0.35;
      }
      if (!s.items.length) { s.state = 'idle'; s.idleT = 0.12; }
    }
  }

  // Restore can replace G.staff and clear the generic staff list. Reset our external render/sim in
  // the same transaction so a saved Barista respawns exactly once from the restored count.
  const baseRestore = G.restore;
  G.restore = save => { teardown(); baseRestore(save); if (G.staff.barista == null) G.staff.barista = 0; };

  const api = {
    update(dt) {
      const wanted = (G.staff.barista | 0) > 0;
      if (!wanted) { if (s) teardown(); return; }
      if (!s) spawn();
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
    destroy() { teardown(); if (G.restore !== baseRestore) G.restore = baseRestore; },
  };
  G.baristaWorker = api;
  return api;
}
