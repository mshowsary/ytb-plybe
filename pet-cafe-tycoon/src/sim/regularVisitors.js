// Task 34: named regulars are a cosmetic identity layer only. No wish, patience, traffic, price or
// queue value is read or written here.
import { PET_PROFILES, PET_SPECIES, petKey, isLegendaryProfile, legendaryUnlocked } from './petBook.js';

export const REGULAR_GREETING_SECONDS = 1.05;

const identityRows = keep => Object.freeze(PET_SPECIES.flatMap(species =>
  PET_PROFILES[species]
    .map((profile, variant) => ({ profile, variant }))
    .filter(({ profile }) => keep(profile))
    .map(({ variant }) => Object.freeze({ key: petKey(species, variant), species, variant }))
));

// The 16 coats any café can meet. Legendary coats are excluded HERE rather than only at the spawn
// roll because this pool is what actually decides a customer's rendered pet: resolveUniquePetIdentity's
// congestion fallback walks the entire pool when every other identity is on screen, and
// systems/customers.js renders whatever it returns. Filtering only the roll leaves that fallback
// as a working back door.
export const PET_IDENTITY_POOL = identityRows(profile => !isLegendaryProfile(profile));
// All 20, once the Paw Rating ratchet has reached ★4.
export const PET_IDENTITY_POOL_LEGENDARY = identityRows(() => true);

// WHY THE GATE IS NOT APPLIED IN THE CONSTS ABOVE: both are frozen top-level consts, evaluated once
// at import. legendaryUnlocked() now reads live meta, and this module is imported long before
// G.restore() puts a meta on the game object — so a call up here would bake in whatever the rating
// was at import time (always 0) and ★4 would unlock nothing, ever. Resolve per call, from the
// caller's meta.
const BY_KEY = new Map(PET_IDENTITY_POOL.map(row => [row.key, row]));
const BY_KEY_LEGENDARY = new Map(PET_IDENTITY_POOL_LEGENDARY.map(row => [row.key, row]));

// SPECIES GATE (ship plan §1.6b). `allowed` is sim/petArrivals.js unlockedSpecies(built): the
// species this café has opened. It is applied HERE, not only at the spawn roll, for the same reason
// the legendary gate is — resolveUniquePetIdentity's congestion fallback walks the whole pool and
// systems/customers.js renders whatever it returns, so filtering only the roll would leave the
// fallback as a working back door onto a bunny before the treat bar exists. Omitting it keeps every
// species, which is what every headless/legacy caller wants.
const speciesFilter = allowed => (Array.isArray(allowed) && allowed.length
  ? rows => rows.filter(row => allowed.includes(row.species))
  : rows => rows);

// The identities THIS save may currently meet.
export function petIdentityPool(meta, allowed = null) {
  const base = legendaryUnlocked(meta) ? PET_IDENTITY_POOL_LEGENDARY : PET_IDENTITY_POOL;
  return speciesFilter(allowed)(base);
}
function poolFor(meta, allowed = null) {
  const wide = legendaryUnlocked(meta);
  const base = wide ? PET_IDENTITY_POOL_LEGENDARY : PET_IDENTITY_POOL;
  const filtered = speciesFilter(allowed)(base);
  if (filtered.length === base.length) {
    return wide
      ? { pool: PET_IDENTITY_POOL_LEGENDARY, byKey: BY_KEY_LEGENDARY }
      : { pool: PET_IDENTITY_POOL, byKey: BY_KEY };
  }
  // A locked species must be unreachable, not merely unlikely: the map is rebuilt from the filtered
  // rows so `byKey.has()` — the gate every candidate below passes through — says no to it too.
  return { pool: filtered.length ? filtered : base, byKey: new Map((filtered.length ? filtered : base).map(row => [row.key, row])) };
}

function visitCount(meta, key) {
  const n = Number(meta?.petFriendship?.[key]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Pick one familiar face for this shift. Real Regular-tier pets (2+ visits) are preferred; before
 * that, any previously served named pet may return. A completely fresh café has no fake "welcome
 * back" moment. Sorting makes the choice independent of object insertion order and therefore save-safe.
 */
export function regularIdentityForDay(meta, day, allowed = null) {
  const familiar = petIdentityPool(meta, allowed)
    .map(row => ({ ...row, visits: visitCount(meta, row.key) }))
    .filter(row => row.visits > 0);
  if (!familiar.length) return null;
  const regulars = familiar.filter(row => row.visits >= 2);
  const pool = (regulars.length ? regulars : familiar)
    .sort((a, b) => b.visits - a.visits || a.key.localeCompare(b.key));
  const d = Math.max(1, day | 0);
  return pool[(d - 1) % pool.length];
}

/**
 * Keep simultaneous named identities unique without changing customer count or RNG consumption.
 * The preferred daily regular is tried first; then the RNG-proposed identity; then a deterministic
 * rotation through the remaining 12 authored pets. If all 12 are already active, the new pet stays
 * visually valid but anonymous (`key:null`) until it leaves—traffic is never delayed to satisfy UI.
 */
export function resolveUniquePetIdentity(proposedSpecies, proposedVariant, activeKeys = new Set(), preferredKey = null, meta = null, allowed = null) {
  // meta defaults to null so every existing caller keeps working and stays LOCKED — the safe
  // direction for a gate.
  const { pool, byKey } = poolFor(meta, allowed);
  const used = activeKeys instanceof Set ? activeKeys : new Set(activeKeys || []);
  const proposedKey = petKey(proposedSpecies, proposedVariant);
  const candidates = [];
  const add = key => { if (key && byKey.has(key) && !candidates.includes(key)) candidates.push(key); };
  add(preferredKey);
  add(proposedKey);

  const start = Math.max(0, pool.findIndex(row => row.key === proposedKey));
  for (let i = 1; i <= pool.length; i++) add(pool[(start + i) % pool.length].key);
  for (const key of candidates) {
    if (used.has(key)) continue;
    const row = byKey.get(key);
    return { ...row, named: true, preferred: key === preferredKey };
  }

  // Scoped to this save's pool, never to the 20-key map: an anonymous pick is still RENDERED by
  // systems/customers.js, so letting a locked legendary through here reopens the ★4 bypass.
  const fallback = byKey.get(proposedKey) || pool[0];
  return { ...fallback, key: null, named: false, preferred: false };
}

export function activeNamedPetKeys(customers) {
  const out = new Set();
  for (const c of customers || []) if (c && !c.done && typeof c.petIdentityKey === 'string' && c.petIdentityKey) out.add(c.petIdentityKey);
  return out;
}
