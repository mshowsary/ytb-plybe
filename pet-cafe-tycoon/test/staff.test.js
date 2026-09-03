import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { STAFF } from '../src/sim/economy.js';
function run(list, w, seconds, onCollect = () => {}) { for (let t = 0; t < seconds; t += 1 / 30) stepStaff(list, w, 1 / 30, onCollect); }
test('runner restocks an empty display from a full oven', () => {
  const w = createWorld(AREA1);
  w.stations.get('oven1').stock = 6;
  const oven = w.stations.get('oven1');
  const runner = createStaff('runner', oven.front);
  run([runner], w, 8);
  assert.equal(w.stations.get('dispCookie').stock, 6);
  assert.equal(w.stations.get('oven1').stock < 6, true); // drained then refilling
});
// Loop v2 Task 1: one display per product — there's no more "two counters holding the same
// product" to pick between (the old test this replaces). What's left to verify: an unassigned
// runner delivers its carried batch to the ONE display that actually matches the product (a
// direct lookup — see src/sim/staff.js's displayFor), not some other, unrelated display.
test('an unassigned runner delivers its carried product to the matching display (direct lookup)', () => {
  const w = createWorld(AREA1, { built: ['z_oven2'] });
  const dispCookie = w.stations.get('dispCookie'), dispCupcake = w.stations.get('dispCupcake');
  const runner = createStaff('runner', dispCupcake.front);
  runner.items = ['cupcake', 'cupcake'];
  run([runner], w, 4);
  assert.ok(dispCupcake.stock > 0, 'runner should have dropped cupcakes on dispCupcake');
  assert.equal(dispCookie.stock, 0, 'the cookie display should be untouched');
});

// T3 — with a single, already-full display the runner has nowhere else to drop, so 'idle' just
// re-targets the same display and bounces straight back into 'dropping' (displayFor has no
// capacity awareness, unchanged by this fix); the two invariants I4 actually promises — the
// timer never exceeding 0.1, and 'dropping' being left within 0.2s of entering it full — both hold
// regardless of that bounce, so that's what's asserted here.
test('runner with a full display leaves dropping within 0.2s and s.timer stays <= 0.1', () => {
  const w = createWorld(AREA1);
  const c1 = w.stations.get('dispCookie');
  c1.stock = c1.capacity; // display is already full
  const runner = createStaff('runner', c1.front);
  runner.items = ['cookie', 'cookie', 'cookie'];
  runner.state = 'dropping'; runner.target = 'dispCookie'; runner.timer = 0;
  let leftAt = null;
  for (let t = 0; t < 0.2; t += 1 / 30) {
    stepStaff([runner], w, 1 / 30, () => {});
    assert.ok(runner.timer <= 0.1 + 1e-9, `timer=${runner.timer} at t=${t.toFixed(3)}`);
    if (runner.state !== 'dropping' && leftAt === null) leftAt = t;
  }
  assert.ok(leftAt !== null && leftAt <= 0.2, `left 'dropping' at ${leftAt}`);
  assert.equal(c1.stock, c1.capacity, 'the full display never received a placed item');
});

// M3 T3 — the cashier no longer sweeps piles on a timer; it mans a register (sets st.serving =
// 'cashier' while stationed at its cash spot) and world.js's stepRegisters — called once per tick
// from inside stepStaff itself, always, regardless of whether any staff are hired — does the
// actual per-customer processing/pay. These tests drive stepStaff directly against a manufactured
// register queue (the shape sim/customers.js's w._regQueues produces), mirroring how
// test/world.test.js exercises stepRegisters in isolation.
function manQueue(w, id, amount) {
  const st = w.stations.get(id);
  const c = { id: 1, slot: 0, state: 'atRegister', paid: false, amount, x: st.queue[0].x, z: st.queue[0].z, mover: { hasTarget: false } };
  w._regQueues = new Map([[id, [c]]]);
  return c;
}
test('cashier stands at its register\'s cash spot and mans it: one customer processed within 1.1s (level-1 rate 1.0s)', () => {
  const w = createWorld(AREA1);
  const co = w.stations.get('register1');
  const c = manQueue(w, 'register1', 30);
  const cashier = createStaff('cashier', co.cash);
  run([cashier], w, 1.1);
  assert.equal(c.paid, true);
  assert.equal(co.pile, 30);
  assert.ok(Math.hypot(cashier.x - co.cash.x, cashier.z - co.cash.z) < 0.1, 'cashier should be standing at the cash spot');
});
test('with no cashier hired, a register never gets served (nobody sets st.serving)', () => {
  const w = createWorld(AREA1);
  const co = w.stations.get('register1');
  const c = manQueue(w, 'register1', 30);
  run([], w, 3); // stepStaff([], ...) still runs stepRegisters every tick — see the doc comment above
  assert.equal(c.paid, false);
  assert.equal(co.pile, 0);
});
// Task 4: the cleaner walks to the nearest dirty seat and clears it in 1.6s (level 1).
test('the cleaner cleans a dirtied seat within 10s', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = w.stations.get('seat1');
  seat.dirty = true;
  const cleaner = createStaff('cleaner', { x: 9, z: 6 }); // far corner of the floor: walking time counts too
  run([cleaner], w, 10);
  assert.equal(seat.dirty, false, 'seat should be clean within 10s');
});
test('the cleaner picks the NEAREST dirty seat, not just the first one', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const near = w.stations.get('seat1'), far = w.stations.get('seat2');
  near.dirty = true; far.dirty = true;
  const cleaner = createStaff('cleaner', near.front);
  run([cleaner], w, 2); // enough to arrive + finish cleaning the near one, not the far one too
  assert.equal(near.dirty, false, 'the near seat should be cleaned first');
});
test('Task 4: a runner restocks from the coffee machine when it has the most stock', () => {
  const w = createWorld(AREA1, { built: ['z_coffee'] });
  const coffee = w.stations.get('coffee1');
  coffee.stock = 6; // more than any oven (both start at 0)
  const runner = createStaff('runner', coffee.front);
  run([runner], w, 8);
  const barCoffee = w.stations.get('barCoffee');
  assert.ok(barCoffee.stock > 0, 'the runner should have restocked coffee cups onto barCoffee');
  assert.ok(coffee.stock < 6, 'coffee stock should have been drained by the runner');
});
// M3 T5 fix round 1 — findings 1 & 2: systems/staff.js was calling the sim's stepStaff without a
// `levels` argument, so a purchased Speed/Carry level never reached the live mover; these mirror
// what the systems layer now passes (G.staffLevels) directly against the sim function itself.
test('fix round 1: a runner Speed level (tier 2) rescales its mover speed to STAFF.runner.speed * 1.4 after one step', () => {
  const w = createWorld(AREA1);
  const runner = createStaff('runner', { x: 0, z: 0 });
  const levels = { runner: { speed: 2, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };
  stepStaff([runner], w, 1 / 30, () => {}, levels);
  assert.ok(Math.abs(runner.mover.speed - STAFF.runner.speed * 1.4) < 1e-9, `mover.speed=${runner.mover.speed}`);
});
test('fix round 1: a runner Carry level 1 (RUNNER_CARRY_LEVELS[1] = 9) lets it carry up to 9 items', () => {
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'); oven.stock = 20;
  const runner = createStaff('runner', oven.front);
  const levels = { runner: { speed: 0, carry: 1 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };
  let maxItems = 0;
  for (let t = 0; t < 6; t += 1 / 30) {
    stepStaff([runner], w, 1 / 30, () => {}, levels);
    maxItems = Math.max(maxItems, runner.items.length);
  }
  assert.equal(maxItems, 9, 'a level-1 (tier index 1) runner should cap at 9 items, not the base 6');
});
test('one cashier patrols to whichever active register has the longer queue once idle at an empty one', () => {
  const w = createWorld(AREA1, { built: ['z_register2'] });
  const co1 = w.stations.get('register1'), co2 = w.stations.get('register2');
  // register2 has someone waiting, register1 doesn't — the cashier starts at register1 (w.checkouts[0])
  const c2 = manQueue(w, 'register2', 20);
  w._regQueues.set('register1', []); // register1's queue is empty
  const cashier = createStaff('cashier', co1.cash);
  run([cashier], w, 6);
  assert.equal(c2.paid, true, 'cashier should have walked over to register2 and served the waiting customer');
  assert.equal(co2.pile, 20);
  assert.equal(co1.pile, 0);
});

// Final review fix 1: walkTo's old `return justArrived || !m.hasTarget` had no distance check, so
// a mover that's genuinely idle (hasTarget false) but physically far from a re-commanded target
// that happens to equal its stale last-planned (tx, tz) — setTarget gets skipped since the target
// "didn't change" — used to read as "arrived" instantly regardless of distance (measured: a runner
// loaded cookies from an oven whose front it was 15m from). These reproduce that exact stale-
// target condition directly on the mover, then confirm the invariant the fix promises: no action
// (loading/cleaning) happens until the mover has actually walked to within 0.35m.
test('fix: a runner never loads from an oven while more than 0.35m from its front, even with a stale matching last-planned target', () => {
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1');
  const spawn = { x: oven.front.x, z: oven.front.z + 8 }; // 8m away, clear straight line on the fresh (unbuilt) layout
  const runner = createStaff('runner', spawn);
  oven.stock = 0;
  run([runner], w, 1 / 30); // idle warm-up: parks at spawn, mover.tx/tz = spawn, hasTarget settles false
  // Simulate the exact stale-target condition the old walkTo collapsed on: the mover's last
  // commanded (tx, tz) already equals the oven's front (as if it had targeted this exact oven
  // before), but the runner is still physically 8m away and hasTarget is false.
  runner.mover.tx = oven.front.x; runner.mover.tz = oven.front.z; runner.mover.hasTarget = false;
  oven.stock = 1; // flips 0->1 while the runner is still 8m away
  let reachedOnce = false, loadedAtSomePoint = false;
  for (let t = 0; t < 10; t += 1 / 30) {
    run([runner], w, 1 / 30);
    const dist = Math.hypot(runner.x - oven.front.x, runner.z - oven.front.z);
    if (dist < 0.35) reachedOnce = true;
    if (runner.items.length > 0) loadedAtSomePoint = true;
    if (!reachedOnce) {
      assert.equal(runner.items.length, 0, `must not have loaded while dist=${dist.toFixed(2)} at t=${t.toFixed(2)}`);
      assert.equal(oven.stock, 1, `oven stock must be untouched while dist=${dist.toFixed(2)} at t=${t.toFixed(2)}`);
    }
  }
  assert.ok(reachedOnce, 'runner should have actually walked to within 0.35m of the oven front');
  // The runner may have already delivered its load onward to a counter by the end of the 10s
  // window (a full oven->counter cycle), so check it loaded at SOME point, not that it's still
  // holding items right now.
  assert.ok(loadedAtSomePoint, 'runner should have loaded once it truly arrived');
});
test('fix: a cleaner never cleans a re-dirtied seat while more than 0.35m from its front, even with a stale matching last-planned target', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = w.stations.get('seat1');
  const spawn = { x: seat.front.x + 8, z: seat.front.z }; // 8m away, clear straight line
  const cleaner = createStaff('cleaner', spawn);
  seat.dirty = false;
  run([cleaner], w, 1 / 30); // idle warm-up: parks at spawn
  cleaner.mover.tx = seat.front.x; cleaner.mover.tz = seat.front.z; cleaner.mover.hasTarget = false;
  seat.dirty = true; // re-dirtied while the cleaner is still 8m away
  let reachedOnce = false;
  for (let t = 0; t < 10; t += 1 / 30) {
    run([cleaner], w, 1 / 30);
    const dist = Math.hypot(cleaner.x - seat.front.x, cleaner.z - seat.front.z);
    if (dist < 0.35) reachedOnce = true;
    if (!reachedOnce) assert.equal(seat.dirty, true, `seat must stay dirty while dist=${dist.toFixed(2)} at t=${t.toFixed(2)}`);
  }
  assert.ok(reachedOnce, 'cleaner should have actually walked to within 0.35m of the seat front');
  assert.equal(seat.dirty, false, 'seat should be clean once the cleaner truly arrived and finished');
});

// Final review fix 4: w._movers used to only ever be appended to by stepStaff, never cleared,
// trusting stepCustomers to have reset it earlier the same tick — a caller that drives stepStaff
// without ever calling stepCustomers (this test; also a real frame where customers genuinely
// didn't run) grew it forever.
test('fix: w._movers stays bounded across 300 stepStaff-only ticks (no stepCustomers call in between)', () => {
  const w = createWorld(AREA1);
  const runner = createStaff('runner', { x: 0, z: 0 });
  const cleaner = createStaff('cleaner', { x: 1, z: 1 });
  const list = [runner, cleaner];
  for (let i = 0; i < 300; i++) stepStaff(list, w, 1 / 30, () => {});
  assert.ok(w._movers.length <= list.length, `w._movers.length=${w._movers.length} should be <= ${list.length}`);
});
