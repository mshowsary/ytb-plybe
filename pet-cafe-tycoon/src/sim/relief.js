import { PRODUCTS, hireCost, upgradeCost } from './economy.js';

export const SMART_RELIEF_REWARD_ID = 'pet-cafe-smart-relief-coins';
export const SMART_RELIEF_MIN_DAY = 2;
export const RETURN_WASTE_RATE = 0.18;
export const RETURN_WASTE_CAP = 20;

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
  return { registerWait, displayWait, dirty, lowDisplays, misses: (G.dayStats && G.dayStats.serviceMisses) | 0 };
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
