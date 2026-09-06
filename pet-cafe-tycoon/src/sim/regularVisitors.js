// Task 34: named regulars are a cosmetic identity layer only. No wish, patience, traffic, price or
// queue value is read or written here.
import { PET_PROFILES, PET_SPECIES, petKey } from './petBook.js';

export const REGULAR_GREETING_SECONDS = 1.05;

export const PET_IDENTITY_POOL = Object.freeze(PET_SPECIES.flatMap(species =>
  PET_PROFILES[species].map((_, variant) => Object.freeze({ key: petKey(species, variant), species, variant }))
));
const BY_KEY = new Map(PET_IDENTITY_POOL.map(row => [row.key, row]));

function visitCount(meta, key) {
  const n = Number(meta?.petFriendship?.[key]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Pick one familiar face for this shift. Real Regular-tier pets (2+ visits) are preferred; before
 * that, any previously served named pet may return. A completely fresh café has no fake "welcome
 * back" moment. Sorting makes the choice independent of object insertion order and therefore save-safe.
 */
export function regularIdentityForDay(meta, day) {
  const familiar = PET_IDENTITY_POOL
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
export function resolveUniquePetIdentity(proposedSpecies, proposedVariant, activeKeys = new Set(), preferredKey = null) {
  const used = activeKeys instanceof Set ? activeKeys : new Set(activeKeys || []);
  const proposedKey = petKey(proposedSpecies, proposedVariant);
  const candidates = [];
  const add = key => { if (key && BY_KEY.has(key) && !candidates.includes(key)) candidates.push(key); };
  add(preferredKey);
  add(proposedKey);

  const start = Math.max(0, PET_IDENTITY_POOL.findIndex(row => row.key === proposedKey));
  for (let i = 1; i <= PET_IDENTITY_POOL.length; i++) add(PET_IDENTITY_POOL[(start + i) % PET_IDENTITY_POOL.length].key);
  for (const key of candidates) {
    if (used.has(key)) continue;
    const row = BY_KEY.get(key);
    return { ...row, named: true, preferred: key === preferredKey };
  }

  const fallback = BY_KEY.get(proposedKey) || PET_IDENTITY_POOL[0];
  return { ...fallback, key: null, named: false, preferred: false };
}

export function activeNamedPetKeys(customers) {
  const out = new Set();
  for (const c of customers || []) if (c && !c.done && typeof c.petIdentityKey === 'string' && c.petIdentityKey) out.add(c.petIdentityKey);
  return out;
}
