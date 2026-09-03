// src/sim/world.js
import { PRODUCTS, REGISTER_RATE, FAMILY, familyOf } from './economy.js';
import { stationBoxes } from './collide.js';
import { buildGrid } from './nav.js';
import { cashSpot } from '../../data/area1.js';
import { makeRng } from '../core/rng.js';

// Forward distance (metres) from a table's centre to its human seat spot — outside the table's
// collision shell (half footprint 0.70m + customer radius 0.30m = 1.00m) by a 0.05m margin.
// Exported so sim/customers.js's toSeat routing knows when it's safely level with the table to
// stop detouring around it and converge straight onto pair.human.
export const SEAT_FORWARD = 1.05;

// Rotate a local (right, forward) offset by a station's `rot`, using the same
// convention as customers.js's moveToward (rot = atan2(dx, dz), so rot 0 faces +z).
function rotateOffset(rot, right, forward) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return { x: right * c + forward * s, z: -right * s + forward * c };
}

// Loop v2 Task 3: the two stations that grow a star-3 second recipe (design section 6 — "Oven A:
// cookies + brownies; Coffee: coffee + latte"). Every other oven/coffee station (oven2/blender1
// have no alt recipe in the design) keeps altProduct undefined, so the toggle logic below never
// fires for them regardless of their own star tier.
const ALT_PRODUCT = { oven1: 'brownie', coffee1: 'latte' };
export function createWorld(area, save, seed) {
  const built = new Set(save && save.built || []);
  const partial = Object.assign({}, save && save.partial || {});
  const payAcc = {};
  const stations = new Map();
  for (const s of area.stations) {
    const st = { id: s.id, type: s.type, x: s.x, z: s.z, rot: s.rot || 0, fw: s.fw, fd: s.fd, builtBy: s.builtBy, active: !s.builtBy || built.has(s.builtBy) };
    if (s.type === 'oven') Object.assign(st, { product: s.product, baseProduct: s.product, altProduct: ALT_PRODUCT[s.id] || null, stock: 0, buffer: s.buffer || 12, timer: 0 });
    // Loop v2 Task 1: a display holds exactly ONE product (fixed by data, never mixed) — replaces
    // the old shared 'counter' (items: [], any product). putOnDisplay/takeFromDisplay below.
    if (s.type === 'display') Object.assign(st, { product: s.product, stock: 0, capacity: s.capacity || 8 });
    // M3 T3: the register keeps the code type 'checkout' (w.checkouts, checkoutMesh, everything
    // that already reads it) even though the plan/UI call it "Register". serving/procT drive the
    // manned-register cadence — see stepRegisters below.
    if (s.type === 'checkout') Object.assign(st, { pile: 0, serving: '', procT: 0 });
    // Task 4: `dirty` starts false; set true by customers.js when a pair finishes eating, cleared
    // by cleanSeat below (owner) or the cleaner staff kind (src/sim/staff.js).
    if (s.type === 'seat') Object.assign(st, { occupied: false, dirty: false });
    if (s.type === 'bowl') Object.assign(st, { stock: 0, capacity: 10 });
    // growT: seconds accumulator toward the next stage (stepMachines below), one stage per 25/3 s.
    if (s.type === 'bush') Object.assign(st, { stage: 0, growT: 0 });
    if (s.type === 'coffee') Object.assign(st, { product: 'coffee', baseProduct: 'coffee', altProduct: ALT_PRODUCT[s.id] || null, beans: 20, stock: 0, buffer: 8, timer: 0 });
    if (s.type === 'pantry') Object.assign(st, {}); // was 'storage' — same no-state marker, renamed
    if (s.type === 'return') Object.assign(st, {}); // the return crate carries no state of its own
    if (s.type === 'blender') Object.assign(st, { fruit: 0, stock: 0, buffer: 8, timer: 0 });

    const frontDist = s.front != null ? s.front : 1.3;
    const f = rotateOffset(st.rot, 0, frontDist);
    st.front = { x: st.x + f.x, z: st.z + f.z };

    // I8/I11: precompute the checkout's cash spot once so systems/stations.js, systems/visuals.js
    // and sim/staff.js's cashier all read the same st.cash instead of recomputing cashSpot(st) per frame.
    if (s.type === 'checkout') st.cash = cashSpot(st);

    // M3 T3: registers reuse the counter's queue geometry helper (5 slots, 1.4m then 0.85m
    // steps — fix round 2: cut from 6 to 5 so the deepest slot, z = 2.8, stays clear of the
    // z 3.0-4.6 exit corridor every 'leave' customer walks through). `s.queueRight` (optional,
    // default 0) nudges the whole queue line sideways along the station's local right axis —
    // register2 needs this: it shares hire1's blocked x band and its queue would otherwise run
    // straight through hire1's footprint (found by test/layout.test.js). Every other
    // display/register has open floor along its queue line and leaves this at its default 0.
    if (s.type === 'display' || s.type === 'checkout') {
      st.queue = [];
      const right = s.queueRight || 0;
      for (let i = 0; i < 5; i++) {
        const p = rotateOffset(st.rot, right, 1.4 + i * 0.85);
        st.queue.push({ x: st.x + p.x, z: st.z + p.z });
      }
    }
    if (s.type === 'seat') {
      // C1: forward distance SEAT_FORWARD (1.05m, was 0.75m) puts the human's seated spot outside
      // the table's collision shell (half footprint 0.70m + customer radius 0.30m = 1.00m), so a
      // customer already level with that forward distance never gets pushed by its own table.
      // (Getting there without walking through the table on the local right=0 axis is handled by
      // the toSeat routing in sim/customers.js, which imports SEAT_FORWARD to know when it's safe
      // to stop detouring sideways and converge straight onto pair.human.)
      const h = rotateOffset(st.rot, 0, SEAT_FORWARD);
      const p = rotateOffset(st.rot, 0.6, SEAT_FORWARD);
      st.pair = { human: { x: st.x + h.x, z: st.z + h.z }, pet: { x: st.x + p.x, z: st.z + p.z } };
    }
    stations.set(s.id, st);
  }
  // M3 T3: seeded RNG for the sim layer (wishFor et al.) — no Math.random in src/sim.
  const w = { area, built, partial, payAcc, stations, events: [], displays: [], checkouts: [], _queues: new Map(), rng: makeRng(seed || 1) };
  refreshActive(w);
  return w;
}
export function refreshActive(w) {
  const displays = [], checkouts = [];
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'display') displays.push(st.id);
    else if (st.type === 'checkout') checkouts.push(st.id);
  }
  w.displays = displays; w.checkouts = checkouts;
  w.boxes = stationBoxes(w);
  w.activeZoneList = activeZones(w); // I8: cached list, rebuilt only when the built set changes
  // Stations changed (new footprints block/unblock cells): rebuild the walkability grid. The
  // fresh grid always starts at version 0 (see buildGrid); carry the previous grid's version + 1
  // forward onto it (markDirty semantics) so every mover's stale gridVersion mismatches and it
  // re-plans on its next step instead of walking against a now-outdated grid.
  const nextVersion = w.grid ? w.grid.version + 1 : 0;
  w.grid = buildGrid(w.area, w);
  w.grid.version = nextVersion;
}
export function activeZones(w) {
  return w.area.zones.filter(z => !w.built.has(z.id) && (!z.requires || w.built.has(z.requires)));
}
export function payZone(w, zoneId, coins, dt) {
  const z = w.area.zones.find(z => z.id === zoneId);
  if (!z || w.built.has(zoneId)) return { spent: 0, done: false };
  const paid = w.partial[zoneId] || 0;
  const rate = Math.max(50, z.price / 2);
  w.payAcc[zoneId] = (w.payAcc[zoneId] || 0) + rate * dt;
  let spent = Math.floor(w.payAcc[zoneId]);
  spent = Math.max(0, Math.min(coins, z.price - paid, spent));
  w.payAcc[zoneId] -= spent;
  const total = paid + spent;
  if (total >= z.price) {
    delete w.partial[zoneId]; delete w.payAcc[zoneId]; w.built.add(zoneId);
    for (const id of z.adds) { const st = w.stations.get(id); if (st) st.active = true; }
    refreshActive(w);
    w.events.push({ type: 'built', zoneId });
    return { spent, done: true };
  }
  if (spent > 0) w.partial[zoneId] = total;
  return { spent, done: false };
}
// Loop v2 Task 3: once a station's star tier is >= 2, its bake/make speed is 1.5x (design section
// 6). w.stars is an informal reference to G.stars (set once by game.js/tools/bot.js/tools/
// strip.js — the same pattern w.rng/w.grid already use), so any caller that never sets it (every
// pre-Task-3 test) reads every station as tier 1 and gets exactly the old, unmultiplied speed.
function starMult(w, id) { return ((w.stars && w.stars[id]) || 1) >= 2 ? 1.5 : 1; }
// Once a station's star tier is >= 3 AND it has a second recipe (altProduct set at creation — only
// oven1/coffee1 do), flip its current product between the base and alt member the instant its
// finished-goods buffer is genuinely empty and nothing is mid-bake (stock === 0 && timer === 0) —
// "alternates with cookies each batch" (design section 6). Below tier 3, or for a station with no
// altProduct at all, this is a no-op and st.product never leaves its original value.
function maybeToggleRecipe(w, st) {
  if (!st.altProduct || st.stock !== 0 || st.timer !== 0) return;
  if (((w.stars && w.stars[st.id]) || 1) < 3) return;
  st.product = st.product === st.baseProduct ? st.altProduct : st.baseProduct;
}
export function stepOvens(w, dt, bakeMult = 1) {
  for (const st of w.stations.values()) {
    if (st.type !== 'oven' || !st.active) continue;
    if (st.stock >= st.buffer) { st.timer = 0; continue; }
    maybeToggleRecipe(w, st);
    st.timer += dt;
    const t = PRODUCTS[st.product].bake / (bakeMult * starMult(w, st.id));
    while (st.timer >= t && st.stock < st.buffer) { st.timer -= t; st.stock++; }
  }
}
export function takeFromOven(w, id, n) { const st = w.stations.get(id); const k = Math.min(n, st.stock); st.stock -= k; return k; }
// Loop v2 Task 1: a display holds exactly one product (st.product, fixed by data) — putOnDisplay
// rejects any other key outright (returns 0) instead of accepting anything, and takeFromDisplay
// always returns that fixed product (or null once empty). Replaces putOnCounter/takeFromCounter/
// takeProduct's shared-any-product-counter model.
// Loop v2 Task 3: a display actually holds one FAMILY (economy.js's FAMILY — cookie/brownie,
// coffee/latte; every other product is its own singleton family), fungibly — the display doesn't
// track which family member each unit is, it just re-labels st.product to whichever member was
// most recently dropped (so the shelf's label always matches what a customer would actually be
// handed) and keeps one combined stock count. This is a deliberate simplification over per-unit
// tracking: pricing/order already key off the CUSTOMER's wish (sim/customers.js fills c.order with
// c.wish.product, never what takeFromDisplay itself returns), so a shelf mid-flip between cookies
// and brownies never mis-prices a sale — it just means a lingering cookie or two on a shelf that's
// since started receiving brownies reads as "brownie" for display-label purposes only.
export function putOnDisplay(w, id, key, n) {
  const st = w.stations.get(id);
  if (!st || familyOf(st.product) !== familyOf(key)) return 0;
  if (st.product !== key) st.product = key;
  const k = Math.max(0, Math.min(n, st.capacity - st.stock));
  st.stock += k;
  return k;
}
export function takeFromDisplay(w, id) {
  const st = w.stations.get(id);
  if (!st || st.stock <= 0) return null;
  st.stock--;
  return st.product;
}
// M3 T3: the treat bowl — 1 kibble per pet customer that wants one.
export function takeTreat(w, id) {
  const st = w.stations.get(id);
  if (st.stock > 0) { st.stock--; return 1; }
  return 0;
}
export function addCash(w, id, amt) { w.stations.get(id).pile += amt; }
export function collectCash(w, id) { const st = w.stations.get(id); const p = st.pile; st.pile = 0; return p; }
// Task 4: a dirty seat is not free — it's not usable again until cleanSeat clears it.
export function freeSeat(w) { for (const st of w.stations.values()) if (st.type === 'seat' && st.active && !st.occupied && !st.dirty) return st; return null; }
export function seatById(w, id) { return w.stations.get(id); }

// Task 4: coffee machine, blender and garden bushes. stepMachines is the coffee/blender/bush
// counterpart to stepOvens above — same buffer/timer shape, gated on their own consumable
// (beans/fruit) instead of always running.
export function stepMachines(w, dt, coffeeMult = 1) {
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'coffee') {
      if (st.stock >= st.buffer || st.beans <= 0) { st.timer = 0; continue; }
      maybeToggleRecipe(w, st);
      st.timer += dt;
      const t = PRODUCTS[st.product].make / (coffeeMult * starMult(w, st.id));
      while (st.timer >= t && st.stock < st.buffer && st.beans > 0) { st.timer -= t; st.stock++; st.beans--; }
    } else if (st.type === 'blender') {
      if (st.stock >= st.buffer || st.fruit <= 0) { st.timer = 0; continue; }
      st.timer += dt;
      const t = PRODUCTS.smoothie.make / starMult(w, st.id);
      while (st.timer >= t && st.stock < st.buffer && st.fruit > 0) { st.timer -= t; st.stock++; st.fruit--; }
    } else if (st.type === 'bush') {
      if (st.stage >= 3) continue;
      st.growT += dt;
      const stageTime = 25 / 3;
      while (st.growT >= stageTime && st.stage < 3) { st.growT -= stageTime; st.stage++; }
    }
  }
}
// Coffee/blender stock pickup — same shape as takeFromOven.
export function takeFromMachine(w, id, n) { const st = w.stations.get(id); const k = Math.min(n, st.stock); st.stock -= k; return k; }
// Final review fix: capped at 20 (a coffee machine never holds more beans than one full sack
// worth) and consumes only what was actually used — same shape as refillBowl below (room-capped,
// returns the amount drawn from the sack) instead of blindly adding a flat 20 regardless of how
// much room was actually there, which let repeated top-ups stack beans arbitrarily far past any
// sane cap. `sack` defaults to 20 (a full sack) so every pre-existing 2-arg caller (this file's
// own test/machines.test.js included) keeps its exact old "refills to 20 from empty" behaviour.
export function refillBeans(w, id, sack = 20) {
  const st = w.stations.get(id);
  const room = Math.max(0, 20 - st.beans);
  const used = Math.max(0, Math.min(sack, room));
  st.beans += used;
  return used;
}
// Blender fruit buffer, cap 9.
export function addFruit(w, id, n) {
  const st = w.stations.get(id);
  const room = Math.max(0, 9 - st.fruit);
  const added = Math.max(0, Math.min(n, room));
  st.fruit += added;
  return added;
}
// A stage-3 bush yields 3 fruit and resets to stage 0 (and its grow timer); anything else yields 0.
export function harvestBush(w, id) {
  const st = w.stations.get(id);
  if (st.stage === 3) { st.stage = 0; st.growT = 0; return 3; }
  return 0;
}
// Adds up to `kibble` units to the bowl, capped at its remaining room; returns the amount used so
// the caller (a kibble sack) can draw down exactly that much.
export function refillBowl(w, id, kibble) {
  const st = w.stations.get(id);
  const room = Math.max(0, st.capacity - st.stock);
  const used = Math.max(0, Math.min(kibble, room));
  st.stock += used;
  return used;
}
// Clears a dirty seat (owner standing in its front circle for 1.0 s, or a cleaner after 1.6 s —
// see systems/stations.js and sim/staff.js). No-op (and no event) if the seat wasn't dirty.
export function cleanSeat(w, id) {
  const st = w.stations.get(id);
  if (st && st.dirty) { st.dirty = false; w.events.push({ type: 'cleaned', seatId: id }); }
}

// M3 T3: manned-register processing. `st.serving` ('' | 'owner' | 'cashier') is set every frame
// by the systems layer (owner proximity to st.front, or a cashier's mover arrived at st.cash)
// BEFORE this runs; while set, st.procT accrues dt and, once it reaches the server's rate, the
// customer at register slot 0 (tracked in w._regQueues by sim/customers.js, mirroring w._queues
// for counters) is processed: its precomputed c.amount (customers.js computes this once, using
// the price() closure it already carries) is added to the pile the owner already collects from,
// and it's marked paid so customers.js advances it to a seat (or the door) next step. Money is
// only ever added here — never while unmanned, so an empty register genuinely earns nothing and
// the queue's patience just drains (see sim/customers.js's 'atRegister' handling).
//
// serving is reset to '' at the END of this pass (not the start), so it reflects THIS frame's
// owner/cashier presence for processing, and reads '' again next frame until the systems layer
// (which runs before stepRegisters in the frame order) sets it once more.
export function stepRegisters(w, dt) {
  for (const id of w.checkouts) {
    const st = w.stations.get(id);
    if (!st.active) continue;
    if (st.serving) {
      // Cashier levels scale the base rate as base / (1 + 0.25 * (level - 1)) — a deliberate
      // deviation from a flat 1.0/level (which would double throughput at level 2, triple at
      // level 3, ...); this keeps each level a milder, more affordable-feeling speed-up.
      const rate = st.serving === 'owner' ? REGISTER_RATE.owner : REGISTER_RATE.cashierBase / (1 + 0.25 * ((st.cashierLevel || 1) - 1));
      const arr = w._regQueues && w._regQueues.get(id);
      // M3 T3 fix (found by the nav-fullhouse acceptance test): a customer's c.slot can flip to
      // 0 the instant the previous slot-0 occupant leaves — customers.js's assignRegisterSlots
      // runs at the end of stepCustomers, one step ahead of what THIS tick's switch used to walk
      // toward — so a customer can be marked slot 0 while its mover is still sitting wherever its
      // OLD (further-back) slot left it, not yet even re-targeted toward the new slot-0 spot
      // (that re-target only happens on the FOLLOWING tick's switch, once c.slot has propagated).
      // Paying it right then marks it paid before it's actually there: next tick it (correctly)
      // targets slot 0 for exactly one tick, then immediately jumps to its seat the tick after —
      // two target changes back-to-back with the mover's hasTarget never dropping to false in
      // between (so the acceptance test's own stall tracker, which only resets its baseline when
      // hasTarget toggles, never clears the tiny slot-0 distance and reads the whole seat-ward
      // walk as zero improvement for 3+ seconds). `!c.mover.hasTarget` alone doesn't catch this
      // — the mover reads idle either way, whether truly settled at slot 0 or just stale at an
      // old slot nobody re-targeted from yet — so check its actual walked position against slot
      // 0's coordinates instead: ground truth, not the one-tick-lagged slot number.
      const q0 = st.queue && st.queue[0];
      // Both conditions are needed, not either alone: `!hasTarget` alone can be true while
      // stale at an OLD slot nobody re-targeted from yet (see above); the spatial check alone
      // can be true while the mover is still mid-approach, a few centimetres out, still
      // seeking (hasTarget true) — paying at that instant defers the toSeat re-target to the
      // FOLLOWING tick while this tick's walkTo call keeps hasTarget true finishing the
      // approach, so the stale-baseline problem above recurs just one tick later. Require both:
      // genuinely at rest (not seeking anything) AND actually at slot 0's coordinates.
      const head = arr && q0 && arr.find(c => c.slot === 0 && c.state === 'atRegister' && !c.paid && !c.mover.hasTarget && Math.hypot(c.x - q0.x, c.z - q0.z) < 0.15);
      // Final review fix: watchdog. A slot-0, unpaid customer that never satisfies `head` above
      // (e.g. pinned just off the exact queue-0 spot by some navigation edge case, or a mover
      // that never quite settles hasTarget=false) would otherwise sit here forever: customers.js
      // only drains an 'atRegister' customer's patience while st.serving reads '' (unmanned — see
      // its own comment), so a CONTINUOUSLY manned register with a stuck head customer had no way
      // to ever clear it, jamming every customer queued behind it too. Track, per register, how
      // long a genuine slot-0/unpaid customer has failed to become `head` while manned; past 2x
      // the pay rate, drain its patience directly here (bypassing customers.js's serving-gated
      // drain entirely) so it still runs down and the customer eventually gives up and leaves via
      // its own ordinary patience<=0 handling, freeing the register back up.
      const stuck = arr && arr.find(c => c.slot === 0 && c.state === 'atRegister' && !c.paid);
      if (stuck && stuck !== head) {
        st._watchdogT = (st._watchdogT || 0) + dt;
        if (st._watchdogT > 2 * rate && typeof stuck.patience === 'number') stuck.patience = Math.max(0, stuck.patience - dt);
      } else {
        st._watchdogT = 0;
      }
      // Fix round 1: only bank dt toward the next payment while an eligible customer is actually
      // resting at slot 0. The old code banked dt every frame the register was simply manned
      // (`st.serving` truthy), even with nobody there to serve — a register manned for 5s with an
      // empty queue banked ~5s/rate worth of credit, then paid off that whole backlog in a burst
      // of consecutive frames the instant customers started arriving, instead of one payment
      // every `rate` seconds. Also cap procT at `rate` unconditionally (not just after a pay), so
      // no path — including a single oversized dt — can leave more than one rate-interval's worth
      // of credit banked at once.
      if (head) st.procT += dt;
      if (st.procT > rate) st.procT = rate;
      if (head && st.procT >= rate) {
        st.procT -= rate;
        const amount = head.amount || 0;
        st.pile += amount;
        head.paid = true;
        w.events.push({ type: 'processed', id: head.id, amount, checkoutId: st.id, by: st.serving });
        w.events.push({ type: 'pay', id: head.id, amount, x: st.x, z: st.z, checkoutId: st.id });
      }
    }
  }
  for (const id of w.checkouts) w.stations.get(id).serving = '';
}
