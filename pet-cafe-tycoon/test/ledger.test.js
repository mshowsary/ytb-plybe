import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from '../src/sim/ledger.js';

test('ledger separates sale accrual from wallet collection', () => {
  const ledger = createLedger(null, { day: 3, openingWallet: 100 });
  ledger.record('sale', 'service:cookie', 35, { id: 'sale-1', meta: { checkoutId: 'reg1' } });
  let r = ledger.report(100);
  assert.equal(r.sale, 35);
  assert.equal(r.collection, 0);
  assert.equal(r.walletDelta, 0);
  assert.equal(r.reconciled, true);

  ledger.record('collection', 'register:reg1', 35, { id: 'collect-1' });
  r = ledger.report(135);
  assert.equal(r.sale, 35);
  assert.equal(r.collection, 35);
  assert.equal(r.walletDelta, 35);
  assert.equal(r.reconciled, true);
});

test('ledger reconciles bonuses, spends and deductions exactly', () => {
  const ledger = createLedger(null, { day: 1, openingWallet: 200 });
  ledger.record('bonus', 'contract', 50);
  ledger.record('spend', 'build:tables', 80);
  ledger.record('deduction', 'service:shelfWait', 7);
  const r = ledger.report(163);
  assert.deepEqual(
    { bonus:r.bonus, spend:r.spend, deduction:r.deduction, expectedWallet:r.expectedWallet, difference:r.difference, reconciled:r.reconciled },
    { bonus:50, spend:80, deduction:7, expectedWallet:163, difference:0, reconciled:true },
  );
});

test('stable transaction ids are idempotent', () => {
  const ledger = createLedger(null, { day: 2, openingWallet: 0 });
  const first = ledger.record('bonus', 'weekly-cup', 100, { id: 'day:2:cup' });
  const second = ledger.record('bonus', 'weekly-cup', 100, { id: 'day:2:cup' });
  assert.deepEqual(second, first);
  assert.equal(ledger.report(100).transactionCount, 1);
});

test('snapshot restore preserves sale versus collection and generated ids', () => {
  const a = createLedger(null, { day: 4, openingWallet: 12 });
  const sale = a.record('sale', 'service:latte', 18);
  a.record('collection', 'register:reg1', 18);
  const snap = a.snapshot();

  const b = createLedger(null, { day: 4, openingWallet: 999 });
  assert.equal(b.restore(snap, 30, 4), true);
  const before = b.report(30);
  assert.equal(before.sale, 18);
  assert.equal(before.collection, 18);
  assert.equal(before.reconciled, true);
  const next = b.record('spend', 'upgrade:speed', 5);
  assert.notEqual(next.id, sale.id);
  assert.equal(b.report(25).reconciled, true);
});

test('wrong-day or malformed ledger starts a safe new baseline', () => {
  const ledger = createLedger(null, { day: 1, openingWallet: 0 });
  const bad = { v:1, day:1, openingWallet:0, next:1, entries:[{ id:'x', type:'bonus', category:'bad', amount:999999, delta:999999 }] };
  assert.equal(ledger.restore(bad, 50, 2), false);
  assert.deepEqual(ledger.report(50), {
    day:2, openingWallet:50,
    sale:0, collection:0, bonus:0, spend:0, deduction:0, walletDelta:0,
    expectedWallet:50, actualWallet:50, reconciled:true, difference:0, transactionCount:0,
  });
});
