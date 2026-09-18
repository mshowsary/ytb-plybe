// Barista role contract. The worker owns only the coffee lane: bean top-ups + moving finished
// coffee/latte to the Coffee Bar. It never services ovens, cupcakes, cookies, smoothies, registers
// or tables, preserving the Runner's broader cross-product value.
import { familyOf, STAFF, hireCost } from './economy.js';

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
  // Price the NEXT barista rather than always the first. A second barista is now hireable, and
  // quoting costs[0] for it would have charged 2300 for a 6000-coin hire.
  const cost = hireCost('barista', { barista: count | 0 });
  if (cost == null) return { unlocked: true, available: false, reason: 'full', cost: null };
  if (!coffeeBuilt) return { unlocked: false, available: false, reason: 'coffee', cost };
  if ((day | 0) < BARISTA.unlockDay) return { unlocked: false, available: false, reason: 'day', cost };
  const affordable = Number(coins) >= cost;
  return { unlocked: true, available: affordable, reason: affordable ? 'ready' : 'coins', cost };
}

// The original coffee-lane search, unchanged in every detail (renamed so the dispatcher below can
// call it without recursing on itself).
function coffeeLane(world) {
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
// C6 (Batch 1 plan 3.1/7.2): the second barista's lane. Mirrors coffeeLane above exactly,
// substituting the icecream machine/display for the coffee ones — "first active one found" is
// safe here too since there's only ever one of each in the shipped layout (icecream1/barIce).
// Pantry is picked by NEAREST to the machine (not "first found") rather than coffeeLane's rule,
// since — unlike the coffee lane, which has always had exactly one candidate pantry — the café can
// now have two active pantries at once (pantry1 for beans, coldPantry1 for cream) and picking the
// wrong one would hand the ice-lane barista a bean sack. Falls back to "first found" when a
// station is missing x/z (e.g. a hand-built test fixture) rather than silently returning no pantry.
function iceLane(world) {
  let machine = null, bar = null;
  for (const st of world.stations.values()) {
    if (!st || !st.active) continue;
    if (st.type === 'icecream' && !machine) machine = st;
    else if (st.type === 'display' && familyOf(st.product) === 'icecream' && !bar) bar = st;
  }
  if (!machine || !bar) return null;
  let pantry = null, bestD = Infinity;
  for (const st of world.stations.values()) {
    if (!st || !st.active || st.type !== 'pantry') continue;
    const hasPos = typeof st.x === 'number' && typeof st.z === 'number' && typeof machine.x === 'number';
    const d = hasPos ? (st.x - machine.x) ** 2 + (st.z - machine.z) ** 2 : (pantry ? Infinity : -1);
    if (d < bestD) { bestD = d; pantry = st; }
  }
  return { machine, bar, pantry };
}
// `index` selects which barista this decision is for: 0 (default, every existing caller) is the
// original coffee lane, byte-identical to before this batch; 1 is the cold lane (plan: "barista.js
// baristaLane() returns the coffee lane for barista #1 and the ice lane for #2 — today both
// baristas are identical"). The machine's own supply field differs by lane (coffee1.beans vs
// icecream1.cream — world.js's stepMachines already treats them as parallel fields, same shape),
// so baristaDecision's `supply`/`refillKind` below are the only places that actually need to know
// which lane this is; everything else (room/ready/family-match) is already lane-agnostic.
export function baristaLane(world, index = 0) {
  return index === 1 ? iceLane(world) : coffeeLane(world);
}

export function baristaDecision(world, index = 0) {
  const cold = index === 1;
  const lane = baristaLane(world, index);
  if (!lane) return { kind: 'idle', reason: cold ? 'ice-lane-unavailable' : 'coffee-lane-unavailable' };
  const { machine, bar, pantry } = lane;
  const supply = cold ? machine.cream : machine.beans;
  const refillKind = cold ? 'refillCream' : 'refillBeans';

  // Pantry is the same supply source the owner uses; a Barista never fabricates beans/cream
  // without it.
  if (pantry && supply <= BARISTA.refillAt) {
    const room = Math.max(0, Math.min(20 - supply, BARISTA.refillTo - supply));
    if (room > 0) return { kind: refillKind, pantryId: pantry.id, machineId: machine.id, amount: room };
  }

  const room = Math.max(0, (bar.capacity | 0) - (bar.stock | 0));
  const ready = Math.max(0, machine.stock | 0);
  if (room > 0 && ready > 0 && familyOf(machine.product) === familyOf(bar.product)) {
    return {
      kind: cold ? 'restockIcecream' : 'restockCoffee',
      sourceId: machine.id,
      targetId: bar.id,
      product: machine.product,
      count: Math.min(BARISTA.carry, room, ready),
    };
  }

  return { kind: 'idle', reason: supply <= BARISTA.refillAt && !pantry ? 'pantry-unavailable' : (cold ? 'ice-lane-stable' : 'coffee-lane-stable') };
}

export function baristaRoleSummary() {
  return {
    owns: ['coffee beans', 'coffee machine', 'coffee bar'],
    excludes: ['cookies', 'cupcakes', 'smoothies', 'registers', 'tables'],
    runnerStillOwns: 'cross-product production-to-display restocking',
  };
}
