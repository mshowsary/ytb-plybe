// src/sim/franchise.js — the Franchise prestige (plan §3.11), and the only operation in this game
// that can destroy a player's progress. Pure simulation: no DOM, no three.js, no Math.random(), no
// Date.now(). Everything it needs is passed in.
//
// WHAT "OPEN A SECOND BRANCH" IS
// A café is reset to its opening day — no builds, no coins, no staff, no station stars — and the
// OWNER keeps everything that is about them and their animals: the Pet Book, the album, the
// accessories, the followers, the residents (they visit the new branch), the décor they own, and
// the whole rating history (pawBest, goldenPaw, pawSeatWindow). In exchange the branch pays +8%
// income per franchise level, opens one more resident slot, and hangs a new colour over the door.
//
// THE ONE RULE THIS FILE IS BUILT AROUND
// The new state is CONSTRUCTED FROM A KEEP-LIST, never produced by deleting fields from the old
// one. Deletion is a blacklist, and a blacklist silently keeps whatever nobody thought about — a
// coin balance smuggled through in a field added three batches from now. A keep-list fails the
// other way: an unnamed field is DROPPED, `openFranchise` reports it in `unknown`, and
// test/franchise.test.js plus tools/franchise-smoke.mjs fail on a non-empty `unknown` against the
// real runtime snapshot. Losing a field loudly is recoverable; keeping the wrong one is not.
//
// THE MULTIPLIER IS DERIVED, NEVER DECLARED
// `meta.franchise = { level, multiplier }` where multiplier = f(level), re-derived at the save
// boundary. This is exactly the rule saveSchema.js's normalizeSeason documents and for the same
// reason: a value a save could DECLARE is a value a hand-edited save can hand itself. Level is the
// only stored number, it is bounded there, and every consumer in this file computes the multiplier
// from it rather than reading a stored one.

import { CAFE_SIGN_COLORS, followerMilestoneTier } from './followers.js';
import { STAFF } from './economy.js';

// ---- catalogue ---------------------------------------------------------------------------------

export const FRANCHISE_INCOME_PER_LEVEL = 0.08;   // plan §3.11: "+8% income per level"
export const FRANCHISE_MULTIPLIER_CAP = 1.4;      // "...bounded at +40%"
// The last level that buys anything: 1 + 0.08 x 5 = 1.4, exactly the cap. Past it a reset would
// cost a whole café and grant nothing, which is a trap rather than a prestige — so the OFFER stops
// here (see franchiseOfferable). The SAVE bound stays saveSchema's own maxFranchiseLevel: this is
// a design ceiling, not a tamper ceiling, and the two must not be confused.
export const FRANCHISE_MAX_LEVEL = Math.round(
  (FRANCHISE_MULTIPLIER_CAP - 1) / FRANCHISE_INCOME_PER_LEVEL,
);
export const FRANCHISE_RESIDENT_SLOTS_PER_LEVEL = 1;

// Strict about the type, not just the range: saveSchema's clampInt only accepts a real finite
// number, so `'3'` is not a level there and must not become one here either — a helper that was
// more generous than the boundary would grant a bonus that vanishes on the next load.
const clampLevel = level => (typeof level === 'number' && Number.isFinite(level)
  ? Math.max(0, Math.min(FRANCHISE_MAX_LEVEL, Math.trunc(level)))
  : 0);

/**
 * The income multiplier for a franchise level. Derived, capped, and rounded to whole percent so
 * two saves at the same level cannot disagree in the twelfth decimal (0.08 x 3 is 0.24000000000000002
 * in binary floating point, and that number would be written into a save and compared later).
 */
export function franchiseMultiplier(level) {
  const raw = 1 + FRANCHISE_INCOME_PER_LEVEL * clampLevel(level);
  return Math.min(FRANCHISE_MULTIPLIER_CAP, Math.round(raw * 100) / 100);
}

/** meta -> level. Null-safe: a G with no meta yet reads 0, never NaN. */
export function franchiseLevel(meta) {
  const src = meta && typeof meta === 'object' ? meta.franchise : null;
  return clampLevel(src && src.level);
}

/** The canonical persisted shape. The one place `{ level, multiplier }` is built. */
export function deriveFranchiseMeta(level) {
  const lvl = clampLevel(level);
  return { level: lvl, multiplier: franchiseMultiplier(lvl) };
}

/** What economy.salePrice's `franchiseMult` argument should be for this meta. */
export function franchiseIncomeMultiplier(meta) {
  return franchiseMultiplier(franchiseLevel(meta));
}

/** Extra resident slots this level buys, before pawRating.js's own ceiling clamps it. */
export function franchiseResidentBonus(level) {
  return clampLevel(level) * FRANCHISE_RESIDENT_SLOTS_PER_LEVEL;
}

/**
 * The café sign colour. followers.js owns the palette and the milestone tier; a branch simply reads
 * one step FURTHER along it per level, so "a new café sign colour" is a colour the player has
 * already seen the game use — a promotion up its own ladder, not a foreign swatch. Wraps, because
 * five levels on a five-colour palette would otherwise pin every branch to the last entry.
 */
export function franchiseSignColor(followers, level) {
  const index = followerMilestoneTier(followers) + clampLevel(level);
  return CAFE_SIGN_COLORS[index % CAFE_SIGN_COLORS.length];
}

// ---- the offer ---------------------------------------------------------------------------------

// Session-scoped decline. NOT a persisted field: saveSchema builds `meta` from an explicit literal,
// so this key never crosses the save boundary, and that is deliberate rather than an oversight.
// "Never forced" means never NAGGED — one decline retires the offer for the session — but it must
// not mean "declined once, gone forever": a player who says no on day 50 and wants a branch on day
// 90 has to be able to find it again, and the Golden Paw summary is the only place it is offered.
export const FRANCHISE_DECLINE_FLAG = 'franchiseDeclined';

export function franchiseDeclined(meta) {
  return !!(meta && meta[FRANCHISE_DECLINE_FLAG]);
}

/** Records the decline. A scalar on meta, which is what G.snapshot()'s one-level spread copies. */
export function declineFranchise(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (meta[FRANCHISE_DECLINE_FLAG]) return false;
  meta[FRANCHISE_DECLINE_FLAG] = true;
  return true;
}

/**
 * Whether the offer may be shown. The Golden Paw is the door (plan §3.11: "after Golden Paw"), the
 * design ceiling closes it, and a decline closes it for the session. Deliberately does NOT read the
 * live rating: the ceremony has already latched meta.goldenPaw, and a rating that dipped after a
 * bad week must not withdraw an offer the player has earned.
 */
export function franchiseOfferable(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (meta.goldenPaw !== true) return false;
  if (franchiseDeclined(meta)) return false;
  return franchiseLevel(meta) < FRANCHISE_MAX_LEVEL;
}

/** What the next branch would pay, for the offer sheet. Pure view data, no side effects. */
export function franchisePreview(meta) {
  const level = franchiseLevel(meta);
  const next = Math.min(FRANCHISE_MAX_LEVEL, level + 1);
  return {
    level,
    nextLevel: next,
    maxLevel: FRANCHISE_MAX_LEVEL,
    multiplier: franchiseMultiplier(level),
    nextMultiplier: franchiseMultiplier(next),
    residentBonus: franchiseResidentBonus(next),
    signColor: franchiseSignColor(meta && meta.followers, next),
    offerable: franchiseOfferable(meta),
  };
}

// ---- the keep/reset partition, as data -----------------------------------------------------------
//
// Three lists, exhaustive over the RUNTIME snapshot (game.js's literal plus every wrapper that adds
// to it: petFriendship's petKeepsake, staff's staffState, economyExperience's temporaryHelp,
// economicLedger's ledger, interactionCoach's learning). Anything in none of them is `unknown`, and
// `unknown` is a test failure, not a shrug.

/** Copied to the new branch verbatim (deep-cloned, never aliased). */
export const FRANCHISE_KEEP = Object.freeze([
  'v',                // schema version — structural
  'settings',         // sfx/music: a preference, never progress
  'intro',            // this owner has already been taught the game once
  'learning',         // ...and interactionCoach must not re-teach it either
  'petKeepsake',      // the first-Bestie memory: a pet's, not the building's
  'dayState',         // the calendar CONTINUES. See the note under DROP for why.
  'stats',            // lifetime totals — and load-bearing: see the warning below
  'lifetimeEarned',   // mirrors stats.lifetimeEarned; the boundary re-derives it from stats anyway
  'temporaryHelp',    // a rewarded-ad entitlement is the player's, not the café's
  'meta',             // handled field-by-field below
]);

// WHY `stats` IS IN THE KEEP LIST AND NOT THE RESET LIST — the single most dangerous line here.
// saveSchema clamps meta.pawBest to pawEntitlementCeiling(), and ★1's evidence is stats.served
// ("120 lifetime guests"). Zeroing stats therefore does not merely erase a counter: it collapses
// the restored rating to ★0 on the very next load, and with it the awning, the legendary coats, the
// resident slots and the ★-gated décor — the exact "rating history" §3.11 promises to KEEP. Lifetime
// totals are the owner's record, not the building's furniture.

/** Rebuilt from a factory: an opening café. */
export const FRANCHISE_RESET = Object.freeze([
  'coins', 'builds', 'partial', 'upgrades', 'staff', 'staffLevels', 'machineLevels', 'stars',
  'dayStats', 'ledger',
]);

/** Deliberately absent from the new state; each one's absence is a documented default. */
export const FRANCHISE_DROP = Object.freeze([
  'stationState',  // null -> stationState.js's own "historical creation defaults" for a fresh café
  'ownerState',    // null -> the owner walks in at the door carrying nothing
  'staffState',    // null -> no runners, so no runner assignments
  'boosts',        // legacy field; economyExperience deletes it from every modern snapshot
  'goal',          // applySave regenerates the contract from the day and meta
]);

// meta: everything is KEPT (that is the whole point of the prestige) except these two.
export const FRANCHISE_META_ADVANCE = Object.freeze(['franchise']);
export const FRANCHISE_META_REBUILD = Object.freeze(['partyOrders']);

const openingBuilds = (state, world) => {
  // The area id comes from the state's own builds map, falling back to the live world and then to
  // 'a1' — the same resolution order sim/save.js uses.
  const fromState = state && state.builds && typeof state.builds === 'object'
    ? Object.keys(state.builds)[0] : null;
  const areaId = fromState || (world && world.area && world.area.id) || 'a1';
  // Empty: data/area1.js's opening café is exactly the stations with no `builtBy` (one oven, the
  // cookie display, one register, the return bin, the kiosk). Nothing is bought yet.
  return { [areaId]: [] };
};

const zeroStaff = () => Object.fromEntries(Object.keys(STAFF).map(k => [k, 0]));

const RESET_FACTORY = Object.freeze({
  coins: () => 0,
  builds: openingBuilds,
  partial: () => ({}),
  upgrades: () => ({ speed: 0, carry: 0, income: 0 }),
  staff: zeroStaff,
  staffLevels: () => ({ runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } }),
  machineLevels: () => ({ oven: 0, coffee: 0, display: 0 }),
  stars: () => ({}),
  dayStats: () => ({ served: 0, lost: 0, earned: 0, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 0, specialServed: 0 }),
  // null, not a copy: sim/save.js reads a null ledger as "start a fresh reconciliation baseline from
  // the validated wallet", which is precisely right for a wallet that was just zeroed. Carrying the
  // old ledger over would have it reconcile a balance that no longer exists.
  ledger: () => null,
});

// Deep copy through JSON: every field here is already required to be JSON-serializable (it is
// handed to platform.save), and a round-trip guarantees zero aliasing with the state we were given.
// Rule 7 — nested save state is REPLACED, never mutated in place — is not satisfiable with a spread.
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Open a second branch.
 *
 * @param {object} state  a save-shaped state — G.snapshot()'s output, or a canonical save.
 * @param {object} world  the live world (optional; only its area id is read).
 * @returns {{ ok: boolean, reason?: string, save: object|null, level: number, previousLevel: number,
 *             multiplier: number, kept: string[], reset: string[], dropped: string[], unknown: string[] }}
 *
 * Pure: `state` is never touched. The caller applies `save` through the ordinary restore path
 * (G.restore), which is the one code path that rebuilds the world, the stations, the visuals and
 * the HUD together — a hand-rolled reset would have to reproduce all of it and would drift.
 */
export function openFranchise(state, world = null) {
  const empty = {
    ok: false, reason: 'state', save: null, level: 0, previousLevel: 0, multiplier: 1,
    kept: [], reset: [], dropped: [], unknown: [],
  };
  if (!state || typeof state !== 'object' || Array.isArray(state)) return empty;
  const meta = state.meta && typeof state.meta === 'object' ? state.meta : null;
  if (!meta) return { ...empty, reason: 'meta' };
  if (meta.goldenPaw !== true) return { ...empty, reason: 'goldenPaw' };
  const previousLevel = franchiseLevel(meta);
  if (previousLevel >= FRANCHISE_MAX_LEVEL) return { ...empty, reason: 'capped', previousLevel };

  const next = {};
  const kept = [], reset = [], dropped = [];

  for (const key of FRANCHISE_KEEP) {
    if (!(key in state)) continue;
    if (key === 'meta') continue; // built below, field by field
    next[key] = clone(state[key]);
    kept.push(key);
  }
  for (const key of FRANCHISE_RESET) {
    next[key] = RESET_FACTORY[key](state, world);
    reset.push(key);
  }
  for (const key of FRANCHISE_DROP) if (key in state) dropped.push(key);

  const nextMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (FRANCHISE_META_ADVANCE.includes(key) || FRANCHISE_META_REBUILD.includes(key)) continue;
    nextMeta[key] = clone(value);
  }
  nextMeta.franchise = deriveFranchiseMeta(previousLevel + 1);
  // The counters are history and stay; only the ACTIVE order is cleared. A live order for four
  // smoothies cannot be filled by a café with no blender, and leaving an unfillable chip on the HUD
  // until it expires is the closest this feature could come to punishing the player for accepting.
  if (meta.partyOrders && typeof meta.partyOrders === 'object') {
    nextMeta.partyOrders = { ...clone(meta.partyOrders), active: null };
  }
  // The decline flag is session state that never belonged in the save; a branch that was just
  // opened has certainly not been declined.
  delete nextMeta[FRANCHISE_DECLINE_FLAG];
  next.meta = nextMeta;
  kept.push('meta');

  const known = new Set([...FRANCHISE_KEEP, ...FRANCHISE_RESET, ...FRANCHISE_DROP]);
  const unknown = Object.keys(state).filter(key => !known.has(key));

  return {
    ok: true,
    save: next,
    level: previousLevel + 1,
    previousLevel,
    multiplier: franchiseMultiplier(previousLevel + 1),
    kept, reset, dropped, unknown,
  };
}
