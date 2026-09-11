// src/sim/economyConfig.js — TASK 1.6a: every tunable number economy.js reads, in one place, so a
// balance result can be reasoned about (and printed as a hash by tools/bot.js) against the exact
// numbers that produced it. This step is a PURE MOVE out of economy.js: every value here is
// unchanged from the literal it replaces — verified by `node --test` staying green across the move
// and by tools/bot.js's day-by-day table staying bit-identical for days 1-12.
//
// Out of scope (owned by other tasks, not moved here): data/decor.js's own DECOR catalogue prices,
// and every non-price field (x/z/rot/fw/fd geometry, `adds`, `requires`) in data/area1.js. Zone
// PRICES in data/area1.js are edited in place there (this task owns that one field) rather than
// re-hosted here, since AREA1 is a data file other systems (nav, layout) read directly.

// --- menu ----------------------------------------------------------------------------------------
// Base menu value. The starter bakery remains intentionally modest; later product lines earn more
// so the economy can reduce raw customer volume without making the developed café feel poorer.
export const PRODUCTS = {
  // Owner feedback: "cookies on the counter share the counter's colour — hard to see even in
  // daylight." This was the literal cause — '#D9A066' is BIT-FOR-BIT render/palette.js's C.wood,
  // the display counter's own top surface (props.js counterMesh()) and the oven's output tray, so a
  // cookie sitting on either one visually merged into it. Recoloured to a toasted, more saturated
  // brown that's clearly darker in value than the wood (measured luma ~0.50 vs wood's ~0.67, a 26%
  // drop) so it separates on VALUE, not just hue, and still reads as "cookie" rather than "chip".
  cookie:   { price: 8,  bake: 1.2, color: '#B9702F' },
  cupcake:  { price: 13, bake: 1.6, color: '#FF8A80' },
  coffee:   { price: 12, make: 2.5, color: '#6B4A2B' },
  smoothie: { price: 24, make: 2.0, color: '#8B7CF6' },
  treat:    { price: 8,  color: '#C97A3A' },
  brownie:  { price: 13, bake: 1.2, color: '#6B4023' },
  // Also within ~6% of wood '#D9A066' (checked every product's colour against it the same way the
  // cookie collision was found) — coffee1 alternates onto 'latte' once it hits ★3 (world.js
  // ALT_PRODUCT), and that display sits on the same wood-topped counter, so this one gets separated
  // pre-emptively too rather than waiting for its own bug report. Lightened/creamed instead of
  // darkened (unlike cookie) since a latte is supposed to read paler than a black coffee.
  latte:    { price: 19, make: 2.5, color: '#E8C79A' },
  // Batch 1 — the ice cream lane (plan 3.1). icecream1 mirrors coffee1 exactly, so sundae is its
  // alt recipe (world.js ALT_PRODUCT) the same way latte is coffee1's. pupcup is a pet-treat
  // variant dispensed at icecream1 (plan: wishFor gives terrace-bound pet wishes a pupcup instead
  // of a treat) — it has no `make`/`bake` because it costs 1 cream directly, not a buffer slot.
  icecream: { price: 26, make: 2.0, color: '#FFF0F5' },
  sundae:   { price: 34, make: 2.6, color: '#FFD6E7' },
  pupcup:   { price: 14, color: '#FFE4C4' },
  // Batch 4b — the spa services (plan 3.9: "spa guests ... pay 60-90 at register3"). These are
  // SERVICES, not stock: they have no `bake`/`make` because nothing is produced into a buffer and
  // nothing sits on a display — a groom or a bath is a session at its own station, priced here so
  // the register, the ledger and the career mastery counters all read one number from one place,
  // exactly like `treat` and `pupcup` already do. 75/85 sit inside the plan's 60-90 band with the
  // bath dearer than the groom (it also consumes a `water` sack from waterTank1).
  // PLACEHOLDERS in the same sense as the spa's zone prices: a pacing agent re-measures both.
  groom:    { price: 75, color: '#8FD3EE' },
  bath:     { price: 85, color: '#BFEFFA' },
};

export const FAMILY = { cookie: 'cookie', brownie: 'cookie', coffee: 'coffee', latte: 'coffee', sundae: 'icecream' };

export const BASE_TREAT_CHANCE = 0.3;

// --- player/upgrade ladders ------------------------------------------------------------------------
export const UPGRADES = {
  speed:  { costs: [400, 900, 1800] },
  carry:  { costs: [300, 700, 1500], values: [6, 9, 12, 16] },
  income: { costs: [600, 1400, 3000] },
};

// Every ladder in this file continues past its authored tiers instead of terminating (see
// economy.js's own comment for why). Costs grow geometrically; this is the shared growth rate.
export const LADDER_GROWTH = 1.85;

export const BASE_SPEED = 4.6;
// Authored 1 + coef*t through tier `authoredTiers`; past that it climbs toward `span` above the
// authored ceiling and stops, at rate `decay` per extra tier. Shared by playerSpeed/incomeMult/
// machineSpeedMult/workerSpeedMult below — each names its own authored coefficient.
export const SPEED_ASYMPTOTE   = { authoredTiers: 3, coef: 0.15, span: 0.40, decay: 0.86 };
export const INCOME_ASYMPTOTE  = { authoredTiers: 3, coef: 0.20, span: 0.60, decay: 0.85 };
export const MACHINE_ASYMPTOTE = { authoredTiers: 3, coef: 0.25, span: 0.70, decay: 0.84 };
export const WORKER_ASYMPTOTE  = { authoredTiers: 3, coef: 0.20, span: 0.55, decay: 0.85 };

// --- demand curve (Task 25 supported model) -----------------------------------------------------
export const DEMAND = {
  CROWD_FLOOR_INTERVAL: 2.2,   // fastest sustained arrival, ~27 guests/minute
  CROWD_CEILING: 14,           // most guests on the floor at once
  BASE_INTERVAL: 7.5, INTERVAL_PER_LINE: 0.65, INTERVAL_PER_STAFF: 0.35, MIN_INTERVAL: 4.3,
  BASE_MAX: 4, MAX_LINE_BONUS: 1, MAX_STAFF_BONUS: 1, MAX_CEILING_AUTHORED: 6,
  // Past this café-level gate, the room keeps getting busier, approaching the floor/ceiling.
  LEVEL_GATE: 8, INTERVAL_PER_LEVEL: 0.085, LEVEL_PER_MAX_STEP: 5,
  // TASK (friction diagnosis, see economy.js's spawnInterval/maxCustomers comments): `level`
  // (cafeLevel — the SUM of every station's star tier) is the one input that drove the demand curve
  // all the way to CROWD_FLOOR_INTERVAL/CROWD_CEILING with NO ceiling of its own, because the star
  // ladder itself never stops (continueLadder/nextStarCost keep pricing further tiers forever) and
  // stars stay the cheapest, most-repeated purchase in a mature café (measured: 76,000 of ~161,000
  // lifetime coins spent, more than any other single category — see tools/bot.js's own "where coins
  // go" diagnostic). But a star buys PRICE and, for a display, stock slots — buyStar() never touches
  // machineLevels/staffLevels, so it adds zero service throughput. Every lever that DOES add
  // throughput (SPEED_ASYMPTOTE/MACHINE_ASYMPTOTE/WORKER_ASYMPTOTE above) is deliberately bounded to
  // an asymptote past its own authored tiers, on purpose, so a maxed café stays legible. Demand had
  // no matching bound: it kept compounding linearly with `level` while the throughput it must be
  // matched against had already flattened, so a late café got busier by a metric (star count) that
  // never made it any faster to serve. LEVEL_SOFT_CAP = 24 is exactly "every one of the 8 STAR_IDS
  // stations at its own authored tier 3" (8 * 3), i.e. the same "authored ceiling, then asymptote"
  // boundary every throughput curve above already uses — past it, the level-driven push on both
  // spawnInterval and maxCustomers bends into the SAME bounded-approach shape (via the `asymptote`
  // helper) instead of marching linearly at the star ladder's own pace. Below the cap nothing changes: no
  // level below 24 is reachable before this fires, and the frozen days 1-11 window never exceeds
  // level 11 (see tools/bot.js's own pace log), so this engages only once the café has scaled well
  // past its starter build-out.
  // SPAN/DECAY are chosen so the curve is gentler than the old linear rate at EVERY level past the
  // cap, not just in the limit: the asymptote's steepest point is right at the cap (derivative
  // SPAN * -ln(DECAY)), so keeping that <= INTERVAL_PER_LEVEL (0.085) guarantees a maxed-out café
  // never gets busier, level for level, than the old unbounded formula would have made it — see
  // test/economy-friction.test.js's "grows strictly more slowly" test, which fails loudly if this
  // ever drifts the wrong way.
  LEVEL_SOFT_CAP: 24, LEVEL_SPAN: 0.3, LEVEL_DECAY: 0.9,
  LEVEL_PER_MAX_STEP_BEYOND_CAP: 11,
};

// --- staffing --------------------------------------------------------------------------------------
// Task 25: the first Runner is the earliest useful automation (empty-display pressure dominates the
// early café). Only that first slot's price changes from the rest of the table.
export const STAFF = {
  runner:  { costs: [150, 2800, 5400, 9600], speed: 2.8, carry: 6 },
  cashier: { costs: [1550, 4200], speed: 2.2 },
  // Batch 7: the runner (150) is the earliest useful automation; a 1350 cleaner was why nobody
  // hired one before day 8 and wiped every dirty table by hand instead, despite tables now going
  // dirty on every single use (DIRTY_EVERY = 1, src/sim/customers.js) -- the owner's own read: the
  // cleaner is the obvious day-2 hire. 220 prices it as the second thing a new café saves for,
  // right after the runner; the second tier is scaled down to match (was 3600 -> 1800). Changing
  // this changes tools/bot.js's printed "economy config identity" hash -- expected.
  cleaner: { costs: [220, 1800], speed: 2.2 },
  barista: { costs: [2300, 6000], speed: 2.4, carry: 4 },
  // Batch 4b — the Photographer (plan 3.9: hired at photoDesk1, auto-takes `Good` shots at
  // photo1). Two tiers like every non-runner role, priced between the barista and the runner's own
  // late tiers because the role is bought long after both. No `carry`: it carries nothing.
  // A hire is offered by whatever opens the workers sheet, so this role becomes visible the moment
  // z_photographer is built — see wiringNeeded for the systems/ side that actually takes the shot.
  photographer: { costs: [3200, 7000], speed: 2.2 },
};
export const REGISTER_RATE = { owner: 0.6, cashierBase: 1.0 };

export const WORKER_UPGRADES = { speed: [300, 700, 1500], carry: [250, 600, 1300] };
export const MACHINE_UPGRADES = { oven: [400, 900, 1800], coffee: [400, 900, 1800], display: [300, 700, 1500] };
export const RUNNER_CARRY_LEVELS = [6, 9, 12, 16];
export const DISPLAY_CAP_LEVELS = [12, 16, 20, 24];

// --- stars -----------------------------------------------------------------------------------------
// Starter stations (no zone gate) have their own flat tier2/tier3 price; every other station's star
// price is a multiple of the zone price that unlocked it.
export const STARTER_STAR_COSTS = { tier2: 240, tier3: 480 };
export const ZONE_STAR_MULT = { tier2: 2, tier3: 4 };
// A maxed (tier 3) station used to stop being an investment target; past tier 3 the ladder continues
// at this growth rate off the authored tier-3 price.
export const STAR_LADDER_GROWTH = 1.8;
// Authored through tier 3; +DISPLAY_STAR_CAP_GROWTH_PER_TIER slots per tier after that.
export const DISPLAY_STAR_CAP = { 1: 8, 2: 12, 3: 16 };
export const DISPLAY_STAR_CAP_GROWTH_PER_TIER = 4;

// --- TASK 1.6c pacing levers ---------------------------------------------------------------------
// Measured (tools/bot.js's per-day spend-by-category diagnostic, days 12-24 of a 40-day run): once
// the core café is finished, botDecide's ladder purchases (income/star/machine/worker tiers) fired
// almost NOT AT ALL — 920 coins total across 13 days, against ~1,450/day of income — because
// buildTarget's own partial-payment fallback (ZONE_TRIP_MIN=15 in botDecide.js) claims literally any
// wallet balance over 15 coins the moment a money-window opens, so the wallet almost never reaches
// AFFORD_MULTIPLIER (2x) a cheap star's cost before the next zone trip drains it back to near zero.
// The suspected cause going in ("does it buy the next star reflexively, ahead of saving for
// content?") was backwards: it hoards for content almost totally, so café-level growth (and the
// spawnInterval/maxCustomers gains DEMAND.LEVEL_GATE ties to it) stalls for the entire multi-day
// save and income never rises to fund the save any faster. Confirmed independently: scaling
// z_terrace's price to 0.6x (20000 -> 12000) moved the unlock day from 25 to 20 — price is NOT
// inert the way it first looked, income growth just never got a chance to compound because nothing
// but the zone ever got funded.
//
// A zone priced at or above this line is "big content" (the terrace chain and whatever comes after
// it) rather than a quick core-build-out tier — every original Area 1 zone is <= 1750, every
// terrace-chain zone is >= 6000, so this threshold cleanly separates the two eras without touching
// days 1-12 (no zone that expensive is ever active that early).
export const CONTENT_ZONE_PRICE = 4000;
// Normal ladder-purchase gate: fire once the wallet holds this multiple of the tier's own cost (see
// tools/bot.js's original "don't let a Player-tab upgrade soak up a pile while a zone/hire sits
// waiting" reasoning — still correct for the CORE build-out, where every zone is cheap enough that
// the wallet reaches it in well under a day).
export const AFFORD_MULTIPLIER = 2;
// While a content zone (>= CONTENT_ZONE_PRICE) is active and unbought, ladder purchases fire at this
// (lower) multiple instead — 1x means "buy it the instant it's affordable", matching how a player
// actually plays a long save: top up cheap throughput along the way rather than banking every coin
// for a single multi-day goal. Days 1-12 are unaffected (no content zone is active yet); this only
// changes behaviour once the terrace (or later, the spa) is the thing being saved for.
export const CONTENT_SAVE_AFFORD_MULTIPLIER = 1;
