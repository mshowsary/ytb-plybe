import { test } from 'node:test'; import assert from 'node:assert/strict';
import {
  playerSpeed, carryCap, incomeMult, salePrice, upgradeCost, spawnInterval, maxCustomers, STAFF, hireCost, buyUpgrade, hire,
  WORKER_UPGRADES, MACHINE_UPGRADES, RUNNER_CARRY_LEVELS, DISPLAY_CAP_LEVELS,
  buyWorkerUpgrade, buyMachineUpgrade, workerUpgradeCost, machineUpgradeCost, machineSpeedMult, workerSpeedMult,
} from '../src/sim/economy.js';
import { createWorld, stepOvens } from '../src/sim/world.js';
import { AREA1 } from '../data/area1.js';
import { stepStaff, createStaff } from '../src/sim/staff.js';
const up0 = { speed: 0, carry: 0, income: 0 };

test('base values keep starter bakery modest while later products grow in value', () => {
  assert.equal(playerSpeed(up0), 4.6); assert.equal(carryCap(up0), 6);
  assert.equal(incomeMult(up0, {}, 0), 1);
  assert.equal(salePrice('cookie', up0, {}, false, 0), 8);
  assert.equal(salePrice('coffee', up0, {}, false, 0), 12);
  assert.equal(salePrice('smoothie', up0, {}, false, 0), 24);
  assert.equal(salePrice('treat', up0, {}, false, 0), 8);
});
test('upgrades scale', () => {
  assert.ok(Math.abs(playerSpeed({ ...up0, speed: 2 }) - 4.6 * 1.3) < 1e-9);
  assert.equal(carryCap({ ...up0, carry: 3 }), 16);
  assert.equal(salePrice('cupcake', { ...up0, income: 1 }, {}, false, 0), Math.round(13 * 1.2));
  assert.equal(upgradeCost('speed', up0), 400);
  // The ladder no longer terminates: past the authored tiers it continues geometrically, so a
  // developed café always has somewhere to put coins. Effects stay bounded (asserted below).
  const t3 = upgradeCost('speed', { ...up0, speed: 3 });
  const t4 = upgradeCost('speed', { ...up0, speed: 4 });
  assert.ok(t3 > 1800, 'tier 3 continues past the last authored cost');
  assert.ok(t4 > t3, 'costs keep rising');
  // Power approaches a ceiling rather than growing without limit.
  assert.ok(playerSpeed({ ...up0, speed: 99 }) < 4.6 * 1.9);
  assert.ok(playerSpeed({ ...up0, speed: 8 }) > playerSpeed({ ...up0, speed: 4 }));
});
test('boost and seating', () => {
  assert.equal(incomeMult(up0, { x2Until: 1000 }, 500), 2);
  assert.equal(incomeMult(up0, { x2Until: 1000 }, 1500), 1);
  assert.equal(salePrice('cookie', up0, {}, true, 0), 16);
});

test('Task 25 demand is capacity-driven: Desk alone adds no traffic', () => {
  const cupcakes = new Set(['z_seats1', 'z_oven2']);
  const withDesk = new Set([...cupcakes, 'z_hire']);
  assert.equal(spawnInterval(cupcakes, {}), 6.85);
  assert.equal(spawnInterval(withDesk, {}), 6.85);
  assert.equal(maxCustomers(cupcakes, {}), 4);
  assert.equal(maxCustomers(withDesk, {}), 4);
});
test('productive lines and useful staff raise demand in bounded steps', () => {
  const desk = new Set(['z_seats1', 'z_oven2', 'z_hire']);
  const coffee = new Set([...desk, 'z_coffee']);
  assert.ok(spawnInterval(coffee, {}) < spawnInterval(desk, {}));
  assert.equal(maxCustomers(coffee, {}), 5);
  assert.ok(spawnInterval(coffee, { runner: 1 }) < spawnInterval(coffee, {}));
  assert.equal(maxCustomers(coffee, { runner: 1 }), 5);
  assert.equal(maxCustomers(coffee, { runner: 1, cashier: 1 }), 6);
  assert.ok(spawnInterval(new Set([...coffee, 'z_blender']), { runner: 1, cashier: 1 }) >= 4.3);
});
test('buyUpgrade deducts coins and refuses when short or maxed', () => {
  const state = { coins: 500, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 } };
  const r1 = buyUpgrade(state, 'speed');
  assert.equal(r1.ok, true); assert.equal(r1.cost, 400);
  assert.equal(state.coins, 100); assert.equal(state.up.speed, 1);
  const r2 = buyUpgrade(state, 'speed'); assert.equal(r2.ok, false);
  // Past the authored tiers the purchase now succeeds instead of being refused outright.
  const state2 = { coins: 100000, up: { speed: 3, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 } };
  const r3 = buyUpgrade(state2, 'speed');
  assert.equal(r3.ok, true); assert.equal(state2.up.speed, 4);
  // ...but an unaffordable one is still refused, which is what this test exists to guarantee.
  const state3 = { coins: 10, up: { speed: 6, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 } };
  const r4 = buyUpgrade(state3, 'speed'); assert.equal(r4.ok, false); assert.equal(state3.up.speed, 6);
});
test('Task 25 makes only the first Runner an early relief purchase', () => {
  assert.equal(STAFF.runner.costs[0], 150);
  assert.equal(STAFF.runner.costs[1], 2800);
  assert.equal(STAFF.cashier.costs[0], 1550);
  assert.equal(STAFF.cleaner.costs[0], 1350);
  const state = { coins: 20000, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0, cleaner: 0 } };
  const h1 = hire(state, 'runner'); assert.equal(h1.ok, true); assert.equal(h1.cost, 150); assert.equal(state.staff.runner, 1);
  const h2 = hire(state, 'runner'); assert.equal(h2.ok, true); assert.equal(h2.cost, 2800); assert.equal(state.staff.runner, 2);
  const h3 = hire(state, 'cashier'); assert.equal(h3.ok, true); assert.equal(h3.cost, 1550); assert.equal(state.staff.cashier, 1);
  // A second cashier is now hireable — register2 physically exists and used to stand unstaffable.
  const h4 = hire(state, 'cashier'); assert.equal(h4.ok, true); assert.equal(h4.cost, STAFF.cashier.costs[1]);
  const h5 = hire(state, 'cleaner'); assert.equal(h5.ok, true); assert.equal(h5.cost, 1350);
});
test('early Runner is affordable while specialist hires remain savings goals', () => {
  const wallet = 1300;
  assert.ok(hireCost('runner', { runner: 0 }) <= wallet);
  assert.ok(hireCost('cleaner', { cleaner: 0 }) > wallet);
  assert.ok(hireCost('cashier', { cashier: 0 }) > wallet);
});
test('hireCost quotes each successive hire and still terminates at the end of the table', () => {
  // Staff ladders are deliberately FINITE and short: unlimited staff would let the café run itself,
  // which is the opposite of the problem being fixed. They are simply longer than one entry now.
  assert.equal(hireCost('runner', { runner: 2 }), STAFF.runner.costs[2]);
  assert.equal(hireCost('cashier', { cashier: 0 }), STAFF.cashier.costs[0]);
  assert.equal(hireCost('runner', { runner: STAFF.runner.costs.length }), null);
  assert.equal(hireCost('cashier', { cashier: STAFF.cashier.costs.length }), null);
});

function freshState(coins) {
  return {
    coins, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0, cleaner: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 },
  };
}
test('WORKER_UPGRADES/MACHINE_UPGRADES cost tables remain stable', () => {
  assert.deepEqual(WORKER_UPGRADES.speed, [300, 700, 1500]);
  assert.deepEqual(WORKER_UPGRADES.carry, [250, 600, 1300]);
  assert.deepEqual(MACHINE_UPGRADES.oven, [400, 900, 1800]);
  assert.deepEqual(MACHINE_UPGRADES.coffee, [400, 900, 1800]);
  assert.deepEqual(MACHINE_UPGRADES.display, [300, 700, 1500]);
});
test('buyWorkerUpgrade: runner Speed deducts coins and advances the tier; refuses when unaffordable or maxed', () => {
  const s = freshState(300);
  const r1 = buyWorkerUpgrade(s, 'runner', 'speed');
  assert.equal(r1.ok, true); assert.equal(r1.cost, 300); assert.equal(s.coins, 0); assert.equal(s.staffLevels.runner.speed, 1);
  const r2 = buyWorkerUpgrade(s, 'runner', 'speed'); assert.equal(r2.ok, false); assert.equal(r2.cost, 700);
  // Past the authored tiers the ladder continues, so this now succeeds.
  const s2 = freshState(100000); s2.staffLevels.runner.speed = 3;
  const r3 = buyWorkerUpgrade(s2, 'runner', 'speed');
  assert.equal(r3.ok, true); assert.equal(s2.staffLevels.runner.speed, 4);
  // An unknown row is still refused rather than crashing.
  const s3 = freshState(100000);
  assert.equal(buyWorkerUpgrade(s3, 'cleaner', 'carry').ok, false);
});
test('buyWorkerUpgrade: cashier/cleaner have no Carry row — refused, not a crash', () => {
  const s = freshState(100000);
  const r = buyWorkerUpgrade(s, 'cashier', 'carry');
  assert.equal(r.ok, false); assert.equal(r.cost, null);
  assert.equal(workerUpgradeCost('cleaner', 'carry', s.staffLevels), null);
});
test('runner Carry levels: 6 -> 9 -> 12 -> 16 via RUNNER_CARRY_LEVELS, applied through stepStaff/createStaff', () => {
  assert.deepEqual(RUNNER_CARRY_LEVELS, [6, 9, 12, 16]);
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_oven2', 'z_register2', 'z_coffee'] });
  const oven = w.stations.get('oven1'); oven.stock = 12;
  const levels = { runner: { speed: 0, carry: 2 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };
  const runner = createStaff('runner', oven.front);
  for (let t = 0; t < 4; t += 1 / 30) stepStaff([runner], w, 1 / 30, () => {}, levels);
  assert.equal(runner.items.length, 12);
});
test('after three Carry purchases (tier 3), a runner carries up to 16', () => {
  const s = freshState(250 + 600 + 1300);
  for (let i = 0; i < 3; i++) assert.equal(buyWorkerUpgrade(s, 'runner', 'carry').ok, true);
  assert.equal(s.staffLevels.runner.carry, 3);
  // Carry keeps climbing past tier 3 (+4 slots a tier); the authored tier-3 value of 16 is what
  // this test actually guards, and it is unchanged.
  assert.ok(workerUpgradeCost('runner', 'carry', s.staffLevels) > 1300);
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_oven2', 'z_register2', 'z_coffee'] });
  const oven = w.stations.get('oven1'); oven.stock = 20;
  const runner = createStaff('runner', oven.front);
  for (let t = 0; t < 5; t += 1 / 30) stepStaff([runner], w, 1 / 30, () => {}, s.staffLevels);
  assert.equal(runner.items.length, 16);
});
test('cashier level formula: a Speed-upgraded cashier serves faster than the base 1.0s rate', () => {
  const w = createWorld(AREA1);
  const co = w.stations.get('register1');
  const c = { id: 1, slot: 0, state: 'atRegister', paid: false, amount: 30, x: co.queue[0].x, z: co.queue[0].z, mover: { hasTarget: false } };
  w._regQueues = new Map([['register1', [c]]]);
  const levels = { runner: { speed: 0, carry: 0 }, cashier: { speed: 1 }, cleaner: { speed: 0 } };
  const cashier = createStaff('cashier', co.cash);
  for (let t = 0; t < 0.85 && !c.paid; t += 1 / 30) stepStaff([cashier], w, 1 / 30, () => {}, levels);
  assert.equal(c.paid, true); assert.equal(co.cashierLevel, 2);
});
test('cleaner Speed level shortens the clean rate below the base 1.6s', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = w.stations.get('seat1'); seat.dirty = true;
  const levels = { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 1 } };
  const cleaner = createStaff('cleaner', seat.front);
  for (let t = 0; t < 1.4 && seat.dirty; t += 1 / 30) stepStaff([cleaner], w, 1 / 30, () => {}, levels);
  assert.equal(seat.dirty, false);
});
test('buyMachineUpgrade: Oven speed divides bake time by 1.25 at tier 1', () => {
  const s = freshState(400);
  const r = buyMachineUpgrade(s, 'oven');
  assert.equal(r.ok, true); assert.equal(r.cost, 400); assert.equal(s.coins, 0); assert.equal(s.machineLevels.oven, 1);
  assert.ok(Math.abs(machineSpeedMult(s.machineLevels, 'oven') - 1.25) < 1e-9);
  const w = createWorld(AREA1); const oven = w.stations.get('oven1');
  stepOvens(w, 1.0, machineSpeedMult(s.machineLevels, 'oven'));
  assert.equal(oven.stock, 1);
});
test('buyMachineUpgrade: Display capacity tier costs/values still resolve', () => {
  const s = freshState(300);
  const r = buyMachineUpgrade(s, 'display');
  assert.equal(r.ok, true); assert.equal(r.cost, 300); assert.equal(s.machineLevels.display, 1);
  assert.equal(DISPLAY_CAP_LEVELS[s.machineLevels.display], 16);
  const w = createWorld(AREA1);
  assert.equal(w.stations.get('dispCookie').capacity, 8);
});
test('buyMachineUpgrade refuses when unaffordable or maxed', () => {
  const s = freshState(100);
  const r1 = buyMachineUpgrade(s, 'coffee'); assert.equal(r1.ok, false); assert.equal(r1.cost, 400);
  // Past the authored tiers this now succeeds; the unaffordable case above is the real guarantee.
  const s2 = freshState(100000); s2.machineLevels.coffee = 3;
  const r2 = buyMachineUpgrade(s2, 'coffee');
  assert.equal(r2.ok, true); assert.equal(s2.machineLevels.coffee, 4);
  const s3 = freshState(10); s3.machineLevels.coffee = 6;
  assert.equal(buyMachineUpgrade(s3, 'coffee').ok, false);
});
