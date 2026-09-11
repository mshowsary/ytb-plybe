// Task 24 experiment configuration only. The live area/economy must not import this module.
// Candidate rules test the blueprint hypothesis without changing saves or runtime progression.
//
// IMPORTANT: Task 25 has now shipped the winning candidate into the live economy. The experiment
// must therefore keep its ORIGINAL pre-Task-25 baseline frozen here instead of delegating back to
// live spawn/hire helpers; otherwise every later live balance change would silently rewrite the
// evidence that justified Task 25 and make the Task-24 report impossible to reproduce.
import { AREA1 } from '../../data/area1.js';

// v2 proved that first-hire price alone cannot move a Desk-after-Cupcakes worker into the 6–10m
// window: even the 950-coin Cashier arrived around 32m. v3 therefore measures the full transparent
// entry gate — Desk price AND the first useful worker — while keeping every later baseline price intact.
export const STAFFING_DESK_COST_SWEEP = Object.freeze([480, 300, 180, 90]);
export const STAFFING_FIRST_HIRE_SWEEP = Object.freeze([900, 650, 450, 300, 150]);

export const STAFFING_POLICIES = Object.freeze({
  balanced: Object.freeze({ id:'balanced', ownerSpeedScale:1, staffFirst:false }),
  slow: Object.freeze({ id:'slow', ownerSpeedScale:0.8, staffFirst:false }),
  // "staff-first" now means reserve for exactly ONE first meaningful worker. v2's reservation for
  // Cashier → Runner → Cleaner starved productive construction and measured the policy, not the idea.
  staffFirst: Object.freeze({ id:'staff-first', ownerSpeedScale:1, staffFirst:true }),
});

export function makeStaffingVariant({
  id,
  earlyDesk = false,
  deskCost = 480,
  firstHireKind = 'cashier',
  firstHireCost = 1550,
} = {}) {
  return Object.freeze({
    id:id || (earlyDesk ? `early-${firstHireKind}-d${deskCost}-h${firstHireCost}` : 'current'),
    earlyDesk:!!earlyDesk,
    deskCost:Math.max(0, deskCost | 0),
    firstHireKind:['runner','cashier','cleaner'].includes(firstHireKind) ? firstHireKind : 'cashier',
    firstHireCost:Math.max(0, firstHireCost | 0),
  });
}

// Historical control arm used by Task 24. Keep the exported name stable for the report/tools, but
// do NOT reinterpret "current" as whatever the live game happens to become after the experiment.
export const CURRENT_STAFFING_VARIANT = makeStaffingVariant({
  id:'current', earlyDesk:false, deskCost:480, firstHireKind:'cashier', firstHireCost:1550,
});

export const STAFFING_CANDIDATES = Object.freeze(
  STAFFING_DESK_COST_SWEEP.flatMap(deskCost => STAFFING_FIRST_HIRE_SWEEP.map(firstHireCost => makeStaffingVariant({
    id:`early-runner-d${deskCost}-r${firstHireCost}`,
    earlyDesk:true,
    deskCost,
    firstHireKind:'runner',
    firstHireCost,
  }))),
);

export function areaForStaffingVariant(variant = CURRENT_STAFFING_VARIANT) {
  const area = structuredClone(AREA1);
  if (!variant.earlyDesk) {
    // Reconstruct the pre-Task-25 control topology explicitly. AREA1 is now the shipped Task-25
    // topology, so simply cloning it would contaminate the historical baseline.
    const zones = new Map(area.zones.map(z => [z.id, z]));
    zones.get('z_register2').requires = 'z_oven2';
    zones.get('z_hire').requires = 'z_register2';
    zones.get('z_hire').price = 480;
    zones.get('z_coffee').requires = 'z_hire';
    return area;
  }
  const zones = new Map(area.zones.map(z => [z.id, z]));
  // Desk and second register become parallel choices after Cupcakes. Coffee continues through Desk,
  // so the second register is truly optional rather than a disguised prerequisite.
  zones.get('z_hire').requires = 'z_oven2';
  zones.get('z_hire').price = variant.deskCost;
  zones.get('z_register2').requires = 'z_oven2';
  zones.get('z_coffee').requires = 'z_hire';
  return area;
}

function productiveLines(built) {
  return 1 + (built.has('z_oven2') ? 1 : 0) + (built.has('z_coffee') ? 1 : 0) + (built.has('z_blender') ? 1 : 0);
}

// Frozen pre-Task-25 demand. This mirrors the exact live formulas that existed when Task 24 ran.
const LEGACY_SEATING_ZONES = Object.freeze(['z_seats1', 'z_seats2']);
function legacySeatingBuilds(built) { return LEGACY_SEATING_ZONES.filter(id => built.has(id)).length; }
function legacySpawnInterval(built) {
  if (!built.has('z_hire')) return 7.5;
  return Math.max(3.4, 5.8 - 0.35 * legacySeatingBuilds(built));
}
function legacyMaxCustomers(built) {
  if (!built.has('z_hire')) return 4;
  return Math.min(6, 4 + legacySeatingBuilds(built));
}

// Experimental demand model: the Desk itself contributes ZERO traffic. Pressure grows only when
// the café gains a productive menu lane or useful operating capacity. A Runner counts because it
// directly relieves the measured early bottleneck (empty displays); Cashier remains useful later.
export function staffingDemand(variant, built, staff = {}) {
  if (!variant || !variant.earlyDesk) {
    return { interval:legacySpawnInterval(built), maxCustomers:legacyMaxCustomers(built), mode:'historical' };
  }
  const lines = productiveLines(built);
  const usefulStaff = Math.min(2, Math.max(0, (staff.runner | 0) + (staff.cashier | 0)));
  const interval = Math.max(4.3, 7.5 - 0.65 * (lines - 1) - 0.35 * usefulStaff);
  const maxC = Math.min(6, 4 + (lines >= 3 ? 1 : 0) + (usefulStaff >= 2 ? 1 : 0));
  return { interval, maxCustomers:maxC, mode:'capacity', productiveLines:lines, usefulStaff };
}

// Frozen pre-Task-25 staff prices used by the Task-24 arms. In particular, a candidate's discounted
// Runner applies only to the first meaningful hire; every later/fallback price stays at the values
// that were actually measured, even though Task 25 has since changed the live first-Runner price.
const LEGACY_STAFF_COSTS = Object.freeze({
  runner: Object.freeze([1800, 2800]),
  cashier: Object.freeze([1550]),
  cleaner: Object.freeze([1350]),
  barista: Object.freeze([2300]),
});
function legacyHireCost(kind, staff = {}) {
  const costs = LEGACY_STAFF_COSTS[kind];
  if (!costs) return null;
  const n = (staff[kind] | 0);
  return n < costs.length ? costs[n] : null;
}

export function staffingHireCost(variant, kind, staff = {}) {
  const total = (staff.runner | 0) + (staff.cashier | 0) + (staff.cleaner | 0) + (staff.barista | 0);
  if (variant && variant.earlyDesk && total === 0 && kind === variant.firstHireKind) return variant.firstHireCost;
  return legacyHireCost(kind, staff);
}

export function firstHireEntryCost(variant = CURRENT_STAFFING_VARIANT) {
  // Transparent cumulative construction required before the first worker can be bought. The
  // historical control included second register before Desk; the candidates deliberately don't.
  const construction = variant.earlyDesk ? 90 + 220 + variant.deskCost : 90 + 220 + 340 + 480;
  return { construction, firstHire:variant.firstHireCost, total:construction + variant.firstHireCost };
}
