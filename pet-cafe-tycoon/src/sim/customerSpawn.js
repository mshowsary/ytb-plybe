import { makeRng } from '../core/rng.js';
import { SPECIES } from './customers.js';
import { PET_VARIANT_WEIGHTS } from './petBook.js';
import { weightedVariantWeights } from './followers.js';
import { legendaryUnlocked, LEGENDARY_VARIANT_INDEX } from './petBook.js';

// Browser and headless tools must consume the same spawn RNG stream. Keep the pet-variant draw
// ahead of the three human appearance draws: systems/customers.js has shipped this exact order
// since the Visitor Book work, and skipping that first draw makes a "fixed seed" bot a different
// population after the very first guest.
export const CUSTOMER_SPAWN_SEED = 20260902;

export function createCustomerSpawnSequence(seed = CUSTOMER_SPAWN_SEED) {
  const rng = makeRng(seed);
  let seq = 1;
  let speciesIndex = 0;
  let rngDraws = 0;

  return {
    // meta is optional and defaults to null, which reads as locked — tools/bot.js and the eight
    // other headless callers pass nothing and stay byte-identical.
    next(followers = 0, meta = null) {
      const species = SPECIES[speciesIndex++ % SPECIES.length];
      // A bigger following pulls rarer coats in. weightedVariantWeights only redistributes slots
      // inside a fixed-length bag, so this consumes exactly one rng draw either way and cannot
      // return an out-of-catalogue variant — the seeded stream stays identical at 0 followers.
      const petVariant = rng.pick(weightedVariantWeights(PET_VARIANT_WEIGHTS, followers, legendaryUnlocked(meta) ? LEGENDARY_VARIANT_INDEX : null)); rngDraws++;
      const variant = {
        shirt: rng.i(0, 4),
        hair: rng.i(0, 3),
        skin: rng.i(0, 2),
      };
      rngDraws += 3;
      return { id: seq++, species, petVariant, variant, rngDraws };
    },
    snapshot() {
      return { seed, nextId: seq, speciesIndex, rngDraws };
    },
  };
}
