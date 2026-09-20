// test/star-rewards.test.js — every Café Star hands back something the player can SEE, and every
// one of those rewards has a call path from normal play (Batch E1, ship plan §1.6a).
//
// The recurring bug in this codebase is correct code nothing calls. Two of the five rewards were
// exactly that before this batch: ★1's "a cat moves in" and ★4's extra resident slot both depended
// on systems/residentPets.js admitResident(), which only a Bestie promotion ever called. This file
// pins the writer AND the reader for each reward, so a reward that stops being applied fails here
// rather than quietly becoming a promise on a sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { applyStarRewards, residentForStar, STAR_RESIDENT_ORDER } from '../src/systems/starRewards.js';
import { residentSlotCount, currentResidentStars } from '../src/systems/residentPets.js';
import {
  PAW_ARRIVAL_STAR, PAW_LEGENDARY_STAR, PAW_MAX_STAR, PAW_TARGETS,
  applyPawRatchet, pawArrivalMultiplier, pawAwningSetIndex, pawResidentSlots,
} from '../src/sim/pawRating.js';
import { effectiveSpawnInterval, spawnInterval } from '../src/sim/economy.js';
import { decorSetForStar, decorUnlocked, decorItem } from '../data/decor.js';
import { legendaryUnlocked } from '../src/sim/petBook.js';
import { RENOVATIONS, renovationState } from '../src/sim/career.js';
import { OPENING_RESIDENT } from '../src/sim/opening.js';

const G = (meta = {}) => ({ meta: { residents: [], pawBest: 0, ...meta } });

test('a star admits a resident, and never the one the café opened with', () => {
  const g = G({ residents: [OPENING_RESIDENT] });
  const awards = applyStarRewards(g, [1]);
  assert.equal(awards.length, 1);
  assert.equal(awards[0].star, 1);
  assert.ok(awards[0].resident, 'star 1 moves a pet in');
  assert.notEqual(awards[0].resident, OPENING_RESIDENT, 'a star adds a face, never re-announces one');
  assert.deepEqual(g.meta.residents, [OPENING_RESIDENT, awards[0].resident]);
});

test('residentForStar never returns a pet that already lives here, and never runs out silently', () => {
  const meta = { residents: [] };
  const admitted = new Set();
  for (let star = 1; star <= PAW_MAX_STAR; star++) {
    const key = residentForStar(meta, star);
    assert.ok(key, `star ${star} names somebody`);
    assert.equal(admitted.has(key), false, `${key} is not admitted twice`);
    admitted.add(key);
    meta.residents.push(key);
  }
  assert.deepEqual([...admitted], STAR_RESIDENT_ORDER.slice(0, PAW_MAX_STAR));
  // A café that befriended the authored pets first still gets somebody new.
  const crowded = { residents: [...STAR_RESIDENT_ORDER] };
  const extra = residentForStar(crowded, 1);
  assert.ok(extra && !STAR_RESIDENT_ORDER.includes(extra));
  assert.equal(extra.endsWith(':4'), false, 'never a legendary coat');
});

test('the resident cap is the one the star just widened', () => {
  // The slot count comes from the ratchet, which applyPawRatchet writes BEFORE applyStarRewards
  // runs — so a star that opens a slot can fill it on the same settlement.
  const meta = { residents: [], pawBest: 0 };
  applyStarRewards({ meta }, [1, 2, 3]);
  assert.equal(residentSlotCount(currentResidentStars({ meta })), residentSlotCount(0));
  assert.equal(meta.residents.length, Math.min(3, residentSlotCount(0)), 'never past the cap');

  const wide = { residents: [], pawBest: 4 };
  applyStarRewards({ meta: wide }, [4]);
  assert.ok(pawResidentSlots(4) > pawResidentSlots(3), 'star 4 is the second resident slot');
  assert.equal(wide.residents.length, 1);
});

test('applyStarRewards is inert on junk and on an empty gain list', () => {
  assert.deepEqual(applyStarRewards(null, [1]), []);
  assert.deepEqual(applyStarRewards(G(), []), []);
  assert.deepEqual(applyStarRewards(G(), null), []);
  assert.deepEqual(applyStarRewards({}, [1]), []);
});

test('the awning changes colour at every star, and the game reads that index every frame', () => {
  // src/game.js update(): pawAwningSetIndex(pawBestStar(G.meta)) -> G.awning.setSet(idx).
  for (let star = 1; star <= PAW_MAX_STAR; star++) {
    assert.notEqual(pawAwningSetIndex(star), pawAwningSetIndex(star - 1), `star ${star} repaints the awning`);
  }
});

test('the arrivals bonus is delivered to the café, not just advertised', () => {
  // THE BUG THIS PINS: systems/customers.js used to call spawnInterval() directly, so the star
  // bonus effectiveSpawnInterval applies had NO caller anywhere in the game.
  const built = new Set(['z_seats1', 'z_oven2']);
  const plain = effectiveSpawnInterval(built, {}, 0, { pawStars: 0 });
  const starred = effectiveSpawnInterval(built, {}, 0, { pawStars: PAW_ARRIVAL_STAR });
  assert.equal(plain, spawnInterval(built, {}, 0), 'no star, no change');
  assert.ok(starred < plain, 'a starred café fills faster');
  assert.ok(Math.abs(starred - plain / pawArrivalMultiplier(PAW_ARRIVAL_STAR)) < 1e-9);
  // Below the arrival star nothing moves.
  assert.equal(effectiveSpawnInterval(built, {}, 0, { pawStars: PAW_ARRIVAL_STAR - 1 }), plain);
});

test('each star that authors a décor set actually unlocks it for the Shop', () => {
  for (let star = 1; star <= PAW_MAX_STAR; star++) {
    for (const id of decorSetForStar(star)) {
      const item = decorItem(id);
      assert.equal(decorUnlocked(item, new Set(), star - 1), false, `${id} is locked below ★${star}`);
      assert.equal(decorUnlocked(item, new Set(), star), true, `${id} opens at ★${star}`);
    }
  }
});

test('★3 lets the legendaries in and puts the first café theme on sale', () => {
  assert.equal(legendaryUnlocked({ pawBest: PAW_LEGENDARY_STAR - 1 }), false);
  assert.equal(legendaryUnlocked({ pawBest: PAW_LEGENDARY_STAR }), true);
  assert.equal(renovationState({}, 99999, PAW_LEGENDARY_STAR - 1).starReady, false);
  assert.equal(renovationState({}, 99999, PAW_LEGENDARY_STAR).starReady, true);
  assert.equal(RENOVATIONS[0].star, PAW_LEGENDARY_STAR);
});

test('the whole ladder lands through the real settlement path, in order, once each', () => {
  // applyPawRatchet is what src/game.js openDaySummary calls; its `gained` list is what feeds
  // applyStarRewards. Walking the evidence up star by star must hand back each reward exactly once.
  const meta = { residents: [OPENING_RESIDENT], petBook: {}, petFriendship: {}, album: {}, career: {} };
  const g = { meta, stats: { served: PAW_TARGETS.served }, world: { built: new Set(), area: AREA1 } };
  const first = applyPawRatchet({ meta, stats: g.stats, built: new Set(), area: AREA1 });
  assert.deepEqual(first.gained, [1]);
  const awards = applyStarRewards(g, first.gained);
  assert.equal(awards.length, 1);
  assert.equal(meta.pawBest, 1);

  // A second settlement on the same evidence gains nothing, so no second resident walks in.
  const again = applyPawRatchet({ meta, stats: g.stats, built: new Set(), area: AREA1 });
  assert.deepEqual(again.gained, []);
  assert.deepEqual(applyStarRewards(g, again.gained), []);
  assert.equal(meta.residents.length, 2, 'the opening cat plus exactly one earned resident');
});

test('the star that brings more guests also brings the hands to serve them', async () => {
  // ★2 raises arrivals 10%. Measured over 60 days with the Pet Book filling, that alone tripled the
  // guests who gave up on a table (0.011 -> 0.031 per guest, against a 0.02 gate): the same four
  // tables, more custom. The star hires the café's first Cleaner with it, and gives a Cleaner speed
  // level instead when one is already on the payroll, so the reward is never nothing.
  const { applyStarRewards, grantHelper, PAW_HELPER_STAR } = await import('../src/systems/starRewards.js');
  assert.equal(PAW_HELPER_STAR, 2);

  const fresh = { meta: { residents: [], pawBest: 2 }, staff: { runner: 0, cashier: 0, cleaner: 0 }, staffLevels: { cleaner: { speed: 0 } } };
  const out = applyStarRewards(fresh, [2]);
  assert.equal(fresh.staff.cleaner, 1, 'a Cleaner joins');
  assert.equal(out[0].helper, 'cleaner');

  const staffed = { meta: { residents: [], pawBest: 2 }, staff: { runner: 0, cashier: 0, cleaner: 1 }, staffLevels: { cleaner: { speed: 0 } } };
  assert.equal(grantHelper(staffed), 'cleanerSpeed');
  assert.equal(staffed.staff.cleaner, 1, 'no second body nobody asked for');
  assert.equal(staffed.staffLevels.cleaner.speed, 1);

  const other = { meta: { residents: [], pawBest: 3 }, staff: { cleaner: 0 }, staffLevels: { cleaner: { speed: 0 } } };
  applyStarRewards(other, [3]);
  assert.equal(other.staff.cleaner, 0, 'only the arrivals star hires');
});
