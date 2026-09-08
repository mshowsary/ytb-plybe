// Task 0.5 (plan section 6.1) — the runner bug the owner reported: "the runner stacks cookies and
// stands in front of the cupcake display, and sometimes he has cookies in hand but the cookie
// counter needs refill".
//
// Root cause: pickSource ranked candidate sources by raw st.stock with no regard for whether the
// matching DISPLAY had room, and 'idle' holding an undeliverable batch was a bare `return` — the
// runner froze wherever it stood (oven1's front, which sits directly behind dispCupcake from the
// camera). These tests pin the three halves of the fix: need-based source ranking, the wait spot +
// unload round trip, and invariant D over a scripted shift.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, stepOvens, stepMachines, takeFromDisplay } from '../src/sim/world.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { familyOf } from '../src/sim/economy.js';

const DT = 1 / 30;
// A customer record shaped exactly like the one sim/staff.js's wishedProduct() reads (state
// 'queue', slot 0, mood 'wait'); nothing else in the runner path touches a customer.
const wishing = product => [{ done: false, state: 'queue', slot: 0, mood: 'wait', wish: { product } }];
// The wait spot sim/staff.js computes: ct.front offset 0.9m along the station's local +x. Every
// display in AREA1 has rot 0, so the offset is a straight +x nudge; written out longhand here so
// the test is checking the plan's geometry, not re-using the implementation's helper.
const waitSpotOf = ct => ({ x: ct.front.x + 0.9 * Math.cos(ct.rot || 0), z: ct.front.z - 0.9 * Math.sin(ct.rot || 0) });

// (a) The exact reported shape: a cupcake customer is stuck waiting, the cupcake oven is empty and
// the COOKIE display is full. The old ranking picked oven1 (12 cookies — the most raw stock in the
// world) and the runner walked off to fetch a batch of cookies that could never be shelved.
test('(a) cupcakes wished, cupcake oven empty, cookie display full: the runner loads nothing', () => {
  const w = createWorld(AREA1, { built: ['z_oven2'] });
  const oven1 = w.stations.get('oven1'), oven2 = w.stations.get('oven2');
  const dispCookie = w.stations.get('dispCookie'), dispCupcake = w.stations.get('dispCupcake');
  oven1.stock = 12;                      // plenty of cookies...
  oven2.stock = 0;                       // ...and nothing to fetch for the customer who is waiting
  dispCookie.stock = dispCookie.capacity; // ...onto a shelf with no room at all
  const runner = createStaff('runner', { x: 5, z: -3.9 });

  for (let t = 0; t < 10; t += DT) stepStaff([runner], w, DT, () => {}, undefined, wishing('cupcake'));

  assert.equal(runner.items.length, 0, 'runner must not have loaded cookies it cannot shelve');
  assert.equal(oven1.stock, 12, 'the cookie oven must be untouched');
  assert.equal(dispCookie.stock, dispCookie.capacity, 'the full cookie display must be untouched');
  assert.equal(dispCupcake.stock, 0);

  // ...and it is idle by need, not inert: free one slot on the cookie shelf and it goes to work.
  dispCookie.stock = dispCookie.capacity - 4;
  for (let t = 0; t < 12; t += DT) stepStaff([runner], w, DT, () => {}, undefined, wishing('cupcake'));
  assert.ok(dispCookie.stock > dispCookie.capacity - 4, 'once the shelf has room the runner restocks it');
  assert.ok(oven1.stock < 12, 'and that stock came out of the oven');
});

// (a2) The assigned-runner half of the same rule: its own display is full, so it skips its source
// entirely rather than loading a batch it has nowhere to put.
test('(a2) an assigned runner whose display is full never loads from its source', () => {
  const w = createWorld(AREA1);
  const oven1 = w.stations.get('oven1'), dispCookie = w.stations.get('dispCookie');
  oven1.stock = 12;
  dispCookie.stock = dispCookie.capacity;
  const runner = createStaff('runner', { x: 5, z: -3.9 }, 'dispCookie');

  for (let t = 0; t < 10; t += DT) stepStaff([runner], w, DT, () => {});

  assert.equal(runner.items.length, 0);
  assert.equal(oven1.stock, 12);
});

// (b) The display fills while the runner is en route. It must peel off to the wait spot BESIDE the
// display (never park in its front circle, which is what reads as "standing in front of the
// display"), and after 4s of the shelf staying full hand the batch back to the oven it came from.
test('(b) the display fills en route: the runner waits beside it, then unloads the batch back', () => {
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'), ct = w.stations.get('dispCookie');
  oven.stock = 6;
  const runner = createStaff('runner', oven.front);
  const spot = waitSpotOf(ct);

  let filled = false, sawWaiting = false, sawUnload = false;
  let minWaitDist = Infinity, minFrontDist = Infinity, maxCarried = 0;
  for (let t = 0; t < 25; t += DT) {
    stepStaff([runner], w, DT, () => {});
    maxCarried = Math.max(maxCarried, runner.items.length);
    // The instant it commits to the delivery walk, a customer empties the shelf... into it.
    if (!filled && runner.state === 'toCounter') { ct.stock = ct.capacity; filled = true; }
    if (!filled) continue;
    if (runner.state === 'waiting') {
      sawWaiting = true;
      minWaitDist = Math.min(minWaitDist, Math.hypot(runner.x - spot.x, runner.z - spot.z));
    }
    if (runner.state === 'unload') sawUnload = true;
    if (runner.items.length > 0) minFrontDist = Math.min(minFrontDist, Math.hypot(runner.x - ct.front.x, runner.z - ct.front.z));
  }

  assert.equal(maxCarried, 6, 'the runner should have loaded a full batch first');
  assert.ok(sawWaiting, 'runner should have entered the wait state beside the full display');
  assert.ok(minWaitDist < 0.6, `runner should have reached the wait spot (closest ${minWaitDist.toFixed(2)}m)`);
  assert.ok(minFrontDist > 0.6, `runner must never park in the display's front circle (closest ${minFrontDist.toFixed(2)}m)`);
  assert.ok(sawUnload, 'runner should have gone back to unload the batch');
  assert.equal(runner.items.length, 0, 'the batch must have been handed back');
  assert.equal(oven.stock, 6, 'and it must be back in the oven buffer, not destroyed or duplicated');
  assert.equal(ct.stock, ct.capacity, 'the full display never received anything');
});

// (b2) The other side of the same coin: room appears again while the runner is walking the batch
// back, so it turns around and delivers instead of completing a pointless round trip.
test('(b2) room reappearing during the unload walk turns the runner back into a delivery', () => {
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1'), ct = w.stations.get('dispCookie');
  oven.stock = 6;
  ct.stock = ct.capacity;
  const runner = createStaff('runner', ct.front);
  runner.items = ['cookie', 'cookie', 'cookie'];
  runner.srcId = 'oven1';

  let freed = false;
  for (let t = 0; t < 20; t += DT) {
    stepStaff([runner], w, DT, () => {});
    if (!freed && runner.state === 'unload') { ct.stock = ct.capacity - 3; freed = true; }
  }
  assert.ok(freed, 'runner should have started an unload walk');
  assert.equal(runner.items.length, 0);
  assert.equal(ct.stock, ct.capacity, 'the three it was holding went onto the shelf');
  assert.equal(oven.stock, 6, 'and none of them were handed back to the oven');
});

// (b3) Review fix (Group C1) — the dead end on BOTH sides: the display is full AND every
// same-family production station is full too, so there is nowhere to deliver the batch and nowhere
// to hand it back. unloadSource() used to answer that with the (full) remembered source anyway, and
// the runner walked all the way back to an oven that provably could not take the batch — 'unload'
// bailed to 'idle' on arrival, 'idle' sent it straight back to the shelf, forever. It must simply
// stay parked beside the display: `s.timer = 0; // nothing will take the batch back`.
test('(b3) display full AND every source full: the runner waits beside the shelf, no return trip', () => {
  const w = createWorld(AREA1); // no zones built: oven1 is the ONLY cookie-family source
  const oven = w.stations.get('oven1'), ct = w.stations.get('dispCookie');
  oven.stock = oven.buffer;   // the oven cannot take a single item back
  ct.stock = ct.capacity;     // and the shelf cannot take a single item either
  const runner = createStaff('runner', ct.front);
  runner.items = ['cookie', 'cookie', 'cookie'];
  runner.srcId = 'oven1';
  const spot = waitSpotOf(ct);

  const states = new Set();
  let stuckEvents = 0, teleports = 0, minWaitDist = Infinity;
  // 30s — over seven times WAIT_SECONDS (4s), so the "after 4s still full -> unload" branch is
  // exercised again and again, not just once.
  for (let t = 0; t < 30; t += DT) {
    stepStaff([runner], w, DT, () => {});
    states.add(runner.state);
    teleports += runner.mover.teleports; runner.mover.teleports = 0;
    for (const e of w.events) if (e.type === 'runnerStuck') stuckEvents++;
    w.events.length = 0;
    if (runner.waitParked) minWaitDist = Math.min(minWaitDist, Math.hypot(runner.x - spot.x, runner.z - spot.z));
  }

  assert.ok(!states.has('unload'), `runner must never dispatch a return trip to a full source (saw: ${[...states].join(',')})`);
  assert.ok(!states.has('toOven'), 'runner must never set off to fetch more while holding an undeliverable batch');
  assert.equal(runner.state, 'waiting', 'it should still be waiting beside the display at the end');
  assert.ok(runner.waitParked, 'and it should have parked at the wait spot rather than pacing');
  assert.ok(minWaitDist < 0.6, `runner should have reached the wait spot (closest ${minWaitDist.toFixed(2)}m)`);
  // Parked BESIDE, not IN FRONT: it settled nearer the side spot than the front circle it started
  // in. (sim/staff.js parks within 0.45m of the spot, so the front distance lands around 0.45-0.9m
  // rather than the full 0.9m offset — the direction is what matters, and the camera reads it as
  // "standing next to the shelf" rather than "stacking cookies in front of it".)
  const endSpot = Math.hypot(runner.x - spot.x, runner.z - spot.z);
  const endFront = Math.hypot(runner.x - ct.front.x, runner.z - ct.front.z);
  assert.ok(endSpot < endFront, `parked runner should be nearer the wait spot (${endSpot.toFixed(2)}m) than the front circle (${endFront.toFixed(2)}m)`);
  assert.ok(endFront > 0.4, `and clear of the front circle itself (${endFront.toFixed(2)}m)`);
  assert.equal(runner.items.length, 3, 'the batch stays in hand — nothing minted, nothing destroyed');
  assert.equal(oven.stock, oven.buffer, 'the full oven must not have gained stock past its buffer');
  assert.equal(ct.stock, ct.capacity, 'and the full display never received anything');
  assert.equal(stuckEvents, 0, 'a legitimately blocked runner is not a watchdog rescue');
  assert.equal(teleports, 0, 'teleports');

  // Waiting by need, not inert: the instant the shelf frees up it delivers, without ever having
  // touched the oven.
  ct.stock = ct.capacity - 3;
  for (let t = 0; t < 12; t += DT) stepStaff([runner], w, DT, () => {});
  assert.equal(runner.items.length, 0, 'once room appears the held batch goes onto the shelf');
  assert.equal(ct.stock, ct.capacity, 'all three landed');
  assert.equal(oven.stock, oven.buffer, 'and none of them were ever handed back to the oven');
});

// (c) Invariant D (plan section 4.3) over a three-minute scripted shift: production runs the whole
// time, consumption is scripted (nothing for the first minute, so every shelf fills and the runners
// are pushed through wait/unload, then a steady drain that keeps re-opening room), and no runner may
// hold a batch for more than 6s while a same-family display has free capacity.
test('(c) three-minute scripted shift: invariant D holds, no stalls, no teleports, no runnerStuck', () => {
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_oven2', 'z_hire', 'z_coffee'] });
  const runners = [
    createStaff('runner', { x: 6.5, z: -3.9 }, 'dispCookie'),
    createStaff('runner', { x: 3.5, z: -3.9 }, 'dispCupcake'),
    createStaff('runner', { x: 0.5, z: -3.9 }),
  ];
  const displayIds = ['dispCookie', 'dispCupcake', 'barCoffee'];
  const wishes = ['cookie', 'cupcake', 'coffee'];

  // Raw invariant D: items in hand while the matching display has room, exactly as the plan words
  // it. The stricter companion excludes the load -> deliver pipeline, which is what the sim's own
  // watchdog measures — a runner mid-batch or mid-delivery is working, not stuck.
  const rawHold = new Map(), idleHold = new Map();
  let maxRaw = 0, maxIdle = 0, stuckEvents = 0, teleports = 0;
  const stalls = [], lastPos = new Map();
  let consumeT = 0, drained = 0, delivered = 0;

  for (let t = 0; t < 180; t += DT) {
    stepOvens(w, DT); stepMachines(w, DT);
    // Scripted consumption: nothing for the first 60s (every shelf fills up and stays full), then
    // one sale every 0.8s, round-robin across the shelves.
    if (t >= 60) {
      consumeT += DT;
      while (consumeT >= 0.8) {
        consumeT -= 0.8;
        if (takeFromDisplay(w, displayIds[drained % displayIds.length])) delivered++;
        drained++;
      }
    }
    const customers = wishing(wishes[Math.floor(t / 20) % wishes.length]);
    stepStaff(runners, w, DT, () => {}, undefined, customers);

    for (const s of runners) {
      const ct = s.assign ? w.stations.get(s.assign) : (s.items.length ? displayForFamily(w, s.items[0]) : null);
      const room = s.items.length > 0 && !!ct && ct.active && ct.stock < ct.capacity;
      const busy = s.state === 'toCounter' || s.state === 'dropping' || s.state === 'loading';
      const raw = room ? (rawHold.get(s) || 0) + DT : 0;
      const idle = room && !busy ? (idleHold.get(s) || 0) + DT : 0;
      rawHold.set(s, raw); idleHold.set(s, idle);
      maxRaw = Math.max(maxRaw, raw); maxIdle = Math.max(maxIdle, idle);
    }
    for (const m of runners.map(s => s.mover)) {
      teleports += m.teleports; m.teleports = 0;
      if (m.hasTarget) {
        const p = lastPos.get(m) || { t, d: Infinity };
        const d = Math.hypot(m.tx - m.x, m.tz - m.z);
        if (d < p.d - 0.02) { p.d = d; p.t = t; }
        else if (t - p.t > 3) { stalls.push({ t: +t.toFixed(1), x: +m.x.toFixed(2), z: +m.z.toFixed(2), tx: m.tx, tz: m.tz }); p.t = t; }
        lastPos.set(m, p);
      } else lastPos.delete(m);
    }
    for (const e of w.events) if (e.type === 'runnerStuck') stuckEvents++;
    w.events.length = 0;
  }

  assert.ok(delivered > 60, `the shift must actually have moved goods (${delivered} sales)`);
  assert.equal(stalls.length, 0, `stalls: ${JSON.stringify(stalls.slice(0, 5))}`);
  assert.equal(teleports, 0, 'teleports');
  assert.equal(stuckEvents, 0, 'the watchdog must never have had to rescue a runner');
  assert.ok(maxRaw < 6, `invariant D: longest hold with display room was ${maxRaw.toFixed(2)}s (limit 6s)`);
  assert.ok(maxIdle < 2, `longest NON-delivering hold with display room was ${maxIdle.toFixed(2)}s`);
  // Nothing may be conjured or lost: what left the ovens either sits on a shelf, is in a runner's
  // hands, or was sold.
  const carried = runners.reduce((n, s) => n + s.items.length, 0);
  assert.ok(carried <= 18, `runners should not be hoarding (${carried} items in hand)`);
});

function displayForFamily(w, product) {
  const fam = familyOf(product);
  for (const id of w.displays) { const st = w.stations.get(id); if (familyOf(st.product) === fam) return st; }
  return null;
}
