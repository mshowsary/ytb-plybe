import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverPet, petBookProgress, petProfile, allPetCards } from '../src/sim/petBook.js';

test('pet discovery is idempotent and persistent-shaped', () => {
  const meta = {};
  const first = discoverPet(meta, 'cat', 3);
  assert.equal(first.isNew, true);
  assert.equal(first.profile.name, 'Calico');
  assert.deepEqual(meta.petBook, { 'cat:3': 1 });
  assert.equal(meta.petDiscoveries, 1);

  const second = discoverPet(meta, 'cat', 3);
  assert.equal(second.isNew, false);
  assert.equal(meta.petDiscoveries, 1);
});

test('visitor book exposes 12 cards and progress', () => {
  const meta = { petBook: { 'cat:0': 1, 'dog:1': 1, 'bunny:2': 1 } };
  const p = petBookProgress(meta);
  assert.deepEqual(p, { found: 3, total: 12, frac: 0.25 });
  const cards = allPetCards(meta);
  assert.equal(cards.length, 12);
  assert.equal(cards.filter(c => c.found).length, 3);
  assert.equal(petProfile('bunny', 2).name, 'Lilac');
});
