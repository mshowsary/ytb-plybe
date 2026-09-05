import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceSummaryModel } from '../src/ui/serviceSummary.js';

test('clean service summary stays celebratory when there were no misses, losses or waste', () => {
  const m = buildServiceSummaryModel({ served: 18, lost: 0, serviceMisses: 0, serviceFees: 0, wasteFees: 0 });
  assert.equal(m.clean, true);
  assert.equal(m.headline, 'CLEAN SERVICE');
  assert.equal(m.deductions, 0);
  assert.match(m.tip, /Great rhythm/);
});

test('service summary explains recoveries without inventing extra deductions', () => {
  const m = buildServiceSummaryModel({ served: 20, lost: 2, serviceMisses: 3, serviceFees: 14, wasteFees: 4 });
  assert.equal(m.clean, false);
  assert.equal(m.headline, '3 SERVICE RECOVERIES');
  assert.equal(m.serviceFees, 14);
  assert.equal(m.wasteFees, 4);
  assert.equal(m.deductions, 18);
  assert.equal(m.lost, 2);
});

test('summary model sanitizes missing and negative stats', () => {
  const m = buildServiceSummaryModel({ served: -5, serviceFees: -10 });
  assert.equal(m.served, 0);
  assert.equal(m.serviceFees, 0);
  assert.equal(m.deductions, 0);
  assert.equal(m.clean, true);
});
