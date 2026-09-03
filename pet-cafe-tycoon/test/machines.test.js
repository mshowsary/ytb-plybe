// test/machines.test.js — Task 4: coffee/blender/bush production chains, the treat bowl, and
// dirty/cleaned seats. Mirrors test/world.test.js's style (pure sim, no three.js).
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  createWorld, stepMachines, takeFromMachine, refillBeans, addFruit, harvestBush, refillBowl,
  takeTreat, freeSeat, cleanSeat,
} from '../src/sim/world.js';

const BUILT = ['z_counter2', 'z_seats1', 'z_oven2', 'z_register2', 'z_coffee', 'z_hire', 'z_bowl', 'z_garden', 'z_blender'];

test('coffee: makes one cup per 2.5s while beans > 0, consuming one bean per cup, and stops at beans === 0', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('coffee1');
  st.beans = 3; // force it to run dry quickly
  stepMachines(w, 2.5 * 3 + 0.01);
  assert.equal(st.beans, 0);
  assert.equal(st.stock, 3);
  // no more beans: further stepping makes nothing
  stepMachines(w, 2.5 * 2);
  assert.equal(st.stock, 3);
  assert.equal(st.beans, 0);
});

test('coffee: stops at the buffer (8) even with plenty of beans left', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('coffee1');
  stepMachines(w, 2.5 * 20);
  assert.equal(st.stock, 8);
  assert.equal(st.beans, 20 - 8);
});

test('refillBeans restores 20', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('coffee1');
  st.beans = 0;
  const added = refillBeans(w, 'coffee1');
  assert.equal(added, 20);
  assert.equal(st.beans, 20);
});

// Final review fix 6: capped at 20, consuming only what was used — same shape as refillBowl.
test('refillBeans caps at 20 and consumes only what was used (like the kibble/refillBowl path)', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('coffee1');
  st.beans = 15; // room for only 5 more
  const used = refillBeans(w, 'coffee1', 20); // a full 20-unit sack
  assert.equal(used, 5, 'should only consume the 5 units of room available');
  assert.equal(st.beans, 20, 'beans capped at 20, never stacked past it');
  // a second refill attempt (sack still has 15 left) against a now-full machine uses nothing
  const used2 = refillBeans(w, 'coffee1', 15);
  assert.equal(used2, 0);
  assert.equal(st.beans, 20);
});

test('takeFromMachine drains coffee stock like takeFromOven', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('coffee1');
  stepMachines(w, 2.5 * 4);
  assert.equal(st.stock, 4);
  assert.equal(takeFromMachine(w, 'coffee1', 2), 2);
  assert.equal(st.stock, 2);
  assert.equal(takeFromMachine(w, 'coffee1', 5), 2); // capped at remaining stock
  assert.equal(st.stock, 0);
});

test('bushes reach stage 3 after 25s (one stage per 25/3 s), then stop', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('bush1');
  stepMachines(w, 25 / 3 - 0.01);
  assert.equal(st.stage, 0);
  stepMachines(w, 0.02);
  assert.equal(st.stage, 1);
  stepMachines(w, 25 / 3 * 2 + 0.01);
  assert.equal(st.stage, 3);
  // stage 3 is the ceiling — more time doesn't overflow it
  stepMachines(w, 100);
  assert.equal(st.stage, 3);
});

test('harvestBush yields 3 fruit at stage 3 and resets to stage 0; yields 0 otherwise', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('bush1');
  assert.equal(harvestBush(w, 'bush1'), 0); // stage 0
  st.stage = 3;
  assert.equal(harvestBush(w, 'bush1'), 3);
  assert.equal(st.stage, 0);
  assert.equal(harvestBush(w, 'bush1'), 0); // already reset
});

test('blender turns 3 fruit into 3 smoothies at 2.0s each, then stops (fruit exhausted)', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('blender1');
  addFruit(w, 'blender1', 3);
  assert.equal(st.fruit, 3);
  stepMachines(w, 2.0 - 0.01);
  assert.equal(st.stock, 0);
  stepMachines(w, 0.02);
  assert.equal(st.stock, 1);
  assert.equal(st.fruit, 2);
  stepMachines(w, 2.0 * 5); // plenty of time for the rest, but only 2 fruit left
  assert.equal(st.stock, 3);
  assert.equal(st.fruit, 0);
});

test('addFruit caps the blender buffer at 9', () => {
  const w = createWorld(AREA1, { built: BUILT });
  assert.equal(addFruit(w, 'blender1', 6), 6);
  assert.equal(addFruit(w, 'blender1', 6), 3); // only 3 more room to 9
  assert.equal(w.stations.get('blender1').fruit, 9);
});

test('bowl: decrements per treat customer (takeTreat), refillBowl uses at most capacity - stock', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const st = w.stations.get('bowl1');
  assert.equal(st.stock, 0); assert.equal(st.capacity, 10);
  assert.equal(refillBowl(w, 'bowl1', 20), 10); // sack has 20, bowl only has room for 10
  assert.equal(st.stock, 10);
  assert.equal(takeTreat(w, 'bowl1'), 1);
  assert.equal(st.stock, 9);
  assert.equal(refillBowl(w, 'bowl1', 20), 1); // only 1 unit of room left
  assert.equal(st.stock, 10);
});

test('a seat becomes dirty after eating (simulated via cleanSeat/freeSeat, not stepCustomers here); freeSeat skips it, cleanSeat frees it', () => {
  // BUILT includes only z_seats1 (seat1, seat2) — dirty both so freeSeat has nothing else to fall back to.
  const w = createWorld(AREA1, { built: BUILT });
  const seat1 = w.stations.get('seat1'), seat2 = w.stations.get('seat2');
  seat1.dirty = true; seat2.dirty = true; // mirrors sim/customers.js's 'eating' handler
  assert.equal(freeSeat(w), null, 'freeSeat must never return a dirty seat');
  cleanSeat(w, seat1.id);
  assert.equal(seat1.dirty, false);
  assert.equal(freeSeat(w).id, seat1.id, 'freeSeat should return it again once cleaned');
});

test('cleanSeat pushes a "cleaned" event with the seatId, only when the seat was actually dirty', () => {
  const w = createWorld(AREA1, { built: BUILT });
  const seat = freeSeat(w);
  seat.dirty = true;
  cleanSeat(w, seat.id);
  assert.deepEqual(w.events.pop(), { type: 'cleaned', seatId: seat.id });
  w.events.length = 0;
  cleanSeat(w, seat.id); // already clean: no-op, no event
  assert.equal(w.events.length, 0);
});
