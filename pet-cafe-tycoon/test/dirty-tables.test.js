// Program §6.2. The owner's playtest report was blunt: "uncleaned tables does not result in
// anything, the flow continues". It was literally true — a paid guest with nowhere clean to sit
// fell into `else { c.state = 'leave' }` with no bubble, no event and no stat, and
// serviceRecoveryCost returned 0 for every reason including 'table'. These tests pin the two
// halves of the fix: the guest now visibly gives up and reports it, and the mature service policy
// (day >= 8) has one bounded refund for exactly this failure and no other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { createCustomer, stepCustomers, NO_SEAT_HOLD } from '../src/sim/customers.js';
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

test('a paid guest with no clean seat holds under the bubble, then reports the miss', () => {
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);

  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'noSeat');
  assert.equal(c.mover.hasTarget, false, 'parked, so no stall detector sees an unreachable target');
  assert.equal(seatMisses(w).length, 0, 'the miss is reported on the way out, not on arrival');

  stepCustomers([c], w, () => 8, NO_SEAT_HOLD - 0.3);
  assert.equal(c.state, 'noSeat');
  assert.equal(seatMisses(w).length, 0);

  stepCustomers([c], w, () => 8, 0.4);
  assert.equal(c.state, 'leave');
  assert.equal(seatMisses(w).length, 1);
  assert.equal(seatMisses(w)[0].id, c.id);
});

test('wiping a table inside the hold still seats the guest', () => {
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'noSeat');

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

test('a bare sim harness with no day clock keeps the pre-6.2 path', () => {
  const { w, seats } = cafe();
  delete w.dayState;
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'leave', 'no dayState: exactly what test/nav-fullhouse.test.js replays');
  assert.equal(seatMisses(w).length, 0);
});

test('the mature grace period reports the miss when it finally runs out', () => {
  const { w, seats } = cafe();
  w.servicePolicyActive = true;
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);

  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'waitSeat', 'day >= 8 keeps its longer, refundable grace period');

  stepCustomers([c], w, () => 8, 8);
  assert.equal(c.state, 'leave');
  assert.equal(w.events.filter(e => e.type === 'tableRefund').length, 1);
  assert.equal(seatMisses(w).length, 1, 'the refund alone was invisible; the miss is now counted too');
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
  // Exactly what src/systems/visuals.js does with the event each frame.
  const G = { dayStats: { served: 0 }, meta: { reputation: 3 }, customers: [c] };
  for (let i = 0; i < 30; i++) {
    stepCustomers([c], w, () => 8, 0.1);
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
