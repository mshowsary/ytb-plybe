// src/systems/starRewards.js — what a Café Star actually HANDS BACK (ship plan §1.6a).
//
// A star used to be a number that went up. Every one of the five now changes something the player
// can see in the café, and this is the one place that makes it happen, called from the one place a
// star can be earned (src/game.js openDaySummary, right after applyPawRatchet reports which stars
// this settlement crossed).
//
//   ★1  a cat moves in — the first EARNED resident, on top of the one the café opened with —
//       and the awning changes colour.
//   ★2  a décor set goes on sale in the Shop, arrivals rise 10% — and a Cleaner joins, free.
//       The helper is not a garnish: measured over 60 days with the Pet Book actually filling, the
//       arrivals bonus alone pushed guests who gave up on a table from 0.011 to 0.031 per guest,
//       three times past the quiet gate, because more guests meet the same four tables. A star that
//       brings custom has to bring the hands to turn the tables over with it.
//   ★3  legendary pets start visiting, and café theme 1 goes on sale.
//   ★4  one more resident slot, and themes 2-5 go on sale.
//   ★5  the Golden Paw ceremony (systems/goldenPaw.js watches the rating itself and runs it during
//       the closing phase, so this file only records that the star landed).
//
// WHERE EACH ONE IS ACTUALLY APPLIED — every reward already has a live consumer, and this function
// is the missing writer for the two that had none:
//   awning       src/game.js update(): pawAwningSetIndex(pawBestStar(meta)) -> G.awning.setSet()
//   arrivals     sim/economy.js effectiveSpawnInterval({ pawStars }) <- systems/customers.js
//   décor set    data/decor.js decorUnlocked(item, built, bestStar) <- the Shop's Décor tab
//   legendaries  sim/petBook.js legendaryUnlocked(meta) (PET_LEGENDARY_PAW_STAR = 3)
//   themes       sim/career.js renovationState(meta, coins, bestStar) <- the Café Stars sheet
//   RESIDENTS    *this file* — admitResident()/reconcileResidents(), the two calls that had no
//                caller for a star before Batch E1 (only a Bestie promotion ever admitted anyone,
//                so ★1's "a cat moves in" and ★4's extra slot delivered nothing).
//
// The resident it admits walks in on its own the next morning: systems/residentPets.js reconciles
// its on-screen roster against meta.residents at the day tick, exactly as it does for a Bestie.
import { admitResident, reconcileResidents, currentResidentStars } from './residentPets.js';
import { WORKER_UPGRADES } from '../sim/economyConfig.js';
import { PET_PROFILES, PET_SPECIES, petKey } from '../sim/petBook.js';
import { PAW_MAX_STAR } from '../sim/pawRating.js';

// Who moves in for each star, in order. Common coats only, and deliberately not the pet the café
// opened with: a star must add a face, not re-announce one. If a key is already resident (the
// player befriended it first), the next unused authored key is taken instead, so a star never
// silently admits nobody.
export const STAR_RESIDENT_ORDER = Object.freeze(['dog:0', 'cat:1', 'bunny:0', 'dog:1', 'hamster:0']);

function fallbackResidentKeys() {
  const out = [];
  for (const species of PET_SPECIES) {
    for (let variant = 0; variant < PET_PROFILES[species].length - 1; variant++) out.push(petKey(species, variant));
  }
  return out;
}

// The star that raises arrivals (sim/pawRating.js PAW_ARRIVAL_STAR) also hires the café's first
// Cleaner. If one is already on the payroll the gift is a level on that ladder instead, so the
// reward is never nothing — and never a second body the player did not ask for.
export const PAW_HELPER_STAR = 2;
export function grantHelper(G) {
  if (!G || !G.staff) return null;
  if ((G.staff.cleaner | 0) <= 0) { G.staff.cleaner = 1; return 'cleaner'; }
  const levels = G.staffLevels && G.staffLevels.cleaner;
  const cap = (WORKER_UPGRADES.speed || []).length;   // the authored ladder, not the endless tail
  if (levels && (levels.speed | 0) < cap) { levels.speed = (levels.speed | 0) + 1; return 'cleanerSpeed'; }
  return null;
}

/** The key a star should admit, given who already lives here. null when everyone authored is in. */
export function residentForStar(meta, star) {
  const have = new Set(Array.isArray(meta && meta.residents) ? meta.residents : []);
  const preferred = STAR_RESIDENT_ORDER[Math.max(0, (star | 0) - 1)];
  if (preferred && !have.has(preferred)) return preferred;
  for (const key of STAR_RESIDENT_ORDER) if (!have.has(key)) return key;
  for (const key of fallbackResidentKeys()) if (!have.has(key)) return key;
  return null;
}

/**
 * Apply every reward for the stars in `gained` (applyPawRatchet's list, ascending).
 * Returns one record per star so the caller can celebrate exactly what landed:
 *   { star, resident: key|null, slots: boolean, ceremony: boolean }
 * Pure apart from the meta it is handed — no DOM, no three.js — so a test can assert the effects.
 */
export function applyStarRewards(G, gained) {
  const out = [];
  if (!G || !G.meta || !Array.isArray(gained) || !gained.length) return out;
  const meta = G.meta;
  for (const raw of gained) {
    const star = Math.max(1, Math.min(PAW_MAX_STAR, raw | 0));
    // The slot count is read from the ratchet, which applyPawRatchet has already written, so the
    // cap this admission is checked against is the one the new star just widened.
    const stars = currentResidentStars(G);
    const key = residentForStar(meta, star);
    const resident = key && admitResident(meta, key, stars) ? key : null;
    // ...and ★4's extra slot may also let an already-earned Bestie in who had nowhere to sit.
    reconcileResidents(meta, stars);
    const helper = star === PAW_HELPER_STAR ? grantHelper(G) : null;
    out.push({ star, resident, slots: stars, helper, ceremony: star >= PAW_MAX_STAR });
  }
  return out;
}
