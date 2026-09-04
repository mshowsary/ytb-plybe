import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRushCrewBoost, rushCrewActive, staffLevelsWithRushCrew,
} from '../src/sim/rushCrew.js';

const base = () => ({
  runner: { speed: 1, carry: 1 }, cashier: { speed: 1 }, cleaner: { speed: 1 },
});
const scratch = () => ({
  runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 },
});

test('rush crew boost validates role and remembers only its activation day', () => {
  assert.deepEqual(makeRushCrewBoost('runner', 5), { role: 'runner', day: 5 });
  assert.deepEqual(makeRushCrewBoost('cashier', 5), { role: 'cashier', day: 5 });
  assert.deepEqual(makeRushCrewBoost('cleaner', 5), { role: 'cleaner', day: 5 });
  assert.equal(makeRushCrewBoost('owner', 5), null);
});

test('rush crew is scoped to the matching day and Rush phase', () => {
  const boosts = { rushCrew: makeRushCrewBoost('runner', 5) };
  assert.equal(rushCrewActive(boosts, { day: 5, phase: 'rush' }), true);
  assert.equal(rushCrewActive(boosts, { day: 5, phase: 'morning' }), false);
  assert.equal(rushCrewActive(boosts, { day: 6, phase: 'rush' }), false);
});

test('inactive rush crew returns the permanent level object unchanged', () => {
  const levels = base();
  assert.equal(staffLevelsWithRushCrew(levels, {}, { day: 5, phase: 'rush' }, scratch()), levels);
  assert.equal(staffLevelsWithRushCrew(levels, { rushCrew: makeRushCrewBoost('runner', 5) }, { day: 5, phase: 'afternoon' }, scratch()), levels);
});

test('runner rush crew lends exactly one existing speed and carry tier', () => {
  const levels = base(), out = scratch();
  const r = staffLevelsWithRushCrew(levels, { rushCrew: makeRushCrewBoost('runner', 5) }, { day: 5, phase: 'rush' }, out);
  assert.equal(r, out);
  assert.deepEqual(r, { runner: { speed: 2, carry: 2 }, cashier: { speed: 1 }, cleaner: { speed: 1 } });
  assert.deepEqual(levels, base(), 'permanent levels must never be mutated');
});

test('cashier and cleaner boosts lend only their own speed tier', () => {
  const levels = base();
  assert.deepEqual(
    staffLevelsWithRushCrew(levels, { rushCrew: makeRushCrewBoost('cashier', 5) }, { day: 5, phase: 'rush' }, scratch()),
    { runner: { speed: 1, carry: 1 }, cashier: { speed: 2 }, cleaner: { speed: 1 } },
  );
  assert.deepEqual(
    staffLevelsWithRushCrew(levels, { rushCrew: makeRushCrewBoost('cleaner', 5) }, { day: 5, phase: 'rush' }, scratch()),
    { runner: { speed: 1, carry: 1 }, cashier: { speed: 1 }, cleaner: { speed: 2 } },
  );
});

test('rush crew cannot exceed the permanent tier ceiling', () => {
  const levels = { runner: { speed: 3, carry: 3 }, cashier: { speed: 3 }, cleaner: { speed: 3 } };
  assert.deepEqual(
    staffLevelsWithRushCrew(levels, { rushCrew: makeRushCrewBoost('runner', 5) }, { day: 5, phase: 'rush' }, scratch()),
    levels,
  );
});
