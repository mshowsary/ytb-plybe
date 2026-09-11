import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { validateAndMigrateSave, STAFF_STATE_VERSION } from '../src/sim/save.js';
import { normalizeStaffState, snapshotStaffState } from '../src/sim/staffState.js';
import { createWorld } from '../src/sim/world.js';

const ALL_BUILDS = AREA1.zones.map(z => z.id);

test('runner assignments round-trip only for hired runners and active displays', () => {
  const built = new Set(ALL_BUILDS);
  const result = normalizeStaffState({
    v: STAFF_STATE_VERSION,
    runnerAssignments: ['dispCupcake', 'barCoffee', 'fakeDisplay'],
  }, AREA1, built, { runner: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.runnerAssignments, ['dispCupcake', 'barCoffee']);
});

test('legacy save gets one explicit null assignment per hired runner', () => {
  const result = normalizeStaffState(null, AREA1, new Set(ALL_BUILDS), { runner: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.legacy, true);
  assert.deepEqual(result.data, { v: STAFF_STATE_VERSION, runnerAssignments: [null, null] });
});

test('inactive, retired and malformed assignment values clear without inventing a replacement', () => {
  const built = new Set(['z_seats1', 'z_oven2', 'z_register2', 'z_hire']);
  const result = normalizeStaffState({
    v: STAFF_STATE_VERSION,
    runnerAssignments: ['barCoffee', 123],
  }, AREA1, built, { runner: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.runnerAssignments, [null, null]);
});

test('unsupported staff payload shapes are rejected by the save gate', () => {
  for (const staffState of [
    { v: 99, runnerAssignments: [] },
    { v: STAFF_STATE_VERSION, runnerAssignments: {} },
  ]) {
    const result = validateAndMigrateSave({ v: 4, staff: { runner: 1 }, staffState }, AREA1);
    assert.equal(result.ok, false);
    assert.match(result.reason, /^staffState:/);
  }
});

test('save validation bounds assignments against canonical build progress and runner count', () => {
  const result = validateAndMigrateSave({
    v: 4,
    builds: { a1: ALL_BUILDS },
    staff: { runner: 1 },
    staffState: { v: STAFF_STATE_VERSION, runnerAssignments: ['barCoffee', 'dispCupcake'] },
  }, AREA1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.staffState.runnerAssignments, ['barCoffee']);
});

test('snapshot reads live runner order and drops assignments to inactive displays', () => {
  const world = createWorld(AREA1, { built: ALL_BUILDS });
  const staffList = [
    { kind: 'runner', assign: 'dispCupcake' },
    { kind: 'cashier', assign: null },
    { kind: 'runner', assign: 'barCoffee' },
  ];
  assert.deepEqual(snapshotStaffState(staffList, world), {
    v: STAFF_STATE_VERSION,
    runnerAssignments: ['dispCupcake', 'barCoffee'],
  });
  world.stations.get('barCoffee').active = false;
  assert.deepEqual(snapshotStaffState(staffList, world).runnerAssignments, ['dispCupcake', null]);
});
