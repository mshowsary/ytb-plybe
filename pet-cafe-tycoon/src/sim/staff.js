// src/sim/staff.js — pure staff simulation: runners restock counters from ovens, the cashier
// mans a register (Task 3: manned-register money flow — see world.js's stepRegisters), the
// cleaner (Task 4) will clean dirty tables. M3 T2: every walk goes through the grid
// (setTarget/stepMover) instead of straight-line moveToward + push-out.
import { STAFF, RUNNER_CARRY_LEVELS, workerSpeedMult, familyOf } from './economy.js';
import { takeFromOven, takeFromMachine, putOnDisplay, stepRegisters, cleanSeat } from './world.js';
import { createMover, setTarget, stepMover } from './mover.js';

// M3 T5: default levels (all tier 0) — every existing caller (tests, tools/bot.js) that calls
// stepStaff without a 5th `levels` arg gets EXACTLY the pre-T5 behaviour: workerSpeedMult(0) = 1,
// RUNNER_CARRY_LEVELS[0] = STAFF.runner.carry (6), cashierLevel 1, cleaner base rate unchanged.
const DEFAULT_LEVELS = { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };

// Loop v2 Task 1: a runner can be assigned to one display (assign = a display station id) — it
// then services ONLY that display, from whichever production station makes its product. `assign`
// is optional and defaults to null (unassigned — behaves as before: restocks by demand across
// every product). tools/bot.js/systems/staff.js pass 'dispCookie' for the very first runner hired.
export function createStaff(kind, spawnPos, assign = null) {
  const speed = (STAFF[kind] && STAFF[kind].speed) || 2.2;
  const mover = createMover(spawnPos.x, spawnPos.z, 0.30, speed);
  mover.kind = kind; mover.mask = 0; // staff always use ordinary floor, never a door lane
  return {
    kind, x: spawnPos.x, z: spawnPos.z, rot: 0,
    state: 'idle', items: [], target: null, timer: 0,
    assign: kind === 'runner' ? assign : null,
    spawn: { x: spawnPos.x, z: spawnPos.z },
    mover,
  };
}

// Grid-following counterpart to the old moveToward-based walk: re-plans only when the commanded
// target changes, steps the mover, mirrors position/rotation onto the plain record.
//
// Final review fix: the old `return justArrived || !m.hasTarget` had no distance check. Once a
// mover has genuinely arrived somewhere and gone idle (hasTarget false), a caller re-issuing the
// EXACT SAME (tx, tz) it was last commanded to (so `m.tx !== tx` is false and setTarget is
// skipped) — e.g. a runner re-picking the same oven as its source after having drifted off
// elsewhere in the meantime — used to read as "arrived" instantly, from wherever it physically
// was, with zero regard for actual distance (measured: a runner loaded cookies from an oven whose
// front it was 15m from). Now: an exact stepMover arrival still returns true immediately; a mover
// that's merely idle (hasTarget false) only counts as "arrived" within WAYPOINT capture range
// (0.35m, matching mover.js's own WAYPOINT_EPS) of the commanded target — otherwise it re-issues
// setTarget (a genuinely fresh plan) and reports not-yet-arrived.
function walkTo(s, tx, tz, w, dt) {
  const m = s.mover;
  if (m.tx !== tx || m.tz !== tz) setTarget(m, tx, tz, w.grid);
  const justArrived = stepMover(m, w.grid, w._movers, dt);
  s.x = m.x; s.z = m.z; s.rot = m.rot;
  if (justArrived) return true;
  if (!m.hasTarget) {
    if (Math.hypot(tx - s.x, tz - s.z) < 0.35) return true;
    setTarget(m, tx, tz, w.grid);
  }
  return false;
}

// M3 T6: find whichever product a genuinely stuck customer (state 'queue', slot 0, mood 'wait')
// is waiting on right now — same signal src/sim/botDecide.js's restockTarget already reacts to.
function wishedProduct(customers) {
  for (const c of customers || []) {
    if (c.done) continue;
    if (c.state === 'queue' && c.slot === 0 && c.mood === 'wait') return c.wish.product;
  }
  return null;
}
// Task 4: a runner's source is whichever active production station — oven, coffee machine or
// blender — currently holds the most ready stock, not just ovens.
// M3 T6: `customers`, when passed, is preferred over raw stock — a runner that only ever chases
// "whichever station has the most sitting in its buffer" will happily restock coffee/smoothie
// nobody's asking for while a cookie/cupcake customer waits, and once ALL counters fill up with
// unwanted stock there's no room left for what's actually wished (measured: three counters sitting
// at 12/12 capacity, no sales, once a runner was hired and left unattended). Falls back to the old
// highest-stock behaviour once nobody's actually stuck waiting (proactive restocking, or no
// `customers` argument at all — every pre-existing caller, e.g. test/nav-fullhouse.test.js, keeps
// its exact old behaviour since it never passes this new, optional argument).
// Loop v2 Task 1: `wantProduct`, when given (an assigned runner's own display product), restricts
// the search to that one product outright — an assigned runner never fetches anything else.
function pickSource(w, customers, wantProduct) {
  const want = wantProduct || (customers ? wishedProduct(customers) : null);
  if (want) {
    // Loop v2 Task 3: family match, not exact — a brownie-family shelf might be labelled 'brownie'
    // while oven1 itself currently reads 'cookie' (mid-batch), or vice versa; either is the right
    // source for the other.
    const wantFam = familyOf(want);
    let best = null, bestStock = 0;
    for (const st of w.stations.values()) {
      if (!st.active || !(st.stock > 0)) continue;
      if (familyOf(productOf(st)) !== wantFam) continue;
      if (st.stock > bestStock) { best = st; bestStock = st.stock; }
    }
    if (best || wantProduct) return best; // an assigned runner never falls back to a different product
  }
  let best = null, bestStock = 0;
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    if (st.type !== 'oven' && st.type !== 'coffee' && st.type !== 'blender') continue;
    if (st.stock > bestStock) { best = st; bestStock = st.stock; }
  }
  return best;
}
function productOf(st) { return st.type === 'oven' ? st.product : st.type === 'coffee' ? st.product : 'smoothie'; }
// Loop v2 Task 1: one display per product — a direct lookup replaces the old "least-loaded
// counter holding any product" pick (pickCounter). Only ever one candidate per product now.
function displayFor(w, product) {
  const fam = familyOf(product);
  for (const id of w.displays) { const st = w.stations.get(id); if (familyOf(st.product) === fam) return st; }
  return null;
}

function stepRunner(s, w, dt, carryCap, customers) {
  switch (s.state) {
    case 'idle': {
      const assigned = s.assign ? w.stations.get(s.assign) : null;
      // An assigned runner with an inactive display has nothing to do — park at spawn rather than
      // fall back to servicing something else (it services ONLY its assigned display).
      if (s.assign && (!assigned || !assigned.active)) { walkTo(s, s.spawn.x, s.spawn.z, w, dt); return; }
      if (s.items.length > 0) {
        const ct = assigned || displayFor(w, s.items[0]);
        // M3 T6: clear hasTarget before handing off to a genuinely new station — same fix
        // sim/customers.js applies on every reassignment (rebalance, register payment). Without
        // it, a mover mid-walk toward its PREVIOUS target (still hasTarget=true) gets silently
        // re-planned toward this new, unrelated one, and a stall tracker keyed on "hasTarget never
        // dropped false" reads the whole walk as zero progress against the old target's stale
        // near-zero baseline — a false stall (found by tools/bot.js once runners started chaining
        // oven/coffee/blender pickups across a much bigger map than this ever had to route before).
        if (ct && ct.active && ct.stock < ct.capacity) { s.mover.hasTarget = false; s.target = ct.id; s.state = 'toCounter'; return; }
        return; // that display's full/inactive right now — hold the batch, try again next tick
      }
      const src = pickSource(w, customers, assigned ? assigned.product : null);
      if (src) { s.mover.hasTarget = false; s.target = src.id; s.state = 'toOven'; return; }
      walkTo(s, s.spawn.x, s.spawn.z, w, dt); // nothing to do: return to spawn and idle there
      return;
    }
    case 'toOven': {
      const src = w.stations.get(s.target);
      if (!src || !src.active || src.stock <= 0) { s.state = 'idle'; return; }
      const arrived = walkTo(s, src.front.x, src.front.z, w, dt);
      // M3 T6: fallback arrival tolerance (same idea as tools/bot.js's own owner walk, scoped here
      // to just this call site rather than the shared walkTo, to keep test/nav-fullhouse.test.js's
      // tight packing/overlap timing intact elsewhere). mover.js's exact arrival (0.05m) can leave a
      // runner circling a few centimetres short forever once avoidance nudges near a busy oven keep
      // perturbing it — found by tools/bot.js's stall tracker once a runner started working genuinely
      // contested stations, not just the fixed low-traffic routes the original staff tests exercise.
      if (!arrived && s.mover.hasTarget && Math.hypot(src.front.x - s.x, src.front.z - s.z) < 0.12) s.mover.hasTarget = false;
      if (arrived || !s.mover.hasTarget) { s.state = 'loading'; s.timer = 0; }
      return;
    }
    case 'loading': {
      const src = w.stations.get(s.target);
      if (!src) { s.state = 'idle'; return; }
      const take = src.type === 'oven' ? takeFromOven : takeFromMachine;
      const key = productOf(src);
      s.timer += dt;
      while (s.timer >= 0.2 && s.items.length < carryCap && src.stock > 0) {
        s.timer -= 0.2;
        if (take(w, src.id, 1) > 0) s.items.push(key);
      }
      if (s.items.length >= carryCap || src.stock <= 0) s.state = 'idle';
      return;
    }
    case 'toCounter': {
      const ct = w.stations.get(s.target);
      if (!ct || !ct.active) { s.state = 'idle'; return; } // full/inactive: idle re-targets the next display
      const arrived = walkTo(s, ct.front.x, ct.front.z, w, dt);
      // M3 T6: same fallback tolerance as toOven above.
      if (!arrived && s.mover.hasTarget && Math.hypot(ct.front.x - s.x, ct.front.z - s.z) < 0.12) s.mover.hasTarget = false;
      if (arrived || !s.mover.hasTarget) { s.state = 'dropping'; s.timer = 0; }
      return;
    }
    case 'dropping': {
      const ct = w.stations.get(s.target);
      if (!ct) { s.state = 'idle'; s.timer = 0; return; }
      // I4: clamp the timer so a long frame (or a stall while the display was full) can never
      // dump more than one item at once; a 0-item placement (display went full) bails out to
      // 'idle' immediately instead of looping/blocking, so idle re-targets a different display
      // (or the oven) on the very next tick.
      s.timer = Math.min(s.timer + dt, 0.1);
      if (s.timer >= 0.1 && s.items.length > 0) {
        const product = s.items[0];
        const placed = putOnDisplay(w, ct.id, product, 1);
        if (placed > 0) { s.items.shift(); s.timer -= 0.1; }
        else { s.state = 'idle'; s.timer = 0; return; }
      }
      if (s.items.length === 0) s.state = 'idle';
      return;
    }
  }
}

function regQueueLen(w, id) { const arr = w._regQueues && w._regQueues.get(id); return arr ? arr.length : 0; }
// M3 T3: the cashier no longer sweeps piles on a timer — it mans a register. It walks to (and
// stays at) an active checkout's cash spot and, once arrived, sets st.serving = 'cashier' every
// frame; world.js's stepRegisters does the actual per-customer processing/pay from there (same
// as the owner standing in the register's front circle — see systems/stations.js), and resets
// serving back to '' at the end of its own pass so this needs to keep re-setting it each frame it
// stays. Re-targets if its checkout goes inactive or isn't set yet, and — once idle at its
// current register (not mid-walk, so this never thrashes) — also patrols to whichever ACTIVE
// register has a longer queue than the one it's already at: with one cashier and two+ registers,
// permanently camping the first one (found by the acceptance test: nav-fullhouse.test.js hires
// exactly one cashier against two built registers, no owner) starves the other register's queue
// completely — nobody there ever gets served, they all drain patience and leave 'lost', which
// sank throughput well under the test's floor. Comparing queue length (not, say, alternating)
// means it drifts to wherever people are actually waiting instead of oscillating.
function stepCashier(s, w, dt, cashierLevel) {
  const curValid = s.target && w.stations.get(s.target) && w.stations.get(s.target).active;
  if (!curValid) {
    s.target = w.checkouts[0] || null;
  } else if (!s.mover.hasTarget) {
    let best = s.target, bestLen = regQueueLen(w, s.target);
    for (const id of w.checkouts) {
      const st = w.stations.get(id);
      if (!st.active) continue;
      const len = regQueueLen(w, id);
      if (len > bestLen) { best = id; bestLen = len; }
    }
    s.target = best;
  }
  if (!s.target) return;
  const co = w.stations.get(s.target);
  // M3 T5: the cashier's Speed level sets the register's cashierLevel every frame it's manned —
  // world.js's stepRegisters reads st.cashierLevel back to compute the pay rate.
  if (walkTo(s, co.cash.x, co.cash.z, w, dt)) { co.serving = 'cashier'; co.cashierLevel = cashierLevel; }
}

// Task 4: level-1 cleaning rate (seconds per seat) — matches the global-constants table
// (owner 1.0s, level-1 cleaner 1.6s; see systems/stations.js for the owner's side of this).
const CLEANER_RATE = 1.6;
function pickDirtySeat(s, w) {
  let best = null, bestD = Infinity;
  for (const st of w.stations.values()) {
    if (st.type !== 'seat' || !st.active || !st.dirty) continue;
    const d = (st.front.x - s.x) ** 2 + (st.front.z - s.z) ** 2;
    if (d < bestD) { best = st; bestD = d; }
  }
  return best;
}
// Walks to the nearest dirty seat's front, cleans it in `rate` seconds (level 1 = CLEANER_RATE,
// M3 T5's Speed level shortens it — see the rate computed in stepStaff below), repeats; idles at
// spawn once nothing is dirty.
function stepCleaner(s, w, dt, rate) {
  switch (s.state) {
    case 'idle': {
      const st = pickDirtySeat(s, w);
      // M3 T6: same hasTarget clear as the runner above — a fresh dirty-seat pick is a genuinely
      // new target, not a continuation of wherever the mover was last idly walking.
      if (st) { s.mover.hasTarget = false; s.target = st.id; s.state = 'toSeat'; return; }
      walkTo(s, s.spawn.x, s.spawn.z, w, dt);
      return;
    }
    case 'toSeat': {
      const st = w.stations.get(s.target);
      if (!st || !st.active || !st.dirty) { s.state = 'idle'; return; } // someone beat us to it
      if (walkTo(s, st.front.x, st.front.z, w, dt)) { s.state = 'cleaning'; s.timer = 0; }
      return;
    }
    case 'cleaning': {
      const st = w.stations.get(s.target);
      if (!st || !st.dirty) { s.state = 'idle'; s.timer = 0; return; }
      s.timer += dt;
      if (s.timer >= rate) { cleanSeat(w, st.id); s.state = 'idle'; s.timer = 0; }
      return;
    }
  }
}

// M3 T6: `customers`, sixth and optional, lets a runner prefer whichever product a genuinely
// stuck customer is waiting on over blindly restocking whatever has the most raw stock (see
// pickSource/pickCounter above) — every existing caller that omits it (test/nav-fullhouse.test.js
// included) keeps its exact prior behaviour.
export function stepStaff(list, w, dt, onCollect, levels, customers) {
  const L = levels || DEFAULT_LEVELS;
  // Append onto the shared avoidance array stepCustomers rebuilds each step (create it if this
  // is ever called before any stepCustomers call, e.g. a staff-only test).
  //
  // Final review fix: this used to ONLY ever push, never clear, trusting stepCustomers to have
  // reset the array earlier the same tick. A caller that drives stepStaff repeatedly without ever
  // calling stepCustomers in between (a staff-only test, or a frame where customers genuinely
  // didn't run) then grows w._movers by `list.length` forever. w._custRanFlag, set by
  // stepCustomers every time it runs and consumed (cleared) here, is the signal: when it's set,
  // stepCustomers already rebuilt the array fresh this tick, so we just append onto it; when it's
  // NOT set, stepCustomers hasn't run since our own last call, so we clear it ourselves first. A
  // bare grid.frame comparison can't serve as this signal on its own — stepCustomers always
  // leaves its own bookkeeping counter equal to grid.frame once it's done, which reads identically
  // to "neither of us has touched anything in a while" from stepStaff's side; the two cases need
  // telling apart, hence the dedicated one-shot flag instead.
  if (!w._movers) w._movers = [];
  if (w._custRanFlag) { w._custRanFlag = false; } else { w._movers.length = 0; }
  for (const s of list) w._movers.push(s.mover);
  // M3 T5: a worker's Speed level (+20%/tier) rescales its mover's speed every frame — cheap
  // (list is tiny) and picks up a live upgrade purchase instantly, the same pattern
  // tools/bot.js's walkOwnerTo already uses for the player's own speed upgrade.
  const carryCap = RUNNER_CARRY_LEVELS[Math.min(RUNNER_CARRY_LEVELS.length - 1, Math.max(0, (L.runner.carry | 0)))];
  const cashierLevel = ((L.cashier.speed | 0)) + 1;
  const cleanerRate = CLEANER_RATE / (1 + 0.25 * (L.cleaner.speed | 0));
  for (const s of list) {
    s.mover.speed = (STAFF[s.kind] && STAFF[s.kind].speed || 2.2) * workerSpeedMult(L, s.kind);
    if (s.kind === 'runner') stepRunner(s, w, dt, carryCap, customers);
    else if (s.kind === 'cashier') stepCashier(s, w, dt, cashierLevel);
    else if (s.kind === 'cleaner') stepCleaner(s, w, dt, cleanerRate);
  }
  // M3 T3: stepStaff is the one sim-step function every caller (the running game, the bot, the
  // nav-fullhouse acceptance test) always calls once per tick regardless of whether any staff are
  // hired, so the manned-register cadence lives here: by this point in the frame, the owner
  // (systems/stations.js or bot.js — both run before stepCustomers/stepStaff) may have already set
  // some checkout's st.serving = 'owner', and the cashier loop just above may have set another's
  // to 'cashier'; stepRegisters reads whichever is live, processes the queue head if it's time,
  // and resets serving to '' for the next frame. Calling it here (not separately from game.js/
  // bot.js) keeps it to exactly once per tick.
  stepRegisters(w, dt);
}
