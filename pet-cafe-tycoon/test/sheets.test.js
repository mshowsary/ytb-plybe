// test/sheets.test.js — what the bottom sheets still build.
//
// The PANTRY sheet used to live here: a bottom sheet with one or two rows, opened by a SUPPLIES
// button, for a choice the game could already make (the neediest connected machine's supply). It
// went with the button in Batch C (docs/SHIP-PLAN-2026-09-19.md §1.4) — stopping at the pantry now
// hands the sack over directly — so its button contract (pantryButtons, count/order/enabled) is
// gone rather than weakened. test/supply-lanes and tools/supply-lanes-smoke.js pin the replacement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decorRows } from '../src/ui/sheets.js';

test('decorRows derives rows from a catalogue + owned-id list when the model has none pre-built', () => {
  assert.deepEqual(decorRows({ decor: [{ id: 'x', price: 1, icon: '<svg/>' }] }).map(r => r.id), ['x']);
});

test('the sheet host builds exactly two kinds: the Shop and the day summary', () => {
  const src = fs.readFileSync(new URL('../src/ui/sheets.js', import.meta.url), 'utf8');
  const kinds = [...src.matchAll(/if \(kind === '([a-z]+)'\) return render/g)].map(m => m[1]).sort();
  assert.deepEqual(kinds, ['kiosk', 'summary'], 'a third sheet kind came back');
  assert.equal(/renderPantry|pantryButtons/.test(src), false, 'the pantry sheet is gone, not hidden');
});

// The other half of the cut: nothing may open a pantry sheet either.
test('no caller asks the sheet host for a pantry', () => {
  for (const file of ['../src/systems/stations.js', '../src/ui/shop.js', '../src/ui/pauseMenu.js']) {
    const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.equal(/sheets\.open\('pantry'|open\('pantry'/.test(src), false, `${file} still opens a pantry sheet`);
  }
});
