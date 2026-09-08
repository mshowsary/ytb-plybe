// Followers (plan 3.3): an audience the player earns one photo/discovery/Bestie at a time, which
// in turn makes the café busier and its guests rarer. Pure simulation helpers only -- safe in
// node:test/headless bot, no Math.random()/Date.now(), no DOM.
//
// This module owns two kinds of function:
//   - SOURCES: how many followers one event is worth (callers add the result to meta.followers,
//     itself clamped by saveSchema.SAVE_LIMITS.maxFollowers on every save/load).
//   - EFFECTS: derived, read-only multipliers/weightings a caller recomputes fresh every frame from
//     the current follower count. NEVER cache or persist an effect's output -- only the follower
//     count itself is saved state.
//
// economy.js (spawnInterval) and petBook.js (PET_VARIANT_WEIGHTS) are owned by other agents; this
// module exports the pure math they need but does not import or call into either, so the actual
// wiring is listed in the owning task's handoff instead of edited here.

// ---- bounds ----------------------------------------------------------------------------------

// Mirrors src/sim/saveSchema.js SAVE_LIMITS.maxFollowers. Duplicated as a literal (not imported)
// so this module stays a leaf with zero dependencies -- saveSchema already re-derives its own
// ceiling independently at the save boundary, which is the one that actually protects restore.
export const FOLLOWER_CAP = 1_000_000;

export function clampFollowers(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(FOLLOWER_CAP, Math.trunc(n)));
}

// ---- sources: how a follower delta is earned --------------------------------------------------

export const FOLLOWER_SOURCES = Object.freeze({
  firstPhoto: 10,   // first photo ever taken of a given pet
  perfectShot: 3,   // a Perfect-scored shot, ON TOP of the first-photo/other-shot base award
  otherShot: 1,     // any non-first photo of an already-photographed pet
  firstDiscovery: 5, // first time a pet is met at all (petBook discovery, independent of photos)
  bestie: 15,        // a pet reaches the Bestie friendship tier
  goldenPaw: 200,    // the once-per-save Golden Paw ceremony (plan 3.4)
});

// A photo's follower award. `isFirstPhotoOfPet` and `isPerfect` are independent flags -- a Perfect
// shot of a never-before-photographed pet earns both the first-photo base AND the Perfect bonus,
// reading the plan's list ("first photo +10; Perfect +3; otherwise +1") as additive sources rather
// than a single exclusive tier.
export function followersForShot({ isFirstPhotoOfPet = false, isPerfect = false } = {}) {
  let gained = isFirstPhotoOfPet ? FOLLOWER_SOURCES.firstPhoto : FOLLOWER_SOURCES.otherShot;
  if (isPerfect) gained += FOLLOWER_SOURCES.perfectShot;
  return gained;
}

export function followersForDiscovery() { return FOLLOWER_SOURCES.firstDiscovery; }
export function followersForBestie() { return FOLLOWER_SOURCES.bestie; }
export function followersForGoldenPaw() { return FOLLOWER_SOURCES.goldenPaw; }

// Convenience for callers that just want the next clamped total; never goes negative or over cap.
export function addFollowers(current, delta) {
  return clampFollowers(clampFollowers(current) + Math.max(0, Math.trunc(delta) || 0));
}

// ---- effect: spawn pacing ----------------------------------------------------------------------

const SPAWN_FOLLOWER_DIVISOR = 4000;
const SPAWN_MAX_CUT = 0.5;

// 1 / (1 + min(0.5, followers / 4000)): a busier café as followers grow, hard-capped so the
// interval can never fall below 2/3 of its base value (multiplier floor 1 / 1.5).
// Wiring: systems/customers.js multiplies economy.spawnInterval(...)'s result by this.
export function spawnIntervalMultiplier(followers) {
  const cut = Math.min(SPAWN_MAX_CUT, clampFollowers(followers) / SPAWN_FOLLOWER_DIVISOR);
  return 1 / (1 + cut);
}

// ---- effect: rare-pet weighting -----------------------------------------------------------------

const RARITY_STEP_FOLLOWERS = 500;

// PET_VARIANT_WEIGHTS (petBook.js) is an authored "bag" -- an array whose repeated values encode
// relative pick probability for rng.pick (e.g. [0,0,0,1,1,1,2,2,3] = 3 parts variant 0, 3 parts
// variant 1, 2 parts variant 2, 1 part variant 3/epic). "Shift one step toward rare/epic per 500
// followers" is implemented as: every 500 followers, move ONE bag slot from the lowest tier that
// still holds more than one slot up to its next-rarer neighbour, stopping once the rarest tier's
// slot count reaches 3x its authored value (the plan's "capped at the epic weight x3") or nothing
// is left to redistribute. The bag's total length never changes, so this can only ever redistribute
// existing probability mass, never invent a pick outside the authored variant list.
// Wiring: customerSpawn.js calls rng.pick(weightedVariantWeights(PET_VARIANT_WEIGHTS, followers))
// in place of rng.pick(PET_VARIANT_WEIGHTS).
// legendaryVariant is the variant index to admit once the ★4 gate is open, or null while it is
// shut. It is PASSED IN rather than imported so this module stays the zero-dependency leaf its
// header promises, and so there is still exactly one source of truth for the index itself
// (petBook.LEGENDARY_VARIANT_INDEX, resolved by the caller).
//
// It appends that variant to the bag once — one slot in ten, so a legendary coat is about as common
// as an epic was before it. Without this the ★4 reward is unreachable in practice: the authored bag
// tops out at variant 3 and this function only ever redistributes values already present, so a
// legendary could otherwise appear only through resolveUniquePetIdentity's congestion fallback,
// which needs 17+ named guests on screen at once.
export function weightedVariantWeights(baseWeights, followers, legendaryVariant = null) {
  if (!Array.isArray(baseWeights) || baseWeights.length < 2) {
    return Array.isArray(baseWeights) ? baseWeights.slice() : baseWeights;
  }
  if (Number.isInteger(legendaryVariant)) {
    const withLegendary = weightedVariantWeights(baseWeights, followers, null);
    withLegendary.push(legendaryVariant);
    return withLegendary;
  }
  const tiers = [...new Set(baseWeights)].sort((a, b) => a - b);
  if (tiers.length < 2) return baseWeights.slice();

  const counts = new Map();
  for (const w of baseWeights) counts.set(w, (counts.get(w) || 0) + 1);

  const topTier = tiers[tiers.length - 1];
  const topCap = counts.get(topTier) * 3;
  let steps = Math.floor(clampFollowers(followers) / RARITY_STEP_FOLLOWERS);

  while (steps-- > 0 && counts.get(topTier) < topCap) {
    let fromIndex = -1;
    for (let i = 0; i < tiers.length - 1; i++) {
      if ((counts.get(tiers[i]) || 0) > 1) { fromIndex = i; break; }
    }
    if (fromIndex === -1) break; // every lower tier is already down to its last slot
    const fromTier = tiers[fromIndex], toTier = tiers[fromIndex + 1];
    counts.set(fromTier, counts.get(fromTier) - 1);
    counts.set(toTier, (counts.get(toTier) || 0) + 1);
  }

  const out = [];
  for (const tier of tiers) for (let i = 0, n = counts.get(tier) || 0; i < n; i++) out.push(tier);
  return out;
}

// ---- effect: milestones --------------------------------------------------------------------------

export const FOLLOWER_MILESTONES = Object.freeze([100, 500, 2000, 5000]);

// Palette a render agent can index by tier for the café-sign colour (plan 3.3). Purely decorative
// data -- no side effects, no DOM/three.js references, so it stays safe to import anywhere.
export const CAFE_SIGN_COLORS = Object.freeze(['#caa46b', '#7fc8a9', '#6fa8dc', '#c58af2', '#ffcf5c']);

// 0 (below the first milestone) .. FOLLOWER_MILESTONES.length (every milestone reached).
export function followerMilestoneTier(followers) {
  const f = clampFollowers(followers);
  let tier = 0;
  for (const m of FOLLOWER_MILESTONES) if (f >= m) tier++;
  return tier;
}

export function cafeSignColor(followers) {
  return CAFE_SIGN_COLORS[followerMilestoneTier(followers)];
}

// The next unreached milestone, or null once every tier is unlocked.
export function nextFollowerMilestone(followers) {
  const f = clampFollowers(followers);
  for (const m of FOLLOWER_MILESTONES) if (f < m) return m;
  return null;
}

// Whether an accessory/decor tier gated at `tierIndex` (0-based, matching followerMilestoneTier)
// is unlocked by the current follower count. Wiring: data/accessories.js catalogue entries carry a
// `tier` field once that module lands; the album/accessory-picker UI calls this per entry.
export function followerTierUnlocked(tierIndex, followers) {
  return followerMilestoneTier(followers) >= Math.max(0, tierIndex | 0);
}
