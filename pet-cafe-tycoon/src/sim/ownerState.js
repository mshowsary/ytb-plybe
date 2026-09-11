// Durable owner position + hands persistence (Task 11).
// This module stays simulation-friendly: render reconstruction is injected through makeItem.
import { carryCap, familyOf, PRODUCTS } from './economy.js';
import { pushOut } from './collide.js';
import { regionEdge } from './nav.js';

export const OWNER_STATE_VERSION = 1;
export const OWNER_SPAWN = Object.freeze({ x: 0, z: 2.5, rot: 0 });
export const SACK_MAX = 20;

const PRODUCT_KEYS = new Set(['cookie', 'cupcake', 'coffee', 'smoothie', 'brownie', 'latte']);
// Every supply a sack can hold, i.e. exactly src/sim/carry.js's SUPPLY_PORTIONS keys plus the one
// Batch 4b adds. This is a save whitelist: a sack kind missing here is silently emptied on reload.
// 'cream' WAS missing (a Batch 1 miss — icecream1's supply shipped in carry.js/data but never
// reached this list, so an owner who reloaded mid-refill lost the bag); 'water' is waterTank1's,
// new this batch. Adding a key only widens what survives a restore, so neither can affect a run
// that never reloads.
const SACK_KEYS = new Set(['beans', 'kibble', 'cream', 'water']);
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Batch 1 — the regions engine (plan 7.1). The owner's bounding box was the interior rectangle
// alone; it is now the interior UNION every region whose builtBy is in `builtSet`, or the owner
// could not walk onto the deck they just bought. `builtSet` is optional (a Set-like with `.has`,
// or anything falsy) so every existing call site that doesn't have one yet keeps its old,
// interior-only behaviour — see the file-level note on normalizeOwnerState/restoreOwnerState.
export function areaBounds(area, builtSet) {
  const w = area && area.size && finiteNumber(area.size.w) ? Math.max(1, area.size.w) : 20;
  const d = area && area.size && finiteNumber(area.size.d) ? Math.max(1, area.size.d) : 14;
  let minX = -w / 2, maxX = w / 2, minZ = -d / 2, maxZ = d / 2;
  const regions = area && Array.isArray(area.regions) ? area.regions : [];
  for (const r of regions) {
    if (!r || !builtSet || typeof builtSet.has !== 'function' || !builtSet.has(r.builtBy)) continue;
    if (!(finiteNumber(r.x0) && finiteNumber(r.x1) && finiteNumber(r.z0) && finiteNumber(r.z1))) continue;
    if (r.x0 < minX) minX = r.x0;
    if (r.x1 > maxX) maxX = r.x1;
    if (r.z0 < minZ) minZ = r.z0;
    if (r.z1 > maxZ) maxZ = r.z1;
  }
  return {
    minX: minX + 0.5,
    maxX: maxX - 0.5,
    minZ: minZ + 0.5,
    maxZ: maxZ - 0.5,
  };
}

// Batch 4b — why a box is no longer enough. areaBounds returns the bounding BOX of the interior
// plus every built region, and that was exact while the only region was the terrace: the terrace
// spans the same x as the café, so interior ∪ terrace IS a rectangle. The spa hangs off the EAST
// side, so interior ∪ terrace ∪ spa is an L: the box also contains the dead south-east corner
// (x 10..17.5, z 7..14) where there is no floor at all, and a box clamp would happily let the
// owner stroll out onto the lawn there. Nothing else stops them — the per-frame guard is
// pushOut() against STATION boxes, and fences are render-only.
//
// So: clamp to the box first (cheap, and the only thing that matters for the ~99% of positions
// that are already legal), then, if the point landed in no rectangle at all, snap it back into
// the nearest one. Returns a fresh {x, z}; never mutates its input.
export function clampToArea(area, builtSet, x, z) {
  const b = areaBounds(area, builtSet);
  let cx = clamp(finiteNumber(x) ? x : OWNER_SPAWN.x, b.minX, b.maxX);
  let cz = clamp(finiteNumber(z) ? z : OWNER_SPAWN.z, b.minZ, b.maxZ);
  const rects = areaRects(area, builtSet);
  for (const r of rects) {
    if (cx >= r.minX && cx <= r.maxX && cz >= r.minZ && cz <= r.maxZ) return { x: cx, z: cz };
  }
  // In the dead corner: take the rectangle whose clamped point is closest to where we already are.
  let best = null, bestD = Infinity;
  for (const r of rects) {
    const px = clamp(cx, r.minX, r.maxX), pz = clamp(cz, r.minZ, r.maxZ);
    const d = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    if (d < bestD) { bestD = d; best = { x: px, z: pz }; }
  }
  return best || { x: cx, z: cz };
}

// The interior rectangle and every BUILT region, each inset by the same 0.5 m half-body margin
// areaBounds applies, as a LIST rather than a union — see clampToArea for why the union box is no
// longer the right shape. Each region also contributes a "seam": a corridor spanning the fence
// line at exactly the gate's own gap, so the two rectangles connect where the gate is and nowhere
// else. (Under the plain union box the owner could step over the fence rail anywhere along it,
// since fences are render-only and pushOut() only knows station footprints.)
function areaRects(area, builtSet) {
  const w = area && area.size && finiteNumber(area.size.w) ? Math.max(1, area.size.w) : 20;
  const d = area && area.size && finiteNumber(area.size.d) ? Math.max(1, area.size.d) : 14;
  const halfW = w / 2, halfD = d / 2;
  const rects = [{ minX: -halfW + 0.5, maxX: halfW - 0.5, minZ: -halfD + 0.5, maxZ: halfD - 0.5 }];
  const regions = area && Array.isArray(area.regions) ? area.regions : [];
  for (const r of regions) {
    if (!r || !builtSet || typeof builtSet.has !== 'function' || !builtSet.has(r.builtBy)) continue;
    if (!(finiteNumber(r.x0) && finiteNumber(r.x1) && finiteNumber(r.z0) && finiteNumber(r.z1))) continue;
    rects.push({ minX: r.x0 + 0.5, maxX: r.x1 - 0.5, minZ: r.z0 + 0.5, maxZ: r.z1 - 0.5 });
    const e = regionEdge(r, area);
    if (!e) continue;
    // The seam spans the full displaced axis (so it bridges interior and region with overlap at
    // both ends) and only the gate's gap on the other one.
    if (e.axis === 'z') {
      rects.push({
        minX: e.gapCentre - e.gapHalf, maxX: e.gapCentre + e.gapHalf,
        minZ: Math.min(-halfD + 0.5, r.z0 + 0.5), maxZ: Math.max(halfD - 0.5, r.z1 - 0.5),
      });
    } else {
      rects.push({
        minX: Math.min(-halfW + 0.5, r.x0 + 0.5), maxX: Math.max(halfW - 0.5, r.x1 - 0.5),
        minZ: e.gapCentre - e.gapHalf, maxZ: e.gapCentre + e.gapHalf,
      });
    }
  }
  return rects;
}

function wrapAngle(value) {
  if (!finiteNumber(value)) return OWNER_SPAWN.rot;
  let n = value % (Math.PI * 2);
  if (n > Math.PI) n -= Math.PI * 2;
  else if (n < -Math.PI) n += Math.PI * 2;
  return n;
}

function normalizePosition(raw, area, builtSet) {
  const src = isRecord(raw) ? raw : {};
  // clampToArea, not the raw box: with an east region the box has a dead corner (see its comment).
  // With no builtSet it degrades to exactly the old interior-rectangle clamp.
  const p = clampToArea(area, builtSet, finiteNumber(src.x) ? src.x : OWNER_SPAWN.x, finiteNumber(src.z) ? src.z : OWNER_SPAWN.z);
  return { x: p.x, z: p.z, rot: wrapAngle(src.rot) };
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

// `builtSet` (optional, Set-like) widens the position clamp to any built region — see areaBounds
// above. It defaults to undefined (interior-only) so save.js's existing call (which validates a
// save before a live `world` exists) keeps its current behaviour; restoreOwnerState below, which
// DOES have a live world, passes world.built through.
export function normalizeOwnerState(raw, area, upgrades = {}, builtSet) {
  if (raw == null) {
    return {
      ok: true,
      legacy: true,
      data: { v: OWNER_STATE_VERSION, position: normalizePosition(null, area, builtSet), ...emptyInventory() },
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
      position: normalizePosition(raw.position, area, builtSet),
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
  const builtSet = world && world.built;
  const normalized = normalizeOwnerState(payload, area, upgrades, builtSet);
  if (!normalized.ok) return false;
  const data = normalized.data;

  P.x = data.position.x;
  P.z = data.position.z;
  P.rot = data.position.rot;
  P.vx = 0;
  P.vz = 0;

  // The canonical position is inside the café UNION built-regions bounds, but a newly restored
  // build set may place a station footprint over it. Push against the refreshed collision boxes,
  // then clamp once more.
  if (world && Array.isArray(world.boxes)) pushOut(P, 0.35, world.boxes);
  const p = clampToArea(area, builtSet, P.x, P.z);
  P.x = p.x;
  P.z = p.z;

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
