import { test } from 'node:test'; import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, putOnDisplay, stepRegisters } from '../src/sim/world.js';
import { createCustomer, stepCustomers, moveToward, PATIENCE } from '../src/sim/customers.js';
import { wishFor } from '../src/sim/economy.js';
const price = (k, seated) => seated ? 6 : 5;
const V = { shirt: 0, hair: 0, skin: 0 };
function run(list, w, seconds) { for (let t = 0; t < seconds; t += 1 / 30) stepCustomers(list, w, price, 1 / 30); }
// Mans register1 (owner) every tick and calls stepRegisters — the pure-sim equivalent of what
// systems/stations.js (owner proximity) + sim/staff.js's stepStaff (which calls stepRegisters)
// do together each frame in the running game.
function runManned(list, w, seconds, registerId = 'register1') {
  for (let t = 0; t < seconds; t += 1 / 30) {
    const st = w.stations.get(registerId);
    if (st && st.active) st.serving = 'owner';
    stepCustomers(list, w, price, 1 / 30);
    stepRegisters(w, 1 / 30);
  }
}

test('moveToward arrives and faces direction', () => {
  const c = { x: 0, z: 0, rot: 0 };
  let arrived = false; for (let i = 0; i < 100; i++) arrived = moveToward(c, 2, 0, 2, 0.05) || arrived;
  assert.ok(arrived); assert.ok(Math.abs(c.x - 2) < 1e-6); assert.ok(Math.abs(c.rot - Math.PI / 2) < 1e-6);
});

// M3 T3: wish selection
test('wishFor draws only from products genuinely available (stocked or in-stock at an active machine)', () => {
  const w = createWorld(AREA1);
  putOnDisplay(w, 'dispCookie', 'cookie', 5);
  for (let i = 0; i < 200; i++) {
    const wish = wishFor(w);
    assert.equal(wish.product, 'cookie'); // only cookie is stocked anywhere; coffee1/blender1 aren't even built
    assert.equal(wish.treat, false); // no bowl built yet
  }
});
test('wishFor draws uniformly from every stocked product, and treat only once a bowl is active', () => {
  const w = createWorld(AREA1, { built: ['z_oven2', 'z_bowl'] });
  putOnDisplay(w, 'dispCookie', 'cookie', 6);
  putOnDisplay(w, 'dispCupcake', 'cupcake', 6);
  w.stations.get('bowl1').stock = 10;
  const products = new Set(), treats = new Set();
  for (let i = 0; i < 300; i++) { const wish = wishFor(w); products.add(wish.product); treats.add(wish.treat); }
  assert.deepEqual([...products].sort(), ['cookie', 'cupcake']);
  assert.deepEqual([...treats].sort(), [false, true]); // both seen — bowl active means ~50/50
});
test('wishFor falls back to cookie when nothing is available', () => {
  const w = createWorld(AREA1);
  assert.equal(wishFor(w).product, 'cookie');
});

test('customer wishes, takes, pays at a manned register and leaves when no seat', () => {
  const w = createWorld(AREA1); putOnDisplay(w, 'dispCookie', 'cookie', 5);
  const c = createCustomer(1, 'cat', V, AREA1); const list = [c];
  runManned(list, w, 25);
  const types = w.events.map(e => e.type);
  assert.ok(types.includes('wish')); assert.ok(types.includes('took'));
  assert.ok(types.includes('processed')); assert.ok(types.includes('pay')); assert.ok(types.includes('left'));
  assert.equal(c.done, true);
});
test('even-id customer takes an order of 2 cookies and pays 2x the price', () => {
  const w = createWorld(AREA1); putOnDisplay(w, 'dispCookie', 'cookie', 5);
  const c = createCustomer(4, 'cat', V, AREA1); const list = [c];
  runManned(list, w, 25);
  const took = w.events.find(e => e.type === 'took');
  assert.ok(took); assert.equal(took.product, 'cookie'); assert.equal(took.count, 2);
  const processed = w.events.find(e => e.type === 'processed');
  assert.ok(processed); assert.equal(processed.amount, 10); // 2 cookies at the unseated price of 5 each
  assert.equal(c.done, true);
});
test('seated customer pays the tip price', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] }); putOnDisplay(w, 'dispCookie', 'cookie', 5);
  const list = [createCustomer(1, 'cat', V, AREA1)];
  runManned(list, w, 30);
  assert.ok(w.events.some(e => e.type === 'seated'));
  const processed = w.events.find(e => e.type === 'processed');
  assert.ok(processed); assert.equal(processed.amount, 6);
});

// M3 T3: patience
test('patience drains only while waiting: stays at PATIENCE while walking to the display, then drains once waiting there empty-handed', () => {
  const w = createWorld(AREA1); // no cookies on dispCookie — a customer reaches slot 0 and waits
  const c = createCustomer(2, 'dog', V, AREA1); const list = [c];
  let sawFullWhileWalking = false, sawDrain = false;
  for (let t = 0; t < 10; t += 1 / 30) {
    stepCustomers(list, w, price, 1 / 30);
    if (c.state === 'enter') { if (c.patience === PATIENCE) sawFullWhileWalking = true; }
    if (c.state === 'queue' && c.slot === 0 && c.mood === 'wait' && c.patience < PATIENCE) sawDrain = true;
  }
  assert.ok(sawFullWhileWalking, 'patience should not have moved while just walking to the door/display');
  assert.ok(sawDrain, 'patience should have started draining once waiting at an empty display');
});
test('customer leaves angry with lost.reason "counter" after PATIENCE seconds at an empty display', () => {
  const w = createWorld(AREA1);
  const c = createCustomer(2, 'dog', V, AREA1); const list = [c];
  run(list, w, 10); // enough to walk from spawn to the (empty) display's slot 0 in the new layout
  assert.equal(c.state, 'queue'); assert.equal(c.slot, 0); assert.equal(c.mood, 'wait');
  run(list, w, PATIENCE + 15); // past PATIENCE of waiting, plus the walk all the way back out
  const lost = w.events.find(e => e.type === 'lost');
  assert.ok(lost); assert.equal(lost.reason, 'counter');
  assert.ok(w.events.some(e => e.type === 'angry'));
  assert.equal(c.done, true);
});

// Loop v2 Task 1: settle-for now switches to a DIFFERENT, stocked display (a display only ever
// holds its own product, so there's no more "same counter, different item" to settle for).
test('settle-for rule: a customer stuck waiting at an empty display switches to another stocked display after 6s (settled + a fresh wish event)', () => {
  const w = createWorld(AREA1, { built: ['z_oven2'] }); // dispCupcake active but empty
  putOnDisplay(w, 'dispCookie', 'cookie', 5); // a different, always-active display IS stocked
  const c = createCustomer(3, 'cat', V, AREA1);
  const slot0 = w.stations.get('dispCupcake').queue[0];
  c.mover.x = slot0.x; c.mover.z = slot0.z; c.x = slot0.x; c.z = slot0.z;
  c.state = 'queue'; c.counterId = 'dispCupcake'; c.wish = { product: 'cupcake', treat: false }; c.slot = 0;
  c.arrived = w.seq = (w.seq || 0) + 1;
  const list = [c];
  run(list, w, 0.1); // slot assigns to 0 and the mover registers "arrived" (already placed there)
  assert.equal(c.slot, 0);
  assert.equal(c.mood, 'wait', 'stuck waiting: dispCupcake is empty');
  run(list, w, 5.8); // well under 6s of waiting so far
  assert.ok(!w.events.some(e => e.type === 'settled'), 'must not settle before 6s of waiting');
  run(list, w, 0.4); // now past 6s
  const settled = w.events.find(e => e.type === 'settled');
  assert.ok(settled, 'events: ' + w.events.map(e => e.type).join(','));
  assert.equal(settled.id, c.id); assert.equal(settled.from, 'cupcake'); assert.equal(settled.to, 'cookie');
  assert.equal(c.wish.product, 'cookie');
  assert.equal(c.counterId, 'dispCookie', 'should have switched to walk toward the stocked display');
  const wishEvt = w.events.filter(e => e.type === 'wish' && e.id === c.id).pop();
  assert.ok(wishEvt && wishEvt.product === 'cookie', 'a fresh wish event should follow the settle, per the existing wish-bubble event path');
  run(list, w, 6); // walk from dispCupcake's queue over to dispCookie's queue and get served
  assert.ok(w.events.some(e => e.type === 'took' && e.product === 'cookie'), 'should be served cookie once settled');
});
test('settle-for rule: a customer waiting for a treat at an empty bowl gives up the treat after 6s but keeps the product', () => {
  const w = createWorld(AREA1, { built: ['z_bowl'] });
  const bowl = w.stations.get('bowl1'); bowl.stock = 0;
  const c = createCustomer(4, 'cat', V, AREA1);
  c.state = 'atBowl'; c.wish = { product: 'cookie', treat: true }; c.order = ['cookie']; c._bowlSlot = 0;
  const list = [c];
  run(list, w, 5.8);
  assert.equal(c.state, 'atBowl');
  assert.equal(c.wish.treat, true);
  run(list, w, 0.4);
  assert.equal(c.wish.treat, false, 'treat should be given up after 6s');
  assert.equal(c.wish.product, 'cookie', 'the product wish must be kept');
  assert.notEqual(c.state, 'atBowl', 'should have moved on (to the register) once the treat is given up');
});

// M3 T3: manned register
test('a register with nobody serving never processes; the customer eventually leaves lost with reason "register"', () => {
  const w = createWorld(AREA1); putOnDisplay(w, 'dispCookie', 'cookie', 5);
  const c = createCustomer(1, 'cat', V, AREA1); const list = [c];
  run(list, w, 12); // reach the (unmanned) register (~10.7s in the new, larger layout)
  assert.equal(c.state, 'atRegister');
  run(list, w, PATIENCE + 20); // PATIENCE to lose it, plus time to walk all the way back out
  const lost = w.events.find(e => e.type === 'lost' && e.reason === 'register');
  assert.ok(lost, 'events: ' + w.events.map(e => e.type).join(','));
  assert.equal(c.done, true, 'state: ' + c.state);
  assert.equal(w.stations.get('register1').pile, 0);
});
test('a manned register (owner) processes one customer per 0.6s, never more', () => {
  const w = createWorld(AREA1); putOnDisplay(w, 'dispCookie', 'cookie', 20); // clamped to capacity 8, plenty for 4 customers
  const list = [];
  for (let i = 0; i < 4; i++) list.push(createCustomer(i + 1, 'cat', V, AREA1));
  let processedTimes = [];
  for (let t = 0; t < 30; t += 1 / 30) {
    w.stations.get('register1').serving = 'owner';
    stepCustomers(list, w, price, 1 / 30);
    stepRegisters(w, 1 / 30);
    for (const e of w.events) if (e.type === 'processed') processedTimes.push(+t.toFixed(3));
    w.events.length = 0;
    if (processedTimes.length >= 3) break;
  }
  assert.ok(processedTimes.length >= 3, 'expected at least 3 processed events, got ' + processedTimes.length);
  for (let i = 1; i < processedTimes.length; i++) {
    assert.ok(processedTimes[i] - processedTimes[i - 1] >= 0.6 - 1 / 30 - 1e-6, `gap too short: ${processedTimes[i - 1]} -> ${processedTimes[i]}`);
  }
});
test('two active registers split the queue', () => {
  const w = createWorld(AREA1, { built: ['z_register2'] });
  putOnDisplay(w, 'dispCookie', 'cookie', 20);
  const list = [];
  for (let i = 0; i < 6; i++) list.push(createCustomer(i + 1, 'cat', V, AREA1));
  run(list, w, 8);
  const at1 = list.filter(c => c.registerId === 'register1').length;
  const at2 = list.filter(c => c.registerId === 'register2').length;
  assert.ok(at1 > 0 && at2 > 0, `expected both registers used, got ${at1}/${at2}`);
});

// Loop v2 Task 1: rebalance() (moving a customer between two counters holding the same product)
// is gone — one dedicated display per product means there is nothing left to rebalance between.
// Repurposed to check the invariant that replaces it: every customer wishing the same product
// queues at the SAME single display, still with no duplicate (display, slot) pairs.
test('one display per product: multiple customers wishing the same product all queue at the SAME display with distinct slots (rebalance is gone)', () => {
  const w = createWorld(AREA1);
  const list = [];
  for (let i = 0; i < 5; i++) list.push(createCustomer(i + 1, 'cat', V, AREA1));
  run(list, w, 8);
  const ids = new Set(list.filter(c => c.state === 'queue').map(c => c.counterId));
  assert.deepEqual([...ids], ['dispCookie'], 'every cookie-wishing customer queues at the one cookie display');
  const seen = new Set();
  for (const c of list) {
    if (c.state !== 'queue') continue;
    const key = c.counterId + ':' + c.slot;
    assert.ok(!seen.has(key), `duplicate slot ${key}`);
    seen.add(key);
  }
});

test('queue slots are distinct', () => {
  const w = createWorld(AREA1);
  const list = [createCustomer(1, 'cat', V, AREA1), createCustomer(2, 'dog', V, AREA1), createCustomer(3, 'bunny', V, AREA1)];
  run(list, w, 6);
  const slots = list.map(c => c.slot); assert.deepEqual([...new Set(slots)].sort(), [0, 1, 2]);
});

test('full house invariant: 8 customers, a stocked display, a manned register, all finish, no duplicate slots, seats freed', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  putOnDisplay(w, 'dispCookie', 'cookie', 12); // clamped to capacity 8
  const list = [];
  for (let i = 0; i < 8; i++) list.push(createCustomer(i + 1, i % 2 ? 'dog' : 'cat', V, AREA1));
  for (let t = 0; t < 90; t += 1 / 30) {
    w.stations.get('register1').serving = 'owner';
    stepCustomers(list, w, price, 1 / 30);
    stepRegisters(w, 1 / 30);
    const seen = new Set();
    for (const c of list) {
      if (c.state !== 'queue') continue;
      const key = c.counterId + ':' + c.slot;
      assert.ok(!seen.has(key), `duplicate (counterId,slot) ${key} at t=${t}`);
      seen.add(key);
    }
  }
  assert.ok(list.every(c => c.done), 'every customer reached done: ' + list.filter(c => !c.done).map(c => c.id + ':' + c.state).join(','));
  for (const st of w.stations.values()) if (st.type === 'seat') assert.equal(st.occupied, false);
});
