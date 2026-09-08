// Batch 3: the two surfaces that tell the player where they stand.
//   1. the day-summary gain rows (photos taken / followers gained this shift)
//   2. the wallet's "saving for" ring target rule
// Both are exercised through their pure exports; neither test touches a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceSummaryModel } from '../src/ui/serviceSummary.js';
import { pickSavingTarget } from '../src/ui/hud.js';
import { AREA1 } from '../data/area1.js';

// ---- day-summary gain rows --------------------------------------------------------------------

test('summary reports photos taken and followers gained this shift', () => {
  const m = buildServiceSummaryModel(
    { served: 12, photos: 3, followersStart: 1200 },
    { followers: 1231 },
  );
  assert.equal(m.photos, 3);
  assert.equal(m.followers, 31);
});

test('gain rows are null, not zero, when the shift cannot prove them', () => {
  // saveSchema.normalizeShiftStats rebuilds dayStats from a fixed key whitelist, so a shift
  // restored mid-day carries neither counter. Reporting 0 there would be a fabricated numeral.
  const m = buildServiceSummaryModel({ served: 12 }, { followers: 900 });
  assert.equal(m.photos, null);
  assert.equal(m.followers, null);
  // The service-outcome rows are unaffected: an absent miss count really is no misses.
  assert.equal(m.misses, 0);
  assert.equal(m.missedSeats, 0);
});

test('gain rows survive null-shaped inputs without inventing a zero-photo shift', () => {
  // Number(null) === 0, which is exactly how a "no record" reads back as a real count if the
  // null check is folded into the finite check.
  const m = buildServiceSummaryModel({ photos: null, followersStart: null }, { followers: null });
  assert.equal(m.photos, null);
  assert.equal(m.followers, null);
  const noMeta = buildServiceSummaryModel({ photos: 2, followersStart: 10 }, null);
  assert.equal(noMeta.photos, 2);
  assert.equal(noMeta.followers, null); // no meta to difference against
});

test('gain rows clamp garbage and never report a negative follower gain', () => {
  const m = buildServiceSummaryModel({ photos: -4, followersStart: 500 }, { followers: 100 });
  assert.equal(m.photos, 0);
  assert.equal(m.followers, 0);
  assert.equal(buildServiceSummaryModel({ photos: 'x' }, null).photos, null);
});

test('the single-argument model call still works for every existing caller', () => {
  const m = buildServiceSummaryModel({ served: 5, lost: 0, serviceMisses: 0 });
  assert.equal(m.clean, true);
  assert.equal(m.photos, null);
  assert.equal(m.followers, null);
});

// ---- the wallet ring target -------------------------------------------------------------------

test('the ring targets the cheapest zone that is actually buildable, never a locked cheaper one', () => {
  // After the pet lounge the catalogue's cheapest UNBUILT zone is z_restroom (3500), but it sits
  // three zones past z_terrace (6500). A cheapest-unbuilt rule would point the ring at a purchase
  // the game refuses to sell, and would sit pinned at 100% doing it.
  const built = new Set(['z_seats1', 'z_oven2', 'z_hire', 'z_register2', 'z_coffee',
    'z_bowl', 'z_blender', 'z_garden', 'z_seats2']);
  const cheapestUnbuilt = AREA1.zones.filter(z => !built.has(z.id)).sort((a, b) => a.price - b.price)[0];
  assert.equal(cheapestUnbuilt.id, 'z_restroom');
  const t = pickSavingTarget(AREA1.zones, built);
  assert.equal(t.id, 'z_terrace');
  assert.equal(t.price, 6500);
});

test('the ring starts on the cheapest opening purchase and walks the whole catalogue', () => {
  const built = new Set();
  assert.equal(pickSavingTarget(AREA1.zones, built).id, 'z_seats1');
  const seen = [];
  for (;;) {
    const t = pickSavingTarget(AREA1.zones, built);
    if (!t) break;
    seen.push(t.id);
    built.add(t.id);
  }
  // Every authored zone becomes reachable in turn: the rule can never strand the player with a
  // ring pointed at nothing while purchases remain.
  assert.equal(seen.length, AREA1.zones.length);
  assert.equal(new Set(seen).size, AREA1.zones.length);
});

test('the ring disappears rather than pointing at nothing once everything is built', () => {
  const built = new Set(AREA1.zones.map(z => z.id));
  assert.equal(pickSavingTarget(AREA1.zones, built), null);
});

test('the ring target is null-safe for callers that have no world yet', () => {
  assert.equal(pickSavingTarget(null, new Set()), null);
  assert.equal(pickSavingTarget(AREA1.zones, null), null);
  assert.equal(pickSavingTarget(AREA1.zones, {}), null);
  // A zone with no usable price is skipped rather than becoming a divide-by-zero ring.
  assert.equal(pickSavingTarget([{ id: 'a', price: 0 }, { id: 'b', price: 40 }], new Set()).id, 'b');
  assert.equal(pickSavingTarget([{ id: 'a', price: 'x' }], new Set()), null);
});
