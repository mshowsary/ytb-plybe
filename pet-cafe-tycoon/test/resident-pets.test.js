// test/resident-pets.test.js — Task 2.5 (plan §3.6): residents are earned, not placed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  residentSlotCount, currentResidentStars, admitResident, reconcileResidents, createResidentPets,
} from '../src/systems/residentPets.js';
import { PET_BESTIE_VISITS } from '../src/sim/petBook.js';

test('residentSlotCount: 3 base, +1 per star, capped at 8', () => {
  assert.equal(residentSlotCount(0), 3);
  assert.equal(residentSlotCount(), 3, 'default argument');
  assert.equal(residentSlotCount(1), 4);
  assert.equal(residentSlotCount(5), 8);
  assert.equal(residentSlotCount(99), 8, 'capped at 8');
  assert.equal(residentSlotCount(-4), 3, 'negative stars clamp to 0 extra slots');
});

test('currentResidentStars is the deliberate Batch-3 placeholder: always 0 today', () => {
  assert.equal(currentResidentStars({}), 0);
  assert.equal(currentResidentStars(null), 0);
  // residentSlotCount(currentResidentStars(...)) must resolve to the plan's starting count.
  assert.equal(residentSlotCount(currentResidentStars({})), 3);
});

test('admitResident fills slots first-come-first-served and never duplicates a key', () => {
  const meta = { residents: [] };
  assert.equal(admitResident(meta, 'cat:0', 0), true);
  assert.equal(admitResident(meta, 'dog:0', 0), true);
  assert.equal(admitResident(meta, 'bunny:0', 0), true);
  assert.deepEqual(meta.residents, ['cat:0', 'dog:0', 'bunny:0']);

  // Slot count is 3 today: a 4th Bestie is refused, not bumped in over an existing resident.
  assert.equal(admitResident(meta, 'cat:1', 0), false);
  assert.deepEqual(meta.residents, ['cat:0', 'dog:0', 'bunny:0'], 'existing residents are untouched');

  // Already resident: refused, not duplicated (Trap #3 -- a pool must refuse, never duplicate).
  assert.equal(admitResident(meta, 'cat:0', 0), false);
  assert.equal(meta.residents.filter(k => k === 'cat:0').length, 1);

  // More stars open more slots.
  assert.equal(admitResident(meta, 'cat:1', 1), true);
  assert.deepEqual(meta.residents, ['cat:0', 'dog:0', 'bunny:0', 'cat:1']);
});

test('admitResident is defensive against malformed input', () => {
  assert.equal(admitResident(null, 'cat:0'), false);
  assert.equal(admitResident({}, 'cat:0'), true, 'ensures meta.residents itself');
  assert.equal(admitResident({ residents: [] }, 42), false, 'non-string key refused');
});

test('reconcileResidents backfills already-earned Besties a legacy save missed, in canonical order', () => {
  const meta = {
    residents: [],
    petFriendship: { 'dog:1': PET_BESTIE_VISITS, 'cat:3': PET_BESTIE_VISITS, 'bunny:0': PET_BESTIE_VISITS },
  };
  reconcileResidents(meta, 0);
  // Canonical species order is cat, dog, bunny, (hamster) -- matches sim/petBook.js's own
  // firstBestieKey() convention, not save/arrival order.
  assert.deepEqual(meta.residents, ['cat:3', 'dog:1', 'bunny:0']);
});

test('reconcileResidents never disturbs an existing resident or exceeds the slot cap', () => {
  const meta = {
    residents: ['bunny:0'],
    petFriendship: { 'cat:0': PET_BESTIE_VISITS, 'dog:0': PET_BESTIE_VISITS, 'bunny:0': PET_BESTIE_VISITS },
  };
  reconcileResidents(meta, 0);
  assert.equal(meta.residents[0], 'bunny:0', 'the pre-existing resident keeps its place');
  assert.equal(meta.residents.length, 3, 'capped at the 3-slot default');
});

test('reconcileResidents is a no-op below Bestie tier and with no friendship data', () => {
  const meta = { residents: [], petFriendship: { 'cat:0': PET_BESTIE_VISITS - 1 } };
  reconcileResidents(meta, 0);
  assert.deepEqual(meta.residents, []);

  const bare = { residents: [] };
  reconcileResidents(bare, 0);
  assert.deepEqual(bare.residents, []);
});

// --- lightweight integration smoke test of the rendering layer, DOM-free -------------------------
// createPetMoment (ui/petMoments.js) touches `document`, so these fake a game object with no `els`
// (createResidentPets treats a missing els as "skip the nameplate", see its own doc comment) and a
// plain THREE.Scene/no camera, matching how test/pets-hamster.test.js already exercises
// render/pets.js's THREE rig directly without a DOM.
function fakeGame(overrides = {}) {
  return {
    P: { x: 0, z: 0 },
    meta: { residents: [], petFriendship: {}, equipped: {} },
    dayState: { day: 1, phase: 'morning' },
    world: { stations: new Map() },
    settings: {},
    time: 0,
    ...overrides,
  };
}

test('createResidentPets renders furniture-only spots with no residents', () => {
  const S = { scene: new THREE.Scene(), camera: null };
  const G = fakeGame();
  const residents = createResidentPets(S, G, null);
  residents.update(1 / 60);
  assert.equal(residents.count, 0);
});

test('createResidentPets settles an already-resident pet instantly, no walk-in, on first update', () => {
  const S = { scene: new THREE.Scene(), camera: null };
  const G = fakeGame({ meta: { residents: ['cat:0'], petFriendship: {}, equipped: {} } });
  const residents = createResidentPets(S, G, null);
  residents.update(1 / 60);
  assert.equal(residents.count, 1, 'settled immediately, not queued as an arrival');
});

test('a Bestie admitted mid-shift only walks in at the next in-game morning', () => {
  const S = { scene: new THREE.Scene(), camera: null };
  const G = fakeGame();
  const residents = createResidentPets(S, G, null);
  residents.update(1 / 60);
  assert.equal(residents.count, 0);

  // Mid-shift promotion: the resident list gains a key, but the day hasn't turned over yet.
  admitResident(G.meta, 'dog:0', currentResidentStars(G));
  residents.update(1 / 60);
  assert.equal(residents.count, 0, 'no move-in mid-shift');

  // Next morning: the walk-in begins (count already reflects the in-progress arrival)...
  G.dayState.day = 2;
  residents.update(1 / 60);
  assert.equal(residents.count, 1, 'arrival in progress counts as present');

  // ...and settles into a steady resident after the walk (door -> spot -> perch) completes.
  for (let i = 0; i < 400; i++) residents.update(1 / 20); // ~20s of simulated time, well past 2.8s
  assert.equal(residents.count, 1);
});

test('the resident cap holds during a walk-in queue the same way it holds for admitResident', () => {
  const S = { scene: new THREE.Scene(), camera: null };
  const G = fakeGame();
  const residents = createResidentPets(S, G, null);
  residents.update(1 / 60);

  for (const key of ['cat:0', 'dog:0', 'bunny:0', 'cat:1']) {
    admitResident(G.meta, key, currentResidentStars(G));
  }
  assert.equal(G.meta.residents.length, 3, 'the 4th admission was already refused');

  G.dayState.day = 2;
  for (let i = 0; i < 400; i++) residents.update(1 / 20);
  assert.equal(residents.count, 3);
});
