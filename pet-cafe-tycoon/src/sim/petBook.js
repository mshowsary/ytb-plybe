// Persistent Pet Visitor Book. Discovery + friendship are cosmetic/meta only and never gate core progression.
export const PET_PROFILES = {
  cat: [
    { name: 'Marmalade', rarity: 'common', trait: 'Sunbeam seeker', body: '#D6A35F', belly: '#FFF0D5', accent: '#E0B34F' },
    { name: 'Tuxedo', rarity: 'common', trait: 'Counter inspector', body: '#4A4548', belly: '#FFF4E6', accent: '#E45E75' },
    { name: 'Lavender', rarity: 'rare', trait: 'Quiet-window dreamer', body: '#A89AC2', belly: '#F5ECFF', accent: '#7E6AE8' },
    { name: 'Calico', rarity: 'epic', trait: 'Treat critic', body: '#E9D5BC', belly: '#FFF4E6', accent: '#EF8B67' },
  ],
  dog: [
    { name: 'Biscuit', rarity: 'common', trait: 'Everyone is a friend', body: '#C9A276', belly: '#FFF0D7', accent: '#71B8E4' },
    { name: 'Cocoa', rarity: 'common', trait: 'Chair-side napper', body: '#7B5947', belly: '#E9C8A9', accent: '#E6A742' },
    { name: 'Cloud', rarity: 'rare', trait: 'Professional greeter', body: '#E6DDD3', belly: '#FFF9F0', accent: '#E88CA6' },
    { name: 'Bluebell', rarity: 'epic', trait: 'Zoomie expert', body: '#8298AC', belly: '#EAF4FF', accent: '#8B7CF6' },
  ],
  bunny: [
    { name: 'Snowdrop', rarity: 'common', trait: 'Garden watcher', body: '#EFE8E3', belly: '#FFC5D2', accent: '#D99BE8' },
    { name: 'Mocha', rarity: 'common', trait: 'Crumb detective', body: '#A77B63', belly: '#EBC9B2', accent: '#E7A644' },
    { name: 'Lilac', rarity: 'rare', trait: 'Soft-seat connoisseur', body: '#C8B8DD', belly: '#F2D8EA', accent: '#8B7CF6' },
    { name: 'Honey', rarity: 'epic', trait: 'Tiny café celebrity', body: '#E7C47E', belly: '#FFF0D0', accent: '#D99542' },
  ],
};

export const PET_SPECIES = ['cat', 'dog', 'bunny'];
export const PET_VARIANT_WEIGHTS = [0, 0, 0, 1, 1, 1, 2, 2, 3];

// Relationship pacing is intentionally short enough to become visible during normal repeat play,
// but it never modifies prices, patience, spawn odds, navigation or ad availability.
export const PET_FRIENDSHIP_TIERS = [
  { level: 0, label: 'New Face', minVisits: 0 },
  { level: 1, label: 'Regular', minVisits: 2 },
  { level: 2, label: 'Friend', minVisits: 5 },
  { level: 3, label: 'Bestie', minVisits: 10 },
];

export function petKey(species, variant) {
  return `${species}:${Math.max(0, Math.min(3, variant | 0))}`;
}

export function petProfile(species, variant) {
  const arr = PET_PROFILES[species] || PET_PROFILES.cat;
  return arr[Math.max(0, Math.min(arr.length - 1, variant | 0))];
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
