// src/sim/botDecide.js — M3 T6: the single "competent player" priority loop, shared by
// tools/bot.js (headless economy pacing, pure Node) and tools/strip.js (drives the real running
// game's owner via window.__game.botDecide() — see src/game.js). Pure and side-effect-light: the
// only mutation is the opportunistic hire/upgrade purchase (tryHiresAndUpgrades below), which both
// callers want to happen every tick regardless of what movement target comes back — exactly like a
// player who taps BUY the instant something in the panel lights up, without detouring there.
//
// Contract: decide(w, G) reads/writes a G shaped like the running game's (coins, up, staff,
// staffLevels, machineLevels, boosts, customers, carry, P, time) PLUS three bot-only fields the
// caller is responsible for keeping current each tick:
//   G.carryKey — the single product-key string the owner is currently carrying (a display/oven/
//     coffee/blender pickup awaiting a drop), or null when empty. Loop v2 Task 1: a carry only
//     ever holds ONE product type — the real game tracks this as meshes on owner.items, all
//     sharing one userData.product; the browser wrapper (src/game.js's G.botDecide) maps
//     owner.items[0] to this key.
//   G.carryCount — how many units of G.carryKey are held (0 when empty).
//   G.time — elapsed sim seconds (already G.time in the real game; tools/bot.js sets it each tick).
// Returns { x, z, kind, stationId?, zoneId?, product?, sackKind? } — the spot to walk to and what
// kind of job it is — or null when there's nothing to do right now. The CALLER performs the actual
// mechanics on arrival (take/drop/refill/harvest/blend/clean/collect/pay): the real game already
// does all of these automatically via proximity (src/systems/stations.js, untouched by this task);
// tools/bot.js's own loop does them explicitly since it has no render/systems layer running.
import { activeZones } from './world.js';
import {
  hire, hireCost, upgradeCost, buyUpgrade, machineUpgradeCost, buyMachineUpgrade, ensureLevels, carryCap,
  familyOf, ensureStars, buyStar, STAR_IDS, nextStarCost,
} from './economy.js';

function registerNeedingService(w) {
  for (const id of w.checkouts) {
    const st = w.stations.get(id);
    if (!st.active) continue;
    const arr = w._regQueues && w._regQueues.get(id);
    if (arr && arr.some(c => c.slot === 0 && c.state === 'atRegister' && !c.paid && st.serving === '')) return st;
  }
  return null;
}
function hasEmptyDisplayWaiting(customers) {
  for (const c of customers || []) {
    if (c.done) continue;
    if (c.state === 'queue' && c.slot === 0 && c.mood === 'wait') return true;
  }
  return false;
}
// Priority 1: serve the register when >= 1 customer waits unserved — decide() naturally keeps
// returning the SAME needy register every tick until its queue drains (registerNeedingService
// only stops matching once nobody there is unpaid-and-unserved), which is "stay until empty".
// Exception: a display sits empty with customers waiting on it AND no runner is hired to fix that
// on its own — then split attention 50/50 in 6 s halves (G.time-derived, so no extra state needed).
function registerTarget(w, G) {
  const needy = registerNeedingService(w);
  if (!needy) return null;
  if (hasEmptyDisplayWaiting(G.customers) && (G.staff.runner | 0) === 0) {
    const phase = Math.floor((G.time || 0) / 6) % 2;
    if (phase === 1) return null; // this half of the cycle: yield to restock
  }
  return { x: needy.front.x, z: needy.front.z, kind: 'register', stationId: needy.id };
}
// Priority 2: restock the counter customers wait at — fetch the WISHED product specifically (not
// just whatever the cookie oven has), from whichever active source (oven/coffee/blender) currently
// holds the most of it; once carrying, drop at the counter a matching customer is actually waiting
// on (falling back to the least-loaded counter with room so a fetched batch never just sits idle).
// `phase` is the errand's CURRENT leg ('fetch' | 'drop' | undefined for a fresh pick) — once the
// owner has actually started walking a batch over to the counter ('drop'), the fill-to-capacity
// check below must NOT re-fire: without the phase guard, dropping even one item brings the count
// back under capacity, which looked identical to "haven't topped up yet" and sent the owner
// straight back to the oven mid-delivery — a batch of 6 could take dozens of half-finished trips
// to actually land on the counter, since it kept restarting the gather step after every 1-item
// drop instead of finishing the delivery it had already committed to.
// Loop v2 Task 1: one display per product — a direct lookup replaces the old "least-loaded
// counter holding any product" search (there's only ever one candidate per product now).
function displayFor(w, product) {
  const fam = familyOf(product);
  for (const id of w.displays) { const st = w.stations.get(id); if (familyOf(st.product) === fam) return st; }
  return null;
}
function restockTarget(w, G, phase) {
  const key = G.carryKey || null, count = G.carryCount || 0;
  if (key && count > 0) {
    const disp = displayFor(w, key);
    if (!disp) return null; // shouldn't happen — a product's source and display unlock together
    // Keep filling the tray up to carry capacity (or the display's remaining room, whichever's
    // smaller) before making the trip — bailing out after just one item (an earlier version of
    // this) turned every restock into a wasted one-item round trip — but only while still in the
    // gather leg; an already-committed delivery ('drop') finishes first (the phase guard below):
    // without it, dropping even one item brings the count back under capacity, which looked
    // identical to "haven't topped up yet" and sent the owner straight back to the oven mid-delivery.
    const room = Math.max(0, disp.capacity - disp.stock);
    if (phase !== 'drop' && count < carryCap(G.up) && count < room) {
      const keyFam = familyOf(key);
      for (const st of w.stations.values()) {
        if (!st.active || !(st.stock > 0)) continue;
        const pk = st.type === 'oven' ? st.product : st.type === 'coffee' ? st.product : st.type === 'blender' ? 'smoothie' : null;
        if (familyOf(pk) === keyFam) return { x: st.front.x, z: st.front.z, kind: 'fetch', stationId: st.id, product: key };
      }
    }
    if (disp.stock < disp.capacity) return { x: disp.front.x, z: disp.front.z, kind: 'drop', stationId: disp.id };
    return null; // that display's full right now — hold the batch, re-arbitrate next tick
  }
  let wished = null;
  for (const c of G.customers || []) {
    if (c.done) continue;
    if (c.state === 'queue' && c.slot === 0 && c.mood === 'wait') { wished = c.wish.product; break; }
  }
  if (!wished) return null;
  // Same carry-exclusivity guard as refill/harvest above: a product pickup silently no-ops while a
  // sack or fruit is held (canTakeItems in carry.js), so don't send the owner chasing one.
  if (G.carry && (G.carry.sack || G.carry.fruit > 0)) return null;
  const disp = displayFor(w, wished);
  if (!disp || disp.stock >= disp.capacity) return null; // nowhere to put anything right now
  let best = null, bestStock = 0;
  const wishedFam = familyOf(wished);
  for (const st of w.stations.values()) {
    if (!st.active || !(st.stock > 0)) continue;
    const pk = st.type === 'oven' ? st.product : st.type === 'coffee' ? st.product : st.type === 'blender' ? 'smoothie' : null;
    if (familyOf(pk) !== wishedFam) continue;
    if (st.stock > bestStock) { best = st; bestStock = st.stock; }
  }
  return best ? { x: best.front.x, z: best.front.z, kind: 'fetch', stationId: best.id, product: wished } : null;
}
// Priority 3: refill empty machines/bowls via the sack flow — carrying a sack already means the
// pickup half is done, go drop it at the matching machine; otherwise, if something active is
// genuinely out, fetch the sack storage needs most (mirrors systems/stations.js's own ordering).
function refillTarget(w, G) {
  const carry = G.carry;
  if (carry && carry.sack) {
    // A bean sack targets the (single) coffee machine unconditionally, no room check needed: the
    // bot only ever fetches one when that machine's beans have hit exactly 0 (see needBeans
    // below), so by the time it's delivered there's always a full 20 units of room — refillBeans
    // (world.js) is capped at 20 and only consumes what's used, but that cap is never actually hit
    // in this flow. A 20-unit kibble sack, in contrast, can easily outsize the one bowl's 10-unit
    // capacity — targeting an already-full bowl anyway locked the owner into re-approaching it
    // forever (the sack never empties, so it never stopped looking "needed"; measured: ~10,000 s
    // stuck on one delivery). Only target a bowl that genuinely has room right now; with none, give
    // up this trip (the
    // errand ends, the leftover sack just rides along until a customer frees up bowl capacity and
    // chores() tries again) instead of parking on an undeliverable target.
    for (const st of w.stations.values()) {
      if (!st.active) continue;
      if (carry.sack === 'beans' && st.type === 'coffee') return { x: st.front.x, z: st.front.z, kind: 'refillDrop', stationId: st.id };
      if (carry.sack === 'kibble' && st.type === 'bowl' && st.stock < st.capacity) return { x: st.front.x, z: st.front.z, kind: 'refillDrop', stationId: st.id };
    }
    // No active bowl has ANY room right now (the one 20-unit kibble sack routinely outsizes the
    // single bowl's 10-unit capacity, so this isn't rare) — with nowhere left to carry it,
    // "put the sack back" rather than let it sit occupying the carry forever: with no drop action
    // in the base game, that would permanently block the owner from ever fetching product again
    // (canTakeItems requires an empty carry) and, since restocking is what feeds the register in
    // the first place, cascade into starving the whole café. Spilled kibble is a real but bounded
    // loss (never more than one sack), a one-time cost worth paying to keep the café running.
    if (carry.sack === 'kibble') { carry.sack = null; carry.sackLeft = 0; }
    return null;
  }
  // The carry holds sack/fruit/product items mutually exclusively (src/sim/carry.js) — a sack
  // pickup silently no-ops while fruit is still held (takeSack requires isEmpty(carry)). Without
  // this check, a carry stuck holding leftover fruit (the blender's buffer near-full — see
  // harvestTarget above) kept re-issuing a pickup that could never actually succeed, forever.
  if (carry && (carry.fruit > 0 || (G.carryCount || 0) > 0)) return null;
  let needBeans = false, needKibble = false;
  for (const st of w.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'coffee' && st.beans === 0) needBeans = true;
    if (st.type === 'bowl' && st.stock === 0) needKibble = true;
  }
  if (!needBeans && !needKibble) return null;
  const pantry = w.stations.get('pantry1'); // was 'storage1' — see data/area1.js
  if (!pantry || !pantry.active) return null;
  return { x: pantry.front.x, z: pantry.front.z, kind: 'refillPickup', stationId: 'pantry1', sackKind: needBeans ? 'beans' : 'kibble' };
}
// Loop v2 Task 1: the return crate — a genuinely wedged owner (holding a product whose one
// display has been full this whole time, or a sack/fruit with nowhere left to put it) hands it
// back for zero coins instead of carrying it around forever, unable to pick up anything else of
// that kind (canTakeItems in carry.js). `B` is decide()'s own per-tick bot state (G._bot) — reused
// here to time how long something has been continuously held (B.carrySince), so a batch gets a
// real chance to be delivered normally before this fires.
const WEDGED_SECONDS = 20;
function returnTarget(w, G, B) {
  const holding = (G.carryCount || 0) > 0 || !!(G.carry && (G.carry.sack || G.carry.fruit > 0));
  if (!holding) { B.carrySince = null; return null; }
  if (B.carrySince == null) B.carrySince = G.time || 0;
  if ((G.time || 0) - B.carrySince < WEDGED_SECONDS) return null;
  const crate = w.stations.get('return1');
  if (!crate || !crate.active) return null;
  return { x: crate.front.x, z: crate.front.z, kind: 'return', stationId: 'return1' };
}
// Priority 4: clean dirty tables — only when no cleaner is hired to handle it on its own.
// `stickyId` — the seat already being walked toward, if any. Re-picking "nearest to G.P" from
// scratch every call (G.P is the owner's own, currently-MOVING position) can flip the target
// mid-walk the instant a second dirty seat becomes marginally closer than the first, and each flip
// restarts the walk — with several dirty seats similarly distant this thrashed forever and never
// actually finished cleaning any of them (measured: "clean" swallowing 95% of every tick). Stick
// with whatever seat is already the errand's target for as long as it's still there and dirty.
function cleanTarget(w, G, stickyId) {
  if ((G.staff.cleaner | 0) > 0) return null;
  if (stickyId) {
    const st = w.stations.get(stickyId);
    if (st && st.active && st.dirty) return { x: st.front.x, z: st.front.z, kind: 'clean', stationId: st.id };
  }
  const ref = G.P || { x: 0, z: 0 };
  let best = null, bestD = Infinity;
  for (const st of w.stations.values()) {
    if (st.type !== 'seat' || !st.active || !st.dirty) continue;
    const d = (st.front.x - ref.x) ** 2 + (st.front.z - ref.z) ** 2;
    if (d < bestD) { bestD = d; best = st; }
  }
  return best ? { x: best.front.x, z: best.front.z, kind: 'clean', stationId: best.id } : null;
}
// Priority 5: harvest ripe bushes and feed the blender — only while a blender actually exists to
// feed (harvesting without one just strands fruit the carry can never use).
function harvestTarget(w, G) {
  const blender = w.stations.get('blender1');
  if (!blender || !blender.active) return null;
  const carry = G.carry;
  // Same fix as the kibble sack above: the blender's fruit buffer caps at 9 while a single harvest
  // yields 3 and the carry can hold up to carryCap at once — targeting an already-near-full blender
  // could leave a remainder the owner can never place, locking onto it forever. Only head there
  // while it actually has room; a carried remainder just rides along until the blender (which
  // keeps consuming fruit into smoothies on its own) frees some up.
  if (carry && carry.fruit > 0) {
    if (blender.fruit < 9) return { x: blender.front.x, z: blender.front.z, kind: 'blend', stationId: 'blender1' };
    // The blender stops consuming fruit entirely once its OWN finished-smoothie buffer is full
    // (stepMachines in world.js) — if smoothies aren't selling, that buffer can sit full for a
    // very long time, so "wait for room" here is not a brief pause, it's effectively forever. Same
    // call as the kibble sack: put the fruit down rather than let it block the owner from ever
    // restocking/harvesting/refilling again (all gated on an empty carry) — measured this alone
    // accounting for 122,688 of a 10-minute run's 18,000 ticks once it started.
    carry.fruit = 0;
    return null;
  }
  // Mutually exclusive with a held sack (carry.js) — a harvest pickup would silently no-op while
  // a sack is held, the same class of stuck-forever loop the sack-pickup guard above prevents.
  if (carry && carry.sack) return null;
  const ref = G.P || { x: 0, z: 0 };
  let best = null, bestD = Infinity;
  for (const st of w.stations.values()) {
    if (st.type !== 'bush' || !st.active || st.stage !== 3) continue;
    const d = (st.front.x - ref.x) ** 2 + (st.front.z - ref.z) ** 2;
    if (d < bestD) { bestD = d; best = st; }
  }
  return best ? { x: best.front.x, z: best.front.z, kind: 'harvest', stationId: best.id } : null;
}
// Priority 6: collect cash once a pile is worth the trip.
function totalPile(w) { let s = 0; for (const id of w.checkouts) s += w.stations.get(id).pile; return s; }
function cashTarget(w) {
  if (totalPile(w) < 20) return null;
  let best = null, bestPile = -1;
  for (const id of w.checkouts) { const co = w.stations.get(id); if (co.pile > bestPile) { bestPile = co.pile; best = co; } }
  return best ? { x: best.cash.x, z: best.cash.z, kind: 'cash', stationId: best.id } : null;
}
// Priority 7: build the next zone when affordable — the cheapest fully-affordable active zone, or
// (once nothing is fully affordable outright) a meaningful partial-payment trip so payZone's own
// per-tick rate keeps chipping away instead of the owner idling on pocket change.
const ZONE_TRIP_MIN = 15;
function buildTarget(w, G) {
  const coins = G.coins || 0;
  const zs = w.activeZoneList || activeZones(w);
  let best = null, bestRemaining = Infinity;
  for (const z of zs) {
    const remaining = z.price - (w.partial[z.id] || 0);
    if (remaining <= coins && remaining < bestRemaining) { bestRemaining = remaining; best = z; }
  }
  if (best) return { x: best.x, z: best.z, kind: 'build', zoneId: best.id };
  if (zs.length && coins >= ZONE_TRIP_MIN) return { x: zs[0].x, z: zs[0].z, kind: 'build', zoneId: zs[0].id };
  return null;
}

// Strict hire sequence — cashier, runner, cleaner, then a second runner — not "whichever's
// cheapest right now": cashier costs more than cleaner, so trying every kind every tick (an
// earlier version of this) would grab a cleaner well before the café could afford a cashier,
// directly contradicting the brief's "hire in this order". Returns null once all four slots are
// filled. Shared by tryHiresAndUpgrades (the actual purchase) and money() below (the "hold off
// funding a big zone, save toward the pending hire instead" guard).
function nextHireKind(staff) {
  if ((staff.cashier | 0) === 0) return 'cashier';
  if ((staff.runner | 0) === 0) return 'runner';
  if ((staff.cleaner | 0) === 0) return 'cleaner';
  if ((staff.runner | 0) === 1) return 'runner'; // second runner
  return null;
}
// M3 T6 pass 2 real bug fix: the cost of the next not-yet-filled hire slot, or null once the hire
// desk isn't up yet, the ESSENTIAL trio (cashier, runner, cleaner) is fully staffed, or every slot
// is filled — used by money() below to stop a always-something's-affordable zone chain from
// perpetually draining the bank under the hire threshold (measured, tools/bot.js DEBUG_COINS=1:
// G.coins oscillating in the 0-450 range for the entire minutes-1-10 window post-z_hire, cashier
// (750) never once reached, because buildTarget claims every coin the moment it crosses whichever
// CHEAPER zone's threshold comes next). Deliberately stops gating once the essential trio is
// staffed — gating for the OPTIONAL 4th slot (a second runner) too kept re-blocking every
// zone pricier than ITS cost for as long as it took to reach that far, which held back late-game
// zones (kiosk measured stuck for 258s waiting on a 1250-coin second runner it didn't need to wait
// for) — a second runner is a nice-to-have, not worth stalling z_kiosk/z_seats2/z_gate over.
function pendingHireCost(w, G) {
  const hireDesk = w.stations.get('hire1');
  if (!hireDesk || !hireDesk.active) return null;
  const staff = G.staff;
  if ((staff.cashier | 0) > 0 && (staff.runner | 0) > 0 && (staff.cleaner | 0) > 0) return null;
  const kind = nextHireKind(staff);
  return kind ? hireCost(kind, staff) : null;
}
// Hire (cashier, runner, cleaner, then a second runner) and buy income/machine tiers the instant
// they're affordable — but income/machine tiers only once nothing more pressing (a zone or a hire)
// is ALSO affordable right now, so a big pile doesn't get soaked up by a Player-tab upgrade while a
// cheap zone or hire sits waiting. Every successful purchase is logged onto w.events as a 'purchase'
// — tools/bot.js's cadence metric (minutes 1..10, gaps between purchases) reads that same event bus
// payZone's own 'built' events already flow through.
function tryHiresAndUpgrades(w, G) {
  ensureStars(G, w); // cheap (<= 8 ids) — keeps G.stars/café level current every tick
  const hireDesk = w.stations.get('hire1');
  const hireDeskActive = hireDesk && hireDesk.active;
  if (hireDeskActive) {
    const kind = nextHireKind(G.staff);
    if (kind) {
      const r = hire(G, kind);
      if (r.ok) w.events.push({ type: 'purchase', kind: 'hire:' + kind, at: G.time || 0 });
    }
  }
  const kiosk = w.stations.get('kiosk1');
  if (!kiosk || !kiosk.active) return;
  const coins = G.coins;
  let pressing = false;
  for (const z of (w.activeZoneList || activeZones(w))) { if ((z.price - (w.partial[z.id] || 0)) <= coins) { pressing = true; break; } }
  if (!pressing && hireDeskActive) {
    for (const kind of ['cashier', 'runner', 'cleaner']) { const c = hireCost(kind, G.staff); if (c != null && c <= coins) { pressing = true; break; } }
  }
  if (pressing) return;
  const incCost = upgradeCost('income', G.up);
  if (incCost != null && coins >= incCost * 2) {
    const r = buyUpgrade(G, 'income');
    if (r.ok) w.events.push({ type: 'purchase', kind: 'upgrade:income', at: G.time || 0 });
    return;
  }
  // Loop v2 Task 3: station stars — same "only once nothing more pressing" gate. Prioritizes the
  // two free "starter" stations (oven1, dispCookie — 240/480, no zone gate) first, since those are
  // exactly what the bot report's daysToComplete target tracks ("all nine zones + at least one
  // star on each of Oven A and the cookie display"); falls back to whichever other active
  // station's next star is cheapest.
  {
    const order = ['oven1', 'dispCookie', ...STAR_IDS.filter(id => id !== 'oven1' && id !== 'dispCookie')];
    for (const id of order) {
      const st = w.stations.get(id);
      if (!st || !st.active) continue;
      const cost = nextStarCost(w.area, id, (G.stars && G.stars[id]) || 1);
      if (cost != null && coins >= cost * 2) {
        const r = buyStar(G, w, id);
        if (r.ok) { w.events.push({ type: 'purchase', kind: 'star:' + id, at: G.time || 0 }); return; }
      }
    }
  }
  ensureLevels(G);
  // Loop v2 Task 1: 'display' dropped from this list — display capacity is a flat 8 for now (star
  // levels come in Task 3), so that upgrade is currently inert; don't let the bot spend on it.
  for (const key of ['oven', 'coffee']) {
    const mc = machineUpgradeCost(key, G.machineLevels);
    if (mc != null && G.coins >= mc * 2) {
      const r = buyMachineUpgrade(G, key);
      if (r.ok) { w.events.push({ type: 'purchase', kind: 'machine:' + key, at: G.time || 0 }); return; }
    }
  }
}

// Re-runs the SAME picker that produced an in-progress errand (not the whole chain) — see decide()
// below for why: without this, a busy café's near-constant restock/register need (whichever ranks
// above cash/build in the priority order) would win literally every single tick, and a lower job
// that takes several ticks to walk to and finish (a cash trip, a zone payment, a sack refill, a
// harvest-then-blend) would never once survive long enough to complete — coins pile up forever
// uncollected and no zone ever gets funded, which is not what a competent player does; a real one
// finishes the tray of cookies they're already carrying before reacting to the next thing.
// restock/refill/harvest are each a two-leg round trip (fetch-then-drop, pickup-then-refill,
// harvest-then-blend) whose own picker function starts a BRAND NEW round trip the instant the
// previous one's second leg completes — in a genuinely busy café there's essentially always
// another customer to restock for, so that alone would keep re-arming forever and never let the
// commitment lapse. Detect exactly that boundary (the second leg's kind regressing back to the
// first leg's) and treat it as "this errand is done" — releasing back to decide()'s full priority
// chain for one tick of fresh arbitration — rather than silently accepting the new round trip
// (which is how cash/build ended up starved solid in the first version of this: restock never
// once let go of the floor for the ~9 remaining minutes of a 10-minute run).
function continueLeg(w, G, kind, stationId) {
  if (kind === 'fetch' || kind === 'drop') {
    const t = restockTarget(w, G, kind);
    return (t && kind === 'drop' && t.kind === 'fetch') ? null : t;
  }
  if (kind === 'refillPickup' || kind === 'refillDrop') {
    const t = refillTarget(w, G);
    return (t && kind === 'refillDrop' && t.kind === 'refillPickup') ? null : t;
  }
  if (kind === 'harvest' || kind === 'blend') {
    const t = harvestTarget(w, G);
    return (t && kind === 'blend' && t.kind === 'harvest') ? null : t;
  }
  if (kind === 'clean') return cleanTarget(w, G, stationId);
  if (kind === 'cash') return cashTarget(w);
  if (kind === 'build') return buildTarget(w, G);
  if (kind === 'register') return registerTarget(w, G); // "stay until the queue is empty"
  if (kind === 'return') return returnTarget(w, G, G._bot || (G._bot = { kind: null, stationId: null }));
  return null;
}
export function decide(w, G) {
  tryHiresAndUpgrades(w, G);
  const B = G._bot || (G._bot = { kind: null, stationId: null });
  // Register keeps its literal top priority every tick — "stay until the queue is empty" (and the
  // display/no-runner alternation) already fall out of registerTarget/hasEmptyDisplayWaiting being
  // re-evaluated fresh each call; it's the one job allowed to cut in on anything else in progress.
  // Crucially, a register interrupt does NOT touch B.kind/B.stationId — the parked errand (a cash
  // trip, a zone payment, a sack refill mid-carry) picks back up exactly where it left off once the
  // queue clears, instead of being forgotten and re-decided from the top of the chain.
  const reg = registerTarget(w, G);
  if (reg) return reg;
  if (B.kind) {
    const cont = continueLeg(w, G, B.kind, B.stationId);
    if (cont) { B.kind = cont.kind; B.stationId = cont.stationId || null; return cont; } // e.g. fetch -> drop: track the leg forward
  }
  // A fresh pick (the previous errand, if any, just fully wrapped up): restock is written first in
  // the priority list, but in a genuinely busy café there's essentially ALWAYS another customer to
  // restock for, so a literal restock-first chain would win every single one of these fresh picks
  // and cash/build would starve solid — measured: coins sitting in the thousands, a fully-affordable
  // zone untouched, for 50+ minutes straight. Give the money jobs first look only once they've gone
  // genuinely neglected for a while (G.time-based, no per-tick counting) — frequent enough that a
  // pile never sits for long and an affordable zone gets funded promptly, rare enough that it
  // doesn't come at the register/counter's expense.
  const now = G.time || 0;
  if (B.lastMoneyT == null) B.lastMoneyT = now;
  const moneyDue = now - B.lastMoneyT > 15;
  const chores = () => restockTarget(w, G) || returnTarget(w, G, B) || refillTarget(w, G) || cleanTarget(w, G) || harvestTarget(w, G);
  // M3 T6 pass 2 real bug fix: build BEFORE cash, not the other way around. cashTarget only needs
  // a pile >= 20 to fire — trivially true almost every time the register has processed even one or
  // two seated customers, especially with pass 2's higher menu prices — so `cash || build` let a
  // fully-affordable zone (or the hire desk, in turn) sit UNBUILT for minutes at a time even with
  // hundreds of spare coins already in the wallet, because every single money-due window kept
  // finding SOME pile worth sweeping and never once fell through to buildTarget. Measured directly
  // (tools/bot.js, DEBUG_COINS=1): z_coffee's partial payment stuck at 74/160 while G.coins climbed
  // from 157 to 301 to 541 over 70 straight seconds, because cashTarget(w) kept winning first.
  // Funding the next zone (which unlocks more capacity/staff) is strictly more valuable than
  // banking a pile that's just as safe sitting in the register a while longer, so build gets first
  // look now; a full pile still gets swept whenever nothing is currently affordable to build.
  //
  // Second real bug fix, found the same way once the first one above was in place: build-first
  // alone still starved HIRING. The zone chain always has SOMETHING affordable at a lower price
  // than the next hire slot (garden/bowl/blender/counter3 all cost less than a 750-coin cashier),
  // so buildTarget claims every coin the instant it crosses each zone's own (lower) threshold,
  // never once letting the bank climb as far as the hire's — measured directly (DEBUG_COINS=1):
  // G.coins oscillating in the 0-450 range for the entire post-z_hire run, cashier never hired.
  // Fix: once the hire desk is up and a hire slot is still unfilled, only let buildTarget claim
  // coins for a zone CHEAPER than that pending hire outright; a pricier zone waits (falling back
  // to a cash sweep, which still grows the bank) until the hire itself goes through — tryHires
  // AndUpgrades (called unconditionally at the top of decide(), before this) then fires the
  // instant the balance crosses it, same tick.
  const money = () => {
    const hireCostPending = pendingHireCost(w, G);
    if (hireCostPending != null && (G.coins || 0) < hireCostPending) {
      const bt = buildTarget(w, G);
      if (bt && bt.zoneId) {
        const z = w.area.zones.find(zz => zz.id === bt.zoneId);
        if (z && z.price < hireCostPending) return bt; // strictly cheaper than the pending hire: fine, fund it
      }
      return cashTarget(w); // hold off on a pricier zone — grow the bank toward the hire instead
    }
    return buildTarget(w, G) || cashTarget(w);
  };
  let t;
  if (moneyDue) { t = money(); if (t) B.lastMoneyT = now; else t = chores(); }
  else { t = chores() || money(); if (t && (t.kind === 'cash' || t.kind === 'build')) B.lastMoneyT = now; }
  t = t || null;
  B.kind = t ? t.kind : null;
  B.stationId = t ? (t.stationId || null) : null;
  return t;
}
