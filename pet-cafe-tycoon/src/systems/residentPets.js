// src/systems/residentPets.js — pets that LIVE here, independent of customers.
//
// WHY THIS EXISTS
// Every animal in the game arrived on a customer's leash, so an empty café contained no pets at
// all, and a busy one showed them as small props beside the humans who owned them. The theme was
// carried entirely by naming. Residents are the cheapest honest fix: animals that are simply here,
// asleep on the windowsill and dozing in the garden, whether or not anyone is being served.
//
// Strictly decorative. No navigation, no collision, no simulation, no save state of their own --
// the walk-in "moment" below moves a group's x/y/z/rotation.y by hand over a couple of seconds, the
// same way the CSS layer animates a toast; it never touches the nav grid, a mover, or anything
// sim/ steps. Nothing here can affect prices, patience, spawn odds or pathing -- the same guarantee
// sim/petBook.js makes about friendship -- so this cannot destabilise a balance pass.
//
// TASK 2.5 -- BESTIES MOVE IN (plan §3.6)
// The five placeholder residents (species/variant/furniture all fixed at authoring time) are gone.
// A resident SPOT is now just furniture + a place to stand; WHO sits there is earned: the pet that
// reaches sim/petBook.js's Bestie tier (10 visits) takes the next open slot, in the order it was
// earned. `meta.residents` (already a bounded v5 save field -- see saveSchema.js's
// normalizeResidents/SAVE_LIMITS.maxResidents) is the list of resident pet keys; array index i is
// slot i's occupant. Empty slots still render their furniture -- an invitation, not a gap.
//
// SLOT COUNT (plan §3.6: "3 at start, +1 per star, max 8")
// Batch 3 landed the Paw Rating, so `currentResidentStars(G)` now reads the real rating instead of
// returning 0. `residentSlotCount(stars)` is still the whole predicate and every caller still goes
// through `currentResidentStars(G)`, so nothing else in this file changed. Only RESIDENT_SPOTS.length
// (5) physical furniture placements exist today, so the effective cap stays
// `Math.min(residentSlotCount(stars), RESIDENT_SPOTS.length)` -- ★3 and above buy no visible slot
// until a content batch adds entries to RESIDENT_SPOTS. That is a deliberate under-delivery rather
// than a silent one: it is cheaper to leave the arithmetic honest and add furniture than to cap the
// rating's advertised effect here.
//
// MOVE-IN MOMENT (plan §3.6: "the pet walks in on its own the next morning")
// A pet admitted to meta.residents mid-shift does not appear immediately -- residentPets.js keeps
// its own on-screen roster and only reconciles it against meta.residents when G.dayState.day ticks
// over, i.e. at the next morning. A newly-noticed key gets a short scripted walk from the door to
// its spot (gait via render/pets.js's own P.update, no pathfinding) with a nameplate
// (ui/petMoments.js) that disappears once it settles. Pets already resident when this module boots
// (a loaded save) settle instantly with no animation and no replay, matching the same "already-
// earned memories appear at their settled home" rule systems/petFriendship.js follows for the wall
// keepsake.
//
// ACCESSORY (plan §3.6: "Residents keep their name and their equipped accessory")
// data/accessories.js's equipAccessory(pet, id) names this file as an intended consumer -- a
// resident mounts whatever meta.equipped[key] currently says the instant it settles (both the
// instant-settle path and the end of a walk-in), the same way a customer's pet would. If the id
// is unset/unknown this is a harmless no-op.
//
// WHAT WENT WRONG THE FIRST TIME (plan §5.4)
// The first pass scaled residents to 1.22 and called sit() on BARE FLOOR. Three faults compounded:
//   * 1.22 made a pet bigger than the chairs beside it, so it read as a block, not an animal;
//   * a pet on empty tiles has no reason to be there, and the eye files it as a dropped prop;
//   * the cat's `long` tail, straight in the old sit pose, hung out behind the rump as a loose
//     line -- the stray line the owner circled in the screenshot.
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
// origin of (0, 0, 0) it is free to bounce around in. The one exception is the walk-in itself,
// where the pet is a free-standing scene child until it arrives and gets reparented.
//
// G.meta MAY BE REASSIGNED BY G.restore() (sim/save.js replaces it with a fresh object), and
// createResidentPets(S, G, els) is constructed by main.js BEFORE G.restore() runs. So this file
// never caches `G.meta`/`G.dayState` in a local variable -- every read goes through `G.meta` /
// `G.dayState` live, and the initial "settle whoever's already resident" pass is deferred to the
// first update() call rather than done at construction time.
import * as THREE from 'three';
import { createPet } from '../render/pets.js';
import {
  bunnyHutchMesh, catBedMesh, catTreeMesh, dogBasketMesh, windowCushionMesh,
} from '../render/props.js';
import { createPetMoment } from '../ui/petMoments.js';
import {
  PET_BESTIE_VISITS, PET_PROFILES, PET_SPECIES, parsePetKey, petKey,
} from '../sim/petBook.js';
import { equipAccessory } from '../../data/accessories.js';
import { AREA1 } from '../../data/area1.js';
import { pawBestStar } from '../sim/pawRating.js';

// Metres. Plan §5.4: "a head turn toward the owner within 3 m".
const LOOK_RANGE = 3;

// Walk-in timing for the move-in moment: door -> spot ground point, then ground point -> perch
// height (the final settle + sit). Both short enough to read as a beat, not a cutscene.
const WALK_SECONDS = 2.2;
const SETTLE_SECONDS = 0.6;

// Furniture-only spots: WHERE a resident can sit, decoupled from WHO sits there. `ry` is the
// spot's own facing (how the furniture sits in the room); `petRy` is the pet's rest pose on that
// specific piece of furniture (e.g. angled toward the window), independent of the pet's identity.
// Coordinates and rotations are unchanged from the Batch 0 placeholder set -- only the species/
// variant/clip fields that used to hardcode WHO sat here are gone.
const RESIDENT_SPOTS = [
  // --- inside, all on furniture, all clear of queue lines and station footprints ---
  { furniture: windowCushionMesh, x: -5.0, y: 0, z: -6.5, ry: 0, petRy: 0.22 },
  { furniture: catTreeMesh, x: 9.15, y: 0, z: -4.85, ry: 0.2, petRy: -0.15 },
  { furniture: catBedMesh, x: -9.0, y: 0, z: -4.6, ry: 0, petRy: 0.45 },
  { furniture: dogBasketMesh, x: -8.9, y: 0, z: 2.3, ry: -0.4, petRy: 0 },
  // --- garden, past the south fence: no navigation grid out here, and environment.js's lawn tops
  //     out at y ~= -0.42, which is why the hutch is dropped to -0.44 instead of sitting at 0.
  { furniture: bunnyHutchMesh, x: -6.0, y: -0.44, z: 10.6, ry: 0.45, petRy: 0 },
  // --- ★3-★5 slots. Placed against walls and inside the terrace deck, clear of every station
  //     front, queue line and gate: the nav grid is 0.5m cells and Batch 1 lost pathfinding to a
  //     lantern sitting 0.67m from a gate, so none of these sits within a metre of a doorway.
  { furniture: catBedMesh, x: 9.05, y: 0, z: 2.6, ry: -0.25, petRy: -0.35 },
  { furniture: windowCushionMesh, x: 5.4, y: 0, z: -6.5, ry: 0, petRy: -0.2 },
  { furniture: dogBasketMesh, x: 6.6, y: 0, z: 10.7, ry: 0.3, petRy: 0.15 },
];

// Plan §3.6: 3 base slots, +1 per star, capped at 8. See the file header for why `stars` is always
// 0 today and where that will change.
export function residentSlotCount(stars = 0) {
  const s = Math.max(0, Math.trunc(Number(stars) || 0));
  return Math.max(3, Math.min(8, 3 + s));
}

// Single seam onto the Paw Rating. Every caller in this file and in systems/petFriendship.js goes
// through this rather than reaching into meta itself.
//
// Reads the RATCHET (meta.pawBest via pawBestStar), never pawRatingState().live: a slot that opened
// when a star was earned must not close again after a bad week, because closing it would strand a
// pet that is already sitting on its furniture -- reconcileResidents/admitResident only ever append,
// so a shrinking cap cannot evict anyone and would instead leave meta.residents.length above the
// cap, which is worse than an over-generous cap. pawBestStar is null-safe, so a G with no meta yet
// (main.js constructs this module before G.restore()) still reads 0.
export function currentResidentStars(G) {
  return pawBestStar(G && G.meta);
}

function effectiveSlotCap(stars) {
  return Math.min(residentSlotCount(stars), RESIDENT_SPOTS.length);
}

function ensureResidentsArray(meta) {
  if (!meta || typeof meta !== 'object') return [];
  if (!Array.isArray(meta.residents)) meta.residents = [];
  return meta.residents;
}

// Deterministic tie-break for backfilling a Bestie who reached the tier before a slot existed for
// them (a legacy save made before this feature shipped, or a slot that opened because stars grew
// between sessions). Mirrors sim/petBook.js's own firstBestieKey() species-then-variant order so
// this file introduces no second ordering convention.
function canonicalBestieKeys(meta) {
  const out = [];
  const friendship = meta && meta.petFriendship;
  if (!friendship) return out;
  for (const species of PET_SPECIES) {
    for (let variant = 0; variant < PET_PROFILES[species].length; variant++) {
      const key = petKey(species, variant);
      if ((friendship[key] | 0) >= PET_BESTIE_VISITS) out.push(key);
    }
  }
  return out;
}

// Admits ONE pet the instant it reaches the Bestie tier -- true first-come-first-served. Called by
// systems/petFriendship.js right after a promotion. A no-op if the pet is already resident or
// every slot is already taken; never removes or reorders an existing resident, so an already-
// settled pet can never be bumped off its furniture by a later Bestie.
export function admitResident(meta, key, stars = 0) {
  if (!meta || typeof meta !== 'object' || typeof key !== 'string') return false;
  const residents = ensureResidentsArray(meta);
  if (residents.includes(key)) return false;
  if (residents.length >= effectiveSlotCap(stars)) return false;
  residents.push(key);
  return true;
}

// Backfills any already-earned Bestie that admitResident's event hook missed: a save made before
// this feature existed, or a slot that opened because stars grew while the player was away. Order
// among backfilled pets follows canonicalBestieKeys; never disturbs an existing resident's slot.
export function reconcileResidents(meta, stars = 0) {
  if (!meta || typeof meta !== 'object') return;
  const residents = ensureResidentsArray(meta);
  const cap = effectiveSlotCap(stars);
  if (residents.length >= cap) return;
  const have = new Set(residents);
  for (const key of canonicalBestieKeys(meta)) {
    if (residents.length >= cap) break;
    if (have.has(key)) continue;
    residents.push(key);
    have.add(key);
  }
}

function prefersReducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

function buildSpot(scene, spec) {
  const spot = new THREE.Group();
  spot.position.set(spec.x, spec.y || 0, spec.z);
  spot.rotation.y = spec.ry || 0;

  const furniture = spec.furniture();
  spot.add(furniture);

  const perch = new THREE.Group();
  perch.position.copy(furniture.perch);
  spot.add(perch);
  scene.add(spot);

  // The pet's WORLD position: the spot's own yaw applied to the furniture's perch offset. Fixed
  // for the life of the scene, so it is worth computing once.
  const c = Math.cos(spot.rotation.y), s = Math.sin(spot.rotation.y);
  const wx = spec.x + furniture.perch.x * c + furniture.perch.z * s;
  const wz = spec.z - furniture.perch.x * s + furniture.perch.z * c;

  return {
    spec, spot, furniture, perch, wx, wz,
    cos: c, sin: s,
    facing: spot.rotation.y + (spec.petRy || 0), // the settled pet's total world yaw
  };
}

// render/pets.js's react()/idleLife() read the pet's own group.position to work out how far away
// and in which direction a target is -- and a SETTLED resident's group.position is (0, 0, 0),
// because it is parented under its perch. So hand those calls the target already expressed in the
// SPOT's own frame: the distance survives the rotation untouched, and the pet's local rotation.y
// (already baked into `facing`) is the remaining half of the transform.
function spotLocalTarget(slot, tx, tz, extra) {
  const dx = tx - slot.wx, dz = tz - slot.wz;
  const target = extra ? { ...extra } : {};
  target.x = dx * slot.cos - dz * slot.sin;
  target.z = dx * slot.sin + dz * slot.cos;
  return target;
}

function makeProjector(camera) {
  const v = new THREE.Vector3();
  return {
    project(x, y, z, out) {
      v.set(x, y, z).project(camera);
      out.sx = (v.x * 0.5 + 0.5) * innerWidth;
      out.sy = (-v.y * 0.5 + 0.5) * innerHeight;
      out.visible = v.z < 1;
      return out;
    },
  };
}

// `ownerSource` may be a live position object (main.js's G.P is exactly this) or a function that
// returns one.
function readOwnerFrom(G) {
  const P = G && G.P;
  return P && Number.isFinite(P.x) && Number.isFinite(P.z) ? P : null;
}

// `S` is the render/scene.js bundle (needs .scene and .camera). `G` is the live game object --
// read fresh every time, never cached, because G.meta can be replaced wholesale by G.restore().
// `els` is main.js's `{ fx, ... }` DOM bundle; the move-in nameplate is skipped (not required) if
// it is omitted, e.g. a future headless caller.
export function createResidentPets(S, G, els = null) {
  const scene = S.scene;
  const projector = S.camera ? makeProjector(S.camera) : null;
  const slots = RESIDENT_SPOTS.map(spec => buildSpot(scene, spec));
  const occupants = new Array(slots.length).fill(null);
  const arrivals = new Map(); // spotIndex -> in-progress walk-in record

  let booted = false;
  let lastDay = 1;

  function slotPhase(i) {
    // Desynchronise every clock. Several residents breathing, blinking and stretching on the same
    // beat is the single loudest "these are props" tell. Derived from the spot rather than
    // Math.random so a screenshot at a given time is reproducible across reloads and devices.
    const spec = slots[i].spec;
    return (i * 2.713 + Math.abs(spec.x) * 0.41 + Math.abs(spec.z) * 0.19) % 8.5;
  }

  function mountSettled(i, key) {
    const parsed = parsePetKey(key);
    if (!parsed) return;
    const slot = slots[i];
    const pet = createPet(parsed.species, parsed.variant);
    pet.setBaseScale(1); // §5.4: scale back to 1.0, same size as a guest's pet
    pet.group.position.set(0, 0, 0);
    pet.group.rotation.y = slot.spec.petRy || 0;
    pet.sit();
    slot.perch.add(pet.group);
    pet.setLifePhase(slotPhase(i));
    equipAccessory(pet, G.meta && G.meta.equipped && G.meta.equipped[key]);
    occupants[i] = {
      key, profile: parsed.profile, species: parsed.species, variant: parsed.variant, pet,
    };
  }

  function bootstrap() {
    const meta = G.meta;
    if (!meta || typeof meta !== 'object') return;
    ensureResidentsArray(meta);
    reconcileResidents(meta, currentResidentStars(G));
    const n = Math.min(meta.residents.length, slots.length);
    for (let i = 0; i < n; i++) if (!occupants[i]) mountSettled(i, meta.residents[i]);
    lastDay = G.dayState ? G.dayState.day : 1;
    booted = true;
  }

  function beginArrival(i, key) {
    const parsed = parsePetKey(key);
    if (!parsed) return;
    const pet = createPet(parsed.species, parsed.variant);
    pet.setBaseScale(1);
    equipAccessory(pet, G.meta && G.meta.equipped && G.meta.equipped[key]);
    const door = (AREA1 && AREA1.door) || { x: -9.6, z: 4.2 };
    pet.group.position.set(door.x, 0, door.z);
    scene.add(pet.group);
    const nameplate = els && els.fx ? createPetMoment(els, parsed.profile, null, parsed.species) : null;
    if (nameplate) nameplate.setSeated(true); // paw + name only -- no prose caption on the play field
    arrivals.set(i, { t: 0, key, parsed, pet, nameplate, doorX: door.x, doorZ: door.z });
  }

  function finishArrival(i, arr) {
    scene.remove(arr.pet.group);
    arr.pet.group.position.set(0, 0, 0);
    arr.pet.group.rotation.y = slots[i].spec.petRy || 0;
    arr.pet.sit();
    slots[i].perch.add(arr.pet.group);
    arr.pet.setLifePhase(slotPhase(i));
    occupants[i] = {
      key: arr.key, profile: arr.parsed.profile, species: arr.parsed.species,
      variant: arr.parsed.variant, pet: arr.pet,
    };
    if (arr.nameplate) arr.nameplate.remove();
    arrivals.delete(i);
  }

  function stepArrival(i, arr, dt) {
    arr.t += dt;
    const slot = slots[i];
    const pet = arr.pet;
    if (arr.t <= WALK_SECONDS) {
      const u = Math.max(0, Math.min(1, arr.t / WALK_SECONDS));
      const x = arr.doorX + (slot.spec.x - arr.doorX) * u;
      const z = arr.doorZ + (slot.spec.z - arr.doorZ) * u;
      const dx = x - pet.group.position.x, dz = z - pet.group.position.z;
      pet.group.position.set(x, 0, z);
      if (Math.hypot(dx, dz) > 1e-4) pet.group.rotation.y = Math.atan2(dx, dz);
      pet.update(dt, true);
    } else {
      const u = Math.max(0, Math.min(1, (arr.t - WALK_SECONDS) / SETTLE_SECONDS));
      const perchWorldY = (slot.spec.y || 0) + slot.furniture.perch.y;
      pet.group.position.set(slot.spec.x, perchWorldY * u, slot.spec.z);
      const targetRy = (slot.spec.ry || 0) + (slot.spec.petRy || 0);
      let d = targetRy - pet.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      pet.group.rotation.y += d * Math.min(1, dt * 6);
      pet.update(dt, u < 1);
      if (u >= 1) { finishArrival(i, arr); return; }
    }
    if (arr.nameplate && projector) {
      const pp = pet.group.position;
      arr.nameplate.update(dt, projector, pp.x, pet.height + 0.42, pp.z);
    }
  }

  function checkForNewResidents() {
    const meta = G.meta;
    if (!meta || typeof meta !== 'object' || !Array.isArray(meta.residents)) return;
    const day = G.dayState ? G.dayState.day : lastDay;
    if (day === lastDay) return;
    lastDay = day;
    // A new morning: any resident recorded in meta but not yet on screen gets its move-in moment.
    // New admissions always append at the END of meta.residents (see admitResident), so this never
    // reassigns a spot an existing occupant already holds.
    const n = Math.min(meta.residents.length, slots.length);
    for (let i = 0; i < n; i++) {
      if (occupants[i] || arrivals.has(i)) continue;
      beginArrival(i, meta.residents[i]);
    }
  }

  function traitReact(i, occ, step, owner, reducedMotion, now) {
    const name = occ.profile.name;
    const slot = slots[i];
    if (name === 'Biscuit') {
      if (owner) occ.pet.react(name, now, spotLocalTarget(slot, owner.x, owner.z, null), reducedMotion);
      return;
    }
    // Marmalade/Snowdrop clips are tied to real café context (a live oven batch, a grown garden
    // bed) exactly like systems/customers.js's own r.pet.react() call for guest pets -- same
    // station lookups, same target shape (petTraitContextActive reads target.timer/.stock/.stage
    // straight off the station object spotLocalTarget spreads through).
    const stationId = name === 'Marmalade' ? 'oven1' : name === 'Snowdrop' ? 'bush1' : null;
    if (!stationId) return;
    const st = G.world && G.world.stations && G.world.stations.get(stationId);
    if (st) occ.pet.react(name, now, spotLocalTarget(slot, st.x, st.z, st), reducedMotion);
  }

  function update(dt) {
    if (!booted) bootstrap();
    const step = Math.min(0.12, Math.max(0, Number(dt) || 0));
    checkForNewResidents();

    const owner = readOwnerFrom(G);
    const reducedMotion = !!(G.settings && G.settings.reducedMotion) || prefersReducedMotion();
    const now = (G.time || 0);

    for (let i = 0; i < occupants.length; i++) {
      const occ = occupants[i];
      if (!occ) continue;
      const slot = slots[i];
      const pet = occ.pet;
      // Settled residents never walk, so `moving` is always false: no gait, no footfall, no dust.
      pet.update(step, false);

      let lookYaw = null;
      if (owner) {
        const dx = owner.x - slot.wx, dz = owner.z - slot.wz;
        if (Math.hypot(dx, dz) <= LOOK_RANGE) {
          const a = Math.atan2(dx, dz) - slot.facing;
          lookYaw = Math.atan2(Math.sin(a), Math.cos(a)); // wrapped to (-pi, pi]
        }
      }
      pet.idleLife(step, { lookYaw, reducedMotion });
      traitReact(i, occ, step, owner, reducedMotion, now + i * 0.37);
    }

    for (const [i, arr] of arrivals) stepArrival(i, arr, step);
  }

  return {
    update,
    get count() { return occupants.filter(Boolean).length + arrivals.size; },
    // The Golden Paw ceremony (systems/goldenPaw.js) gathers its own copies of the residents on the
    // rug for the length of the award. Hiding only the pet keeps every cushion and basket in place,
    // which is the invitation this module is built around.
    setCeremonyHidden(hidden) {
      for (const spot of occupants) if (spot && spot.pet && spot.pet.group) spot.pet.group.visible = !hidden;
    },
  };
}
