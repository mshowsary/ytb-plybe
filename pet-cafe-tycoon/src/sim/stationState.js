// Durable mid-shift station persistence. This intentionally excludes timers, occupancy, serving,
// customers, navigation and owner carry state: those are transient (or belong to Task 11).
import { PRODUCTS, DISPLAY_STAR_CAP, familyOf } from './economy.js';

export const STATION_STATE_VERSION = 1;
export const DEFAULT_REGISTER_PILE_LIMIT = 100_000_000;

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);

function boundedQuantity(value, max) {
  if (!finiteNumber(value)) return 0;
  const n = Math.trunc(value);
  // Oversized/corrupt resource counts collapse to zero rather than to a full container. Clamping
  // 999999 -> capacity would manufacture useful stock from invalid data.
  return n >= 0 && n <= max ? n : 0;
}

function activeDefinition(def, builtSet) {
  return !def.builtBy || (builtSet && builtSet.has(def.builtBy));
}

function baseProduct(def) {
  if (def.type === 'coffee') return 'coffee';
  if (def.type === 'blender') return 'smoothie';
  return typeof def.product === 'string' ? def.product : null;
}

function compatibleProduct(def, value) {
  const base = baseProduct(def);
  if (!base) return null;
  if (typeof value !== 'string' || !PRODUCTS[value]) return base;
  return familyOf(value) === familyOf(base) ? value : base;
}

function outputCapacity(def, stars = {}) {
  if (def.type === 'display') {
    const tier = Number.isFinite(stars[def.id]) ? Math.max(1, Math.min(3, Math.trunc(stars[def.id]))) : 1;
    return DISPLAY_STAR_CAP[tier] || def.capacity || 8;
  }
  if (def.type === 'oven') return def.buffer || 12;
  if (def.type === 'coffee' || def.type === 'blender') return def.buffer || 8;
  if (def.type === 'bowl') return def.capacity || 10;
  return 0;
}

function normalizeRow(def, row, stars, maxPile) {
  if (!isRecord(row)) return null;
  switch (def.type) {
    case 'checkout':
      return { pile: boundedQuantity(row.pile, maxPile) };
    case 'oven':
    case 'display':
      return {
        stock: boundedQuantity(row.stock, outputCapacity(def, stars)),
        product: compatibleProduct(def, row.product),
      };
    case 'coffee':
      return {
        beans: boundedQuantity(row.beans, 20),
        stock: boundedQuantity(row.stock, outputCapacity(def, stars)),
        product: compatibleProduct(def, row.product),
      };
    case 'blender':
      return {
        fruit: boundedQuantity(row.fruit, 9),
        stock: boundedQuantity(row.stock, outputCapacity(def, stars)),
      };
    case 'bowl':
      return { stock: boundedQuantity(row.stock, outputCapacity(def, stars)) };
    case 'seat':
      return { dirty: row.dirty === true };
    default:
      return null;
  }
}

export function normalizeStationState(raw, area, builtSet = new Set(), stars = {}, maxPile = DEFAULT_REGISTER_PILE_LIMIT) {
  // Missing station payload is a legitimate pre-Task-10 save. An empty canonical payload means
  // restore the historical station creation defaults (notably a newly built coffee machine's 20 beans).
  if (raw == null) return { ok: true, data: { v: STATION_STATE_VERSION, byId: {} }, legacy: true };
  if (!isRecord(raw)) return { ok: false, reason: 'shape' };
  if (raw.v !== STATION_STATE_VERSION) return { ok: false, reason: 'version' };
  if (!isRecord(raw.byId)) return { ok: false, reason: 'byId' };
  if (!area || !Array.isArray(area.stations)) return { ok: true, data: { v: STATION_STATE_VERSION, byId: {} }, legacy: false };

  const byId = {};
  for (const def of area.stations) {
    if (!activeDefinition(def, builtSet)) continue;
    const normalized = normalizeRow(def, raw.byId[def.id], stars, maxPile);
    if (normalized) byId[def.id] = normalized;
  }
  return { ok: true, data: { v: STATION_STATE_VERSION, byId }, legacy: false };
}

export function snapshotStationState(world, stars = {}) {
  const byId = {};
  if (!world || !world.stations || !world.area || !Array.isArray(world.area.stations)) {
    return { v: STATION_STATE_VERSION, byId };
  }
  const defById = new Map(world.area.stations.map(def => [def.id, def]));
  for (const st of world.stations.values()) {
    if (!st.active) continue;
    const def = defById.get(st.id);
    if (!def) continue;
    const row = normalizeRow(def, st, stars, DEFAULT_REGISTER_PILE_LIMIT);
    if (row) byId[st.id] = row;
  }
  return { v: STATION_STATE_VERSION, byId };
}

function resetRuntimeStation(st, def, stars) {
  switch (st.type) {
    case 'checkout':
      st.pile = 0; st.serving = ''; st.procT = 0; st._watchdogT = 0;
      break;
    case 'oven':
      st.product = baseProduct(def); st.stock = 0; st.timer = 0;
      break;
    case 'display':
      st.product = baseProduct(def); st.stock = 0; st.capacity = outputCapacity(def, stars);
      break;
    case 'coffee':
      st.product = 'coffee'; st.beans = 20; st.stock = 0; st.timer = 0;
      break;
    case 'blender':
      st.fruit = 0; st.stock = 0; st.timer = 0;
      break;
    case 'bowl':
      st.stock = 0; st.capacity = outputCapacity(def, stars);
      break;
    case 'seat':
      // Customers intentionally restart after reload, so occupied is transient while dirt is durable.
      st.occupied = false; st.dirty = false;
      break;
    default:
      break;
  }
}

export function restoreStationState(world, payload, stars = {}, maxPile = DEFAULT_REGISTER_PILE_LIMIT) {
  if (!world || !world.stations || !world.area || !Array.isArray(world.area.stations)) return false;
  const defById = new Map(world.area.stations.map(def => [def.id, def]));

  // G.restore can run on an already-live world (retry/dev tooling), not only on a fresh page. Reset
  // every durable field first so omitted legacy rows cannot inherit whatever happened in that live world.
  for (const st of world.stations.values()) {
    const def = defById.get(st.id);
    if (def) resetRuntimeStation(st, def, stars);
  }

  const normalized = normalizeStationState(payload, world.area, world.built, stars, maxPile);
  if (!normalized.ok) return false;
  for (const [id, row] of Object.entries(normalized.data.byId)) {
    const st = world.stations.get(id);
    if (!st || !st.active) continue;
    switch (st.type) {
      case 'checkout': st.pile = row.pile; break;
      case 'oven':
      case 'display': st.stock = row.stock; st.product = row.product; break;
      case 'coffee': st.beans = row.beans; st.stock = row.stock; st.product = row.product; break;
      case 'blender': st.fruit = row.fruit; st.stock = row.stock; break;
      case 'bowl': st.stock = row.stock; break;
      case 'seat': st.dirty = row.dirty; break;
      default: break;
    }
  }
  return true;
}