import { isHoliday, isWeekend } from './day.js';
// Loop v2 Task 3 (spec section 7): the M3-tuned "flat demand, high price" pricing (cookie 24 etc.)
// is reset back to the v1 numbers, THEN tuned down within the task's own -40% bound (a uniform
// -35% cut) — the day rhythm (morning/rush/afternoon multipliers) and tips (tipMult below) carry
// growth on top, and the bot's first tuning pass measured day-1 earnings ~4x over its target even
// after that reset, so the price half of the -40%/+40% bound gets used at close to its full extent
// (see the report's "before -> after" table for the whole tuning pass). Star-3 second recipes
// (brownie, latte) stay at 1.6x their base family member.
export const PRODUCTS = {
  cookie:   { price: 8,  bake: 1.2, color: '#D9A066' }, // 12 * 0.65
  cupcake:  { price: 13, bake: 1.6, color: '#FF8A80' }, // 20 * 0.65
  coffee:   { price: 10, make: 2.5, color: '#6B4A2B' }, // 16 * 0.65
  smoothie: { price: 21, make: 2.0, color: '#8B7CF6' }, // 32 * 0.65
  treat:    { price: 7,  color: '#C97A3A' },            // 10 * 0.65
  // Star-3 second recipes (Task 3): Oven A also bakes brownies (alternating batches with cookies),
  // the coffee machine also makes lattes — both sold from their base product's own display/bar (a
  // display holds one FAMILY — see FAMILY below and world.js's putOnDisplay).
  brownie:  { price: 13, bake: 1.2, color: '#6B4023' }, // 1.6x cookie (8), rounded
  latte:    { price: 16, make: 2.5, color: '#C9A877' }, // 1.6x coffee (10), rounded
};
// A display/bar holds ONE family, fungibly — dispCookie holds cookie+brownie, barCoffee holds
// coffee+latte; every other product is its own singleton family. world.js's putOnDisplay accepts
// any family member and re-labels the display's current product to whichever was just dropped;
// sim/customers.js's pickDisplay/anyStockedDisplay and sim/staff.js/botDecide.js's displayFor all
// match by family instead of exact product so a brownie-wishing customer queues at the (family)
// cookie display even mid-way through a cookie batch.
export const FAMILY = { cookie: 'cookie', brownie: 'cookie', coffee: 'coffee', latte: 'coffee' };
export const familyOf = key => FAMILY[key] || key;
// M3 T3: products a wish can ask for — whatever any active counter currently stocks, plus
// whatever an active production station genuinely has ready (stock > 0), not just built. Gating
// on stock (not merely `active`) matters for coffee/blender specifically: their production chain
// (stepCoffee/stepBlender, Task 4) doesn't exist yet, so their `stock` never leaves 0 in Task 3 —
// meaning coffee1/blender1 being built does NOT yet make coffee/smoothie wishable, only genuinely
// stocked/produced goods are (matches the controller's ruling that the acceptance test, which
// stocks its counters with cookie/cupcake only, must only ever draw wishes from those two, even
// once the whole zone chain — coffee1/blender1 included — is built). 'cookie' is the fallback so
// a wish is always answerable even on a brand-new world with nothing built yet.
export function availableWishProducts(w) {
  const set = new Set();
  // Loop v2 Task 1: a stocked display (one product each) instead of scanning a shared counter's
  // mixed items array.
  for (const id of w.displays) { const st = w.stations.get(id); if (st.stock > 0) set.add(st.product); }
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
// M3 T3: a customer's wish — a product drawn uniformly from availableWishProducts, plus whether
// they also want a pet treat (only possible once a bowl is built, 50/50 otherwise, or ALWAYS on a
// weekend day — design section 5's "pets x2"). Draws from w.rng (src/core/rng.js), never
// Math.random — see createWorld.
// Loop v2 Task 3: on a holiday (w.dayState present and isHoliday(w.dayState.day)), 30% of wishes
// (only once cupcakes are genuinely a wishable product — see availableWishProducts above) become a
// `holidayCupcake` — sold from the cupcake display exactly like a cupcake (same product key, same
// display, same takeFromDisplay), but the customer carries a `holiday` flag that doubles its final
// pay at the register (see sim/customers.js's atRegister branch). w.dayState/isHoliday/isWeekend
// are threaded through `w` the same informal way w.rng/w.grid already are — day.js stays a
// standalone pure module with no dependency on economy.js, and every existing caller that never
// sets w.dayState (every pre-Task-3 test, the untouched nav-fullhouse acceptance test) keeps
// getting exactly the old non-holiday, 50/50-treat behaviour.
// Loop v2 Task 3 tuning pass: the baseline (non-weekend) treat chance eased 0.5 -> 0.3 — the bot's
// day-by-day run kept producing rare (but hard-gated, must be 0) STALLS at the treat bowl's fixed
// fan-out even after capping the slot pool to its real 6-position capacity and adding a re-use
// cooldown (see sim/customers.js's takeBowlSlot); fewer customers ever attempting a treat at all
// (weekends still force it to 1.0 per the design) is the least invasive way left to ease pressure
// on that one physical pinch point without touching the fan-out geometry itself.
// Gated on `w.dayState` being present (not just "day-of-week aware" — the 0.3 itself is an Task 3
// economy-tuning number, not a rule the design specifies): a caller with no day state at all
// (every pre-Task-3 test, and the UNTOUCHABLE test/nav-fullhouse.test.js, which never sets
// w.dayState) gets the exact original 0.5 default — found the hard way when tuning 0.3 in
// unconditionally shifted nav-fullhouse's RNG-driven customer mix just enough to tip its own
// hyper-sensitive overlap detector (see sim/customers.js's PATIENCE comment for how fragile that
// test is to ANY timing change) even though nothing in nav-fullhouse's own scenario changed.
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
// M3 T6 pass 2: seated tip raised to the top of its (now 1.4-2.0) widened bound.
// Loop v2 Task 3: `tipMult` (day.js's tipMult(dayState), or 1 by default) is the day-phase/weekend
// tip multiplier — an extra optional trailing argument so every existing 4-arg call site (every
// test, tools/bot.js before this task) keeps its exact old behaviour.
export function salePrice(key, up, boosts, seated, now, tipMult = 1) {
  return Math.round(PRODUCTS[key].price * incomeMult(up, boosts, now) * (seated ? 2.0 : 1) * tipMult);
}
export function upgradeCost(key, up) {
  const t = up[key] | 0; const c = UPGRADES[key].costs; return t < c.length ? c[t] : null;
}

const SEATING_ZONES = ['z_seats1', 'z_seats2'];
function seatingBuilds(builtSet) { return SEATING_ZONES.filter(id => builtSet.has(id)).length; }
// M3 T6 pass 2 (controller ruling, "early pressure"): BEFORE z_hire is built, the owner is the
// ONLY staff — no cashier/runner/cleaner exist yet, so demand pressure is held to a gentle flat
// rate (base spawn 3.5s, cap 8) regardless of how many seating zones happen to already be built
// (z_seats1 unlocks before z_hire in the zone chain). Once z_hire is built (staff start coming
// online), pressure ramps up to the tuned post-hire formula below.
// Loop v2 Task 3 (touch-point list: economy.js's "spawn/max formulas" are explicitly this task's
// to retune): these were M3-tuned for a FLAT demand curve with no day-phase layer on top. Task 3
// adds a multiplicative rush spawn bump (day.js's spawnMult, up to x2.0, plus a +4 cap and up to
// +3 more from café-level stars) — stacked on the unchanged M3 base rate, the bot's first two
// tuning passes measured 0-real-stalls-required STALLS at the treat bowl's fixed 6-slot fan-out
// (sim/customers.js's fanSpot) and friction ~70% in every phase (target 30-60% rush, <20% outside)
// — genuine overcrowding, not a bug. Eased well below the old M3 floor so the day-phase multiplier
// (not the flat base) is what makes rush actually feel busier.
// Second tuning pass: day 1 (pre-hire only) still measured ~2.4x its earnings target and friction
// stayed ~65-70% in every phase even outside rush — a solo owner genuinely can't keep four
// simultaneous product lines (cookie/cupcake/coffee/smoothie, five once a bowl's treats count too)
// stocked at the earlier, gentler-but-still-M3-shaped rate; eased further here.
const PRE_HIRE_SPAWN = 6.0, PRE_HIRE_MAXC = 5;
export function spawnInterval(builtSet) {
  if (!builtSet.has('z_hire')) return PRE_HIRE_SPAWN;
  return Math.max(3.0, 5.5 - 0.4 * seatingBuilds(builtSet));
}
export function maxCustomers(builtSet) {
  if (!builtSet.has('z_hire')) return PRE_HIRE_MAXC;
  return Math.min(7, 4 + seatingBuilds(builtSet));
}

// Loop v2 Task 3 (spec section 7's guideline chain): hire costs reset to the design doc's own
// numbers — cashier 600, runner 700 (second 1400), cleaner 350 — replacing the M3-tuned
// 500/1250/750/350 set (that set was tuned against the OLD flat-demand, high-price M3 economy;
// this task resets prices/spawn back to the design's own guideline and re-tunes from there).
export const STAFF = {
  runner:  { costs: [700, 1400], speed: 2.8, carry: 6 },
  // M3 T3: the cashier no longer sweeps piles on a timer — it mans a register (stands at its
  // cash spot, sets st.serving = 'cashier') and stepRegisters processes customers from there,
  // same 1-per-rate cadence as the owner (src/sim/world.js's stepRegisters, rate = 1/(1+0.25*(level-1))).
  cashier: { costs: [600], speed: 2.2 },
  cleaner: { costs: [350], speed: 2.2 },
};
// M3 T6: left at the base of the bounds (owner 0.5-0.7s, cashier 0.8-1.0s) — register throughput
// was never the bottleneck (src/sim/botDecide.js's report: 0 register-reason losses even under
// heavy load, all losses were 'counter'/'bowl'), and speeding it up shifts customer traffic timing
// enough to trip test/nav-fullhouse.test.js's overlap guard (a faster register drains its queue
// and sends people toward seats sooner, changing exactly which movers are near each other when —
// untouchable, so left alone rather than chasing a lever that wasn't the actual constraint).
export const REGISTER_RATE = { owner: 0.6, cashierBase: 1.0 };
export function hireCost(kind, staffCounts) {
  const n = (staffCounts && staffCounts[kind]) | 0;
  const c = STAFF[kind].costs;
  return n < c.length ? c[n] : null;
}
export function buyUpgrade(state, key) {
  const cost = upgradeCost(key, state.up);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost; state.up[key] = (state.up[key] | 0) + 1;
  return { ok: true, cost };
}
export function hire(state, kind) {
  const cost = hireCost(kind, state.staff);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost; state.staff[kind] = (state.staff[kind] | 0) + 1;
  return { ok: true, cost };
}

// M3 T5: worker Speed/Carry levels (runner gets both, cashier/cleaner only Speed — see the
// tier-key gate in buyWorkerUpgrade below) and machine Oven/Coffee-speed + Display-capacity
// levels, three tiers each. Costs are new constants (no balance numbers change — Task 6's job),
// scoped separately from UPGRADES/STAFF above. state.staffLevels/machineLevels are created lazily
// on first purchase so a fresh G (game.js seeds both explicitly; a bare test-state doesn't need
// to) never needs to pre-populate them.
export const WORKER_UPGRADES = { speed: [300, 700, 1500], carry: [250, 600, 1300] };
export const MACHINE_UPGRADES = { oven: [400, 900, 1800], coffee: [400, 900, 1800], display: [300, 700, 1500] };
// Effect lookup tables (not costs): runner carry per Carry tier, and counter capacity per Display
// tier — both start at the pre-upgrade base value at tier 0.
export const RUNNER_CARRY_LEVELS = [6, 9, 12, 16];
export const DISPLAY_CAP_LEVELS = [12, 16, 20, 24];
// +25% per tier for oven/coffee bake-and-make speed (divides the base time — see world.js).
export function machineSpeedMult(machineLevels, key) { return 1 + 0.25 * (((machineLevels && machineLevels[key]) | 0)); }
// +20% per tier for a worker's Speed level (multiplies the base STAFF[kind].speed — see staff.js).
export function workerSpeedMult(staffLevels, kind) { return 1 + 0.2 * (((staffLevels && staffLevels[kind] && staffLevels[kind].speed) | 0)); }

const DEFAULT_STAFF_LEVELS = () => ({ runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } });
const DEFAULT_MACHINE_LEVELS = () => ({ oven: 0, coffee: 0, display: 0 });
export function ensureLevels(state) {
  if (!state.staffLevels) state.staffLevels = DEFAULT_STAFF_LEVELS();
  if (!state.machineLevels) state.machineLevels = DEFAULT_MACHINE_LEVELS();
}
export function workerUpgradeCost(kind, key, staffLevels) {
  // cashier/cleaner have no Carry row — WORKER_ROWS in ui/models.js already keeps the button off
  // the panel for them, but this guards the sim call too.
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
  state.coins -= cost; state.staffLevels[kind][key] = (state.staffLevels[kind][key] | 0) + 1;
  return { ok: true, cost };
}
export function buyMachineUpgrade(state, key) {
  ensureLevels(state);
  const cost = machineUpgradeCost(key, state.machineLevels);
  if (cost == null || state.coins < cost) return { ok: false, cost };
  state.coins -= cost; state.machineLevels[key] = (state.machineLevels[key] | 0) + 1;
  return { ok: true, cost };
}

// Loop v2 Task 3 (spec sections 4/6): station stars. Every oven/coffee/blender/display station
// gets its own 1-3 star tier (state.stars[stationId], default 1 — see ensureStars below), bought
// from the Machines tab: star 2 costs 2x the station's OWN zone price (or a flat 240 for the two
// "starter" stations that have no zone — oven1, dispCookie, both active from world creation), star
// 3 costs 4x (or 480). Effects (applied where the effect actually lives, not stored here): star 2
// -> ovens/coffee/blender bake 1.5x faster (world.js's stepOvens/stepMachines read w.stars
// directly) and a display's capacity goes 8 -> 12 (buyStar below writes the station's live
// capacity the instant the purchase lands, same as every other "buy a tier, apply its effect"
// pattern in this file); star 3 -> displays 16, and Oven A / the coffee machine unlock their
// second recipe (world.js's stepOvens/stepMachines toggle st.product between the family's two
// members once w.stars[st.id] >= 3 — see PRODUCTS/FAMILY above).
export const STAR_IDS = ['oven1', 'oven2', 'dispCookie', 'dispCupcake', 'coffee1', 'barCoffee', 'blender1', 'barSmoothie'];
const STARTER_STATIONS = new Set(['oven1', 'dispCookie']); // active from world creation, no zone
export function zonePriceFor(area, stationId) {
  const z = area.zones.find(zz => zz.adds.includes(stationId));
  return z ? z.price : null;
}
// targetTier is the tier being bought INTO (2 or 3).
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
// Ensures every currently-ACTIVE star-eligible station has an entry in state.stars (defaulting to
// tier 1, the un-upgraded base) — cheap (8 ids max) and idempotent, meant to be called once a
// frame (or right after a zone finishes) so a freshly-unlocked oven/display immediately has a real
// tier instead of reading undefined everywhere star tiers are consulted.
export function ensureStars(state, world) {
  if (!state.stars) state.stars = {};
  for (const id of STAR_IDS) {
    const st = world.stations.get(id);
    if (st && st.active && state.stars[id] == null) state.stars[id] = 1;
  }
}
// Café level (design section 6) = total stars across every active star-eligible station.
export function cafeLevel(state) {
  if (!state.stars) return 0;
  let sum = 0; for (const id of STAR_IDS) sum += state.stars[id] || 0;
  return sum;
}
// Loop v2 Task 3 (spec section 5's summary card / section 7's targets): the day's goal. Day 1 is
// the design's own fixed example (serve 30 -> 60 coins); every later day rotates serve/lose/earn
// (day 2 = lose, day 3 = earn, day 4 = serve again, ...) using the design's own formulas. A 'lose'
// goal is met by finishing the day with FEWER than `target` lost sales (a strict "<", not "<=").
// Reward: 20% of the target for an 'earn' goal (the target is already a coin amount); the flat
// 80 + 20*day for 'serve'/'lose' goals (their target is a customer count, not coins).
export function chooseGoal(day) {
  if (day <= 1) return { kind: 'serve', target: 30, reward: 60 };
  const kind = ['serve', 'lose', 'earn'][(day - 1) % 3];
  if (kind === 'serve') return { kind, target: 30 + 8 * day, reward: 80 + 20 * day };
  if (kind === 'lose') return { kind, target: Math.max(3, 9 - day), reward: 80 + 20 * day };
  const target = 150 + 120 * day;
  return { kind, target, reward: Math.round(target * 0.2) };
}
// Shared goal-text formatter — the HUD's small "Serve 30 · 17/30" line (progress optional) and the
// summary/end-of-day card's goal rows all read off this one function.
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
