// Task 24 experiment configuration only. The live area/economy must not import this module.
// Candidate rules test the blueprint hypothesis without changing saves or runtime progression.
import { spawnInterval, maxCustomers, hireCost } from './economy.js';
import { AREA1 } from '../../data/area1.js';

export const STAFFING_FIRST_HIRE_SWEEP = Object.freeze([1550, 1350, 1150, 950]);

export const STAFFING_POLICIES = Object.freeze({
  balanced: Object.freeze({ id:'balanced', ownerSpeedScale:1, staffFirst:false }),
  slow: Object.freeze({ id:'slow', ownerSpeedScale:0.8, staffFirst:false }),
  staffFirst: Object.freeze({ id:'staff-first', ownerSpeedScale:1, staffFirst:true }),
});

export function makeStaffingVariant({ id, earlyDesk = false, firstHireCost = 1550 } = {}) {
  return Object.freeze({ id:id || (earlyDesk ? `early-desk-${firstHireCost}` : 'current'), earlyDesk:!!earlyDesk, firstHireCost:Math.max(0, firstHireCost | 0) });
}

export const CURRENT_STAFFING_VARIANT = makeStaffingVariant({ id:'current', earlyDesk:false, firstHireCost:1550 });
export const STAFFING_CANDIDATES = Object.freeze(STAFFING_FIRST_HIRE_SWEEP.map(cost => makeStaffingVariant({
  id:`early-desk-${cost}`,
  earlyDesk:true,
  firstHireCost:cost,
})));

export function areaForStaffingVariant(variant = CURRENT_STAFFING_VARIANT) {
  const area = structuredClone(AREA1);
  if (!variant.earlyDesk) return area;
  const zones = new Map(area.zones.map(z => [z.id, z]));
  // Desk and second register become parallel choices after Cupcakes. Coffee continues through Desk,
  // so the second register is truly optional rather than a disguised prerequisite.
  zones.get('z_hire').requires = 'z_oven2';
  zones.get('z_register2').requires = 'z_oven2';
  zones.get('z_coffee').requires = 'z_hire';
  return area;
}

function productiveLines(built) {
  return 1 + (built.has('z_oven2') ? 1 : 0) + (built.has('z_coffee') ? 1 : 0) + (built.has('z_blender') ? 1 : 0);
}

// Experimental demand model: the Desk itself contributes ZERO traffic. Pressure grows only when
// the café gains a productive menu lane or useful front-of-house capacity. This is deliberately
// conservative; Task 24 measures it rather than claiming these numbers are final tuning.
export function staffingDemand(variant, built, staff = {}) {
  if (!variant || !variant.earlyDesk) return { interval:spawnInterval(built), maxCustomers:maxCustomers(built), mode:'current' };
  const lines = productiveLines(built);
  const usefulStaff = Math.min(2, Math.max(0, (staff.runner | 0) + (staff.cashier | 0)));
  const interval = Math.max(4.3, 7.5 - 0.65 * (lines - 1) - 0.35 * usefulStaff);
  const maxC = Math.min(6, 4 + (lines >= 3 ? 1 : 0) + (usefulStaff >= 2 ? 1 : 0));
  return { interval, maxCustomers:maxC, mode:'capacity', productiveLines:lines, usefulStaff };
}

export function staffingHireCost(variant, kind, staff = {}) {
  const total = (staff.runner | 0) + (staff.cashier | 0) + (staff.cleaner | 0) + (staff.barista | 0);
  if (variant && variant.earlyDesk && total === 0 && kind === 'cashier') return variant.firstHireCost;
  return hireCost(kind, staff);
}

export function firstHireEntryCost(variant = CURRENT_STAFFING_VARIANT) {
  // Required construction before the first Cashier can be bought. Partial payments are irrelevant
  // to the total; this reports the transparent cumulative sink being tested.
  const construction = variant.earlyDesk ? 90 + 220 + 480 : 90 + 220 + 340 + 480;
  return { construction, firstHire:variant.firstHireCost, total:construction + variant.firstHireCost };
}
