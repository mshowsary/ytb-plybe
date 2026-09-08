// Persistent Pet Visitor Book. Discovery + friendship are cosmetic/meta only and never gate core progression.
//
// Plan §3.7 (task 2.6): a fourth species (hamster) plus one legendary coat per species (variant
// index 4) bring the book from 12 to 20 pets. Legendary spawning is gated on the Paw Rating
// reaching star 4 (plan §3.4) -- see `legendaryUnlocked` below, which Batch 3 wired to the real
// ratchet, and the identity-pool note in sim/regularVisitors.js.
export const PET_PROFILES = {
  cat: [
    { name: 'Marmalade', rarity: 'common', trait: 'Sunbeam seeker', body: '#D6A35F', belly: '#FFF0D5', accent: '#E0B34F' },
    { name: 'Tuxedo', rarity: 'common', trait: 'Counter inspector', body: '#4A4548', belly: '#FFF4E6', accent: '#E45E75' },
    { name: 'Lavender', rarity: 'rare', trait: 'Quiet-window dreamer', body: '#A89AC2', belly: '#F5ECFF', accent: '#7E6AE8' },
    { name: 'Calico', rarity: 'epic', trait: 'Treat critic', body: '#E9D5BC', belly: '#FFF4E6', accent: '#EF8B67' },
    { name: 'Nebula', rarity: 'legendary', trait: 'Midnight stargazer', body: '#2B2A4A', belly: '#F3E9FF', accent: '#FFD84D' },
  ],
  dog: [
    { name: 'Biscuit', rarity: 'common', trait: 'Everyone is a friend', body: '#C9A276', belly: '#FFF0D7', accent: '#71B8E4' },
    { name: 'Cocoa', rarity: 'common', trait: 'Chair-side napper', body: '#7B5947', belly: '#E9C8A9', accent: '#E6A742' },
    { name: 'Cloud', rarity: 'rare', trait: 'Professional greeter', body: '#E6DDD3', belly: '#FFF9F0', accent: '#E88CA6' },
    { name: 'Bluebell', rarity: 'epic', trait: 'Zoomie expert', body: '#8298AC', belly: '#EAF4FF', accent: '#8B7CF6' },
    { name: 'Comet', rarity: 'legendary', trait: 'Trail of stardust', body: '#3A4460', belly: '#EAF4FF', accent: '#FFD84D' },
  ],
  bunny: [
    { name: 'Snowdrop', rarity: 'common', trait: 'Garden watcher', body: '#EFE8E3', belly: '#FFC5D2', accent: '#D99BE8' },
    { name: 'Mocha', rarity: 'common', trait: 'Crumb detective', body: '#A77B63', belly: '#EBC9B2', accent: '#E7A644' },
    { name: 'Lilac', rarity: 'rare', trait: 'Soft-seat connoisseur', body: '#C8B8DD', belly: '#F2D8EA', accent: '#8B7CF6' },
    { name: 'Honey', rarity: 'epic', trait: 'Tiny café celebrity', body: '#E7C47E', belly: '#FFF0D0', accent: '#D99542' },
    { name: 'Aurora', rarity: 'legendary', trait: 'Borealis dreamer', body: '#EDEAFB', belly: '#FFFFFF', accent: '#8B7CF6' },
  ],
  hamster: [
    { name: 'Peanut', rarity: 'common', trait: 'Cheek-pouch hoarder', body: '#C9955B', belly: '#FFE9C6', accent: '#B9834A' },
    { name: 'Clove', rarity: 'common', trait: 'Wheel-spin champion', body: '#6E4B39', belly: '#E9C9A9', accent: '#8E6236' },
    { name: 'Marble', rarity: 'rare', trait: 'Tunnel architect', body: '#B5A8C7', belly: '#F1EAF7', accent: '#8B7CF6' },
    { name: 'Saffron', rarity: 'epic', trait: 'Sunflower-seed connoisseur', body: '#E8A83C', belly: '#FFF3D0', accent: '#C9781E' },
    { name: 'Cosmo', rarity: 'legendary', trait: 'Nebula napper', body: '#4B3F72', belly: '#FDEBC8', accent: '#FFD84D' },
  ],
};

export const PET_SPECIES = ['cat', 'dog', 'bunny', 'hamster'];
// A rng.pick() "bag": each authored value is a variant INDEX, repeated by relative pick weight.
// Deliberately contains only 0-3 -- index 4 (every species' legendary coat) can never be drawn by
// this bag no matter how it is reweighted by followers (src/sim/followers.js
// weightedVariantWeights only ever redistributes counts between EXISTING tier values). That is
// half of the legendary gate; see `legendaryUnlocked` for the half this module owns directly, and
// its comment for the one spawn path that bypasses both.
export const PET_VARIANT_WEIGHTS = [0, 0, 0, 1, 1, 1, 2, 2, 3];
export const PET_KEEPSAKE_VERSION = 1;

// Every species now authors exactly 5 profiles (4 base + 1 legendary at index 4).
export const LEGENDARY_VARIANT_INDEX = 4;

// The Paw Rating star that unlocks legendary coats (plan §3.4/§3.7).
//
// DUPLICATED FROM pawRating.js's PAW_LEGENDARY_STAR, NOT IMPORTED, and that is deliberate:
// pawRating.js imports THIS module (PET_SPECIES/PET_PROFILES/petKey feed its top-level
// PAW_PET_KEYS), so importing it back would close a cycle whose outcome depends on which file the
// entry point reaches first -- a petBook-first entry evaluates pawRating's body while PET_SPECIES
// is still in TDZ and throws at load. petBook.js is a leaf with zero imports and stays one.
// test/paw-rating-effects.test.js asserts the two numbers are equal so they cannot drift apart.
export const PET_LEGENDARY_PAW_STAR = 4;

// Batch 3 wired this to the real rating. Reads meta.pawBest -- the RATCHET, the highest star ever
// reached -- and NOT a live re-derivation: a coat that appeared at ★4 and vanished after a bad
// week would read as content being taken away. meta.pawBest is clamped 0..5 at the save boundary
// (saveSchema.js, against pawEntitlementCeiling), so a hand-edited save cannot simply declare it.
//
// A no-argument call (sim/completion.js does one) is false, which is the safe direction: it treats
// legendaries as still locked rather than unlocking them for a caller that has no save to check.
//
// This predicate alone does NOT decide who walks in. sim/regularVisitors.js chooses the rendered
// identity, and its pool must be resolved per call from live meta -- see the note there.
export function legendaryUnlocked(meta) {
  return (meta && typeof meta === 'object' ? meta.pawBest | 0 : 0) >= PET_LEGENDARY_PAW_STAR;
}

export function isLegendaryProfile(profile) {
  return !!profile && profile.rarity === 'legendary';
}

// Relationship pacing is intentionally short enough to become visible during normal repeat play,
// but it never modifies prices, patience, spawn odds, navigation or ad availability.
export const PET_FRIENDSHIP_TIERS = [
  { level: 0, label: 'New Face', minVisits: 0 },
  { level: 1, label: 'Regular', minVisits: 2 },
  { level: 2, label: 'Friend', minVisits: 5 },
  { level: 3, label: 'Bestie', minVisits: 10 },
];
export const PET_BESTIE_VISITS = PET_FRIENDSHIP_TIERS[PET_FRIENDSHIP_TIERS.length - 1].minVisits;

export function petKey(species, variant) {
  const maxVariant = (PET_PROFILES[species] || PET_PROFILES.cat).length - 1;
  return `${species}:${Math.max(0, Math.min(maxVariant, variant | 0))}`;
}

export function petProfile(species, variant) {
  const arr = PET_PROFILES[species] || PET_PROFILES.cat;
  return arr[Math.max(0, Math.min(arr.length - 1, variant | 0))];
}

export function parsePetKey(key) {
  if (typeof key !== 'string') return null;
  const match = /^(cat|dog|bunny|hamster):(\d+)$/.exec(key);
  if (!match) return null;
  const species = match[1], variant = Number(match[2]);
  if (!Number.isInteger(variant) || variant < 0 || variant >= PET_PROFILES[species].length) return null;
  return { key: `${species}:${variant}`, species, variant, profile: PET_PROFILES[species][variant] };
}

export function ensurePetBook(meta) {
  if (!meta || typeof meta !== 'object') return;
  if (!meta.petBook || typeof meta.petBook !== 'object') meta.petBook = {};
  if (!meta.petFriendship || typeof meta.petFriendship !== 'object') meta.petFriendship = {};
  // Sanitize malformed/newer save values so friendship can never turn into an economy-sized number.
  for (const [key, value] of Object.entries(meta.petFriendship)) {
    const visits = Math.max(0, Math.min(9999, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0));
    if (visits) meta.petFriendship[key] = visits;
    else delete meta.petFriendship[key];
  }
  meta.petDiscoveries = Math.max(0, meta.petDiscoveries | 0);
}

export function discoverPet(meta, species, variant) {
  ensurePetBook(meta);
  const key = petKey(species, variant);
  const profile = petProfile(species, variant);
  if (meta.petBook[key]) return { isNew: false, key, profile, species, variant: variant | 0 };
  meta.petBook[key] = 1;
  meta.petDiscoveries = Object.keys(meta.petBook).length;
  return { isNew: true, key, profile, species, variant: variant | 0 };
}

function friendshipFromVisits(visits) {
  visits = Math.max(0, visits | 0);
  let tier = PET_FRIENDSHIP_TIERS[0];
  for (const candidate of PET_FRIENDSHIP_TIERS) if (visits >= candidate.minVisits) tier = candidate;
  const next = PET_FRIENDSHIP_TIERS[tier.level + 1] || null;
  const base = tier.minVisits;
  const needed = next ? Math.max(1, next.minVisits - base) : 0;
  const current = next ? Math.max(0, visits - base) : 0;
  return {
    visits,
    level: tier.level,
    label: tier.label,
    nextLabel: next ? next.label : null,
    current,
    needed,
    frac: next ? Math.max(0, Math.min(1, current / needed)) : 1,
    max: !next,
  };
}

export function petFriendship(meta, species, variant) {
  ensurePetBook(meta);
  const key = petKey(species, variant);
  return friendshipFromVisits(meta.petFriendship[key] | 0);
}

export function recordPetVisit(meta, species, variant) {
  ensurePetBook(meta);
  const discovery = discoverPet(meta, species, variant);
  const key = discovery.key;
  const before = friendshipFromVisits(meta.petFriendship[key] | 0);
  const visits = Math.min(9999, (meta.petFriendship[key] | 0) + 1);
  meta.petFriendship[key] = visits;
  const friendship = friendshipFromVisits(visits);
  return {
    ...discovery,
    friendship,
    previousLevel: before.level,
    promoted: friendship.level > before.level,
  };
}

// Task 36: one persistent physical memory, deliberately NOT another collection/currency system.
// Old saves that already contain Besties deterministically choose the first authored profile order.
export function firstBestieKey(meta) {
  ensurePetBook(meta);
  if (!meta?.petFriendship) return null;
  for (const species of PET_SPECIES) {
    for (let variant = 0; variant < PET_PROFILES[species].length; variant++) {
      const key = petKey(species, variant);
      if ((meta.petFriendship[key] | 0) >= PET_BESTIE_VISITS) return key;
    }
  }
  return null;
}

export function normalizePetKeepsake(raw, meta = null) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.v === PET_KEEPSAKE_VERSION) {
    const parsed = parsePetKey(raw.key);
    // The host save boundary supplies canonical friendship evidence. A syntactically valid but
    // unearned portrait ID is still discarded; only a genuine Bestie may own this wall memory.
    if (parsed && (!meta || (meta.petFriendship?.[parsed.key] | 0) >= PET_BESTIE_VISITS)) {
      return { v: PET_KEEPSAKE_VERSION, key: parsed.key };
    }
  }
  const legacy = meta ? firstBestieKey(meta) : null;
  return legacy ? { v: PET_KEEPSAKE_VERSION, key: legacy } : null;
}

export function awardFirstBestieKeepsake(current, key) {
  const existing = normalizePetKeepsake(current);
  if (existing) return { changed: false, data: existing };
  const parsed = parsePetKey(key);
  if (!parsed) return { changed: false, data: null };
  return { changed: true, data: { v: PET_KEEPSAKE_VERSION, key: parsed.key } };
}

export function petBookProgress(meta) {
  ensurePetBook(meta);
  const found = Object.keys(meta.petBook).filter(k => meta.petBook[k]).length;
  const total = PET_SPECIES.reduce((n, s) => n + PET_PROFILES[s].length, 0);
  return { found, total, frac: total ? found / total : 0 };
}

export function allPetCards(meta) {
  ensurePetBook(meta);
  const cards = [];
  for (const species of PET_SPECIES) {
    for (let variant = 0; variant < PET_PROFILES[species].length; variant++) {
      const key = petKey(species, variant);
      cards.push({
        key,
        species,
        variant,
        profile: PET_PROFILES[species][variant],
        found: !!meta.petBook[key],
        friendship: friendshipFromVisits(meta.petFriendship[key] | 0),
      });
    }
  }
  return cards;
}
