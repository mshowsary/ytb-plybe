// test/spa-lounge.test.js — Batch 4b follow-up (plan 3.9's own stated line: "pets' owners sit
// while pets are pampered"). The spa's own lounge seats (spaSeat1-3, data/area1.js) were furniture
// until now — always active, never occupied, never dirty. This file is the dedicated coverage for
// actually sitting in one: when a spa guest claims a seat, what happens with none free, that a
// spa lounge seat can never leak into an ordinary/terrace guest's own seating (and vice versa),
// that a spent seat gets dirty and cleans exactly like any other table, and that two concurrent
// sessions (groom + bath) never fight over the same seat.
//
// Mirrors test/spa-guests.test.js's own conventions (Object.assign a customer straight into a
// mid-flow state, manAll to keep every relevant station staffed every tick) — see that file's own
// header for why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  createWorld, putOnDisplay, stepRegisters, stepGroomTable, stepBath, cleanSeat,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers, DIRTY_EVERY } from '../src/sim/customers.js';
import { PRODUCTS } from '../src/sim/economy.js';

const price = (k, seated) => (seated ? 999 : (PRODUCTS[k] ? PRODUCTS[k].price : 5));
const LOUNGE_IDS = ['spaSeat1', 'spaSeat2', 'spaSeat3'];
function manAll(w, ids) { for (const id of ids) { const st = w.stations.get(id); if (st && st.active) st.serving = 'owner'; } }

// Batch 6: a seat is wiped every DIRTY_EVERY-th sitting, not every one — the owner's note after
// playing the shipped build was that constant cleaning reads as nagging, not challenge. The two
// tests below are specifically about a spent lounge seat getting dirty and cleaning like any other
// table, so they wind the counter forward to the last sitting of the cycle first; the sitting they
// then run is the one that dirties the seat, which is exactly what they were always asserting.
function primeSeatsForDirt(w) {
  for (const st of w.stations.values()) if (st.type === 'seat') st.uses = DIRTY_EVERY - 1;
}

// ---- claimed only once a session is actually open, never at slot 0 on its own -------------------

test('a groom guest never holds a lounge seat before its session opens, even with every seat free and it already at slot 0', () => {
  const w = createWorld(AREA1, { built: ['z_spa', 'z_groom'] }, 20);
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  // groom1 deliberately left UNMANNED: st.serving is never set, so world.js's stepGroomTable can
  // never open a session — this guest sits at slot 0, unserved, for the whole run.
  const c = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  // 20s: long enough to actually walk the ~25m from spawn to groom1 and settle into 'atGroom'
  // (measured ~13s), short enough that PATIENCE (17s, only drained once genuinely waiting there)
  // hasn't run out yet (measured leaving ~29.5s) — so this samples a guest caught mid-wait, exactly
  // the state a seat-seeking bug would show up in.
  let sawSpaSeatIdEver = false;
  for (let i = 0; i < 30 * 20; i++) {
    stepCustomers([c], w, price, 1 / 30); stepGroomTable(w, 1 / 30);
    if (c.spaSeatId) sawSpaSeatIdEver = true;
    w.events.length = 0;
  }
  assert.equal(sawSpaSeatIdEver, false, 'no session ever opened, so no seat should ever be claimed');
  assert.equal(c.spaSeatId, null);
  assert.equal(c.state, 'atGroom', 'still waiting at the table, patience not yet exhausted');
  for (const id of LOUNGE_IDS) assert.equal(w.stations.get(id).occupied, false, `${id} must stay free — nobody used it`);
});

// ---- the seat is genuinely claimed, occupied, and released once a session DOES open -------------

test('once a manned groom table opens a session, the guest walks to and holds a real lounge seat, freed and dirtied when the session resolves', () => {
  const w = createWorld(AREA1, { built: ['z_spa', 'z_groom'] }, 21);
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  primeSeatsForDirt(w);
  const c = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  let seatId = null, sawOccupied = false, resolvedAt = -1;
  for (let i = 0; i < 30 * 30 && resolvedAt < 0; i++) {
    manAll(w, ['groom1']);
    stepCustomers([c], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    if (c.spaSeatId) { seatId = c.spaSeatId; if (w.stations.get(seatId).occupied) sawOccupied = true; }
    for (const e of w.events) if (e.type === 'groom') resolvedAt = i;
    w.events.length = 0;
  }
  assert.ok(seatId, 'a lounge seat must have been claimed once the session opened');
  assert.ok(LOUNGE_IDS.includes(seatId));
  assert.ok(sawOccupied, 'the station must show the seat occupied while the guest holds it');
  assert.ok(resolvedAt >= 0, 'the session must actually resolve within this window');
  // One more tick lets the guest's own FSM read the resolved session back and release the seat —
  // exactly like the round-trip tests in spa-guests.test.js.
  stepCustomers([c], w, price, 1 / 30);
  assert.equal(c.spaSeatId, null, 'released the instant the resolved session is read back');
  assert.equal(c.spaSeat, null);
  const seat = w.stations.get(seatId);
  assert.equal(seat.occupied, false, 'freed, not left stuck occupied for the next guest');
  assert.equal(seat.dirty, true, 'a lounge seat is NOT exempt from getting dirty — same station shape as any other table');
});

// ---- no lounge seat free: rule 9 — never blocks, never angers, session still runs ----------------

test('no lounge seat free: the guest never leaves the table, and the session still opens, runs and pays normally', () => {
  const w = createWorld(AREA1, { built: ['z_spa', 'z_groom'] }, 22);
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  for (const id of LOUNGE_IDS) w.stations.get(id).occupied = true; // every lounge seat already taken
  const c = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  const groom1 = w.stations.get('groom1');
  const tableSpot = groom1.queue[0];
  let pay = null, everSeated = false, sampledAtTable = false;
  for (let i = 0; i < 30 * 60 && !c.done; i++) {
    manAll(w, ['groom1', ...w.checkouts]);
    stepCustomers([c], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    stepRegisters(w, 1 / 30);
    if (c.spaSeatId) everSeated = true;
    if (groom1.session && groom1.session.customerId === c.id && !groom1.session.resolved) {
      if (Math.hypot(c.x - tableSpot.x, c.z - tableSpot.z) < 0.2) sampledAtTable = true;
    }
    for (const e of w.events) if (e.type === 'pay' && e.id === c.id) pay = e;
    w.events.length = 0;
  }
  assert.equal(everSeated, false, 'no lounge seat was ever free — this guest must never claim one');
  assert.ok(sampledAtTable, 'with no seat to move to, the guest stays physically at the table for its session');
  assert.ok(pay, 'a full lounge must never cost the guest the service itself (rule 9)');
  assert.equal(pay.amount, price('groom', false));
  assert.equal(c.done, true);
  for (const id of LOUNGE_IDS) assert.equal(w.stations.get(id).occupied, true, 'still exactly as this test left them — untouched');
});

// ---- region exclusivity: a lounge seat is a spa-guest-only resource, in both directions ----------

test('an ordinary guest never takes a free spa lounge seat, even when it is the only free seat in the whole café', () => {
  // Only z_spa built: spaSeat1-3 are the only active seat stations that exist anywhere.
  const w = createWorld(AREA1, { built: ['z_spa'] }, 23);
  putOnDisplay(w, 'dispCookie', 'cookie', 5); // dispCookie/register1 are always active, no builtBy
  const c = createCustomer(1, 'cat', 0, AREA1); // ordinary guest — ._spaDecided never runs (no dayState)
  for (let i = 0; i < 30 * 60 && !c.done; i++) {
    const st = w.stations.get('register1'); if (st.active) st.serving = 'owner';
    stepCustomers([c], w, price, 1 / 30);
    stepRegisters(w, 1 / 30);
    w.events.length = 0;
  }
  assert.equal(c.done, true);
  assert.equal(c.seat, null, 'must never be seated at all — a spa seat is the only seat that exists, and it is off-limits');
  assert.equal(c.seatId, null);
  for (const id of LOUNGE_IDS) assert.equal(w.stations.get(id).occupied, false, `${id} must stay untouched by an ordinary guest`);
});

test('a spa guest never ends up in the ordinary c.seat/c.seatId pair, even when an interior seat is free and its own spa is fully booked', () => {
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_spa', 'z_groom'] }, 24);
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  for (const id of LOUNGE_IDS) w.stations.get(id).occupied = true; // spa fully booked
  const c = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  for (let i = 0; i < 30 * 60 && !c.done; i++) {
    manAll(w, ['groom1', ...w.checkouts]);
    stepCustomers([c], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    stepRegisters(w, 1 / 30);
    w.events.length = 0;
  }
  assert.equal(c.done, true);
  assert.equal(c.seat, null, 'plan 3.9: a spa guest never sits at an ordinary café table');
  assert.equal(c.seatId, null);
  assert.equal(w.stations.get('seat1').occupied, false, 'the free interior seat must stay untouched by a spa guest');
});

// ---- two concurrent sessions never fight over the same seat --------------------------------------

test('a groom session and a bath session running at the same time each claim their own distinct lounge seat', () => {
  const w = createWorld(AREA1, { built: ['z_spa', 'z_groom', 'z_bath'] }, 25);
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  const g = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  const b = Object.assign(createCustomer(2, 'dog', 0, AREA1), {
    state: 'toBath', _spaTarget: 'bath1', spaBound: true, _spaDecided: true, order: ['bath'],
    wish: { product: 'cookie', treat: false }, spaArrived: 2, slot: 0,
  });
  let gSeat = null, bSeat = null;
  for (let i = 0; i < 30 * 40 && (!gSeat || !bSeat); i++) {
    manAll(w, ['groom1', 'bath1']);
    stepCustomers([g, b], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    stepBath(w, 1 / 30);
    if (g.spaSeatId) gSeat = g.spaSeatId;
    if (b.spaSeatId) bSeat = b.spaSeatId;
    w.events.length = 0;
  }
  assert.ok(gSeat && bSeat, 'both sessions must have opened and both guests must have found a seat');
  assert.notEqual(gSeat, bSeat, 'two simultaneous guests must never be assigned the same lounge seat');
  assert.equal(w.stations.get(gSeat).occupied, true);
  assert.equal(w.stations.get(bSeat).occupied, true);
});

// ---- dirty/clean round trip: a spent lounge seat is reusable exactly like any other table --------

test('a released lounge seat is cleaned by the ordinary cleanSeat API and can then be claimed by the next spa guest', () => {
  const w = createWorld(AREA1, { built: ['z_spa', 'z_groom'] }, 26);
  w.dayState = { day: 30, t: 0, phase: 'morning' };
  primeSeatsForDirt(w);
  for (const id of LOUNGE_IDS.slice(1)) w.stations.get(id).occupied = true; // only spaSeat1 is free
  const first = Object.assign(createCustomer(1, 'cat', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 1, slot: 0,
  });
  let resolved = false;
  for (let i = 0; i < 30 * 30 && !resolved; i++) {
    manAll(w, ['groom1']);
    stepCustomers([first], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    for (const e of w.events) if (e.type === 'groom') resolved = true;
    w.events.length = 0;
  }
  stepCustomers([first], w, price, 1 / 30); // reads the resolved session back, releases the seat
  assert.equal(first.spaSeatId, null);
  assert.equal(w.stations.get('spaSeat1').dirty, true, 'left dirty by the first guest');
  cleanSeat(w, 'spaSeat1'); // the exact same API staff.js's cleaner and the owner both call
  assert.equal(w.stations.get('spaSeat1').dirty, false);
  assert.equal(w.stations.get('spaSeat1').occupied, false);
  // A second groom guest, arriving after the first has left and the seat is clean, must be able to
  // claim it again — proving the seat is genuinely reusable, not a one-shot resource.
  first.state = 'leave'; first.done = true; // clear the first guest out of groom1's own queue array
  const second = Object.assign(createCustomer(2, 'bunny', 0, AREA1), {
    state: 'toGroom', _spaTarget: 'groom1', spaBound: true, _spaDecided: true, order: ['groom'],
    wish: { product: 'cookie', treat: false }, spaArrived: 2, slot: 0,
  });
  let secondSeat = null;
  for (let i = 0; i < 30 * 40 && !secondSeat; i++) {
    manAll(w, ['groom1']);
    stepCustomers([second], w, price, 1 / 30);
    stepGroomTable(w, 1 / 30);
    if (second.spaSeatId) secondSeat = second.spaSeatId;
    w.events.length = 0;
  }
  assert.equal(secondSeat, 'spaSeat1', 'the only free (and now clean) lounge seat should be the one reused');
});
