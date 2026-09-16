// Task 2.4 (plan §3.5): the accessory catalogue, its follower-milestone unlock gate, and the
// pet-rig attach mechanism it depends on.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESSORIES, ACCESSORY_IDS, ACCESSORY_ID_SET,
  accessoryItem, accessoryMesh, accessoryUnlocked, accessoryCatalogue, equipAccessory,
} from '../data/accessories.js';
import { FOLLOWER_MILESTONES } from '../src/sim/followers.js';
import { createPet } from '../src/render/pets.js';

test('catalogue has exactly 12 items, each with a valid slot and a build function', () => {
  assert.equal(ACCESSORIES.length, 12);
  assert.equal(ACCESSORY_IDS.length, 12);
  assert.equal(ACCESSORY_ID_SET.size, 12, 'ids must be unique');
  for (const item of ACCESSORIES) {
    assert.ok(item.slot === 'head' || item.slot === 'neck', `${item.id} must mount on head or neck`);
    assert.equal(typeof item.build, 'function');
  }
});

test('every item builds a mesh with a positive triangle count, and an unknown id builds nothing', () => {
  for (const id of ACCESSORY_IDS) {
    const built = accessoryMesh(id);
    assert.ok(built, `${id} should build`);
    assert.equal(built.slot, accessoryItem(id).slot);
    assert.ok(built.mesh.isMesh);
    assert.ok(built.mesh.geometry.attributes.position.count > 0);
  }
  assert.equal(accessoryMesh('not-a-real-id'), null);
  assert.equal(accessoryItem('not-a-real-id'), null);
});

test('unlocks are keyed to the same follower milestones as everything else (src/sim/followers.js)', () => {
  // Nothing requires more milestones than exist, and at least one item sits at every tier 0..N.
  const tiers = new Set(ACCESSORIES.map(item => item.tier));
  for (const item of ACCESSORIES) assert.ok(item.tier >= 0 && item.tier <= FOLLOWER_MILESTONES.length);
  assert.ok(tiers.has(0), 'at least one accessory must be free from the start');

  assert.equal(accessoryUnlocked(ACCESSORIES.find(i => i.tier === 0).id, { followers: 0 }), true);
  const tier2Item = ACCESSORIES.find(i => i.tier === 2);
  assert.equal(accessoryUnlocked(tier2Item.id, { followers: FOLLOWER_MILESTONES[1] - 1 }), false);
  assert.equal(accessoryUnlocked(tier2Item.id, { followers: FOLLOWER_MILESTONES[1] }), true);
  assert.equal(accessoryUnlocked('not-a-real-id', { followers: 999999 }), false);
  assert.equal(accessoryUnlocked(ACCESSORIES[0].id, undefined), true, 'missing meta reads as 0 followers, not a crash');
});

test('accessoryCatalogue filters to exactly what is unlocked at a given follower count', () => {
  const startCount = ACCESSORIES.filter(i => i.tier === 0).length;
  assert.equal(accessoryCatalogue({ followers: 0 }).length, startCount);
  assert.equal(accessoryCatalogue({ followers: 999999 }).length, ACCESSORIES.length);
});

test('equipAccessory mounts on the pet rig via P.attach, and a bad id clears instead of crashing', () => {
  const pet = createPet('dog', 0);
  assert.equal(equipAccessory(pet, 'acc_bow'), true);
  assert.ok(pet.head.children.some(c => c.name === 'accessory:acc_bow'));
  assert.equal(equipAccessory(pet, 'acc_scarf'), true);
  assert.ok(pet.neck.children.some(c => c.name === 'accessory:acc_scarf'));
  // Re-equipping the head slot replaces, never stacks.
  assert.equal(equipAccessory(pet, 'acc_beret'), true);
  assert.equal(pet.head.children.filter(c => c.name?.startsWith('accessory:')).length, 1);
  assert.equal(equipAccessory(pet, 'not-a-real-id', 'head'), false);
  assert.equal(pet.head.children.some(c => c.name?.startsWith('accessory:')), false);
});
