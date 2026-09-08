// data/accessories.js — the accessory catalogue (plan §3.5, task 2.4).
//
// WHAT THIS OWNS
// Twelve wearable pieces, each a merged-primitive mesh (same construction rules as
// render/decor.js: colored primitives via src/render/geo.js part()/merge(), vertex colours, one
// shared toon material, no textures) that mounts on a pet rig's 'head' or 'neck' node via the
// P.attach(node, mesh) the rig (src/render/pets.js) exposes. A pet wears its equipped accessory on
// every visit -- the RENDER wiring for "which pet has which accessory equipped" belongs to whoever
// owns the album/equip UI (src/ui/meta.js) and the customer-spawn render loop (systems/customers.js
// / systems/residentPets.js), neither of which this module implements or imports.
//
// UNLOCKS are keyed to follower milestones (plan §3.3), reusing the tiers src/sim/followers.js
// already authored (`followerTierUnlocked` / `FOLLOWER_MILESTONES`) rather than re-deriving them --
// that module's own header comment names this exact file as the intended consumer. One item (the
// seasonal party hat) is authored at the top follower tier as a placeholder; Batch 4's Seasons
// system (plan §3.8) may prefer to gate it on a season goal instead once that system exists.
//
// SAVE SHAPE: `meta.equipped[petKey] = accessoryId` (src/sim/saveSchema.js normalizeEquipped) --
// exactly one id per pet, not one per slot. `slot` here only tells the renderer which rig node
// (head vs neck) that one id's mesh mounts to.
import * as THREE from 'three';
import { part, merge } from '../src/render/geo.js';
import { toonMaterial } from '../src/render/palette.js';
import { followerTierUnlocked } from '../src/sim/followers.js';

const TAU = Math.PI * 2;

// --- geometry builders ---------------------------------------------------------------------------
// Authored at the scale of a cat/dog-sized head (the two most commonly spawned species today);
// hamster/bunny proportions will read slightly large until a future pass scales by mount species --
// noted in this task's handoff rather than guessed at here.

function bow() {
  const wing = x => part('sph', [0.09, 8], '#FF6F91', { x, y: 0, z: 0, sx: 1.4, sz: 0.55 });
  return merge([
    wing(-0.09), wing(0.09),
    part('sph', [0.045, 8], '#E5406B', { x: 0, y: 0 }),
  ]);
}

function beret() {
  return merge([
    part('cyl', [0.19, 0.19, 0.05, 16], '#6B4A9C', { y: 0 }),
    part('sph', [0.02, 6], '#4A3468', { y: 0.05, x: 0.05 }),
  ]);
}

function roundGlasses() {
  const lens = x => merge([
    part('cyl', [0.075, 0.075, 0.014, 14], '#F4F4F4', { x, rx: Math.PI / 2 }),
    part('cyl', [0.06, 0.06, 0.02, 14], '#BFE8FF', { x, rx: Math.PI / 2, z: 0.006 }),
  ]);
  return merge([lens(-0.09), lens(0.09), part('box', [0.06, 0.012, 0.012], '#3B2E2A', { y: 0 })]);
}

function sunglasses() {
  const lens = x => part('rbox', [0.15, 0.09, 0.02, 0.03], '#2B2B2B', { x, rx: 0 });
  return merge([lens(-0.09), lens(0.09), part('box', [0.06, 0.012, 0.012], '#2B2B2B', { y: 0 })]);
}

function flowerCrown() {
  const parts = [part('cyl', [0.17, 0.17, 0.025, 16], '#7BC47F', { y: -0.02 })];
  const hues = ['#FF8A80', '#FFD84D', '#8B7CF6', '#FF6F91', '#6EC6FF', '#7BC47F'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    parts.push(part('sph', [0.035, 6], hues[i % hues.length], { x: Math.cos(a) * 0.17, y: 0, z: Math.sin(a) * 0.17 }));
  }
  return merge(parts);
}

function partyHat() {
  return merge([
    part('cone', [0.13, 0.26, 10], '#FF6F91', { y: 0.1 }),
    part('sph', [0.035, 8], '#FFD84D', { y: 0.24 }),
  ]);
}

// --- neck-slot geometry: a thin band around the neck node plus a distinguishing feature ----------

function band(color, radius = 0.15) {
  return part('cyl', [radius, radius, 0.045, 16], color, { rx: Math.PI / 2 });
}

function bandana(color) {
  return merge([
    band(color, 0.16),
    part('cone', [0.12, 0.16, 4], color, { y: -0.14, z: 0.02, rx: Math.PI }),
  ]);
}

function collarTag() {
  return merge([
    band('#B9834A', 0.14),
    part('cyl', [0.045, 0.045, 0.012, 12], '#FFD84D', { y: -0.13, z: 0.02, rx: Math.PI / 2 }),
  ]);
}

function scarf() {
  return merge([
    band('#8B7CF6', 0.17),
    part('box', [0.07, 0.22, 0.03], '#8B7CF6', { y: -0.16, z: 0.03, rz: 0.12 }),
    part('box', [0.07, 0.18, 0.03], '#7E6AE8', { y: -0.13, z: 0.05, rz: -0.1 }),
  ]);
}

function bellCollar() {
  return merge([
    band('#E45E75', 0.14),
    part('sph', [0.04, 8], '#FFD84D', { y: -0.15, z: 0.02 }),
  ]);
}

// --- catalogue -------------------------------------------------------------------------------------
// tier matches src/sim/followers.js followerMilestoneTier()'s 0..FOLLOWER_MILESTONES.length range:
// 0 = unlocked from the start, 1..4 = that many follower milestones reached.
export const ACCESSORIES = Object.freeze([
  { id: 'acc_bow',            name: 'Bow',            slot: 'head', tier: 0, build: bow },
  { id: 'acc_collar_tag',     name: 'Collar Tag',     slot: 'neck', tier: 0, build: collarTag },
  { id: 'acc_bandana_red',    name: 'Red Bandana',    slot: 'neck', tier: 0, build: () => bandana('#E4694F') },
  { id: 'acc_beret',          name: 'Beret',          slot: 'head', tier: 1, build: beret },
  { id: 'acc_scarf',          name: 'Scarf',          slot: 'neck', tier: 1, build: scarf },
  { id: 'acc_bandana_blue',   name: 'Blue Bandana',   slot: 'neck', tier: 1, build: () => bandana('#6EC6FF') },
  { id: 'acc_glasses',        name: 'Round Glasses',  slot: 'head', tier: 2, build: roundGlasses },
  { id: 'acc_bell_collar',    name: 'Bell Collar',    slot: 'neck', tier: 2, build: bellCollar },
  { id: 'acc_bandana_green',  name: 'Green Bandana',  slot: 'neck', tier: 2, build: () => bandana('#7BC47F') },
  { id: 'acc_flower_crown',   name: 'Flower Crown',   slot: 'head', tier: 3, build: flowerCrown },
  { id: 'acc_sunglasses',     name: 'Sunglasses',     slot: 'head', tier: 3, build: sunglasses },
  // Seasonal placeholder (plan §3.8 may re-gate this on a season goal instead once Seasons ships).
  { id: 'acc_party_hat',      name: 'Party Hat',      slot: 'head', tier: 4, build: partyHat, seasonal: true },
]);

export const ACCESSORY_BY_ID = new Map(ACCESSORIES.map(item => [item.id, item]));
export const ACCESSORY_IDS = Object.freeze(ACCESSORIES.map(item => item.id));
export const ACCESSORY_ID_SET = new Set(ACCESSORY_IDS);

export function accessoryItem(id) {
  return (typeof id === 'string' && ACCESSORY_BY_ID.get(id)) || null;
}

// Whether `id` is unlocked for a player with this `meta` (only `meta.followers` is read). Mirrors
// data/decor.js's decorUnlocked(item, builtSet) shape: item-first, gate-context second.
export function accessoryUnlocked(id, meta) {
  const item = accessoryItem(id);
  if (!item) return false;
  const followers = meta && typeof meta === 'object' ? meta.followers : 0;
  return followerTierUnlocked(item.tier, followers);
}

export function accessoryCatalogue(meta) {
  return ACCESSORIES.filter(item => accessoryUnlocked(item.id, meta));
}

// One shared geometry per id (BufferGeometry is safe to share across many Mesh instances); a fresh
// Mesh wraps it on every call because a THREE.Object3D can only ever have one parent, and the same
// accessory may be worn by several pets on screen (a resident and a customer, say) at once.
const _geoCache = new Map();
function geometryFor(id) {
  if (_geoCache.has(id)) return _geoCache.get(id);
  const item = ACCESSORY_BY_ID.get(id);
  if (!item) return null;
  const g = item.build();
  _geoCache.set(id, g);
  return g;
}

// Builds a fresh, unparented mesh for `id`, or null for an unknown id -- a tampered
// `meta.equipped` value can therefore never make the renderer invent geometry. Returns
// { slot, mesh } so a caller can go straight to pet.attach(slot, mesh).
export function accessoryMesh(id) {
  const geo = geometryFor(id);
  if (!geo) return null;
  const item = ACCESSORY_BY_ID.get(id);
  const mesh = new THREE.Mesh(geo, toonMaterial());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'accessory:' + id;
  return { slot: item.slot, mesh };
}

// Convenience wrapper for the common case: mount `id` on `pet` (a src/render/pets.js createPet()
// rig), or clear whichever accessory occupies `slot` when `id` is falsy/unknown. Returns true when
// something was actually mounted.
export function equipAccessory(pet, id, slot = null) {
  if (!pet || typeof pet.attach !== 'function') return false;
  if (!id) { if (slot) pet.attach(slot, null); return false; }
  const built = accessoryMesh(id);
  if (!built) { if (slot) pet.attach(slot, null); return false; }
  pet.attach(built.slot, built.mesh);
  return true;
}
