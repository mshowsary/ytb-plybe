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
test('base values', () => {
  assert.equal(playerSpeed(up0), 4.6); assert.equal(carryCap(up0), 6);
  assert.equal(incomeMult(up0, {}, 0), 1);
  assert.equal(salePrice('cookie', up0, {}, false, 0), 8); // Loop v2 Task 3: v1 base (12) tuned -35%, within the -40% bound, to hit the bot's day-1 earnings target
});
test('upgrades scale', () => {
  assert.ok(Math.abs(playerSpeed({ ...up0, speed: 2 }) - 4.6 * 1.3) < 1e-9);
  assert.equal(carryCap({ ...up0, carry: 3 }), 16);
  assert.equal(salePrice('cupcake', { ...up0, income: 1 }, {}, false, 0), Math.round(13 * 1.2)); // Loop v2 Task 3: cupcake tuned to 13
  assert.equal(upgradeCost('speed', up0), 400); assert.equal(upgradeCost('speed', { ...up0, speed: 3 }), null);
});
test('boost and seating', () => {
  assert.equal(incomeMult(up0, { x2Until: 1000 }, 500), 2);
  assert.equal(incomeMult(up0, { x2Until: 1000 }, 1500), 1);
  assert.equal(salePrice('cookie', up0, {}, true, 0), Math.round(8 * 2.0)); // Loop v2 Task 3: cookie tuned to 8
});
// M3 T6: floor 1.2 -> 1.5, per-seating reduction 0.4 -> 0.3, maxCustomers cap 12 -> 10 (all within
// their task bounds) — see src/sim/economy.js.
// M3 T6 pass 2 ("early pressure" ruling): BEFORE z_hire is built, both formulas ignore seating
// builds entirely and hold at a flat, gentle rate (spawn 3.5s, cap 8) — z_seats1 unlocks earlier
// in the zone chain than z_hire, so without this gate a pre-hire café with seats built would
// already see the steeper post-hire pacing despite having only the owner to serve it.
// Loop v2 Task 3: eased well below the old M3 flat-demand numbers — the day-phase multiplier
// (day.js's spawnMult, up to x2.0 in rush) now stacks ON TOP of this base rate, so the base itself
// has to be gentler than the old single-layer economy needed (see economy.js's own comment).
test('spawnInterval and maxCustomers hold flat (6.0s / cap 5) before z_hire is built, even with seating already up', () => {
  assert.equal(spawnInterval(new Set()), 6.0);
  assert.equal(spawnInterval(new Set(['z_seats1'])), 6.0);
  assert.equal(spawnInterval(new Set(['z_seats1', 'z_seats2'])), 6.0); // z_hire still missing
  assert.equal(maxCustomers(new Set()), 5);
  assert.equal(maxCustomers(new Set(['z_seats1'])), 5);
  assert.equal(maxCustomers(new Set(['z_seats1', 'z_seats2'])), 5);
});
test('spawnInterval and maxCustomers switch to the tuned post-hire formula once z_hire is built', () => {
  assert.equal(spawnInterval(new Set(['z_hire'])), 5.5);
  assert.ok(Math.abs(spawnInterval(new Set(['z_hire', 'z_seats1', 'z_seats2'])) - 4.7) < 1e-9);
  assert.equal(maxCustomers(new Set(['z_hire'])), 4);
  assert.equal(maxCustomers(new Set(['z_hire', 'z_seats1'])), 5);
  assert.equal(maxCustomers(new Set(['z_hire', 'z_seats1', 'z_seats2'])), 6);
});
test('buyUpgrade deducts coins and refuses when short or maxed', () => {
  const state = { coins: 500, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 } };
  const r1 = buyUpgrade(state, 'speed');
  assert.equal(r1.ok, true); assert.equal(r1.cost, 400);
  assert.equal(state.coins, 100); assert.equal(state.up.speed, 1);
  const r2 = buyUpgrade(state, 'speed'); // next tier costs 900, only 100 left
  assert.equal(r2.ok, false);
  const state2 = { coins: 100000, up: { speed: 3, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 } };
  const r3 = buyUpgrade(state2, 'speed'); // tier maxed
  assert.equal(r3.ok, false); assert.equal(r3.cost, null);
});
test('hire deducts rising costs and refuses a second cashier', () => {
  // Loop v2 Task 3: hire costs reset to the design doc's own guideline (cashier 600, runner 700/
  // 1400, cleaner 350) — see src/sim/economy.js's STAFF.
  const state = { coins: 10000, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0 } };
  const h1 = hire(state, 'runner'); assert.equal(h1.ok, true); assert.equal(h1.cost, 700); assert.equal(state.staff.runner, 1);
  const h2 = hire(state, 'runner'); assert.equal(h2.ok, true); assert.equal(h2.cost, 1400); assert.equal(state.staff.runner, 2);
  const h3 = hire(state, 'cashier'); assert.equal(h3.ok, true); assert.equal(h3.cost, 600); assert.equal(state.staff.cashier, 1);
  const h4 = hire(state, 'cashier'); assert.equal(h4.ok, false); assert.equal(h4.cost, null);
});
test('hireCost returns null past the cost table', () => {
  assert.equal(hireCost('runner', { runner: 2 }), null);
  assert.equal(hireCost('cashier', { cashier: 0 }), STAFF.cashier.costs[0]);
});

// M3 T5: worker (Speed/Carry) and machine (Oven-speed/Coffee-speed/Display-capacity) upgrade
// tiers — costs, effects, and refusal when unaffordable or maxed.
function freshState(coins) {
  return {
    coins, up: { speed: 0, carry: 0, income: 0 }, staff: { runner: 0, cashier: 0, cleaner: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    machineLevels: { oven: 0, coffee: 0, display: 0 },
  };
}
test('WORKER_UPGRADES/MACHINE_UPGRADES cost tables match the task brief', () => {
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
  const r2 = buyWorkerUpgrade(s, 'runner', 'speed'); // next tier is 700, 0 coins left
  assert.equal(r2.ok, false); assert.equal(r2.cost, 700);
  const s2 = freshState(100000);
  s2.staffLevels.runner.speed = 3; // past WORKER_UPGRADES.speed.length (3 tiers)
  const r3 = buyWorkerUpgrade(s2, 'runner', 'speed');
  assert.equal(r3.ok, false); assert.equal(r3.cost, null);
});
test('buyWorkerUpgrade: cashier/cleaner have no Carry row — refused, not a crash', () => {
  const s = freshState(100000);
  const r = buyWorkerUpgrade(s, 'cashier', 'carry');
  assert.equal(r.ok, false); assert.equal(r.cost, null);
  assert.equal(workerUpgradeCost('cleaner', 'carry', s.staffLevels), null);
});
test('runner Carry levels: 6 -> 9 -> 12 -> 16 via RUNNER_CARRY_LEVELS, applied through stepStaff/createStaff', () => {
  // M3 T5 fix round 1: four entries (base + three purchasable tiers) — WORKER_UPGRADES.carry only
  // has 3 cost rows, so the reachable tiers are 0..3 and RUNNER_CARRY_LEVELS must have 4 entries
  // for stepStaff's min(RUNNER_CARRY_LEVELS.length - 1, tier) clamp to ever reach the last one.
  assert.deepEqual(RUNNER_CARRY_LEVELS, [6, 9, 12, 16]);
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_oven2', 'z_register2', 'z_coffee'] });
  const oven = w.stations.get('oven1'); oven.stock = 12;
  const levels = { runner: { speed: 0, carry: 2 }, cashier: { speed: 0 }, cleaner: { speed: 0 } }; // tier 2 -> 12
  const runner = createStaff('runner', oven.front);
  // load for long enough that carryCap (not a slow oven) is the binding constraint
  for (let t = 0; t < 4; t += 1 / 30) stepStaff([runner], w, 1 / 30, () => {}, levels);
  assert.equal(runner.items.length, 12, 'a level-2 (tier index 2) runner should carry up to 12, not the base 6');
});
test('after three Carry purchases (tier 3), a runner carries up to 16', () => {
  const s = freshState(250 + 600 + 1300);
  for (let i = 0; i < 3; i++) {
    const r = buyWorkerUpgrade(s, 'runner', 'carry');
    assert.equal(r.ok, true, `purchase ${i + 1} should succeed`);
  }
  assert.equal(s.staffLevels.runner.carry, 3);
  assert.equal(workerUpgradeCost('runner', 'carry', s.staffLevels), null, 'Carry is maxed after 3 tiers');
  const w = createWorld(AREA1, { built: ['z_seats1', 'z_oven2', 'z_register2', 'z_coffee'] });
  const oven = w.stations.get('oven1'); oven.stock = 20;
  const runner = createStaff('runner', oven.front);
  for (let t = 0; t < 5; t += 1 / 30) stepStaff([runner], w, 1 / 30, () => {}, s.staffLevels);
  assert.equal(runner.items.length, 16, 'tier-3 carry should be 16, the RUNNER_CARRY_LEVELS[3] value');
});
test('cashier level formula: a Speed-upgraded cashier serves faster than the base 1.0s rate', () => {
  const w = createWorld(AREA1);
  const co = w.stations.get('register1');
  const c = { id: 1, slot: 0, state: 'atRegister', paid: false, amount: 30, x: co.queue[0].x, z: co.queue[0].z, mover: { hasTarget: false } };
  w._regQueues = new Map([['register1', [c]]]);
  const levels = { runner: { speed: 0, carry: 0 }, cashier: { speed: 1 }, cleaner: { speed: 0 } }; // tier 1 -> cashierLevel 2
  const cashier = createStaff('cashier', co.cash);
  // level-2 rate = 1.0 / (1 + 0.25*1) = 0.8s — must be paid well before the level-1 1.1s window,
  // and the register must actually record the upgraded level.
  for (let t = 0; t < 0.85 && !c.paid; t += 1 / 30) stepStaff([cashier], w, 1 / 30, () => {}, levels);
  assert.equal(c.paid, true, 'a level-2 cashier should have processed the customer within 0.85s');
  assert.equal(co.cashierLevel, 2);
});
test('cleaner Speed level shortens the clean rate below the base 1.6s', () => {
  const w = createWorld(AREA1, { built: ['z_seats1'] });
  const seat = w.stations.get('seat1'); seat.dirty = true;
  const levels = { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 1 } }; // tier 1 -> rate 1.6/1.25 = 1.28s
  const cleaner = createStaff('cleaner', seat.front);
  for (let t = 0; t < 1.4 && seat.dirty; t += 1 / 30) stepStaff([cleaner], w, 1 / 30, () => {}, levels);
  assert.equal(seat.dirty, false, 'a level-2 cleaner should finish well inside 1.4s (base rate is 1.6s)');
});
test('buyMachineUpgrade: Oven speed divides bake time by 1.25 at tier 1', () => {
  const s = freshState(400);
  const r = buyMachineUpgrade(s, 'oven');
  assert.equal(r.ok, true); assert.equal(r.cost, 400); assert.equal(s.machineLevels.oven, 1);
  assert.ok(Math.abs(machineSpeedMult(s.machineLevels, 'oven') - 1.25) < 1e-9);
  const w = createWorld(AREA1);
  const oven = w.stations.get('oven1');
  const mult = machineSpeedMult(s.machineLevels, 'oven');
  // base cookie bake is 1.2s/unit; at 1.25x, 1.2/1.25 = 0.96s/unit — one full second should yield
  // one unit at the upgraded rate but not two (still under the tier-2 threshold).
  stepOvens(w, 1.0, mult);
  assert.equal(oven.stock, 1);
});
// Loop v2 Task 1: the sim-level 'display' machine-upgrade purchase (tier/cost bookkeeping) is
// untouched and still exercised here; systems/stations.js no longer WIRES it to any station's
// capacity, though (every display is a flat 8 for now — star levels replace this in Task 3, see
// data/area1.js and src/systems/stations.js), so the old "applies to every counter" assertion is
// gone — there is no more counter to apply it to.
test('buyMachineUpgrade: Display capacity tier costs/values still resolve (wiring to station capacity is Task 3)', () => {
  const s = freshState(300);
  const r = buyMachineUpgrade(s, 'display');
  assert.equal(r.ok, true); assert.equal(r.cost, 300); assert.equal(s.machineLevels.display, 1);
  assert.equal(DISPLAY_CAP_LEVELS[s.machineLevels.display], 16);
  const w = createWorld(AREA1);
  assert.equal(w.stations.get('dispCookie').capacity, 8, 'a display\'s capacity is a flat 8 for now, independent of machineLevels.display');
});
test('buyMachineUpgrade refuses when unaffordable or maxed', () => {
  const s = freshState(100);
  const r1 = buyMachineUpgrade(s, 'coffee');
  assert.equal(r1.ok, false); assert.equal(r1.cost, 400);
  const s2 = freshState(100000); s2.machineLevels.coffee = 3; // past the 3-tier table
  const r2 = buyMachineUpgrade(s2, 'coffee');
  assert.equal(r2.ok, false); assert.equal(r2.cost, null);
});
