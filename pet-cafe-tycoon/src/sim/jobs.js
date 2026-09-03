// src/sim/jobs.js — pure pending-job detection, shared by the objective arrow (Task 5) and the
// bot (tools/bot.js). Reads world stations + a G-shaped state carrying { coins, customers }.
import { activeZones } from './world.js';

export function pendingJobs(w, G) {
  const customers = (G && G.customers) || [];
  let registerWaiting = 0, emptyDisplayWithWaiting = 0;
  for (const c of customers) {
    if (c.done) continue;
    if (c.state === 'atRegister') {
      const st = w.stations.get(c.registerId);
      if (st && st.serving === '') registerWaiting++;
    } else if (c.state === 'queue' && c.slot === 0 && c.mood === 'wait') {
      emptyDisplayWithWaiting++;
    }
  }
  const coins = (G && G.coins) || 0;
  let buildAffordable = false;
  for (const z of w.activeZoneList || activeZones(w)) {
    const remaining = z.price - (w.partial[z.id] || 0);
    if (remaining <= coins) { buildAffordable = true; break; }
  }
  // Task 4: dirty tables (dirty seats), empty sacks (a coffee machine out of beans, or an active
  // bowl out of kibble) and ripe bushes (stage 3), each counted across active stations only.
  let dirtyTables = 0, sacksEmpty = 0, ripeBushes = 0;
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'seat' && st.dirty) dirtyTables++;
    else if (st.type === 'coffee' && st.beans === 0) sacksEmpty++;
    else if (st.type === 'bowl' && st.stock === 0) sacksEmpty++;
    else if (st.type === 'bush' && st.stage === 3) ripeBushes++;
  }
  const next = registerWaiting > 0 ? 'register'
    : emptyDisplayWithWaiting > 0 ? 'restock'
    : sacksEmpty > 0 ? 'refill'
    : dirtyTables > 0 ? 'clean'
    : ripeBushes > 0 ? 'harvest'
    : buildAffordable ? 'build' : null;
  return { registerWaiting, emptyDisplayWithWaiting, dirtyTables, sacksEmpty, ripeBushes, buildAffordable, next };
}

// M3 T5: the objective arrow's target chooser — same priority order as pendingJobs' `next`, one
// concrete station/zone position per kind. Pure and side-effect-free (reads w/G only), so the
// render-side system (src/systems/objective.js) just calls this at most 4x/second and points a
// chevron at whatever it returns.
function pickRegisterTarget(w) {
  // "the manned-empty register with the longest queue": among active, unmanned checkouts with at
  // least one customer genuinely waiting on it, the one with the most people in its register queue.
  let best = null, bestLen = -1;
  for (const id of w.checkouts) {
    const st = w.stations.get(id);
    if (!st.active || st.serving !== '') continue;
    const arr = w._regQueues && w._regQueues.get(id);
    const waiting = arr ? arr.filter(c => c.state === 'atRegister' && !c.paid).length : 0;
    if (waiting > 0 && waiting > bestLen) { bestLen = waiting; best = st; }
  }
  return best;
}
function pickRestockTarget(w, customers) {
  for (const c of customers) {
    if (c.done) continue;
    if (c.state === 'queue' && c.slot === 0 && c.mood === 'wait') {
      const st = w.stations.get(c.counterId);
      if (st) return st;
    }
  }
  return null;
}
function pickRefillTarget(w) {
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'coffee' && st.beans === 0) return st;
    if (st.type === 'bowl' && st.stock === 0) return st;
  }
  return null;
}
function pickCleanTarget(w, ref) {
  let best = null, bestD = Infinity;
  for (const st of w.stations.values()) {
    if (st.type !== 'seat' || !st.active || !st.dirty) continue;
    const d = (st.x - ref.x) ** 2 + (st.z - ref.z) ** 2;
    if (d < bestD) { bestD = d; best = st; }
  }
  return best;
}
function pickHarvestTarget(w) {
  for (const st of w.stations.values()) if (st.type === 'bush' && st.active && st.stage === 3) return st;
  return null;
}
function pickBuildTarget(w, coins) {
  let best = null, bestRemaining = Infinity;
  for (const z of w.activeZoneList || activeZones(w)) {
    const remaining = z.price - (w.partial[z.id] || 0);
    if (remaining <= coins && remaining < bestRemaining) { bestRemaining = remaining; best = z; }
  }
  return best;
}
export function jobTarget(w, G) {
  const j = pendingJobs(w, G);
  if (!j.next) return null;
  const ref = (G && G.P) || { x: 0, z: 0 };
  const customers = (G && G.customers) || [];
  const coins = (G && G.coins) || 0;
  let st = null;
  if (j.next === 'register') st = pickRegisterTarget(w);
  else if (j.next === 'restock') st = pickRestockTarget(w, customers);
  else if (j.next === 'refill') st = pickRefillTarget(w);
  else if (j.next === 'clean') st = pickCleanTarget(w, ref);
  else if (j.next === 'harvest') st = pickHarvestTarget(w);
  else if (j.next === 'build') st = pickBuildTarget(w, coins);
  return st ? { x: st.x, z: st.z, kind: j.next } : null;
}

// M3 T6 pass 2 (controller ruling): the ORIGINAL busy() — >= 2 of the 6 pending-job categories
// non-zero, including "a zone is affordable" — measured 0.947 of minutes 1-10 in pass 1, because
// buildAffordable is true for almost the entire run (coins keep accumulating toward the next
// zone) and stacks with whatever else is pending. Kept exactly as-is and re-exported under its
// original name for tools/bot.js to report as `pendingIndex` (informational only, no target).
export function busy(w, G) {
  const j = pendingJobs(w, G);
  let n = 0;
  if (j.registerWaiting > 0) n++;
  if (j.emptyDisplayWithWaiting > 0) n++;
  if (j.dirtyTables > 0) n++;
  if (j.sacksEmpty > 0) n++;
  if (j.ripeBushes > 0) n++;
  if (j.buildAffordable) n++;
  return n >= 2;
}

// M3 T6 pass 2 (controller ruling): busyIndex redefinition — count only URGENT categories: a
// register with someone waiting unserved, a display sitting empty while a customer waits for it,
// and any customer (in ANY state — counter queue, bowl, or register, wherever patience is
// tracked) whose patience has dropped under 4s, i.e. about to walk out angry. `buildAffordable`
// and the maintenance chores (dirty tables, empty sacks, ripe bushes) are deliberately excluded —
// none of those mean a customer is at risk of leaving right now, which is what "busy" should mean
// for the target's purpose (0.4-0.7: genuinely pressed, not permanently pinned near 1.0 just
// because a zone is always affordable).
export function urgentJobs(w, G) {
  const customers = (G && G.customers) || [];
  let registerWaiting = 0, emptyDisplayWithWaiting = 0, lowPatience = 0;
  for (const c of customers) {
    if (c.done) continue;
    if (c.state === 'atRegister') {
      const st = w.stations.get(c.registerId);
      if (st && st.serving === '') registerWaiting++;
    } else if (c.state === 'queue' && c.slot === 0 && c.mood === 'wait') {
      emptyDisplayWithWaiting++;
    }
    if (typeof c.patience === 'number' && c.mood === 'wait' && c.patience < 4) lowPatience++;
  }
  return { registerWaiting, emptyDisplayWithWaiting, lowPatience };
}
export function urgent(w, G) {
  const u = urgentJobs(w, G);
  return u.registerWaiting > 0 || u.emptyDisplayWithWaiting > 0 || u.lowPatience > 0;
}
