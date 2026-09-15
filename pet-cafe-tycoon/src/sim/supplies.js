// src/sim/supplies.js — the one place that knows which machine drinks which supply, how full it
// is, and where a refill is fetched from.
//
// Before this existed the knowledge was scattered and, in three places, incomplete. The espresso
// machine and the treat bowl were wired end to end, but the ice cream machine's cream and the
// bath's water were known only to the pantry sheet, the carry model and the bot: the player-facing
// job detector never noticed them running dry, `canDeliverTo` did not recognise the sack, so the
// game told an owner holding cream to walk it to the RETURN crate, and `heldLabel` called every
// non-bean sack "kibble". Owner playtest, 2026-09-16: "the garden or rooftop or terrace all builds,
// and interactions also not working as it should".
//
// Adding a supply-consuming machine should mean adding one row to SUPPLY_OF, LEVEL and CAP here.
import { BATH_WATER_CAP } from './world.js';

/** Station type -> the supply kind it consumes. */
export const SUPPLY_OF = Object.freeze({
  coffee: 'beans',
  bowl: 'kibble',
  icecream: 'cream',
  bath: 'water',
  blender: 'fruit',
});

// Each machine keeps its consumable in a differently named field, for historical reasons that are
// not worth a migration; this is the translation table.
const LEVEL = {
  coffee: st => st.beans | 0,
  bowl: st => st.stock | 0,
  icecream: st => st.cream | 0,
  bath: st => st.water | 0,
  blender: st => st.fruit | 0,
};
const CAP = {
  coffee: () => 20,
  bowl: st => (st.capacity | 0) || 10,
  icecream: () => 20,
  bath: () => BATH_WATER_CAP,
  blender: () => 9,
};

/** The supply a station consumes, or null if it consumes none. */
export function supplyKind(st) { return st ? SUPPLY_OF[st.type] || null : null; }

export function supplyLevel(st) { const f = st && LEVEL[st.type]; return f ? f(st) : 0; }
export function supplyCap(st) { const f = st && CAP[st.type]; return f ? f(st) : 0; }
export function supplyRoom(st) { return Math.max(0, supplyCap(st) - supplyLevel(st)); }

/** An active machine that has run completely dry and cannot work until someone refills it. */
export function isStarved(st) {
  return !!st && !!st.active && !!SUPPLY_OF[st.type] && supplyLevel(st) <= 0;
}

/** Can this station take what is being carried right now? */
export function acceptsSupply(st, supply) {
  return !!st && !!st.active && SUPPLY_OF[st.type] === supply && supplyRoom(st) > 0;
}

// A pantry "supports" a supply if its DATA says so explicitly (coldPantry1's `supplies:['cream']`
// in data/area1.js) or, for the classic interior pantry with no `supplies` field at all, if it is
// one of the two original supplies. Deliberately reads `world.area.stations` — the authored data
// createWorld was built from — because createWorld copies only a fixed field list onto each runtime
// station and `supplies` is not among them, so `st.supplies` is always undefined at runtime.
export function pantrySupports(world, st, supply) {
  if (!st || st.type !== 'pantry') return false;
  const data = world && world.area && world.area.stations && world.area.stations.find(s => s.id === st.id);
  if (data && Array.isArray(data.supplies) && data.supplies.length) return data.supplies.includes(supply);
  return supply === 'beans' || supply === 'kibble';
}

/**
 * The pantry that hands out `supply`. With `strict`, returns null when no pantry declares it;
 * otherwise falls back to any open pantry, which is what a router wants when it would rather send
 * the player somewhere plausible than nowhere at all.
 */
export function pantryFor(world, supply, strict = false) {
  if (!world || !world.stations) return null;
  let fallback = null;
  for (const st of world.stations.values()) {
    if (!st.active || st.type !== 'pantry') continue;
    if (!fallback) fallback = st;
    if (pantrySupports(world, st, supply)) return st;
  }
  return strict ? null : fallback;
}

/** The nearest bush with ripe fruit on it — the blender's supply does not come from a pantry. */
export function ripeBush(world, from = null) {
  if (!world || !world.stations) return null;
  let best = null, bestD = Infinity;
  for (const st of world.stations.values()) {
    if (!st.active || st.type !== 'bush' || st.stage !== 3) continue;
    if (!from) return st;
    const d = (st.x - from.x) ** 2 + (st.z - from.z) ** 2;
    if (d < bestD) { bestD = d; best = st; }
  }
  return best;
}

/** Where the player should go to pick this supply up, whatever kind it is. */
export function supplySource(world, supply, from = null) {
  if (supply === 'fruit') return ripeBush(world, from);
  return pantryFor(world, supply);
}

/**
 * Every active machine that has run dry, nearest first. A dry blender only counts when its fruit is
 * actually obtainable — pointing a player at a blender when no bush is ripe is a dead end, and the
 * bushes ripen on their own, so there is nothing to nag about.
 */
export function starvedStations(world, from = null) {
  if (!world || !world.stations) return [];
  const out = [];
  for (const st of world.stations.values()) {
    if (!isStarved(st)) continue;
    if (st.type === 'blender' && !ripeBush(world, from)) continue;
    out.push(st);
  }
  if (from) {
    out.sort((a, b) => ((a.x - from.x) ** 2 + (a.z - from.z) ** 2) - ((b.x - from.x) ** 2 + (b.z - from.z) ** 2));
  }
  return out;
}
