// Diagnosis (see economyConfig.js's DEMAND comment for the full write-up, and the task handoff for
// the measured numbers): tools/bot.js's honest, staff-actor-modeling run showed service friction
// getting WORSE, not better, as the café scales — outside-rush friction stuck at 66.9% against a
// <25% target, long after the café is fully built out. The mechanism: spawnInterval()/maxCustomers()
// scale demand off `level` (cafeLevel — the sum of every station's star tier), and the star ladder
// never terminates (continueLadder/nextStarCost keep pricing further tiers forever) while a star buys
// PRICE and, for a display, stock slots — buyStar() never touches machineLevels/staffLevels, so it
// adds zero service throughput. Every lever that DOES add throughput (SPEED_ASYMPTOTE/
// MACHINE_ASYMPTOTE/WORKER_ASYMPTOTE) is deliberately bounded to an asymptote past its own authored
// tiers; demand had no matching bound and kept compounding linearly with `level` past the point where
// throughput could plausibly keep up. These tests guard the fix (a matching asymptote on the demand
// side, past DEMAND.LEVEL_SOFT_CAP) and the frozen boundary it must never cross.
//
// A control experiment (recorded in economyConfig.js's DEMAND comment history, reproducible by
// setting LEVEL_GATE far out of reach) showed the level-driven scaling is a real but SECONDARY
// contributor: fully disabling it only recovers outside-rush friction from 66.9% to 58.9%, so the
// bulk of that WARN is structural, owned by files outside this task (day.js's rush-vs-off-rush
// spawnMult ratio, customers.js's wait/patience state machine) — reported honestly rather than
// tuned away by widening the target band.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnInterval, maxCustomers, CROWD_FLOOR_INTERVAL, CROWD_CEILING, cafeLevel,
  workerSpeedMult, machineSpeedMult, buyStar, ensureStars, STAR_IDS,
} from '../src/sim/economy.js';
import { DEMAND } from '../src/sim/economyConfig.js';
import { createWorld } from '../src/sim/world.js';
import { AREA1 } from '../data/area1.js';

const BUILT = new Set(['z_seats1', 'z_oven2', 'z_hire', 'z_coffee', 'z_blender']);
const STAFF = { runner: 1, cashier: 1 };

// The exact pre-fix formula, recomputed from the same DEMAND constants every level <= LEVEL_SOFT_CAP
// must still match bit for bit — this is what "engage only as the café scales" means operationally.
function linearInterval(builtSet, staff, level) {
  const lines = 1 + (builtSet.has('z_oven2') ? 1 : 0) + (builtSet.has('z_coffee') ? 1 : 0) + (builtSet.has('z_blender') ? 1 : 0);
  const usefulStaff = Math.min(2, Math.max(0, (staff.runner | 0) + (staff.cashier | 0)));
  const authored = Math.max(DEMAND.MIN_INTERVAL, DEMAND.BASE_INTERVAL - DEMAND.INTERVAL_PER_LINE * (lines - 1) - DEMAND.INTERVAL_PER_STAFF * usefulStaff);
  if (!(level > DEMAND.LEVEL_GATE)) return authored;
  return Math.max(CROWD_FLOOR_INTERVAL, authored - DEMAND.INTERVAL_PER_LEVEL * (level - DEMAND.LEVEL_GATE));
}
function linearMaxCustomers(builtSet, staff, level) {
  const lines = 1 + (builtSet.has('z_oven2') ? 1 : 0) + (builtSet.has('z_coffee') ? 1 : 0) + (builtSet.has('z_blender') ? 1 : 0);
  const usefulStaff = Math.min(2, Math.max(0, (staff.runner | 0) + (staff.cashier | 0)));
  const authored = Math.min(DEMAND.MAX_CEILING_AUTHORED, DEMAND.BASE_MAX + (lines >= 3 ? DEMAND.MAX_LINE_BONUS : 0) + (usefulStaff >= 2 ? DEMAND.MAX_STAFF_BONUS : 0));
  if (!(level > DEMAND.LEVEL_GATE)) return authored;
  return Math.min(CROWD_CEILING, authored + Math.floor((level - DEMAND.LEVEL_GATE) / DEMAND.LEVEL_PER_MAX_STEP));
}

test('FROZEN: the soft cap sits at or above every level the bot ever reaches through day 11 (11)', () => {
  // tools/bot.js's own pace log for a full, honest run never exceeds cafeLevel 11 before day 12
  // (level sequence 0,2,4,6,8,9,10,11). If this ever drops below 11 the days 1-11 ledger moves.
  assert.ok(DEMAND.LEVEL_SOFT_CAP >= 11, 'LEVEL_SOFT_CAP must stay >= 11 or the frozen ledger breaks');
});

test('FROZEN: spawnInterval/maxCustomers reproduce the exact pre-fix linear formula through LEVEL_SOFT_CAP', () => {
  for (let level = 0; level <= DEMAND.LEVEL_SOFT_CAP; level++) {
    assert.equal(spawnInterval(BUILT, STAFF, level), linearInterval(BUILT, STAFF, level), `interval must match the old formula at level ${level}`);
    assert.equal(maxCustomers(BUILT, STAFF, level), linearMaxCustomers(BUILT, STAFF, level), `maxCustomers must match the old formula at level ${level}`);
  }
});

test('below/at LEVEL_GATE nothing changes (existing contract, still honoured)', () => {
  assert.equal(spawnInterval(BUILT, STAFF, 0), spawnInterval(BUILT, STAFF));
  assert.equal(maxCustomers(BUILT, STAFF, 0), maxCustomers(BUILT, STAFF));
  assert.equal(spawnInterval(BUILT, STAFF, DEMAND.LEVEL_GATE), spawnInterval(BUILT, STAFF));
});

test('THE FIX: past LEVEL_SOFT_CAP, demand grows strictly more slowly than the old unbounded linear formula', () => {
  // Same evidence as the diagnosis: a star-driven `level` climbing past the authored build-out no
  // longer buys the same amount of extra pressure it used to, once genuine throughput has had time
  // to fall behind. Compare against the OLD linear formula's own (unclamped) trajectory continued
  // past the cap, not just against the clamped floor/ceiling, so a lazy "clamp earlier" fix would
  // fail this the same way the bug did.
  for (const level of [12, 20, 30, 40, 60, 200]) {
    const oldLinear = Math.max(CROWD_FLOOR_INTERVAL, linearInterval(BUILT, STAFF, DEMAND.LEVEL_SOFT_CAP) - DEMAND.INTERVAL_PER_LEVEL * (level - DEMAND.LEVEL_SOFT_CAP));
    const fixed = spawnInterval(BUILT, STAFF, level);
    assert.ok(fixed >= oldLinear - 1e-9, `at level ${level}, fixed interval ${fixed} must not be faster than the old linear trajectory ${oldLinear}`);
  }
  for (const level of [12, 20, 30, 40, 60, 200]) {
    const oldLinear = Math.min(CROWD_CEILING, linearMaxCustomers(BUILT, STAFF, DEMAND.LEVEL_SOFT_CAP) + Math.floor((level - DEMAND.LEVEL_SOFT_CAP) / DEMAND.LEVEL_PER_MAX_STEP));
    const fixed = maxCustomers(BUILT, STAFF, level);
    assert.ok(fixed <= oldLinear, `at level ${level}, fixed maxCustomers ${fixed} must not exceed the old linear trajectory ${oldLinear}`);
  }
  // ...but it still keeps rising — "winnable" means the ceiling MOVES with investment, not that a
  // maxed café is flat. A total freeze here would be the opposite failure (the "solved puzzle" this
  // whole mechanic exists to prevent — see economy.js's own comment above spawnInterval).
  assert.ok(spawnInterval(BUILT, STAFF, 200) < spawnInterval(BUILT, STAFF, DEMAND.LEVEL_SOFT_CAP), 'demand must keep intensifying past the cap, just more slowly');
});

test('monotonic and clamped at every level, including deep past any level a real save reaches', () => {
  let last = Infinity;
  for (let lvl = 0; lvl <= 400; lvl += 5) {
    const iv = spawnInterval(BUILT, STAFF, lvl);
    assert.ok(Number.isFinite(iv) && iv >= CROWD_FLOOR_INTERVAL, `interval must stay finite and >= the floor (level ${lvl})`);
    assert.ok(iv <= last + 1e-9, `interval must never rise as level grows (level ${lvl})`);
    last = iv;
  }
  let lastMax = -Infinity;
  for (let lvl = 0; lvl <= 400; lvl += 5) {
    const mc = maxCustomers(BUILT, STAFF, lvl);
    assert.ok(mc <= CROWD_CEILING, `maxCustomers must never exceed the hard ceiling (level ${lvl})`);
    assert.ok(mc >= lastMax, `maxCustomers must never fall as level grows (level ${lvl})`);
    lastMax = mc;
  }
});

test('ROOT CAUSE, pinned: buying a star raises cafeLevel (and therefore demand) but changes zero throughput multipliers', () => {
  // This is the exact mechanism the diagnosis names. If a future change makes buyStar() start
  // touching machineLevels/staffLevels this test's premise changes and should be revisited
  // deliberately, not silently — it is not meant to forbid ever coupling stars to throughput, only
  // to make today's decoupling visible and intentional.
  const world = createWorld(AREA1);
  const state = { coins: 1e9, stars: {}, machineLevels: { oven: 0, coffee: 0, display: 0 }, staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } } };
  ensureStars(state, world);
  const levelBefore = cafeLevel(state);
  const ovenBefore = machineSpeedMult(state.machineLevels, 'oven');
  const runnerBefore = workerSpeedMult(state.staffLevels, 'runner');
  for (let i = 0; i < 3; i++) buyStar(state, world, 'oven1');
  assert.ok(cafeLevel(state) > levelBefore, 'buying stars must raise cafeLevel (this is what drives demand up)');
  assert.equal(machineSpeedMult(state.machineLevels, 'oven'), ovenBefore, 'a star must not change machine throughput');
  assert.equal(workerSpeedMult(state.staffLevels, 'runner'), runnerBefore, 'a star must not change worker throughput');
});
