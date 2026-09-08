// src/sim/staff.js — pure staff simulation: runners restock counters from ovens, the cashier
// mans a register (Task 3: manned-register money flow — see world.js's stepRegisters), the
// cleaner (Task 4) will clean dirty tables. M3 T2: every walk goes through the grid
// (setTarget/stepMover) instead of straight-line moveToward + push-out.
import { STAFF, RUNNER_CARRY_LEVELS, workerSpeedMult, familyOf } from './economy.js';
import { takeFromOven, takeFromMachine, putOnDisplay, stepRegisters, cleanSeat, beginCleanSeat, resolvePhotoShot } from './world.js';
import { createMover, setTarget, stepMover } from './mover.js';
// Task 0.5: emitWorld for the runnerStuck watchdog event; nav's grid readers so a wait spot is
// only ever chosen on a cell the runner can actually stand on.
import { emitWorld } from './events.js';
import { idx, isFree } from './nav.js';

// M3 T5: default levels (all tier 0) — every existing caller (tests, tools/bot.js) that calls
// stepStaff without a 5th `levels` arg gets EXACTLY the pre-T5 behaviour: workerSpeedMult(0) = 1,
// RUNNER_CARRY_LEVELS[0] = STAFF.runner.carry (6), cashierLevel 1, cleaner base rate unchanged.
const DEFAULT_LEVELS = { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };

// Loop v2 Task 1: a runner can be assigned to one display (assign = a display station id) — it
// then services ONLY that display, from whichever production station makes its product. `assign`
// is optional and defaults to null (unassigned — behaves as before: restocks by demand across
// every product). tools/bot.js/systems/staff.js pass 'dispCookie' for the very first runner hired.
// Task 0.5: a stable, creation-ordered id so the runnerStuck watchdog event below names WHICH
// worker got rescued. Deterministic (module-level counter, same shape as mover.js's own _id) —
// tools/bot.js replays the sim and must see identical ids for identical input.
let _nextStaffId = 1;
export function createStaff(kind, spawnPos, assign = null) {
  const speed = (STAFF[kind] && STAFF[kind].speed) || 2.2;
  const mover = createMover(spawnPos.x, spawnPos.z, 0.30, speed);
  mover.kind = kind; mover.mask = 0; // staff always use ordinary floor, never a door lane
  return {
    id: kind + ':' + (_nextStaffId++),
    kind, x: spawnPos.x, z: spawnPos.z, rot: 0,
    state: 'idle', items: [], target: null, timer: 0,
    assign: kind === 'runner' ? assign : null,
    spawn: { x: spawnPos.x, z: spawnPos.z },
    mover,
    // Task 0.5 bookkeeping: srcId is where the batch in hand came from (so 'unload' can give it
    // back), holdT the watchdog clock, waitWalkT/waitParked the wait-spot approach state.
    srcId: null, holdT: 0, waitWalkT: 0, waitParked: false,
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
// Task 0.5 (plan section 6.1): the ONLY station types a runner may fetch from. The want-branch
// below used to walk every station in the world, and productOf() reports anything that is not an
// oven or a coffee machine as 'smoothie' — so a stocked barSmoothie display (or even bowl1) could
// be picked as the "source" for a smoothie wish and then drained straight back onto itself.
// C6 (Batch 1 plan 3.1/7.2): 'icecream' mirrors 'coffee' exactly (cream instead of beans, same
// buffer/timer/stock shape — see world.js's stepMachines), so it slots into the runner's existing
// machine-source ranking for free.
const SOURCE_TYPES = { oven: 1, coffee: 1, blender: 1, icecream: 1 };
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
// Task 0.5: pickSource used to rank purely by st.stock — "whichever station has the most sitting
// in its buffer wins" — with no regard for whether the matching DISPLAY had anywhere to put it.
// That is the first half of the reported bug: a runner loads a full batch of cookies for a shelf
// already sitting at 8/8, then has nowhere to go with them. Ranking is now by DISPLAY NEED
// (capacity - stock; 0 when there is no active display for that family, or it is already full),
// tie-broken by source stock, and a source whose display need is 0 is skipped outright.
function pickSource(w, customers, wantProduct, assigned) {
  // An assigned runner skips its source entirely while its OWN display is full — fetching a batch
  // it provably cannot deliver is exactly what stranded it in front of the shelf.
  if (assigned && (!assigned.active || assigned.stock >= assigned.capacity)) return null;
  const want = wantProduct || (customers ? wishedProduct(customers) : null);
  // M3 T6's wished-product preference, kept intact but now gated on that wish's display having
  // room: when it has not, fall through to the need ranking below (restock something that CAN be
  // delivered) instead of fetching into a full shelf.
  if (want && displayNeed(w, want) > 0) {
    // Loop v2 Task 3: family match, not exact — a brownie-family shelf might be labelled 'brownie'
    // while oven1 itself currently reads 'cookie' (mid-batch), or vice versa; either is the right
    // source for the other.
    const wantFam = familyOf(want);
    let best = null, bestStock = 0;
    for (const st of w.stations.values()) {
      if (!st.active || !SOURCE_TYPES[st.type] || !(st.stock > 0)) continue;
      if (familyOf(productOf(st)) !== wantFam) continue;
      if (st.stock > bestStock) { best = st; bestStock = st.stock; }
    }
    if (best) return best;
  }
  if (wantProduct) return null; // an assigned runner never falls back to a different product
  let best = null, bestNeed = 0, bestStock = 0;
  for (const st of w.stations.values()) {
    if (!st.active || !SOURCE_TYPES[st.type] || !(st.stock > 0)) continue;
    const need = displayNeed(w, productOf(st));
    if (need <= 0) continue; // its display is full (or gone): fetching from here achieves nothing
    if (need > bestNeed || (need === bestNeed && st.stock > bestStock)) { best = st; bestNeed = need; bestStock = st.stock; }
  }
  return best;
}
// C6: an icecream machine reports its own live product (icecream/sundae, same alternating-recipe
// idea as oven1/coffee1's altProduct) rather than falling through to the blender's fixed 'smoothie'
// label — st.product is already correct for it (world.js createWorld), same as oven/coffee.
function productOf(st) { return st.type === 'oven' ? st.product : st.type === 'coffee' ? st.product : st.type === 'icecream' ? st.product : 'smoothie'; }
// Loop v2 Task 1: one display per product — a direct lookup replaces the old "least-loaded
// counter holding any product" pick (pickCounter). Only ever one candidate per product now.
function displayFor(w, product) {
  const fam = familyOf(product);
  for (const id of w.displays) { const st = w.stations.get(id); if (familyOf(st.product) === fam) return st; }
  return null;
}
// Task 0.5 — the number everything below ranks and decides on: how much room a product's display
// actually has right now. 0 when there is no active display for its family, or it is already full.
// Raw source stock says how much there is to fetch; this says whether fetching it can ever land.
function displayNeed(w, product) {
  const ct = displayFor(w, product);
  if (!ct || !ct.active) return 0;
  return Math.max(0, ct.capacity - ct.stock);
}
// The display the batch currently in hand belongs to: an assigned runner's own display, otherwise
// the family-matching one.
function holdDisplay(w, s) {
  if (s.assign) return w.stations.get(s.assign) || null;
  return s.items.length ? displayFor(w, s.items[0]) : null;
}
// Same (right, forward) convention as sim/world.js's own rotateOffset (rot = atan2(dx, dz), so
// rot 0 faces +z). Duplicated here rather than imported because world.js keeps it private.
function rotateOffset(rot, right, forward) {
  const sn = Math.sin(rot), cs = Math.cos(rot);
  return { x: right * cs + forward * sn, z: -right * sn + forward * cs };
}
// Task 0.5 — BESIDE the display, not in front of it: ct.front offset WAIT_SIDE along the station's
// local +x. Mirrored to -x when that cell is not walkable (barSmoothie sits close to the east
// wall), falling back to ct.front itself if neither side is free. Standing in the front circle is
// what reads from the camera as "the runner is stacking cookies in front of the display".
function waitSpot(w, ct) {
  for (const side of [WAIT_SIDE, -WAIT_SIDE]) {
    const o = rotateOffset(ct.rot || 0, side, 0);
    const p = { x: ct.front.x + o.x, z: ct.front.z + o.z };
    if (!w.grid || isFree(w.grid, idx(w.grid, p.x, p.z), 0)) return p;
  }
  return { x: ct.front.x, z: ct.front.z };
}
// Where a batch goes back to: the station it came from, when that is still a live source for the
// same family with room in its buffer, else the emptiest matching production station — and null
// when NO same-family source has room.
//
// Review fix (Group C1): the tail used to be `best || (usable(remembered) ? remembered : null)`.
// Reaching that tail means every candidate failed `stock < buffer` — the remembered station
// included, since its own early-return above already tested exactly that — so it handed back a
// source that is FULL. The runner then walked the whole way to it only for 'unload' to find
// `src.stock >= src.buffer`, drop straight to 'idle' still holding the batch, and bounce back to
// the display: a guaranteed-to-fail round trip, which is precisely the pointless traversal plan
// section 6.1 exists to remove. Returning null instead lets each caller take its documented
// fallback — 'waiting' keeps waiting beside the display, 'idle' parks at spawn.
function unloadSource(w, s) {
  if (!s.items.length) return null;
  const fam = familyOf(s.items[0]);
  const usable = st => !!st && st.active && !!SOURCE_TYPES[st.type] && familyOf(productOf(st)) === fam;
  const remembered = s.srcId ? w.stations.get(s.srcId) : null;
  if (usable(remembered) && remembered.stock < remembered.buffer) return remembered;
  let best = null;
  for (const st of w.stations.values()) {
    if (!usable(st) || !(st.stock < st.buffer)) continue;
    if (!best || st.stock < best.stock) best = st;
  }
  return best; // no same-family source has room: null, never a full station to walk to for nothing
}
// Entering the wait: clear hasTarget and do NOT walk this tick — the same discipline every other
// retarget in this file follows (see the long comment inside 'idle' below for why a mover that
// keeps hasTarget across a station change reads as a stall to tools/bot.js).
function enterWaiting(s, ct) {
  s.mover.hasTarget = false; s.target = ct.id; s.state = 'waiting';
  s.timer = 0; s.waitWalkT = 0; s.waitParked = false;
}

// Task 0.5 tuning. WAIT_SECONDS/WAIT_SIDE come straight from plan section 6.1 ("a wait spot beside
// the display, ct.front offset 0.9 m along the station's local +x ... after 4 s still full ->
// unload"); HOLD_LIMIT is its watchdog threshold. WAIT_WALK_MAX is a safety valve of this
// implementation's own: it must stay BELOW tools/bot.js's 3 s stall window and mover.js's 4 s
// TELEPORT_AT, so a wait spot that avoidance or a mid-shift rebuild made unreachable can never
// turn into a reported stall or a teleport — the runner just parks where it stands instead.
const WAIT_SECONDS = 4;
const WAIT_SIDE = 0.9;
const WAIT_WALK_MAX = 2.0;
const HOLD_LIMIT = 6;

// Invariant D investigation (runner watchdog): the fallback below used to be a bare 0.12m, sized
// for a merely-jittery arrival (M3 T6's "a busy oven keep perturbing it"). It is too tight for a
// genuinely CONTESTED arrival: world.js seats a display's queue slot 0 only 0.1m further out than
// the display's own front (queue starts 1.4m from the station, front 1.3m — see world.js's station
// init), well inside the 0.6m two r=0.30 movers need to fully separate, so a customer parked at the
// head of the queue pins an incoming delivery's mover.js avoidance in a stable equilibrium around
// 0.15-0.2m from ct.front — short of the old 0.12m fallback, short of mover.js's own 0.05m arrival
// epsilon, and inside a 'toCounter'/'toOven'/'unload' state staff.js's own busy exemption (just
// above) never treats as stuck, so the runner is left oscillating there indefinitely (reproduced:
// mover.blockedT climbing and REPLAN_AT firing repeatedly with no net progress) while tools/bot.js's
// independent invariant-D clock keeps ticking. This is the exact failure mover.js's own WAYPOINT_EPS
// comment already names for intermediate waypoints ("0.12m makes a mover orbit a shared waypoint
// forever ... avoidance nudges it just far enough to miss the capture radius") — 0.3m is that same
// fix, reused here for this file's own PER-CALL-SITE arrival fallback rather than mover.js's shared
// one. Measured on tools/bot.js's full 40-day run: invariant D 24 -> 22 violations, runnerStuck
// 443 -> 441, with days 1-7 of the ledger byte-identical (no runner exists yet that early). It does
// not zero out invariant D — the remaining violations are long, uninterrupted, correctly-executing
// deliveries on the café's widest production-to-display span (blender1 <-> barSmoothie), not a
// state-machine defect; see the handoff notes for that measurement.
const ARRIVE_FALLBACK_EPS = 0.3;

function stepRunner(s, w, dt, carryCap, customers) {
  // Task 0.5 watchdog. Counts only time spent holding a batch OUTSIDE the load -> deliver pipeline
  // ('loading' is still filling the batch; 'toCounter'/'dropping' are actively delivering it), so a
  // legitimate 16-item batch walking the length of the café never trips it, while anything else
  // still holding a deliverable batch after HOLD_LIMIT seconds — with its display genuinely
  // showing free capacity — is stuck by definition and gets force-routed at that display.
  // hasTarget is cleared and the switch skipped for this tick, the same "clear before retargeting"
  // discipline every other transition in this file uses.
  const busy = s.state === 'toCounter' || s.state === 'dropping' || s.state === 'loading';
  if (s.items.length > 0 && !busy) {
    s.holdT = (s.holdT || 0) + dt;
    const ct = holdDisplay(w, s);
    if (s.holdT > HOLD_LIMIT && ct && ct.active && ct.stock < ct.capacity) {
      s.holdT = 0; s.mover.hasTarget = false; s.target = ct.id; s.state = 'toCounter'; s.timer = 0;
      emitWorld(w, { type: 'runnerStuck', id: s.id, displayId: ct.id, items: s.items.length });
      return;
    }
  } else s.holdT = 0;
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
        // Task 0.5: this used to be a bare `return` — "that display's full/inactive right now,
        // hold the batch, try again next tick" — which froze the runner wherever it happened to be
        // standing, in practice oven1's front, which sits directly behind dispCupcake from the
        // camera. That IS the reported bug. A live-but-full display now gets a wait beside it
        // (which converts back to a delivery the instant a customer buys something); a display
        // that is gone entirely means the batch goes straight back to a production station.
        if (ct && ct.active) { enterWaiting(s, ct); return; }
        const back = unloadSource(w, s);
        if (back) { s.mover.hasTarget = false; s.target = back.id; s.state = 'unload'; s.timer = 0; return; }
        // Nowhere to deliver AND nowhere to hand it back (no active display and no active source
        // for this family at all): wait at spawn, out of the walkways, rather than in a doorway.
        walkTo(s, s.spawn.x, s.spawn.z, w, dt);
        return;
      }
      const src = pickSource(w, customers, assigned ? assigned.product : null, assigned);
      if (src) { s.mover.hasTarget = false; s.target = src.id; s.state = 'toOven'; return; }
      walkTo(s, s.spawn.x, s.spawn.z, w, dt); // nothing to do: return to spawn and idle there
      return;
    }
    // Task 0.5 — waiting beside a full display. Walks to the wait spot once, then stands: no
    // per-frame retargeting, and no walk at all once parked, so a mover sitting out a full shelf
    // reads as hasTarget=false (idle) to the stall trackers rather than as a mover that is
    // permanently failing to reach something.
    case 'waiting': {
      const ct = w.stations.get(s.target);
      if (!ct || !ct.active || s.items.length === 0) { s.state = 'idle'; s.timer = 0; return; }
      // Room appeared (a customer bought something): deliver it after all.
      if (ct.stock < ct.capacity) { s.mover.hasTarget = false; s.state = 'toCounter'; s.timer = 0; return; }
      s.timer += dt;
      if (!s.waitParked) {
        const spot = waitSpot(w, ct);
        const arrived = walkTo(s, spot.x, spot.z, w, dt);
        if (arrived || Math.hypot(spot.x - s.x, spot.z - s.z) < 0.45) { s.mover.hasTarget = false; s.waitParked = true; }
        else {
          s.waitWalkT += dt;
          if (s.waitWalkT >= WAIT_WALK_MAX) { s.mover.hasTarget = false; s.waitParked = true; }
        }
      }
      if (s.timer >= WAIT_SECONDS) {
        const back = unloadSource(w, s);
        if (back) { s.mover.hasTarget = false; s.target = back.id; s.state = 'unload'; s.timer = 0; return; }
        s.timer = 0; // nothing will take the batch back: keep waiting beside the display
      }
      return;
    }
    // Task 0.5 — giving the batch back. Walks to the source and returns the items at the same
    // cadence 'loading' took them, bounded by that station's own buffer (never past it: that would
    // mint stock the ovens never baked).
    case 'unload': {
      if (s.items.length === 0) { s.state = 'idle'; s.timer = 0; return; }
      const ct = holdDisplay(w, s);
      if (ct && ct.active && ct.stock < ct.capacity) { s.mover.hasTarget = false; s.target = ct.id; s.state = 'toCounter'; s.timer = 0; return; }
      const src = w.stations.get(s.target);
      if (!src || !src.active || !SOURCE_TYPES[src.type]) { s.state = 'idle'; s.timer = 0; return; }
      const arrived = walkTo(s, src.front.x, src.front.z, w, dt);
      // M3 T6: same fallback arrival tolerance as toOven/toCounter below (see ARRIVE_FALLBACK_EPS).
      if (!arrived && s.mover.hasTarget && Math.hypot(src.front.x - s.x, src.front.z - s.z) < ARRIVE_FALLBACK_EPS) s.mover.hasTarget = false;
      if (!(arrived || !s.mover.hasTarget)) return;
      s.timer += dt;
      while (s.timer >= 0.2 && s.items.length > 0 && src.stock < src.buffer) { s.timer -= 0.2; src.stock++; s.items.pop(); }
      if (s.items.length === 0 || src.stock >= src.buffer) { s.state = 'idle'; s.timer = 0; }
      return;
    }
    case 'toOven': {
      const src = w.stations.get(s.target);
      if (!src || !src.active || src.stock <= 0) { s.state = 'idle'; return; }
      const arrived = walkTo(s, src.front.x, src.front.z, w, dt);
      // M3 T6: fallback arrival tolerance (same idea as tools/bot.js's own owner walk, scoped here
      // to just this call site rather than the shared walkTo, to keep test/nav-fullhouse.test.js's
      // tight packing/overlap timing intact elsewhere). mover.js's exact arrival (0.05m) can leave a
      // runner circling short forever once avoidance near a contested spot keeps perturbing it —
      // see ARRIVE_FALLBACK_EPS above for the invariant-D investigation that widened this margin.
      if (!arrived && s.mover.hasTarget && Math.hypot(src.front.x - s.x, src.front.z - s.z) < ARRIVE_FALLBACK_EPS) s.mover.hasTarget = false;
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
        // Task 0.5: remember the source so 'unload' can put an undeliverable batch back exactly
        // where it came from instead of guessing.
        if (take(w, src.id, 1) > 0) { s.items.push(key); s.srcId = src.id; }
      }
      if (s.items.length >= carryCap || src.stock <= 0) s.state = 'idle';
      return;
    }
    case 'toCounter': {
      const ct = w.stations.get(s.target);
      if (!ct || !ct.active) { s.state = 'idle'; return; } // inactive: idle re-targets the next display
      // Task 0.5: it filled up while we were walking. Peel off to the wait spot beside it NOW,
      // rather than finishing the walk into its front circle and idling there in the camera's way.
      if (s.items.length > 0 && ct.stock >= ct.capacity) { enterWaiting(s, ct); return; }
      const arrived = walkTo(s, ct.front.x, ct.front.z, w, dt);
      // M3 T6: same fallback tolerance as toOven above (see ARRIVE_FALLBACK_EPS) — this is the call
      // site that actually meets a queued customer at ct.front, so it is the one the invariant-D
      // investigation's widened margin matters most for.
      if (!arrived && s.mover.hasTarget && Math.hypot(ct.front.x - s.x, ct.front.z - s.z) < ARRIVE_FALLBACK_EPS) s.mover.hasTarget = false;
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
// See stepCashier's own comment (Batch 1 fix) for why these exist.
const CASHIER_MIN_DWELL = 3;
const CASHIER_SWITCH_MARGIN = 1;
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
// C3 (Batch 1 plan 1.4): with 2+ cashiers on payroll, homing each one to a distinct register BY
// INDEX replaces the patrol-to-longest-queue rule below. That rule ranks purely by raw queue
// length, which (measured) keeps favouring whichever register is naturally busiest — register1,
// right off the door — even once a second cashier exists, so both end up crowding it instead of
// the second one covering the terrace's register3. `idx`/`total` are this cashier's position among
// every cashier in the roster and how many there are, computed fresh each tick by stepStaff below
// (list order is stable — hire order — so idx is too). Homed to w.checkouts[min(idx, len-1)]:
// w.checkouts is already in stable definition order (refreshActive iterates the stations Map,
// itself insertion-ordered from data/area1.js — register1, register2, register3), so cashier #2
// (idx 1) lands on register3 whenever register2 isn't active yet (this batch's own scenario) or on
// register2 once it is; the min() clamp means a cashier hired before its own home register exists
// still mans SOME active register rather than idling. total <= 1 (the untouched single-cashier
// case — see nav-fullhouse.test.js, which hires exactly one against two built registers) falls
// through unchanged to the exact patrol logic that test depends on.
function stepCashier(s, w, dt, cashierLevel, idx = 0, total = 1) {
  if (total >= 2) {
    if (!w.checkouts.length) return;
    const home = w.checkouts[Math.min(idx, w.checkouts.length - 1)];
    s.target = home;
    const co = w.stations.get(home);
    if (walkTo(s, co.cash.x, co.cash.z, w, dt)) { co.serving = 'cashier'; co.cashierLevel = cashierLevel; }
    return;
  }
  const curValid = s.target && w.stations.get(s.target) && w.stations.get(s.target).active;
  if (!curValid) {
    s.target = w.checkouts[0] || null;
    s._dwellT = 0;
  } else if (!s.mover.hasTarget) {
    // Batch 1 fix: the terrace's register3 is FAR from register1/2 (across the gate, ~10m+), not
    // the few adjacent metres register1/register2 sit apart — so re-evaluating "whichever active
    // register has a longer queue" on every single idle tick (the original rule, still exactly
    // right for two nearby registers) now means a genuinely long, wasted walk every time the
    // comparison flips by even one customer. Measured: with register3 live, this thrashed the
    // single cashier back and forth so much that served throughput collapsed under nav-
    // fullhouse.test.js's own floor. Two guards, both no-ops for the original two-close-registers
    // case this rule was built for (curLen 0 there switches on the very first customer exactly as
    // before — see the untouched acceptance test): once genuinely working a register (curLen > 0),
    // a candidate must beat it by CASHIER_SWITCH_MARGIN, not just by one, and the cashier must have
    // held its post for CASHIER_MIN_DWELL seconds — so a momentary blip elsewhere never pulls it
    // off a register it is actively clearing.
    const curLen = regQueueLen(w, s.target);
    s._dwellT = (s._dwellT || 0) + dt;
    if (curLen === 0 || s._dwellT >= CASHIER_MIN_DWELL) {
      const margin = curLen === 0 ? 0 : CASHIER_SWITCH_MARGIN;
      let best = s.target, bestLen = curLen;
      for (const id of w.checkouts) {
        const st = w.stations.get(id);
        if (!st.active) continue;
        const len = regQueueLen(w, id);
        if (len > bestLen + margin) { best = id; bestLen = len; }
      }
      if (best !== s.target) { s.target = best; s._dwellT = 0; }
    }
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
// C5 (Batch 1 plan 3.1/1.5): fixed duration for the restroom tidy chore — literal per the plan
// ("works 2.2s"), not scaled by the cleaner's Speed level the way CLEANER_RATE is for seats.
const RESTROOM_CLEAN_SECONDS = 2.2;
function pickDirtySeat(s, w) {
  let best = null, bestD = Infinity;
  for (const st of w.stations.values()) {
    if (st.type !== 'seat' || !st.active || !st.dirty) continue;
    const d = (st.front.x - s.x) ** 2 + (st.front.z - s.z) ** 2;
    if (d < bestD) { best = st; bestD = d; }
  }
  return best;
}
// C4/C5: the one active restroom station (wc1 in the shipped layout), or null — same shape as
// pickDirtySeat's "nothing found" contract.
function activeRestroom(w) {
  for (const st of w.stations.values()) if (st.type === 'restroom' && st.active) return st;
  return null;
}
// Walks to the nearest dirty seat's front, cleans it in `rate` seconds (level 1 = CLEANER_RATE,
// M3 T5's Speed level shortens it — see the rate computed in stepStaff below), repeats; idles at
// spawn once nothing is dirty.
// C5: when nothing is dirty and wc1 is active with tidy < 1, the cleaner tidies it instead of
// idling at spawn — a chore, not a queue. A dirty seat always outranks it: 'idle' only picks the
// chore once pickDirtySeat comes back empty, and both chore states re-check on every tick (a seat
// dirtied mid-chore bounces the cleaner straight back to 'idle', which re-picks it next tick).
function stepCleaner(s, w, dt, rate) {
  switch (s.state) {
    case 'idle': {
      const st = pickDirtySeat(s, w);
      // M3 T6: same hasTarget clear as the runner above — a fresh dirty-seat pick is a genuinely
      // new target, not a continuation of wherever the mover was last idly walking.
      if (st) { s.mover.hasTarget = false; s.target = st.id; s.state = 'toSeat'; return; }
      const wc = activeRestroom(w);
      if (wc && wc.tidy < 1) { s.mover.hasTarget = false; s.target = wc.id; s.state = 'toRestroom'; s.timer = 0; return; }
      walkTo(s, s.spawn.x, s.spawn.z, w, dt);
      return;
    }
    case 'toSeat': {
      const st = w.stations.get(s.target);
      if (!st || !st.active || !st.dirty) { s.state = 'idle'; return; } // someone beat us to it
      // Program §6.3: the wipe STARTS here, and until now nothing told the presentation layer
      // so — 1.6 s of a cleaner standing perfectly still beside an unchanged table is what read
      // as "this table has no cleaning animation". `rate` is this cleaner's real, level-adjusted
      // duration, so the ring systems/visuals.js draws finishes exactly when the seat does.
      if (walkTo(s, st.front.x, st.front.z, w, dt)) { s.state = 'cleaning'; s.timer = 0; beginCleanSeat(w, st.id, 'cleaner', rate); }
      return;
    }
    case 'cleaning': {
      const st = w.stations.get(s.target);
      if (!st || !st.dirty) { s.state = 'idle'; s.timer = 0; return; }
      s.timer += dt;
      if (s.timer >= rate) { cleanSeat(w, st.id); s.state = 'idle'; s.timer = 0; }
      return;
    }
    case 'toRestroom': {
      const wc = w.stations.get(s.target);
      if (!wc || !wc.active || wc.tidy >= 1) { s.state = 'idle'; return; }
      if (pickDirtySeat(s, w)) { s.state = 'idle'; return; } // a dirty seat just outranked the chore
      if (walkTo(s, wc.front.x, wc.front.z, w, dt)) { s.state = 'tidying'; s.timer = 0; }
      return;
    }
    case 'tidying': {
      const wc = w.stations.get(s.target);
      if (!wc || !wc.active) { s.state = 'idle'; s.timer = 0; return; }
      if (pickDirtySeat(s, w)) { s.state = 'idle'; s.timer = 0; return; } // dirty seat outranks the chore
      s.timer += dt;
      if (s.timer >= RESTROOM_CLEAN_SECONDS) { wc.tidy = 1; s.state = 'idle'; s.timer = 0; }
      return;
    }
  }
}

// Batch 4b (plan 3.9): the Photographer — hired at photoDesk1, works ONLY photo1. It has no
// queue-clearing chore of its own (nothing to fetch, nothing to sell): it just needs to stand close
// enough to mark the booth 'serving' — the same thing the owner's own presence already does in
// systems/photo.js — and, once a session is running, call the shot itself rather than let it ride
// out PHOTO_AUTO_RESOLVE's full 1.6s and land as a flat, anonymous 'ok'.
//
// PHOTOGRAPHER_SERVE_RADIUS below is a LITERAL duplicate of systems/photo.js's own SERVE_RADIUS
// (1.3m) — the exact same "how close counts as manning the booth" rule the owner is judged by, not
// a new number invented for this role. It has to stay a literal: sim/ never imports from systems/
// (that boundary is what keeps this whole file DOM-free and bot-runnable), so there is no shared
// binding to import. Flagged in this task's own report as a value that has to be kept in sync by
// hand if systems/photo.js's SERVE_RADIUS ever moves.
const PHOTOGRAPHER_SERVE_RADIUS = 1.3;
// Fixed think time before the photographer calls the shot itself, comfortably under
// PHOTO_AUTO_RESOLVE's 1.6s so a manned booth always resolves through the photographer's own
// 'good' first, never the anonymous timeout's 'ok'. resolvePhotoShot itself clamps anything that
// isn't literally 'perfect' down to 'good' or 'ok' — this file only ever passes 'good', so a
// photographer-run shot can never come back 'perfect' (that stays the player's own tap).
//
// Hiring the SECOND photographer (this role's own two-tier cost ladder, same shape as the
// barista's) speeds up the one thing there is to speed up at the one booth: unlike the barista,
// there is no second lane for a second hire to cover (only one photo booth is ever built), so its
// value has to be faster hands instead. `total` below is the live photographer headcount, computed
// once per tick by stepStaff exactly like it already computes cashierTotal for the cashier's own
// count-dependent behaviour.
export const PHOTOGRAPHER_SHOT_SECONDS = 1.0;
export const PHOTOGRAPHER_SHOT_SECONDS_LEVEL2 = 0.6;

// The one active photo booth, or null. Mirrors coffeeLane's own "first active one found is safe
// here too since there's only ever one of each in the shipped layout" reasoning higher up this file.
function activePhotoBooth(w) {
  for (const st of w.stations.values()) if (st.type === 'photo' && st.active) return st;
  return null;
}
// Beside the booth's front, not on it — reuses waitSpot's own beside-a-station offset (WAIT_SIDE,
// 0.9m) so the photographer's body (r=0.30) clears both the customer queue (queue slot 0 sits only
// 0.1m further out than st.front along the SAME forward axis — see world.js's queue-geometry
// comment — so standing directly in front would put two r=0.30 bodies well inside the 0.6m they
// need to separate) and wherever the owner is standing to man the booth themselves (also somewhere
// near st.front, within the same SERVE_RADIUS). `preferLeft` lets a SECOND hired photographer (idx
// 1 in the roster) try the opposite side first, so two of them settle on either side of the booth
// instead of both walking onto the exact same free cell.
function photographerSpot(w, st, preferLeft) {
  const sides = preferLeft ? [-WAIT_SIDE, WAIT_SIDE] : [WAIT_SIDE, -WAIT_SIDE];
  for (const side of sides) {
    const o = rotateOffset(st.rot || 0, side, 0);
    const p = { x: st.front.x + o.x, z: st.front.z + o.z };
    if (!w.grid || isFree(w.grid, idx(w.grid, p.x, p.z), 0)) return p;
  }
  return { x: st.front.x, z: st.front.z };
}
function stepPhotographer(s, w, dt, idx = 0, total = 1) {
  const st = activePhotoBooth(w);
  // No built/active booth at all (a hand-edited or otherwise inconsistent save — the real zone
  // chain makes z_photo a hard prerequisite of z_photographer, see this task's own report): park at
  // spawn like every other role does with nothing to do, rather than walking toward a station that
  // does not exist.
  if (!st) { walkTo(s, s.spawn.x, s.spawn.z, w, dt); return; }
  const spot = photographerSpot(w, st, (idx | 0) % 2 === 1);
  const arrived = walkTo(s, spot.x, spot.z, w, dt);
  // Same fallback-arrival tolerance as every other call site in this file (see ARRIVE_FALLBACK_EPS)
  // — an exact 0.05m arrival can leave a mover circling short forever once avoidance perturbs it.
  if (!arrived && s.mover.hasTarget && Math.hypot(spot.x - s.x, spot.z - s.z) < ARRIVE_FALLBACK_EPS) s.mover.hasTarget = false;
  const dx = st.front.x - s.x, dz = st.front.z - s.z;
  if (dx * dx + dz * dz < PHOTOGRAPHER_SERVE_RADIUS * PHOTOGRAPHER_SERVE_RADIUS) st.serving = true;
  if (st.session && !st.session.resolved) {
    const think = total >= 2 ? PHOTOGRAPHER_SHOT_SECONDS_LEVEL2 : PHOTOGRAPHER_SHOT_SECONDS;
    if (st.session.t >= think) resolvePhotoShot(w, st.id, 'good');
  }
}

// M3 T6: `customers`, sixth and optional, lets a runner prefer whichever product a genuinely
// stuck customer is waiting on over blindly restocking whatever has the most raw stock (see
// pickSource/pickCounter above) — every existing caller that omits it (test/nav-fullhouse.test.js
// included) keeps its exact prior behaviour.
export function stepStaff(list, w, dt, onCollect, levels, customers) {
  const L = levels || DEFAULT_LEVELS;
  // Standalone callers retain their bounded fallback; orchestrated steps own a frozen roster.
  if (!w._actorRosterActive) {
    if (!w._movers) w._movers = [];
    if (w._custRanFlag) w._custRanFlag = false; else w._movers.length = 0;
    for (const s of list) if (!w._movers.includes(s.mover)) w._movers.push(s.mover);
  }
  // M3 T5: a worker's Speed level (+20%/tier) rescales its mover's speed every frame — cheap
  // (list is tiny) and picks up a live upgrade purchase instantly, the same pattern
  // tools/bot.js's walkOwnerTo already uses for the player's own speed upgrade.
  const carryCap = RUNNER_CARRY_LEVELS[Math.min(RUNNER_CARRY_LEVELS.length - 1, Math.max(0, (L.runner.carry | 0)))];
  const cashierLevel = ((L.cashier.speed | 0)) + 1;
  const cleanerRate = CLEANER_RATE / (1 + 0.25 * (L.cleaner.speed | 0));
  // C3: total cashier count, so stepCashier knows whether to home-by-index (2+) or keep the
  // untouched single-cashier patrol (see its own comment).
  let cashierTotal = 0;
  for (const s of list) if (s.kind === 'cashier') cashierTotal++;
  let cashierIdx = 0;
  // Batch 4b: total photographer count, so stepPhotographer knows whether the second hire's
  // shorter think time (PHOTOGRAPHER_SHOT_SECONDS_LEVEL2) applies, and idx lets a second one prefer
  // the opposite stand spot beside the booth (see photographerSpot's own comment).
  let photographerTotal = 0;
  for (const s of list) if (s.kind === 'photographer') photographerTotal++;
  let photographerIdx = 0;
  for (const s of list) {
    s.mover.speed = (STAFF[s.kind] && STAFF[s.kind].speed || 2.2) * workerSpeedMult(L, s.kind);
    if (s.kind === 'runner') stepRunner(s, w, dt, carryCap, customers);
    else if (s.kind === 'cashier') { stepCashier(s, w, dt, cashierLevel, cashierIdx, cashierTotal); cashierIdx++; }
    else if (s.kind === 'cleaner') stepCleaner(s, w, dt, cleanerRate);
    else if (s.kind === 'photographer') { stepPhotographer(s, w, dt, photographerIdx, photographerTotal); photographerIdx++; }
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
