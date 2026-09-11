import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PET_IDENTITY_POOL,
  REGULAR_GREETING_SECONDS,
  regularIdentityForDay,
  resolveUniquePetIdentity,
  activeNamedPetKeys,
} from '../src/sim/regularVisitors.js';
import { PET_PROFILES } from '../src/sim/petBook.js';

test('the identity pool is every unlocked coat, and never a legendary one', () => {
  // 4 species x 5 coats = 20 authored profiles, of which the 4 legendary ones are Batch 3 reward
  // content. They are excluded HERE rather than at the spawn roll because this pool is what decides
  // a customer's rendered pet: resolveUniquePetIdentity's congestion fallback walks the whole pool
  // when every other identity is on screen, so filtering only the roll leaves a working back door.
  // A bare length check would not have caught that -- assert the property, not the number.
  assert.equal(PET_IDENTITY_POOL.length, 16);
  assert.equal(new Set(PET_IDENTITY_POOL.map(p => p.key)).size, 16, 'every entry is a distinct pet');
  for (const row of PET_IDENTITY_POOL) {
    assert.notEqual(
      PET_PROFILES[row.species][row.variant].rarity, 'legendary',
      row.key + ' is a locked legendary coat and must not be reachable as a walk-in identity',
    );
  }
  assert.ok(REGULAR_GREETING_SECONDS >= .9 && REGULAR_GREETING_SECONDS <= 1.2);
});

test('Task 34: a fresh cafe does not fake a welcome-back regular', () => {
  assert.equal(regularIdentityForDay({ petFriendship: {} }, 1), null);
});

test('Task 34: real friendship history deterministically chooses the daily regular', () => {
  const meta = { petFriendship: { 'cat:0': 5, 'dog:1': 2, 'bunny:2': 1 } };
  assert.equal(regularIdentityForDay(meta, 1).key, 'cat:0');
  assert.equal(regularIdentityForDay(meta, 2).key, 'dog:1');
  assert.equal(regularIdentityForDay(meta, 3).key, 'cat:0');
  // Object insertion order cannot change the result.
  const shuffled = { petFriendship: { 'bunny:2': 1, 'dog:1': 2, 'cat:0': 5 } };
  assert.deepEqual(regularIdentityForDay(shuffled, 2), regularIdentityForDay(meta, 2));
});

test('Task 34: preferred familiar pet wins when it is not already active', () => {
  const pick = resolveUniquePetIdentity('cat', 1, new Set(['cat:1']), 'dog:2');
  assert.equal(pick.key, 'dog:2');
  assert.equal(pick.preferred, true);
  assert.equal(pick.named, true);
});

test('Task 34: duplicate proposed/preferred names deterministically fall through to another authored identity', () => {
  const active = new Set(['cat:0', 'cat:1', 'cat:2']);
  const a = resolveUniquePetIdentity('cat', 0, active, 'cat:1');
  const b = resolveUniquePetIdentity('cat', 0, active, 'cat:1');
  assert.deepEqual(a, b);
  assert.equal(active.has(a.key), false);
  assert.equal(a.named, true);
});

test('Task 34: with all 12 names active traffic is preserved by making overflow anonymous', () => {
  const active = new Set(PET_IDENTITY_POOL.map(p => p.key));
  const pick = resolveUniquePetIdentity('dog', 0, active, 'cat:0');
  assert.equal(pick.named, false);
  assert.equal(pick.key, null);
  assert.equal(pick.species, 'dog');
  assert.equal(pick.variant, 0);
});

test('Task 34: active named keys ignore anonymous and completed customers', () => {
  const keys = activeNamedPetKeys([
    { done: false, petIdentityKey: 'cat:0' },
    { done: false, petIdentityKey: null },
    { done: true, petIdentityKey: 'dog:1' },
  ]);
  assert.deepEqual([...keys], ['cat:0']);
});
