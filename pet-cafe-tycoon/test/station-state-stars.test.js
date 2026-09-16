import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { displayStarCap } from '../src/sim/economy.js';
import { SAVE_LIMITS } from '../src/sim/saveSchema.js';
import {
  STATION_STATE_VERSION, normalizeStationState, snapshotStationState, restoreStationState,
} from '../src/sim/stationState.js';

// Regression guard for the P0 in section 6.0 of the program plan: the restore path used to clamp a
// display's star tier to 3, which pinned its bound at 16 slots. boundedQuantity() deliberately
// collapses anything above the bound to 0, so a full tier-4+ display came back EMPTY and the player
// silently lost both the stock and the coins spent on the star.

const ALL_BUILDS = AREA1.zones.map(z => z.id);
const fullWorld = () => createWorld(AREA1, { built: ALL_BUILDS });

test('a five-star display round-trips its full stock instead of restoring empty', () => {
  const stars = { dispCookie: 5 };
  assert.equal(displayStarCap(5), 24, 'tier 5 is 16 + 4 * 2 slots');

  const w = fullWorld();
  Object.assign(w.stations.get('dispCookie'), { stock: 24, capacity: 24, product: 'cookie' });

  const payload = snapshotStationState(w, stars);
  assert.deepEqual(payload.byId.dispCookie, { stock: 24, product: 'cookie' },
    'the snapshot must not zero the stock either - normalizeRow bounds both directions');

  const normalized = normalizeStationState(payload, AREA1, new Set(ALL_BUILDS), stars);
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.data.byId.dispCookie, { stock: 24, product: 'cookie' });

  const restored = fullWorld();
  assert.equal(restoreStationState(restored, payload, stars), true);
  const st = restored.stations.get('dispCookie');
  assert.equal(st.stock, 24, 'was 0 before the fix');
  assert.equal(st.capacity, 24, 'the runtime capacity has to follow the tier too, or refills cap at 16');
});

test('authored tier-1 through tier-3 displays keep their existing round-trip behaviour', () => {
  for (const [tier, cap] of [[1, 8], [2, 12], [3, 16]]) {
    const stars = { dispCookie: tier };
    const w = fullWorld();
    Object.assign(w.stations.get('dispCookie'), { stock: cap, capacity: cap, product: 'cookie' });

    const payload = snapshotStationState(w, stars);
    assert.deepEqual(payload.byId.dispCookie, { stock: cap, product: 'cookie' }, `tier ${tier} snapshot`);

    const restored = fullWorld();
    assert.equal(restoreStationState(restored, payload, stars), true);
    assert.equal(restored.stations.get('dispCookie').stock, cap, `tier ${tier} stock`);
    assert.equal(restored.stations.get('dispCookie').capacity, cap, `tier ${tier} capacity`);
  }

  // The historical default (no star entry at all) is still a plain tier-1 container.
  const w = fullWorld();
  Object.assign(w.stations.get('dispCookie'), { stock: 8, capacity: 8, product: 'cookie' });
  const restored = fullWorld();
  assert.equal(restoreStationState(restored, snapshotStationState(w, {}), {}), true);
  assert.equal(restored.stations.get('dispCookie').stock, 8);
  assert.equal(restored.stations.get('dispCookie').capacity, 8);
});

test('tampered stock still collapses to zero rather than filling the container', () => {
  const built = new Set(ALL_BUILDS);

  const atFive = normalizeStationState({
    v: STATION_STATE_VERSION,
    byId: { dispCookie: { stock: 999999, product: 'cookie' } },
  }, AREA1, built, { dispCookie: 5 });
  assert.equal(atFive.ok, true);
  assert.deepEqual(atFive.data.byId.dispCookie, { stock: 0, product: 'cookie' },
    'raising the legitimate ceiling must not make oversized values survive');

  // One over the real ceiling is still refused; exactly the ceiling is still kept.
  const overByOne = normalizeStationState({
    v: STATION_STATE_VERSION,
    byId: { dispCookie: { stock: 25, product: 'cookie' } },
  }, AREA1, built, { dispCookie: 5 });
  assert.equal(overByOne.data.byId.dispCookie.stock, 0);

  // A tampered star tier cannot widen the ceiling past what a valid save may carry.
  const absurdTier = normalizeStationState({
    v: STATION_STATE_VERSION,
    byId: { dispCookie: { stock: 999999, product: 'cookie' } },
  }, AREA1, built, { dispCookie: 1e9 });
  assert.equal(absurdTier.data.byId.dispCookie.stock, 0);
  assert.ok(displayStarCap(SAVE_LIMITS.maxStarTier) < 999999);

  // And the restore path applies the same refusal to a live world.
  const restored = fullWorld();
  Object.assign(restored.stations.get('dispCookie'), { stock: 7, product: 'cookie' });
  assert.equal(restoreStationState(restored, {
    v: STATION_STATE_VERSION,
    byId: { dispCookie: { stock: 999999, product: 'cookie' } },
  }, { dispCookie: 5 }), true);
  assert.equal(restored.stations.get('dispCookie').stock, 0);
});
