// Program §6.2. The owner's playtest report was blunt: "uncleaned tables does not result in
// anything, the flow continues". It was literally true — a paid guest with nowhere clean to sit
// fell into `else { c.state = 'leave' }` with no bubble, no event and no stat, and
// serviceRecoveryCost returned 0 for every reason including 'table'. These tests pin the two
// halves of the fix: the guest now visibly gives up and reports it, and the mature service policy
// (day >= 8) has one bounded refund for exactly this failure and no other.
//
// Batch 7 (owner playtest, 2026-09-11): "you did nothing about the tables ... the used tables
// majority of times do not show that they were used or need cleaning, only sometimes randomly".
// The owner's ruling: a paying guest who finds only dirty tables WAITS for a wipe rather than
// turning away after the old 1.2 s 'noSeat' hold — that short hold was literally what produced
// "10 found no clean table" on day 2. waitSeat is now the ONLY path a guest blocked by dirty tables
// can take, for every day-driven guest, not just once the mature policy (day >= 8) is live — see
// src/sim/customers.js's proceedToSeatOrLeave. These tests are updated in place to pin that: the
// same guest behaviour, the same events, just the waitSeat path (with its longer, rescuable
// WAIT_SEAT_GRACE) instead of the old noSeat/NO_SEAT_HOLD one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { createCustomer, stepCustomers, WAIT_SEAT_GRACE } from '../src/sim/customers.js';
import { serviceRecoveryCost, applySeatMiss, TABLE_RECOVERY_CAP } from '../src/sim/serviceQuality.js';

function cafe() {
  const w = createWorld(AREA1, { built: ['z_seats1'] }, 42);
  // Every real run (game.js, tools/bot.js, tools/runtime-bot-parity.js) sets world.dayState, and
  // the seat-miss branch is gated on it so test/nav-fullhouse.test.js keeps replaying the exact
  // pre-6.2 path — see the comment beside that branch in src/sim/customers.js.
  w.dayState = { day: 3, t: 40, phase: 'rush' };
  const seats = [...w.stations.values()].filter(s => s.type === 'seat' && s.active);
  assert.ok(seats.length >= 2, 'z_seats1 should activate at least two seats');
  assert.ok(w.checkouts.length >= 1, 'register1 is active from the start');
  return { w, seats };
}

// A guest standing at the head of the register queue with the sale already banked — the exact
// moment the old code threw them away silently.
function paidGuest(w) {
  const c = createCustomer(1, 'cat', 0, AREA1);
  Object.assign(c, {
    state: 'atRegister', paid: true, amount: 24, slot: 0,
    registerId: w.checkouts[0], wish: { product: 'cookie', treat: false },
  });
  return c;
}

const seatMisses = w => w.events.filter(e => e.type === 'seatMissed');

test('a paid guest with no clean seat waits for a wipe, then reports the miss if none comes', () => {
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);

  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'waitSeat', 'day-driven guests wait for a wipe from day one, not just once the mature policy is live');
  assert.equal(c.mover.hasTarget, false, 'parked, so no stall detector sees an unreachable target');
  assert.equal(seatMisses(w).length, 0, 'the miss is reported on giving up, not on arrival');

  stepCustomers([c], w, () => 8, WAIT_SEAT_GRACE - 0.3);
  assert.equal(c.state, 'waitSeat');
  assert.equal(seatMisses(w).length, 0);

  stepCustomers([c], w, () => 8, 0.4);
  assert.equal(c.state, 'leave');
  assert.equal(w.events.filter(e => e.type === 'tableRefund').length, 1, 'a guest who leaves unfed is refunded');
  assert.equal(seatMisses(w).length, 1);
  assert.equal(seatMisses(w)[0].id, c.id);
});

test('wiping a table inside the wait still seats the guest', () => {
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'waitSeat');

  seats[0].dirty = false;
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'toSeat');
  assert.equal(c.seatId, seats[0].id);
  assert.equal(seats[0].occupied, true);
  assert.equal(seatMisses(w).length, 0, 'a rescued guest was never a missed seat');
});

test('an honestly full cafe is not a seat miss', () => {
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = false; s.occupied = true; }
  const c = paidGuest(w);
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'leave', 'every seat clean and taken: not a service failure, never was');
  assert.equal(seatMisses(w).length, 0);
});

test('a bare sim harness with no day clock keeps the pre-Program-6.2 path', () => {
  const { w, seats } = cafe();
  delete w.dayState;
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'leave', 'no dayState: exactly what test/nav-fullhouse.test.js replays');
  assert.equal(seatMisses(w).length, 0);
});

test('a seat miss costs one missed-seat stat and one point of reputation', () => {
  const G = { dayStats: { served: 3 }, meta: { reputation: 5 } };
  assert.deepEqual(applySeatMiss(G), { missedSeats: 1, reputation: 4, delta: 1 });
  assert.equal(G.dayStats.missedSeats, 1);
  assert.equal(G.meta.reputation, 4);

  applySeatMiss(G);
  assert.equal(G.dayStats.missedSeats, 2);
  assert.equal(G.meta.reputation, 3);

  // Floored at 0: a bad shift can stall the rank, never invert it.
  const fresh = { dayStats: {}, meta: { reputation: 0 } };
  assert.deepEqual(applySeatMiss(fresh), { missedSeats: 1, reputation: 0, delta: 0 });
  assert.equal(fresh.meta.reputation, 0);
  assert.equal(fresh.dayStats.missedSeats, 1);
});

test('the emitted event is what moves the stat and the rank', () => {
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);
  // Exactly what src/systems/visuals.js does with the event each frame. One second past
  // WAIT_SEAT_GRACE at dt=1, so the guest has definitely given up by the end whatever the grace is.
  const G = { dayStats: { served: 0 }, meta: { reputation: 3 }, customers: [c] };
  for (let i = 0; i < WAIT_SEAT_GRACE + 1; i++) {
    stepCustomers([c], w, () => 8, 1);
    for (const e of w.events) if (e.type === 'seatMissed') applySeatMiss(G);
    w.events.length = 0;
  }
  assert.equal(G.dayStats.missedSeats, 1, 'one guest, one miss — never re-counted while leaving');
  assert.equal(G.meta.reputation, 2);
});

test('the dirty-table refund is a quarter of the receipt, capped, from day 8 on', () => {
  assert.equal(serviceRecoveryCost('table', 999, { day: 8, receipt: 40 }), 10);
  assert.equal(serviceRecoveryCost('table', 999, { day: 8, receipt: 31 }), 7, 'rounded down');
  assert.equal(serviceRecoveryCost('table', 999, { day: 12, receipt: 200 }), TABLE_RECOVERY_CAP);
  assert.equal(TABLE_RECOVERY_CAP, 18);
  assert.equal(serviceRecoveryCost('table', 3, { day: 9, receipt: 40 }), 3, 'never more than the wallet holds');
  assert.equal(serviceRecoveryCost('table', 0, { day: 9, receipt: 40 }), 0);
  assert.equal(serviceRecoveryCost('table', 999, { active: true, receipt: 40 }), 10, 'world.servicePolicyActive form');
  assert.equal(serviceRecoveryCost('table', 999, { day: 8, receipt: 0 }), 0);
});

test('early days and every other reason stay free, and unqualified calls stay protected', () => {
  for (const day of [1, 3, 7]) assert.equal(serviceRecoveryCost('table', 999, { day, receipt: 200 }), 0);
  assert.equal(serviceRecoveryCost('table', 999, { active: false, receipt: 200 }), 0);

  for (const day of [1, 8, 20]) {
    for (const reason of ['counter', 'register', 'bowl', 'unknown']) {
      assert.equal(serviceRecoveryCost(reason, 999, { day, receipt: 200 }), 0);
    }
  }
  // The Task-23 decision this file must not undo: a call with no policy context and no receipt
  // is still fee-free for every reason, 'table' included.
  for (const reason of ['counter', 'register', 'bowl', 'table', 'unknown']) {
    assert.equal(serviceRecoveryCost(reason, 999), 0);
    assert.equal(serviceRecoveryCost(reason, 1), 0);
  }
});
