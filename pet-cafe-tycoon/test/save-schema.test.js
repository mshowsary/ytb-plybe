import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  applySave, CURRENT_SAVE_VERSION, SAVE_LIMITS, validateAndMigrateSave,
} from '../src/sim/save.js';
import { createYouTubePlatform, LOAD_STATUS } from '../src/platform/youtube.js';

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
  assert.deepEqual(save.upgrades, { speed: 3, carry: 0, income: 2 });
  assert.deepEqual(save.staff, { runner: 2, cashier: 1, cleaner: 0, barista: 1 });
  assert.deepEqual(save.staffLevels, {
    runner: { speed: 3, carry: 0 }, cashier: { speed: 3 }, cleaner: { speed: 0 },
  });
  assert.deepEqual(save.machineLevels, { oven: 3, coffee: 0, display: 2 });

  // z_coffee is deliberately orphaned: the saved set omitted its required z_hire predecessor.
  assert.deepEqual(save.builds.a1, ['z_seats1', 'z_oven2', 'z_register2']);
  assert.deepEqual(save.partial, { z_hire: 200 });
  assert.deepEqual(save.stars, { oven1: 3 });

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
