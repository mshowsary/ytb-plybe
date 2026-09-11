import { familyOf } from './economy.js';

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
  if (held.type === 'sack' && held.key === 'beans') return st.type === 'coffee' && st.beans < 20;
  if (held.type === 'sack' && held.key === 'kibble') return st.type === 'bowl' && st.stock < st.capacity;
  if (held.type === 'fruit') return st.type === 'blender' && st.fruit < 9;
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

export function findReturnStation(world, from = null) {
  if (!world) return null;
  const candidates = [];
  for (const st of world.stations.values()) if (st.active && st.type === 'return') candidates.push(st);
  if (!candidates.length) return null;
  return from ? closest(candidates, from) : candidates[0];
}

export function destinationFor(world, held, from = null) {
  return findDeliveryTarget(world, held, from) || findReturnStation(world, from);
}

export function heldLabel(held) {
  if (!held) return '';
  if (held.type === 'sack') return held.key === 'beans' ? 'beans' : 'kibble';
  if (held.type === 'fruit') return 'fruit';
  const labels = { cookie: 'cookies', brownie: 'brownies', cupcake: 'cupcakes', coffee: 'coffee', latte: 'lattes', smoothie: 'smoothies' };
  return labels[held.key] || held.key || 'items';
}

export function destinationLabel(st) {
  if (!st) return '';
  if (st.type === 'return') return 'RETURN';
  if (st.type === 'coffee') return 'COFFEE';
  if (st.type === 'blender') return 'BLENDER';
  if (st.type === 'bowl') return 'TREATS';
  if (st.type === 'display') {
    const labels = { cookie: 'COOKIES', brownie: 'COOKIES', cupcake: 'CUPCAKES', coffee: 'COFFEE BAR', latte: 'COFFEE BAR', smoothie: 'SMOOTHIES' };
    return labels[st.product] || 'DISPLAY';
  }
  return st.type.toUpperCase();
}
