import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverPet, petBookProgress, petProfile, allPetCards,
  petFriendship, recordPetVisit, ensurePetBook,
  legendaryUnlocked, isLegendaryProfile,
} from '../src/sim/petBook.js';

test('pet discovery is idempotent and persistent-shaped', () => {
  const meta = {};
  const first = discoverPet(meta, 'cat', 3);
  assert.equal(first.isNew, true);
  assert.equal(first.profile.name, 'Calico');
  assert.deepEqual(meta.petBook, { 'cat:3': 1 });
  assert.deepEqual(meta.petFriendship, {});
  assert.equal(meta.petDiscoveries, 1);

  const second = discoverPet(meta, 'cat', 3);
  assert.equal(second.isNew, false);
  assert.equal(meta.petDiscoveries, 1);
});

// Plan §3.7 (task 2.6) grows the book from 12 to 20 pets: a fourth species (hamster) plus one
// legendary coat per species (variant index 4). The intent this assertion encodes changed from "12
// authored pets" to "20 authored pets" -- updated here rather than left green by accident.
test('visitor book exposes 20 cards and progress', () => {
  const meta = { petBook: { 'cat:0': 1, 'dog:1': 1, 'bunny:2': 1 } };
  const p = petBookProgress(meta);
  assert.deepEqual(p, { found: 3, total: 20, frac: 0.15 });
  const cards = allPetCards(meta);
  assert.equal(cards.length, 20);
  assert.equal(cards.filter(c => c.found).length, 3);
  assert.equal(cards.find(c => c.key === 'dog:1').friendship.label, 'New Face');
  assert.equal(petProfile('bunny', 2).name, 'Lilac');
});

test('hamster is a fourth species and every species carries a legendary coat at variant 4', () => {
  const cards = allPetCards({});
  assert.equal(cards.filter(c => c.species === 'hamster').length, 5);
  assert.equal(petProfile('hamster', 0).name, 'Peanut');
  assert.equal(petProfile('hamster', 3).rarity, 'epic');
  for (const species of ['cat', 'dog', 'bunny', 'hamster']) {
    assert.equal(petProfile(species, 4).rarity, 'legendary');
  }
});

test('legendary coats are gated behind a predicate that is deliberately false pre-Batch-3', () => {
  assert.equal(legendaryUnlocked({}), false);
  assert.equal(legendaryUnlocked({ stars: 99 }), false);
  assert.equal(isLegendaryProfile(petProfile('cat', 4)), true);
  assert.equal(isLegendaryProfile(petProfile('cat', 0)), false);
});

test('successful visits promote New Face to Regular, Friend and Bestie at bounded milestones', () => {
  const meta = {};
  discoverPet(meta, 'dog', 1);

  let result = recordPetVisit(meta, 'dog', 1);
  assert.equal(result.friendship.visits, 1);
  assert.equal(result.friendship.label, 'New Face');
  assert.equal(result.promoted, false);

  result = recordPetVisit(meta, 'dog', 1);
  assert.equal(result.friendship.label, 'Regular');
  assert.equal(result.promoted, true);

  for (let i = 0; i < 3; i++) result = recordPetVisit(meta, 'dog', 1);
  assert.equal(result.friendship.visits, 5);
  assert.equal(result.friendship.label, 'Friend');
  assert.equal(result.promoted, true);

  for (let i = 0; i < 5; i++) result = recordPetVisit(meta, 'dog', 1);
  assert.equal(result.friendship.visits, 10);
  assert.equal(result.friendship.label, 'Bestie');
  assert.equal(result.friendship.max, true);
  assert.equal(result.promoted, true);
  assert.equal(petFriendship(meta, 'dog', 1).frac, 1);
});

test('old saves migrate safely and malformed friendship counters are sanitized', () => {
  const oldMeta = { petBook: { 'cat:0': 1 }, petDiscoveries: 1 };
  ensurePetBook(oldMeta);
  assert.deepEqual(oldMeta.petFriendship, {});

  const dirty = { petBook: { 'cat:0': 1 }, petFriendship: { 'cat:0': -4, 'dog:0': '7.9', bad: 'nope' } };
  ensurePetBook(dirty);
  assert.deepEqual(dirty.petFriendship, { 'dog:0': 7 });
  assert.equal(petFriendship(dirty, 'dog', 0).label, 'Friend');
});
