import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  PET_KEEPSAKE_VERSION,
  awardFirstBestieKeepsake,
  firstBestieKey,
  normalizePetKeepsake,
  parsePetKey,
} from '../src/sim/petBook.js';
import { applySave, validateAndMigrateSave } from '../src/sim/save.js';
import { createRenovationDecor, keepsakeRevealPose } from '../src/render/renovation.js';

test('Task 36: keepsake IDs are stable authored pet keys only', () => {
  assert.equal(parsePetKey('cat:0').profile.name, 'Marmalade');
  assert.equal(parsePetKey('dog:3').profile.name, 'Bluebell');
  assert.equal(parsePetKey('bunny:2').profile.name, 'Lilac');
  for (const bad of ['cat:9', 'ferret:0', 'cat:-1', 'cat:1:2', '', null, 12]) assert.equal(parsePetKey(bad), null);
});

test('Task 36: deterministic legacy migration chooses the first authored Bestie only', () => {
  const meta = {
    petBook: {},
    petFriendship: { 'dog:1': 15, 'cat:3': 10, 'bunny:0': 99 },
  };
  assert.equal(firstBestieKey(meta), 'cat:3');
  assert.deepEqual(normalizePetKeepsake(null, meta), { v: PET_KEEPSAKE_VERSION, key: 'cat:3' });
});

test('Task 36: save validation rejects unearned portrait IDs even when syntactically valid', () => {
  const notBestie = { petBook: {}, petFriendship: { 'dog:2': 9 } };
  assert.equal(normalizePetKeepsake({ v: PET_KEEPSAKE_VERSION, key: 'dog:2' }, notBestie), null);

  const earned = { petBook: {}, petFriendship: { 'dog:2': 10 } };
  assert.deepEqual(
    normalizePetKeepsake({ v: PET_KEEPSAKE_VERSION, key: 'dog:2' }, earned),
    { v: PET_KEEPSAKE_VERSION, key: 'dog:2' },
  );
});

test('Task 36: the first Bestie wins forever and later Besties cannot replace it', () => {
  const first = awardFirstBestieKeepsake(null, 'bunny:0');
  assert.equal(first.changed, true);
  assert.deepEqual(first.data, { v: PET_KEEPSAKE_VERSION, key: 'bunny:0' });

  const repeat = awardFirstBestieKeepsake(first.data, 'bunny:0');
  assert.equal(repeat.changed, false);
  assert.deepEqual(repeat.data, first.data);

  const later = awardFirstBestieKeepsake(first.data, 'dog:3');
  assert.equal(later.changed, false);
  assert.deepEqual(later.data, first.data);
});

function sparseSave(meta = {}, petKeepsake = undefined) {
  return {
    v: 4,
    coins: 100,
    builds: { a1: [] },
    upgrades: {}, staff: {}, stats: {}, settings: {},
    meta,
    ...(petKeepsake === undefined ? {} : { petKeepsake }),
  };
}

test('Task 36: canonical host save gate migrates an older Bestie save and applySave restores it', () => {
  const raw = sparseSave({
    petBook: { 'dog:2': 1 },
    petFriendship: { 'dog:2': 12 },
  });
  const checked = validateAndMigrateSave(raw, AREA1);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.data.petKeepsake, { v: PET_KEEPSAKE_VERSION, key: 'dog:2' });

  const state = { coins: 0, up: {}, staff: {}, stats: {}, settings: {} };
  const canonical = applySave(state, raw, AREA1);
  assert.ok(canonical);
  assert.deepEqual(state.petKeepsake, { v: PET_KEEPSAKE_VERSION, key: 'dog:2' });
  assert.notEqual(state.petKeepsake, canonical.petKeepsake, 'runtime owns a defensive copy');
});

test('Task 36: forged saved key falls back to the actually earned first Bestie', () => {
  const raw = sparseSave(
    { petBook: { 'cat:0': 1, 'dog:3': 1 }, petFriendship: { 'cat:0': 10, 'dog:3': 2 } },
    { v: PET_KEEPSAKE_VERSION, key: 'dog:3' },
  );
  const checked = validateAndMigrateSave(raw, AREA1);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.data.petKeepsake, { v: PET_KEEPSAKE_VERSION, key: 'cat:0' });
});

test('Task 36: portrait-to-wall curve starts at the visit and ends exactly at wall home', () => {
  const from = { x: -3.2, y: 1.2, z: 1.7 };
  const home = { x: 9.7, y: 1.78, z: 4.55 };
  const start = keepsakeRevealPose(0, from, home);
  const middle = keepsakeRevealPose(0.5, from, home);
  const end = keepsakeRevealPose(1, from, home);
  assert.deepEqual({ x: start.x, y: start.y, z: start.z }, from);
  assert.ok(middle.y > Math.max(from.y, home.y), 'memory card should lift visibly during flight');
  assert.deepEqual({ x: end.x, y: end.y, z: end.z }, home);
  assert.equal(end.scale, 1);
  assert.ok(Math.abs(end.rotationZ) < 1e-10);
});

test('Task 36: one reusable portrait owns all geometry and repeat sync/reveal cannot duplicate it', () => {
  const decor = createRenovationDecor(AREA1);
  const childCount = decor.keepsake.children.length;
  const groupCount = decor.group.children.length;
  assert.equal(decor.keepsake.visible, false);

  assert.equal(decor.setKeepsake('cat:0'), true);
  assert.equal(decor.keepsake.visible, true);
  assert.equal(decor.keepsakeKey, 'cat:0');
  assert.equal(decor.setKeepsake('cat:0'), false);
  assert.equal(decor.keepsake.children.length, childCount);
  assert.equal(decor.group.children.length, groupCount);

  // A second species can recolor/repose the same fixed children, but never append geometry.
  assert.equal(decor.setKeepsake('dog:1'), true);
  assert.equal(decor.keepsake.children.length, childCount);
  assert.equal(decor.group.children.length, groupCount);

  // The live award contract prevents replacement; render itself is also idempotent for same-key reveals.
  assert.equal(decor.revealKeepsake('dog:1', { x: 0, y: 1, z: 0 }, false), false);
  assert.equal(decor.keepsake.children.length, childCount);
});

test('Task 36: reveal animates only the portrait and settles without replay state', () => {
  const decor = createRenovationDecor(AREA1);
  const source = { x: -2, y: 1.2, z: 2 };
  assert.equal(decor.revealKeepsake('bunny:3', source, false), true);
  assert.equal(decor.keepsakeRevealing, true);
  assert.equal(decor.keepsake.position.x, source.x);
  assert.equal(decor.keepsake.position.z, source.z);

  for (let i = 0; i < 12; i++) decor.update(0.1);
  assert.equal(decor.keepsakeRevealing, false);
  assert.equal(decor.keepsakeKey, 'bunny:3');
  assert.equal(decor.keepsake.scale.x, 1);
  assert.equal(decor.keepsake.scale.y, 1);
  assert.equal(decor.keepsake.scale.z, 1);
});
