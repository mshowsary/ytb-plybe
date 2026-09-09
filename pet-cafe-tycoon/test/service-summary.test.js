import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceSummaryModel } from '../src/ui/serviceSummary.js';

test('clean service summary stays celebratory when there were no misses or losses', () => {
  const m = buildServiceSummaryModel({ served: 18, lost: 0, serviceMisses: 0, returnActions: 0 });
  assert.equal(m.clean, true);
  assert.equal(m.headline, 'CLEAN SERVICE');
  assert.equal(m.returns, 0);
  assert.match(m.tip, /Great rhythm/);
});

// Batch 6: the headline reports the ONE consequence left -- guests who left -- and never the
// chores. The counters themselves stay on the model (other readers and the tests below use them);
// what changed is that recovery moments can no longer become the thing the card shouts.
test('service summary reports lost guests, never recovery moments, and never money deductions', () => {
  const m = buildServiceSummaryModel({ served: 20, lost: 2, serviceMisses: 3, serviceFees: 14, wasteFees: 4, returnActions: 2 });
  assert.equal(m.clean, false);
  assert.equal(m.headline, '2 GUESTS LEFT');
  assert.equal(m.misses, 3);
  assert.equal(m.returns, 2);
  assert.equal(m.lost, 2);
  assert.equal('deductions' in m, false);
  assert.equal('serviceFees' in m, false);
  assert.equal('wasteFees' in m, false);
});

// A shift full of recovery moments and dirty tables but with nobody turned away is a CLEAN shift
// now: the owner's rule is that we never punish the player, and cleaning up after a busy rush is
// not a mistake to be reported back to them.
test('recovery moments and seat misses alone never darken the headline', () => {
  const m = buildServiceSummaryModel({ served: 25, lost: 0, serviceMisses: 20, missedSeats: 10 });
  assert.equal(m.clean, true);
  assert.equal(m.headline, 'CLEAN SERVICE');
  assert.equal(m.misses, 20);
  assert.equal(m.missedSeats, 10);
  assert.match(m.tip, /Great rhythm/);
  assert.doesNotMatch(m.tip, /Wipe seats/);
});

test('a single lost guest reads in the singular and gets a stock tip, not a chore tip', () => {
  const m = buildServiceSummaryModel({ served: 9, lost: 1, serviceMisses: 4, missedSeats: 2 });
  assert.equal(m.headline, '1 GUEST LEFT');
  assert.match(m.tip, /slipped away/);
  assert.doesNotMatch(m.tip, /Wipe seats/);
});

test('summary model sanitizes missing and negative outcome stats', () => {
  const m = buildServiceSummaryModel({ served: -5, serviceMisses: -10, returnActions: -4 });
  assert.equal(m.served, 0);
  assert.equal(m.misses, 0);
  assert.equal(m.returns, 0);
  assert.equal(m.clean, true);
});
