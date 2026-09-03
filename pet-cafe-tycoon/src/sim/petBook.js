// Persistent Pet Visitor Book. Discovery is cosmetic/meta only and never gates core progression.
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
      cards.push({ key, species, variant, profile: PET_PROFILES[species][variant], found: !!meta.petBook[key] });
    }
  }
  return cards;
}
