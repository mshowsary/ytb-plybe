import { PRODUCTS, hireCost, upgradeCost } from './economy.js';
import { urgentJobs } from './jobs.js';

export const SMART_RELIEF_REWARD_ID = 'pet-cafe-smart-relief-coins';
export const SMART_RELIEF_MIN_DAY = 2;
export const RETURN_WASTE_RATE = 0.18;
export const RETURN_WASTE_CAP = 20;

// Temporary operational help is intentionally a separate decision from the existing permanent
// purchase bridge. This module only CLASSIFIES the best answer to a real rush bottleneck; it does
// not show UI, call an ad, mutate customers, spawn helpers or award coins.
export const RUSH_HELP_MIN_DAY = 3;
export const RUSH_HELP_COOLDOWN_SECONDS = 55;

export function reliefClaimKey(day) { return `relief:${day | 0}`; }

// Supplies are inventory, not trash. Returning an unavoidable half-used beans/kibble sack is free.
// Finished food and harvested fruit are the only things treated as waste.
export function returnWasteCost(productKeys = [], fruit = 0) {
  let retail = 0;
  for (const key of productKeys || []) retail += PRODUCTS[key] ? PRODUCTS[key].price : 0;
  // One fruit becomes one smoothie, but charge only a small handling value so experimentation never hurts.
  retail += Math.max(0, fruit | 0) * 3;
  if (retail <= 0) return 0;
  return Math.min(RETURN_WASTE_CAP, Math.max(1, Math.round(retail * RETURN_WASTE_RATE)));
}

function countPressure(G, world) {
  let registerWait = 0, displayWait = 0;
  for (const c of G.customers || []) {
    if (!c || c.done || c.mood !== 'wait') continue;
    if (c.state === 'atRegister' || c.state === 'register') registerWait++;
    else if (c.state === 'queue') displayWait++;
  }
  let dirty = 0, lowDisplays = 0;
  for (const st of world.stations.values()) {
    if (!st.active) continue;
    if (st.type === 'seat' && st.dirty) dirty++;
    if (st.type === 'display' && st.stock <= Math.max(1, Math.floor((st.capacity || 8) * 0.25))) lowDisplays++;
  }
  // Pet pawprints are deliberately separate from dirty tables. This is what keeps a temporary
  // Roomba from erasing the permanent Cleaner's table-cleaning role.
  const petMess = Math.max(0, (G.petMess && G.petMess.count) | 0);
  return { registerWait, displayWait, dirty, lowDisplays, petMess, misses: (G.dayStats && G.dayStats.serviceMisses) | 0 };
}

function bridgeAmount(gap) {
  if (gap <= 0) return 0;
  if (gap <= 120) return gap; // a tiny shortfall may be completely solved: satisfying, not stingy.
  return Math.min(220, Math.max(60, Math.ceil((gap * 0.62) / 10) * 10));
}

function candidate(G, key, label, kind, cost, priority, why, pressure) {
  if (cost == null || cost <= 0 || G.coins >= cost) return null;
  const gap = cost - G.coins;
  const progress = G.coins / cost;
  // No ad when the player has barely started saving, or when they are only a trivial sale away.
  // Contextual rewarded help is for the psychologically useful "almost there" band.
  if (progress < 0.32 || gap < 40 || gap > Math.max(450, Math.round(cost * 0.68))) return null;
  const reward = bridgeAmount(gap);
  return {
    key, label, kind, cost, gap, reward,
    remaining: Math.max(0, gap - reward),
    priority, why, pressure,
  };
}

// Pure recommendation: no UI, no ad call, no mutation. The browser system decides when to surface it.
export function recommendSmartRelief(G, world) {
  if (!G || !world || !G.dayState || G.dayState.day < SMART_RELIEF_MIN_DAY) return null;
  const desk = world.stations.get('hire1');
  const p = countPressure(G, world);
  const options = [];

  if (desk && desk.active) {
    const cashierCount = (G.staff && G.staff.cashier) | 0;
    if (cashierCount < 1 && (p.registerWait >= 1 || p.misses >= 2)) {
      options.push(candidate(G, 'cashier', 'Cashier', 'staff', hireCost('cashier', G.staff), 120 + p.registerWait * 12,
        'Checkout is becoming the bottleneck.', p));
    }
    const runnerCount = (G.staff && G.staff.runner) | 0;
    if (runnerCount < 2 && (p.displayWait >= (runnerCount ? 2 : 1) || p.lowDisplays >= (runnerCount ? 3 : 2))) {
      options.push(candidate(G, 'runner', runnerCount ? 'Second Runner' : 'Runner', 'staff', hireCost('runner', G.staff), 100 + p.displayWait * 10 + p.lowDisplays * 3,
        runnerCount ? 'One runner is struggling to keep every bar stocked.' : 'Guests are reaching shelves faster than you can restock them.', p));
    }
    const cleanerCount = (G.staff && G.staff.cleaner) | 0;
    if (cleanerCount < 1 && p.dirty >= 2) {
      options.push(candidate(G, 'cleaner', 'Cleaner', 'staff', hireCost('cleaner', G.staff), 90 + p.dirty * 8,
        'Dirty tables are starting to steal your attention.', p));
    }
  }

  // Once staff is not the obvious answer, relief can help the player close a meaningful permanent
  // owner-upgrade gap. This keeps rewarded help useful after the first hires without creating a
  // separate ad-only stat or temporary power system.
  if (p.displayWait + p.lowDisplays >= 3) {
    options.push(candidate(G, 'carry', 'Carry upgrade', 'player', upgradeCost('carry', G.up), 62 + p.displayWait * 4,
      'More capacity means fewer oven-to-counter trips.', p));
  }
  if (p.registerWait + p.displayWait >= 2) {
    options.push(candidate(G, 'speed', 'Speed upgrade', 'player', upgradeCost('speed', G.up), 58 + (p.registerWait + p.displayWait) * 3,
      'A little more speed will make the next rush easier to recover from.', p));
  }

  const valid = options.filter(Boolean).sort((a, b) => b.priority - a.priority || a.gap - b.gap);
  return valid[0] || null;
}

function activeCustomerCount(G) {
  let n = 0;
  for (const c of G.customers || []) if (c && !c.done) n++;
  return n;
}
function rushCandidate(kind, score, label, why, pressure, extra = {}) {
  return { kind, score, label, why, pressure, ...extra };
}

// Pure operational classifier for Rush Help. It intentionally knows NOTHING about rewarded-ad
// availability. A calm player should never see monetization merely because the clock says "Rush";
// sustained browser-side evidence/cooldown is layered on top later.
export function recommendRushHelp(G, world, context = {}) {
  if (!G || !world || !G.dayState || G.dayState.day < RUSH_HELP_MIN_DAY || G.dayState.phase !== 'rush') return null;
  const now = Number.isFinite(context.now) ? context.now : (Number.isFinite(G.time) ? G.time : 0);
  const lastOfferedAt = Number.isFinite(context.lastOfferedAt) ? context.lastOfferedAt : -Infinity;
  if (now - lastOfferedAt < RUSH_HELP_COOLDOWN_SECONDS) return null;

  const p = countPressure(G, world);
  const urgent = urgentJobs(world, G);
  const activeCustomers = activeCustomerCount(G);
  const pressure = { ...p, ...urgent, activeCustomers };
  const options = [];

  // Checkout pressure is specific and should beat generic crowd relief.
  if (urgent.registerWaiting >= 1 && (p.registerWait >= 2 || urgent.lowPatience >= 1)) {
    options.push(rushCandidate(
      'crew', 112 + urgent.registerWaiting * 14 + urgent.lowPatience * 5,
      'Rush Cashier', 'Checkout is the clearest bottleneck right now.', pressure,
      { role: 'cashier' },
    ));
  }

  // A customer at an actually empty display is stronger evidence than "some shelf is low".
  if (urgent.emptyDisplayWithWaiting >= 1 && (p.displayWait >= 2 || p.lowDisplays >= 2 || urgent.lowPatience >= 1)) {
    options.push(rushCandidate(
      'crew', 106 + urgent.emptyDisplayWithWaiting * 13 + p.lowDisplays * 3,
      'Rush Runner', 'Guests are arriving faster than the counters are being restocked.', pressure,
      { role: 'runner' },
    ));
  }

  // Roomba now has its OWN pet-floor job. It never responds to dirty tables: those remain a
  // permanent Cleaner/owner responsibility. This prevents rewarded help from cannibalizing staff.
  if (p.petMess >= 2 && activeCustomers >= 4) {
    options.push(rushCandidate(
      'roomba', 76 + p.petMess * 9 + Math.min(10, urgent.lowPatience * 2),
      'Roomba Sweep', 'Pet pawprints are piling up while you are serving the rush.', pressure,
      { suggestedSweepSeconds: 18 },
    ));
  }

  // Pet Lounge is the broad-pressure fallback: two guests/pets can take a short play break,
  // pausing rather than deleting their patience.
  const broadQueue = p.registerWait + p.displayWait;
  if ((urgent.lowPatience >= 2 && activeCustomers >= 5) || (broadQueue >= 4 && activeCustomers >= 7)) {
    options.push(rushCandidate(
      'petLounge', 68 + urgent.lowPatience * 8 + Math.min(12, broadQueue * 2),
      'Pet Play Break', 'The café is broadly overloaded; a short two-guest breather would smooth the rush.', pressure,
      { slots: 2, suggestedPauseSeconds: 15 },
    ));
  }

  options.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind));
  return options[0] || null;
}
