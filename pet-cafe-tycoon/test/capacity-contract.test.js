// test/capacity-contract.test.js — the daily goal is frozen for its shift and derived from the
// café's CAPACITY, never from yesterday's result.
//
// Batch E1 merged the contract and the special-day theme into one goal (src/sim/dailyGoal.js) and
// retired the 'streak' verb, so the specific targets these tests name changed. The invariants
// themselves did not, and every one of them is still asserted: frozen per shift, unchanged by a
// mid-shift build, identical for an underperforming and an overperforming save, survives
// serialisation and a canonical save restore, and a malformed cached goal is refused rather than
// trusted. The tests go on calling chooseCareerGoal so the compatibility seam legacy tools/ use is
// exercised by the same assertions.
import { applySave } from '../src/sim/save.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCareerGoal, ensureCareer } from '../src/sim/career.js';
import { buildDailyGoal } from '../src/sim/dailyGoal.js';
const cafe = (...zones) => ({ world: { built: new Set(zones) } });
const SMALL = cafe();
const BIG = cafe('z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender');

test('capacity contracts freeze per shift and survive serialized metadata', () => {
  const meta = {};
  const day1 = buildDailyGoal(1, SMALL);
  const first = chooseCareerGoal(1, meta, SMALL);
  assert.deepEqual(first, day1);
  // A build landing mid-shift does not move the goal already in play...
  assert.deepEqual(chooseCareerGoal(1, meta, BIG), day1);
  // ...and neither does a round trip through JSON.
  assert.deepEqual(chooseCareerGoal(1, JSON.parse(JSON.stringify(meta)), BIG), day1);
  // Tomorrow is judged against the café that exists tomorrow.
  assert.deepEqual(chooseCareerGoal(8, meta, BIG), buildDailyGoal(8, BIG));
});

test('underperformance and extreme personal best cannot alter capacity contract', () => {
  const a = {}, b = {};
  ensureCareer(a); ensureCareer(b);
  a.career.history['2'] = { earned: 1, served: 1, bestStreak: 0 };
  b.career.history['2'] = { earned: 10000000, served: 999, bestStreak: 99 };
  assert.deepEqual(chooseCareerGoal(9, a, BIG), chooseCareerGoal(9, b, BIG));
  // The same day on a SMALLER café asks for less: capacity is the only input that moves a target.
  const small = chooseCareerGoal(9, {}, SMALL), big = chooseCareerGoal(9, {}, BIG);
  assert.ok(big.target > small.target || big.kind !== small.kind);
  assert.ok(big.reward > small.reward);
});

test('new contracts preserve prior awards and reject malformed cached goals', () => {
  const meta = {};
  const c = ensureCareer(meta);
  c.trophies.gold = 2;
  c.currentContract = { day: 1, goal: { kind: 'serve', target: NaN } };
  assert.deepEqual(chooseCareerGoal(1, meta, SMALL), buildDailyGoal(1, SMALL));
  assert.equal(c.trophies.gold, 2);
});

test('canonical save restore preserves the frozen contract across capacity changes', () => {
  const meta = {};
  const frozen = chooseCareerGoal(1, meta, SMALL);
  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  assert.ok(applySave(state, { coins: 20, meta, dayState: { day: 1, phase: 'opening', t: 0 } }));
  assert.deepEqual(chooseCareerGoal(1, state.meta, BIG), frozen);
});
