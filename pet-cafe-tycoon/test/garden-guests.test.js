// test/garden-guests.test.js — every guest stays in its own room (docs/SHIP-PLAN-2026-09-19.md §1.2).
//
// Measured before the Ice cream garden (bot-driven shift, everything built but the spa): 24 of 32
// guests crossed the café-to-deck gate, some three times; a third of the terrace guests were lost at
// an unmanned terrace register; every deck guest left through the photo booth's backdrop; interior
// guests walked out to wait beside deck tables they could never take; and seat choice was "first in
// map order", so a whole purchase of deck tables was never sat at. Now: garden guests come in by the
// garden's own arch, queue at the ice cream stand, pay into its jar, sit at a deck table or leave
// with the cone, and go back out the arch; café guests never set foot on the deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld, payZone, putOnDisplay, stepMachines } from '../src/sim/world.js';
import { createCustomer, stepCustomers, gardenTableCount, SPECIES } from '../src/sim/customers.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { spawnInterval, maxCustomers, terraceSpawnInterval, terraceMaxCustomers, wishFor } from '../src/sim/economy.js';
import { gateApron, regionAt } from '../src/sim/nav.js';
import { snapshotStationState, restoreStationState } from '../src/sim/stationState.js';

const DT = 1 / 30;
const price = (k, seated) => (seated ? 20 : 10);
function buildThrough(lastId) {
  const w = createWorld(AREA1, {}, 5);
  for (const z of AREA1.zones) {
    let g = 0; while (!w.built.has(z.id) && g++ < 1000) payZone(w, z.id, 1e9, 1);
    if (z.id === lastId) break;
  }
  return w;
}
const allBuilt = () => buildThrough(AREA1.zones[AREA1.zones.length - 1].id);
const garden = (w, st) => !!regionAt(w.area, st.x, st.z);
const onDeck = c => c.x >= -10 && c.z > 7.4;
const inCafe = c => c.x >= -10 && c.z < 7.0;

// A long mixed shift: café guests at the door, garden guests at the arch, every counter kept stocked
// (the stand included), a cashier on the registers and a cleaner on the tables. The day clock is set,
// so the real waiting and photo paths run.
function runShift(minutes, { cafeEvery = 2.2, gardenEvery = 3.5, cafeCap = 10, gardenCap = 7 } = {}) {
  const w = allBuilt();
  w.dayState = { day: 15, t: 10, phase: 'morning' };
  const staff = [createStaff('cashier', { x: -5.5, z: -0.6 }), createStaff('cleaner', { x: -6, z: 4 })];
  const list = [];
  const log = new Map();
  const seats = new Map();
  const pays = [];
  let seq = 1, cafeT = 0, gardenT = 1;
  let stalls = 0, teleports = 0;
  const lastPos = new Map();
  for (let t = 0; t < minutes * 60; t += DT) {
    for (const id of w.displays) { const st = w.stations.get(id); putOnDisplay(w, id, st.product, st.capacity - st.stock); }
    for (const st of w.stations.values()) if (st.type === 'bowl' && st.active) st.stock = st.capacity;
    stepMachines(w, DT);
    const nGarden = list.filter(c => c.terraceBound).length, nCafe = list.length - nGarden;
    const late = t > minutes * 60 - 90; // the last 90 s drain the room
    if ((cafeT -= DT) <= 0 && nCafe < cafeCap && !late) {
      cafeT = cafeEvery;
      const c = createCustomer(seq, SPECIES[seq % 4], { shirt: seq % 5, hair: seq % 4, skin: seq % 3 }, AREA1); c.petVariant = seq % 3; seq++;
      list.push(c);
    }
    if ((gardenT -= DT) <= 0 && nGarden < gardenCap && !late) {
      gardenT = gardenEvery;
      const c = createCustomer(seq, SPECIES[seq % 4], { shirt: seq % 5, hair: seq % 4, skin: seq % 3 }, AREA1, { garden: true }); c.petVariant = seq % 3; seq++;
      list.push(c);
    }
    stepCustomers(list, w, price, DT);
    stepStaff(staff, w, DT, () => {});
    for (const c of list) {
      let r = log.get(c.id);
      if (!r) { r = { garden: c.terraceBound, wishes: [], maxZ: -Infinity, deck: 0, cafe: 0, last: null, done: false }; log.set(c.id, r); }
      r.maxZ = Math.max(r.maxZ, c.z);
      if (onDeck(c)) r.deck++;
      if (inCafe(c)) r.cafe++;
      r.last = { x: c.x, z: c.z }; r.done = c.done;
      const m = c.mover;
      teleports += m.teleports; m.teleports = 0;
      if (m.hasTarget) {
        const p = lastPos.get(m) || { x: m.x, z: m.z, t };
        if (Math.hypot(m.x - p.x, m.z - p.z) > 0.05) { p.x = m.x; p.z = m.z; p.t = t; } else if (t - p.t > 3) { stalls++; p.t = t; }
        lastPos.set(m, p);
      } else lastPos.delete(m);
    }
    for (const e of w.events) {
      if (e.type === 'wish') log.get(e.id)?.wishes.push(e.product);
      if (e.type === 'seated') seats.set(e.seatId, (seats.get(e.seatId) || 0) + 1);
      if (e.type === 'pay') pays.push({ id: e.id, at: e.checkoutId, garden: log.get(e.id)?.garden });
    }
    w.events.length = 0;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].done) list.splice(i, 1);
  }
  return { w, log, seats, pays, stalls, teleports, left: list.length };
}

test('a long shift in both rooms: nobody but staff crosses the gate, and every garden table is used', () => {
  const { w, log, seats, pays, stalls, teleports, left } = runShift(12);
  const guests = [...log.values()];
  const cafeGuests = guests.filter(g => !g.garden), gardenGuests = guests.filter(g => g.garden);
  assert.ok(cafeGuests.length > 100 && gardenGuests.length > 60, `a real crowd: ${cafeGuests.length} café, ${gardenGuests.length} garden`);
  // Café guests never set foot on the deck (the fence line is z 7.0; a guest body is 0.3 m).
  const outside = cafeGuests.filter(g => g.maxZ > 7.05 || g.deck > 0);
  assert.equal(outside.length, 0, `${outside.length} café guests walked onto the deck`);
  // Garden guests never set foot in the café.
  const inside = gardenGuests.filter(g => g.cafe > 0);
  assert.equal(inside.length, 0, `${inside.length} garden guests came into the café`);
  // Menus: café guests never wish for ice cream; garden guests wish for nothing else.
  assert.equal(cafeGuests.filter(g => g.wishes.some(p => p === 'icecream' || p === 'sundae')).length, 0);
  assert.equal(gardenGuests.filter(g => g.wishes.some(p => p !== 'icecream' && p !== 'sundae')).length, 0);
  // Money: every garden sale lands in the stand's jar, every café sale at a register.
  assert.ok(pays.filter(p => p.garden).length > 50);
  assert.deepEqual([...new Set(pays.filter(p => p.garden).map(p => p.at))], ['barIce']);
  assert.ok(pays.filter(p => !p.garden).every(p => w.stations.get(p.at).type === 'checkout'));
  // Every table in both rooms shows life (nearest-free-table choice), garden tables only for garden guests.
  for (const st of w.stations.values()) {
    if (st.type !== 'seat' || !st.active) continue;
    assert.ok((seats.get(st.id) || 0) > 0, `${st.id} was never sat at: ${JSON.stringify(Object.fromEntries(seats))}`);
  }
  // Out by the door they came in by, all the way to the street spot, not popped on the deck.
  const done = gardenGuests.filter(g => g.done);
  assert.ok(done.length > 50);
  for (const g of done) {
    assert.ok(g.last.x < -10.5 && Math.abs(g.last.z - AREA1.terraceSpawnOut.z) < 1.3, `a garden guest ended at (${g.last.x.toFixed(2)},${g.last.z.toFixed(2)})`);
  }
  assert.equal(stalls, 0, 'stalls > 3 s');
  assert.equal(teleports, 0);
  assert.equal(left, 0, 'the room drains at closing');
});

test('a café guest waiting for a table waits in the café, beside a café table, never in the gate apron', () => {
  const w = allBuilt();
  w.dayState = { day: 15, t: 10, phase: 'morning' };
  // Every café table DIRTY (waiting is only ever for a table the player can wipe — see
  // sim/serviceQuality.js seatsMightFree), and every garden table dirty and empty right by the gate,
  // so the nearest wait spot of all is on the wrong side of the fence.
  for (const st of w.stations.values()) {
    if (st.type !== 'seat') continue;
    st.dirty = true; st.occupied = false;
  }
  const [apron] = gateApron(AREA1);
  // Several guests paying at the till nearest the gate, so the nearest wait spots are contested.
  const list = [];
  for (let i = 0; i < 6; i++) {
    const c = createCustomer(100 + i, 'cat', 0, AREA1);
    Object.assign(c, { state: 'atRegister', paid: true, amount: 12, slot: 0, registerId: 'register1', wish: { product: 'cookie', treat: false } });
    c.x = 1.0; c.z = 5.0; c.mover.x = 1.0; c.mover.z = 5.0; c.mover.mask = 0;
    list.push(c);
  }
  stepCustomers(list, w, price, DT);
  const points = list.map(c => c.waitSeatPoint);
  for (const [i, c] of list.entries()) {
    assert.equal(c.state, 'waitSeat');
    const p = points[i];
    assert.ok(p.z <= 7, `waits at z ${p.z.toFixed(2)}, on the deck side of the fence`);
    assert.ok(!(p.x >= apron.x0 && p.x <= apron.x1 && p.z >= apron.z0 && p.z <= apron.z1), `waits in the gate apron at (${p.x.toFixed(2)},${p.z.toFixed(2)})`);
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(p.x - points[j].x, p.z - points[j].z) >= 0.65, 'two waiters on one spot');
  }
});

test('a garden guest never waits for a table: with none free it pays the takeaway price and leaves eating', () => {
  const w = allBuilt();
  w.dayState = { day: 15, t: 10, phase: 'rush' };
  for (const st of w.stations.values()) if (st.type === 'seat' && garden(w, st)) st.dirty = true;
  const stand = w.stations.get('barIce');
  stand.stock = 3;
  const c = createCustomer(7, 'dog', 0, AREA1, { garden: true });
  const q0 = stand.queue[0];
  Object.assign(c, { state: 'queue', counterId: 'barIce', slot: 0, x: q0.x, z: q0.z, wish: { product: 'icecream', treat: false }, arrived: 1 });
  Object.assign(c.mover, { x: q0.x, z: q0.z, mask: 0 });
  stepCustomers([c], w, price, DT);
  assert.equal(c.paid, true);
  assert.equal(c.amount, 10, 'one cone (odd id), takeaway price');
  assert.equal(stand.pile, 10, 'into the stand\'s jar');
  assert.equal(c.state, 'leave');
  const pay = w.events.find(e => e.type === 'pay');
  assert.equal(pay && pay.checkoutId, 'barIce');
});

test('seat choice is the nearest free clean table in the guest\'s own room', () => {
  const w = allBuilt();
  const cafeGuest = createCustomer(8, 'cat', 0, AREA1);
  const seat6 = w.stations.get('seat6');
  Object.assign(cafeGuest, { state: 'atRegister', paid: true, amount: 12, slot: 0, registerId: 'register1', wish: { product: 'cookie', treat: false } });
  const at = (c, x, z) => { c.x = x; c.z = z; Object.assign(c.mover, { x, z, mask: 0 }); };
  at(cafeGuest, seat6.pair.human.x + 0.5, seat6.pair.human.z - 1);
  stepCustomers([cafeGuest], w, price, DT);
  assert.equal(cafeGuest.seatId, 'seat6', 'the table beside it, not seat1 at the head of the list');
  // A garden guest standing by the gate still only ever takes a deck table.
  const g = createCustomer(9, 'cat', 0, AREA1, { garden: true });
  const seat10 = w.stations.get('seat10');
  at(g, seat10.pair.human.x, seat10.pair.human.z + 1);
  Object.assign(g, { state: 'waitSeat', paid: true }); // paid at the stand, now looking for a table
  stepCustomers([g], w, price, DT);
  assert.equal(g.seatId, 'seat10');
});

test('garden arrivals are extra guests: buying the garden leaves the café\'s own demand exactly as it was', () => {
  const before = buildThrough('z_seats2'), after = buildThrough('z_terrace'), more = allBuilt();
  const staff = { runner: 1, cashier: 1 };
  for (const level of [0, 12, 30]) {
    assert.equal(spawnInterval(after.built, staff, level), spawnInterval(before.built, staff, level));
    assert.equal(maxCustomers(after.built, staff, level), maxCustomers(before.built, staff, level));
  }
  assert.equal(gardenTableCount(before), 0);
  assert.equal(gardenTableCount(after), 2);
  assert.equal(gardenTableCount(more), 4);
  assert.equal(terraceSpawnInterval(gardenTableCount(before)), null, 'no garden, no garden guests');
  assert.equal(terraceMaxCustomers(0), 0);
  assert.equal(terraceSpawnInterval(2), 10);
  assert.equal(terraceSpawnInterval(4), 8.5, 'more tables, more garden guests');
  assert.equal(terraceMaxCustomers(2), 5);
  assert.equal(terraceMaxCustomers(4), 7);
});

test('a garden guest is made on the street by its arch; the café menu never offers ice cream', () => {
  const c = createCustomer(3, 'bunny', 0, AREA1, { garden: true });
  assert.equal(c.terraceBound, true);
  assert.deepEqual({ x: c.x, z: c.z }, AREA1.terraceSpawn);
  const cafe = createCustomer(4, 'bunny', 0, AREA1);
  assert.equal(cafe.terraceBound, false);
  assert.deepEqual({ x: cafe.x, z: cafe.z }, AREA1.spawnStart);
  const w = allBuilt();
  w.stations.get('barIce').stock = 8; w.stations.get('icecream1').stock = 8;
  for (let i = 0; i < 200; i++) assert.notEqual(wishFor(w).product, 'icecream');
});

test('the ice cream machine makes cones with no supply, and the stand\'s jar survives a save', () => {
  const w = allBuilt();
  const ice = w.stations.get('icecream1');
  assert.equal('cream' in ice, false);
  stepMachines(w, 10);
  assert.ok(ice.stock > 0, 'it makes cones on its own');
  const stand = w.stations.get('barIce');
  stand.pile = 77; stand.stock = 5;
  const snap = snapshotStationState(w);
  assert.deepEqual(snap.byId.barIce, { stock: 5, product: 'icecream', pile: 77 });
  assert.equal('cream' in snap.byId.icecream1, false);
  const w2 = allBuilt();
  assert.ok(restoreStationState(w2, snap));
  assert.equal(w2.stations.get('barIce').pile, 77);
  assert.equal(w2.stations.get('barIce').stock, 5);
  // An old save's cream field is not read, and does not break the row.
  const old = { v: 1, byId: { icecream1: { cream: 3, stock: 4, product: 'icecream' } } };
  const w3 = allBuilt();
  assert.ok(restoreStationState(w3, old));
  assert.equal(w3.stations.get('icecream1').stock, 4);
});

test('a café guest with an empty kitchen settles for another café counter, never for the stand', () => {
  // The merge shipped one selector without the room filter: anyStockedDisplay, the "stuck 6 s at an
  // empty counter, take something else" rule. With the kitchen dry and the stand stocked — the normal
  // state while the owner works outside — it handed a café guest barIce, and the guest walked out
  // through gate1, queued on the deck and paid a café sale into the garden's jar. The garden tests
  // above could not see it, because they refill every counter every frame.
  const w = allBuilt();
  w.dayState = { day: 15, t: 10, phase: 'morning' };
  const stand = w.stations.get('barIce');
  const c = createCustomer(1, 'cat', 0, AREA1);
  assert.equal(c.terraceBound, false);
  const list = [c];
  let onDeckSamples = 0, wentToStand = false;
  const counters = new Set();
  for (let t = 0; t < 120; t += DT) {
    for (const id of w.displays) {            // the kitchen is dry; only the stand has stock
      const st = w.stations.get(id);
      st.stock = st.id === 'barIce' ? st.capacity : 0;
    }
    stand.stock = stand.capacity;
    stepCustomers(list, w, price, DT);
    if (c.counter) counters.add(c.counter);
    if (c.counter === 'barIce') wentToStand = true;
    if (onDeck(c)) onDeckSamples++;
    if (c.done) break;
  }
  assert.equal(wentToStand, false, 'the stand is not on a café guest\'s menu, however hungry the café is');
  assert.equal(onDeckSamples, 0, 'and it never crosses the gate');
  assert.equal(stand.pile | 0, 0, 'so nothing of the café\'s lands in the garden jar');
  for (const id of counters) assert.equal(garden(w, w.stations.get(id)), false, `${id} is a café counter`);
});
