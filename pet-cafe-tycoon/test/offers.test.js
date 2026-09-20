// test/offers.test.js — the four rewarded offers (ship plan §1.7 / §1.7a), Batch E2.
//
// The recurring defect in this codebase is correct code nothing calls, and its twin, a caller
// pointing at something deleted. Every case here names the call path from normal play:
//
//   Special Guest  systems/offers.js grantSpecialGuest writes G.specialGuest
//                  -> systems/customers.js spawn() reads it as resolveUniquePetIdentity's
//                     preferredKey and clears it, on the very next café arrival.
//   Helper Pup     restockEverything(world) + refreshWaitingPatience(world, G.customers), both
//                  called from grantHelperPup.
//   Build Boost    applyBuildBoost -> sim/world.js creditZone -> the same 'built' event payZone
//                  emits, which systems/zones.js, the region sync and the checkpoint already read.
//   Double today   src/game.js openDaySummary -> summaryBonusAmount (test/summary-bonus.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone } from '../src/sim/world.js';
import { createCustomer, PATIENCE, VIP_TIP_MULTIPLIER, refreshWaitingPatience } from '../src/sim/customers.js';
import { ensurePetBook, petKey, PET_SPECIES, PET_PROFILES } from '../src/sim/petBook.js';
import { unmetPetKeys } from '../src/sim/petArrivals.js';
import {
  specialGuestPick, specialGuestInvite, helperPupPressure, helperPupNeeded,
  restockEverything, buildBoostFor, applyBuildBoost, waitedSeconds,
  VIP_FRIENDSHIP_VISITS,
} from '../src/sim/offers.js';
import { HELPER_PUP_WAIT_SECONDS, buildBoostAmount } from '../src/sim/adPacing.js';
import { supplyKind, supplyLevel, supplyCap } from '../src/sim/supplies.js';

function meta() { const m = {}; ensurePetBook(m); return m; }
function fullyBuilt() {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) payZone(w, z.id, 1e9, 1e6);
  w.events.length = 0;
  return w;
}

// ---- Special Guest ------------------------------------------------------------------------------

test('the Special Guest picks an unmet pet deterministically, with no RNG', () => {
  const m = meta();
  const world = createWorld(AREA1);
  const a = specialGuestPick(m, world.built);
  const b = specialGuestPick(m, world.built);
  assert.deepEqual(a, b, 'the same save must always propose the same guest');
  assert.equal(a.key, unmetPetKeys(m, world.built)[0], 'catalogue order, exactly like the daily plan');
  // ...and it respects the species gate: a day-1 café has no treat bar, so no bunny may be invited.
  assert.ok(['cat', 'dog'].includes(a.species), `day 1 invited a ${a.species}`);
});

test('the Special Guest never invites a pet the book already has', () => {
  const m = meta();
  const world = createWorld(AREA1);
  // Meet every cat and dog.
  for (const species of ['cat', 'dog']) {
    for (let v = 0; v < PET_PROFILES[species].length; v++) m.petBook[petKey(species, v)] = true;
  }
  assert.equal(specialGuestPick(m, world.built), null, 'nothing left to invite in a day-1 café');
  assert.deepEqual(specialGuestInvite(m, world.built), { key: null, species: null, variant: 0, vip: true },
    'a complete pool becomes the VIP instead of a silent no-op');
});

test('a completed Pet Book turns the Special Guest into a VIP worth 3x and two friendship visits', () => {
  const m = meta();
  const world = fullyBuilt();
  for (const species of PET_SPECIES) {
    for (let v = 0; v < PET_PROFILES[species].length; v++) m.petBook[petKey(species, v)] = true;
  }
  const invite = specialGuestInvite(m, world.built);
  assert.equal(invite.vip, true);
  assert.equal(VIP_TIP_MULTIPLIER, 3, 'ship plan §1.7a: "a VIP who tips 3×"');
  assert.equal(VIP_FRIENDSHIP_VISITS, 2, '...and "counts double for friendship"');
});

test('the VIP tip multiplier is applied where an order is priced, not invented by the offer', async () => {
  // sim/customers.js is the only file that prices an order; the flag is read there, at both sites.
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/sim/customers.js', import.meta.url), 'utf8');
  const uses = src.match(/c\.vip\) c\.amount \*= VIP_TIP_MULTIPLIER/g) || [];
  assert.equal(uses.length, 2, 'the register path and the garden stand path both honour the VIP');
});

// ---- Helper Pup ----------------------------------------------------------------------------------

test('the Helper Pup answers an empty counter with a guest at it', () => {
  const world = fullyBuilt();
  const counterId = world.displays[0];
  const counter = world.stations.get(counterId);
  counter.stock = 0;
  const waiting = { id: 1, done: false, state: 'queue', slot: 0, mood: 'wait', counterId, patience: PATIENCE - 1 };
  const p = helperPupPressure(world, [waiting]);
  assert.equal(p.emptyCounterWithWaiting, 1);
  assert.equal(helperPupNeeded(world, [waiting], { day: 3, phase: 'rush' }), true);
  // ...and never outside a rush, never before day 3, and never with the counter stocked.
  assert.equal(helperPupNeeded(world, [waiting], { day: 3, phase: 'morning' }), false);
  assert.equal(helperPupNeeded(world, [waiting], { day: 2, phase: 'rush' }), false);
  counter.stock = 5;
  assert.equal(helperPupNeeded(world, [waiting], { day: 3, phase: 'rush' }), false);
});

test('the Helper Pup also answers three guests who have each waited five seconds', () => {
  const world = fullyBuilt();
  for (const id of world.displays) world.stations.get(id).stock = 8;
  const mk = (id, waited) => ({ id, done: false, state: 'queue', slot: 1, mood: 'wait', patience: PATIENCE - waited });
  const two = [mk(1, 6), mk(2, 6)];
  assert.equal(helperPupNeeded(world, two, { day: 4, phase: 'rush' }), false, 'two is not a rush');
  const three = [...two, mk(3, 6)];
  assert.equal(helperPupNeeded(world, three, { day: 4, phase: 'rush' }), true);
  // Just under the threshold is not a trigger: the wait is read off patience, which only drains
  // while a guest waits, so there is no second clock to drift.
  const impatient = [mk(1, HELPER_PUP_WAIT_SECONDS - 0.1), mk(2, HELPER_PUP_WAIT_SECONDS - 0.1), mk(3, HELPER_PUP_WAIT_SECONDS - 0.1)];
  assert.equal(helperPupNeeded(world, impatient, { day: 4, phase: 'rush' }), false);
  assert.equal(waitedSeconds({ patience: PATIENCE - 6 }), 6);
  assert.equal(waitedSeconds({ patience: PATIENCE }), 0);
  assert.equal(waitedSeconds(null), 0);
});

test('the crate fills every counter, every machine buffer and every supply', () => {
  const world = fullyBuilt();
  for (const st of world.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'display') st.stock = 0;
    if (st.buffer) st.stock = 0;
    if (st.type === 'coffee') st.beans = 0;
    if (st.type === 'blender') st.fruit = 0;
    if (st.type === 'bowl') st.stock = 0;
  }
  const filled = restockEverything(world);
  assert.ok(filled.counters >= 3, `only ${filled.counters} counters were filled`);
  assert.ok(filled.machines >= 3, `only ${filled.machines} machines were filled`);
  assert.ok(filled.supplies >= 2, `only ${filled.supplies} supplies were filled`);
  for (const st of world.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'display') assert.equal(st.stock, st.capacity, `${st.id} left short`);
    else if (st.buffer) assert.equal(st.stock, st.buffer, `${st.id} left short`);
    if (supplyKind(st)) assert.equal(supplyLevel(st), supplyCap(st), `${st.id} supply left dry`);
  }
  // Idempotent: running it on a full café tops nothing up and claims nothing.
  assert.deepEqual(restockEverything(world), { counters: 0, machines: 0, supplies: 0 });
});

test('the crate restores the patience of the guests who were waiting, and only those', () => {
  const world = fullyBuilt();
  const waiting = createCustomer(1, 'cat', 0, AREA1);
  // Drained the way the sim drains it: setPatience is throttled on the quantized value, so the
  // shadow counter has to match or the refill would legitimately emit nothing.
  waiting.state = 'queue'; waiting.mood = 'wait'; waiting.patience = 3; waiting._patQ = 12;
  const calm = createCustomer(2, 'dog', 0, AREA1);
  calm.state = 'eating'; calm.mood = 'none'; calm.patience = 9;
  const helped = refreshWaitingPatience(world, [waiting, calm]);
  assert.equal(helped, 1);
  assert.equal(waiting.patience, PATIENCE, 'a waiting guest gets its whole patience back');
  assert.equal(calm.patience, 9, 'a guest who was not waiting is untouched');
  assert.ok(world.events.some(e => e.type === 'patience' && e.id === 1),
    'the refill goes through setPatience, so the render bar hears about it');
});

// ---- Build Boost ----------------------------------------------------------------------------------

test('the Build Boost badge appears only on a 40%-paid pad, and never on the first build', () => {
  const world = createWorld(AREA1);
  const zone = AREA1.zones.find(z => z.id === 'z_seats1');
  world.partial[zone.id] = Math.ceil(zone.price * 0.5);
  assert.equal(buildBoostFor(world, zone), null, 'never the player\'s first build');

  // Buy the first pad; the second one is now boostable once it is 40% paid.
  payZone(world, 'z_seats1', 1e9, 1e6);
  const next = AREA1.zones.find(z => z.id === 'z_oven2');
  world.partial[next.id] = Math.floor(next.price * 0.39);
  assert.equal(buildBoostFor(world, next), null, 'under 40% there is nothing worth accelerating');
  world.partial[next.id] = Math.ceil(next.price * 0.4);
  const offer = buildBoostFor(world, next);
  assert.ok(offer, 'a 40%-paid pad is an offer');
  assert.equal(offer.zoneId, next.id);
  assert.equal(offer.amount, buildBoostAmount(world.partial[next.id], next.price));
  assert.equal(buildBoostFor(world, null), null);
});

test('watching the Build Boost pays the pad and can finish it, through the same built event', () => {
  const world = createWorld(AREA1);
  payZone(world, 'z_seats1', 1e9, 1e6);
  world.events.length = 0;
  const zone = AREA1.zones.find(z => z.id === 'z_oven2');

  // Half-way: the boost pays, the pad is not finished, no wallet is touched (there is no wallet here).
  world.partial[zone.id] = Math.ceil(zone.price * 0.4);
  const partialResult = applyBuildBoost(world, zone.id, buildBoostFor(world, zone).amount);
  assert.equal(partialResult.done, false);
  assert.equal(world.partial[zone.id], Math.ceil(zone.price * 0.4) + partialResult.spent);
  assert.equal(world.events.length, 0, 'an unfinished pad raises no event');

  // ...and when the boost completes it, the ordinary 'built' event fires and the stations activate.
  world.partial[zone.id] = zone.price - 10;
  const done = applyBuildBoost(world, zone.id, 999);
  assert.equal(done.spent, 10, 'never pays more than is owed');
  assert.equal(done.done, true);
  assert.ok(world.built.has(zone.id));
  assert.ok(world.events.some(e => e.type === 'built' && e.zoneId === zone.id),
    'systems/zones.js, the region sync and the checkpoint all listen for exactly this');
  for (const id of zone.adds) assert.equal(world.stations.get(id).active, true);
  // A finished pad cannot be boosted again.
  assert.deepEqual(applyBuildBoost(world, zone.id, 500), { spent: 0, done: false });
});

// ---- the surface --------------------------------------------------------------------------------

test('no in-shift offer can surface in the first minute, under a sheet, paused, or mid-drag', async () => {
  const { offerSurfaceAllowed, OFFER_MIN_SESSION_SECONDS } = await import('../src/systems/offers.js');
  assert.equal(OFFER_MIN_SESSION_SECONDS, 60);
  assert.equal(offerSurfaceAllowed({ sessionTime: 0 }), false);
  assert.equal(offerSurfaceAllowed({ sessionTime: 59.999 }), false);
  assert.equal(offerSurfaceAllowed({ sessionTime: 60 }), true);
  const base = { sessionTime: 90 };
  assert.equal(offerSurfaceAllowed({ ...base, sheetOpen: true }), false);
  assert.equal(offerSurfaceAllowed({ ...base, userPaused: true }), false);
  assert.equal(offerSurfaceAllowed({ ...base, inputActive: true }), false);
  assert.equal(offerSurfaceAllowed(base), true);
});

test('every offer has its own reward id, and none of them carries player data', async () => {
  const { REWARD_ID } = await import('../src/systems/offers.js');
  const ids = Object.values(REWARD_ID);
  assert.equal(new Set(ids).size, ids.length, 'two placements sharing an id cannot be told apart');
  for (const id of ids) {
    assert.match(id, /^pet-cafe-[a-z-]+$/, `${id} must be a static slug`);
  }
});

test('the retired placements are gone from the tree, not merely unreachable', async () => {
  const fs = await import('node:fs');
  const root = new URL('../src/', import.meta.url);
  for (const dead of ['sim/relief.js', 'sim/rushCrew.js', 'sim/petPlayBreak.js', 'sim/temporaryHelp.js', 'systems/economyExperience.js']) {
    assert.equal(fs.existsSync(new URL(dead, root)), false, `${dead} served only a cut placement`);
  }
});
