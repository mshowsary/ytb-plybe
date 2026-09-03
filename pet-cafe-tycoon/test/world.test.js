// test/world.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, activeZones, payZone, stepOvens, takeFromOven, putOnDisplay, takeFromDisplay, takeTreat, addCash, collectCash, freeSeat, refreshActive, seatById, stepRegisters } from '../src/sim/world.js';
test('initial world has only pre-built stations active', () => {
  const w = createWorld(AREA1);
  assert.equal(w.stations.get('oven1').active, true);
  assert.equal(w.stations.get('dispCupcake').active, false);
  assert.deepEqual(activeZones(w).map(z => z.id), ['z_seats1']);
  assert.equal(freeSeat(w), null);
});
// Loop v2 Task 1 new layout (data/area1.js): 2 ovens + coffee1 + pantry1 + blender1 (5
// machines/pantry) + return1 + 4 displays + 2 registers (code type 'checkout') + 1 bowl + 3
// bushes + 6 seats + hire + kiosk = 24 stations, 9 zones in the chain.
test('AREA1 has 24 stations and 9 zones', () => {
  assert.equal(AREA1.stations.length, 24);
  assert.equal(AREA1.zones.length, 9);
});
test('exactly oven1, dispCookie, register1, kiosk1, return1 are active at start (kiosk/return need no zone)', () => {
  const w = createWorld(AREA1);
  const active = [...w.stations.values()].filter(st => st.active).map(st => st.id).sort();
  assert.deepEqual(active, ['dispCookie', 'kiosk1', 'oven1', 'register1', 'return1']);
});
test('building the whole zone chain in order activates every station and rebuilds w.boxes', () => {
  const w = createWorld(AREA1);
  for (const z of AREA1.zones) {
    let r; do { r = payZone(w, z.id, 100000, 1); } while (!r.done);
  }
  const inactive = [...w.stations.values()].filter(st => !st.active);
  assert.deepEqual(inactive, []);
  assert.equal(w.boxes.length, 24);
});
test('paying a zone drains and completes', () => {
  const w = createWorld(AREA1);
  // Loop v2 Task 3: z_seats1 tuned 65 -> 90 (within the task's +40% bound); rate = max(50, 90/2)
  // = 50/s either way (90/2 = 45 is still under the 50 floor), so r1 is unchanged — only the
  // remaining balance (and hence r2's spend) grows with the new price.
  const r1 = payZone(w, 'z_seats1', 1000, 0.5); // rate = max(50, 90/2) = 50/s → 25
  assert.equal(r1.spent, 25); assert.equal(r1.done, false); assert.equal(w.partial.z_seats1, 25);
  const r2 = payZone(w, 'z_seats1', 1000, 10);
  assert.equal(r2.spent, 65); assert.equal(r2.done, true); // 90 - 25 remaining
  assert.equal(w.stations.get('seat1').active, true);
  assert.deepEqual(activeZones(w).map(z => z.id), ['z_oven2']);
  assert.deepEqual(w.events.pop(), { type: 'built', zoneId: 'z_seats1' });
});
test('pay is capped by coins', () => {
  const w = createWorld(AREA1);
  assert.equal(payZone(w, 'z_seats1', 10, 10).spent, 10);
});
test('ovens bake and displays hold', () => {
  const w = createWorld(AREA1);
  stepOvens(w, 1.2 * 3 + 0.01);
  assert.equal(w.stations.get('oven1').stock, 3);
  assert.equal(takeFromOven(w, 'oven1', 5), 3);
  assert.equal(putOnDisplay(w, 'dispCookie', 'cookie', 3), 3);
  assert.equal(takeFromDisplay(w, 'dispCookie'), 'cookie');
  assert.equal(w.stations.get('dispCookie').stock, 2);
  addCash(w, 'register1', 12); assert.equal(collectCash(w, 'register1'), 12); assert.equal(collectCash(w, 'register1'), 0);
});
test('payZone spends the same total for the same wall-clock time at 30, 60 and 144 fps', () => {
  const sums = [30, 60, 144].map(fps => {
    const w = createWorld(AREA1);
    const n = Math.round(0.6 * fps);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += payZone(w, 'z_seats1', 100000, 1 / fps).spent;
    return sum;
  });
  assert.ok(Math.max(...sums) - Math.min(...sums) <= 1, 'sums: ' + sums.join(','));
  for (const s of sums) assert.ok(s <= 65);
});
test('restores from save', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'], partial: { z_oven2: 40 } });
  assert.equal(w.stations.get('seat1').active, true); assert.equal(w.partial.z_oven2, 40);
});
test('st.queue is 5 entries spaced 0.85m starting 1.4m in front of dispCupcake along +z', () => {
  const w = createWorld(AREA1);
  const c2 = w.stations.get('dispCupcake');
  assert.equal(c2.queue.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(c2.queue[i].x - c2.x) < 1e-9);
    assert.ok(Math.abs(c2.queue[i].z - (c2.z + 1.4 + i * 0.85)) < 1e-9);
  }
});
// M3 T3 fix round 2: dispCookie needs no queueRight offset — the seat layout moved to a single
// row at z 6.0 (was two rows including one sharing its x=2.0 column), so its 5-slot queue
// (z -0.6..2.8) no longer runs into any seat footprint.
test('dispCookie.queue is NOT offset (no seat conflict in the single-row layout), still 0.85m-spaced along +z', () => {
  const w = createWorld(AREA1);
  const c1 = w.stations.get('dispCookie');
  assert.equal(c1.queue.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(c1.queue[i].x - c1.x) < 1e-9);
    assert.ok(Math.abs(c1.queue[i].z - (c1.z + 1.4 + i * 0.85)) < 1e-9);
  }
});
test('a rotated station (rot pi/2) has front at +x', () => {
  const area = { ...AREA1, stations: [...AREA1.stations, { id: 'rot1', type: 'display', x: 2, z: 2, rot: Math.PI / 2, product: 'cookie', capacity: 12 }] };
  const w = createWorld(area);
  const st = w.stations.get('rot1');
  assert.ok(Math.abs(st.front.x - (st.x + 1.3)) < 1e-9);
  assert.ok(Math.abs(st.front.z - st.z) < 1e-9);
});
test('refreshActive lists both cupcake-chain displays after building z_oven2 (requires z_seats1 first)', () => {
  const w = createWorld(AREA1);
  assert.deepEqual(w.displays, ['dispCookie']);
  assert.deepEqual(w.checkouts, ['register1']);
  payZone(w, 'z_seats1', 1000, 10);
  payZone(w, 'z_oven2', 1000, 10);
  assert.deepEqual(w.displays.slice().sort(), ['dispCookie', 'dispCupcake']);
  refreshActive(w); // idempotent, callable directly too
  assert.deepEqual(w.displays.slice().sort(), ['dispCookie', 'dispCupcake']);
});
test('freeSeat returns null with no seats, and pair geometry after z_seats1', () => {
  const w = createWorld(AREA1);
  assert.equal(freeSeat(w), null);
  const w2 = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = freeSeat(w2);
  assert.ok(seat);
  assert.ok(seat.pair && seat.pair.human && seat.pair.pet);
  const d = Math.hypot(seat.pair.pet.x - seat.pair.human.x, seat.pair.pet.z - seat.pair.human.z);
  assert.ok(Math.abs(d - 0.6) < 1e-9);
  assert.equal(seatById(w2, seat.id), seat);
});

// M3 T3
test('createWorld sets w.rng (a src/core/rng.js instance), deterministic by seed', () => {
  const w1 = createWorld(AREA1, null, 42);
  const w2 = createWorld(AREA1, null, 42);
  assert.equal(typeof w1.rng.f, 'function');
  const seq1 = [w1.rng.f(), w1.rng.f(), w1.rng.f()];
  const seq2 = [w2.rng.f(), w2.rng.f(), w2.rng.f()];
  assert.deepEqual(seq1, seq2);
  // default seed (no seed arg) is stable too
  const w3 = createWorld(AREA1);
  const w4 = createWorld(AREA1);
  assert.equal(w3.rng.f(), w4.rng.f());
});

// Loop v2 Task 1: replaces the old shared-counter takeProduct test — a display only ever holds
// ITS OWN fixed product (st.product), one unit at a time; any other key is rejected outright.
test('putOnDisplay rejects any other product; takeFromDisplay always returns the fixed one, one at a time', () => {
  const w = createWorld(AREA1);
  assert.equal(putOnDisplay(w, 'dispCookie', 'cookie', 3), 3);
  assert.equal(putOnDisplay(w, 'dispCookie', 'cupcake', 2), 0, 'a display rejects any other product outright');
  assert.equal(w.stations.get('dispCookie').stock, 3);
  assert.equal(takeFromDisplay(w, 'dispCookie'), 'cookie');
  assert.equal(takeFromDisplay(w, 'dispCookie'), 'cookie');
  assert.equal(w.stations.get('dispCookie').stock, 1);
  assert.equal(takeFromDisplay(w, 'dispCookie'), 'cookie');
  assert.equal(takeFromDisplay(w, 'dispCookie'), null, 'empty once drained');
});

test('bowl1: capacity 10, stock 0 at creation; takeTreat decrements and reports the count taken', () => {
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_garden', 'z_seats2', 'z_bowl'] });
  const bowl = w.stations.get('bowl1');
  assert.equal(bowl.active, true); assert.equal(bowl.capacity, 10); assert.equal(bowl.stock, 0);
  assert.equal(takeTreat(w, 'bowl1'), 0);
  bowl.stock = 3;
  assert.equal(takeTreat(w, 'bowl1'), 1); assert.equal(bowl.stock, 2);
});

test('bush/coffee/blender/pantry station records carry the fields Task 4 will use', () => {
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_garden', 'z_seats2', 'z_bowl', 'z_blender'] });
  assert.deepEqual(w.stations.get('bush1').stage, 0);
  const coffee = w.stations.get('coffee1');
  assert.deepEqual({ beans: coffee.beans, stock: coffee.stock, buffer: coffee.buffer, timer: coffee.timer }, { beans: 20, stock: 0, buffer: 8, timer: 0 });
  const blender = w.stations.get('blender1');
  assert.deepEqual({ fruit: blender.fruit, stock: blender.stock, buffer: blender.buffer, timer: blender.timer }, { fruit: 0, stock: 0, buffer: 8, timer: 0 });
  assert.ok(w.stations.get('pantry1'));
});

test('registers reuse the display queue geometry: register1.queue is 5 entries spaced 0.85m starting 1.4m in front', () => {
  const w = createWorld(AREA1);
  const r1 = w.stations.get('register1');
  assert.equal(r1.queue.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(r1.queue[i].x - r1.x) < 1e-9);
    assert.ok(Math.abs(r1.queue[i].z - (r1.z + 1.4 + i * 0.85)) < 1e-9);
  }
});

test('stepRegisters: an unmanned register never processes; owner rate 0.6s, cashier level-1 rate 1.0s', () => {
  const w = createWorld(AREA1);
  const st = w.stations.get('register1');
  w._regQueues = new Map([['register1', [{ id: 1, slot: 0, state: 'atRegister', paid: false, amount: 12, x: st.queue[0].x, z: st.queue[0].z, mover: { hasTarget: false } }]]]);
  // unmanned: no amount of time processes anyone
  for (let i = 0; i < 60; i++) stepRegisters(w, 1 / 30);
  assert.equal(st.pile, 0);
  // owner-manned: exactly one process per 0.6s (serving is set externally every frame, same as
  // the systems layer does — stepRegisters itself resets it to '' at the end of every call)
  st.serving = 'owner'; stepRegisters(w, 0.59); assert.equal(st.pile, 0);
  st.serving = 'owner'; stepRegisters(w, 0.02); assert.equal(st.pile, 12);
  assert.equal(w._regQueues.get('register1')[0].paid, true);
});

test('stepRegisters: idle manning does not bank credit — cadence stays capped at one per rate even after 5s of empty manning', () => {
  const w = createWorld(AREA1);
  const st = w.stations.get('register1');
  // Man an empty register for 5s (no eligible head customer at all — w._regQueues has no entry).
  for (let i = 0; i < 150; i++) { st.serving = 'owner'; stepRegisters(w, 1 / 30); }
  assert.equal(st.pile, 0);
  // Now place 5 ready customers (built the same way as the single-customer test above), all
  // sitting at rest on register1's slot-0 spot. Only one is ever picked as "head" per pay (find()
  // skips paid ones), so this exercises the payment cadence, not the queue-advance logic.
  const q0 = st.queue[0];
  const arr = [1, 2, 3, 4, 5].map(id => ({ id, slot: 0, state: 'atRegister', paid: false, amount: 12, x: q0.x, z: q0.z, mover: { hasTarget: false } }));
  w._regQueues = new Map([['register1', arr]]);
  const times = [];
  const DT = 1 / 30;
  for (let i = 0; i < Math.round(3.5 / DT); i++) {
    st.serving = 'owner';
    const before = w.events.length;
    stepRegisters(w, DT);
    for (let j = before; j < w.events.length; j++) {
      if (w.events[j].type === 'processed') times.push((i + 1) * DT);
    }
  }
  assert.equal(times.length, 5, `expected exactly 5 processed by 3.5s, got ${times.length}: ${times}`);
  assert.ok(times[0] <= 0.6 + 1e-9, `first processed at ${times[0]}, expected within 0.6s`);
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    assert.ok(gap >= 0.6 - 1e-9, `gap between processed #${i} and #${i + 1} was ${gap}, expected >= 0.6s`);
  }
  assert.ok(times[4] - times[0] >= 2.4 - 1e-9, `fifth processed only ${times[4] - times[0]}s after the first, expected >= 2.4s`);
  assert.equal(st.pile, 60);
});

test('stepRegisters resets st.serving to \'\' after each pass', () => {
  const w = createWorld(AREA1);
  const st = w.stations.get('register1');
  st.serving = 'owner';
  stepRegisters(w, 1 / 30);
  assert.equal(st.serving, '');
});

// Final review fix 5: watchdog. A slot-0, unpaid customer parked off the exact queue[0] spot
// never satisfies `head`'s Math.hypot(...) < 0.15 match, so — before this fix — a continuously
// manned register would sit there forever with nothing ever draining its patience (customers.js
// only drains 'atRegister' patience while st.serving reads '', which a continuously-manned
// register never does). Past 2x the pay rate, stepRegisters must now drain that customer's
// patience directly.
test('stepRegisters watchdog: a slot-0 customer parked 0.5m off queue[0] (never satisfies head) still drains patience once manned past 2x rate', () => {
  const w = createWorld(AREA1);
  const st = w.stations.get('register1');
  const q0 = st.queue[0];
  const c = { id: 1, slot: 0, state: 'atRegister', paid: false, amount: 12, x: q0.x + 0.5, z: q0.z, mover: { hasTarget: false }, patience: 16 };
  w._regQueues = new Map([['register1', [c]]]);
  const rate = 0.6; // owner rate (REGISTER_RATE.owner)
  const dt = 1 / 30;
  // Just under 2x rate: watchdog must not have fired yet.
  for (let t = 0; t < 2 * rate - dt; t += dt) { st.serving = 'owner'; stepRegisters(w, dt); }
  assert.equal(c.patience, 16, 'watchdog should not drain before 2x the pay rate has elapsed');
  assert.equal(c.paid, false);
  // Run well past the threshold: patience must now be draining.
  for (let t = 0; t < 3; t += dt) { st.serving = 'owner'; stepRegisters(w, dt); }
  assert.equal(c.paid, false, 'never actually processed — it can never satisfy the exact position match');
  assert.ok(c.patience < 16, `watchdog should have drained patience past 2x rate; patience=${c.patience}`);
});
test('stepRegisters watchdog: does not fire for a customer that genuinely IS head (normal processing untouched)', () => {
  const w = createWorld(AREA1);
  const st = w.stations.get('register1');
  const c = manQueueLike(w, 'register1', 30);
  for (let t = 0; t < 3; t += 1 / 30) { st.serving = 'owner'; stepRegisters(w, 1 / 30); }
  assert.equal(c.paid, true, 'a genuinely-positioned head customer is still processed normally');
  assert.equal(c.patience, 16, 'the watchdog must never touch a customer that is actually being served');
});
function manQueueLike(w, id, amount) {
  const st = w.stations.get(id);
  const c = { id: 1, slot: 0, state: 'atRegister', paid: false, amount, x: st.queue[0].x, z: st.queue[0].z, mover: { hasTarget: false }, patience: 16 };
  w._regQueues = new Map([[id, [c]]]);
  return c;
}
