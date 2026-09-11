// Seasons look-and-feel pass: garden/terrace re-tint (src/render/environment.js), one festival day
// per season reusing the existing THEMES (src/sim/specialDays.js), and each season's signature
// accessory unlock (data/accessories.js). See each file's own header comment for the seasons.js
// consumption assumption -- that module was being authored in parallel and does not exist yet, so
// every entry point under test here takes a season id/index as a plain argument rather than
// importing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnvironment, SEASON_IDS, paletteForSeason, GARDEN_PALETTE,
} from '../src/render/environment.js';
import {
  SEASON_FESTIVAL_IDS, seasonFestivalDay, specialForDaySeasoned, specialForDay, SPECIALS_START_DAY,
} from '../src/sim/specialDays.js';
import {
  ACCESSORY_IDS, SEASON_ACCESSORY_IDS, SEASON_PLAYTHROUGH_DAYS,
  accessoryUnlocked, seasonAccessoryUnlocked,
} from '../data/accessories.js';
import { FOLLOWER_MILESTONES } from '../src/sim/followers.js';

const AREA = { size: { w: 20, d: 14 }, regions: [{ id: 'terrace', x0: -10, x1: 10, z0: 7.4, z1: 14 }] };

function findLitMesh(group) {
  return group.children.find(c => c !== group.garden && c !== group.deck && c.geometry);
}

// ---- environment.js: the four seasons, and the seeded-layout guarantee -------------------------

test('SEASON_IDS names exactly the four seasons, index-matched to saveSchema/accessories', () => {
  assert.deepEqual(SEASON_IDS, ['blossom', 'splash', 'harvest', 'lights']);
});

test('paletteForSeason falls back to GARDEN_PALETTE (Blossom) for blossom and for an unknown id', () => {
  assert.equal(paletteForSeason('blossom'), GARDEN_PALETTE);
  assert.equal(paletteForSeason('not-a-season'), GARDEN_PALETTE);
  assert.equal(paletteForSeason(undefined), GARDEN_PALETTE);
});

test('every non-blossom season re-tints flowers, tree crowns and the garland, all differently', () => {
  const seen = new Set();
  for (const id of SEASON_IDS) {
    const p = paletteForSeason(id);
    assert.ok(Array.isArray(p.stringLight) && p.stringLight.length > 0, `${id} needs a garland colour`);
    const key = JSON.stringify([p.petalPink, p.petalSun, p.petalViolet, p.foliage, p.stringLight]);
    assert.ok(!seen.has(key), `${id}'s flower/foliage/garland set must be distinct from every other season`);
    seen.add(key);
  }
});

// The four palettes above were all provably distinct BEFORE the in-frame pass, and the game still
// looked the same in three seasons out of four, because every field they differed on lived on
// geometry the default camera does not frame once the terrace is bought. These two tests pin the
// fields the in-frame pass added -- the deck tint and the deck litter, which between them cover
// most of the screen. See test/season-visible.test.js for the placement side of the same fix.
test('every season names the in-frame fields too: a deck tint and a litter set', () => {
  for (const id of SEASON_IDS) {
    const p = paletteForSeason(id);
    for (const key of ['deckPlank', 'deckBase', 'deckBorder']) {
      assert.match(p[key], /^#[0-9A-Fa-f]{6}$/, `${id} needs a ${key} or the deck cannot re-tint`);
    }
    assert.ok(Array.isArray(p.litter) && p.litter.length >= 3, `${id} needs a litter set`);
  }
});

test("Blossom's deck values are exactly the literals props.js buildRegion falls back to", () => {
  // If these two drift apart, an un-palettised deck stops matching the shipped Blossom look and
  // nobody notices until a screenshot.
  assert.equal(GARDEN_PALETTE.deckBorder, '#E6E0D6');
  assert.equal(GARDEN_PALETTE.deckBase, '#C69A6B');
  assert.equal(GARDEN_PALETTE.deckPlank, '#D9B48A');
});

test('a season swap re-tints the garden WITHOUT rearranging it: positions identical, colours differ', () => {
  const group = buildEnvironment(AREA, 'blossom');
  const before = findLitMesh(group).geometry.getAttribute('position').array.slice();
  const colorBefore = findLitMesh(group).geometry.getAttribute('color').array.slice();

  group.setSeason('harvest');
  const after = findLitMesh(group).geometry.getAttribute('position').array;
  const colorAfter = findLitMesh(group).geometry.getAttribute('color').array;

  assert.equal(after.length, before.length, 'vertex count must not change across a season swap');
  for (let i = 0; i < before.length; i++) {
    assert.ok(Math.abs(before[i] - after[i]) < 1e-9, `vertex ${i} moved on a season swap (index ${i})`);
  }
  assert.equal(colorAfter.length, colorBefore.length);
  let colorChanged = false;
  for (let i = 0; i < colorBefore.length; i++) if (colorBefore[i] !== colorAfter[i]) { colorChanged = true; break; }
  assert.ok(colorChanged, 'colours must actually change on a season swap');
});

test('the always-visible ring and the terrace-footprint garden both survive a reseason, and the terrace toggle still works', () => {
  const group = buildEnvironment(AREA, 'splash');
  assert.ok(group.garden && group.deck, 'garden/deck groups must exist regardless of season');
  assert.equal(group.deck.visible, false);
  group.setTerraceBuilt(true);
  assert.equal(group.garden.visible, false);
  assert.equal(group.deck.visible, true);
  group.setSeason('lights'); // must not throw or reset the terrace toggle
  assert.equal(group.garden.visible, false);
  assert.equal(group.deck.visible, true);
});

test('setSeason is a no-op when the id has not changed (idempotent, no needless rebuild)', () => {
  const group = buildEnvironment(AREA, 'blossom');
  const mesh1 = findLitMesh(group);
  group.setSeason('blossom');
  assert.equal(findLitMesh(group), mesh1, 'the same season id must not rebuild the mesh');
});

test('an unrecognised season id falls back to Blossom instead of throwing', () => {
  assert.doesNotThrow(() => buildEnvironment(AREA, 'nope'));
  const group = buildEnvironment(AREA, 'nope');
  const blossomColor = findLitMesh(buildEnvironment(AREA, 'blossom')).geometry.getAttribute('color').array;
  const fallbackColor = findLitMesh(group).geometry.getAttribute('color').array;
  assert.deepEqual(Array.from(fallbackColor), Array.from(blossomColor));
});

// ---- specialDays.js: one festival day per season, reusing THEMES --------------------------------

test('SEASON_FESTIVAL_IDS matches SEASON_IDS one for one', () => {
  assert.deepEqual(SEASON_FESTIVAL_IDS, SEASON_IDS);
});

test('every season has exactly one festival day, and it forces a themed day even off the normal roll', () => {
  for (const id of SEASON_FESTIVAL_IDS) {
    const day = seasonFestivalDay(id, 1);
    assert.ok(day >= SPECIALS_START_DAY, `${id} festival must not land before specials start`);
    const forced = specialForDaySeasoned(day, id, 1);
    assert.ok(forced && forced.festival === id, `${id} festival day must be tagged with its season`);
    // Every season's forced theme is a real THEMES entry, not an invented shape.
    assert.equal(typeof forced.id, 'string');
    assert.ok(forced.reward > 0);
  }
});

test('a festival day pays more than an ordinary themed day would for the same theme', () => {
  const day = seasonFestivalDay('splash', 1); // splash's theme (berry-blast) also exists as a plain roll
  const forced = specialForDaySeasoned(day, 'splash', 1);
  const plainBonus = 140 + 15 * Math.min(12, day - SPECIALS_START_DAY); // berry-blast's own baseBonus
  assert.ok(forced.reward > plainBonus, 'festival reward should read as richer, not throttled');
});

test("the festival theme per season matches src/sim/seasons.js's SEASON_CONTENT[id].specialThemeId", () => {
  // Duplicated verbatim rather than imported (see specialDays.js's own reconciliation note) --
  // this test is the tripwire if the two tables are ever edited out of sync.
  const expected = { blossom: 'bunnybrunch', splash: 'berry-blast', harvest: 'sweet-tooth', lights: 'latte-rush' };
  for (const id of SEASON_FESTIVAL_IDS) {
    const day = seasonFestivalDay(id, 1);
    assert.equal(specialForDaySeasoned(day, id, 1).id, expected[id], `${id} festival theme drifted from seasons.js`);
  }
});

test('a day that is not the festival day behaves exactly like the un-seasoned roll', () => {
  const day = 12;
  for (const id of SEASON_FESTIVAL_IDS) {
    if (day === seasonFestivalDay(id, 1)) continue;
    assert.deepEqual(specialForDaySeasoned(day, id, 1), specialForDay(day));
  }
});

test('a festival cannot fire before specials exist, and an unknown season id is a safe no-op', () => {
  assert.equal(specialForDaySeasoned(2, 'blossom', 1), null);
  assert.deepEqual(specialForDaySeasoned(5, 'not-a-season', 1), specialForDay(5));
});

// ---- accessories.js: season playthrough as a second unlock path ---------------------------------

test('SEASON_ACCESSORY_IDS names four real, distinct accessory ids in season order', () => {
  assert.equal(SEASON_ACCESSORY_IDS.length, 4);
  for (const id of SEASON_ACCESSORY_IDS) assert.ok(ACCESSORY_IDS.includes(id), `${id} must be a real accessory`);
  assert.equal(new Set(SEASON_ACCESSORY_IDS).size, 4, 'no accessory should double up across seasons');
});

test('a season already left behind unlocks its item regardless of elapsed days', () => {
  const id = SEASON_ACCESSORY_IDS[0]; // Blossom's item
  const meta = { followers: 0, season: { index: 1, dayStart: 6 } }; // now on Splash
  assert.equal(seasonAccessoryUnlocked(id, meta, 6), true);
});

test('the active season only unlocks its item once SEASON_PLAYTHROUGH_DAYS have elapsed', () => {
  const id = SEASON_ACCESSORY_IDS[1]; // Splash's item
  const meta = { followers: 0, season: { index: 1, dayStart: 10 } };
  assert.equal(seasonAccessoryUnlocked(id, meta, 10 + SEASON_PLAYTHROUGH_DAYS - 1), false);
  assert.equal(seasonAccessoryUnlocked(id, meta, 10 + SEASON_PLAYTHROUGH_DAYS), true);
});

test('a season that has not started yet never unlocks its item early', () => {
  const id = SEASON_ACCESSORY_IDS[3]; // Lights' item
  const meta = { followers: 0, season: { index: 0, dayStart: 1 } };
  assert.equal(seasonAccessoryUnlocked(id, meta, 9999), false);
});

test('the seasonal path never revokes or replaces the original follower-tier unlock', () => {
  const id = SEASON_ACCESSORY_IDS[2]; // Harvest's item, tier 1 (Scarf)
  const highFollowers = { followers: FOLLOWER_MILESTONES[0], season: { index: 0, dayStart: 1 } };
  assert.equal(accessoryUnlocked(id, highFollowers), true, 'follower-tier gate must still work unassisted');
});

test('accessoryUnlocked ORs the follower gate with the seasonal gate', () => {
  const id = SEASON_ACCESSORY_IDS[0];
  const neitherYet = { followers: 0, season: { index: 0, dayStart: 20 } };
  assert.equal(accessoryUnlocked(id, neitherYet, 20), false);
  const seasonalOnly = { followers: 0, season: { index: 1, dayStart: 1 } }; // Blossom over
  assert.equal(accessoryUnlocked(id, seasonalOnly), true);
});

test('a season already completed in a PREVIOUS 4-season cycle unlocks even though the index has wrapped back around', () => {
  // Day 35: seasons.js's seasonForDay(35) is back to Blossom (index 0, dayStart 29) -- but Splash,
  // Harvest and Lights of the cycle before it (days 8-28) are all long since played, not "not yet
  // reached". Every one of them must still read as unlocked from meta.season alone.
  const wrapped = { followers: 0, season: { index: 0, dayStart: 29 } };
  for (const id of [SEASON_ACCESSORY_IDS[1], SEASON_ACCESSORY_IDS[2], SEASON_ACCESSORY_IDS[3]]) {
    assert.equal(seasonAccessoryUnlocked(id, wrapped), true, `${id} from the prior cycle must stay unlocked`);
  }
  // Blossom itself (index 0) already had a full occurrence in the cycle before this one (days 1-7),
  // so it is ALSO already unlocked on day 29 -- the new cycle restarting it doesn't re-lock it.
  assert.equal(seasonAccessoryUnlocked(SEASON_ACCESSORY_IDS[0], wrapped, 29), true);
});

test('an unknown id is never seasonally unlocked, and a missing/foreign meta never crashes', () => {
  assert.equal(seasonAccessoryUnlocked('not-a-real-id', { season: { index: 3, dayStart: 1 } }, 999), false);
  assert.equal(seasonAccessoryUnlocked(SEASON_ACCESSORY_IDS[0], undefined, 999), false);
  assert.equal(seasonAccessoryUnlocked(SEASON_ACCESSORY_IDS[0], {}, 999), false);
});
