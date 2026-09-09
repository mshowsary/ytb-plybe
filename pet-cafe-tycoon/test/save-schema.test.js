import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  applySave, CURRENT_SAVE_VERSION, SAVE_LIMITS, validateAndMigrateSave,
} from '../src/sim/save.js';
import { createYouTubePlatform, LOAD_STATUS } from '../src/platform/youtube.js';
import { SAVE_LIMITS as CORE_LIMITS } from '../src/sim/saveSchema.js';
import { DECOR, DECOR_IDS } from '../data/decor.js';

function validate(raw) { return validateAndMigrateSave(raw, AREA1); }
function playableHost(loadData, saveData = async () => {}) {
  return { ytgame: { IN_PLAYABLES_ENV: true, game: { loadData, saveData } } };
}

function legacyFixture() {
  return {
    coins: 777,
    built: ['z_seats1', 'z_oven2', 'z_register2', 'z_coffee', 'definitely-not-a-zone'],
    partial: { z_hire: 200, z_coffee: 6999, z_oven2: 219, fake: 10 },
    upgrades: { speed: 99, carry: -3, income: 2, unknown: 900 },
    staff: { runner: 99, cashier: 9, cleaner: -5, barista: 4, ghost: 10 },
    stats: { served: 12, lifetimeEarned: 5000 },
    settings: { sfx: false },
    staffLevels: { runner: { speed: 99, carry: -1 }, cashier: { speed: 7 } },
    machineLevels: { oven: 10, coffee: -2, display: 2 },
    dayState: { day: 3, t: 70, phase: 'closing', _ended: true },
    stars: { oven1: 99, coffee1: 3, fakeStation: 3 },
    meta: {
      completedDays: 2,
      reputation: 999,
      perfectShifts: 99,
      bestServiceStreak: 999,
      shiftRatings: { 1: 99, 2: 2, 999: 3 },
      petBook: { 'cat:0': 1, 'dragon:9': 1 },
      petFriendship: { 'cat:0': 100000, 'dragon:9': 999 },
      career: { renovationLevel: 5, recipeSales: { cookie: 10, hack: 999 } },
    },
    dayStats: { served: 20, lost: 2, earned: 500, bestStreak: 999 },
  };
}

test('unsupported versions, impossible wealth and wrong container shapes are rejected', () => {
  const invalid = [
    { v: CURRENT_SAVE_VERSION + 1 },
    { v: 0 },
    { v: CURRENT_SAVE_VERSION, coins: -1 },
    { v: CURRENT_SAVE_VERSION, coins: SAVE_LIMITS.maxCoins + 1 },
    { v: CURRENT_SAVE_VERSION, coins: Infinity },
    { v: CURRENT_SAVE_VERSION, upgrades: [] },
    { v: CURRENT_SAVE_VERSION, dayState: [] },
    { v: CURRENT_SAVE_VERSION, builds: [] },
    { v: CURRENT_SAVE_VERSION, meta: { career: [] } },
  ];
  for (const raw of invalid) {
    const result = validate(raw);
    assert.equal(result.ok, false, `expected invalid: ${JSON.stringify(raw)}`);
  }
});

test('unversioned legacy save migrates to bounded v4 without inventing unlocks or wealth', () => {
  const result = validate(legacyFixture());
  assert.equal(result.ok, true);
  assert.equal(result.migratedFrom, 0);
  const save = result.data;

  assert.equal(save.v, CURRENT_SAVE_VERSION);
  assert.equal(save.coins, 777);
  // The guarantee is that a tampered save cannot invent UNLIMITED power, not that it clamps to a
  // particular authored tier. Ceilings are far above anything reachable in play (the cost curve is
  // geometric) but remain bounded, so speed:99 is still refused.
  assert.deepEqual(save.upgrades, { speed: SAVE_LIMITS.maxUpgradeTier, carry: 0, income: 2 });
  assert.deepEqual(save.staff, { runner: SAVE_LIMITS.maxStaffPerRole, cashier: 9, cleaner: 0, barista: 4, photographer: 0 });
  assert.deepEqual(save.staffLevels, {
    runner: { speed: SAVE_LIMITS.maxWorkerTier, carry: 0 }, cashier: { speed: 7 }, cleaner: { speed: 0 },
  });
  assert.deepEqual(save.machineLevels, { oven: 10, coffee: 0, display: 2 });

  // z_coffee is deliberately orphaned: the saved set omitted its required z_hire predecessor.
  assert.deepEqual(save.builds.a1, ['z_seats1', 'z_oven2', 'z_register2']);
  assert.deepEqual(save.partial, { z_hire: 200 });
  assert.deepEqual(save.stars, { oven1: SAVE_LIMITS.maxStarTier });

  // Phase/_ended are derived from authoritative bounded time rather than trusted from JSON.
  assert.deepEqual(save.dayState, { day: 3, t: 70, phase: 'rush' });
  assert.equal(save.meta.completedDays, 2);
  assert.equal(save.meta.reputation, 6); // modern progress cannot exceed 3 rep per settled day
  assert.equal(save.meta.perfectShifts, 2);
  assert.equal(save.meta.bestServiceStreak, 500);
  assert.deepEqual(save.meta.shiftRatings, { 1: 3, 2: 2 });
  assert.equal(save.meta.career.renovationLevel, 0); // rep gate wins over a forged renovation tier
  assert.deepEqual(save.meta.petBook, { 'cat:0': 1 });
  assert.deepEqual(save.meta.petFriendship, { 'cat:0': 9999 });
  assert.equal(save.meta.petDiscoveries, 1);
  assert.equal(save.dayStats.bestStreak, 20);
});

test('canonicalization is idempotent: validating an already migrated save changes nothing', () => {
  const first = validate(legacyFixture());
  assert.equal(first.ok, true);
  const second = validate(first.data);
  assert.equal(second.ok, true);
  assert.equal(second.migratedFrom, CURRENT_SAVE_VERSION);
  assert.deepEqual(second.data, first.data);
});

test('build dependencies and partial prices are validated against area data', () => {
  const result = validate({
    v: 4,
    coins: 100,
    builds: { a1: ['z_coffee', 'unknown'] },
    partial: {
      z_seats1: 89,       // valid first-zone partial
      z_oven2: 219,       // dependency not built
      z_hire: 479,        // dependency not built
      z_coffee: 700,      // complete partial must not become price-1
      unknown: 99,
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.builds.a1, []);
  assert.deepEqual(result.data.partial, { z_seats1: 89 });
});

test('applySave rejects invalid data without mutating live state and returns canonical data for valid saves', () => {
  const state = {
    coins: 25,
    up: { speed: 1, carry: 1, income: 1 },
    staff: { runner: 0 }, stats: { served: 4 }, settings: { sfx: true }, boosts: {},
  };
  const before = JSON.parse(JSON.stringify(state));
  assert.equal(applySave(state, { v: 999, coins: 999999 }, AREA1), null);
  assert.deepEqual(state, before);

  const canonical = applySave(state, legacyFixture(), AREA1);
  assert.ok(canonical);
  assert.equal(canonical.v, CURRENT_SAVE_VERSION);
  assert.equal(state.coins, 777);
  assert.deepEqual(state.dayState, { day: 3, t: 70, phase: 'rush' });
  assert.equal(state.meta.reputation, 6);
});

test('platform validator keeps writes locked for structurally invalid JSON and authorizes a migrated retry', async () => {
  let loads = 0;
  const writes = [];
  const host = playableHost(
    async () => {
      loads++;
      if (loads === 1) return JSON.stringify({ v: CURRENT_SAVE_VERSION + 1, coins: 999 });
      return JSON.stringify(legacyFixture());
    },
    async raw => writes.push(raw),
  );
  const platform = createYouTubePlatform(host, {
    validateLoadedData: data => validateAndMigrateSave(data, AREA1),
  });

  assert.deepEqual(await platform.load(), { status: LOAD_STATUS.INVALID });
  assert.equal(platform.saveProtected, true);
  assert.equal(await platform.save({ coins: 1 }), false);
  assert.deepEqual(writes, []);

  const recovered = await platform.retryLoad();
  assert.equal(recovered.status, LOAD_STATUS.LOADED);
  assert.equal(recovered.data.v, CURRENT_SAVE_VERSION);
  assert.equal(recovered.data.coins, 777);
  assert.deepEqual(recovered.data.builds.a1, ['z_seats1', 'z_oven2', 'z_register2']);
  assert.equal(platform.saveProtected, false);
  assert.equal(await platform.save(recovered.data), true);
  assert.equal(writes.length, 1);
});
// ---------------------------------------------------------------------------------------------
// Save v5 (plan 7.3). The v5 fields describe things a player earns one shift at a time -- an
// audience, an album, residents, a season, a franchise -- so the whole point of these tests is that
// a hand-edited save cannot hand itself any of them.

function v4Fixture(over = {}) {
  return {
    v: 4,
    coins: 500,
    builds: { a1: ['z_seats1'] },
    dayState: { day: 6, t: 120 },
    meta: { completedDays: 5, reputation: 9, ...(over.meta || {}) },
    ...over,
  };
}

test('v4 migrates to v5 with a bounded default for every new meta field', () => {
  const result = validate(v4Fixture());
  assert.equal(result.ok, true);
  assert.equal(result.migratedFrom, 4);
  assert.equal(result.data.v, 5);
  assert.equal(CURRENT_SAVE_VERSION, 5);

  const meta = result.data.meta;
  assert.equal(meta.followers, 0);
  assert.deepEqual(meta.album, {});
  assert.deepEqual(meta.equipped, {});
  assert.deepEqual(meta.residents, []);
  assert.deepEqual(meta.decor, []);
  assert.equal(meta.goldenPaw, false);
  assert.deepEqual(meta.season, { index: 0, dayStart: 1 });
  assert.deepEqual(meta.franchise, { level: 0, multiplier: 1 });
  // nothing the migration adds may disturb what v4 already carried
  assert.equal(meta.completedDays, 5);
  assert.equal(meta.reputation, 9);
});

test('v5 keeps legitimate values and clamps every tampered one', () => {
  const result = validate(v4Fixture({
    meta: {
      completedDays: 5,
      reputation: 9,
      followers: 4210,
      // 'cat:0' is the legacy Batch 0/1 shape (a bare shot count); 'dog:1' is the Photo Studio
      // (plan 3.2) object shape { shots, best, poseId, accessoryId }. Both must survive intact.
      album: { 'cat:0': 7, 'dog:1': { shots: 2, best: 2, poseId: 'loaf', accessoryId: 'bow' } },
      equipped: { 'cat:0': DECOR_IDS[0] },
      residents: ['dog:1', 'cat:0'],
      decor: [DECOR_IDS[2], DECOR_IDS[0]],
      goldenPaw: true,
      season: { index: 2, dayStart: 4 },
      franchise: { level: 3 },
    },
  }));
  assert.equal(result.ok, true);
  const meta = result.data.meta;
  assert.equal(meta.followers, 4210);
  assert.deepEqual(meta.album, {
    'cat:0': { shots: 7, best: 0, poseId: null, accessoryId: null },
    'dog:1': { shots: 2, best: 2, poseId: 'loaf', accessoryId: 'bow' },
  });
  assert.deepEqual(meta.equipped, { 'cat:0': DECOR_IDS[0] });
  assert.deepEqual(meta.residents, ['cat:0', 'dog:1']);
  // decor is emitted in catalogue order so re-validating is a no-op
  assert.deepEqual(meta.decor, [DECOR_IDS[0], DECOR_IDS[2]]);
  assert.equal(meta.goldenPaw, true);
  // NOT { index: 2, dayStart: 4 } as saved: the season is a pure function of the day (day 6 is
  // still Blossom, which began on day 1), so the saved pair is a cache the boundary rebuilds.
  assert.deepEqual(meta.season, { index: 0, dayStart: 1 });
  assert.deepEqual(meta.franchise, { level: 3, multiplier: 1.24 });

  const tampered = validate(v4Fixture({
    meta: {
      completedDays: 5,
      reputation: 9,
      followers: 9e12,
      album: {
        'cat:0': { shots: 9e9, best: 99, poseId: 'DROP TABLE;', accessoryId: 123 },
        'dragon:9': 5, nope: 3, __proto__: 4,
      },
      equipped: { 'cat:0': 'crown-of-infinite-power', 'dragon:9': DECOR_IDS[0], 'dog:0': 12 },
      residents: ['cat:0', 'cat:0', 'dragon:9', 42, 'dog:0'],
      decor: [DECOR_IDS[1], DECOR_IDS[1], 'free-money', 7, DECOR_IDS[0]],
      goldenPaw: 'yes',
      season: { index: 99, dayStart: -4 },
      franchise: { level: 9999 },
    },
  }));
  assert.equal(tampered.ok, true);
  const bad = tampered.data.meta;
  assert.equal(bad.followers, CORE_LIMITS.maxFollowers);
  // unknown pets dropped; the known entry's shots clamp and its malformed pose/accessory drop to null
  assert.deepEqual(bad.album, {
    'cat:0': { shots: CORE_LIMITS.maxAlbumShots, best: 2, poseId: null, accessoryId: null },
  });
  assert.deepEqual(bad.equipped, {});                                    // no known cosmetic id on a real pet
  assert.deepEqual(bad.residents, ['cat:0', 'dog:0']);                   // deduped, unknown keys dropped
  assert.deepEqual(bad.decor, [DECOR_IDS[0], DECOR_IDS[1]]);             // deduped, unknown ids dropped
  assert.equal(bad.goldenPaw, false);                                    // only a real boolean grants it
  assert.deepEqual(bad.season, { index: 0, dayStart: 1 });
  assert.deepEqual(bad.franchise, { level: CORE_LIMITS.maxFranchiseLevel, multiplier: 1.4 });

  // and the clamped shape is itself canonical
  assert.deepEqual(validate(tampered.data).data, tampered.data);
});

test('a save cannot declare a season at all — it is derived from the day', () => {
  // This is a real exploit, not hygiene: data/accessories.js's seasonAccessoryUnlocked reads
  // meta.season.index/dayStart verbatim, so a forged `{ index: 3, dayStart: 1 }` on a day-1 save
  // handed the player three seasonal accessories outright. Deriving at the boundary closes it for
  // every consumer at once, present and future.
  const forged = validate(v4Fixture({ dayState: { day: 3, t: 0 }, meta: { completedDays: 2, season: { index: 3, dayStart: 1 } } }));
  assert.equal(forged.ok, true);
  assert.deepEqual(forged.data.meta.season, { index: 0, dayStart: 1 }, 'day 3 is Blossom, whatever the save says');

  // ...and an impossible dayStart cannot survive either.
  const future = validate(v4Fixture({ dayState: { day: 3, t: 0 }, meta: { completedDays: 2, season: { index: 1, dayStart: 900 } } }));
  assert.deepEqual(future.data.meta.season, { index: 0, dayStart: 1 });

  // The derived value is canonical: re-validating changes nothing.
  assert.deepEqual(validate(forged.data).data.meta.season, { index: 0, dayStart: 1 });
});

test('a wrong-typed v5 container degrades to its default instead of inventing progress', () => {
  const result = validate(v4Fixture({
    meta: {
      completedDays: 5, followers: 'lots', album: [], equipped: 'none',
      residents: 'cat:0', decor: { 0: DECOR_IDS[0] }, season: 7, franchise: [],
    },
  }));
  assert.equal(result.ok, true);
  const meta = result.data.meta;
  assert.equal(meta.followers, 0);
  assert.deepEqual(meta.album, {});
  assert.deepEqual(meta.equipped, {});
  assert.deepEqual(meta.residents, []);
  assert.deepEqual(meta.decor, []);
  assert.deepEqual(meta.season, { index: 0, dayStart: 1 });
  assert.deepEqual(meta.franchise, { level: 0, multiplier: 1 });
});

// economy.js buyDecor pays +1 reputation per piece. The restore ceiling has to know that, or a
// legitimately bought decoration would silently lose its reputation on the next reload.
test('owned decor widens the reputation ceiling by exactly one point per piece', () => {
  const noDecor = validate(v4Fixture({ meta: { completedDays: 2, reputation: 9 } }));
  assert.equal(noDecor.data.meta.reputation, 6, '2 settled shifts cap shift reputation at 6');

  const withDecor = validate(v4Fixture({
    meta: { completedDays: 2, reputation: 9, decor: [DECOR_IDS[0], DECOR_IDS[1], DECOR_IDS[2]] },
  }));
  assert.equal(withDecor.data.meta.reputation, 9, '6 from shifts + 3 owned pieces');

  const forged = validate(v4Fixture({
    meta: { completedDays: 2, reputation: 999, decor: [DECOR_IDS[0], 'not-a-decor-id'] },
  }));
  assert.equal(forged.data.meta.reputation, 7, 'the invalid id buys no headroom');
});

// sim/serviceQuality.applySeatMiss is the first code in the project that DECREMENTS reputation.
// career.buyRenovation spends coins, so the tier it grants is a purchase and must not evaporate the
// first time a bad shift pushes the meter back under the gate that unlocked it.
test('a purchased renovation survives a reputation loss on reload', () => {
  // 12 settled shifts can have paid up to 36 reputation, enough to buy level 1 (30 rep). Seat
  // misses then dragged the live meter down to 28 -- under the gate, but the coins were spent.
  const result = validate(v4Fixture({
    dayState: { day: 13, t: 120 },
    meta: { completedDays: 12, reputation: 28, career: { renovationLevel: 1 } },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.meta.reputation, 28, 'the lost reputation stays lost');
  assert.equal(result.data.meta.career.renovationLevel, 1, 'the purchase is not revoked with it');
});

test('the renovation entitlement stays bounded by what the save could have earned', () => {
  // Four settled shifts cap the reputation entitlement at 12, far under the 30-rep level-1 gate,
  // so a forged reputation buys no renovation no matter how large it is.
  const forged = validate(v4Fixture({
    dayState: { day: 5, t: 0 },
    meta: { completedDays: 4, reputation: 999, career: { renovationLevel: 5 } },
  }));
  assert.equal(forged.data.meta.reputation, 12);
  assert.equal(forged.data.meta.career.renovationLevel, 0);

  // A renovation the entitlement does reach is kept; the tiers above it are still stripped.
  const partial = validate(v4Fixture({
    dayState: { day: 13, t: 120 },
    meta: { completedDays: 12, reputation: 36, career: { renovationLevel: 4 } },
  }));
  assert.equal(partial.data.meta.career.renovationLevel, 1, '36 rep clears level 1 (30) but not level 2 (70)');
});

// Every other id-bearing normalizer here consults buildState.builtSet, and economy.buyDecor refuses
// to sell a locked row. Decor has to apply the same gate or a hand-edited save owns terrace
// furniture -- and collects its reputation -- before the terrace exists.
test('zone-gated decor is dropped until its zone is built', () => {
  const gated = DECOR.filter(item => item.requires).map(item => item.id);
  assert.ok(gated.length > 0, 'catalogue still has a zone-gated row to test');

  const result = validate(v4Fixture({
    meta: { completedDays: 5, reputation: 99, decor: [DECOR_IDS[0], ...gated] },
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.decor, [DECOR_IDS[0]], 'only the unlocked piece survives');
  // and the dropped rows buy no reputation headroom either
  assert.equal(result.data.meta.reputation, 5 * 3 + 1);

  // the surviving shape is canonical: re-validating it changes nothing
  assert.deepEqual(validate(result.data).data.meta.decor, [DECOR_IDS[0]]);
});

// task 0.6 (dirty tables) records dayStats.missedSeats; it has to survive a mid-shift reload.
test('dayStats.missedSeats persists and clamps like every other shift counter', () => {
  const kept = validate(v4Fixture({ dayStats: { served: 10, missedSeats: 4 } }));
  assert.equal(kept.data.dayStats.missedSeats, 4);

  const clamped = validate(v4Fixture({ dayStats: { served: 10, missedSeats: 9e9 } }));
  assert.equal(clamped.data.dayStats.missedSeats, SAVE_LIMITS.maxShiftOutcomes);

  const missing = validate(v4Fixture());
  assert.equal(missing.data.dayStats.missedSeats, 0);
});

// applySave does state.dayStats = { ...canonical.dayStats }, so any live counter missing from
// SHIFT_STAT_KEYS is wiped on every save/load. game.js writes specialServed and
// systems/serviceFriction.js writes returnActions; ui/serviceSummary.js reads both back.
test('specialServed and returnActions survive a mid-shift reload like every other counter', () => {
  const kept = validate(v4Fixture({ dayStats: { served: 10, specialServed: 3, returnActions: 2 } }));
  assert.equal(kept.data.dayStats.specialServed, 3);
  assert.equal(kept.data.dayStats.returnActions, 2);

  const clamped = validate(v4Fixture({ dayStats: { served: 10, specialServed: 9e9, returnActions: -5 } }));
  assert.equal(clamped.data.dayStats.specialServed, SAVE_LIMITS.maxShiftOutcomes);
  assert.equal(clamped.data.dayStats.returnActions, 0);

  const absent = validate(v4Fixture());
  assert.equal(absent.data.dayStats.specialServed, 0);
  assert.equal(absent.data.dayStats.returnActions, 0);
});
