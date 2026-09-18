// test/spa-stations.test.js — Batch 4b, the Pet Spa's session stations (plan 3.9).
//
// groom1/bath1 mirror photo1's SHAPE (world.js's own template, test/photo.test.js pins it): a
// 5-slot queue, a one-guest-at-a-time session, a tip pile paid via addCash, and an auto-resolve
// timeout so neither the headless bot nor the in-game auto-play bot can ever stall on one. This
// file proves the two divergences from that template — groom's 3-beat rhythm scoring instead of a
// single judged shot, and bath's water gate/no-input session/sparkle handoff — plus boutique's
// bare pile shape and all three types' persistence (stationState.js).
//
// The guest FSM (sim/customers.js toGroom/atGroom, toBath/atBath) is being built in parallel by
// another agent and is NOT exercised here: instead of stepCustomers(), these tests populate
// w._groomQueues / w._bathQueues directly with a fake slot-0 "head" customer, shaped exactly like
// what assignPhotoSlots (customers.js) already produces for w._photoQueues — id, state, slot,
// x/z, mover.hasTarget, species, petVariant. That is the exact contract the two halves meet on;
// see this file's own header comment in the task brief for the full statement of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  createWorld, payZone,
  stepGroomTable, resolveGroomBeat, resolveGroomSession, clearGroomSession,
  groomPulseScale, groomJudgeQuality, groomTipAmount,
  GROOM_BEATS, GROOM_BEAT_SECONDS, GROOM_AUTO_RESOLVE, GROOM_TARGET_SCALE,
  GROOM_PULSE_START, GROOM_PULSE_END,
  stepBath, refillWater, resolveBathSession, clearBathSession, bathTipAmount,
  BATH_WATER_CAP, BATH_DURATION, BATH_SPARKLE_SECONDS,
} from '../src/sim/world.js';
import {
  STATION_STATE_VERSION, normalizeStationState, snapshotStationState, restoreStationState,
} from '../src/sim/stationState.js';

// Walks the zone `requires` chain up to (and including) `targetId`, paying each in full — same
// generic helper as test/photo.test.js's own buildUpTo, so a re-priced chain can't desync this file.
function buildUpTo(w, targetId) {
  const zones = AREA1.zones;
  const need = [];
  let cur = zones.find(z => z.id === targetId);
  while (cur) { need.unshift(cur.id); cur = cur.requires ? zones.find(z => z.id === cur.requires) : null; }
  for (const id of need) { let guard = 0; while (!w.built.has(id) && guard++ < 2000) payZone(w, id, 1e9, 1); }
}
function stationOfType(w, type) {
  for (const st of w.stations.values()) if (st.type === type) return st;
  return null;
}
// A fake slot-0 "head" customer, shaped exactly like what assignPhotoSlots (customers.js) already
// produces for the photo queue's own head — the exact contract customers.js's forthcoming
// assignGroomSlots/assignBathSlots must also satisfy.
function headCustomerAt(id, st, state, species = 'cat', petVariant = 0) {
  const q0 = st.queue[0];
  return {
    id, state, species, petVariant, x: q0.x, z: q0.z, slot: 0,
    mover: { hasTarget: false, x: q0.x, z: q0.z },
  };
}

// ---------------------------------------------------------------------------------------------
// STATION SHAPE
// ---------------------------------------------------------------------------------------------

test('groom1/bath1/boutique1 are real station shapes once built', () => {
  const w = createWorld(AREA1, {}, 1);
  buildUpTo(w, 'z_boutique');
  const groom = stationOfType(w, 'groom');
  const bath = stationOfType(w, 'bath');
  const boutique = stationOfType(w, 'boutique');

  assert.ok(groom && groom.active);
  assert.equal(groom.pile, 0);
  assert.equal(groom.serving, '');
  assert.equal(groom.session, null);
  assert.equal(groom.queue.length, 5);

  assert.ok(bath && bath.active);
  assert.equal(bath.pile, 0);
  assert.equal(bath.serving, '');
  assert.equal(bath.session, null);
  assert.equal(bath.queue.length, 5);
  assert.equal(bath.water, BATH_WATER_CAP);

  assert.ok(boutique && boutique.active);
  assert.equal(boutique.pile, 0);
  assert.equal(boutique.queue, undefined, 'boutique is a shopfront, not a queued session station');
  assert.equal(boutique.session, undefined);
});

// ---------------------------------------------------------------------------------------------
// GROOM — 3-beat rhythm session
// ---------------------------------------------------------------------------------------------

test('a manned groom table starts a session for the waiting guest, and 3 judged beats total into a quality that pays the pile', () => {
  const w = createWorld(AREA1, {}, 2);
  buildUpTo(w, 'z_groom');
  const st = stationOfType(w, 'groom');
  const head = headCustomerAt(11, st, 'atGroom');
  w._groomQueues = new Map([[st.id, [head]]]);

  st.serving = true;
  stepGroomTable(w, 1 / 30, () => 1); // friendship tier 1, injected — sim never reads meta itself
  assert.ok(st.session, 'a session should have started for the slot-0 guest');
  assert.equal(st.session.customerId, 11);
  assert.equal(st.session.tier, 1);
  assert.equal(st.session.beatScores.length, 0);
  assert.ok(w.events.some(e => e.type === 'groomStart' && e.id === 11));
  w.events.length = 0;

  // Three releases, all dead on the beat: perfect, perfect, good -> average mult (2+2+1.3)/3 = 1.77,
  // which buckets to 'good' (>= GROOM_QUALITY_MULT.good=1.3, < perfect=2).
  let r1 = resolveGroomBeat(w, st.id, GROOM_TARGET_SCALE);
  assert.equal(r1.quality, 'perfect');
  assert.equal(st.session.resolved, false, 'the session stays open after 1 of 3 beats');
  let r2 = resolveGroomBeat(w, st.id, GROOM_TARGET_SCALE + 0.02);
  assert.equal(r2.quality, 'perfect');
  let r3 = resolveGroomBeat(w, st.id, GROOM_TARGET_SCALE + 0.15); // outside +-0.08, inside +-0.22
  assert.equal(r3.quality, 'good');

  assert.equal(st.session.resolved, true, 'the 3rd beat totals the session');
  assert.equal(st.session.quality, 'good');
  const expectedTip = groomTipAmount(1, 'good');
  assert.equal(st.session.tip, expectedTip);
  assert.equal(st.pile, expectedTip, 'the tip lands in the table\'s own pile via addCash');
  assert.ok(w.events.some(e => e.type === 'groom' && e.id === 11 && e.stationId === st.id && e.quality === 'good' && e.tip === expectedTip));

  clearGroomSession(w, st.id);
  assert.equal(st.session, null, 'clearGroomSession frees the table for the next guest');
});

test('resolveGroomBeat is a no-op once the session is already resolved (idempotent past the last beat)', () => {
  const w = createWorld(AREA1, {}, 3);
  buildUpTo(w, 'z_groom');
  const st = stationOfType(w, 'groom');
  const head = headCustomerAt(20, st, 'atGroom');
  w._groomQueues = new Map([[st.id, [head]]]);
  st.serving = true;
  stepGroomTable(w, 1 / 30);
  resolveGroomBeat(w, st.id, GROOM_TARGET_SCALE);
  resolveGroomBeat(w, st.id, GROOM_TARGET_SCALE);
  resolveGroomBeat(w, st.id, GROOM_TARGET_SCALE);
  assert.equal(st.session.resolved, true);
  const pileAfterFirstResolve = st.pile;
  const again = resolveGroomBeat(w, st.id, GROOM_TARGET_SCALE);
  assert.equal(again, null, 'a stray 4th release must not score a 4th beat');
  assert.equal(st.pile, pileAfterFirstResolve, 'and must not double-pay');
  const sessionAgain = resolveGroomSession(w, st.id);
  assert.equal(sessionAgain, null, 'resolveGroomSession is likewise idempotent past resolution');
});

test('GROOM_AUTO_RESOLVE ends an untouched session as \'ok\' well before either bot could stall on it', () => {
  const w = createWorld(AREA1, {}, 4);
  buildUpTo(w, 'z_groom');
  const st = stationOfType(w, 'groom');
  const head = headCustomerAt(30, st, 'atGroom');
  w._groomQueues = new Map([[st.id, [head]]]);
  st.serving = true;
  stepGroomTable(w, 1 / 30);
  assert.ok(st.session);

  let paid = null;
  const budget = GROOM_BEATS * (GROOM_AUTO_RESOLVE + 0.5); // generous ceiling, still finite
  for (let t = 0; t < budget && !st.session.resolved; t += 1 / 30) {
    stepGroomTable(w, 1 / 30); // nobody ever calls resolveGroomBeat
    for (const e of w.events) if (e.type === 'groom') paid = e;
    w.events.length = 0;
  }
  assert.equal(st.session.resolved, true, 'the session must not stall forever unplayed');
  assert.equal(st.session.quality, 'ok');
  assert.ok(paid, 'the timeout path still pays the tray');
  assert.equal(paid.quality, 'ok');
  assert.equal(paid.tip, groomTipAmount(0, 'ok'));
});

test('groomPulseScale shrinks from START to END over GROOM_BEAT_SECONDS and clamps past it', () => {
  const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
  assert.ok(close(groomPulseScale(0), GROOM_PULSE_START));
  assert.ok(close(groomPulseScale(GROOM_BEAT_SECONDS), GROOM_PULSE_END));
  assert.ok(close(groomPulseScale(GROOM_BEAT_SECONDS * 5), GROOM_PULSE_END));
  assert.ok(close(groomPulseScale(-1), GROOM_PULSE_START));
});

test('groomJudgeQuality bands mirror perfect/good/ok exactly like the photo booth\'s own bands', () => {
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE), 'perfect');
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE + 0.05), 'perfect');
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE + 0.15), 'good');
  assert.equal(groomJudgeQuality(GROOM_TARGET_SCALE + 0.3), 'ok');
});

// ---------------------------------------------------------------------------------------------
// BATH — water gate, no-input session, sparkle handoff
// ---------------------------------------------------------------------------------------------

test('a manned, watered tub starts a session, consumes 1 water, runs BATH_DURATION with no input, and pays the pile', () => {
  const w = createWorld(AREA1, {}, 5);
  buildUpTo(w, 'z_bath');
  const st = stationOfType(w, 'bath');
  const head = headCustomerAt(40, st, 'atBath', 'dog', 2);
  w._bathQueues = new Map([[st.id, [head]]]);
  const startingWater = st.water;

  st.serving = true;
  stepBath(w, 1 / 30, () => 2);
  assert.ok(st.session, 'a session should have started for the slot-0 guest');
  assert.equal(st.water, startingWater - 1, 'starting a bath consumes exactly 1 water');
  assert.ok(w.events.some(e => e.type === 'bathStart' && e.id === 40));
  w.events.length = 0;

  let paid = null;
  for (let t = 0; t < BATH_DURATION + 1 && !st.session.resolved; t += 1 / 30) {
    stepBath(w, 1 / 30);
    for (const e of w.events) if (e.type === 'bath') paid = e;
    w.events.length = 0;
  }
  assert.equal(st.session.resolved, true);
  const expectedTip = bathTipAmount(2);
  assert.ok(paid, 'the session must resolve and pay on its own — no player input at all');
  assert.equal(paid.tip, expectedTip);
  assert.equal(paid.stationId, st.id);
  assert.equal(paid.id, 40);
  assert.equal(paid.quality, undefined, 'bath has no mini-game to score a quality from');
  assert.equal(st.pile, expectedTip);

  clearBathSession(w, st.id);
  assert.equal(st.session, null);
});

test('a dry tub cannot start a session even when manned with a guest waiting at slot 0', () => {
  const w = createWorld(AREA1, {}, 6);
  buildUpTo(w, 'z_bath');
  const st = stationOfType(w, 'bath');
  st.water = 0;
  const head = headCustomerAt(41, st, 'atBath');
  w._bathQueues = new Map([[st.id, [head]]]);

  st.serving = true;
  stepBath(w, 1 / 30);
  assert.equal(st.session, null, 'no water, no session — the guest is left waiting (bounded by its own patience in customers.js)');
  assert.equal(w.events.some(e => e.type === 'bathStart'), false);

  // Topping up even 1 unit is enough for the very next manned tick to start a session.
  refillWater(w, st.id, 1);
  assert.equal(st.water, 1);
  st.serving = true;
  stepBath(w, 1 / 30);
  assert.ok(st.session, 'a single refilled unit of water is enough to start exactly one bath');
  assert.equal(st.water, 0);
});

test('refillWater mirrors refillCream/refillBeans exactly: room-capped, returns the amount actually drawn', () => {
  const w = createWorld(AREA1, {}, 7);
  buildUpTo(w, 'z_bath');
  const st = stationOfType(w, 'bath');
  st.water = 0;
  assert.equal(refillWater(w, st.id, 12), 12);
  assert.equal(st.water, 12);
  // Only room for 8 more up to the cap, even though a full 20-unit sack is offered.
  assert.equal(refillWater(w, st.id, BATH_WATER_CAP), BATH_WATER_CAP - 12);
  assert.equal(st.water, BATH_WATER_CAP);
  // A tank already full draws nothing further.
  assert.equal(refillWater(w, st.id, 5), 0);
  assert.equal(st.water, BATH_WATER_CAP);
});

test('bathTipAmount scales with tier and has no quality multiplier (there is no mini-game)', () => {
  assert.equal(bathTipAmount(0), 25);
  assert.equal(bathTipAmount(3), 25 + 12 * 3);
  assert.equal(bathTipAmount(9), 25 + 12 * 3, 'tier clamps at 3 like every other friendship-tier input');
});

test('a resolved bath session hands the render layer everything it needs for the sparkle flag, without world.js touching the guest itself', () => {
  // world.js's own contract: BATH_SPARKLE_SECONDS is exported and w.t is a monotonic clock that
  // keeps advancing across calls to stepBath, so the guest FSM (sim/customers.js, not this file)
  // can stamp c.sparkleUntil = w.t + BATH_SPARKLE_SECONDS the instant it reads a resolved session.
  const w = createWorld(AREA1, {}, 8);
  buildUpTo(w, 'z_bath');
  assert.equal(BATH_SPARKLE_SECONDS, 20);
  assert.equal(w.t, undefined, 'the clock does not exist until something steps it');
  stepBath(w, 1 / 2);
  assert.equal(w.t, 0.5);
  stepBath(w, 1 / 2);
  assert.equal(w.t, 1, 'w.t keeps advancing across calls, unconditionally');
});

// ---------------------------------------------------------------------------------------------
// PERSISTENCE (rule 9) — normalizeRow / resetRuntimeStation / restoreStationState
// ---------------------------------------------------------------------------------------------

const ALL_BUILDS = AREA1.zones.map(z => z.id);
const fullSpaWorld = () => createWorld(AREA1, { built: ALL_BUILDS });

test('groom/bath/boutique piles (and bath water) round-trip through a snapshot/restore cycle', () => {
  const w = fullSpaWorld();
  const groom = stationOfType(w, 'groom');
  const bath = stationOfType(w, 'bath');
  const boutique = stationOfType(w, 'boutique');
  groom.pile = 210;
  bath.pile = 340;
  bath.water = 7;
  boutique.pile = 55;

  const payload = snapshotStationState(w, {});
  assert.deepEqual(payload.byId[groom.id], { pile: 210 });
  assert.deepEqual(payload.byId[bath.id], { pile: 340, water: 7 });
  assert.deepEqual(payload.byId[boutique.id], { pile: 55 });

  const restored = fullSpaWorld();
  // Prove restore starts from stale live values rather than accidentally inheriting them.
  Object.assign(restored.stations.get(groom.id), { pile: 1, serving: 'owner', session: { fake: true } });
  Object.assign(restored.stations.get(bath.id), { pile: 1, water: 3, serving: 'owner', session: { fake: true } });
  restored.stations.get(boutique.id).pile = 1;
  assert.equal(restoreStationState(restored, payload, {}), true);

  assert.equal(restored.stations.get(groom.id).pile, 210);
  assert.equal(restored.stations.get(groom.id).serving, '');
  assert.equal(restored.stations.get(groom.id).session, null, 'sessions are transient, never restored');
  assert.equal(restored.stations.get(bath.id).pile, 340);
  assert.equal(restored.stations.get(bath.id).water, 7);
  assert.equal(restored.stations.get(bath.id).session, null);
  assert.equal(restored.stations.get(boutique.id).pile, 55);
});

test('a missing station payload (legacy save) leaves a fresh full water tank untouched — water is "kept", not reset to a fixed default', () => {
  const w = fullSpaWorld();
  const bath = stationOfType(w, 'bath');
  bath.water = 4; // simulate an already-live world with a partially used tank
  assert.equal(restoreStationState(w, null, {}), true);
  assert.equal(w.stations.get(bath.id).water, 4, 'no payload at all leaves the live value exactly as it was');
  assert.equal(w.stations.get(bath.id).pile, 0);
});

test('a forged save cannot set water above BATH_WATER_CAP — it collapses to zero, never to a full tank', () => {
  const built = new Set(ALL_BUILDS);
  const bathId = stationOfType(createWorld(AREA1, { built: ALL_BUILDS }), 'bath').id;
  const raw = {
    v: STATION_STATE_VERSION,
    byId: { [bathId]: { pile: 50, water: BATH_WATER_CAP + 500 } },
  };
  const normalized = normalizeStationState(raw, AREA1, built, {}, 1_000_000);
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.data.byId[bathId], { pile: 50, water: 0 });

  // A negative/non-finite forged value collapses the same way.
  const raw2 = { v: STATION_STATE_VERSION, byId: { [bathId]: { pile: 1, water: -5 } } };
  const normalized2 = normalizeStationState(raw2, AREA1, built, {}, 1_000_000);
  assert.deepEqual(normalized2.data.byId[bathId], { pile: 1, water: 0 });

  // An honest, in-range value round-trips exactly.
  const raw3 = { v: STATION_STATE_VERSION, byId: { [bathId]: { pile: 1, water: BATH_WATER_CAP } } };
  const normalized3 = normalizeStationState(raw3, AREA1, built, {}, 1_000_000);
  assert.deepEqual(normalized3.data.byId[bathId], { pile: 1, water: BATH_WATER_CAP });
});

test('a forged groom/boutique pile beyond maxPile collapses to zero, exactly like a register/photo pile', () => {
  const built = new Set(ALL_BUILDS);
  const w = createWorld(AREA1, { built: ALL_BUILDS });
  const groomId = stationOfType(w, 'groom').id;
  const boutiqueId = stationOfType(w, 'boutique').id;
  const raw = {
    v: STATION_STATE_VERSION,
    byId: { [groomId]: { pile: 999 }, [boutiqueId]: { pile: 999 } },
  };
  const normalized = normalizeStationState(raw, AREA1, built, {}, 500);
  assert.deepEqual(normalized.data.byId[groomId], { pile: 0 });
  assert.deepEqual(normalized.data.byId[boutiqueId], { pile: 0 });
});

test('an inactive groom/bath/boutique station is dropped entirely by normalization', () => {
  const built = new Set(['z_seats1']); // none of the spa chain built
  const w = createWorld(AREA1, {}, 9);
  const groomId = stationOfType(w, 'groom').id;
  const bathId = stationOfType(w, 'bath').id;
  const boutiqueId = stationOfType(w, 'boutique').id;
  const raw = {
    v: STATION_STATE_VERSION,
    byId: {
      [groomId]: { pile: 40 },
      [bathId]: { pile: 40, water: 10 },
      [boutiqueId]: { pile: 40 },
    },
  };
  const normalized = normalizeStationState(raw, AREA1, built, {}, 1_000_000);
  assert.equal(normalized.data.byId[groomId], undefined);
  assert.equal(normalized.data.byId[bathId], undefined);
  assert.equal(normalized.data.byId[boutiqueId], undefined);
});
