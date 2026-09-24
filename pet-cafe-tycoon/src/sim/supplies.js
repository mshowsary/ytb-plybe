// src/sim/supplies.js — the one place that knows which machine drinks which supply, how full it
// is, and where a refill is fetched from.
//
// Before this existed the knowledge was scattered and, in three places, incomplete: a supply known
// only to the pantry sheet, the carry model and the bot was invisible to the player-facing job
// detector, `canDeliverTo` did not recognise its sack (so the game sent an owner holding it to the
// RETURN crate), and `heldLabel` called every non-bean sack "kibble". Owner playtest, 2026-09-16:
// "the garden or rooftop or terrace all builds, and interactions also not working as it should".
// The ice cream machine's cream was that supply; it was cut with its cold pantry on 2026-09-19
// (docs/SHIP-PLAN-2026-09-19.md §1.2), so the machine now drinks nothing.
//
// Adding a supply-consuming machine should mean adding one row to SUPPLY_OF, LEVEL and CAP here.

/** Station type -> the supply kind it consumes. */
export const SUPPLY_OF = Object.freeze({
  coffee: 'beans',
  bowl: 'kibble',
  blender: 'fruit',
});

// Where a supply is FETCHED from decides how much walking it costs. Two of the three come to the
// machine rather than the other way round (docs/SHIP-PLAN-2026-09-19.md §1.4):
//   * the treat bowl keeps its own kibble bin, so standing at the bowl refills it and nobody walks
//     a sack across the café (the 20-unit kibble sack was bigger than the bowl's 10-unit capacity,
//     which is where the leftovers that needed a RETURN crate came from);
//   * the blender's fruit is harvested off the bushes, which the 'harvest' errand already owns.
// Only beans are still carried, in one sack that one refill uses up.
const REFILLED_IN_PLACE = Object.freeze({ bowl: true });
/** True when this machine restocks itself from its own bin: the owner only has to stand at it. */
export function refilledInPlace(st) { return !!st && !!REFILLED_IN_PLACE[st.type]; }

// Each machine keeps its consumable in a differently named field, for historical reasons that are
// not worth a migration; this is the translation table.
const LEVEL = {
  coffee: st => st.beans | 0,
  bowl: st => st.stock | 0,
  blender: st => st.fruit | 0,
};
const CAP = {
  coffee: () => 20,
  bowl: st => (st.capacity | 0) || 10,
  blender: () => 9,
};

/** The supply a station consumes, or null if it consumes none. */
export function supplyKind(st) { return st ? SUPPLY_OF[st.type] || null : null; }

// A station that consumes nothing (the garden's ice cream machine, an oven) never runs dry, so its
// level is Infinity rather than 0: any reader asking "is it out?" — the interaction coach's refill
// detector included — hears "no", instead of a missing field reading as an empty machine.
export function supplyLevel(st) { if (!st) return 0; const f = LEVEL[st.type]; return f ? f(st) : Infinity; }
export function supplyCap(st) { const f = st && CAP[st.type]; return f ? f(st) : 0; }
export function supplyRoom(st) { return SUPPLY_OF[st && st.type] ? Math.max(0, supplyCap(st) - supplyLevel(st)) : 0; }

/** An active machine that has run completely dry and cannot work until someone refills it. */
export function isStarved(st) {
  return !!st && !!st.active && !!SUPPLY_OF[st.type] && supplyLevel(st) <= 0;
}

/** Can this station take what is being carried right now? */
export function acceptsSupply(st, supply) {
  return !!st && !!st.active && SUPPLY_OF[st.type] === supply && supplyRoom(st) > 0;
}

// A pantry "supports" a supply if its DATA says so explicitly (a `supplies` list in data/area1.js)
// or, for the classic interior pantry with no `supplies` field at all, beans — the one supply
// still fetched from a pantry now the bowl has its own bin. Deliberately reads `world.area.stations` — the authored data
// createWorld was built from — because createWorld copies only a fixed field list onto each runtime
// station and `supplies` is not among them, so `st.supplies` is always undefined at runtime.
export function pantrySupports(world, st, supply) {
  if (!st || st.type !== 'pantry') return false;
  const data = world && world.area && world.area.stations && world.area.stations.find(s => s.id === st.id);
  if (data && Array.isArray(data.supplies) && data.supplies.length) return data.supplies.includes(supply);
  return supply === 'beans';
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

const IN_PLACE_SUPPLIES = new Set(Object.keys(REFILLED_IN_PLACE).map(type => SUPPLY_OF[type]));
/**
 * Where the player should go to pick this supply up, or null when there is nowhere to go because
 * the supply lives on the machine itself (kibble, in the bowl's own bin). A null answer is not a
 * failure: it is the router's cue to point straight at the machine.
 */
export function supplySource(world, supply, from = null) {
  if (supply === 'fruit') return ripeBush(world, from);
  if (IN_PLACE_SUPPLIES.has(supply)) return null;
  return pantryFor(world, supply);
}

/**
 * The supply the pantry should hand over right now: the one wanted by the neediest machine it
 * stocks, emptiest first. Standing at the pantry is the whole interaction — there is no sheet
 * (docs/SHIP-PLAN-2026-09-19.md §1.4) — so this is what decides what lands in the owner's hands.
 * Returns null when nothing the pantry stocks has room, so an idle pass-by hands over nothing.
 */
export function pantryHandout(world, pantry) {
  if (!world || !world.stations || !pantry || pantry.type !== 'pantry') return null;
  let best = null, bestFill = Infinity;
  for (const st of world.stations.values()) {
    const supply = supplyKind(st);
    if (!supply || !st.active || refilledInPlace(st)) continue;
    if (!pantrySupports(world, pantry, supply)) continue;
    if (supplyRoom(st) <= 0) continue;
    const cap = supplyCap(st) || 1;
    const fill = supplyLevel(st) / cap;
    if (fill < bestFill) { bestFill = fill; best = supply; }
  }
  return best;
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
