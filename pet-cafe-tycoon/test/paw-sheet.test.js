// test/paw-sheet.test.js — the Paw Rating sheet's painted contract.
//
// There is no document in this Node test run (and no jsdom anywhere in the repo — see the same note
// at the top of test/sheets.test.js), so this exercises the pure half of src/ui/pawSheet.js: the
// view model, the row mapping and the glyph table. Those are exactly what createPawSheet() paints,
// so a regression here is a regression on screen. The DOM half (one card, one internal scroller,
// one 48x48 tap target) is covered by tools/responsive-audit.js, which the orchestrator runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pawSheetModel, pawSheetRow, pawRowNumerals, pawRowIcon, PAW_ROW_ICONS,
} from '../src/ui/pawSheet.js';
import { PAW_MAX_STAR, PAW_REQUIREMENT_KINDS, PAW_TARGETS, pawRatingState } from '../src/sim/pawRating.js';
import { AREA1 } from '../data/area1.js';

const state = (meta, extra = {}) => pawRatingState({ meta, stats: { served: 0 }, built: [], ...extra });

// ---- glyph table ------------------------------------------------------------------------------

test('every requirement kind pawRating.js can emit has a glyph (a kind with no icon draws an empty box)', () => {
  for (const kind of PAW_REQUIREMENT_KINDS) {
    assert.equal(typeof PAW_ROW_ICONS[kind], 'function', `no icon for kind ${kind}`);
    const svg = pawRowIcon(kind);
    assert.ok(typeof svg === 'string' && svg.startsWith('<svg'), `icon for ${kind} is not an svg`);
  }
});

test('the glyph table carries no kinds the sim cannot produce', () => {
  assert.deepEqual(Object.keys(PAW_ROW_ICONS).sort(), [...PAW_REQUIREMENT_KINDS].sort());
});

test('an unknown kind yields no icon rather than junk', () => {
  assert.equal(pawRowIcon('nope'), null);
  assert.equal(pawRowIcon(undefined), null);
});

// ---- the rating itself ------------------------------------------------------------------------

test('a fresh save shows five empty paws and marks ★1 as the one being earned', () => {
  const m = pawSheetModel(state({}));
  assert.equal(m.best, 0);
  assert.equal(m.next, 1);
  assert.equal(m.total, PAW_MAX_STAR);
  assert.equal(m.complete, false);
  assert.equal(m.paws.length, PAW_MAX_STAR);
  assert.deepEqual(m.paws.map(p => p.filled), [false, false, false, false, false]);
  assert.deepEqual(m.paws.map(p => p.next), [true, false, false, false, false]);
});

test('paws fill up to the RATCHET, and the next paw is the one after it', () => {
  const m = pawSheetModel(state({ pawBest: 3 }));
  assert.equal(m.best, 3);
  assert.equal(m.next, 4);
  assert.deepEqual(m.paws.map(p => p.filled), [true, true, true, false, false]);
  assert.deepEqual(m.paws.map(p => p.next), [false, false, false, true, false]);
});

test('★5 is a completed sheet: every paw filled, no next paw, no checklist', () => {
  const s = state({ pawBest: 5 });
  const m = pawSheetModel(s);
  assert.equal(m.next, null);
  assert.equal(m.complete, true);
  assert.equal(m.rows.length, 0);
  assert.deepEqual(m.paws.map(p => p.filled), [true, true, true, true, true]);
  assert.equal(m.paws.some(p => p.next), false);
  assert.equal(m.ceremonyDue, s.ceremonyDue);
});

// ---- the checklist ----------------------------------------------------------------------------

test('the checklist is the NEXT star\'s requirements, in the sim\'s order', () => {
  // Batch E1 replaced the rows themselves (ship plan 1.6a). The sheet is generic over whatever
  // pawRating.js emits, which is the property this test actually protects; only the fixture's
  // expected ids move with the plan.
  const m = pawSheetModel(state({ pawBest: 2 }));
  assert.deepEqual(m.rows.map(r => r.id), ['r3.terrace', 'r3.book', 'r3.photos']);
  assert.deepEqual(m.rows.map(r => r.kind), ['zone', 'petBook', 'photos']);
});

test('a SKIPPED requirement draws nothing (a catalogue without z_terrace shows two star-3 rows)', () => {
  const noTerrace = { ...AREA1, zones: AREA1.zones.filter(z => z.id !== 'z_terrace'), regions: [] };
  const s = state({ pawBest: 2 }, { area: noTerrace });
  assert.equal(s.requirements.some(r => r.id === 'r3.terrace' && r.skipped), true, 'fixture assumption: r3.terrace is skipped');
  assert.deepEqual(pawSheetModel(s).rows.map(r => r.id), ['r3.book', 'r3.photos']);
  // With the real catalogue the row exists and IS drawn.
  assert.deepEqual(pawSheetModel(state({ pawBest: 2 })).rows.map(r => r.id), ['r3.terrace', 'r3.book', 'r3.photos']);
  // Star 4 names no zone since the spa was retired: three rows, none skipped.
  assert.deepEqual(pawSheetModel(state({ pawBest: 3 })).rows.map(r => r.id), ['r4.bestie', 'r4.book', 'r4.photos']);
});

test('a row carries the numerals the sim gave it, untouched', () => {
  const m = pawSheetModel(state({}));
  assert.deepEqual(m.rows, [{
    id: 'r1.served', kind: 'guests', zoneId: null,
    current: 0, target: PAW_TARGETS.served, compare: 'gte', state: 'unmet', frac: 0,
  }]);
});

test('a zone row keeps its zoneId so a future build can point at the right spot', () => {
  const m = pawSheetModel(state({ pawBest: 2 }));
  assert.equal(m.rows[0].zoneId, 'z_terrace');
});

// ---- row states -------------------------------------------------------------------------------

test('met / unmet / pending are the only three row states, and pending beats met', () => {
  assert.equal(pawSheetRow({ id: 'a', kind: 'guests', current: 9, target: 9, met: true }).state, 'met');
  assert.equal(pawSheetRow({ id: 'a', kind: 'guests', current: 1, target: 9, met: false }).state, 'unmet');
  // pawRating.js documents "pending -> draw unmet, no tick": a tick on an unjudged row would
  // promise a star that is not owed.
  assert.equal(pawSheetRow({ id: 'a', kind: 'seatMiss', current: 0, target: 3, met: true, pending: true }).state, 'pending');
});

// The star-3 missed-seat window is RETIRED (Batch E1, ship plan 1.6a): it was the only regressible,
// fewer-is-better row in the track, it could not be influenced directly, and a rating that fell
// after a bad week is the punishing pattern the plan forbids. The sheet still renders 'pending' and
// 'lte' correctly -- asserted directly above and below on synthetic rows -- so the three-state
// contract survives the row that used to be its only live example.
test('no star row is fewer-is-better or unjudgeable any more', () => {
  for (let best = 0; best < 5; best++) {
    for (const row of pawSheetModel(state({ pawBest: best })).rows) {
      assert.equal(row.compare, 'gte', `${row.id} counts up`);
      assert.notEqual(row.state, 'pending', `${row.id} can always be judged`);
    }
  }
});

// ---- numerals and bars ------------------------------------------------------------------------

test('progress fills by current/target and never exceeds full', () => {
  assert.equal(pawSheetRow({ current: 30, target: 120 }).frac, 0.25);
  assert.equal(pawSheetRow({ current: 400, target: 120, met: true }).frac, 1);
  assert.equal(pawSheetRow({ current: 0, target: 120 }).frac, 0);
});

test('a fewer-is-better row fills binary, never partially (2 of 3 allowed misses is not 67% done)', () => {
  assert.equal(pawSheetRow({ current: 2, target: 3, compare: 'lte', met: true }).frac, 1);
  assert.equal(pawSheetRow({ current: 5, target: 3, compare: 'lte', met: false }).frac, 0);
});

test('a zero target cannot divide by zero', () => {
  assert.equal(pawSheetRow({ current: 0, target: 0, met: true }).frac, 1);
  assert.equal(pawSheetRow({ current: 0, target: 0, met: false }).frac, 0);
});

test('numerals are numerals: digits and thousands separators only, never a word', () => {
  const rows = [
    ...pawSheetModel(state({})).rows,
    ...pawSheetModel(state({ pawBest: 2 })).rows,
    ...pawSheetModel(state({ pawBest: 3 })).rows,
    ...pawSheetModel(state({ pawBest: 4 })).rows,
  ];
  assert.ok(rows.length >= 8, 'expected every tier to contribute rows');
  for (const r of rows) {
    const n = pawRowNumerals(r);
    assert.match(n.current, /^[0-9,]+$/, `${r.id} current is not a numeral: ${n.current}`);
    assert.match(n.target, /^[0-9,]+$/, `${r.id} target is not a numeral: ${n.target}`);
    // The separator is the whole of the row's "grammar": '/' for reach-this, '≤' for stay-under.
    assert.ok(n.sep === '/' || n.sep === '≤', `${r.id} separator is not a glyph: ${n.sep}`);
    assert.equal(/[A-Za-z]/.test(n.current + n.sep + n.target), false, `${r.id} paints letters`);
  }
});

test('a fewer-is-better row says so with ≤, not with a slash', () => {
  assert.equal(pawRowNumerals(pawSheetRow({ current: 2, target: 3, compare: 'lte' })).sep, '≤');
  assert.equal(pawRowNumerals(pawSheetRow({ current: 2, target: 3 })).sep, '/');
});

test('a four-digit target keeps its thousands separator', () => {
  // No live row reaches four digits any more (the 2,000-follower row is retired), so the formatter
  // is asserted directly -- the behaviour is the formatter's, not the row's.
  assert.equal(pawRowNumerals(pawSheetRow({ current: 1234, target: 2000 })).target, '2,000');
  assert.equal(pawRowNumerals(pawSheetRow({ current: 1234, target: 2000 })).current, '1,234');
});

// ---- defensive ---------------------------------------------------------------------------------

test('the model survives a missing/garbage state instead of throwing at paint time', () => {
  const m = pawSheetModel(null);
  assert.equal(m.best, 0);
  assert.equal(m.rows.length, 0);
  assert.equal(m.paws.length, PAW_MAX_STAR);
  assert.deepEqual(pawSheetModel({ best: 99, requirements: null }).paws.map(p => p.filled), [true, true, true, true, true]);
  assert.equal(pawSheetRow(null).current, 0);
  assert.equal(pawSheetRow({ current: NaN, target: Infinity }).target, 0);
});

test('next:null from the sim means ★5, not a missing field', () => {
  assert.equal(pawSheetModel({ best: 5, next: null, requirements: [] }).complete, true);
  // A caller that omitted `next` entirely still gets a sane one derived from `best`.
  assert.equal(pawSheetModel({ best: 1, requirements: [] }).next, 2);
});
