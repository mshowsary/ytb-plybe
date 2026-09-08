import { isHoliday, isWeekend } from './day.js';
import { DECOR, DECOR_BY_ID, decorUnlocked } from '../../data/decor.js';
import { ACCESSORIES, ACCESSORY_BY_ID, accessoryUnlocked } from '../../data/accessories.js';
// The Paw Rating owns the AUTHORED size of the arrivals bonus (+10%/star); this file owns how it
// lands on the demand curve. pawRating.js imports only data/area1.js and sim/petBook.js, both
// leaves, so this adds no cycle back into economy.js.
import { pawArrivalMultiplier, pawBestStar } from './pawRating.js';
// TASK 1.6a: every tunable number below (menu prices, ladders, growth constants, the demand curve,
// star-cost formula) now lives in economyConfig.js. This file is the BEHAVIOUR — the formulas that
// read those numbers — economyConfig.js is the DATA. Re-exporting the config's own names here (the
// `export { X } from` lines) keeps every existing `import { PRODUCTS } from './economy.js'` call
// site elsewhere in the codebase working unchanged; only this file's internals were touched.
import {
  PRODUCTS, FAMILY, BASE_TREAT_CHANCE, UPGRADES, LADDER_GROWTH, BASE_SPEED,
  SPEED_ASYMPTOTE, INCOME_ASYMPTOTE, MACHINE_ASYMPTOTE, WORKER_ASYMPTOTE, DEMAND,
  STAFF, REGISTER_RATE, WORKER_UPGRADES, MACHINE_UPGRADES, RUNNER_CARRY_LEVELS, DISPLAY_CAP_LEVELS,
  STARTER_STAR_COSTS, ZONE_STAR_MULT, STAR_LADDER_GROWTH, DISPLAY_STAR_CAP, DISPLAY_STAR_CAP_GROWTH_PER_TIER,
} from './economyConfig.js';
export {
  PRODUCTS, FAMILY, UPGRADES, LADDER_GROWTH, BASE_SPEED,
  STAFF, REGISTER_RATE, WORKER_UPGRADES, MACHINE_UPGRADES, RUNNER_CARRY_LEVELS, DISPLAY_CAP_LEVELS,
  DISPLAY_STAR_CAP,
} from './economyConfig.js';
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
// Authored 1 + 0.15t through tier 3 (= 1.45); past that it climbs toward 1.85 and stops. An owner
// who outruns their own café stops being able to read the floor.
export const playerSpeed = up =>
  BASE_SPEED * asymptote(up.speed | 0, SPEED_ASYMPTOTE.authoredTiers, t => 1 + SPEED_ASYMPTOTE.coef * t, SPEED_ASYMPTOTE.span, SPEED_ASYMPTOTE.decay);
// Carry is a capacity, so a flat +4 per tier stays legible where a curve would not.
export const carryCap = up => {
  const t = up.carry | 0, v = UPGRADES.carry.values;
  return t < v.length ? v[t] : v[v.length - 1] + 4 * (t - v.length + 1);
};
export function incomeMult(up, boosts, now) {
  const x2 = boosts && boosts.x2Until > now ? 2 : 1;
  // Authored 1 + 0.2t through tier 3 (= 1.6); past that toward 2.2. Inflation beyond that outpaces
  // every cost curve here and turns coins back into a meaningless number.
  return asymptote(up.income | 0, INCOME_ASYMPTOTE.authoredTiers, t => 1 + INCOME_ASYMPTOTE.coef * t, INCOME_ASYMPTOTE.span, INCOME_ASYMPTOTE.decay) * x2;
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
export const CROWD_FLOOR_INTERVAL = DEMAND.CROWD_FLOOR_INTERVAL;   // fastest sustained arrival, ~27 guests/minute
export const CROWD_CEILING = DEMAND.CROWD_CEILING;                 // most guests on the floor at once
export function spawnInterval(builtSet, staff = {}, level = 0) {
  const lines = productiveLines(builtSet);
  const usefulStaff = usefulFrontCapacity(staff);
  const authored = Math.max(DEMAND.MIN_INTERVAL, DEMAND.BASE_INTERVAL - DEMAND.INTERVAL_PER_LINE * (lines - 1) - DEMAND.INTERVAL_PER_STAFF * usefulStaff);
  if (!(level > DEMAND.LEVEL_GATE)) return authored;
  // Past the authored build-out the room keeps getting busier, approaching the floor — linearly, the
  // same as before, through LEVEL_SOFT_CAP (unchanged for every level this run ever reaches through
  // day 11; see economyConfig.js's DEMAND comment for why the cap sits at 24). Past the cap the SAME
  // bounded-approach shape used for worker/machine/player throughput takes over, because `level` past
  // that point is being pushed almost entirely by star purchases that buy price, not speed.
  const cappedLevel = Math.min(level, DEMAND.LEVEL_SOFT_CAP);
  let reduced = authored - DEMAND.INTERVAL_PER_LEVEL * (cappedLevel - DEMAND.LEVEL_GATE);
  if (level > DEMAND.LEVEL_SOFT_CAP) {
    reduced -= DEMAND.LEVEL_SPAN * (1 - Math.pow(DEMAND.LEVEL_DECAY, level - DEMAND.LEVEL_SOFT_CAP));
  }
  return Math.max(CROWD_FLOOR_INTERVAL, reduced);
}
export function maxCustomers(builtSet, staff = {}, level = 0) {
  const lines = productiveLines(builtSet);
  const usefulStaff = usefulFrontCapacity(staff);
  const authored = Math.min(DEMAND.MAX_CEILING_AUTHORED, DEMAND.BASE_MAX + (lines >= 3 ? DEMAND.MAX_LINE_BONUS : 0) + (usefulStaff >= 2 ? DEMAND.MAX_STAFF_BONUS : 0));
  if (!(level > DEMAND.LEVEL_GATE)) return authored;
  // Mirrors spawnInterval's own cap: identical up through LEVEL_SOFT_CAP, a slower step rate past it.
  const cappedLevel = Math.min(level, DEMAND.LEVEL_SOFT_CAP);
  let bonus = Math.floor((cappedLevel - DEMAND.LEVEL_GATE) / DEMAND.LEVEL_PER_MAX_STEP);
  if (level > DEMAND.LEVEL_SOFT_CAP) bonus += Math.floor((level - DEMAND.LEVEL_SOFT_CAP) / DEMAND.LEVEL_PER_MAX_STEP_BEYOND_CAP);
  return Math.min(CROWD_CEILING, authored + bonus);
}

// Batch 3 (plan §3.4): each Paw Rating star is "+10% arrivals". Arrivals are expressed here as an
// INTERVAL, so a +10%/star ARRIVAL RATE is a DIVISION by pawArrivalMultiplier(best), not a
// subtraction of seconds — at ★5 the rate is 1.5x, i.e. the interval is 1/1.5 of what it was.
// Subtracting a flat bonus instead would be worth a different amount of traffic at every build
// level and would need a second floor of its own. Always fed the RATCHET (pawBestStar), never
// `live`: an arrivals bonus that switched off after a bad week would read as the game breaking.
export function pawSpawnIntervalMultiplier(bestStar) {
  return 1 / pawArrivalMultiplier(bestStar);
}

// THE one function that owns the sustained arrival floor.
//
// spawnInterval() clamps only the build/level curve. Every multiplier applied AFTER it landed at
// the call site, i.e. past that clamp: 2000 followers alone already took a maxed café to
// 2.2 / 1.5 = 1.47s against a documented floor of 2.2s, and compounding ★5 on top of that would
// have reached 2.2 / 1.5 / 1.5 = 0.98s — about 61 arrivals/minute into a room that never holds more
// than CROWD_CEILING guests, i.e. a permanent give-up queue rather than a busier café. So the
// PRODUCT is re-clamped here instead of either effect being individually shrunk: both keep their
// authored strength on every café that has not already reached the floor, and no combination of
// them can outrun the number the demand model is balanced against.
//
// `followerMult` is passed in as a plain number (followers.spawnIntervalMultiplier's result) rather
// than imported, so this file keeps owning the demand curve without also owning the follower curve.
// Capacity takes no Paw bonus at all — a star is worth +1 RESIDENT slot, not +1 guest — so
// maxCustomers() needs no companion to this and CROWD_CEILING is untouched by the rating.
export function effectiveSpawnInterval(builtSet, staff = {}, level = 0, opts = {}) {
  const followerMult = Number(opts.followerMult);
  const fm = Number.isFinite(followerMult) && followerMult > 0 ? followerMult : 1;
  return Math.max(CROWD_FLOOR_INTERVAL, spawnInterval(builtSet, staff, level) * fm * pawSpawnIntervalMultiplier(opts.pawStars | 0));
}

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

export function machineSpeedMult(machineLevels, key) {
  return asymptote(((machineLevels && machineLevels[key]) | 0), MACHINE_ASYMPTOTE.authoredTiers, t => 1 + MACHINE_ASYMPTOTE.coef * t, MACHINE_ASYMPTOTE.span, MACHINE_ASYMPTOTE.decay);
}
export function workerSpeedMult(staffLevels, kind) {
  const t = ((staffLevels && staffLevels[kind] && staffLevels[kind].speed) | 0);
  return asymptote(t, WORKER_ASYMPTOTE.authoredTiers, x => 1 + WORKER_ASYMPTOTE.coef * x, WORKER_ASYMPTOTE.span, WORKER_ASYMPTOTE.decay);
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
  if (STARTER_STATIONS.has(stationId)) return targetTier === 2 ? STARTER_STAR_COSTS.tier2 : targetTier === 3 ? STARTER_STAR_COSTS.tier3 : null;
  const zp = zonePriceFor(area, stationId);
  if (zp == null) return null;
  return targetTier === 2 ? zp * ZONE_STAR_MULT.tier2 : targetTier === 3 ? zp * ZONE_STAR_MULT.tier3 : null;
}
export function nextStarCost(area, stationId, currentTier) {
  const t = (currentTier | 0) || 1;
  if (t < 3) return starCost(area, stationId, t + 1);
  // A maxed station used to stop being an investment target entirely. The ladder continues from
  // the authored tier-3 price so late coins always have somewhere to go.
  const base = starCost(area, stationId, 3);
  return base == null ? null : Math.round(base * Math.pow(STAR_LADDER_GROWTH, t - 2) / 10) * 10;
}
// Authored through tier 3; +DISPLAY_STAR_CAP_GROWTH_PER_TIER slots per tier after that.
export function displayStarCap(tier) {
  const t = Math.max(1, tier | 0);
  return t <= 3 ? DISPLAY_STAR_CAP[t] : DISPLAY_STAR_CAP[3] + DISPLAY_STAR_CAP_GROWTH_PER_TIER * (t - 3);
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
  if (!decorUnlocked(item, builtSet, pawBestStar(state && state.meta))) return { ok: false, cost: item.price };
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
  return DECOR.filter(item => !owned.has(item.id) && decorUnlocked(item, built, pawBestStar(state && state.meta)) && item.price <= coins);
}

// The cheapest thing still on the decor shelf, or null when the catalogue is exhausted. Invariant A
// ("always something to buy") is exactly "this is non-null and priced within reach".
export function cheapestDecor(state, builtSet = null) {
  const owned = new Set(ownedDecor(state));
  const built = builtSet || (state && state.world && state.world.built) || null;
  let best = null;
  for (const item of DECOR) {
    if (owned.has(item.id) || !decorUnlocked(item, built, pawBestStar(state && state.meta))) continue;
    if (!best || item.price < best.price) best = item;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// BOUTIQUE (plan §3.5/§3.9) -- accessories bought for coins, "an alternative to milestones". Every
// row in data/accessories.js already carries a follower-tier gate (and four carry a season gate);
// this is a THIRD door, priced in the same 60-900 band decor uses, so a player who does not want to
// wait on followers or a season can buy straight in once the boutique is built. Exactly like decor,
// this can only ever grant a cosmetic (accessoryUnlocked's bought path) plus the ability to equip
// it -- never followers, never a rating, never a stat -- so it cannot destabilise anything the
// economy pass already balanced.
function boutiqueBuilt(builtSet) {
  if (!builtSet) return false;
  return typeof builtSet.has === 'function' ? builtSet.has('z_boutique') : !!builtSet.z_boutique;
}

export function ownedAccessories(state) {
  const list = state && state.meta && state.meta.accessoriesBought;
  return Array.isArray(list) ? list : [];
}
export function ownsAccessory(state, id) {
  return ownedAccessories(state).includes(id);
}

// Everything still worth buying in the boutique right now: has a boutique price, is not already
// unlocked through ANY door (follower tier, season or an earlier purchase -- accessoryUnlocked
// covers all three), and the boutique itself is built. Mirrors affordableDecor's "unowned, unlocked,
// gated" shape; the kiosk's boutique tab and buyAccessory both read this one definition.
export function boutiqueCatalogue(state, builtSet = null) {
  const built = builtSet || (state && state.world && state.world.built) || null;
  if (!boutiqueBuilt(built)) return [];
  const meta = state && state.meta;
  const day = state && state.dayState && state.dayState.day;
  return ACCESSORIES.filter(item => typeof item.price === 'number' && !accessoryUnlocked(item.id, meta, day));
}

export function affordableAccessories(state, builtSet = null) {
  const coins = (state && state.coins) || 0;
  return boutiqueCatalogue(state, builtSet).filter(item => item.price <= coins);
}

// The cheapest thing still on the boutique shelf, or null. Same role as cheapestDecor for invariant
// A's "always something in reach" gate -- see tools/bot.js's affordableOptionsCount/
// cheapestPurchasablePrice, which are wired to add this alongside cheapestDecor as ONE option, not
// one per item (that file is not owned here; see this task's wiringNeeded).
export function cheapestAccessory(state, builtSet = null) {
  let best = null;
  for (const item of boutiqueCatalogue(state, builtSet)) {
    if (!best || item.price < best.price) best = item;
  }
  return best;
}

// Same shape as buyDecor: {ok, cost}, never mutates the wallet on refusal. `meta.accessoriesBought`
// is REPLACED with a new array on a successful buy (rule 7 -- nested save state is never mutated in
// place), not pushed into, so G.snapshot()'s one-level-deep meta spread always sees a fresh array.
export function buyAccessory(state, id) {
  const item = ACCESSORY_BY_ID.get(id);
  if (!item || typeof item.price !== 'number') return { ok: false, cost: null };
  const builtSet = state && state.world && state.world.built ? state.world.built : null;
  if (!boutiqueBuilt(builtSet)) return { ok: false, cost: item.price };
  const meta = state && state.meta;
  const day = state && state.dayState && state.dayState.day;
  if (accessoryUnlocked(id, meta, day)) return { ok: false, cost: item.price, owned: true };
  if (!state.meta || typeof state.meta !== 'object') state.meta = {};
  const owned = ownedAccessories(state);
  const cost = item.price;
  if (!(state.coins >= cost)) return { ok: false, cost };
  state.coins -= cost;
  state.meta.accessoriesBought = [...owned, id];
  return { ok: true, cost };
}

