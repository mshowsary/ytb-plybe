import { isHoliday, isWeekend } from './day.js';
import { DECOR, DECOR_BY_ID, decorUnlocked } from '../../data/decor.js';

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
  // Batch 1 — the ice cream lane (plan 3.1). icecream1 mirrors coffee1 exactly, so sundae is its
  // alt recipe (world.js ALT_PRODUCT) the same way latte is coffee1's. pupcup is a pet-treat
  // variant dispensed at icecream1 (plan: wishFor gives terrace-bound pet wishes a pupcup instead
  // of a treat) — it has no `make`/`bake` because it costs 1 cream directly, not a buffer slot.
  icecream: { price: 26, make: 2.0, color: '#FFF0F5' },
  sundae:   { price: 34, make: 2.6, color: '#FFD6E7' },
  pupcup:   { price: 14, color: '#FFE4C4' },
};

export const FAMILY = { cookie: 'cookie', brownie: 'cookie', coffee: 'coffee', latte: 'coffee', sundae: 'icecream' };
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
    // icecream mirrors coffee: a guest may wish for it while it is still in the machine, which
    // is what makes a runner fetch it to the bar. Without this the lane cannot start — nobody
    // wishes for ice cream until the bar has stock, and the bar only gets stock because
    // somebody wished. Measured as 0 ice cream sold across a 40-day run.
    else if (st.type === 'icecream') set.add(st.product);
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

// ---------------------------------------------------------------------------------------------
// WHY THE LADDERS CONTINUE
// Every ladder in this file used to be a fixed array that returned null once exhausted, so the
// whole economy terminated: sim/completion.js still ships a "Café collection complete" state.
// Total authored spend is roughly 110k coins, and the headless bot reaches the end on day 12 --
// which is exactly the wall players describe, and it is a design target, not an accident.
//
// The ladders now CONTINUE past their authored tiers instead of ending. Authored tiers are
// returned verbatim, so days 1-12 stay bit-identical and every balance result already validated
// against them still holds. Only the previously dead region past the end changes.
//
// Costs grow geometrically (an ever-larger goal) while effects approach an asymptote (bounded
// power). That pairing is what keeps a late café worth investing in without letting the owner
// outrun the floor they are supposed to be reading.
export const LADDER_GROWTH = 1.85;
export function continueLadder(costs, tier, growth = LADDER_GROWTH) {
  if (tier < costs.length) return costs[tier];
  const last = costs[costs.length - 1];
  return Math.round(last * Math.pow(growth, tier - costs.length + 1) / 10) * 10;
}
// Approaches authoredValue(authoredTiers) + span without reaching it, so tier 40 beats tier 12
// by a visible but bounded margin.
function asymptote(tier, authoredTiers, authoredValue, span, decay) {
  if (tier <= authoredTiers) return authoredValue(tier);
  return authoredValue(authoredTiers) + span * (1 - Math.pow(decay, tier - authoredTiers));
}
export const BASE_SPEED = 4.6;
// Authored 1 + 0.15t through tier 3 (= 1.45); past that it climbs toward 1.85 and stops. An owner
// who outruns their own café stops being able to read the floor.
export const playerSpeed = up =>
  BASE_SPEED * asymptote(up.speed | 0, 3, t => 1 + 0.15 * t, 0.40, 0.86);
// Carry is a capacity, so a flat +4 per tier stays legible where a curve would not.
export const carryCap = up => {
  const t = up.carry | 0, v = UPGRADES.carry.values;
  return t < v.length ? v[t] : v[v.length - 1] + 4 * (t - v.length + 1);
};
export function incomeMult(up, boosts, now) {
  const x2 = boosts && boosts.x2Until > now ? 2 : 1;
  // Authored 1 + 0.2t through tier 3 (= 1.6); past that toward 2.2. Inflation beyond that outpaces
  // every cost curve here and turns coins back into a meaningless number.
  return asymptote(up.income | 0, 3, t => 1 + 0.2 * t, 0.60, 0.85) * x2;
}
export function salePrice(key, up, boosts, seated, now, tipMult = 1) {
  return Math.round(PRODUCTS[key].price * incomeMult(up, boosts, now) * (seated ? 2.0 : 1) * tipMult);
}
export function upgradeCost(key, up) {
  const cfg = UPGRADES[key];
  return cfg ? continueLadder(cfg.costs, up[key] | 0) : null;
}

// Task 25 supported demand model. The Desk itself adds ZERO traffic: arrivals rise only when the
// café gains a productive menu lane or useful operating capacity. This prevents buying automation
// from simultaneously making the floor harder, while still allowing developed cafés to feel busier.
function productiveLines(builtSet) {
  return 1
    + (builtSet.has('z_oven2') ? 1 : 0)
    + (builtSet.has('z_coffee') ? 1 : 0)
    + (builtSet.has('z_blender') ? 1 : 0);
}
function usefulFrontCapacity(staff = {}) {
  return Math.min(2, Math.max(0, (staff.runner | 0) + (staff.cashier | 0)));
}
// A fully built café ran 5 workers against a hard ceiling of 6 guests arriving no faster than one
// per 4.3s. Being overwhelmed was therefore not merely unlikely, it was arithmetically impossible,
// which is why a finished café feels like a solved puzzle rather than a busy shop.
//
// `level` is cafeLevel(state): the sum of station star tiers, so pressure tracks the same
// investment the player is making. Callers that omit it get exactly the old numbers, which keeps
// every existing test and experiment tool valid.
export const CROWD_FLOOR_INTERVAL = 2.2;   // fastest sustained arrival, ~27 guests/minute
export const CROWD_CEILING = 14;           // most guests on the floor at once
export function spawnInterval(builtSet, staff = {}, level = 0) {
  const lines = productiveLines(builtSet);
  const usefulStaff = usefulFrontCapacity(staff);
  const authored = Math.max(4.3, 7.5 - 0.65 * (lines - 1) - 0.35 * usefulStaff);
  if (!(level > 8)) return authored;
  // Past the authored build-out the room keeps getting busier, approaching the floor.
  return Math.max(CROWD_FLOOR_INTERVAL, authored - 0.085 * (level - 8));
}
export function maxCustomers(builtSet, staff = {}, level = 0) {
  const lines = productiveLines(builtSet);
  const usefulStaff = usefulFrontCapacity(staff);
  const authored = Math.min(6, 4 + (lines >= 3 ? 1 : 0) + (usefulStaff >= 2 ? 1 : 0));
  if (!(level > 8)) return authored;
  return Math.min(CROWD_CEILING, authored + Math.floor((level - 8) / 5));
}

// Task 25: Task 24 measured the first Runner as the earliest useful automation because empty-display
// pressure dominated the early café. Only that first slot changes: the second Runner and every
// other worker keep their existing prices, so the candidate creates an early relief moment without
// flattening the later staffing economy.
export const STAFF = {
  runner:  { costs: [150, 2800, 5400, 9600], speed: 2.8, carry: 6 },
  cashier: { costs: [1550, 4200], speed: 2.2 },
  cleaner: { costs: [1350, 3600], speed: 2.2 },
  barista: { costs: [2300, 6000], speed: 2.4, carry: 4 },
};
export const REGISTER_RATE = { owner: 0.6, cashierBase: 1.0 };
export function hireCost(kind, staffCounts) {
  const n = (staffCounts && staffCounts[kind]) | 0;
  const def = STAFF[kind];
  if (!def) return null;
  const c = def.costs;
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
export function machineSpeedMult(machineLevels, key) {
  return asymptote(((machineLevels && machineLevels[key]) | 0), 3, t => 1 + 0.25 * t, 0.70, 0.84);
}
export function workerSpeedMult(staffLevels, kind) {
  const t = ((staffLevels && staffLevels[kind] && staffLevels[kind].speed) | 0);
  return asymptote(t, 3, x => 1 + 0.2 * x, 0.55, 0.85);
}

const DEFAULT_STAFF_LEVELS = () => ({ runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } });
const DEFAULT_MACHINE_LEVELS = () => ({ oven: 0, coffee: 0, display: 0 });
export function ensureLevels(state) {
  if (!state.staffLevels) state.staffLevels = DEFAULT_STAFF_LEVELS();
  if (!state.machineLevels) state.machineLevels = DEFAULT_MACHINE_LEVELS();
}
export function workerUpgradeCost(kind, key, staffLevels) {
  const levels = staffLevels && staffLevels[kind];
  if (!levels || !(key in levels)) return null;
  return continueLadder(WORKER_UPGRADES[key], levels[key] | 0);
}
export function machineUpgradeCost(key, machineLevels) {
  const costs = MACHINE_UPGRADES[key];
  if (!costs) return null;
  return continueLadder(costs, (machineLevels && machineLevels[key]) | 0);
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
  if (t < 3) return starCost(area, stationId, t + 1);
  // A maxed station used to stop being an investment target entirely. The ladder continues from
  // the authored tier-3 price so late coins always have somewhere to go.
  const base = starCost(area, stationId, 3);
  return base == null ? null : Math.round(base * Math.pow(1.8, t - 2) / 10) * 10;
}
// Authored through tier 3; +4 slots per tier after that.
export const DISPLAY_STAR_CAP = { 1: 8, 2: 12, 3: 16 };
export function displayStarCap(tier) {
  const t = Math.max(1, tier | 0);
  return t <= 3 ? DISPLAY_STAR_CAP[t] : 16 + 4 * (t - 3);
}
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
  if (st && st.type === 'display') st.capacity = displayStarCap(tier) || st.capacity;
  return { ok: true, cost, tier };
}

// ---------------------------------------------------------------------------------------------
// DECOR (plan 3.12) -- the "always something to buy" sink.
//
// The headless bot measured five consecutive early days (2-6) with ZERO affordable options: every
// sink in the shop is a 300+ coin zone, a 150-2800 coin hire or a 240+ coin star, so a café that
// has just finished paying for a build has nothing left to want. Decor is the 60-900 coin filler
// that closes that gap.
//
// It is deliberately OUTSIDE the upgrade/staff/star ladders: those were balanced last session and
// days 1-12 must stay bit-identical. Decor spends coins and grants ONLY reputation and a visual,
// so it can never move throughput, patience, prices, spawn rates or navigation.
export function decorCost(id) {
  const item = DECOR_BY_ID.get(id);
  return item ? item.price : null;
}

// The owned list lives on meta (it is permanent progression, like the Pet Book) rather than on the
// world, so it survives a rebuild and is carried by one save field.
export function ownedDecor(state) {
  const list = state && state.meta && state.meta.decor;
  return Array.isArray(list) ? list : [];
}
export function ownsDecor(state, id) {
  return ownedDecor(state).includes(id);
}

// Same shape as buyUpgrade/hire above: {ok, cost}. A row that is unknown, already owned or still
// gated returns ok:false with a null/known cost and NEVER mutates the wallet.
export function buyDecor(state, id) {
  const item = DECOR_BY_ID.get(id);
  if (!item) return { ok: false, cost: null };
  const builtSet = state && state.world && state.world.built ? state.world.built : null;
  if (!decorUnlocked(item, builtSet)) return { ok: false, cost: item.price };
  if (!state.meta || typeof state.meta !== 'object') state.meta = {};
  if (!Array.isArray(state.meta.decor)) state.meta.decor = [];
  if (state.meta.decor.includes(id)) return { ok: false, cost: item.price, owned: true };
  const cost = item.price;
  if (!(state.coins >= cost)) return { ok: false, cost };
  state.coins -= cost;
  state.meta.decor.push(id);
  // Buying grants +1 reputation. saveSchema.js widens the restore ceiling by exactly the owned
  // decor count so this earned reputation survives a reload instead of being clamped away.
  state.meta.reputation = Math.max(0, state.meta.reputation | 0) + (item.rep | 0);
  return { ok: true, cost, rep: item.rep | 0 };
}

// Everything the player could buy right now: unowned, unlocked and within the wallet. The bot's
// invariant-A counter and the kiosk's decor tab both read from this one definition.
export function affordableDecor(state, builtSet = null) {
  const coins = (state && state.coins) || 0;
  const owned = new Set(ownedDecor(state));
  const built = builtSet || (state && state.world && state.world.built) || null;
  return DECOR.filter(item => !owned.has(item.id) && decorUnlocked(item, built) && item.price <= coins);
}

// The cheapest thing still on the decor shelf, or null when the catalogue is exhausted. Invariant A
// ("always something to buy") is exactly "this is non-null and priced within reach".
export function cheapestDecor(state, builtSet = null) {
  const owned = new Set(ownedDecor(state));
  const built = builtSet || (state && state.world && state.world.built) || null;
  let best = null;
  for (const item of DECOR) {
    if (owned.has(item.id) || !decorUnlocked(item, built)) continue;
    if (!best || item.price < best.price) best = item;
  }
  return best;
}

