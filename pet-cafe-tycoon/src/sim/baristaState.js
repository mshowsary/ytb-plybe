// One simulation contract for live rendering and headless economic measurement.
import { BARISTA, baristaDecision } from './barista.js';
import { refillBeans, takeFromMachine, putOnDisplay } from './world.js';
import { setTarget, stepMover } from './mover.js';
const STATION_ARRIVE_EPS = .14, IDLE_ARRIVE_EPS = .35;
export function moveBaristaTo(s, world, point, dt) {
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

export function stepBaristaState(s, world, dt, hooks = {}) {
  const targetPoint = id => { const st=world.stations.get(id);return st?.active ? st.front : null; };
  const stop = () => { if(s){s.mover.hasTarget=false;s.mover.vx=s.mover.vz=0;} };
  const moveTo = (point, elapsed) => moveBaristaTo(s,world,point,elapsed);
  function startDecision() {
    if (!s) return;
    if (s.items.length) {
      const lane = [...world.stations.values()].find(st => st.active && st.type === 'display' && (st.product === 'coffee' || st.product === 'latte'));
      if (lane) { s.job = { kind: 'restockCoffee', targetId: lane.id, product: s.items[0], count: s.items.length }; s.state = 'toBar'; return; }
    }
    const d = baristaDecision(world); s.job = d;
    if (d.kind === 'refillBeans') s.state = 'toPantry';
    else if (d.kind === 'restockCoffee') s.state = 'toMachine';
    else { s.state = 'idle'; s.idleT = 0.25; stop(); return; }
    hooks.onJob?.(d);
  }
  function stepSim() {
    if (!s) return;
    if (s.state === 'idle') {
      s.idleT -= dt; if (s.idleT <= 0) startDecision(); return;
    }
    const j = s.job || {};
    if (s.state === 'toPantry') {
      const p = targetPoint(j.pantryId); if (!p) { s.state = 'idle'; return; }
      if (moveTo(p, dt)) { stop(); hooks.onTap?.(); s.workT = 0.35; s.state = 'fetchBeans'; }
    } else if (s.state === 'fetchBeans') {
      s.workT -= dt; if (s.workT <= 0) s.state = 'toRefill';
    } else if (s.state === 'toRefill') {
      const p = targetPoint(j.machineId); if (!p) { s.state = 'idle'; return; }
      if (moveTo(p, dt)) {
        stop(); const used = refillBeans(world, j.machineId, j.amount);
        if (used > 0) { hooks.onRefill?.(used); hooks.onTap?.(); }
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
        if (got > 0) hooks.onTap?.();
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
        s.items.shift(); hooks.onDelivery?.(key); s.workT = 0.08;
        hooks.onTap?.();
      } else {
        // Bar filled while we were walking. Keep the coffee and retry later; never throw it away.
        s.state = 'idle'; s.idleT = 0.35;
      }
      if (!s.items.length) { s.state = 'idle'; s.idleT = 0.12; }
    }
  }

  stepSim();
}
