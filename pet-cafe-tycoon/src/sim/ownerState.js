// Durable owner position + hands persistence (Task 11).
// This module stays simulation-friendly: render reconstruction is injected through makeItem.
import { carryCap, familyOf, PRODUCTS } from './economy.js';
import { pushOut } from './collide.js';

export const OWNER_STATE_VERSION = 1;
export const OWNER_SPAWN = Object.freeze({ x: 0, z: 2.5, rot: 0 });
export const SACK_MAX = 20;

const PRODUCT_KEYS = new Set(['cookie', 'cupcake', 'coffee', 'smoothie', 'brownie', 'latte']);
const SACK_KEYS = new Set(['beans', 'kibble']);
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function areaBounds(area) {
  const w = area && area.size && finiteNumber(area.size.w) ? Math.max(1, area.size.w) : 20;
  const d = area && area.size && finiteNumber(area.size.d) ? Math.max(1, area.size.d) : 14;
  return {
    minX: -w / 2 + 0.5,
    maxX: w / 2 - 0.5,
    minZ: -d / 2 + 0.5,
    maxZ: d / 2 - 0.5,
  };
}

function wrapAngle(value) {
  if (!finiteNumber(value)) return OWNER_SPAWN.rot;
  let n = value % (Math.PI * 2);
  if (n > Math.PI) n -= Math.PI * 2;
  else if (n < -Math.PI) n += Math.PI * 2;
  return n;
}

function normalizePosition(raw, area) {
  const b = areaBounds(area);
  const src = isRecord(raw) ? raw : {};
  return {
    x: finiteNumber(src.x) ? clamp(src.x, b.minX, b.maxX) : clamp(OWNER_SPAWN.x, b.minX, b.maxX),
    z: finiteNumber(src.z) ? clamp(src.z, b.minZ, b.maxZ) : clamp(OWNER_SPAWN.z, b.minZ, b.maxZ),
    rot: wrapAngle(src.rot),
  };
}

function emptyInventory() {
  return { products: [], carry: { sack: null, sackLeft: 0, fruit: 0 } };
}

function normalizeInventory(productsRaw, carryRaw, upgrades) {
  const maxCarry = carryCap(upgrades || {});
  const products = Array.isArray(productsRaw) ? productsRaw : [];
  const carry = isRecord(carryRaw) ? carryRaw : {};
  const sack = typeof carry.sack === 'string' && SACK_KEYS.has(carry.sack) ? carry.sack : null;
  const sackLeft = finiteNumber(carry.sackLeft) ? Math.trunc(carry.sackLeft) : 0;
  const fruit = finiteNumber(carry.fruit) ? Math.trunc(carry.fruit) : 0;

  // Runtime carry modes are mutually exclusive. If a save claims two modes simultaneously, clear
  // the hands rather than selecting whichever mode would preserve the most value.
  const claimsProducts = products.length > 0;
  const claimsSack = sack != null || sackLeft !== 0;
  const claimsFruit = fruit !== 0;
  if ((claimsProducts ? 1 : 0) + (claimsSack ? 1 : 0) + (claimsFruit ? 1 : 0) > 1) return emptyInventory();

  if (claimsProducts) {
    if (products.length > maxCarry) return emptyInventory();
    if (products.some(key => typeof key !== 'string' || !PRODUCT_KEYS.has(key) || !PRODUCTS[key])) return emptyInventory();
    const family = familyOf(products[0]);
    if (products.some(key => familyOf(key) !== family)) return emptyInventory();
    return { products: [...products], carry: { sack: null, sackLeft: 0, fruit: 0 } };
  }

  if (claimsSack) {
    if (!sack || sackLeft < 1 || sackLeft > SACK_MAX) return emptyInventory();
    return { products: [], carry: { sack, sackLeft, fruit: 0 } };
  }

  if (claimsFruit) {
    if (fruit < 1 || fruit > maxCarry) return emptyInventory();
    return { products: [], carry: { sack: null, sackLeft: 0, fruit } };
  }

  return emptyInventory();
}

export function normalizeOwnerState(raw, area, upgrades = {}) {
  if (raw == null) {
    return {
      ok: true,
      legacy: true,
      data: { v: OWNER_STATE_VERSION, position: normalizePosition(null, area), ...emptyInventory() },
    };
  }
  if (!isRecord(raw)) return { ok: false, reason: 'shape' };
  if (raw.v !== OWNER_STATE_VERSION) return { ok: false, reason: 'version' };
  if (raw.position != null && !isRecord(raw.position)) return { ok: false, reason: 'position' };
  if (raw.carry != null && !isRecord(raw.carry)) return { ok: false, reason: 'carry' };
  if (raw.products != null && !Array.isArray(raw.products)) return { ok: false, reason: 'products' };
  if (Array.isArray(raw.products) && raw.products.length > 64) return { ok: false, reason: 'products' };

  return {
    ok: true,
    legacy: false,
    data: {
      v: OWNER_STATE_VERSION,
      position: normalizePosition(raw.position, area),
      ...normalizeInventory(raw.products, raw.carry, upgrades),
    },
  };
}

export function snapshotOwnerState(P, carry, items, upgrades = {}, area = null) {
  const raw = {
    v: OWNER_STATE_VERSION,
    position: { x: P && P.x, z: P && P.z, rot: P && P.rot },
    products: Array.isArray(items) ? items.map(item => item && item.userData && item.userData.product) : [],
    carry: {
      sack: carry && carry.sack || null,
      sackLeft: carry && carry.sackLeft || 0,
      fruit: carry && carry.fruit || 0,
    },
  };
  const normalized = normalizeOwnerState(raw, area, upgrades);
  return normalized.ok ? normalized.data : { v: OWNER_STATE_VERSION, position: normalizePosition(null, area), ...emptyInventory() };
}

export function restoreOwnerState(P, carry, owner, payload, area, upgrades = {}, makeItem = null, world = null) {
  if (!P || !carry || !owner) return false;
  const normalized = normalizeOwnerState(payload, area, upgrades);
  if (!normalized.ok) return false;
  const data = normalized.data;

  P.x = data.position.x;
  P.z = data.position.z;
  P.rot = data.position.rot;
  P.vx = 0;
  P.vz = 0;

  // The canonical position is inside the café bounds, but a newly restored build set may place a
  // station footprint over it. Push against the refreshed collision boxes, then clamp once more.
  if (world && Array.isArray(world.boxes)) pushOut(P, 0.35, world.boxes);
  const b = areaBounds(area);
  P.x = clamp(P.x, b.minX, b.maxX);
  P.z = clamp(P.z, b.minZ, b.maxZ);

  if (typeof owner.clearItems === 'function') owner.clearItems();
  carry.sack = null;
  carry.sackLeft = 0;
  carry.fruit = 0;

  if (data.products.length && typeof makeItem === 'function' && typeof owner.addItem === 'function') {
    for (const key of data.products) {
      const mesh = makeItem(key);
      if (!mesh) continue;
      if (!mesh.userData) mesh.userData = {};
      mesh.userData.product = key;
      owner.addItem(mesh);
      // Reload is restoration, not a fresh pickup animation: show the restored stack immediately.
      if (mesh.scale && typeof mesh.scale.setScalar === 'function') mesh.scale.setScalar(1);
    }
  } else {
    carry.sack = data.carry.sack;
    carry.sackLeft = data.carry.sackLeft;
    carry.fruit = data.carry.fruit;
  }
  if (typeof owner.setCarryProps === 'function') owner.setCarryProps(carry.sack, carry.fruit);
  return true;
}
