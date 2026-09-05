import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndMigrateSave, TEMPORARY_HELP_VERSION } from '../src/sim/save.js';
import { AREA1 } from '../data/area1.js';
import {
  normalizeTemporaryHelp, makePendingEntitlement,
} from '../src/sim/temporaryHelp.js';

const rushDay = day => ({ day, t: 70, phase: 'rush' });

test('legacy Crew and Pet Break fields migrate into one temporary-help payload', () => {
  const legacy = {
    rushCrew: { role: 'runner', day: 5 },
    petPlayBreak: { day: 5, remaining: 8.5, slots: 2 },
  };
  const result = normalizeTemporaryHelp(null, legacy, rushDay(5));
  assert.equal(result.ok, true);
  assert.equal(result.legacy, true);
  assert.deepEqual(result.data.rushCrew, { role: 'runner', day: 5 });
  assert.deepEqual(
    { day: result.data.petPlayBreak.day, remaining: result.data.petPlayBreak.remaining, slots: result.data.petPlayBreak.slots },
    { day: 5, remaining: 8.5, slots: 2 },
  );
});

test('same-rush Roomba remaining duration survives but stale day/phase is dropped', () => {
  const raw = {
    v: TEMPORARY_HELP_VERSION,
    roomba: { day: 4, remaining: 11.25 },
  };
  const same = normalizeTemporaryHelp(raw, {}, rushDay(4));
  assert.deepEqual(same.data.roomba, { day: 4, remaining: 11.25 });
  assert.equal(normalizeTemporaryHelp(raw, {}, { day: 4, t: 150, phase: 'afternoon' }).data.roomba, null);
  assert.equal(normalizeTemporaryHelp(raw, {}, rushDay(5)).data.roomba, null);
});

test('pending entitlement survives through the next day only', () => {
  const raw = {
    v: TEMPORARY_HELP_VERSION,
    pending: { kind: 'petBreak', earnedDay: 7, duration: 12, slots: 2 },
  };
  assert.deepEqual(normalizeTemporaryHelp(raw, {}, rushDay(7)).data.pending, raw.pending);
  assert.deepEqual(normalizeTemporaryHelp(raw, {}, rushDay(8)).data.pending, raw.pending);
  assert.equal(normalizeTemporaryHelp(raw, {}, rushDay(9)).data.pending, null);
});

test('pending entitlement is bounded and cannot become coins', () => {
  assert.deepEqual(
    makePendingEntitlement({ mode: 'roomba', duration: 999 }, 3),
    { kind: 'roomba', duration: 18, earnedDay: 3 },
  );
  assert.equal(makePendingEntitlement({ mode: 'coins', reward: 999999 }, 3), null);
  const invalid = normalizeTemporaryHelp({
    v: TEMPORARY_HELP_VERSION,
    pending: { kind: 'coins', earnedDay: 3, reward: 999999 },
  }, {}, rushDay(3));
  assert.equal(invalid.ok, true);
  assert.equal(invalid.data.pending, null);
});

test('save validator rejects unsupported temporary-help versions', () => {
  const result = validateAndMigrateSave({
    v: 4,
    dayState: { day: 4, t: 70 },
    temporaryHelp: { v: 99 },
  }, AREA1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'temporaryHelp:version');
});

test('save validator canonicalizes Crew, Break, Roomba and pending without inventing reward value', () => {
  const result = validateAndMigrateSave({
    v: 4,
    dayState: { day: 4, t: 70 },
    temporaryHelp: {
      v: TEMPORARY_HELP_VERSION,
      rushCrew: { role: 'cashier', day: 4 },
      petPlayBreak: { day: 4, remaining: 7, slots: 2 },
      roomba: { day: 4, remaining: 9 },
      pending: { kind: 'roomba', earnedDay: 4, duration: 13 },
    },
  }, AREA1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.temporaryHelp.rushCrew, { role: 'cashier', day: 4 });
  assert.equal(result.data.temporaryHelp.petPlayBreak.remaining, 7);
  assert.deepEqual(result.data.temporaryHelp.roomba, { day: 4, remaining: 9 });
  assert.deepEqual(result.data.temporaryHelp.pending, { kind: 'roomba', earnedDay: 4, duration: 13 });
  assert.equal(result.data.coins, 0);
});
