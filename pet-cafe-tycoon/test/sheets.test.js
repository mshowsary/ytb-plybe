// test/sheets.test.js — Batch 1 terrace (plan D3): the pantry sheet's button contract. Pure logic
// only (no document in this Node test run, and none exists elsewhere in this repo for sheets.js),
// so this exercises pantryButtons(), the exact function renderPantry() consumes to decide which
// `.sbtn.buy` rows to build, in what order. src/ui/interactionCoach.js's pantryChoiceButton() reads
// that same rendered structure positionally, so a regression here is a regression there too.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { pantryButtons, decorRows } from '../src/ui/sheets.js';

test('main pantry: {beans, kibble} yields exactly 2 buttons in that order (interactionCoach depends on this exact shape)', () => {
  assert.deepEqual(pantryButtons({ beans: true, kibble: false }), [
    { kind: 'beans', enabled: true },
    { kind: 'kibble', enabled: false },
  ]);
});

// A single-supply pantry (Batch 1's cold pantry was one, for cream; it was cut with the cream on
// 2026-09-19, docs/SHIP-PLAN-2026-09-19.md §1.2) keeps the same contract with a live supply.
test('a single-supply pantry yields exactly 1 button, not gated by the other supply key', () => {
  assert.deepEqual(pantryButtons({ kibble: true }), [{ kind: 'kibble', enabled: true }]);
  assert.deepEqual(pantryButtons({ beans: false }), [{ kind: 'beans', enabled: false }]);
});

test('a pantry never offers a supply it does not declare', () => {
  // Only `kibble` is defined -> beans must not appear even though the main pantry has it.
  const buttons = pantryButtons({ kibble: true });
  assert.equal(buttons.some(b => b.kind === 'beans'), false);
  assert.equal(buttons.length, 1);
});

test('the supplies render in the fixed beans/kibble order whatever order the model lists them in', () => {
  assert.deepEqual(pantryButtons({ kibble: true, beans: true }).map(b => b.kind), ['beans', 'kibble']);
});

test('a pantry model with no supplies defined renders no buttons', () => {
  assert.deepEqual(pantryButtons({}), []);
});

// Pre-existing coverage (not previously in its own file): decorRows still behaves with the pantry
// work landing alongside it in this same module.
test('decorRows derives rows from a catalogue + owned-id list when the model has none pre-built', () => {
  assert.deepEqual(decorRows({ decor: [{ id: 'x', price: 1, icon: '<svg/>' }] }).map(r => r.id), ['x']);
});
