import { familyOf } from './economy.js';
import { acceptsSupply, SUPPLY_OF } from './supplies.js';

export function heldState(items, carry) {
  if (items && items.length) {
    return { type: 'product', key: items[0]?.userData?.product || null, count: items.length };
  }
  if (carry && carry.sack) return { type: 'sack', key: carry.sack, count: carry.sackLeft | 0 };
  if (carry && (carry.fruit | 0) > 0) return { type: 'fruit', key: 'fruit', count: carry.fruit | 0 };
  return null;
}

export function canDeliverTo(st, held) {
  if (!st || !st.active || !held) return false;
  if (held.type === 'product') {
    return st.type === 'display' && familyOf(st.product) === familyOf(held.key) && st.stock < st.capacity;
  }
  // Every supply the pantries hand out, not just the two the game shipped with: an owner holding
  // cream used to match nothing here, so destinationFor fell through to findReturnStation and the
  // game cheerfully directed them to bin it. See src/sim/supplies.js.
  if (held.type === 'sack') return acceptsSupply(st, held.key);
  if (held.type === 'fruit') return acceptsSupply(st, 'fruit');
  return false;
}

function closest(stations, from) {
  let best = null, bestD = Infinity;
  for (const st of stations) {
    const dx = st.front.x - from.x, dz = st.front.z - from.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = st; }
  }
  return best;
}

export function findDeliveryTarget(world, held, from = null) {
  if (!world || !held) return null;
  const candidates = [];
  for (const st of world.stations.values()) if (canDeliverTo(st, held)) candidates.push(st);
  if (!candidates.length) return null;
  return from ? closest(candidates, from) : candidates[0];
}

// Where what is in the owner's hands belongs — and nothing else. There used to be a fallback to a
// RETURN crate here, so "no display has room" resolved to "walk to the bin". The crates are gone
// (docs/SHIP-PLAN-2026-09-19.md §1.4): with nowhere to deliver, the answer is null, and stopping at
// anything that needs empty hands flies the load back to its source by itself
// (systems/stations.js flyBackHeld).
export function destinationFor(world, held, from = null) {
  return findDeliveryTarget(world, held, from);
}

export function heldLabel(held) {
  if (!held) return '';
  if (held.type === 'sack') return held.key || 'supplies';   // cream used to read "kibble"
  if (held.type === 'fruit') return 'fruit';
  const labels = { cookie: 'cookies', brownie: 'brownies', cupcake: 'cupcakes', coffee: 'coffee', latte: 'lattes', smoothie: 'smoothies' };
  return labels[held.key] || held.key || 'items';
}

export function destinationLabel(st) {
  if (!st) return '';
  if (st.type === 'coffee') return 'COFFEE';
  if (st.type === 'blender') return 'BLENDER';
  if (st.type === 'bowl') return 'TREATS';
  if (st.type === 'icecream') return 'ICE CREAM';
  if (st.type === 'display') {
    const labels = { cookie: 'COOKIES', brownie: 'COOKIES', cupcake: 'CUPCAKES', coffee: 'COFFEE BAR', latte: 'COFFEE BAR', smoothie: 'SMOOTHIES' };
    return labels[st.product] || 'DISPLAY';
  }
  return st.type.toUpperCase();
}
