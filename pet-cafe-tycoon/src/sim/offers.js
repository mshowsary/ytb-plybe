// src/sim/offers.js — WHEN each rewarded offer is earned, and WHAT it does to the café.
//
// Pure simulation (ship plan §1.7a). No DOM, no three.js, no Math.random, no Date.now: every
// decision is a function of the world and the save, so node:test, tools/bot.js and the live game
// all reach the same answer. src/systems/offers.js owns the pictures, the ad call and the world
// actors; sim/adPacing.js owns the caps and the claim keys.
//
// THE FOUR OFFERS
//   Special Guest  a pet the Pet Book has never seen walks in next — chosen DETERMINISTICALLY from
//                  the unmet set (catalogue order, exactly like sim/petArrivals.js's daily plan) so
//                  the seeded spawn stream is untouched. With the book full it is a VIP instead.
//   Helper Pup     a courier fills every counter, machine and supply and refreshes the patience of
//                  the guests who were waiting.
//   Build Boost    pays up to half of the pad the owner is standing on.
//   Double today   lives entirely in sim/adPacing.js summaryBonusAmount.
import { unmetPetKeys } from './petArrivals.js';
import { parsePetKey } from './petBook.js';
import { PATIENCE, VIP_TIP_MULTIPLIER } from './customers.js';
import { supplyKind, supplyCap, supplyLevel, refilledInPlace } from './supplies.js';
import { creditZone } from './world.js';
import {
  HELPER_PUP_MIN_DAY, HELPER_PUP_WAIT_SECONDS, HELPER_PUP_WAITING_GUESTS,
  buildBoostEligible, buildBoostAmount,
} from './adPacing.js';

// ---- Special Guest --------------------------------------------------------------------------

/**
 * Who the Special Guest brings. The FIRST unmet pet this café could meet, in catalogue order —
 * the same deterministic pick dailyPetPlan makes, so watching the ad never contradicts the day's
 * own promised face. Returns null when the book is complete: the caller shows a VIP instead.
 */
export function specialGuestPick(meta, built) {
  const unmet = unmetPetKeys(meta, built);
  if (!unmet.length) return null;
  const parsed = parsePetKey(unmet[0]);
  return parsed ? { key: unmet[0], species: parsed.species, variant: parsed.variant } : null;
}

/** The whole reward, as one record the systems layer hands to systems/customers.js. */
export function specialGuestInvite(meta, built) {
  const pick = specialGuestPick(meta, built);
  return pick ? { ...pick, vip: false } : { key: null, species: null, variant: 0, vip: true };
}

/** The VIP's multipliers. The tip lives in sim/customers.js (the only file that prices an order)
 *  and is re-exported here so every reader of the offer has one import. */
export { VIP_TIP_MULTIPLIER };
export const VIP_FRIENDSHIP_VISITS = 2;

// ---- Helper Pup -----------------------------------------------------------------------------

/**
 * How long a guest has been waiting, in seconds. Patience only ever drains while a guest waits
 * (sim/customers.js setPatience is the single writer and it is reset to PATIENCE on every state
 * change), so PATIENCE - patience IS the wait — no second clock, and the same number headless.
 */
export const waitedSeconds = c => (c && typeof c.patience === 'number' ? Math.max(0, PATIENCE - c.patience) : 0);

/**
 * The pressure the pup answers (§1.7a): a counter standing EMPTY with a guest waiting at it, or
 * HELPER_PUP_WAITING_GUESTS guests who have each waited HELPER_PUP_WAIT_SECONDS.
 */
export function helperPupPressure(world, customers, waitedFor = waitedSeconds) {
  let emptyCounterWithWaiting = 0, longWaiters = 0;
  for (const c of customers || []) {
    if (!c || c.done) continue;
    if (c.mood === 'wait' && waitedFor(c) >= HELPER_PUP_WAIT_SECONDS) longWaiters++;
    if (c.state !== 'queue' || c.slot !== 0 || c.mood !== 'wait') continue;
    const counter = c.counterId && world && world.stations && world.stations.get(c.counterId);
    if (counter && counter.active && (counter.stock | 0) <= 0) emptyCounterWithWaiting++;
  }
  return { emptyCounterWithWaiting, longWaiters };
}

export function helperPupNeeded(world, customers, dayState, waitedFor = waitedSeconds) {
  if (!dayState || (dayState.day | 0) < HELPER_PUP_MIN_DAY || dayState.phase !== 'rush') return false;
  const p = helperPupPressure(world, customers, waitedFor);
  return p.emptyCounterWithWaiting >= 1 || p.longWaiters >= HELPER_PUP_WAITING_GUESTS;
}

/**
 * The crate. Fills every active display to capacity, every machine's finished-goods buffer, and
 * every supply a machine drinks. Returns what it actually topped up, so the caller can celebrate
 * the real number instead of a promise.
 */
export function restockEverything(world) {
  if (!world || !world.stations) return { counters: 0, machines: 0, supplies: 0 };
  let counters = 0, machines = 0, supplies = 0;
  for (const st of world.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'display' && (st.stock | 0) < (st.capacity | 0)) { st.stock = st.capacity | 0; counters++; }
    else if (st.buffer && (st.stock | 0) < (st.buffer | 0)) { st.stock = st.buffer | 0; machines++; }
    // The bowl is a display of treats with its own bin; supplyCap/supplyLevel know every machine's
    // differently-named consumable (beans, kibble, fruit), so nothing is special-cased here.
    const supply = supplyKind(st);
    if (!supply) continue;
    const cap = supplyCap(st), level = supplyLevel(st);
    if (!(cap > level)) continue;
    if (st.type === 'coffee') st.beans = cap;
    else if (st.type === 'blender') st.fruit = cap;
    else if (refilledInPlace(st)) st.stock = cap;
    else continue;
    supplies++;
  }
  return { counters, machines, supplies };
}

// ---- Build Boost ------------------------------------------------------------------------------

/**
 * The pad the ▶ badge belongs on, or null. `zone` is whichever plot the owner is standing in
 * (systems/zones.js already resolves exactly one, so the badge can never argue with the plot that
 * would take the payment). Never the player's FIRST build: a café with nothing built yet has no
 * "almost there" to accelerate, and the first pad is the tutorial.
 */
export function buildBoostFor(world, zone) {
  if (!world || !zone) return null;
  if (!world.built || world.built.size < 1) return null;
  if (world.built.has(zone.id)) return null;
  const paid = (world.partial && world.partial[zone.id]) || 0;
  if (!buildBoostEligible(paid, zone.price)) return null;
  const amount = buildBoostAmount(paid, zone.price);
  if (amount <= 0) return null;
  return { zoneId: zone.id, x: zone.x, z: zone.z, paid, price: zone.price, amount };
}

/**
 * Pay the boost into the pad, through sim/world.js creditZone so a boosted build raises the same
 * 'built' event as a hand-paid one. Never touches the wallet: the ad, not the player, is paying.
 * Returns { spent, done }.
 */
export function applyBuildBoost(world, zoneId, amount) {
  return creditZone(world, zoneId, amount);
}
