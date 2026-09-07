// src/systems/residentPets.js — pets that LIVE here, independent of customers.
//
// WHY THIS EXISTS
// Every animal in the game arrived on a customer's leash, so an empty café contained no pets at
// all, and a busy one showed them as small props beside the humans who owned them. The theme was
// carried entirely by naming. Residents are the cheapest honest fix: animals that are simply here,
// asleep on the windowsill and playing in the garden, whether or not anyone is being served.
//
// Strictly decorative. No navigation, no collision, no simulation, no save state. Nothing here can
// affect prices, patience, spawn odds or pathing — the same guarantee sim/petBook.js makes about
// friendship — so this cannot destabilise a balance pass.
//
// PLACEMENT
// Residents sit outside the walkable floor: in the garden past the south fence, or on the quiet
// east strip inside it. A decorative pet standing in a walkway would be walked through, and the
// clipping would read as a bug rather than as a cat.

import { createPet } from '../render/pets.js';

// species, variant, x, z, facing, and what it does. Variants pull real coats from petBook profiles.
const RESIDENTS = [
  // --- garden (past the south fence, no navigation grid out here) ---
  { species: 'dog',   variant: 1, x: -4.2, z: 10.2, ry: -0.6, mode: 'sit' },
  { species: 'bunny', variant: 0, x: 3.6,  z: 9.4,  ry: 2.3,  mode: 'hop' },
  { species: 'bunny', variant: 3, x: 4.6,  z: 10.1, ry: 1.7,  mode: 'graze' },
  { species: 'cat',   variant: 2, x: 7.4,  z: 11.4, ry: -1.9, mode: 'loaf' },
  { species: 'dog',   variant: 3, x: -8.4, z: 9.0,  ry: 0.9,  mode: 'patrol' },
  // --- inside the fence, on the quiet east strip away from the service flow ---
  { species: 'cat',   variant: 0, x: 9.3,  z: 1.6,  ry: -1.4, mode: 'loaf' },
  { species: 'cat',   variant: 1, x: 9.2,  z: 4.4,  ry: -2.2, mode: 'sit' },
];

// Residents read a touch larger than a customer's pet. They are set dressing the eye should land
// on, and at this camera pitch an unscaled pet is roughly the size of a coffee cup.
const SCALE = 1.22;

export function createResidentPets(scene) {
  const pets = [];

  for (const spec of RESIDENTS) {
    const pet = createPet(spec.species, spec.variant);
    pet.group.position.set(spec.x, 0, spec.z);
    pet.group.rotation.y = spec.ry;
    pet.group.scale.setScalar(SCALE);
    if (spec.mode === 'sit' || spec.mode === 'loaf') pet.sit();
    scene.add(pet.group);
    pets.push({
      pet, spec,
      // Desynchronise every clock so seven residents never breathe or blink in lockstep.
      t: (spec.x * 1.7 + spec.z * 0.9) % 6,
      homeX: spec.x, homeZ: spec.z, baseRy: spec.ry,
      phase: 0, hop: 0,
    });
  }

  function update(dt) {
    for (const R of pets) {
      R.t += dt;
      const p = R.pet;
      let moving = false;

      switch (R.spec.mode) {
        case 'hop': {
          // A bunny that idles, then bursts into a few hops and settles again.
          const cycle = R.t % 7;
          if (cycle > 5.2) {
            moving = true;
            R.hop = Math.abs(Math.sin((cycle - 5.2) * 7)) * 0.22;
            p.group.position.z = R.homeZ + Math.sin((cycle - 5.2) * 2.4) * 0.5;
          } else {
            R.hop *= Math.exp(-6 * dt);
          }
          p.setHop(R.hop);
          break;
        }
        case 'graze': {
          // Nose down, nose up. Sold entirely by the head pitch the pet rig already supports.
          const g = (Math.sin(R.t * 0.9) + 1) * 0.5;
          p.group.rotation.x = g * 0.16;
          break;
        }
        case 'patrol': {
          // Slow figure-of-eight around its spot, so at least one resident is always in motion.
          const a = R.t * 0.35;
          const nx = R.homeX + Math.sin(a) * 1.5;
          const nz = R.homeZ + Math.sin(a * 2) * 0.7;
          const dx = nx - p.group.position.x, dz = nz - p.group.position.z;
          if (Math.hypot(dx, dz) > 0.004) {
            p.group.rotation.y = Math.atan2(dx, dz);
            moving = true;
          }
          p.group.position.x = nx; p.group.position.z = nz;
          break;
        }
        case 'loaf':
        case 'sit':
        default: {
          // Occasional glance around: the single cheapest cue that something is alive rather than
          // placed. Slow enough never to pull the eye away from the café floor.
          const look = Math.sin(R.t * 0.42) * 0.5 + Math.sin(R.t * 0.17) * 0.28;
          p.group.rotation.y = R.baseRy + look;
          break;
        }
      }

      p.update(dt, moving);
    }
  }

  return {
    update,
    get count() { return pets.length; },
  };
}
