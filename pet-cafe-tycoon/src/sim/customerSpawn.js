import { makeRng } from '../core/rng.js';
import { SPECIES } from './customers.js';
import { PET_VARIANT_WEIGHTS } from './petBook.js';

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
    next() {
      const species = SPECIES[speciesIndex++ % SPECIES.length];
      const petVariant = rng.pick(PET_VARIANT_WEIGHTS); rngDraws++;
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
