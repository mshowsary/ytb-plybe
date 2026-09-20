// src/sim/petArrivals.js — WHICH pets visit, and WHEN (ship plan §1.6b).
//
// THE PROBLEM THIS FIXES. Every species spawned from day 1 and the variant bag was flat, so the
// measured save met 16 of the 20 authored pets after ~80 guests — about day 3-4 — and then the Pet
// Book, which is the hook, showed the same 16/20 for the next fifteen days. Pets are the reason to
// come back tomorrow, so they now arrive WITH THE CAFÉ:
//
//   cats + dogs   from day 1
//   bunnies       when the Pet treat bar (z_bowl) opens
//   hamsters      when the Ice cream garden (z_terrace) opens
//   legendaries   from ★3 (sim/petBook.js legendaryUnlocked, PET_LEGENDARY_PAW_STAR)
//
// AND EVERY DAY HAS A FACE. While the book is incomplete a pet nobody has met is guaranteed at
// least every second day, and a named regular comes back on the days between. On Sundays the
// guarantee becomes the Pet Parade: a legendary once ★3 is held, otherwise still an unmet pet,
// otherwise the fondest regular.
//
// PURE: no RNG, no clock, no DOM, no save writes. The plan for a day is a function of (meta, day,
// built), so systems/customers.js, tools/bot.js and node:test all derive the same face.

import { PET_PROFILES, PET_SPECIES, petKey, legendaryUnlocked, LEGENDARY_VARIANT_INDEX } from './petBook.js';

// Which build opens which species. A species with no entry here is open from day 1.
export const SPECIES_UNLOCK = Object.freeze({ bunny: 'z_bowl', hamster: 'z_terrace' });

const hasBuilt = (built, id) => {
  if (!id) return true;
  if (!built) return false;
  if (typeof built.has === 'function') return built.has(id);
  return Array.isArray(built) && built.includes(id);
};

/**
 * The species this café may currently show, in PET_SPECIES order. Never empty: cats and dogs have
 * no gate, so a null/empty built set still returns them and a headless caller that passes nothing
 * gets exactly the day-1 café.
 */
export function unlockedSpecies(built) {
  return PET_SPECIES.filter(species => hasBuilt(built, SPECIES_UNLOCK[species]));
}

/** Every pet key this café may currently meet: unlocked species, legendary coats only from ★3. */
export function unlockedPetKeys(meta, built) {
  const legendary = legendaryUnlocked(meta);
  const out = [];
  for (const species of unlockedSpecies(built)) {
    for (let variant = 0; variant < PET_PROFILES[species].length; variant++) {
      if (variant === LEGENDARY_VARIANT_INDEX && !legendary) continue;
      out.push(petKey(species, variant));
    }
  }
  return out;
}

const met = (meta, key) => !!(meta && meta.petBook && meta.petBook[key]);
const visits = (meta, key) => {
  const n = Number(meta && meta.petFriendship && meta.petFriendship[key]);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

/** The unmet keys this café could show, in catalogue order (legendaries last within a species). */
export function unmetPetKeys(meta, built) {
  return unlockedPetKeys(meta, built).filter(key => !met(meta, key));
}

/** The unmet LEGENDARY keys, in catalogue order. Empty until ★3 unlocks the coats. */
export function unmetLegendaryKeys(meta, built) {
  return unmetPetKeys(meta, built).filter(key => key.endsWith(`:${LEGENDARY_VARIANT_INDEX}`));
}

// A day is a "new face" day when the book still has someone left to meet. Odd days carry the
// guarantee, which is exactly the plan's "at least every second day" — a pet met naturally on an
// even day is a bonus on top, never a replacement.
export function isNewFaceDay(day) { return (Math.max(1, day | 0) % 2) === 1; }

// Sunday, counting the career week the same way src/sim/career.js does (weekdayIndex 6).
export function isParadeDay(day) { return ((Math.max(1, day | 0) - 1) % 7) === 6; }

/**
 * Today's guaranteed face.
 *   { key, kind }  kind is 'parade' | 'new' | 'regular', or null when the café has no face to
 *                  promise (a brand-new save on an even day has met nobody to bring back).
 *
 * Deterministic tie-breaks throughout — catalogue order for unmet pets, most-visited-then-key for
 * regulars — so the choice never depends on object insertion order and survives a save round trip.
 */
export function dailyPetPlan(meta, day, built) {
  const d = Math.max(1, day | 0);
  const unmet = unmetPetKeys(meta, built);

  if (isParadeDay(d)) {
    // THE SUNDAY PET PARADE (§1.6c.4): one guaranteed special visitor a week. A legendary first,
    // because that is the rarest thing the café can show; then any unmet pet; then the fondest
    // regular, so the parade still happens in a café whose book is already full.
    const legendary = unmetLegendaryKeys(meta, built);
    if (legendary.length) return { key: legendary[0], kind: 'parade' };
    if (unmet.length) return { key: unmet[0], kind: 'parade' };
    const regular = fondestRegular(meta, built, d);
    return regular ? { key: regular, kind: 'parade' } : null;
  }

  if (unmet.length && isNewFaceDay(d)) return { key: unmet[0], kind: 'new' };

  const regular = fondestRegular(meta, built, d);
  if (regular) return { key: regular, kind: 'regular' };
  // Nobody has ever visited (day 2 of a save whose first day was skipped): fall back to whoever is
  // still unmet rather than promising nothing at all.
  return unmet.length ? { key: unmet[0], kind: 'new' } : null;
}

/**
 * The familiar face for a day: a real Regular (2+ visits) if there is one, else anybody already
 * met, rotating by day so the same pet is not the answer every single time.
 */
export function fondestRegular(meta, built, day) {
  const familiar = unlockedPetKeys(meta, built)
    .map(key => ({ key, visits: visits(meta, key) }))
    .filter(row => row.visits > 0);
  if (!familiar.length) return null;
  const regulars = familiar.filter(row => row.visits >= 2);
  const pool = (regulars.length ? regulars : familiar)
    .sort((a, b) => b.visits - a.visits || a.key.localeCompare(b.key));
  return pool[(Math.max(1, day | 0) - 1) % pool.length].key;
}
