import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PET_MESS_MIN_DAY, PET_MESS_MAX, PET_MESS_SPAWN_COOLDOWN,
  ROOMBA_SWEEP_SECONDS, shouldSpawnPetMess, petMessOffset,
} from '../src/sim/petMess.js';

test('pet pawprints stay out of Day 1 and respect cap/cooldown', () => {
  assert.equal(PET_MESS_MIN_DAY, 2);
  assert.equal(PET_MESS_MAX, 4);
  assert.equal(ROOMBA_SWEEP_SECONDS, 18);
  assert.equal(shouldSpawnPetMess(1, 2, 0, 999), false);
  assert.equal(shouldSpawnPetMess(2, 2, PET_MESS_MAX, 999), false);
  assert.equal(shouldSpawnPetMess(2, 2, 0, PET_MESS_SPAWN_COOLDOWN - 0.1), false);
});

test('pet mess cadence is deterministic and independent of coins/ad state', () => {
  // day 2, customer 2 => (2*5 + 2*7) % 3 === 0
  assert.equal(shouldSpawnPetMess(2, 2, 0, 999), true);
  assert.equal(shouldSpawnPetMess(2, 2, 0, 999), true);
  assert.equal(shouldSpawnPetMess(2, 3, 0, 999), false);
});

test('pet mess offset is stable and stays close to the pet seat', () => {
  const a = petMessOffset(9), b = petMessOffset(9);
  assert.deepEqual(a, b);
  const r = Math.hypot(a.x, a.z);
  assert.ok(r >= 0.33 && r <= 0.53);
});
