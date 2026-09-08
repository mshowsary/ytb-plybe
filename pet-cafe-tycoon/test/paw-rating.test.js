import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  PAW_MAX_STAR, PAW_PET_KEYS, PAW_SEAT_WINDOW_DAYS, PAW_SEAT_WINDOW_KEEP, PAW_TARGETS,
  applyPawRatchet, goldenPawDue, markGoldenPaw, pawArrivalMultiplier, pawBestStar,
  pawEntitlementCeiling, pawEvidence, pawInteriorZoneIds, pawRatingState, pawResidentSlots,
  pawSeatWindow, pawVisibleRequirements, pawZoneInCatalogue, recordPawSeatDay,
} from '../src/sim/pawRating.js';
import { validateAndMigrateSave } from '../src/sim/saveSchema.js';

// --- fixtures -------------------------------------------------------------------------------

const INTERIOR = pawInteriorZoneIds(AREA1);

// What Batch 4 will actually author: a spa zone plus the region it opens (plan 3.9).
const SPA_AREA = {
  ...AREA1,
  zones: [...AREA1.zones, { id: 'z_spa', x: 12, z: 0, price: 45000, requires: 'z_terrace', label: 'Pet Spa' }],
  regions: [...AREA1.regions, { id: 'spa', x0: 10, x1: 17.5, z0: -7, z1: 7, builtBy: 'z_spa', floor: 'tile' }],
};

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
  for (const id of ['z_icecream', 'z_register3', 'z_photo', 'z_terraceSeats', 'z_restroom', 'z_splash']) {
    assert.ok(!INTERIOR.includes(id), `${id} descends from z_terrace and is regional`);
  }
  assert.equal(INTERIOR.length, 9);
  // A future spa chain re-partitions itself with no edit in pawRating.js.
  assert.ok(!pawInteriorZoneIds(SPA_AREA).includes('z_spa'));
  assert.deepEqual(pawInteriorZoneIds(SPA_AREA), INTERIOR);
});

// --- tier gates -----------------------------------------------------------------------------

test('★1 opens at exactly 120 lifetime guests served', () => {
  const at119 = pawRatingState({ meta: meta(), stats: { served: 119 }, built: [], area: AREA1 });
  assert.equal(at119.live, 0);
  assert.equal(at119.next, 1);
  assert.equal(req(at119, 'r1.served').current, 119);
  assert.equal(req(at119, 'r1.served').target, PAW_TARGETS.served);
  assert.equal(req(at119, 'r1.served').met, false);

  const at120 = pawRatingState({ meta: meta(), stats: { served: 120 }, built: [], area: AREA1 });
  assert.equal(at120.live, 1);
  assert.equal(at120.next, 2);
});

test('★2 needs every interior zone AND one Bestie', () => {
  const base = { stats: { served: 200 }, area: AREA1 };
  const bestie = { petFriendship: { 'cat:0': 10 } };

  const noZones = pawRatingState({ ...base, meta: meta(bestie), built: [] });
  assert.equal(noZones.live, 1);
  assert.equal(req(noZones, 'r2.interior').current, 0);
  assert.equal(req(noZones, 'r2.interior').target, INTERIOR.length);

  const oneShort = pawRatingState({ ...base, meta: meta(bestie), built: INTERIOR.slice(0, -1) });
  assert.equal(oneShort.live, 1);
  assert.equal(req(oneShort, 'r2.interior').current, INTERIOR.length - 1);

  const noBestie = pawRatingState({ ...base, meta: meta({ petFriendship: { 'cat:0': 9 } }), built: INTERIOR });
  assert.equal(noBestie.live, 1, '9 visits is Friend, not Bestie');
  assert.equal(req(noBestie, 'r2.bestie').met, false);

  const both = pawRatingState({ ...base, meta: meta(bestie), built: INTERIOR });
  assert.equal(both.live, 2);
});

test('★3 needs the terrace, 10 album shots and a 7-day window at or under 3 missed seats', () => {
  const built = [...INTERIOR, 'z_terrace'];
  const base = { stats: { served: 200 }, built, area: AREA1 };
  const core = { petFriendship: { 'cat:0': 10 } };
  const tenShots = { album: { 'cat:0': { shots: 10, best: 0 } } };

  const noTerrace = pawRatingState({ ...base, built: INTERIOR, meta: withSeatDays(meta({ ...core, ...tenShots }), 7, 0) });
  assert.equal(noTerrace.live, 2);
  assert.equal(req(noTerrace, 'r3.terrace').met, false);
  assert.equal(req(noTerrace, 'r3.terrace').zoneId, 'z_terrace');

  const nineShots = pawRatingState({ ...base, meta: withSeatDays(meta({ ...core, album: { 'cat:0': { shots: 9, best: 0 } } }), 7, 0) });
  assert.equal(nineShots.live, 2);
  assert.equal(req(nineShots, 'r3.photos').current, 9);

  // Four misses spread over the only complete window: over budget.
  const dirty = pawRatingState({ ...base, meta: withSeatDays(meta({ ...core, ...tenShots }), 7, 1) });
  assert.equal(dirty.live, 2);
  assert.equal(req(dirty, 'r3.seats').current, 7);
  assert.equal(req(dirty, 'r3.seats').compare, 'lte');
  assert.equal(req(dirty, 'r3.seats').met, false);

  // Not enough days recorded yet is PENDING, not failed-with-a-fake-number.
  const early = pawRatingState({ ...base, meta: withSeatDays(meta({ ...core, ...tenShots }), 6, 0) });
  assert.equal(early.live, 2);
  assert.equal(req(early, 'r3.seats').pending, true);
  assert.equal(req(early, 'r3.seats').met, false);

  const clean = pawRatingState({ ...base, meta: withSeatDays(meta({ ...core, ...tenShots }), 7, 0) });
  assert.equal(clean.live, 3);
  assert.equal(req(clean, 'r3.seats').pending, false);

  // Exactly at the limit still counts: 3 misses across seven days.
  const atLimit = meta({ ...core, ...tenShots });
  withSeatDays(atLimit, 4, 0, 1);
  recordPawSeatDay(atLimit, 5, 3);
  withSeatDays(atLimit, 2, 0, 6);
  const edge = pawRatingState({ ...base, meta: atLimit });
  assert.equal(pawSeatWindow(atLimit).best, 3);
  assert.equal(edge.live, 3);
});

test('★4 needs 16 of 20 pets and a gold cup; ★5 needs the whole album, 3 Perfects and 2000 followers', () => {
  const built = [...INTERIOR, 'z_terrace'];
  const star3 = m => withSeatDays(meta({
    petFriendship: { 'cat:0': 10 }, album: { 'cat:0': { shots: 10, best: 0 } }, ...m,
  }), 7, 0);
  const base = { stats: { served: 200 }, built, area: AREA1 };

  const noCup = pawRatingState({ ...base, meta: star3({ petBook: bookOf(PAW_PET_KEYS.slice(0, 16)) }) });
  assert.equal(noCup.live, 3);
  assert.equal(req(noCup, 'r4.book').met, true);
  assert.equal(req(noCup, 'r4.cup').met, false);

  const fifteen = pawRatingState({ ...base, meta: star3({
    petBook: bookOf(PAW_PET_KEYS.slice(0, 15)),
    career: { trophies: { gold: 1 }, weeklyCups: {} },
  }) });
  assert.equal(fifteen.live, 3);
  assert.equal(req(fifteen, 'r4.book').current, 15);
  assert.equal(req(fifteen, 'r4.book').target, 16);

  const star4meta = star3({
    petBook: bookOf(PAW_PET_KEYS.slice(0, 16)),
    career: { trophies: { gold: 1 }, weeklyCups: {} },
  });
  assert.equal(pawRatingState({ ...base, meta: star4meta }).live, 4);

  // A gold cup recorded only in the weekly-cup ledger still counts.
  const ledgerOnly = star3({
    petBook: bookOf(PAW_PET_KEYS.slice(0, 16)),
    career: { trophies: {}, weeklyCups: { 3: { tier: 'gold', reward: 1600, points: 25 } } },
  });
  assert.equal(pawRatingState({ ...base, meta: ledgerOnly }).live, 4);

  const full = {
    petBook: bookOf(PAW_PET_KEYS),
    career: { trophies: { gold: 1 }, weeklyCups: {} },
    album: { ...albumOf(PAW_PET_KEYS), ...albumOf(PAW_PET_KEYS.slice(0, 3), { best: 2 }) },
    followers: 2000,
  };
  assert.equal(pawRatingState({ ...base, meta: star3(full) }).live, 5);
  assert.equal(pawRatingState({ ...base, meta: star3({ ...full, followers: 1999 }) }).live, 4);
  assert.equal(pawRatingState({ ...base, meta: star3({
    ...full, album: { ...albumOf(PAW_PET_KEYS), ...albumOf(PAW_PET_KEYS.slice(0, 2), { best: 2 }) },
  }) }).live, 4, 'two Perfect pets is not three');
  assert.equal(pawRatingState({ ...base, meta: star3({
    ...full, album: { ...albumOf(PAW_PET_KEYS.slice(0, 19)), ...albumOf(PAW_PET_KEYS.slice(0, 3), { best: 2 }) },
  }) }).live, 4, 'one unphotographed pet holds ★5 closed');

  const done = pawRatingState({ ...base, meta: star3(full) });
  assert.equal(done.next, null);
  assert.deepEqual(done.requirements, []);
});

// --- absent content ---------------------------------------------------------------------------

test('a requirement naming content absent from the catalogue is skipped, not failed', () => {
  assert.equal(pawZoneInCatalogue('z_terrace', AREA1), true);
  assert.equal(pawZoneInCatalogue('z_spa', AREA1), false, 'z_spa is Batch 4 and does not exist yet');
  assert.equal(pawZoneInCatalogue('z_spa', SPA_AREA), true);

  const built = [...INTERIOR, 'z_terrace'];
  const m = withSeatDays(meta({
    petFriendship: { 'cat:0': 10 },
    album: { 'cat:0': { shots: 10, best: 0 } },
    petBook: bookOf(PAW_PET_KEYS.slice(0, 16)),
    career: { trophies: { gold: 1 }, weeklyCups: {} },
  }), 7, 0);

  // Today: ★4 is reachable, and the spa row is marked skipped so the UI draws nothing for it.
  const today = pawRatingState({ meta: m, stats: { served: 200 }, built, area: AREA1 });
  assert.equal(today.live, 4);
  const spa = req(today, 'r4.spa');
  assert.equal(spa.skipped, true);
  assert.equal(spa.met, true);
  assert.equal(pawVisibleRequirements(today.tiers[3].requirements).some(r => r.id === 'r4.spa'), false);

  // Batch 4 adds z_spa to the catalogue and the requirement becomes real with no edit here.
  const later = pawRatingState({ meta: meta({ ...m }), stats: { served: 200 }, built, area: SPA_AREA });
  assert.equal(req(later, 'r4.spa').skipped, false);
  assert.equal(req(later, 'r4.spa').met, false);
  assert.equal(later.live, 3);

  const builtSpa = pawRatingState({ meta: meta({ ...m }), stats: { served: 200 }, built: [...built, 'z_spa'], area: SPA_AREA });
  assert.equal(builtSpa.live, 4);
});

// --- the ratchet ------------------------------------------------------------------------------

test('the rating ratchets: it never goes down when an input regresses', () => {
  const built = [...INTERIOR, 'z_terrace'];
  const m = withSeatDays(meta({
    petFriendship: { 'cat:0': 10 },
    album: { 'cat:0': { shots: 10, best: 0 } },
  }), 7, 0);
  const input = { meta: m, stats: { served: 200 }, built, area: AREA1 };

  const first = applyPawRatchet(input);
  assert.equal(first.live, 3);
  assert.equal(first.best, 3);
  assert.deepEqual(first.gained, [1, 2, 3]);
  assert.equal(m.pawBest, 3);
  assert.equal(pawBestStar(m), 3);

  // A bad fortnight rolls every clean day out of the ring... but the window's own best is a ratchet
  // too, so the requirement itself survives.
  for (let day = 8; day <= 8 + PAW_SEAT_WINDOW_KEEP; day++) recordPawSeatDay(m, day, 4);
  assert.equal(pawSeatWindow(m).days.length, PAW_SEAT_WINDOW_KEEP);
  assert.equal(pawSeatWindow(m).best, 0, 'the earned window is not forgotten when the ring rolls');
  assert.equal(pawRatingState(input).live, 3);

  // Now force the underlying evidence to actually regress: a meta whose window best is gone.
  const regressed = { ...m, pawSeatWindow: { days: pawSeatWindow(m).days, best: null } };
  const after = pawRatingState({ ...input, meta: regressed });
  assert.equal(after.live, 2, 'the derived value follows the evidence down');
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

test('Batch 4 adding z_spa cannot un-earn a ★4 a live player already holds', () => {
  const built = [...INTERIOR, 'z_terrace'];
  const m = withSeatDays(meta({
    petFriendship: { 'cat:0': 10 },
    album: { 'cat:0': { shots: 10, best: 0 } },
    petBook: bookOf(PAW_PET_KEYS.slice(0, 16)),
    career: { trophies: { gold: 1 }, weeklyCups: {} },
  }), 7, 0);
  assert.equal(applyPawRatchet({ meta: m, stats: { served: 200 }, built, area: AREA1 }).best, 4);

  const afterBatch4 = pawRatingState({ meta: m, stats: { served: 200 }, built, area: SPA_AREA });
  assert.equal(afterBatch4.live, 3);
  assert.equal(afterBatch4.best, 4);
  assert.equal(afterBatch4.next, 5);
});

// --- descriptors ------------------------------------------------------------------------------

test('requirements are structured icon descriptors, never prose', () => {
  const state = pawRatingState({ meta: meta(), stats: { served: 0 }, built: [], area: AREA1 });
  const all = state.tiers.flatMap(tier => tier.requirements);
  assert.equal(all.length, 12);
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
  assert.ok(Math.abs(pawArrivalMultiplier(5) - 1.5) < 1e-9);
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

  // 120 served is genuinely all ★1 asks, so ★1 restores -- and nothing above it does.
  const oneStar = forged({ pawBest: 5 }, { stats: { served: 500 } });
  assert.equal(oneStar.data.meta.pawBest, 1);

  // ★2 needs the interior built. The build list is validated first, so a forged pawBest cannot
  // out-run it.
  const zonesOnly = forged({ pawBest: 5 }, { stats: { served: 500 }, builds: { a1: INTERIOR } });
  assert.equal(zonesOnly.data.meta.pawBest, 1, 'no Bestie yet');

  const withBestie = forged(
    { pawBest: 5, petFriendship: { 'cat:0': 10 } },
    { stats: { served: 500 }, builds: { a1: INTERIOR } },
  );
  assert.equal(withBestie.data.meta.pawBest, 2);

  // The ceiling assumes the REGRESSIBLE seat window, so a legitimate ★3 survives a reload after a
  // bad week -- but the terrace and the 10 photos still have to be there.
  const noPhotos = forged(
    { pawBest: 5, petFriendship: { 'cat:0': 10 } },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  );
  assert.equal(noPhotos.data.meta.pawBest, 2);

  const realThree = forged(
    { pawBest: 3, petFriendship: { 'cat:0': 10 }, album: { 'cat:0': { shots: 10, best: 0 } } },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  );
  assert.equal(realThree.data.meta.pawBest, 3, 'a ★3 reloads as ★3 with no window in the ring');

  // ★4 skips the absent z_spa here exactly as the live rating does, so the two agree on reload.
  const realFour = forged(
    {
      pawBest: 4, petFriendship: { 'cat:0': 10 }, album: { 'cat:0': { shots: 10, best: 0 } },
      petBook: bookOf(PAW_PET_KEYS.slice(0, 16)),
      career: { weeklyCups: { 3: { tier: 'gold', points: 25 } } },
    },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  );
  assert.equal(realFour.data.meta.pawBest, 4);
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
    { pawBest: 3, petFriendship: { 'cat:0': 10 }, album: { 'cat:0': { shots: 10, best: 0 } } },
    { stats: { served: 500 }, builds: { a1: [...INTERIOR, 'z_terrace'] } },
  ).data;
  const second = validateAndMigrateSave(first, AREA1);
  assert.equal(second.ok, true);
  assert.equal(second.data.meta.pawBest, first.meta.pawBest);
  assert.deepEqual(second.data.meta.pawSeatWindow, first.meta.pawSeatWindow);
});

test('the entitlement ceiling is what the save clamp uses, and 0 with no evidence', () => {
  assert.equal(pawEntitlementCeiling({ meta: meta(), stats: { served: 0 }, built: [], area: AREA1 }), 0);
  assert.equal(pawEntitlementCeiling({ meta: meta(), stats: { served: 120 }, built: [], area: AREA1 }), 1);
  // The ★3 window is assumed met by the ceiling — that is the whole point of it.
  const three = meta({ petFriendship: { 'cat:0': 10 }, album: { 'cat:0': { shots: 10, best: 0 } } });
  assert.equal(pawRatingState({ meta: three, stats: { served: 200 }, built: [...INTERIOR, 'z_terrace'], area: AREA1 }).live, 2);
  assert.equal(pawEntitlementCeiling({ meta: three, stats: { served: 200 }, built: [...INTERIOR, 'z_terrace'], area: AREA1 }), 3);
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
