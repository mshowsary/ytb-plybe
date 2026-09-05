// Barista role contract. The worker owns only the coffee lane: bean top-ups + moving finished
// coffee/latte to the Coffee Bar. It never services ovens, cupcakes, cookies, smoothies, registers
// or tables, preserving the Runner's broader cross-product value.
import { familyOf, STAFF } from './economy.js';

export const BARISTA = Object.freeze({
  unlockDay: 5,
  cost: STAFF.barista.costs[0],
  cap: STAFF.barista.costs.length,
  speed: STAFF.barista.speed,
  carry: STAFF.barista.carry,
  refillAt: 7,
  refillTo: 18,
});

function builtHas(built, id) {
  return !!(built && (typeof built.has === 'function' ? built.has(id) : Array.isArray(built) ? built.includes(id) : built[id]));
}

export function baristaHireState(day, built, coins = 0, count = 0) {
  const coffeeBuilt = builtHas(built, 'z_coffee');
  if ((count | 0) >= BARISTA.cap) return { unlocked: true, available: false, reason: 'full', cost: null };
  if (!coffeeBuilt) return { unlocked: false, available: false, reason: 'coffee', cost: BARISTA.cost };
  if ((day | 0) < BARISTA.unlockDay) return { unlocked: false, available: false, reason: 'day', cost: BARISTA.cost };
  return { unlocked: true, available: Number(coins) >= BARISTA.cost, reason: Number(coins) >= BARISTA.cost ? 'ready' : 'coins', cost: BARISTA.cost };
}

export function baristaLane(world) {
  if (!world || !world.stations) return null;
  let machine = null, bar = null, pantry = null;
  for (const st of world.stations.values()) {
    if (!st || !st.active) continue;
    if (st.type === 'coffee' && !machine) machine = st;
    else if (st.type === 'pantry' && !pantry) pantry = st;
    else if (st.type === 'display' && familyOf(st.product) === 'coffee' && !bar) bar = st;
  }
  return machine && bar ? { machine, bar, pantry } : null;
}

export function baristaDecision(world) {
  const lane = baristaLane(world);
  if (!lane) return { kind: 'idle', reason: 'coffee-lane-unavailable' };
  const { machine, bar, pantry } = lane;

  // Pantry is the same supply source the owner uses; a Barista never fabricates beans without it.
  if (pantry && machine.beans <= BARISTA.refillAt) {
    const room = Math.max(0, Math.min(20 - machine.beans, BARISTA.refillTo - machine.beans));
    if (room > 0) return { kind: 'refillBeans', pantryId: pantry.id, machineId: machine.id, amount: room };
  }

  const room = Math.max(0, (bar.capacity | 0) - (bar.stock | 0));
  const ready = Math.max(0, machine.stock | 0);
  if (room > 0 && ready > 0 && familyOf(machine.product) === familyOf(bar.product)) {
    return {
      kind: 'restockCoffee',
      sourceId: machine.id,
      targetId: bar.id,
      product: machine.product,
      count: Math.min(BARISTA.carry, room, ready),
    };
  }

  return { kind: 'idle', reason: machine.beans <= BARISTA.refillAt && !pantry ? 'pantry-unavailable' : 'coffee-lane-stable' };
}

export function baristaRoleSummary() {
  return {
    owns: ['coffee beans', 'coffee machine', 'coffee bar'],
    excludes: ['cookies', 'cupcakes', 'smoothies', 'registers', 'tables'],
    runnerStillOwns: 'cross-product production-to-display restocking',
  };
}
