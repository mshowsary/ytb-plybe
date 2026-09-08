// src/systems/residentPets.js — pets that LIVE here, independent of customers.
//
// WHY THIS EXISTS
// Every animal in the game arrived on a customer's leash, so an empty café contained no pets at
// all, and a busy one showed them as small props beside the humans who owned them. The theme was
// carried entirely by naming. Residents are the cheapest honest fix: animals that are simply here,
// asleep on the windowsill and dozing in the garden, whether or not anyone is being served.
//
// Strictly decorative. No navigation, no collision, no simulation, no save state. Nothing here can
// affect prices, patience, spawn odds or pathing — the same guarantee sim/petBook.js makes about
// friendship — so this cannot destabilise a balance pass.
//
// WHAT WENT WRONG THE FIRST TIME (plan §5.4)
// The first pass scaled residents to 1.22 and called sit() on BARE FLOOR. Three faults compounded:
//   * 1.22 made a pet bigger than the chairs beside it, so it read as a block, not an animal;
//   * a pet on empty tiles has no reason to be there, and the eye files it as a dropped prop;
//   * the cat's `long` tail, straight in the old sit pose, hung out behind the rump as a loose
//     line — the stray line the owner circled in the screenshot.
// The fix is scale 1.0, a piece of FURNITURE under every resident, and a sit pose that folds
// instead of skewering the floor (render/pets.js owns the last two).
//
// PLACEMENT
// Residents sit outside the walkable floor (the garden past the south fence) or a metre or more up
// on furniture, in corners with no station footprint and no queue line: the north window bay behind
// the production row, the dead pocket north-west of the second register, the kiosk corner, and the
// strip of wall just north of the door. A decorative pet standing in a walkway gets walked through,
// and the clipping reads as a bug rather than as a cat.
//
// EACH PET IS PARENTED UNDER ITS FURNITURE, not under the scene, because render/pets.js's update()
// rewrites group.position.y every frame (that is how the hop works). A spot group carries the world
// placement, a perch group carries the furniture's own seat height, and the pet keeps a local
// origin of (0, 0, 0) it is free to bounce around in.

import * as THREE from 'three';
import { createPet } from '../render/pets.js';
import {
  bunnyHutchMesh, catBedMesh, catTreeMesh, dogBasketMesh, windowCushionMesh,
} from '../render/props.js';

// Metres. Plan §5.4: "a head turn toward the owner within 3 m".
const LOOK_RANGE = 3;

// species/variant pick the coat AND the name from sim/petBook.js's PET_PROFILES, so every resident
// is doing the thing its profile says it does: Lavender the quiet-window dreamer is on the window
// ledge, Lilac the soft-seat connoisseur is in the cushion bed, Biscuit ("everyone is a friend")
// greets at the door, Snowdrop the garden watcher is in the garden.
//
// `clip` names a render/petTraitMotion.js personality clip; only profiles that HAVE one are listed
// (that module is keyed by profile name and rejects anything else). `watch` is the fixed world
// point a non-owner clip looks at.
const RESIDENTS = [
  // --- inside, all on furniture, all clear of queue lines and station footprints ---
  { species: 'cat',   variant: 2, furniture: windowCushionMesh, x: -5.0, y: 0, z: -6.5,  ry: 0,     petRy: 0.22 },
  { species: 'cat',   variant: 3, furniture: catTreeMesh,       x: 9.15, y: 0, z: -4.85, ry: 0.2,   petRy: -0.15 },
  { species: 'bunny', variant: 2, furniture: catBedMesh,        x: -9.0, y: 0, z: -4.6,  ry: 0,     petRy: 0.45 },
  { species: 'dog',   variant: 0, furniture: dogBasketMesh,     x: -8.9, y: 0, z: 2.3,   ry: -0.4,  petRy: 0,
    clip: 'Biscuit' },
  // --- garden, past the south fence: no navigation grid out here, and environment.js's lawn tops
  //     out at y ~= -0.42, which is why the hutch is dropped to -0.44 instead of sitting at 0.
  { species: 'bunny', variant: 0, furniture: bunnyHutchMesh,    x: -6.0, y: -0.44, z: 10.6, ry: 0.45, petRy: 0,
    clip: 'Snowdrop', watch: { x: -6.5, z: 8.3 } },
];

// Same shape systems/objective.js uses: the OS preference only, guarded, because this module is
// not handed the game object and so cannot see G.settings. Pass `reducedMotionSource` to OR the
// in-game setting in on top of it.
function prefersReducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

// `ownerSource` may be a live position object (game.js's G.P is exactly this) or a function that
// returns one. Without it the residents still breathe, blink, sway and stretch — they just never
// look up, and Biscuit never greets, because there is nothing to look at.
export function createResidentPets(scene, ownerSource = null, reducedMotionSource = null) {
  const readOwner = typeof ownerSource === 'function' ? ownerSource
    : (ownerSource && typeof ownerSource === 'object' ? () => ownerSource : () => null);
  const readReduced = typeof reducedMotionSource === 'function'
    ? () => !!reducedMotionSource() || prefersReducedMotion()
    : prefersReducedMotion;
  const pets = [];
  let clock = 0;

  for (let i = 0; i < RESIDENTS.length; i++) {
    const spec = RESIDENTS[i];
    const spot = new THREE.Group();
    spot.position.set(spec.x, spec.y || 0, spec.z);
    spot.rotation.y = spec.ry || 0;

    const furniture = spec.furniture();
    spot.add(furniture);

    const perch = new THREE.Group();
    perch.position.copy(furniture.perch);
    spot.add(perch);

    const pet = createPet(spec.species, spec.variant);
    pet.setBaseScale(1);                       // §5.4: scale back to 1.0, same size as a guest's pet
    pet.group.rotation.y = spec.petRy || 0;
    pet.sit();
    perch.add(pet.group);
    scene.add(spot);

    // Desynchronise every clock. Five residents breathing, blinking and stretching on the same
    // beat is the single loudest "these are props" tell, and it is the kind of thing that only
    // shows up once they are all in frame together. Derived from the spec rather than
    // Math.random so a screenshot at a given time is reproducible across reloads and devices.
    const phase = (i * 2.713 + Math.abs(spec.x) * 0.41 + Math.abs(spec.z) * 0.19) % 8.5;
    pet.setLifePhase(phase);

    // The pet's WORLD position: the spot's own yaw applied to the furniture's perch offset. Fixed
    // for the life of the scene, so it is worth computing once — nothing here ever moves.
    const c = Math.cos(spot.rotation.y), s = Math.sin(spot.rotation.y);
    const wx = spec.x + furniture.perch.x * c + furniture.perch.z * s;
    const wz = spec.z - furniture.perch.x * s + furniture.perch.z * c;

    pets.push({
      pet, spec, phase, wx, wz,
      cos: c, sin: s,
      facing: spot.rotation.y + (spec.petRy || 0),   // the pet's total world yaw
    });
  }

  // render/pets.js's react() reads the pet's own group.position to work out how far away and in
  // which direction its trait target is — and a resident's group.position is (0, 0, 0), because it
  // is parented under a perch. So hand react() the target already expressed in the SPOT's frame:
  // the distance survives the rotation untouched, and react() then subtracts the pet's own local
  // rotation.y itself, which is exactly the remaining half of the transform.
  function spotLocalTarget(R, tx, tz, extra) {
    const dx = tx - R.wx, dz = tz - R.wz;
    const target = extra ? { ...extra } : {};
    target.x = dx * R.cos - dz * R.sin;
    target.z = dx * R.sin + dz * R.cos;
    return target;
  }

  function update(dt) {
    const step = Math.min(0.12, Math.max(0, Number(dt) || 0));
    clock += step;
    const owner = readOwner();
    const hasOwner = !!owner && Number.isFinite(owner.x) && Number.isFinite(owner.z);
    const reducedMotion = readReduced();

    for (const R of pets) {
      const p = R.pet;
      // Residents never walk, so `moving` is always false: no gait, no footfall, no dust.
      p.update(step, false);

      let lookYaw = null;
      if (hasOwner) {
        const dx = owner.x - R.wx, dz = owner.z - R.wz;
        if (Math.hypot(dx, dz) <= LOOK_RANGE) {
          const a = Math.atan2(dx, dz) - R.facing;
          lookYaw = Math.atan2(Math.sin(a), Math.cos(a));   // wrapped to (-pi, pi]
        }
      }
      p.idleLife(step, { lookYaw, reducedMotion });

      if (R.spec.clip) {
        // Biscuit's clip is a greeting and needs the owner; Snowdrop's watches a fixed garden bed
        // and needs a `stage` above zero to count as something worth watching.
        const target = R.spec.watch
          ? spotLocalTarget(R, R.spec.watch.x, R.spec.watch.z, { stage: 1 })
          : (hasOwner ? spotLocalTarget(R, owner.x, owner.z, null) : null);
        if (target) p.react(R.spec.clip, clock + R.phase, target, reducedMotion);
      }
    }
  }

  return {
    update,
    get count() { return pets.length; },
  };
}
