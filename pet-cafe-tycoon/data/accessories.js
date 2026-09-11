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
// that module's own header comment names this exact file as the intended consumer. Four items
// (flower crown, sunglasses, scarf, party hat -- each flagged `seasonal: true` below) ALSO unlock
// by playing through their matching season (see SEASON_ACCESSORY_IDS / seasonAccessoryUnlocked
// near the bottom of this file), on top of their original follower-tier gate, which stays exactly
// as it was -- a player takes whichever door they reach first.
//
// SAVE SHAPE: `meta.equipped[petKey] = accessoryId` (src/sim/saveSchema.js normalizeEquipped) --
// exactly one id per pet, not one per slot. `slot` here only tells the renderer which rig node
// (head vs neck) that one id's mesh mounts to.
//
// THE BOUTIQUE (plan §3.5/§3.9) -- a third unlock door, "an alternative to milestones": every item
// below also carries a `price` in coins so src/sim/economy.js's buyAccessory(state, id) can sell it
// once z_boutique is built, regardless of follower tier or season. Prices sit inside the exact same
// 60-900 coin band data/decor.js authored (this is cosmetic-sink content, same shelf) and climb with
// `tier` so a player who wants to skip ahead of the follower ladder pays more for the privilege the
// higher that tier's item would otherwise cost in followers. A bought id lands in
// `meta.accessoriesBought` (src/sim/saveSchema.js normalizeAccessoriesBought), which
// accessoryUnlocked() below treats as a third yes alongside the follower-tier and season doors.
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

// --- icons -----------------------------------------------------------------------------------
// Inline SVG, viewBox 0 0 24 24 -- same convention data/decor.js's icons use so a row drops into
// the same kiosk boutique-tab boxes décor's tab already draws (icon + price, no words). A flat
// silhouette rather than the 3D mesh's actual geometry, same reasoning décor's icons have: legible
// at 44px, and independent of whether three.js has even loaded yet.
const bowIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M11 12l-6-4v8z" fill="#FF6F91"/><path d="M13 12l6-4v8z" fill="#FF6F91"/>'
  + '<circle cx="12" cy="12" r="1.6" fill="#E5406B"/></svg>';
const collarTagIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M4 9a8 8 0 0 1 16 0" fill="none" stroke="#B9834A" stroke-width="2.2"/>'
  + '<circle cx="12" cy="16.5" r="2.6" fill="#FFD84D"/></svg>';
const bandanaIcon = color => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + `<path d="M4 8a8 8 0 0 1 16 0" fill="none" stroke="${color}" stroke-width="2.2"/>`
  + `<path d="M9 9l3 6 3-6z" fill="${color}"/></svg>`;
const beretIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<ellipse cx="12" cy="11" rx="8" ry="6" fill="#6B4A9C"/><circle cx="14" cy="6" r="1.3" fill="#4A3468"/></svg>';
const scarfIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M4 9a8 8 0 0 1 16 0" fill="none" stroke="#8B7CF6" stroke-width="2.2"/>'
  + '<path d="M9 9.5l-1.6 8 3.2-1.6z" fill="#8B7CF6"/><path d="M15 9.5l1.6 7-3.2-1.8z" fill="#7E6AE8"/></svg>';
const glassesIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<circle cx="7.5" cy="12" r="4" fill="none" stroke="#3B2E2A" stroke-width="1.8"/>'
  + '<circle cx="16.5" cy="12" r="4" fill="none" stroke="#3B2E2A" stroke-width="1.8"/>'
  + '<path d="M11.5 12h1" stroke="#3B2E2A" stroke-width="1.8"/></svg>';
const bellCollarIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M4 9a8 8 0 0 1 16 0" fill="none" stroke="#E45E75" stroke-width="2.2"/>'
  + '<circle cx="12" cy="16.5" r="2.4" fill="#FFD84D"/><circle cx="12" cy="16" r="0.6" fill="#B08A00"/></svg>';
const flowerCrownIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<ellipse cx="12" cy="14" rx="8" ry="4" fill="none" stroke="#7BC47F" stroke-width="2"/>'
  + '<circle cx="7" cy="10.5" r="1.6" fill="#FF8A80"/><circle cx="12" cy="8.5" r="1.6" fill="#FFD84D"/>'
  + '<circle cx="17" cy="10.5" r="1.6" fill="#8B7CF6"/></svg>';
const sunglassesIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<rect x="3.5" y="10" width="7" height="5" rx="1.6" fill="#2B2B2B"/>'
  + '<rect x="13.5" y="10" width="7" height="5" rx="1.6" fill="#2B2B2B"/>'
  + '<path d="M10.5 11.5h3" stroke="#2B2B2B" stroke-width="1.6"/></svg>';
const partyHatIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M12 3l6 15H6z" fill="#FF6F91"/><circle cx="12" cy="3" r="1.6" fill="#FFD84D"/></svg>';

// --- catalogue -------------------------------------------------------------------------------------
// tier matches src/sim/followers.js followerMilestoneTier()'s 0..FOLLOWER_MILESTONES.length range:
// 0 = unlocked from the start, 1..4 = that many follower milestones reached.
// `price` sits in data/decor.js's own 60-900 coin band and rises with `tier` -- the boutique lets a
// player buy ahead of a follower tier they have not reached yet, so the further out a tier is, the
// more that shortcut costs. Three items per follower tier keep the same price within that tier
// (there is nothing to differentiate them on) except where a seasonal item ALSO offers a free door
// in, which does not change its boutique price -- the boutique price is what it costs to skip
// waiting on EITHER other door, follower tier or season.
export const ACCESSORIES = Object.freeze([
  { id: 'acc_bow',            name: 'Bow',            slot: 'head', tier: 0, price: 150, build: bow,          icon: bowIcon() },
  { id: 'acc_collar_tag',     name: 'Collar Tag',     slot: 'neck', tier: 0, price: 170, build: collarTag,    icon: collarTagIcon() },
  { id: 'acc_bandana_red',    name: 'Red Bandana',    slot: 'neck', tier: 0, price: 190, build: () => bandana('#E4694F'), icon: bandanaIcon('#E4694F') },
  { id: 'acc_beret',          name: 'Beret',          slot: 'head', tier: 1, price: 320, build: beret,        icon: beretIcon() },
  { id: 'acc_scarf',          name: 'Scarf',          slot: 'neck', tier: 1, price: 350, build: scarf, seasonal: true, icon: scarfIcon() },
  { id: 'acc_bandana_blue',   name: 'Blue Bandana',   slot: 'neck', tier: 1, price: 380, build: () => bandana('#6EC6FF'), icon: bandanaIcon('#6EC6FF') },
  { id: 'acc_glasses',        name: 'Round Glasses',  slot: 'head', tier: 2, price: 520, build: roundGlasses, icon: glassesIcon() },
  { id: 'acc_bell_collar',    name: 'Bell Collar',    slot: 'neck', tier: 2, price: 550, build: bellCollar,   icon: bellCollarIcon() },
  { id: 'acc_bandana_green',  name: 'Green Bandana',  slot: 'neck', tier: 2, price: 580, build: () => bandana('#7BC47F'), icon: bandanaIcon('#7BC47F') },
  { id: 'acc_flower_crown',   name: 'Flower Crown',   slot: 'head', tier: 3, price: 700, build: flowerCrown, seasonal: true, icon: flowerCrownIcon() },
  { id: 'acc_sunglasses',     name: 'Sunglasses',     slot: 'head', tier: 3, price: 730, build: sunglasses, seasonal: true, icon: sunglassesIcon() },
  { id: 'acc_party_hat',      name: 'Party Hat',      slot: 'head', tier: 4, price: 900, build: partyHat, seasonal: true, icon: partyHatIcon() },
]);

export const ACCESSORY_BY_ID = new Map(ACCESSORIES.map(item => [item.id, item]));
export const ACCESSORY_IDS = Object.freeze(ACCESSORIES.map(item => item.id));
export const ACCESSORY_ID_SET = new Set(ACCESSORY_IDS);

export function accessoryItem(id) {
  return (typeof id === 'string' && ACCESSORY_BY_ID.get(id)) || null;
}

// --- seasonal unlock (Seasons look-and-feel pass) ------------------------------------------------
// Each of the four seasons has one signature accessory (all four already existed here, three of
// them behind a follower tier -- this only ADDS a second door in, never removes the first). The
// mapping is thematic (spring flowers, summer shades, an autumn scarf, a holiday party hat) and,
// now that src/sim/seasons.js has landed (it was mid-write when this file was first drafted),
// matches its SEASON_CONTENT[id].accessoryId exactly for all four seasons -- confirmed, not
// reconciled further.
//
// This module still does NOT import src/sim/seasons.js: that module itself imports
// accessoryUnlocked from THIS file (to compute seasonAccessoryReachable), so importing it back
// would be a circular module dependency. What is read instead is meta.season = { index, dayStart },
// the exact shape src/sim/saveSchema.js's normalizeSeason() already enforces end-to-end today,
// independent of whichever module decides when `index`/`dayStart` advance -- seasons.js's own
// deriveSeasonMeta(day) produces precisely this shape.
//
// SEASON_LENGTH_DAYS below is a duplicated literal (seasons.js's own SEASON_LENGTH_DAYS, currently
// career.js WEEK_LENGTH = 7) for the same reason: importing it would close the circular loop above.
// If that cadence ever changes, this constant must move with it -- flagged in this task's
// wiringNeeded rather than silently risking drift.
//
// "Played through" a season is: SEASON_PLAYTHROUGH_DAYS elapsed since meta.season.dayStart for the
// CURRENTLY active season, or unconditionally true for any season already left behind -- including
// one from a PREVIOUS 4-season cycle (seasons repeat forever; day 35's meta.season is back to
// Blossom, index 0, but Splash/Harvest/Lights of the cycle before it are still "played", not
// "not yet reached"). `seasonCycle` below re-derives which cycle meta.season.dayStart falls in from
// the dayStart number alone, so a season index that has wrapped around never reads as unplayed.
export const SEASON_PLAYTHROUGH_DAYS = 5;
const SEASON_LENGTH_DAYS = 7; // mirrors src/sim/seasons.js SEASON_LENGTH_DAYS -- see note above.

// index = season index (0 Blossom, 1 Splash, 2 Harvest, 3 Lights).
export const SEASON_ACCESSORY_IDS = Object.freeze([
  'acc_flower_crown', // 0 Blossom -- spring flowers
  'acc_sunglasses',   // 1 Splash  -- summer shades
  'acc_scarf',        // 2 Harvest -- crisp autumn scarf
  'acc_party_hat',    // 3 Lights  -- winter holiday party
]);

// Full 4-season cycles completed strictly before the cycle meta.season.dayStart falls in (0 for
// dayStart 1-28, 1 for 29-56, ...). Mirrors seasons.js's seasonCycle(day), fed meta.season.dayStart
// itself rather than "today" -- the current season's own start day is always inside the cycle it
// belongs to, so this needs no other input.
function seasonCycleOf(dayStart) {
  return Math.floor(Math.max(0, Math.trunc(dayStart) - 1) / (SEASON_LENGTH_DAYS * SEASON_ACCESSORY_IDS.length));
}

// Whether `id` is this season's signature piece and the player has played through that season.
// `currentDay` is optional (defaults to meta.season.dayStart, i.e. "no elapsed days yet") so every
// existing call site keeps working unchanged; passing the live day is what lets the in-progress
// season actually unlock rather than only a season already left behind.
export function seasonAccessoryUnlocked(id, meta, currentDay) {
  const seasonIndex = SEASON_ACCESSORY_IDS.indexOf(id);
  if (seasonIndex < 0) return false;
  const season = meta && typeof meta === 'object' ? meta.season : null;
  if (!season || typeof season.index !== 'number' || !Number.isFinite(Number(season.dayStart))) return false;
  // At least one full cycle already finished before the current one: every season index, this one
  // included, has already had a complete occurrence, regardless of where `index` currently sits.
  if (seasonCycleOf(season.dayStart) > 0) return true;
  if (season.index > seasonIndex) return true;    // still cycle 0: an earlier season in it ended
  if (season.index !== seasonIndex) return false; // this season hasn't started yet
  const dayStart = Number(season.dayStart) || 1;
  const day = Number.isFinite(currentDay) ? currentDay : dayStart;
  return (day - dayStart) >= SEASON_PLAYTHROUGH_DAYS;
}

// Whether `meta.accessoriesBought` (src/sim/saveSchema.js normalizeAccessoriesBought) already
// names `id`. That normaliser is the enforcement point for "the boutique must be built before a
// purchase can exist" -- it drops any id a save holds without z_boutique built, exactly like
// data/decor.js's zone-gated rows -- so by the time this reads the list, membership alone is
// sufficient; this function does not need (and, being pure catalogue data with no sim import, could
// not take) a builtSet of its own.
function accessoryBought(id, meta) {
  const bought = meta && typeof meta === 'object' ? meta.accessoriesBought : null;
  return Array.isArray(bought) && bought.includes(id);
}

// Whether `id` is unlocked for a player with this `meta` -- follower tier (unchanged, see
// data/decor.js's decorUnlocked(item, builtSet) shape: item-first, gate-context second), this
// season's signature-item path, OR a boutique purchase (plan §3.5/§3.9's "alternative to
// milestones") -- whichever door the player reaches first. `currentDay` is optional and only feeds
// the seasonal path above.
export function accessoryUnlocked(id, meta, currentDay) {
  const item = accessoryItem(id);
  if (!item) return false;
  const followers = meta && typeof meta === 'object' ? meta.followers : 0;
  if (followerTierUnlocked(item.tier, followers)) return true;
  if (seasonAccessoryUnlocked(id, meta, currentDay)) return true;
  return accessoryBought(id, meta);
}

export function accessoryCatalogue(meta, currentDay) {
  return ACCESSORIES.filter(item => accessoryUnlocked(item.id, meta, currentDay));
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
