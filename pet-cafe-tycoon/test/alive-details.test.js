// test/alive-details.test.js — the small movements that make the café look inhabited, and the
// call paths that reach them.
//
// Ship plan §1.9 asks for "pets reacting with the rigs that already exist (a look, an ear flick, a
// hop when their treat lands)". The look was there (render/pets.js idleLife's lookYaw and the trait
// motion); the hop and the flick were not, and the rig had no way to be told a treat had landed.
//
// The answer was not a new signal. sim/customers.js ALREADY tells the pet the moment something good
// happens to it — it sets the happy mood when the treat is served, when the guest is seated and when
// a regular is greeted — and until now that only swapped a bubble. So the reaction hangs off that
// call, and the half of this file that matters most is the half that pins the caller: a rig that
// hops beautifully and is never told to is exactly the defect this program keeps producing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPet } from '../src/render/pets.js';
import { createHuman } from '../src/render/human.js';

const CUSTOMERS_SRC = fs.readFileSync(new URL('../src/systems/customers.js', import.meta.url), 'utf8');

test('the call path exists: the simulation layer already tells a pet it is happy', () => {
  // These are the three moments sim/customers.js reaches for the happy mood. If a future change
  // renames or removes them, the hop below becomes code nothing calls — which is the whole reason
  // this assertion is in the same file as the behaviour.
  assert.match(CUSTOMERS_SRC, /pet\.setMood\('happy'\)/, "systems/customers.js must still be what drives a pet's joy");
  const calls = CUSTOMERS_SRC.match(/pet\.setMood\('happy'\)/g) || [];
  assert.ok(calls.length >= 3, `expected the treat, the seating and the greeting; found ${calls.length}`);
  // And the treat specifically, which is the one the plan names.
  assert.match(CUSTOMERS_SRC, /treatCelebrated/, 'the treat celebration is still the trigger it hangs off');
});

test('a pet hops the moment it becomes happy, and only on the transition', () => {
  const pet = createPet('dog', 0);
  pet.update(1 / 60, false, 0);
  assert.equal(pet.group.position.y, 0, 'a calm pet stands on the floor');

  // Measured across the arc, not on one frame: a hop starts and ends on the floor, and the whole
  // thing is over in 0.42 s. The peak is what "it hopped" means.
  pet.setMood('happy');
  let peak = 0;
  for (let i = 0; i < 40; i++) { pet.update(1 / 60, false); peak = Math.max(peak, pet.group.position.y); }
  assert.ok(peak > 0.15, `the treat landed and nothing moved (peak y ${peak.toFixed(3)})`);

  // Then confirm a second setMood('happy') on an already-happy pet does not re-launch it:
  // sim/customers.js calls this every frame while the mood lasts.
  for (let i = 0; i < 90; i++) { pet.setMood('happy'); pet.update(1 / 60, false); }
  assert.ok(pet.group.position.y < 0.02, 'the hop is one hop, not a pogo stick');
});

test('and flicks its ears — as a head roll, because the ears are merged into the head', () => {
  const pet = createPet('cat', 1);
  pet.update(1 / 60, false, 0);
  const rest = pet.head.rotation.z;
  pet.setMood('happy');
  let swing = 0;
  for (let i = 0; i < 40; i++) { pet.update(1 / 60, false); swing = Math.max(swing, Math.abs(pet.head.rotation.z - rest)); }
  assert.ok(swing > 0.05, `the flick never happened (peak roll ${swing.toFixed(3)} rad)`);
  for (let i = 0; i < 120; i++) pet.update(1 / 60, false);
  assert.ok(Math.abs(pet.head.rotation.z) < 0.12, 'and it settles back into the idle sway');
});

test('a mood that is not happy moves nothing', () => {
  const pet = createPet('bunny', 2);
  pet.update(1 / 60, false, 0);
  pet.setMood('wait');
  pet.update(1 / 60, false);
  assert.equal(pet.group.position.y, 0, 'waiting is not a celebration');
});

// ---- the draw-call diet these rigs are also part of ------------------------------------------
// Both of these were measured against the publisher's ~200-call peak budget, and both are the kind
// of saving a later refactor undoes without noticing, because nothing about the frame looks
// different when it goes.

test('a pet draws its two eyes and two catchlights as two meshes, not four', () => {
  const pet = createPet('cat', 0);
  let meshes = 0;
  pet.head.traverse(o => { if (o.isMesh) meshes++; });
  // head itself + the merged irises + the merged catchlights.
  assert.equal(meshes, 3, 'four eye meshes per pet is 40 draw calls in a rush with ten animals');
});

test('a person draws two legs as one instanced mesh and two arms as another', () => {
  const human = createHuman({ shirt: 0, hair: 0, skin: 0 }, 'customer');
  const instanced = human.group.children.filter(o => o.isInstancedMesh);
  const meshes = human.group.children.filter(o => o.isMesh && !o.isInstancedMesh);
  assert.equal(instanced.length, 2, 'the legs and the arms are one InstancedMesh each');
  assert.equal(instanced[0].count, 2);
  assert.equal(instanced[1].count, 2);
  assert.equal(meshes.length, 1, 'and the torso-and-head is the only single mesh left');
  // Each instanced pair must carry its own bounding sphere: an InstancedMesh with none culls on the
  // bare geometry's, which for one leg is a sphere at the hip that ignores the other instance and
  // every pose. Turning culling off instead (the first attempt) cost more than instancing saved.
  for (const im of instanced) assert.ok(im.boundingSphere && im.boundingSphere.radius > 0.5, 'a real bounding sphere, so it still culls');
});

test('nobody in the café casts a shadow-map shadow any more', () => {
  // They all keep their contact shadow (render/contactShadows.js — one instanced draw call for the
  // whole room), which is what actually reads as standing on the floor at this camera. The cast
  // shadow was a second full draw of every actor, ~2.5k triangles each, sixteen times over in a rush.
  const human = createHuman({ shirt: 1, hair: 1, skin: 1 }, 'runner');
  human.group.traverse(o => { if (o.isMesh || o.isInstancedMesh) assert.equal(o.castShadow, false, 'a person casts no sun shadow'); });
  const pet = createPet('dog', 3);
  pet.group.traverse(o => { if (o.isMesh || o.isInstancedMesh) assert.equal(o.castShadow, false, 'nor does a pet'); });
});
