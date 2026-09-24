import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { RENOVATIONS } from '../src/sim/career.js';
import {
  PAW_MAX_STAR, PAW_PET_KEYS, PAW_SEAT_WINDOW_DAYS, PAW_SEAT_WINDOW_KEEP, PAW_TARGETS,
  applyPawRatchet, goldenPawDue, markGoldenPaw, pawArrivalMultiplier, pawBestStar,
  pawEntitlementCeiling, pawEvidence, pawInteriorZoneIds, pawRatingState, pawResidentSlots,
  pawSeatWindow, pawVisibleRequirements, pawZoneInCatalogue, recordPawSeatDay,
} from '../src/sim/pawRating.js';
import { validateAndMigrateSave } from '../src/sim/saveSchema.js';

// --- fixtures -------------------------------------------------------------------------------

const INTERIOR = pawInteriorZoneIds(AREA1);

// A synthetic second region chain (shaped like the retired Pet Spa): a zone that opens an east
// region, appended after the terrace. Nothing in the rating names it; it proves the interior /
// regional split re-partitions itself with no edit in pawRating.js.
const EAST_AREA = {
  ...AREA1,
  zones: [...AREA1.zones, { id: 'z_east', x: 12, z: 0, price: 45000, requires: 'z_terrace', label: 'East wing' }],
  regions: [...AREA1.regions, { id: 'east', x0: 10, x1: 17.5, z0: -7, z1: 7, builtBy: 'z_east', floor: 'tile' }],
};
// "Absent content": a catalogue that has not authored the terrace chain yet (and so no terrace
// region). ★3's r3.terrace is the rating's one zone row, so this is what exercises the skip rule.
const TERRACE_CHAIN = new Set(['z_terrace']);
for (let pass = 0; pass < AREA1.zones.length; pass++) {
  for (const z of AREA1.zones) if (z.requires && TERRACE_CHAIN.has(z.requires)) TERRACE_CHAIN.add(z.id);
}
const NO_TERRACE_AREA = { ...AREA1, zones: AREA1.zones.filter(z => !TERRACE_CHAIN.has(z.id)), regions: [] };

function meta(extra = {}) {
  return {
    completedDays: 0, followers: 0, album: {}, petBook: {}, petFriendship: {},
    career: { trophies: { bronze: 0, silver: 0, gold: 0 }, weeklyCups: {} },
    goldenPaw: false, ...extra,
  };
}

// A meta whose seat-miss ring holds `days` consecutive days of `missed` misses each.
function withSeatDays(m, days, missed = 0, from = 1) {
  for (let i = 0; i < days; i++) recordPawSeatDay(m, from + i, missed);
  return m;
}

function albumOf(keys, { best = 0, shots = 1 } = {}) {
  const out = {};
  for (const key of keys) out[key] = { shots, best, poseId: null, accessoryId: null };
  return out;
}

function bookOf(keys) {
  const out = {};
  for (const key of keys) out[key] = 1;
  return out;
}

const req = (state, id) => state.requirements.find(r => r.id === id)
  || state.tiers.flatMap(t => t.requirements).find(r => r.id === id);

// --- the catalogue split --------------------------------------------------------------------

test('interior zones are everything outside a region chain — the terrace chain is not interior', () => {
  assert.ok(INTERIOR.includes('z_seats1'));
  assert.ok(INTERIOR.includes('z_seats2'));
  // z_terrace OPENS the terrace region and ★3 asks for it separately; counting it in ★2 would make
  // ★2 strictly harder than ★3.
  assert.ok(!INTERIOR.includes('z_terrace'), 'the region-opening zone is regional, not interior');
  for (const id of ['z_icecream', 'z_register3', 'z_terraceSeats', 'z_restroom', 'z_splash']) {
    assert.ok(!INTERIOR.includes(id), `${id} descends from z_terrace and is regional`);
  }
  // The Pet camera hangs its wall INSIDE the cafe and follows the pet lounge, not the garden
  // (docs/SHIP-PLAN-2026-09-19.md 1.1), so star 2's "the whole cafe interior" now includes it.
  assert.ok(INTERIOR.includes('z_photo'));
  assert.equal(INTERIOR.length, 10);
  // A second region chain re-partitions itself with no edit in pawRating.js.
  assert.ok(!pawInteriorZoneIds(EAST_AREA).includes('z_east'));
  assert.deepEqual(pawInteriorZoneIds(EAST_AREA), INTERIOR);
});

// --- tier gates -----------------------------------------------------------------------------

// BATCH E1 REWROTE EVERY TIER (ship plan 1.6a). The old rows -- 120 served, one Bestie, a 7-day
// missed-seat window at or under 3, a gold Weekly Cup, 2000 followers -- are gone: two of them
// (the cup, the followers) were numbers the UI no longer draws and landed around day 90, and the
// seat window was a REGRESSIBLE, punishing row. The new rows are the plan's, and every one of them
// is a thing the player can see themselves doing. The behaviours those tests protected that are
// NOT about the specific numbers -- the ratchet, the catalogue-skip rule, the uniform descriptor
// shape and the save-boundary ceiling -- are all still asserted below, unchanged.

test('star 1 opens at exactly PAW_TARGETS.served lifetime guests', () => {
  assert.equal(PAW_TARGETS.served, 40, 'the plan 1.6a number');
  const below = pawRatingState({ meta: meta(), stats: { served: PAW_TARGETS.served - 1 }, built: [], area: AREA1 });
  assert.equal(below.live, 0);
  assert.equal(below.next, 1);
  assert.equal(req(below, 'r1.served').current, PAW_TARGETS.served - 1);
  assert.equal(req(below, 'r1.served').target, PAW_TARGETS.served);
  assert.equal(req(below, 'r1.served').met, false);

  const at = pawRatingState({ meta: meta(), stats: { served: PAW_TARGETS.served }, built: [], area: AREA1 });
  assert.equal(at.live, 1);
  assert.equal(at.next, 2);
});

test('star 2 needs every interior zone AND 10 pets met', () => {
  const base = { stats: { served: 200 }, area: AREA1 };
  const tenPets = { petBook: bookOf(PAW_PET_KEYS.slice(0, 10)) };

  const noZones = pawRatingState({ ...base, meta: meta(tenPets), built: [] });
  assert.equal(noZones.live, 1);
  assert.equal(req(noZones, 'r2.interior').current, 0);
  assert.equal(req(noZones, 'r2.interior').target, INTERIOR.length);

  const oneShort = pawRatingState({ ...base, meta: meta(tenPets), built: INTERIOR.slice(0, -1) });
  assert.equal(oneShort.live, 1);
  assert.equal(req(oneShort, 'r2.interior').current, INTERIOR.length - 1);

  const ninePets = pawRatingState({ ...base, meta: meta({ petBook: bookOf(PAW_PET_KEYS.slice(0, 9)) }), built: INTERIOR });
  assert.equal(ninePets.live, 1, 'nine met pets is not ten');
  assert.equal(req(ninePets, 'r2.book').met, false);
  assert.equal(req(ninePets, 'r2.book').target, PAW_TARGETS.met2);

  assert.equal(pawRatingState({ ...base, meta: meta(tenPets), built: INTERIOR }).live, 2);
});

test('star 3 needs the garden, 14 pets and 5 photos, and no longer names a missed-seat window', () => {
  const built = [...INTERIOR, 'z_terrace'];
  const base = { stats: { served: 200 }, built, area: AREA1 };
  const core = { petBook: bookOf(PAW_PET_KEYS.slice(0, 14)), album: { 'cat:0': { shots: 5, best: 0 } } };

  const noTerrace = pawRatingState({ ...base, built: INTERIOR, meta: meta(core) });
  assert.equal(noTerrace.live, 2);
  assert.equal(req(noTerrace, 'r3.terrace').met, false);
  assert.equal(req(noTerrace, 'r3.terrace').zoneId, 'z_terrace');

  const fourShots = pawRatingState({ ...base, meta: meta({ ...core, album: { 'cat:0': { shots: 4, best: 0 } } }) });
  assert.equal(fourShots.live, 2);
  assert.equal(req(fourShots, 'r3.photos').current, 4);
  assert.equal(req(fourShots, 'r3.photos').target, PAW_TARGETS.photos3);

  const thirteenPets = pawRatingState({ ...base, meta: meta({ ...core, petBook: bookOf(PAW_PET_KEYS.slice(0, 13)) }) });
  assert.equal(thirteenPets.live, 2);
  assert.equal(req(thirteenPets, 'r3.book').current, 13);

  assert.equal(pawRatingState({ ...base, meta: meta(core) }).live, 3);

  // The retired rows are gone from every tier, not merely unmet: a fewer-is-better row nobody can
  // influence, and two numbers with no picture, are exactly what the plan took out.
  const all = pawRatingState({ ...base, meta: meta(core) }).tiers.flatMap(t => t.requirements);
  for (const id of ['r3.seats', 'r4.cup', 'r5.followers', 'r5.album', 'r2.bestie']) {
    assert.equal(all.some(r => r.id === id), false, `${id} is retired`);
  }
  assert.equal(all.some(r => r.compare === 'lte'), false, 'no fewer-is-better row is left');
});

test('star 4 needs 3 Besties, 18 pets and 20 photos; star 5 needs the whole book, 5 Besties, 10 Perfects and every theme', () => {
  const built = [...INTERIOR, 'z_terrace'];
  const base = { stats: { served: 200 }, built, area: AREA1 };
  const besties = n => Object.fromEntries(PAW_PET_KEYS.slice(0, n).map(k => [k, 10]));
  const star4 = m => meta({
    petBook: bookOf(PAW_PET_KEYS.slice(0, 18)),
    petFriendship: besties(3),
    album: { 'cat:0': { shots: 20, best: 0 } },
    ...m,
  });

  const twoBesties = pawRatingState({ ...base, meta: star4({ petFriendship: besties(2) }) });
  assert.equal(twoBesties.live, 3);
  assert.equal(req(twoBesties, 'r4.bestie').current, 2);
  assert.equal(req(twoBesties, 'r4.bestie').target, PAW_TARGETS.besties4);

  const nineteenShots = pawRatingState({ ...base, meta: star4({ album: { 'cat:0': { shots: 19, best: 0 } } }) });
  assert.equal(nineteenShots.live, 3, '19 shots is not 20');

  assert.equal(pawRatingState({ ...base, meta: star4() }).live, 4);

  const full = {
    petBook: bookOf(PAW_PET_KEYS),
    petFriendship: besties(5),
    album: { ...albumOf(PAW_PET_KEYS, { shots: 2 }), ...albumOf(PAW_PET_KEYS.slice(0, 10), { best: 2, shots: 2 }) },
    career: { renovationLevel: 5 },
  };
  assert.equal(pawRatingState({ ...base, meta: meta(full) }).live, 5);
  assert.equal(pawRatingState({ ...base, meta: meta({ ...full, career: { renovationLevel: 4 } }) }).live, 4,
    'star 5 needs every cafe theme owned');
  assert.equal(pawRatingState({ ...base, meta: meta({ ...full, petFriendship: besties(4) }) }).live, 4, 'four Besties is not five');
  assert.equal(pawRatingState({ ...base, meta: meta({
    ...full, album: { ...albumOf(PAW_PET_KEYS, { shots: 2 }), ...albumOf(PAW_PET_KEYS.slice(0, 9), { best: 2, shots: 2 }) },
  }) }).live, 4, 'nine Perfect pets is not ten');
  assert.equal(pawRatingState({ ...base, meta: meta({ ...full, petBook: bookOf(PAW_PET_KEYS.slice(0, 19)) }) }).live, 4,
    'one unmet pet holds star 5 closed');

  const done = pawRatingState({ ...base, meta: meta(full) });
  assert.equal(done.next, null);
  assert.deepEqual(done.requirements, []);
});

test("star 5's theme row matches career.js's authored theme ladder", () => {
  assert.equal(PAW_TARGETS.themes, RENOVATIONS.length,
    'pawRating duplicates the count rather than importing career.js (cycle); they must not drift');
});

// --- absent content ---------------------------------------------------------------------------

test('a requirement naming content absent from the catalogue is skipped, not failed', () => {
  assert.equal(pawZoneInCatalogue('z_terrace', AREA1), true);
  assert.equal(pawZoneInCatalogue('z_terrace', NO_TERRACE_AREA), false);
  assert.equal(pawZoneInCatalogue('z_spa', AREA1), false, 'the retired spa is absent from the real catalogue');

  const m = meta({
    petBook: bookOf(PAW_PET_KEYS.slice(0, 14)),
    album: { 'cat:0': { shots: 5, best: 0 } },
  });

  // Without the terrace in the catalogue: star 3 is reachable, and the terrace row is marked skipped
  // so the UI draws nothing for it.
  const today = pawRatingState({ meta: m, stats: { served: 200 }, built: INTERIOR, area: NO_TERRACE_AREA });
  assert.equal(today.live, 3);
  const terrace = req(today, 'r3.terrace');
  assert.equal(terrace.skipped, true);
  assert.equal(terrace.met, true);
  assert.equal(pawVisibleRequirements(today.tiers[2].requirements).some(r => r.id === 'r3.terrace'), false);

  // Authoring the zone makes the requirement real with no edit in pawRating.js.
  const later = pawRatingState({ meta: meta({ ...m }), stats: { served: 200 }, built: INTERIOR, area: AREA1 });
  assert.equal(req(later, 'r3.terrace').skipped, false);
  assert.equal(req(later, 'r3.terrace').met, false);
  assert.equal(later.live, 2);

  const builtTerrace = pawRatingState({ meta: meta({ ...m }), stats: { served: 200 }, built: [...INTERIOR, 'z_terrace'], area: AREA1 });
  assert.equal(builtTerrace.live, 3);
});

test('star 4 names no zone: the retired spa row is gone, not skipped', () => {
  const state = pawRatingState({ meta: meta(), stats: { served: 0 }, built: [], area: AREA1 });
  assert.deepEqual(state.tiers[3].requirements.map(r => r.id), ['r4.bestie', 'r4.book', 'r4.photos']);
  assert.equal(state.tiers.flatMap(t => t.requirements).some(r => r.id === 'r4.spa'), false);
  // Exactly one zone row in the whole track, and it is star 3's garden.
  const zoneRows = state.tiers.flatMap(t => t.requirements).filter(r => r.kind === 'zone');
  assert.deepEqual(zoneRows.map(r => r.zoneId), ['z_terrace']);
});

// --- the ratchet ------------------------------------------------------------------------------

test('the rating ratchets: it never goes down when an input regresses', () => {
  const built = [...INTERIOR, 'z_terrace'];
  const m = meta({
    petBook: bookOf(PAW_PET_KEYS.slice(0, 14)),
    album: { 'cat:0': { shots: 5, best: 0 } },
  });
  const input = { meta: m, stats: { served: 200 }, built, area: AREA1 };

  const first = applyPawRatchet(input);
  assert.equal(first.live, 3);
  assert.equal(first.best, 3);
  assert.deepEqual(first.gained, [1, 2, 3]);
  assert.equal(m.pawBest, 3);
  assert.equal(pawBestStar(m), 3);

  // Every ROW is monotonic since Batch E1, so the only way evidence can fall is a tampered or
  // truncated save. It still must not demote a star the player holds.
  const regressed = { ...m, album: {}, petBook: bookOf(PAW_PET_KEYS.slice(0, 4)) };
  const after = pawRatingState({ ...input, meta: regressed });
  assert.equal(after.live, 1, 'the derived value follows the evidence down');
  assert.equal(after.best, 3, 'the rating does not');
  assert.equal(after.next, 4, 'progress is shown toward the star after the one already held');
  assert.equal(after.tiers[2].reached, false);
  assert.equal(after.tiers[2].awarded, true);

  // A second ratchet call on regressed evidence writes nothing and claims nothing.
  const second = applyPawRatchet({ ...input, meta: regressed });
  assert.equal(second.changed, false);
  assert.deepEqual(second.gained, []);
  assert.equal(regressed.pawBest, 3);
});

test('a zone row that becomes real cannot un-earn a star a live player already holds', () => {
  const m = meta({
    petBook: bookOf(PAW_PET_KEYS.slice(0, 14)),
    album: { 'cat:0': { shots: 5, best: 0 } },
  });
  // "Before" is a catalogue without the terrace; "after" is the real one, terrace still unbuilt.
  assert.equal(applyPawRatchet({ meta: m, stats: { served: 200 }, built: INTERIOR, area: NO_TERRACE_AREA }).best, 3);

  const after = pawRatingState({ meta: m, stats: { served: 200 }, built: INTERIOR, area: AREA1 });
  assert.equal(after.live, 2);
  assert.equal(after.best, 3);
  assert.equal(after.next, 4);
});

// --- descriptors ------------------------------------------------------------------------------

test('requirements are structured icon descriptors, never prose', () => {
  const state = pawRatingState({ meta: meta(), stats: { served: 0 }, built: [], area: AREA1 });
  const all = state.tiers.flatMap(tier => tier.requirements);
  assert.equal(all.length, 13, 'the five tiers of ship plan 1.6a: 1 + 2 + 3 + 3 + 4 rows');
  const KEYS = ['star', 'id', 'kind', 'zoneId', 'current', 'target', 'compare', 'met', 'skipped', 'pending'];
  const ids = new Set();
  for (const r of all) {
    assert.deepEqual(Object.keys(r).sort(), [...KEYS].sort(), `row ${r.id} has the uniform shape`);
    assert.equal(typeof r.id, 'string');
    assert.equal(ids.has(r.id), false, `${r.id} is unique`);
    ids.add(r.id);
    assert.ok(Number.isFinite(r.current), `${r.id}.current is a numeral`);
    assert.ok(Number.isFinite(r.target), `${r.id}.target is a numeral`);
    assert.ok(r.compare === 'gte' || r.compare === 'lte');
    assert.equal(typeof r.met, 'boolean');
    assert.ok(r.zoneId === null || r.kind === 'zone');
    // No sentence anywhere: the only strings are machine ids/kinds, and none contains a space.
    for (const value of Object.values(r)) {
      if (typeof value === 'string') assert.ok(!/\s/.test(value), `${r.id} carries no prose ("${value}")`);
    }
  }
});

// --- the seat-miss ring -------------------------------------------------------------------------

test('the missed-seat ring is idempotent, bounded, and its best only improves', () => {
  const m = meta();
  assert.deepEqual(pawSeatWindow(m).days, []);
  assert.equal(pawSeatWindow(m).best, null);

  assert.equal(recordPawSeatDay(m, 1, 2).fresh, true);
  assert.equal(recordPawSeatDay(m, 1, 99).fresh, false, 'a replayed settlement cannot double-count');
  assert.deepEqual(pawSeatWindow(m).days, [{ day: 1, missed: 2 }]);

  // The record is REPLACED, never mutated: an already-taken snapshot of the array is untouched.
  const snapshot = m.pawSeatWindow;
  recordPawSeatDay(m, 2, 0);
  assert.notEqual(m.pawSeatWindow, snapshot);
  assert.equal(snapshot.days.length, 1);

  for (let day = 3; day <= 7; day++) recordPawSeatDay(m, day, 0);
  assert.equal(pawSeatWindow(m).best, 2);
  for (let day = 8; day <= 14; day++) recordPawSeatDay(m, day, 0);
  assert.equal(pawSeatWindow(m).best, 0, 'a better window lowers it');
  for (let day = 15; day <= 30; day++) recordPawSeatDay(m, day, 9);
  assert.equal(pawSeatWindow(m).best, 0, 'a worse window never raises it');
  assert.equal(pawSeatWindow(m).days.length, PAW_SEAT_WINDOW_KEEP);
  assert.equal(pawSeatWindow(m).days[0].day, 30 - PAW_SEAT_WINDOW_KEEP + 1);

  // A gap in recorded days is not a window.
  const gappy = meta();
  for (const day of [1, 2, 3, 4, 5, 6, 8]) recordPawSeatDay(gappy, day, 0);
  assert.equal(pawSeatWindow(gappy).best, null);
  assert.equal(pawSeatWindow(gappy).complete, false);
  recordPawSeatDay(gappy, 7, 0);
  assert.equal(pawSeatWindow(gappy).best, 0);
});

// --- Golden Paw ---------------------------------------------------------------------------------

test('the Golden Paw ceremony is due exactly once, off the ratchet', () => {
  assert.equal(goldenPawDue(meta({ pawBest: 4 })), false);
  assert.equal(goldenPawDue(meta({ pawBest: PAW_MAX_STAR })), true);
  assert.equal(goldenPawDue(meta({ pawBest: PAW_MAX_STAR, goldenPaw: true })), false);
  assert.equal(goldenPawDue(null), false);

  const m = meta({ pawBest: PAW_MAX_STAR });
  assert.equal(markGoldenPaw(m), true);
  assert.equal(m.goldenPaw, true);
  assert.equal(markGoldenPaw(m), false, 'the follower award is paid once');
  assert.equal(goldenPawDue(m), false);

  // ceremonyDue reads `best`, so regressed evidence cannot cancel an earned ceremony.
  const state = pawRatingState({ meta: meta({ pawBest: PAW_MAX_STAR }), stats: { served: 0 }, built: [], area: AREA1 });
  assert.equal(state.live, 0);
  assert.equal(state.best, PAW_MAX_STAR);
  assert.equal(state.ceremonyDue, true);
});

// --- effects --------------------------------------------------------------------------------------

test('star effects read the ratchet and stay bounded', () => {
  assert.equal(pawArrivalMultiplier(0), 1);
  // +10% arrivals lands ONCE, at star 2 (ship plan 1.6a) -- see the note in pawRating.js.
  assert.equal(pawArrivalMultiplier(1), 1);
  assert.ok(Math.abs(pawArrivalMultiplier(5) - 1.1) < 1e-9);
  assert.equal(pawArrivalMultiplier(99), pawArrivalMultiplier(5));
  assert.equal(pawResidentSlots(0), 3);
  assert.equal(pawResidentSlots(5), 8);
  assert.equal(pawResidentSlots(99), 8);
  assert.equal(pawResidentSlots(-4), 3);
});

// --- save bounds ------------------------------------------------------------------------------------

function forged(metaPatch, extra = {}) {
  return validateAndMigrateSave({
    v: 5, coins: 10, dayState: { day: 40, t: 0 },
    builds: { a1: [] }, stats: { served: 0 }, ...extra,
    meta: { completedDays: 39, ...metaPatch },
  }, AREA1);
}

test('a hand-edited save cannot grant itself a rating', () => {
  const empty = forged({ pawBest: 5 });
  assert.equal(empty.ok, true);
  assert.equal(empty.data.meta.pawBest, 0, 'no evidence, no stars');

  assert.equal(forged({ pawBest: 'gold' }).data.meta.pawBest, 0);
  assert.equal(forged({ pawBest: -3 }).data.meta.pawBest, 0);
  assert.equal(forged({ pawBest: 9e9 }).data.meta.pawBest, 0);

  const book = n => Object.fromEntries(PAW_PET_KEYS.slice(0, n).map(k => [k, 1]));

  // 40 served is genuinely all star 1 asks, so star 1 restores -- and nothing above it does.
  const oneStar = forged({ pawBest: 5 }, { stats: { served: 500 } });
  assert.equal(oneStar.data.meta.pawBest, 1);

  // Star 2 needs the interior built AND 10 pets met. The build list is validated first, so a forged
  // pawBest cannot out-run it.
  const zonesOnly = forged({ pawBest: 5 }, { stats: { served: 500 }, builds: { a1: INTERIOR } });
  assert.equal(zonesOnly.data.meta.pawBest, 1, 'no pets met yet');

  const withPets = forged(
    { pawBest: 5, petBook: book(10) },
    { stats: { served: 500 }, builds: { a1: INTERIOR } },
  );
  assert.equal(withPets.data.meta.pawBest, 2);

  // Star 3 also needs the garden and five photos.
  const noPhotos = forged(
    { pawBest: 5, petBook: book(14) },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  );
  assert.equal(noPhotos.data.meta.pawBest, 2);

  const realThree = forged(
    { pawBest: 3, petBook: book(14), album: { 'cat:0': { shots: 5, best: 0 } } },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  );
  assert.equal(realThree.data.meta.pawBest, 3);
});

test('a forged cafe theme cannot buy the star that gates it, and vice versa', () => {
  const book = n => Object.fromEntries(PAW_PET_KEYS.slice(0, n).map(k => [k, 1]));
  // A save that declares every theme owned on a cafe that has earned nothing: the themes are
  // dropped (they are gated on star 3/star 4) and star 5's theme row therefore cannot be met from
  // them either. This is the two-pass clamp in saveSchema.normalizeMeta.
  const forgedThemes = forged(
    { pawBest: 5, career: { renovationLevel: 5 } },
    { stats: { served: 500 } },
  );
  assert.equal(forgedThemes.data.meta.career.renovationLevel, 0, 'no star, no theme');
  assert.equal(forgedThemes.data.meta.pawBest, 1);

  // A save that really did earn star 4 keeps the themes its stars allow.
  const earned = forged(
    {
      pawBest: 4, petBook: book(18),
      petFriendship: Object.fromEntries(PAW_PET_KEYS.slice(0, 3).map(k => [k, 10])),
      album: { 'cat:0': { shots: 20, best: 0 } },
      career: { renovationLevel: 5 },
    },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  );
  assert.equal(earned.data.meta.pawBest, 4);
  assert.equal(earned.data.meta.career.renovationLevel, 5, 'star 4 opens the whole theme ladder');
});

test('meta.pawSeatWindow is bounded like every other restored counter', () => {
  const fresh = forged({});
  assert.deepEqual(fresh.data.meta.pawSeatWindow, { days: [], best: null });

  const days = Array.from({ length: PAW_SEAT_WINDOW_DAYS }, (_, i) => ({ day: i + 1, missed: 0 }));
  const kept = forged({ pawSeatWindow: { days, best: 0 } });
  assert.equal(kept.data.meta.pawSeatWindow.days.length, PAW_SEAT_WINDOW_DAYS);
  assert.equal(kept.data.meta.pawSeatWindow.best, 0);

  // Days the player has not settled cannot hold a record.
  const future = forged({ pawSeatWindow: { days: [...days, { day: 900, missed: 0 }, { day: 0, missed: 0 }], best: 0 } });
  assert.deepEqual(future.data.meta.pawSeatWindow.days.map(d => d.day), [1, 2, 3, 4, 5, 6, 7]);

  // Junk rows, duplicate days and an oversized miss count are all bounded, never rejected wholesale.
  const junk = forged({ pawSeatWindow: { days: [{ day: 1, missed: 9e9 }, { day: 1, missed: 0 }, 'nope', null, { day: 2 }], best: -5 } });
  assert.deepEqual(junk.data.meta.pawSeatWindow.days, [{ day: 1, missed: 500 }, { day: 2, missed: 0 }]);
  assert.equal(junk.data.meta.pawSeatWindow.best, null, 'under seven recorded days there is no window to claim');

  // A save that has not settled seven days has never closed a window.
  const tooNew = validateAndMigrateSave({
    v: 5, dayState: { day: 4, t: 0 },
    meta: { completedDays: 3, pawSeatWindow: { days: [{ day: 1, missed: 0 }], best: 0 } },
  }, AREA1);
  assert.equal(tooNew.data.meta.pawSeatWindow.best, null);

  const cap = forged({ pawSeatWindow: {
    days: Array.from({ length: 40 }, (_, i) => ({ day: i + 1, missed: 1 })), best: 7,
  } });
  // Day 40 is dropped (only 39 settled), and the ring keeps the newest 14 of what is left.
  assert.equal(cap.data.meta.pawSeatWindow.days.length, PAW_SEAT_WINDOW_KEEP);
  assert.equal(cap.data.meta.pawSeatWindow.days[0].day, 39 - PAW_SEAT_WINDOW_KEEP + 1);
  assert.equal(cap.data.meta.pawSeatWindow.days.at(-1).day, 39);
});

test('a restored save round-trips its rating unchanged', () => {
  const first = forged(
    { pawBest: 3, petBook: Object.fromEntries(PAW_PET_KEYS.slice(0, 14).map(k => [k, 1])), album: { 'cat:0': { shots: 5, best: 0 } } },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  ).data;
  const second = validateAndMigrateSave(first, AREA1);
  assert.equal(second.ok, true);
  assert.equal(second.data.meta.pawBest, first.meta.pawBest);
  assert.deepEqual(second.data.meta.pawSeatWindow, first.meta.pawSeatWindow);
});

test('the entitlement ceiling is what the save clamp uses, and 0 with no evidence', () => {
  assert.equal(pawEntitlementCeiling({ meta: meta(), stats: { served: 0 }, built: [], area: AREA1 }), 0);
  assert.equal(pawEntitlementCeiling({ meta: meta(), stats: { served: PAW_TARGETS.served }, built: [], area: AREA1 }), 1);
  // Every row is monotonic since Batch E1, so the ceiling IS the live derivation -- no row is
  // assumed met any more, because no row can fall. A ceiling that matches `live` exactly is the
  // strongest form of the guarantee: a save can restore exactly what its own evidence proves.
  const three = meta({
    petBook: Object.fromEntries(PAW_PET_KEYS.slice(0, 14).map(k => [k, 1])),
    album: { 'cat:0': { shots: 5, best: 0 } },
  });
  const input = { meta: three, stats: { served: 200 }, built: [...INTERIOR, 'z_terrace'], area: AREA1 };
  assert.equal(pawRatingState(input).live, 3);
  assert.equal(pawEntitlementCeiling(input), 3);
});

test('evidence reads the legacy bare-count album shape', () => {
  const ev = pawEvidence({ meta: meta({ album: { 'cat:0': 7, 'dog:1': { shots: 2, best: 2 } } }), stats: { served: 0 }, built: [], area: AREA1 });
  assert.equal(ev.shots, 9);
  assert.equal(ev.photographed, 2);
  assert.equal(ev.perfect, 1, 'a legacy bare count carries no Perfect rank');
});

test('the state object is small and JSON-safe — no zone catalogue, no live Set', () => {
  const state = pawRatingState({ meta: meta({ followers: 12 }), stats: { served: 5 }, built: ['z_seats1'], area: AREA1 });
  assert.equal(state.counters.area, undefined);
  assert.equal(state.counters.builtSet, undefined);
  assert.equal(state.counters.served, 5);
  assert.equal(state.counters.followers, 12);
  assert.equal(state.counters.petTotal, PAW_PET_KEYS.length);
  assert.doesNotThrow(() => JSON.stringify(state));
});
