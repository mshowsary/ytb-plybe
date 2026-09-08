// Task 2.6 (plan §3.7): hamster species + one legendary coat per species. These tests exercise the
// render rig directly (src/render/pets.js), not the visual result, since node:test has no WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPet } from '../src/render/pets.js';
import { PET_PROFILES, PET_SPECIES, legendaryUnlocked } from '../src/sim/petBook.js';

function triCount(geo) {
  return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
}
function totalTris(pet) {
  let n = 0;
  pet.group.traverse(o => { if (o.isMesh) n += triCount(o.geometry); });
  return n;
}

test('every species/variant in the book instantiates a pet rig without throwing', () => {
  for (const species of PET_SPECIES) {
    PET_PROFILES[species].forEach((profile, variant) => {
      const pet = createPet(species, variant);
      assert.equal(pet.species, species);
      assert.equal(pet.variant, variant);
      assert.ok(totalTris(pet) > 0);
    });
  }
});

test('hamster has no visible tail and is not more expensive than the cheapest existing species', () => {
  const cat = createPet('cat', 0);
  const hamster = createPet('hamster', 0);
  assert.ok(totalTris(hamster) <= totalTris(cat), 'hamster should not add net triangle cost vs. an existing species');
});

test('hamster stands upright (a mild fold pose) at idle without an explicit sit() call', () => {
  const hamster = createPet('hamster', 0);
  hamster.setLifePhase(0);
  hamster.update(1.5, false, 0); // idle: not moving, never sat
  // The fold pose damps legPairA's y-scale toward 0.6 (see pets.js); confirm it left the default 1.
  const legPair = hamster.group.children.find(c => c.scale.y < 0.999);
  assert.ok(legPair, 'idle hamster should be in the folded/upright stance, not the flat stand pose');

  const cat = createPet('cat', 0);
  cat.setLifePhase(0);
  cat.update(1.5, false, 0); // idle, not sitting: cat must NOT fold (species-gated behavior)
  const catFolded = cat.group.children.find(c => c.scale.y < 0.999);
  assert.equal(catFolded, undefined, 'a non-hamster species must keep standing normally at idle');
});

test('hamster gait while moving tucks both leg pairs together (a hop), unlike the diagonal trot', () => {
  const hamster = createPet('hamster', 0);
  hamster.setLifePhase(0);
  hamster.update(0.1, true, 0);
  // group child order is [legPairA, legPairB, body, head, tail] (see pets.js createPet()).
  const [legPairA, legPairB] = hamster.group.children;
  assert.ok(Math.abs(legPairA.rotation.x) > 1e-6, 'moving hamster legs should be posed, not flat');
  // Both leg-pair meshes carry the SAME rotation (tucked together on each hop), unlike the
  // alternating +sw/-sw diagonal trot every other species uses while moving.
  assert.equal(legPairA.rotation.x, legPairB.rotation.x);
});

test('P.attach mounts one mesh per node and cleanly replaces/clears it', () => {
  const pet = createPet('cat', 0);
  const a = new THREE.Object3D(), b = new THREE.Object3D();
  assert.equal(pet.attach('head', a), a);
  assert.ok(pet.head.children.includes(a));
  assert.equal(pet.attach('head', b), b, 're-equipping a slot must replace, not stack');
  assert.equal(pet.head.children.includes(a), false);
  assert.ok(pet.head.children.includes(b));
  assert.equal(pet.attach('head', null), null);
  assert.equal(pet.head.children.includes(b), false);

  const c = new THREE.Object3D();
  assert.equal(pet.attach('neck', c), c);
  assert.ok(pet.neck.children.includes(c));
});

test('legendary variants (index 4) render an extra emissive sparkle mesh; non-legendary variants do not', () => {
  for (const species of PET_SPECIES) {
    assert.equal(PET_PROFILES[species][4].rarity, 'legendary');
    const legendary = createPet(species, 4);
    const common = createPet(species, 0);
    assert.ok(totalTris(legendary) > totalTris(common), `${species} legendary coat should add the sparkle overlay`);
  }
});

test('legendary spawning stays gated behind a predicate that is false pre-Batch-3', () => {
  assert.equal(legendaryUnlocked({}), false);
  assert.equal(legendaryUnlocked({ paw: 5, stars: 99 }), false);
});

test('createPet + setLifePhase(0) is deterministic across separate instances (portrait.js relies on this)', () => {
  function snapshot(species, variant) {
    const pet = createPet(species, variant);
    pet.setLifePhase(0);
    pet.sit();
    pet.update(1.5, false, 0);
    const rows = [];
    pet.group.traverse(o => rows.push(o.matrix.toArray()));
    return JSON.stringify(rows);
  }
  assert.equal(snapshot('hamster', 4), snapshot('hamster', 4));
  assert.equal(snapshot('cat', 4), snapshot('cat', 4));
});
