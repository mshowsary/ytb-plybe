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
  // 2026-09-18: no refund. A guest who runs out of patience for a table takes their order away —
  // they keep what they bought and the café keeps the money. 'tableRefund' handed the payment back
  // (systems/customers.js applyServicePenalty), which fined the player for a queue they were
  // already working through, after the sale had closed. The MISS is still reported: it is the stat
  // the day card shows and the Paw Rating's table goal reads, and it costs one reputation point.
  assert.equal(w.events.filter(e => e.type === 'tableRefund').length, 0, 'a guest who cannot sit takes it away; the sale stands');
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

// 2026-09-18: an honestly full café is now worth WAITING for — a taken table frees itself when that
// meal ends, and turning a paying guest away from a busy room was the owner's "six wait for two
// tables, I clean them, and four leave". It is still not a service failure: no dirty table, no
// reputation point, whatever the guest decides to do in the end.
test('an honestly full cafe is taken away with a smile, not waited out', () => {
  // Rewritten: a guest used to stand for 18 s hoping somebody else would finish their meal. Waiting
  // is now only for a table the PLAYER can free — a dirty one, one wipe away — because waiting on
  // another guest's lunch is neither actionable nor how a café behaves. Measured over 60 days once
  // ★2 raised arrivals: guests who gave up on a table fell from 0.0309 to 0.0011 per guest, rush
  // friction from 65.0% to 59.6%, and the café served MORE (92 guests on day 49 against 81), since
  // nobody spends the rush standing still. The acceptance the old test carried — a full, clean café
  // is never counted as a failure and never charged — is unchanged and asserted below.
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = false; s.occupied = true; }
  const c = paidGuest(w);
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'leave', 'every seat clean and taken: the order goes with them');
  assert.equal(seatMisses(w).length, 0, 'a clean, busy café is a café doing well, not a failure');
  assert.equal(w.events.filter(e => e.type === 'tableRefund').length, 0);

  // One dirty table and the same guest waits, because now there IS something the player can do.
  const { w: w2, seats: seats2 } = cafe();
  for (const s of seats2) { s.dirty = false; s.occupied = true; }
  seats2[0].occupied = false; seats2[0].dirty = true;
  const c2 = paidGuest(w2);
  stepCustomers([c2], w2, () => 8, 0.1);
  assert.equal(c2.state, 'waitSeat', 'a wipe away is worth waiting for');
});

test('a guest waiting for a table hovers by the tables, not at the till', () => {
  const { w, seats } = cafe();
  for (const s of seats) { s.dirty = true; s.occupied = false; }
  const c = paidGuest(w);
  const till = w.stations.get(w.checkouts[0]);
  c.x = till.x; c.z = till.z + 1;
  stepCustomers([c], w, () => 8, 0.1);
  assert.equal(c.state, 'waitSeat');
  const p = c.waitSeatPoint;
  assert.ok(p, 'a waiting guest is given somewhere to wait');
  const nearestSeat = Math.min(...seats.map(s => Math.hypot(s.x - p.x, s.z - p.z)));
  assert.ok(nearestSeat < 2, `the wait spot is beside a table (nearest seat ${nearestSeat.toFixed(2)} m)`);
  assert.ok(Math.hypot(till.x - p.x, till.z - p.z) > 2,
    'and not beside the register, where the guests who still owe money are queueing');
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

// Never punishing (docs/SHIP-PLAN-2026-09-19.md rule 3): a missed seat is COUNTED — the Paw
// Rating's seat window and the summary read it — but it no longer costs a reputation point. With no
// Cleaner hired, that drain took 17 points in one shift while the tables filled up.
test('a seat miss counts one missed-seat stat and costs no reputation', () => {
  const G = { dayStats: { served: 3 }, meta: { reputation: 5 } };
  assert.deepEqual(applySeatMiss(G), { missedSeats: 1, reputation: 5, delta: 0 });
  assert.equal(G.dayStats.missedSeats, 1);
  assert.equal(G.meta.reputation, 5);

  applySeatMiss(G);
  assert.equal(G.dayStats.missedSeats, 2);
  assert.equal(G.meta.reputation, 5, 'a second miss takes nothing either');

  const fresh = { dayStats: {}, meta: { reputation: 0 } };
  assert.deepEqual(applySeatMiss(fresh), { missedSeats: 1, reputation: 0, delta: 0 });
  assert.equal(fresh.meta.reputation, 0);
  assert.equal(fresh.dayStats.missedSeats, 1);
});

test('the emitted event moves the stat, never the rank', () => {
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
  assert.equal(G.meta.reputation, 3, 'the guest leaving is the whole consequence');
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
