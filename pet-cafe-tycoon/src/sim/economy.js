import { isHoliday, isWeekend } from './day.js';

// Base menu value. The starter bakery remains intentionally modest; later product lines earn more
// so the economy can reduce raw customer volume without making the developed café feel poorer.
export const PRODUCTS = {
  cookie:   { price: 8,  bake: 1.2, color: '#D9A066' },
  cupcake:  { price: 13, bake: 1.6, color: '#FF8A80' },
  coffee:   { price: 12, make: 2.5, color: '#6B4A2B' },
  smoothie: { price: 24, make: 2.0, color: '#8B7CF6' },
  treat:    { price: 8,  color: '#C97A3A' },
  brownie:  { price: 13, bake: 1.2, color: '#6B4023' },
  latte:    { price: 19, make: 2.5, color: '#C9A877' },
};

export const FAMILY = { cookie: 'cookie', brownie: 'cookie', coffee: 'coffee', latte: 'coffee' };
export const familyOf = key => FAMILY[key] || key;

export function availableWishProducts(w) {
  const set = new Set();
  for (const id of w.displays) {
    const st = w.stations.get(id);
    if (st.stock > 0) set.add(st.product);
  }
  for (const st of w.stations.values()) {
    if (!st.active || !(st.stock > 0)) continue;
    if (st.type === 'oven') set.add(st.product);
    else if (st.type === 'coffee') set.add(st.product);
    else if (st.type === 'blender') set.add('smoothie');
  }
  if (set.size === 0) set.add('cookie');
  return [...set];
}
function bowlIsActive(w) {
  for (const st of w.stations.values()) if (st.type === 'bowl' && st.active) return true;
  return false;
}

const BASE_TREAT_CHANCE = 0.3;
export function wishFor(w) {
  const products = availableWishProducts(w);
  const day = w.dayState;
  const baseTreatChance = day ? BASE_TREAT_CHANCE : 0.5;
  if (day && isHoliday(day.day) && products.includes('cupcake') && w.rng.chance(0.3)) {
    const treat = bowlIsActive(w) && (isWeekend(day.day) || w.rng.chance(baseTreatChance));
    return { product: 'cupcake', treat, holiday: true };
  }
  const product = w.rng.pick(products);
  const treat = bowlIsActive(w) && ((day && isWeekend(day.day)) || w.rng.chance(baseTreatChance));
  return { product, treat };
}

export const UPGRADES = {
  speed:  { costs: [400, 900, 1800] },
  carry:  { costs: [300, 700, 1500], values: [6, 9, 12, 16] },
  income: { costs: [600, 1400, 3000] },
};
export const BASE_SPEED = 4.6;
export const playerSpeed = up => BASE_SPEED * (1 + 0.15 * (up.speed | 0));
export const carryCap = up => UPGRADES.carry.values[up.carry | 0];
export function incomeMult(up, boosts, now) {
  const x2 = boosts && boosts.x2Until > now ? 2 : 1;
  return (1 + 0.2 * (up.income | 0)) * x2;
}
export function salePrice(key, up, boosts, seated, now, tipMult = 1) {
  return Math.round(PRODUCTS[key].price * incomeMult(up, boosts, now) * (seated ? 2.0 : 1) * tipMult);
}
export function upgradeCost(key, up) {
  const t = up[key] | 0;
  const c = UPGRADES[key].costs;
  return t < c.length ? c[t] : null;
}

const SEATING_ZONES = ['z_seats1', 'z_seats2'];
function seatingBuilds(builtSet) { return SEATING_ZONES.filter(id => builtSet.has(id)).length; }

// Scarcity pass: before the Staff Desk exists the owner is alone, so the first shifts deliberately
// create breathing room. After hiring unlocks, traffic rises, but day-phase pressure is still the
// primary source of difficulty rather than a permanently crowded floor.
const PRE_HIRE_SPAWN = 7.5, PRE_HIRE_MAXC = 4;
export function spawnInterval(builtSet) {
  if (!builtSet.has('z_hire')) return PRE_HIRE_SPAWN;
  return Math.max(3.4, 5.8 - 0.35 * seatingBuilds(builtSet));
}
export function maxCustomers(builtSet) {
  if (!builtSet.has('z_hire')) return PRE_HIRE_MAXC;
  return Math.min(6, 4 + seatingBuilds(builtSet));
}

// Staff should be attainable, but not all in one early shopping burst. These costs are deliberately
// compatible with the optional contextual Rush Help system: a rewarded ad may close part of an
// authentic shortfall, while ordinary play always remains sufficient.
export const STAFF = {
  runner:  { costs: [900, 1800], speed: 2.8, carry: 6 },
  cashier: { costs: [800], speed: 2.2 },
  cleaner: { costs: [500], speed: 2.2 },
};
export const REGISTER_RATE = { owner: 0.6, cashierBase: 1.0 };
export function hireCost(kind, staffCounts) {
  const n = (staffCounts && staffCounts[kind]) | 0;
  const c = STAFF[kind].costs;
  return n < c.length ? c[n] : null;
}
export function buyUpgrade(state, key) {
  const cost = upgradeCost(key, state.up);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost;
  state.up[key] = (state.up[key] | 0) + 1;
  return { ok: true, cost };
}
export function hire(state, kind) {
  const cost = hireCost(kind, state.staff);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost;
  state.staff[kind] = (state.staff[kind] | 0) + 1;
  return { ok: true, cost };
}

export const WORKER_UPGRADES = { speed: [300, 700, 1500], carry: [250, 600, 1300] };
export const MACHINE_UPGRADES = { oven: [400, 900, 1800], coffee: [400, 900, 1800], display: [300, 700, 1500] };
export const RUNNER_CARRY_LEVELS = [6, 9, 12, 16];
export const DISPLAY_CAP_LEVELS = [12, 16, 20, 24];
export function machineSpeedMult(machineLevels, key) { return 1 + 0.25 * (((machineLevels && machineLevels[key]) | 0)); }
export function workerSpeedMult(staffLevels, kind) { return 1 + 0.2 * (((staffLevels && staffLevels[kind] && staffLevels[kind].speed) | 0)); }

const DEFAULT_STAFF_LEVELS = () => ({ runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } });
const DEFAULT_MACHINE_LEVELS = () => ({ oven: 0, coffee: 0, display: 0 });
export function ensureLevels(state) {
  if (!state.staffLevels) state.staffLevels = DEFAULT_STAFF_LEVELS();
  if (!state.machineLevels) state.machineLevels = DEFAULT_MACHINE_LEVELS();
}
export function workerUpgradeCost(kind, key, staffLevels) {
  const levels = staffLevels && staffLevels[kind];
  if (!levels || !(key in levels)) return null;
  const costs = WORKER_UPGRADES[key];
  const tier = levels[key] | 0;
  return tier < costs.length ? costs[tier] : null;
}
export function machineUpgradeCost(key, machineLevels) {
  const costs = MACHINE_UPGRADES[key];
  if (!costs) return null;
  const tier = (machineLevels && machineLevels[key]) | 0;
  return tier < costs.length ? costs[tier] : null;
}
export function buyWorkerUpgrade(state, kind, key) {
  ensureLevels(state);
  const cost = workerUpgradeCost(kind, key, state.staffLevels);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost;
  state.staffLevels[kind][key] = (state.staffLevels[kind][key] | 0) + 1;
  return { ok: true, cost };
}
export function buyMachineUpgrade(state, key) {
  ensureLevels(state);
  const cost = machineUpgradeCost(key, state.machineLevels);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost;
  state.machineLevels[key] = (state.machineLevels[key] | 0) + 1;
  return { ok: true, cost };
}

export const STAR_IDS = ['oven1', 'oven2', 'dispCookie', 'dispCupcake', 'coffee1', 'barCoffee', 'blender1', 'barSmoothie'];
const STARTER_STATIONS = new Set(['oven1', 'dispCookie']);
export function zonePriceFor(area, stationId) {
  const z = area.zones.find(zz => zz.adds.includes(stationId));
  return z ? z.price : null;
}
export function starCost(area, stationId, targetTier) {
  if (STARTER_STATIONS.has(stationId)) return targetTier === 2 ? 240 : targetTier === 3 ? 480 : null;
  const zp = zonePriceFor(area, stationId);
  if (zp == null) return null;
  return targetTier === 2 ? zp * 2 : targetTier === 3 ? zp * 4 : null;
}
export function nextStarCost(area, stationId, currentTier) {
  const t = (currentTier | 0) || 1;
  return t >= 3 ? null : starCost(area, stationId, t + 1);
}
export const DISPLAY_STAR_CAP = { 1: 8, 2: 12, 3: 16 };
export function ensureStars(state, world) {
  if (!state.stars) state.stars = {};
  for (const id of STAR_IDS) {
    const st = world.stations.get(id);
    if (st && st.active && state.stars[id] == null) state.stars[id] = 1;
  }
}
export function cafeLevel(state) {
  if (!state.stars) return 0;
  let sum = 0;
  for (const id of STAR_IDS) sum += state.stars[id] || 0;
  return sum;
}

// Legacy goal helpers remain for older tests/tools and migration compatibility; live gameplay uses
// sim/career.js's adaptive contracts instead.
export function chooseGoal(day) {
  if (day <= 1) return { kind: 'serve', target: 30, reward: 60 };
  const kind = ['serve', 'lose', 'earn'][(day - 1) % 3];
  if (kind === 'serve') return { kind, target: 30 + 8 * day, reward: 80 + 20 * day };
  if (kind === 'lose') return { kind, target: Math.max(3, 9 - day), reward: 80 + 20 * day };
  const target = 150 + 120 * day;
  return { kind, target, reward: Math.round(target * 0.2) };
}
export function goalLabel(goal) {
  if (!goal) return '';
  if (goal.kind === 'serve') return `Serve ${goal.target}`;
  if (goal.kind === 'lose') return `Lose fewer than ${goal.target}`;
  return `Earn ${goal.target}`;
}
export function goalProgress(goal, dayStats) {
  if (!goal || !dayStats) return 0;
  if (goal.kind === 'serve') return dayStats.served | 0;
  if (goal.kind === 'lose') return dayStats.lost | 0;
  return dayStats.earned | 0;
}
export function goalMet(goal, dayStats) {
  if (!goal || !dayStats) return false;
  if (goal.kind === 'serve') return (dayStats.served | 0) >= goal.target;
  if (goal.kind === 'lose') return (dayStats.lost | 0) < goal.target;
  return (dayStats.earned | 0) >= goal.target;
}
export function buyStar(state, world, stationId) {
  ensureStars(state, world);
  const cur = state.stars[stationId] || 1;
  const cost = nextStarCost(world.area, stationId, cur);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost;
  const tier = cur + 1;
  state.stars[stationId] = tier;
  const st = world.stations.get(stationId);
  if (st && st.type === 'display') st.capacity = DISPLAY_STAR_CAP[tier] || st.capacity;
  return { ok: true, cost, tier };
}
