import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { SAVE_LIMITS, validateAndMigrateSave } from '../src/sim/save.js';
import {
  STATION_STATE_VERSION, normalizeStationState, snapshotStationState, restoreStationState,
} from '../src/sim/stationState.js';

const ALL_BUILDS = AREA1.zones.map(z => z.id);
const fullWorld = () => createWorld(AREA1, { built: ALL_BUILDS });

test('station payload round-trips cash, stock, consumable inputs, recipe family and seat dirt', () => {
  const stars = { oven1: 3, dispCookie: 3, coffee1: 3, barCoffee: 3 };
  const w = fullWorld();
  w.stations.get('register1').pile = 137;
  Object.assign(w.stations.get('oven1'), { stock: 7, product: 'brownie' });
  Object.assign(w.stations.get('dispCookie'), { stock: 14, capacity: 16, product: 'brownie' });
  Object.assign(w.stations.get('coffee1'), { beans: 0, stock: 3, product: 'latte' });
  Object.assign(w.stations.get('barCoffee'), { stock: 4, capacity: 16, product: 'latte' });
  Object.assign(w.stations.get('blender1'), { fruit: 2, stock: 5 });
  w.stations.get('bowl1').stock = 1;
  w.stations.get('seat1').dirty = true;

  const payload = snapshotStationState(w, stars);
  assert.equal(payload.v, STATION_STATE_VERSION);
  assert.deepEqual(payload.byId.register1, { pile: 137 });
  assert.deepEqual(payload.byId.coffee1, { beans: 0, stock: 3, product: 'latte' });

  const restored = fullWorld();
  // Prove restore starts from live/stale values rather than accidentally inheriting them.
  Object.assign(restored.stations.get('register1'), { pile: 999, procT: 0.5 });
  Object.assign(restored.stations.get('coffee1'), { beans: 20, stock: 8, timer: 1.5 });
  Object.assign(restored.stations.get('seat1'), { dirty: false, occupied: true });
  assert.equal(restoreStationState(restored, payload, stars), true);

  assert.equal(restored.stations.get('register1').pile, 137);
  assert.equal(restored.stations.get('register1').procT, 0);
  assert.deepEqual(
    { stock: restored.stations.get('oven1').stock, product: restored.stations.get('oven1').product },
    { stock: 7, product: 'brownie' },
  );
  assert.deepEqual(
    { stock: restored.stations.get('dispCookie').stock, capacity: restored.stations.get('dispCookie').capacity, product: restored.stations.get('dispCookie').product },
    { stock: 14, capacity: 16, product: 'brownie' },
  );
  assert.deepEqual(
    { beans: restored.stations.get('coffee1').beans, stock: restored.stations.get('coffee1').stock, product: restored.stations.get('coffee1').product, timer: restored.stations.get('coffee1').timer },
    { beans: 0, stock: 3, product: 'latte', timer: 0 },
  );
  assert.deepEqual(
    { fruit: restored.stations.get('blender1').fruit, stock: restored.stations.get('blender1').stock },
    { fruit: 2, stock: 5 },
  );
  assert.equal(restored.stations.get('bowl1').stock, 1);
  assert.equal(restored.stations.get('seat1').dirty, true);
  assert.equal(restored.stations.get('seat1').occupied, false);
});

test('missing station payload preserves legitimate pre-Task-10 creation defaults', () => {
  const w = fullWorld();
  Object.assign(w.stations.get('coffee1'), { beans: 0, stock: 6, product: 'latte' });
  w.stations.get('register1').pile = 88;
  w.stations.get('seat1').dirty = true;

  assert.equal(restoreStationState(w, null, {}), true);
  assert.equal(w.stations.get('coffee1').beans, 20, 'legacy saves historically created coffee with one full bean sack');
  assert.equal(w.stations.get('coffee1').stock, 0);
  assert.equal(w.stations.get('coffee1').product, 'coffee');
  assert.equal(w.stations.get('register1').pile, 0);
  assert.equal(w.stations.get('seat1').dirty, false);
});

test('station normalization never invents stock from oversized values or inactive stations', () => {
  const built = new Set(['z_seats1', 'z_oven2', 'z_register2']);
  const raw = {
    v: STATION_STATE_VERSION,
    byId: {
      register1: { pile: SAVE_LIMITS.maxCoins + 1 },
      dispCookie: { stock: 99999, product: 'latte' },
      dispCupcake: { stock: 5, product: 'cupcake' },
      coffee1: { beans: 0, stock: 8, product: 'latte' }, // inactive because z_coffee is not built
      seat1: { dirty: true },
      fakeStation: { stock: 8 },
    },
  };
  const normalized = normalizeStationState(raw, AREA1, built, {}, SAVE_LIMITS.maxCoins);
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.data.byId.register1, { pile: 0 });
  assert.deepEqual(normalized.data.byId.dispCookie, { stock: 0, product: 'cookie' });
  assert.deepEqual(normalized.data.byId.dispCupcake, { stock: 5, product: 'cupcake' });
  assert.deepEqual(normalized.data.byId.seat1, { dirty: true });
  assert.equal(normalized.data.byId.coffee1, undefined);
  assert.equal(normalized.data.byId.fakeStation, undefined);
});

test('display stock bounds honor the restored star-tier capacity', () => {
  const built = new Set(ALL_BUILDS);
  const normalized = normalizeStationState({
    v: STATION_STATE_VERSION,
    byId: { dispCookie: { stock: 15, product: 'brownie' } },
  }, AREA1, built, { dispCookie: 3 });
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.data.byId.dispCookie, { stock: 15, product: 'brownie' });
});

test('save validator rejects unsupported station payload versions and canonicalizes valid zero inputs', () => {
  const bad = validateAndMigrateSave({
    v: 4, builds: { a1: ALL_BUILDS }, stationState: { v: 99, byId: {} },
  }, AREA1);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'stationState:version');

  const good = validateAndMigrateSave({
    v: 4,
    builds: { a1: ALL_BUILDS },
    stars: { dispCookie: 3 },
    stationState: {
      v: STATION_STATE_VERSION,
      byId: {
        coffee1: { beans: 0, stock: 2, product: 'latte' },
        register1: { pile: 123 },
        dispCookie: { stock: 15, product: 'brownie' },
      },
    },
  }, AREA1);
  assert.equal(good.ok, true);
  assert.deepEqual(good.data.stationState.byId.coffee1, { beans: 0, stock: 2, product: 'latte' });
  assert.deepEqual(good.data.stationState.byId.register1, { pile: 123 });
  assert.deepEqual(good.data.stationState.byId.dispCookie, { stock: 15, product: 'brownie' });
});