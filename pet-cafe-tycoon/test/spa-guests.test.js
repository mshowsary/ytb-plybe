// test/spa-guests.test.js — Batch 4b (plan 3.9): the spa GUEST flow (sim/customers.js's side).
//
// Mirrors test/photo.test.js's own shape and conventions (buildUpTo the chain, force w.rng.chance
// for a deterministic roll, Object.assign a customer straight into a mid-flow state to isolate one
// branch) because the spa detour is built the same way the photo detour was: a new arrival kind,
// decided once and gated on w.dayState so the untouchable test/nav-fullhouse.test.js and this file's
// own pre-Batch-4b sibling (test/customers.test.js) keep replaying their exact old paths.
//
// Follow-up (plan 3.9's own stated line, "pets' owners sit while pets are pampered"): the two
// round-trip tests below now also track the lounge-seat leg of the SAME full run (claimed once a
// session opens, released once it resolves) so the existing "pay -> served -> c.seat stays null"
// assertions and the new "sat on a real lounge seat for the session" ones are proven against one
// single, real play-through rather than two disconnected setups. The dedicated coverage for the
// lounge seat itself (timing, the no-seat-free fallback, region exclusivity, dirty/clean, two
// concurrent sessions) lives in test/spa-lounge.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  createWorld, payZone, putOnDisplay, stepRegisters, stepGroomTable, stepBath,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers, SPECIES, PATIENCE, SPA_CHANCE_MAX } from '../src/sim/customers.js';
import { PRODUCTS } from '../src/sim/economy.js';

// Unseated price only — a spa guest never sits (see the customers.js comment at its own pricing
// site for why forcing that matters twice over: economy.js's real salePrice doubles a SEATED
// order, which would blow PRODUCTS.groom/bath's 75/85 straight past the plan's 60-90 band).
const price = (k, seated) => (seated ? 999 : (PRODUCTS[k] ? PRODUCTS[k].price : 5));

// Walks the zone `requires` chain up to (and including) `targetId` — identical helper to
// test/photo.test.js's own, generic over the chain so a re-priced/re-ordered chain upstream can't
// silently desync it.
function buildUpTo(w, targetId) {
  const zones = AREA1.zones;
  const need = [];
  let cur = zones.find(z => z.id === targetId);
  while (cur) { need.unshift(cur.id); cur = cur.requires ? zones.find(z => z.id === cur.requires) : null; }
  for (const id of need) { let guard = 0; while (!w.built.has(id) && guard++ < 2000) payZone(w, id, 1e9, 1); }
}
function manAll(w, ids) { for (const id of ids) { const st = w.stations.get(id); if (st && st.active) st.serving = 'owner'; } }

// ---- spaBound: decided once, gated on w.dayState + a real station ------------------------------

test('no dayState (untouched pre-spa path): a guest never becomes spa-bound even with an active spa and a forced-true roll', () => {
  const w = createWorld(AREA1, {}, 1);
  buildUpTo(w, 'z_bath');
  putOnDisplay(w, 'dispCookie', 'cookie', 5);
  w.rng.chance = () => true; // if this were ever consulted, it would say yes
  const c = createCustomer(1, 'cat', 0, AREA1);
  for (let i = 0; i < 30 * 5; i++) stepCustomers([c], w, price, 1 / 30);
  assert.equal(c.spaBound, false);
  assert.notEqual(c.state, 'toGroom');
  assert.notEqual(c.state, 'toBath');
});

test('pre-spa (no groom1/bath1 at all): a guest never becomes spa-bound even with dayState set and a forced-true roll', () => {
  const w = createWorld(AREA1, {}, 2); // nothing built at all
  putOnDisplay(w, 'dispCookie', 'cookie', 5);
  w.dayState = { day: 5, t: 0, phase: 'morning' };
  w.rng.chance = () => true;
  const c = createCustomer(1, 'cat', 0, AREA1);
  for (let i = 0; i < 30 * 5; i++) stepCustomers([c], w, price, 1 / 30);
  assert.equal(c.spaBound, false);
});

test('one active service line draws spa-bound guests at half the rate a fully-built spa does', () => {
  // The rule, not just the number (economyConfig-style placeholder — see SPA_CHANCE_MAX's own
  // comment): chance scales with how much of the spa is open, because one line can only clear
  // half the throughput two lines can.
  function sampleRate(w, n) {
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const c = createCustomer(i + 1, SPECIES[i % SPECIES.length], 0, AREA1);
      stepCustomers([c], w, price, 1 / 30); // spaBound is settled on this one, first tick
      if (c.spaBound) hits++;
    }
    return hits / n;
  }
  const N = 6000;
  const wHalf = createWorld(AREA1, {}, 3);
  buildUpTo(wHalf, 'z_groom'); // groom1 only — bath1 does not exist yet
  wHalf.dayState = { day: 30, t: 0, phase: 'morning' };
  const rHalf = sampleRate(wHalf, N);
  assert.ok(Math.abs(rHalf - SPA_CHANCE_MAX / 2) < 0.03, `expected ~${SPA_CHANCE_MAX / 2}, got ${rHalf}`);

  const wFull = createWorld(AREA1, {}, 4);
  buildUpTo(wFull, 'z_bath'); // groom1 AND bath1
  wFull.dayState = { day: 30, t: 0, phase: 'morning' };
  const rFull = sampleRate(wFull, N);
  assert.ok(Math.abs(rFull - SPA_CHANCE_MAX) < 0.03, `expected ~${SPA_CHANCE_MAX}, got ${rFull}`);
});

// ---- routing: skip food, go straight to whichever service pickSpaStation names ------------------

test('a spa-bound guest skips food entirely: it never queues at a display, and carries the service as its order', () => {
  const w = createWorld(AREA1, {}, 5);
  buildUpTo(w, 'z_bath');
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  w.rng.chance = () => true;
  const c = createCustomer(1, 'dog', 0, AREA1);
  for (let i = 0; i < 90 && (c.state === 'enter'); i++) stepCustomers([c], w, price, 1 / 30);
  assert.ok(c.state === 'toGroom' || c.state === 'toBath', `expected a spa route, got ${c.state}`);
  assert.equal(c.counterId, null, 'never joined a display queue');
  assert.deepEqual(c.order, [c.state === 'toGroom' ? 'groom' : 'bath']);
  assert.equal(c._spaTarget, c.state === 'toGroom' ? 'groom1' : 'bath1');
});

test('with equal load, pickSpaStation falls back to whichever service is physically nearer', () => {
  const w = createWorld(AREA1, {}, 6);
  buildUpTo(w, 'z_bath');
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  w.rng.chance = () => true;
  const c = createCustomer(1, 'dog', 0, AREA1);
  for (let i = 0; i < 90 && c.state === 'enter'; i++) stepCustomers([c], w, price, 1 / 30);
  // groom1's front (12.5,-4.4) is closer to the door (-9.6,4.2) than bath1's (12.5,-6.4) is.
  assert.equal(c.state, 'toGroom');
  assert.equal(c._spaTarget, 'groom1');
});

test('pickSpaStation prefers the less-loaded active service over pure distance, like the register pick', () => {
  const w = createWorld(AREA1, {}, 7);
  buildUpTo(w, 'z_bath');
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  w.rng.chance = () => true;
  // Bias w._spaTally toward groom1 being the busier station this frame — even though groom1's
  // front is the physically closer one (previous test), the load-balance term must win, exactly
  // like pickAnyRegister's own "n < bestN" check outranking its own distance tie-break.
  const dummies = [1, 2, 3].map(i => Object.assign(createCustomer(100 + i, 'cat', 0, AREA1), {
    state: 'atGroom', _spaTarget: 'groom1', slot: i, patience: PATIENCE,
  }));
  const c = createCustomer(1, 'dog', 0, AREA1);
  const list = [...dummies, c];
  for (let i = 0; i < 90 && c.state === 'enter'; i++) stepCustomers(list, w, price, 1 / 30);
  assert.equal(c.state, 'toBath');
  assert.equal(c._spaTarget, 'bath1');
});

test('only groom1 built: every spa-bound guest routes to it (pickSpaStation degrades to "the one that exists")', () => {
  const w = createWorld(AREA1, {}, 8);
  buildUpTo(w, 'z_groom'); // bath1 does not exist yet
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  w.rng.chance = () => true;
  const c = createCustomer(1, 'cat', 0, AREA1);
  for (let i = 0; i < 90 && c.state === 'enter'; i++) stepCustomers([c], w, price, 1 / 30);
  assert.equal(c.state, 'toGroom');
  assert.equal(c._spaTarget, 'groom1');
});

// ---- assignGroomSlots / assignBathSlots (the w._groomQueues / w._bathQueues read-side contract) --

test('assignGroomSlots/assignBathSlots number each station\'s own queue independently, head-of-line first, mirroring assignPhotoSlots', () => {
  const w = createWorld(AREA1, {}, 9);
  buildUpTo(w, 'z_bath');
  const mk = (id, state, target, arrivedSeq) => Object.assign(createCustomer(id, 'cat', 0, AREA1), {
    state, _spaTarget: target, spaArrived: arrivedSeq, slot: 0,
  });
  const list = [
    mk(2, 'atGroom', 'groom1', 3), mk(4, 'atGroom', 'groom1', 1), mk(6, 'atGroom', 'groom1', 2),
    mk(1, 'atBath', 'bath1', 5), mk(3, 'atBath', 'bath1', 4),
  ];
  stepCustomers(list, w, price, 1 / 30);
  assert.deepEqual(w._groomQueues.get('groom1').map(c => c.id), [4, 6, 2]);
  assert.deepEqual(w._bathQueues.get('bath1').map(c => c.id), [3, 1]);
  assert.equal(w._groomQueues.get('groom1').find(c => c.id === 4).slot, 0);
  assert.equal(w._bathQueues.get('bath1').find(c => c.id === 3).slot, 0);
});

// ---- full round trip: service -> register3 -> counted as served --------------------------------

test('a manned grooming table serves the guest, who then pays PRODUCTS.groom.price unseated at register3 and counts as served', () => {
  const w = createWorld(AREA1, {}, 10);
  // z_groom's own ancestor chain (z_spa -> z_splash -> z_photo -> z_terrace -> ...) never passes
  // through z_register3 — data/area1.js's zone tree forks at z_terrace, and z_register3 sits on
  // the OTHER branch (z_icecream -> z_register3 -> z_terraceSeats -> z_restroom), a branch a real
  // player can skip entirely while still buying the whole spa. Building it explicitly here is what
  // actually exercises "pays at register3"; without it pickRegister's own documented fallback
  // (no terrace-side register yet -> nearest interior one) is what a bare buildUpTo would test
  // instead — a real, correct path, just not the one this test names.
  buildUpTo(w, 'z_register3');
  buildUpTo(w, 'z_groom'); // groom1 active; bath1 not yet, so routing is unambiguous
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  w.rng.chance = () => true;
  const c = createCustomer(1, 'cat', 0, AREA1);
  let pay = null;
  // Follow-up: which lounge seat (if any) this guest sat on, and whether it was ever actually
  // marked occupied while held — sampled every tick alongside the existing pay/served tracking, so
  // this stays one continuous run rather than a second setup duplicating the whole round trip.
  let sawSpaSeatId = null, seatWasOccupied = false;
  for (let i = 0; i < 30 * 60 && !c.done; i++) {
    manAll(w, ['groom1', ...w.checkouts]);
    stepCustomers([c], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    stepRegisters(w, 1 / 30);
    for (const e of w.events) if (e.type === 'pay' && e.id === c.id) pay = e;
    if (c.spaSeatId) {
      sawSpaSeatId = c.spaSeatId;
      if (w.stations.get(c.spaSeatId).occupied) seatWasOccupied = true;
    }
    w.events.length = 0;
  }
  assert.ok(pay, 'a pay event must fire for this guest');
  assert.equal(pay.checkoutId, 'register3', 'plan 3.9: a spa guest pays at register3');
  assert.equal(pay.amount, price('groom', false));
  assert.ok(pay.amount >= 60 && pay.amount <= 90, `plan's 60-90 band: got ${pay.amount}`);
  assert.equal(c.done, true);
  assert.equal(c.seat, null, 'a spa guest never sits at an ordinary café table');
  assert.equal(c.seatId, null);
  // Follow-up (plan 3.9's own stated line, "pets' owners sit while pets are pampered"): a lounge
  // seat (spaSeat1-3, always active once z_spa is built — see buildUpTo above) was free the whole
  // time, so this guest must have actually used one for its session, and it must have been marked
  // occupied while it did.
  assert.ok(/^spaSeat[123]$/.test(sawSpaSeatId || ''), `expected a real lounge seat id, got ${sawSpaSeatId}`);
  assert.ok(seatWasOccupied, 'the claimed lounge seat must be marked occupied while this guest holds it');
  assert.equal(c.spaSeatId, null, 'released once the session resolved and the guest moved on to pay');
  assert.equal(c.spaSeat, null);
  const seat = w.stations.get(sawSpaSeatId);
  assert.equal(seat.occupied, false, 'freed, not left stuck occupied');
  assert.equal(seat.dirty, true, 'a lounge seat gets dirty like any other table once its guest is done with it');
});

test('a manned bath tub serves the guest, stamps c.sparkleUntil, and the guest still pays and counts as served', () => {
  const w = createWorld(AREA1, {}, 11);
  buildUpTo(w, 'z_register3'); // see the groom test above — a separate branch off z_terrace
  buildUpTo(w, 'z_bath');
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  // Fast-forward straight into 'toBath' (routing itself is covered above) so this test is only
  // about the service -> payment -> sparkle leg, mirroring photo.test.js's own Object.assign style.
  const c = Object.assign(createCustomer(1, 'dog', 0, AREA1), {
    state: 'toBath', _spaTarget: 'bath1', spaBound: true, _spaDecided: true, order: ['bath'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  let pay = null;
  // Follow-up: BATH_DURATION (3s) is shorter than the walk from bath1 to the lounge (~12m at
  // CUSTOMER_SPEED), so this guest's session can resolve before it physically arrives — the seat
  // is still claimed (and marked occupied) the instant the session opens, which is what this
  // samples, regardless of whether the walk itself ever completes.
  let sawSpaSeatId = null, seatWasOccupied = false;
  for (let i = 0; i < 30 * 60 && !c.done; i++) {
    manAll(w, ['bath1', ...w.checkouts]);
    stepCustomers([c], w, price, 1 / 30);
    stepBath(w, 1 / 30);
    stepRegisters(w, 1 / 30);
    for (const e of w.events) if (e.type === 'pay' && e.id === c.id) pay = e;
    if (c.spaSeatId) {
      sawSpaSeatId = c.spaSeatId;
      if (w.stations.get(c.spaSeatId).occupied) seatWasOccupied = true;
    }
    w.events.length = 0;
  }
  assert.ok(pay);
  assert.equal(pay.checkoutId, 'register3');
  assert.equal(pay.amount, price('bath', false));
  assert.ok(/^spaSeat[123]$/.test(sawSpaSeatId || ''), `expected a real lounge seat id, got ${sawSpaSeatId}`);
  assert.ok(seatWasOccupied, 'the claimed lounge seat must be marked occupied while this guest holds it');
  assert.equal(c.spaSeatId, null, 'released once the bath resolved');
  const seat = w.stations.get(sawSpaSeatId);
  assert.equal(seat.occupied, false);
  assert.equal(seat.dirty, true, 'a lounge seat gets dirty like any other table once its guest is done with it');
  assert.ok(c.sparkleUntil > 0, 'a bath must stamp the render-only sparkle flag (world.js\'s own clearBathSession comment)');
  assert.ok(c.done);
});

test('a groom session never stamps c.sparkleUntil — it is bath-only', () => {
  const w = createWorld(AREA1, {}, 12);
  buildUpTo(w, 'z_groom');
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  const c = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  for (let i = 0; i < 30 * 30 && !c.done; i++) {
    manAll(w, ['groom1', ...w.checkouts]);
    stepCustomers([c], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    stepRegisters(w, 1 / 30);
    w.events.length = 0;
  }
  assert.equal(c.sparkleUntil, 0);
});

// ---- unstaffed spa: settle for the other service once, then a genuine service miss --------------

test('unmanned spa: the guest tries the other service once after SETTLE_WAIT, then gives up lost/angry — never reaching a register', () => {
  const w = createWorld(AREA1, {}, 13);
  buildUpTo(w, 'z_bath'); // both groom1 and bath1 exist; neither is ever manned below
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  w.rng.chance = () => true;
  const c = createCustomer(1, 'cat', 0, AREA1);
  const events = [];
  for (let i = 0; i < 30 * 120 && c.state !== 'leave'; i++) {
    stepCustomers([c], w, price, 1 / 30); // no station, no register ever manned
    events.push(...w.events);
    w.events.length = 0;
  }
  assert.equal(c.state, 'leave');
  assert.ok(events.some(e => e.type === 'settled' && e.from !== e.to), 'must try the other spa service once before giving up entirely');
  assert.ok(events.some(e => e.type === 'lost' && (e.reason === 'groom' || e.reason === 'bath')));
  assert.ok(events.some(e => e.type === 'angry'));
  assert.equal(c.registerId, null, 'never reached a register — no service, no charge');
  assert.equal(c.paid, false);
});

// ---- pricing correctness: never doubled by seated/holiday logic that does not apply -------------

test('a spa guest\'s wish (still rolled, but never eaten) cannot double its bill via the holiday-cupcake rule', () => {
  const w = createWorld(AREA1, {}, 14);
  buildUpTo(w, 'z_register3'); // register3 must actually be active to reach this branch at all
  buildUpTo(w, 'z_groom');
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  const c = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toRegister', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cupcake', treat: false, holiday: true }, // an unrelated food wish, still set
    registerId: 'register3', regArrived: 1, slot: 0,
  });
  manAll(w, [...w.checkouts]);
  for (let i = 0; i < 30 * 20 && !c.paid; i++) { stepCustomers([c], w, price, 1 / 30); stepRegisters(w, 1 / 30); w.events.length = 0; }
  assert.equal(c.amount, price('groom', false), 'holiday doubling must not apply to an order the guest never actually wished for');
});
