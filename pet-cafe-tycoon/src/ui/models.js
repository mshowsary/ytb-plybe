// Bottom-sheet view models built from live game state.
import {
  UPGRADES, upgradeCost, hireCost, STAFF,
  WORKER_UPGRADES, MACHINE_UPGRADES, workerUpgradeCost, machineUpgradeCost,
  STAR_IDS, nextStarCost, ensureStars,
} from '../sim/economy.js';
import { BARISTA, baristaHireState } from '../sim/barista.js';

const PLAYER_ROWS = [
  { key: 'speed',  label: 'Speed',  effect: '+15% per tier' },
  { key: 'carry',  label: 'Carry',  effect: '6 → 9 → 12 → 16' },
  { key: 'income', label: 'Income', effect: '+20% per tier' },
];
function buildPlayerRows(G) {
  return PLAYER_ROWS.map(r => ({
    key: r.key, label: r.label, effect: r.effect,
    tier: G.up[r.key] | 0, maxTier: UPGRADES[r.key].costs.length,
    cost: upgradeCost(r.key, G.up),
  }));
}

const WORKER_KINDS = [
  { kind: 'runner',  label: 'Runner',  desc: 'Carries treats from production to displays.', hasCarry: true },
  { kind: 'cashier', label: 'Cashier', desc: 'Mans a register so customers can pay.', hasCarry: false },
  { kind: 'cleaner', label: 'Cleaner', desc: 'Clears dirty tables after customers leave.', hasCarry: false },
  { kind: 'barista', label: 'Barista', desc: `Day ${BARISTA.unlockDay}+ · refills beans and keeps the Coffee Bar stocked.`, hasCarry: false, noLevels: true },
];
function levelRow(key, tier, cost, coins) {
  return { tier, maxTier: WORKER_UPGRADES[key].length, cost, disabled: cost == null || coins < cost };
}
function buildWorkerRows(G, world) {
  const desk = world.stations.get('hire1');
  const deskBuilt = !!(desk && desk.active);
  const activeDisplays = (world.displays || []).map(id => world.stations.get(id)).filter(st => st && st.active).map(st => ({ id: st.id, product: st.product }));
  const runnerList = (G.staffList || []).filter(s => s.kind === 'runner').map((s, i) => ({ index: i, assign: s.assign || null }));
  return WORKER_KINDS.map(w => {
    const count = G.staff[w.kind] | 0;
    if (w.kind === 'barista') {
      const gate = baristaHireState(G.dayState && G.dayState.day, world.built, G.coins, count);
      let desc = w.desc;
      if (!gate.unlocked && gate.reason === 'coffee') desc += ' Build Coffee first.';
      else if (!gate.unlocked && gate.reason === 'day') desc += ` Available on Day ${BARISTA.unlockDay}.`;
      return {
        kind: w.kind, label: w.label, desc,
        count, cap: BARISTA.cap,
        hireCost: gate.cost == null ? BARISTA.cost : gate.cost,
        hireMaxed: gate.reason === 'full',
        hireDisabled: !deskBuilt || !gate.available,
        showLevels: false, speed: null, carry: null, runners: null, displays: null,
      };
    }
    const cost = hireCost(w.kind, G.staff);
    const speedCost = workerUpgradeCost(w.kind, 'speed', G.staffLevels);
    const carryCost = w.hasCarry ? workerUpgradeCost(w.kind, 'carry', G.staffLevels) : null;
    return {
      kind: w.kind, label: w.label, desc: w.desc,
      count, cap: STAFF[w.kind].costs.length,
      hireCost: cost, hireMaxed: cost === null,
      hireDisabled: !deskBuilt || cost == null || G.coins < cost,
      showLevels: count >= 1,
      speed: levelRow('speed', G.staffLevels[w.kind].speed | 0, speedCost, G.coins),
      carry: w.hasCarry ? levelRow('carry', G.staffLevels[w.kind].carry | 0, carryCost, G.coins) : null,
      runners: w.kind === 'runner' ? runnerList : null,
      displays: w.kind === 'runner' ? activeDisplays : null,
    };
  });
}

const STATION_LABEL = {
  oven1: 'Oven A', oven2: 'Oven B', dispCookie: 'Cookie display', dispCupcake: 'Cupcake display',
  coffee1: 'Coffee machine', barCoffee: 'Coffee bar', blender1: 'Blender', barSmoothie: 'Smoothie bar',
};
const RECIPE_AT_3 = { oven1: 'brownies', coffee1: 'lattes' };
function starEffect(stationType, stationId, tier) {
  const parts = [];
  if (stationType === 'display') parts.push(tier < 2 ? 'Capacity 8 → 12 at ★2' : tier < 3 ? 'Capacity 12 → 16 at ★3' : 'Capacity 16 (max)');
  else parts.push(tier < 2 ? 'Speed x1.5 at ★2' : 'Speed x1.5 (max)');
  if (RECIPE_AT_3[stationId]) parts.push(tier < 3 ? `+ ${RECIPE_AT_3[stationId]} at ★3` : `+ ${RECIPE_AT_3[stationId]} unlocked`);
  return parts.join('  ');
}
function buildMachineRows(G, world) {
  ensureStars(G, world);
  const rows = [];
  for (const id of STAR_IDS) {
    const st = world.stations.get(id);
    if (!st || !st.active) continue;
    const tier = (G.stars && G.stars[id]) || 1;
    const cost = nextStarCost(world.area, id, tier);
    rows.push({
      key: id, label: STATION_LABEL[id] || id, effect: starEffect(st.type, id, tier),
      tier, maxTier: 3, cost, disabled: cost == null || G.coins < cost,
    });
  }
  return rows;
}

export function buildKioskModel(G, world, tab = 'player', focusRow = null) {
  return {
    coins: G.coins, tab, focusRow,
    player: buildPlayerRows(G),
    workers: buildWorkerRows(G, world),
    machines: buildMachineRows(G, world),
  };
}
