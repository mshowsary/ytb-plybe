import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PET_TRAIT_CLIPS,
  createPetTraitMotionState,
  petTraitContextActive,
  petTraitPose,
  stepPetTraitMotion,
} from '../src/render/petTraitMotion.js';
import { createPet } from '../src/render/pets.js';

test('Task 35: trait contexts require a truthful visible cause', () => {
  assert.equal(petTraitContextActive('Marmalade', { active: true, timer: 1, stock: 0 }, 99), true);
  assert.equal(petTraitContextActive('Marmalade', { active: true, timer: 0, stock: 0 }, 0), false);
  assert.equal(petTraitContextActive('Snowdrop', { active: true, stage: 2 }, 99), true);
  assert.equal(petTraitContextActive('Snowdrop', { active: true, stage: 0 }, 0), false);
  assert.equal(petTraitContextActive('Biscuit', { active: true }, 3.6), true);
  assert.equal(petTraitContextActive('Biscuit', { active: true }, 3.61), false);
  assert.equal(petTraitContextActive('Biscuit', { active: false }, 1), false);
});

test('Task 35: clips wait for idle dwell, then movement interrupts immediately', () => {
  const state = createPetTraitMotionState(0);
  const cfg = PET_TRAIT_CLIPS.Marmalade;
  let result = null;
  let elapsed = 0;
  while (elapsed + 0.1 < cfg.idleDelay) {
    result = stepPetTraitMotion(state, 'Marmalade', 0.1, { idle: true, context: true });
    assert.equal(result.active, false);
    elapsed += 0.1;
  }
  for (let i = 0; i < 3 && !(result && result.active); i++) {
    result = stepPetTraitMotion(state, 'Marmalade', 0.1, { idle: true, context: true });
  }
  assert.equal(result.active, true);
  assert.ok(result.progress > 0 && result.progress < 1);

  const interrupted = stepPetTraitMotion(state, 'Marmalade', 0.05, { idle: false, context: true });
  assert.equal(interrupted.active, false);
  assert.equal(interrupted.interrupted, true);
  assert.equal(state.active, false);

  // Stopping again does not snap straight back into the clip; the idle delay/cooldown must re-arm.
  const immediateRestart = stepPetTraitMotion(state, 'Marmalade', 0.1, { idle: true, context: true });
  assert.equal(immediateRestart.active, false);
});

test('Task 35: reduced motion cancels a running trait performance', () => {
  const state = createPetTraitMotionState(0);
  let result = null;
  for (let i = 0; i < 20; i++) {
    result = stepPetTraitMotion(state, 'Biscuit', 0.1, { idle: true, context: true });
    if (result.active) break;
  }
  assert.equal(result.active, true);
  result = stepPetTraitMotion(state, 'Biscuit', 0.1, { idle: true, context: true, reducedMotion: true });
  assert.equal(result.active, false);
  assert.equal(state.active, false);
});

test('Task 35: the three silent clips have visibly different pose signatures', () => {
  const marmalade = petTraitPose('Marmalade', 0.5, 0.4);
  const biscuit = petTraitPose('Biscuit', 0.5, 0.4);
  const snowdrop = petTraitPose('Snowdrop', 0.5, 0.4);

  assert.ok(marmalade.headX < -0.12, 'Marmalade should nose toward bakery warmth');
  assert.ok(marmalade.tailScale < 0.5, 'Marmalade should quiet the tail while focused');
  assert.ok(Math.abs(biscuit.tailY) > 0.7, 'Biscuit should have the fast social wag');
  assert.ok(Math.abs(biscuit.bodyZ) > 0.001, 'Biscuit should add a small greeting body beat');
  assert.notEqual(Math.sign(snowdrop.headY), Math.sign(marmalade.headY), 'Snowdrop should scan rather than copy the warm gaze');
  assert.ok(Math.abs(snowdrop.headZ) > 0.001, 'Snowdrop should hold an alert garden-watcher pose');
});

test('Task 35: render integration never turns a personality clip into navigation', () => {
  const pet = createPet('cat', 0); // Marmalade
  pet.group.position.set(4, 0, 3);
  const target = { x: 1, z: -2, active: true, timer: 1, stock: 0 };
  let t = 0;
  let observed = false;
  for (let i = 0; i < 40; i++) {
    pet.update(0.1, false, 0);
    t += 0.1;
    pet.react('Marmalade', t, target, false);
    observed ||= pet._traitActive;
    assert.equal(pet.group.position.x, 4);
    assert.equal(pet.group.position.z, 3);
  }
  assert.equal(observed, true, 'the authored clip should become observable after idle dwell');

  // Real locomotion wins on the very next frame and clears the trait overlay.
  pet.update(0.1, true, 0);
  t += 0.1;
  pet.react('Marmalade', t, target, false);
  assert.equal(pet._traitActive, false);
  assert.equal(pet.group.position.x, 4);
  assert.equal(pet.group.position.z, 3);
});
