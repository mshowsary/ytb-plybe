import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceSummaryModel } from '../src/ui/serviceSummary.js';

// Batch D: the day summary reports gains and never lectures. The model's headline ("2 GUESTS LEFT")
// and its tip sentence ("A few guests slipped away — a little more stock before the rush") are gone
// with the card rows that drew them; what stays pinned is that the outcome counters are still
// counted, never turned into money, and never into a sentence.
const NO_PROSE = m => { for (const k of ['headline', 'tip']) assert.equal(k in m, false, `the model carries no ${k}`); };

test('a clean day is clean, and the model carries no sentence', () => {
  const m = buildServiceSummaryModel({ served: 18, lost: 0, serviceMisses: 0, returnActions: 0 });
  assert.equal(m.clean, true);
  assert.equal(m.returns, 0);
  NO_PROSE(m);
});

// Batch 6: the one consequence left is guests who left, and it is counted, never charged.
test('service summary counts lost guests, never recovery moments as money, and never deductions', () => {
  const m = buildServiceSummaryModel({ served: 20, lost: 2, serviceMisses: 3, serviceFees: 14, wasteFees: 4, returnActions: 2 });
  assert.equal(m.clean, false);
  assert.equal(m.misses, 3);
  assert.equal(m.returns, 2);
  assert.equal(m.lost, 2);
  assert.equal('deductions' in m, false);
  assert.equal('serviceFees' in m, false);
  assert.equal('wasteFees' in m, false);
  NO_PROSE(m);
});

// A shift full of recovery moments and dirty tables but with nobody turned away is a CLEAN shift:
// cleaning up after a busy rush is not a mistake to be reported back to the player.
test('recovery moments and seat misses alone never make a day unclean', () => {
  const m = buildServiceSummaryModel({ served: 25, lost: 0, serviceMisses: 20, missedSeats: 10 });
  assert.equal(m.clean, true);
  assert.equal(m.misses, 20);
  assert.equal(m.missedSeats, 10);
  NO_PROSE(m);
});

test('a lost guest is counted, never lectured', () => {
  const m = buildServiceSummaryModel({ served: 9, lost: 1, serviceMisses: 4, missedSeats: 2 });
  assert.equal(m.lost, 1);
  assert.equal(m.clean, false);
  NO_PROSE(m);
});

test('summary model sanitizes missing and negative outcome stats', () => {
  const m = buildServiceSummaryModel({ served: -5, serviceMisses: -10, returnActions: -4 });
  assert.equal(m.served, 0);
  assert.equal(m.misses, 0);
  assert.equal(m.returns, 0);
  assert.equal(m.clean, true);
});

// The summary's "new pets" chip: today's discoveries, against the reading taken at the start of the
// shift. Null — not 0 — when the shift cannot prove it (a save restored mid-day drops petsStart).
test('new pets met today are the discoveries since the shift began, or unknown', () => {
  assert.equal(buildServiceSummaryModel({ petsStart: 5 }, { petDiscoveries: 8 }).newPets, 3);
  assert.equal(buildServiceSummaryModel({ petsStart: 8 }, { petDiscoveries: 8 }).newPets, 0);
  assert.equal(buildServiceSummaryModel({}, { petDiscoveries: 8 }).newPets, null);
  assert.equal(buildServiceSummaryModel({ petsStart: 5 }, null).newPets, null);
  assert.equal(buildServiceSummaryModel({ petsStart: 9 }, { petDiscoveries: 8 }).newPets, 0, 'never negative');
});
