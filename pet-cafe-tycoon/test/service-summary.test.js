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

test('service summary explains outcomes without converting them into money deductions', () => {
  const m = buildServiceSummaryModel({ served: 20, lost: 2, serviceMisses: 3, serviceFees: 14, wasteFees: 4, returnActions: 2 });
  assert.equal(m.clean, false);
  assert.equal(m.headline, '3 SERVICE RECOVERIES');
  assert.equal(m.misses, 3);
  assert.equal(m.returns, 2);
  assert.equal(m.lost, 2);
  assert.equal('deductions' in m, false);
  assert.equal('serviceFees' in m, false);
  assert.equal('wasteFees' in m, false);
});

test('summary model sanitizes missing and negative outcome stats', () => {
  const m = buildServiceSummaryModel({ served: -5, serviceMisses: -10, returnActions: -4 });
  assert.equal(m.served, 0);
  assert.equal(m.misses, 0);
  assert.equal(m.returns, 0);
  assert.equal(m.clean, true);
});
