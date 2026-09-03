import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { pendingJobs, busy, jobTarget, urgent, urgentJobs } from '../src/sim/jobs.js';

function mockCustomer(over) { return Object.assign({ done: false, state: 'enter', mood: 'none', slot: -1, registerId: null }, over); }

test('pendingJobs: everything empty and nothing affordable → next is null', () => {
  const w = createWorld(AREA1);
  const j = pendingJobs(w, { coins: 0, customers: [] });
  assert.deepEqual(j, { registerWaiting: 0, emptyDisplayWithWaiting: 0, dirtyTables: 0, sacksEmpty: 0, ripeBushes: 0, buildAffordable: false, next: null });
});

test('pendingJobs: buildAffordable + next "build" once coins cover the first active zone (z_seats1, 90)', () => {
  const w = createWorld(AREA1);
  const j = pendingJobs(w, { coins: 90, customers: [] });
  assert.equal(j.buildAffordable, true);
  assert.equal(j.next, 'build');
  const j2 = pendingJobs(w, { coins: 89, customers: [] });
  assert.equal(j2.buildAffordable, false);
  assert.equal(j2.next, null);
});

test('pendingJobs: a customer waiting unserved at a register → registerWaiting and next "register", beating an affordable build', () => {
  const w = createWorld(AREA1);
  w.stations.get('register1').serving = ''; // unmanned
  const customers = [mockCustomer({ state: 'atRegister', registerId: 'register1' })];
  const j = pendingJobs(w, { coins: 999999, customers });
  assert.equal(j.registerWaiting, 1);
  assert.equal(j.buildAffordable, true); // still true, just outranked
  assert.equal(j.next, 'register');
});

test('pendingJobs: a customer waiting unserved does NOT count once the register is manned', () => {
  const w = createWorld(AREA1);
  w.stations.get('register1').serving = 'owner';
  const customers = [mockCustomer({ state: 'atRegister', registerId: 'register1' })];
  const j = pendingJobs(w, { coins: 0, customers });
  assert.equal(j.registerWaiting, 0);
  assert.equal(j.next, null);
});

test('pendingJobs: a customer waiting at a counter lacking its product → emptyDisplayWithWaiting and next "restock"', () => {
  const w = createWorld(AREA1);
  const customers = [mockCustomer({ state: 'queue', slot: 0, mood: 'wait' })];
  const j = pendingJobs(w, { coins: 999999, customers });
  assert.equal(j.emptyDisplayWithWaiting, 1);
  assert.equal(j.next, 'restock'); // beats an affordable build, loses to a register wait
});

test('pendingJobs: register beats restock beats build, in that priority order', () => {
  const w = createWorld(AREA1);
  w.stations.get('register1').serving = '';
  const customers = [
    mockCustomer({ state: 'queue', slot: 0, mood: 'wait' }),
    mockCustomer({ state: 'atRegister', registerId: 'register1' }),
  ];
  const j = pendingJobs(w, { coins: 999999, customers });
  assert.equal(j.registerWaiting, 1); assert.equal(j.emptyDisplayWithWaiting, 1); assert.equal(j.buildAffordable, true);
  assert.equal(j.next, 'register');
});

test('pendingJobs ignores done customers', () => {
  const w = createWorld(AREA1);
  w.stations.get('register1').serving = '';
  const customers = [mockCustomer({ state: 'atRegister', registerId: 'register1', done: true })];
  const j = pendingJobs(w, { coins: 0, customers });
  assert.equal(j.registerWaiting, 0);
});

// Task 4: refill (empty coffee/bowl sacks) / clean (dirty tables) / harvest (ripe bushes), and
// their place in the priority chain: register > restock > refill > clean > harvest > build.
const T4_BUILT = ['z_seats1', 'z_register2', 'z_coffee', 'z_bowl', 'z_garden'];

test('pendingJobs: an empty coffee machine → sacksEmpty and next "refill", beating an affordable build', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('bowl1').stock = 5; // keep the bowl non-empty so only the coffee machine is pending
  w.stations.get('coffee1').beans = 0;
  const j = pendingJobs(w, { coins: 999999, customers: [] });
  assert.equal(j.sacksEmpty, 1);
  assert.equal(j.next, 'refill');
});

test('pendingJobs: an active bowl at 0 stock also counts toward sacksEmpty', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('bowl1').stock = 0; // already 0 by default, explicit for clarity
  const j = pendingJobs(w, { coins: 0, customers: [] });
  assert.equal(j.sacksEmpty, 1);
  assert.equal(j.next, 'refill');
});

test('pendingJobs: a dirty seat → dirtyTables and next "clean", beating harvest and build but losing to refill', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('bowl1').stock = 5; // keep the bowl non-empty so only the dirty seat is pending
  w.stations.get('seat1').dirty = true;
  w.stations.get('bush1').stage = 3; // ripe too — clean must still win
  const j = pendingJobs(w, { coins: 999999, customers: [] });
  assert.equal(j.sacksEmpty, 0);
  assert.equal(j.dirtyTables, 1);
  assert.equal(j.ripeBushes, 1);
  assert.equal(j.next, 'clean');
  // now also empty a sack: refill must outrank clean
  w.stations.get('coffee1').beans = 0;
  const j2 = pendingJobs(w, { coins: 999999, customers: [] });
  assert.equal(j2.next, 'refill');
});

test('pendingJobs: a ripe bush → ripeBushes and next "harvest", beating an affordable build', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('bowl1').stock = 5; // keep the bowl non-empty so only the ripe bush is pending
  w.stations.get('bush1').stage = 3;
  w.stations.get('bush2').stage = 2; // not ripe yet — shouldn't count
  const j = pendingJobs(w, { coins: 999999, customers: [] });
  assert.equal(j.sacksEmpty, 0);
  assert.equal(j.ripeBushes, 1);
  assert.equal(j.next, 'harvest');
});

test('pendingJobs: register still beats refill/clean/harvest all at once', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('register1').serving = '';
  w.stations.get('coffee1').beans = 0;
  w.stations.get('seat1').dirty = true;
  w.stations.get('bush1').stage = 3;
  const customers = [mockCustomer({ state: 'atRegister', registerId: 'register1' })];
  const j = pendingJobs(w, { coins: 999999, customers });
  assert.equal(j.next, 'register');
});

// M3 T5: jobTarget(w, G) — the objective arrow's target chooser, one concrete station/zone
// position per `next` kind.
test('jobTarget: nothing pending → null', () => {
  const w = createWorld(AREA1);
  const t = jobTarget(w, { coins: 0, customers: [] });
  assert.equal(t, null);
});
test('jobTarget: register → the manned-empty register with the longest queue', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('register1').serving = '';
  w.stations.get('register2').serving = '';
  const custA = mockCustomer({ state: 'atRegister', registerId: 'register1' });
  const custB1 = mockCustomer({ state: 'atRegister', registerId: 'register2' });
  const custB2 = mockCustomer({ state: 'atRegister', registerId: 'register2' });
  w._regQueues = new Map([['register1', [custA]], ['register2', [custB1, custB2]]]);
  const t = jobTarget(w, { coins: 0, customers: [custA, custB1, custB2] });
  assert.equal(t.kind, 'register');
  const reg2 = w.stations.get('register2');
  assert.equal(t.x, reg2.x); assert.equal(t.z, reg2.z);
});
test('jobTarget: restock → the display customers are waiting at', () => {
  const w = createWorld(AREA1);
  const c = mockCustomer({ state: 'queue', slot: 0, mood: 'wait', counterId: 'dispCookie' });
  const t = jobTarget(w, { coins: 0, customers: [c] });
  assert.equal(t.kind, 'restock');
  const st = w.stations.get('dispCookie');
  assert.equal(t.x, st.x); assert.equal(t.z, st.z);
});
test('jobTarget: refill → the empty coffee machine', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('bowl1').stock = 5; // keep the bowl non-empty so refill unambiguously targets coffee1
  w.stations.get('coffee1').beans = 0;
  const t = jobTarget(w, { coins: 0, customers: [] });
  assert.equal(t.kind, 'refill');
  const st = w.stations.get('coffee1');
  assert.equal(t.x, st.x); assert.equal(t.z, st.z);
});
test('jobTarget: clean → the nearest dirty seat to G.P', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('bowl1').stock = 5; // keep the bowl non-empty so only the dirty seats are pending
  const near = w.stations.get('seat1'), far = w.stations.get('seat2');
  near.dirty = true; far.dirty = true;
  const t = jobTarget(w, { coins: 0, customers: [], P: { x: near.x, z: near.z } });
  assert.equal(t.kind, 'clean');
  assert.equal(t.x, near.x); assert.equal(t.z, near.z);
});
test('jobTarget: harvest → a ripe bush', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('bowl1').stock = 5;
  w.stations.get('bush1').stage = 3;
  const t = jobTarget(w, { coins: 0, customers: [] });
  assert.equal(t.kind, 'harvest');
  const st = w.stations.get('bush1');
  assert.equal(t.x, st.x); assert.equal(t.z, st.z);
});
test('jobTarget: build → the cheapest affordable zone', () => {
  const w = createWorld(AREA1);
  const t = jobTarget(w, { coins: 90, customers: [] });
  assert.equal(t.kind, 'build');
  const z = AREA1.zones.find(zz => zz.id === 'z_seats1');
  assert.equal(t.x, z.x); assert.equal(t.z, z.z);
});

test('busy: true once >= 2 of the pending categories are non-zero', () => {
  const w = createWorld(AREA1);
  w.stations.get('register1').serving = '';
  const oneOnly = [mockCustomer({ state: 'atRegister', registerId: 'register1' })];
  assert.equal(busy(w, { coins: 0, customers: oneOnly }), false); // only registerWaiting pending
  const both = [
    mockCustomer({ state: 'atRegister', registerId: 'register1' }),
    mockCustomer({ state: 'queue', slot: 0, mood: 'wait' }),
  ];
  assert.equal(busy(w, { coins: 0, customers: both }), true); // registerWaiting + emptyDisplayWithWaiting
  assert.equal(busy(w, { coins: 999999, customers: oneOnly }), true); // registerWaiting + buildAffordable
});

// M3 T6 pass 2 (controller ruling): busyIndex redefinition — urgent() counts ONLY
// register-waiting-unserved / empty-display-with-waiting / patience<4s, and does NOT count
// buildAffordable or the maintenance chores (dirty/sacks/ripe) at all, unlike busy() above.
test('urgentJobs/urgent: buildAffordable alone is never urgent, even with a huge pile of coins', () => {
  const w = createWorld(AREA1);
  const u = urgentJobs(w, { coins: 999999, customers: [] });
  assert.deepEqual(u, { registerWaiting: 0, emptyDisplayWithWaiting: 0, lowPatience: 0 });
  assert.equal(urgent(w, { coins: 999999, customers: [] }), false);
});
test('urgentJobs/urgent: a single register-waiting customer alone is already urgent (unlike busy(), which needs 2 categories)', () => {
  const w = createWorld(AREA1);
  w.stations.get('register1').serving = '';
  const customers = [mockCustomer({ state: 'atRegister', registerId: 'register1' })];
  assert.equal(urgentJobs(w, { coins: 0, customers }).registerWaiting, 1);
  assert.equal(urgent(w, { coins: 0, customers }), true);
});
test('urgentJobs/urgent: a single empty-display-with-waiting customer alone is urgent', () => {
  const w = createWorld(AREA1);
  const customers = [mockCustomer({ state: 'queue', slot: 0, mood: 'wait' })];
  assert.equal(urgentJobs(w, { coins: 0, customers }).emptyDisplayWithWaiting, 1);
  assert.equal(urgent(w, { coins: 0, customers }), true);
});
test('urgentJobs/urgent: a waiting customer with patience < 4s counts as urgent even mid-queue (slot != 0) or at a register that IS being served', () => {
  const w = createWorld(AREA1);
  w.stations.get('register1').serving = 'owner'; // manned: not registerWaiting
  const customers = [mockCustomer({ state: 'atRegister', registerId: 'register1', mood: 'wait', patience: 3.9 })];
  const u = urgentJobs(w, { coins: 0, customers });
  assert.equal(u.registerWaiting, 0); assert.equal(u.lowPatience, 1);
  assert.equal(urgent(w, { coins: 0, customers }), true);
});
test('urgentJobs/urgent: a customer with patience >= 4s (still mood "wait") does not count as low-patience', () => {
  const w = createWorld(AREA1);
  const customers = [mockCustomer({ state: 'queue', slot: 3, mood: 'wait', patience: 4 })];
  assert.equal(urgentJobs(w, { coins: 0, customers }).lowPatience, 0);
  assert.equal(urgent(w, { coins: 0, customers }), false);
});
test('urgentJobs/urgent: dirty tables / empty sacks / ripe bushes never count, unlike busy()', () => {
  const w = createWorld(AREA1, { built: T4_BUILT });
  w.stations.get('seat1').dirty = true;
  w.stations.get('coffee1').beans = 0;
  w.stations.get('bush1').stage = 3;
  assert.equal(urgent(w, { coins: 0, customers: [] }), false);
  assert.equal(busy(w, { coins: 0, customers: [] }), true); // busy() DOES count these (>= 2 categories)
});
