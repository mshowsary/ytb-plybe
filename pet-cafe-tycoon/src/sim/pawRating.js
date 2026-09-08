// Paw Rating ★1-★5 (plan §3.4) — the café's end goal, and the only progression axis that is about
// the PLACE rather than the wallet. Pure simulation: no DOM, no three.js, no Math.random(), no
// Date.now(). Everything it reads is passed in, so node:test and tools/bot.js see exactly what the
// game does.
//
// Two shapes a consumer must not confuse, both returned by pawRatingState():
//
//   best  — the RATCHET. The highest star ever reached, monotonically non-decreasing. THIS is the
//           rating: unlocks, effects, the Golden Paw ceremony and every gate read `best`.
//   live  — the star the CURRENT evidence derives right now. Diagnostic/progress only. It can be
//           lower than `best` and that is not a bug (see the ratchet comment below). Never gate on it.
//
// Requirements are returned as structured descriptors, never English. The star sheet renders them
// as an icon checklist and must never parse prose.

import { AREA1 } from '../../data/area1.js';
import { PET_PROFILES, PET_SPECIES, PET_BESTIE_VISITS, petKey } from './petBook.js';

// ---- catalogue -------------------------------------------------------------------------------

export const PAW_MAX_STAR = 5;
// Which star unlocks legendary coats (plan §3.7). Exported so petBook.js's `legendaryUnlocked`
// gate has one authored number to read instead of a second literal 4 in another file.
export const PAW_LEGENDARY_STAR = 4;

export const PAW_SEAT_WINDOW_DAYS = 7;     // "a 7-day window..."
export const PAW_SEAT_WINDOW_LIMIT = 3;    // "...with <= 3 missed seats"
// How many recent days the ring keeps. Two windows' worth: enough to judge the requirement and to
// survive one bad week without the save growing a per-day record for a 10,000-day account.
export const PAW_SEAT_WINDOW_KEEP = 14;

// Album `best` rank as written by systems/photo.js creditShot(): 0 Ok, 1 Good, 2 Perfect.
export const PAW_PERFECT_RANK = 2;

export const PAW_TARGETS = Object.freeze({
  served: 120,     // ★1 lifetime guests served
  besties: 1,      // ★2
  photos: 10,      // ★3 shots in the album
  seatMisses: PAW_SEAT_WINDOW_LIMIT, // ★3 (an upper bound — lower is better)
  discovered: 16,  // ★4 of the 20 authored pets
  goldCups: 1,     // ★4
  perfect: 3,      // ★5
  followers: 2000, // ★5
});

// Every authored pet key, in catalogue order. Derived from petBook.js so a fifth species or a
// sixth coat moves ★5's "every pet photographed" target with no edit here.
export const PAW_PET_KEYS = Object.freeze(
  PET_SPECIES.flatMap(species => PET_PROFILES[species].map((_, variant) => petKey(species, variant))),
);

// Icon families the star sheet draws. `id` is the stable row identity; `kind` is what to draw.
export const PAW_REQUIREMENT_KINDS = Object.freeze([
  'guests', 'zoneSet', 'bestie', 'zone', 'photos', 'seatMiss', 'petBook', 'cup', 'album', 'perfect', 'followers',
]);

// ---- effects (plan §3.4: "+10% arrivals, +1 resident slot, an awning set, a decor set") ---------
// All read `best`, never `live` — an effect that could switch off is worse than no effect.

export const PAW_ARRIVAL_BONUS_PER_STAR = 0.10;
export const PAW_RESIDENT_SLOTS_BASE = 3;
export const PAW_RESIDENT_SLOTS_MAX = 8;
export const PAW_AWNING_SETS = 6; // props.js AWNING_SETS must hold this many; index 0 is the starter.

const clampStar = star => Math.max(0, Math.min(PAW_MAX_STAR, star | 0));

export function pawArrivalMultiplier(best) { return 1 + PAW_ARRIVAL_BONUS_PER_STAR * clampStar(best); }
export function pawResidentSlots(best) { return Math.min(PAW_RESIDENT_SLOTS_MAX, PAW_RESIDENT_SLOTS_BASE + clampStar(best)); }
export function pawAwningSetIndex(best) { return Math.min(PAW_AWNING_SETS - 1, clampStar(best)); }

// The ratchet itself, for callers that only need the number (petBook.js's legendary gate, HUD).
export function pawBestStar(meta) { return clampStar(meta && meta.pawBest); }

// ---- zone catalogue introspection ---------------------------------------------------------------

const zoneList = area => (area && Array.isArray(area.zones) ? area.zones : null);

// A requirement that names content ABSENT FROM THE CATALOGUE is SKIPPED, not failed.
//
// ★4 names `z_spa`, which is Batch 4 content that does not exist yet. Read literally, ★4 would be
// unreachable — which also makes the legendary coats Batch 2 shipped (gated at ★4) dead content,
// and ★5 unreachable behind it. Failing on absent content punishes the player for a build order
// they cannot influence. So the zone is checked against the ACTUAL catalogue rather than a
// hardcoded list of which zones exist: when Batch 4 adds `z_spa` to data/area1.js the requirement
// becomes real on its own, with no edit in this file.
export function pawZoneInCatalogue(zoneId, area = AREA1) {
  const zones = zoneList(area);
  return !!zones && zones.some(zone => zone && zone.id === zoneId);
}

// "Every INTERIOR zone" (★2). A zone is REGIONAL when it opens a region (area.regions[].builtBy)
// or descends from that zone through `requires`; everything else is interior. Derived rather than
// listed, for the same reason as above: Batch 4's spa region re-partitions this automatically, and
// z_terrace — which ★3 asks for separately — is correctly excluded from ★2 today.
export function pawInteriorZoneIds(area = AREA1) {
  const zones = zoneList(area);
  if (!zones) return [];
  const regional = new Set();
  for (const region of (Array.isArray(area.regions) ? area.regions : [])) {
    if (region && typeof region.builtBy === 'string') regional.add(region.builtBy);
  }
  if (regional.size) {
    // Zones happen to be authored in dependency order, but close the set by fixpoint anyway so an
    // out-of-order catalogue cannot silently file a regional descendant under "interior".
    for (let pass = 0; pass < zones.length; pass++) {
      let grew = false;
      for (const zone of zones) {
        if (!zone || regional.has(zone.id) || !zone.requires) continue;
        if (regional.has(zone.requires)) { regional.add(zone.id); grew = true; }
      }
      if (!grew) break;
    }
  }
  return zones.filter(zone => zone && !regional.has(zone.id)).map(zone => zone.id);
}

// ---- the ★3 missed-seat window -----------------------------------------------------------------
//
// WHY A NEW META FIELD RATHER THAN EXISTING HISTORY: src/sim/career.js recordCareerShift() writes
// c.history[day] = { served, lost, earned, bestStreak, rating, contractMet, points } and
// saveSchema.normalizeCareer() rebuilds records from exactly that key set. `lost` is guests who
// gave up, which is NOT the same event as a paid guest finding no clean table
// (serviceQuality.applySeatMiss -> G.dayStats.missedSeats). dayStats.missedSeats IS saved, but only
// for the day in progress — it is reset at every shift end, so it can never carry a 7-day window.
// So no durable per-day missed-seat history exists today; meta.pawSeatWindow is the smallest thing
// that adds one.

const toDayRow = row => {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.day !== 'number' || !Number.isFinite(row.day)) return null;
  const day = Math.trunc(row.day);
  if (day < 1) return null;
  const missed = typeof row.missed === 'number' && Number.isFinite(row.missed) ? Math.trunc(row.missed) : 0;
  return { day, missed: Math.max(0, missed) };
};

function readDays(raw) {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map();
  for (const entry of raw) {
    const row = toDayRow(entry);
    if (row) byDay.set(row.day, row);
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day).slice(-PAW_SEAT_WINDOW_KEEP);
}

// Fewest missed seats across any COMPLETE run of 7 consecutive recorded days, or null when no such
// run has been recorded yet.
function bestCompleteWindow(days) {
  let best = null;
  for (let end = PAW_SEAT_WINDOW_DAYS - 1; end < days.length; end++) {
    const start = end - (PAW_SEAT_WINDOW_DAYS - 1);
    if (days[end].day - days[start].day !== PAW_SEAT_WINDOW_DAYS - 1) continue; // a gap, not a window
    let total = 0;
    for (let i = start; i <= end; i++) total += days[i].missed;
    if (best == null || total < best) best = total;
  }
  return best;
}

// Misses in the run still being accumulated, so the icon shows a live numeral before day 7.
function partialWindow(days) {
  let total = 0;
  for (let i = days.length - 1; i >= 0 && days.length - i <= PAW_SEAT_WINDOW_DAYS; i--) {
    if (i < days.length - 1 && days[i + 1].day - days[i].day !== 1) break;
    total += days[i].missed;
  }
  return total;
}

export function pawSeatWindow(meta) {
  const src = meta && typeof meta === 'object' ? meta.pawSeatWindow : null;
  const days = readDays(src && src.days);
  const live = bestCompleteWindow(days);
  // typeof, not Number(): `best: null` means "no window closed yet" and Number(null) is 0, which
  // would silently read back as a PERFECT week.
  const storedRaw = src && typeof src.best === 'number' && Number.isFinite(src.best)
    ? Math.max(0, Math.trunc(src.best))
    : null;
  // `best` is itself a ratchet, for the same reason the star is: an early clean week is a thing the
  // player DID, and a later bad week must not un-do it. Keeping only the ring would silently expire
  // the achievement the moment it rolled past 14 days.
  const best = live == null ? storedRaw : (storedRaw == null ? live : Math.min(storedRaw, live));
  return {
    days,
    best,                                   // null until a complete window exists
    current: best == null ? partialWindow(days) : best,
    complete: best != null,
    met: best != null && best <= PAW_SEAT_WINDOW_LIMIT,
  };
}

// Call once per settled shift with that shift's G.dayStats.missedSeats. Idempotent per day, like
// career.recordCareerShift, so a replayed settlement cannot double-count.
export function recordPawSeatDay(meta, day, missedSeats) {
  if (!meta || typeof meta !== 'object') return null;
  const d = Math.max(1, day | 0);
  const before = pawSeatWindow(meta);
  if (before.days.some(row => row.day === d)) return { ...before, fresh: false };
  const days = [...before.days, { day: d, missed: Math.max(0, missedSeats | 0) }]
    .sort((a, b) => a.day - b.day)
    .slice(-PAW_SEAT_WINDOW_KEEP);
  const live = bestCompleteWindow(days);
  const best = live == null ? before.best : (before.best == null ? live : Math.min(before.best, live));
  // REPLACED, never mutated in place: G.snapshot() spreads meta one level deep, so pushing into the
  // existing array would reach through the shared reference and rewrite an already-taken snapshot.
  meta.pawSeatWindow = { days, best };
  const after = pawSeatWindow(meta);
  return { ...after, fresh: true };
}

// ---- evidence ------------------------------------------------------------------------------------

const asSet = built => (built instanceof Set ? built : new Set(Array.isArray(built) ? built : []));

/**
 * Flatten everything the five tiers read into one plain record. `input`:
 *   meta   — the save meta (album, petBook, petFriendship, followers, career, pawSeatWindow, pawBest)
 *   stats  — lifetime counters; only `served` is read (G.stats.served)
 *   built  — Set|Array of built zone ids (world.built)
 *   area   — the zone/region catalogue; defaults to AREA1 (world.area at runtime)
 */
export function pawEvidence({ meta = null, stats = null, built = null, area = AREA1 } = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const builtSet = asSet(built);
  const album = m.album && typeof m.album === 'object' ? m.album : {};
  const book = m.petBook && typeof m.petBook === 'object' ? m.petBook : {};
  const friendship = m.petFriendship && typeof m.petFriendship === 'object' ? m.petFriendship : {};

  let shots = 0, photographed = 0, perfect = 0, discovered = 0, besties = 0;
  for (const key of PAW_PET_KEYS) {
    const entry = album[key];
    // The legacy Batch 0/1 album shape was a bare shot count; saveSchema still migrates it.
    const count = typeof entry === 'number' ? Math.max(0, entry | 0) : Math.max(0, (entry && entry.shots) | 0);
    if (count > 0) {
      shots += count;
      photographed++;
      // The album records only the BEST rank per pet, so "3 Perfect shots" is read as three
      // DIFFERENT pets shot Perfect — three Perfects of one pet leave no trace the save can prove.
      if (typeof entry === 'object' && (entry.best | 0) >= PAW_PERFECT_RANK) perfect++;
    }
    if (book[key]) discovered++;
    if ((friendship[key] | 0) >= PET_BESTIE_VISITS) besties++;
  }

  const career = m.career && typeof m.career === 'object' ? m.career : {};
  const trophies = career.trophies && typeof career.trophies === 'object' ? career.trophies : {};
  let goldCups = Math.max(0, trophies.gold | 0);
  // Fall back to the cup ledger when the trophy tally is missing (a meta that never met
  // career.ensureCareer), so an earned gold cup is never invisible to ★4.
  if (!goldCups && career.weeklyCups && typeof career.weeklyCups === 'object') {
    for (const cup of Object.values(career.weeklyCups)) if (cup && cup.tier === 'gold') goldCups++;
  }

  const interiorZones = pawInteriorZoneIds(area);
  let interiorBuilt = 0;
  for (const id of interiorZones) if (builtSet.has(id)) interiorBuilt++;

  return {
    area,
    builtSet,
    served: Math.max(0, (stats && stats.served) | 0),
    interiorZones,
    interiorBuilt,
    besties,
    shots,
    photographed,
    perfect,
    discovered,
    petTotal: PAW_PET_KEYS.length,
    goldCups,
    followers: Math.max(0, m.followers | 0),
    seatWindow: pawSeatWindow(m),
    storedBest: pawBestStar(m),
    goldenPaw: m.goldenPaw === true,
  };
}

// ---- requirement descriptors ---------------------------------------------------------------------
//
// One uniform shape for every row so a renderer never branches on which requirement it got:
//   star     1-5, the tier this row belongs to
//   id       stable row identity ('r3.photos')
//   kind     icon family (PAW_REQUIREMENT_KINDS)
//   zoneId   the zone a 'zone' row names, else null
//   current  progress numeral
//   target   goal numeral
//   compare  'gte' (current >= target) or 'lte' (current <= target — fewer is better)
//   met      does this row satisfy its gate
//   skipped  the row names content absent from the catalogue: draw NOTHING for it
//   pending  the row cannot be judged yet (no complete 7-day window): draw it unmet, no tick

const row = (star, id, kind, current, target, met, extra = null) => ({
  star, id, kind, zoneId: null, current, target, compare: 'gte', met, skipped: false, pending: false, ...extra,
});

function zoneRow(star, id, zoneId, ev) {
  if (!pawZoneInCatalogue(zoneId, ev.area)) {
    // Absent content: met so the tier is reachable, skipped so nothing is drawn for it.
    return row(star, id, 'zone', 0, 1, true, { zoneId, skipped: true });
  }
  return row(star, id, 'zone', ev.builtSet.has(zoneId) ? 1 : 0, 1, ev.builtSet.has(zoneId), { zoneId });
}

function tierRequirements(star, ev, opts = {}) {
  const assume = !!opts.assumeRegressible;
  if (star === 1) {
    return [row(1, 'r1.served', 'guests', ev.served, PAW_TARGETS.served, ev.served >= PAW_TARGETS.served)];
  }
  if (star === 2) {
    const total = ev.interiorZones.length;
    // No catalogue (area === null) means the zone set cannot be judged. Skip rather than fail: the
    // builds themselves were already validated wherever they came from, and a caller without an
    // area is a headless/legacy path, not a player who has built nothing.
    const zones = total === 0
      ? row(2, 'r2.interior', 'zoneSet', 0, 0, true, { skipped: true })
      : row(2, 'r2.interior', 'zoneSet', ev.interiorBuilt, total, ev.interiorBuilt >= total);
    return [zones, row(2, 'r2.bestie', 'bestie', ev.besties, PAW_TARGETS.besties, ev.besties >= PAW_TARGETS.besties)];
  }
  if (star === 3) {
    const w = ev.seatWindow;
    return [
      zoneRow(3, 'r3.terrace', 'z_terrace', ev),
      row(3, 'r3.photos', 'photos', ev.shots, PAW_TARGETS.photos, ev.shots >= PAW_TARGETS.photos),
      row(3, 'r3.seats', 'seatMiss', w.current, PAW_TARGETS.seatMisses, assume || w.met, {
        compare: 'lte', pending: !assume && !w.complete,
      }),
    ];
  }
  if (star === 4) {
    // 16 of 20 is authored as an absolute count, not a fraction: it is a "most of the book" goal,
    // and letting it scale with a future 24-pet catalogue would retroactively raise a live gate.
    const target = Math.min(PAW_TARGETS.discovered, ev.petTotal);
    return [
      zoneRow(4, 'r4.spa', 'z_spa', ev),
      row(4, 'r4.book', 'petBook', ev.discovered, target, ev.discovered >= target),
      row(4, 'r4.cup', 'cup', ev.goldCups, PAW_TARGETS.goldCups, ev.goldCups >= PAW_TARGETS.goldCups),
    ];
  }
  return [
    row(5, 'r5.album', 'album', ev.photographed, ev.petTotal, ev.photographed >= ev.petTotal),
    row(5, 'r5.perfect', 'perfect', ev.perfect, PAW_TARGETS.perfect, ev.perfect >= PAW_TARGETS.perfect),
    row(5, 'r5.followers', 'followers', ev.followers, PAW_TARGETS.followers, ev.followers >= PAW_TARGETS.followers),
  ];
}

// Rows worth drawing. Skipped rows name content that does not exist; there is no icon for them.
export function pawVisibleRequirements(requirements) {
  return (requirements || []).filter(req => req && !req.skipped);
}

function buildTiers(ev, opts) {
  const tiers = [];
  let live = 0, blocked = false;
  for (let star = 1; star <= PAW_MAX_STAR; star++) {
    const requirements = tierRequirements(star, ev, opts);
    const met = requirements.every(req => req.met);
    if (met && !blocked) live = star; else blocked = true;
    tiers.push({ star, met, requirements });
  }
  return { tiers, live };
}

// ---- public state ---------------------------------------------------------------------------------

/**
 * The whole rating in one read. See the module header for best vs live.
 * Returns:
 *   best         ratcheted star 0-5 — THE rating; drives unlocks, effects, the ceremony
 *   live         star the current evidence derives; may be < best, never gate on it
 *   next         the star being worked toward (best + 1), or null at ★5
 *   requirements descriptors for `next` (empty at ★5)
 *   tiers        all five: { star, met, reached (<= live), awarded (<= best), requirements }
 *   seatWindow   the ★3 window summary
 *   ceremonyDue  ★5 held and the Golden Paw ceremony has not run
 *   counters     the raw evidence numerals (served, shots, perfect, discovered, followers, ...)
 */
export function pawRatingState(input = {}) {
  const ev = pawEvidence(input);
  const { area: _area, builtSet: _builtSet, ...counters } = ev;
  const { tiers, live } = buildTiers(ev, {});
  // THE RATCHET. Several inputs regress: a bad week pushes the missed-seat window back over 3, and
  // Batch 4 adding z_spa would retroactively un-earn a ★4 a live player already holds. A rating
  // that falls is punishing and would ship as a visible regression, so the highest star ever
  // reached is what the game uses. `best` is computed as max(stored, live) here — so it is correct
  // even for a caller that never persists it — and applyPawRatchet() is what writes it down.
  const best = Math.max(ev.storedBest, live);
  const next = best < PAW_MAX_STAR ? best + 1 : null;
  return {
    best,
    live,
    next,
    requirements: next ? tiers[next - 1].requirements : [],
    tiers: tiers.map(tier => ({ ...tier, reached: tier.star <= live, awarded: tier.star <= best })),
    seatWindow: ev.seatWindow,
    ceremonyDue: best >= PAW_MAX_STAR && !ev.goldenPaw,
    // The raw counters, for a HUD that wants a numeral the descriptors do not carry. `area` and
    // `builtSet` are deliberately stripped: this object is small and JSON-safe, so a caller that
    // spreads it somewhere careless cannot drag the whole zone catalogue or a live Set into a save.
    counters,
  };
}

// Persist the ratchet. Writes meta.pawBest only upward. Returns the state plus `gained`, the stars
// crossed by THIS call, so presentation can celebrate exactly the new ones.
export function applyPawRatchet(input = {}) {
  const state = pawRatingState(input);
  const meta = input.meta;
  const stored = pawBestStar(meta);
  const gained = [];
  if (meta && typeof meta === 'object' && state.best > stored) {
    // A scalar on meta, so the one-level spread in G.snapshot() copies it correctly.
    meta.pawBest = state.best;
    for (let star = stored + 1; star <= state.best; star++) gained.push(star);
  }
  return { ...state, gained, changed: gained.length > 0 };
}

// ---- Golden Paw ceremony --------------------------------------------------------------------------

// Pure predicate: ★5 reached and the ceremony has not yet run. Reads the RATCHET, so a regressed
// input can never cancel a ceremony the player has earned but not yet seen.
export function goldenPawDue(meta) {
  return pawBestStar(meta) >= PAW_MAX_STAR && !(meta && meta.goldenPaw === true);
}

// Mark it fired. Returns true only on the transition, so the caller pays the follower award
// (followers.followersForGoldenPaw()) exactly once.
export function markGoldenPaw(meta) {
  if (!meta || typeof meta !== 'object' || meta.goldenPaw === true) return false;
  meta.goldenPaw = true;
  return true;
}

// ---- save boundary ---------------------------------------------------------------------------------

// The ceiling saveSchema clamps a restored meta.pawBest to: the highest star the REST of the
// already-validated save could actually have earned. A hand-edited save cannot simply declare a
// rating — an empty save's ceiling is 0.
//
// Regressible requirements are ASSUMED MET here (today: only the ★3 seat window). That is
// deliberate and is not a hole: every other input is monotonic (lifetime served, builds, Bestie
// visits, album shots, discoveries, gold cups, followers all only ever grow), each is separately
// clamped by its own normaliser, and treating the one input that CAN fall as satisfied is what
// stops the ratchet from being demoted on load by a bad week — which is the exact regression the
// ratchet exists to prevent.
export function pawEntitlementCeiling(input = {}) {
  return buildTiers(pawEvidence(input), { assumeRegressible: true }).live;
}
