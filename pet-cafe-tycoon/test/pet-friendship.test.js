// test/pet-friendship.test.js — Task 2.5 (plan §3.6): a Bestie is offered the next open resident
// slot the instant it is earned. systems/petFriendship.js's installPetFriendship() itself is DOM-
// bound (document.querySelector/createElement for the book UI and toast) and, per this project's
// existing convention (see test/rewards.test.js, which never imports systems/rewardsSystem.js),
// is not unit-tested directly here. What IS tested is the pure rule installPetFriendship wires in:
// recordPetVisit() reaching the Bestie tier drives admitResident() -- exercised together exactly
// as systems/petFriendship.js's own 'pay' handler calls them, one after the other, on the same
// meta object.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPetVisit, PET_BESTIE_VISITS } from '../src/sim/petBook.js';
import { admitResident, currentResidentStars, residentSlotCount } from '../src/systems/residentPets.js';

// Mirrors systems/petFriendship.js's own observer: on every 'pay' event it calls recordPetVisit,
// and iff that promotes the pet to the max (Bestie) tier, admitResident.
function visit(meta, species, variant, G = {}) {
  const result = recordPetVisit(meta, species, variant);
  if (result.promoted && result.friendship.max) admitResident(meta, result.key, currentResidentStars(G));
  return result;
}

function freshMeta() {
  return { petBook: {}, petFriendship: {}, residents: [] };
}

test('a pet becomes a resident the exact visit it reaches the Bestie tier, not before', () => {
  const meta = freshMeta();
  for (let i = 0; i < PET_BESTIE_VISITS - 1; i++) visit(meta, 'cat', 0);
  assert.deepEqual(meta.residents, [], 'not yet a Bestie');

  const promoting = visit(meta, 'cat', 0);
  assert.equal(promoting.friendship.max, true);
  assert.deepEqual(meta.residents, ['cat:0']);

  // Further visits from the same pet do not re-admit or duplicate it.
  visit(meta, 'cat', 0);
  assert.deepEqual(meta.residents, ['cat:0']);
});

test('slots fill first-come-first-served across different pets, in real visit order', () => {
  const meta = freshMeta();
  // dog:0 reaches Bestie first...
  for (let i = 0; i < PET_BESTIE_VISITS; i++) visit(meta, 'dog', 0);
  // ...then cat:0...
  for (let i = 0; i < PET_BESTIE_VISITS; i++) visit(meta, 'cat', 0);
  // ...then bunny:0, filling the default 3 slots.
  for (let i = 0; i < PET_BESTIE_VISITS; i++) visit(meta, 'bunny', 0);
  assert.deepEqual(meta.residents, ['dog:0', 'cat:0', 'bunny:0'], 'admission order follows earn order, not petKey order');

  // A 4th Bestie (default cap 3) is tracked in the Pet Book/friendship map but gets no slot.
  for (let i = 0; i < PET_BESTIE_VISITS; i++) visit(meta, 'dog', 1);
  assert.equal(meta.petFriendship['dog:1'], PET_BESTIE_VISITS);
  assert.deepEqual(meta.residents, ['dog:0', 'cat:0', 'bunny:0'], 'the 4th Bestie waits for an open slot');
});

test('a Bestie earned before slots existed is not silently forgotten once a slot opens', () => {
  // Simulates a save made before this feature shipped: friendship data with no residents array.
  const meta = { petBook: {}, petFriendship: { 'dog:2': PET_BESTIE_VISITS } };
  assert.equal(residentSlotCount(currentResidentStars({})), 3, 'today\'s starting cap');
  admitResident(meta, 'dog:2', currentResidentStars({}));
  assert.deepEqual(meta.residents, ['dog:2']);
});
