// Shop view models built from live game state.
//
// The Shop has three tabs — Staff, Upgrades (the player's own upgrades and the machines' stars)
// and Décor — and each shows only what can be bought NOW, plus ONE locked teaser: the next thing on
// that shelf, with a padlock and what opens it. It used to list every role and machine with prose
// gates ("Day 5+ · … Build Coffee first"), which read as a wall of things you cannot have.
import {
  UPGRADES, upgradeCost, hireCost, STAFF,
  WORKER_UPGRADES, workerUpgradeCost,
  STAR_IDS, nextStarCost, ensureStars,
} from '../sim/economy.js';
import { BARISTA, baristaHireState } from '../sim/barista.js';
import { pawBestStar } from '../sim/pawRating.js';
import { DECOR, decorUnlocked } from '../../data/decor.js';

export const SHOP_TABS = Object.freeze(['staff', 'upgrades', 'decor']);
// The old five-tab keys still arrive from the world's doors (systems/stations.js opens the kiosk on
// 'player' and the staff desk on 'workers'); they land on the tab that now holds those rows.
export function normalizeShopTab(tab) {
  if (tab === 'workers' || tab === 'staff') return 'staff';
  if (tab === 'decor') return 'decor';
  return 'upgrades';
}

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
  { kind: 'barista', label: 'Barista', desc: 'Refills beans and keeps the Coffee Bar stocked.', hasCarry: false },
  { kind: 'photographer', label: 'Photographer', desc: 'Takes the photos for you.', hasCarry: false },
];
const zoneAdding = (world, stationId) => (world.area && world.area.zones || []).find(z => (z.adds || []).includes(stationId)) || null;
function levelRow(key, tier, cost, coins) {
  return { tier, maxTier: WORKER_UPGRADES[key].length, cost, disabled: cost == null || coins < cost };
}
// Why a role cannot be hired yet, or null when it can. The first locked role (in WORKER_KINDS
// order) is the tab's teaser.
function roleLock(G, world, kind, count) {
  if (kind === 'barista') {
    const gate = baristaHireState(G.dayState && G.dayState.day, world.built, G.coins, count);
    if (gate.reason === 'coffee') return { kind: 'zone', zoneId: 'z_coffee' };
    if (gate.reason === 'day') return { kind: 'day', day: BARISTA.unlockDay };
    return null;
  }
  if (kind === 'photographer') {
    // The camera, not the old booth: z_photo hangs photoWall1 in the café and photos happen at the
    // tables (src/sim/petPose.js). Pointing this at the deleted photo1 made roleLock answer
    // 'hidden' for ever, so the row never appeared and the role could not be hired at all.
    const camera = world.stations.get('photoWall1');
    if (camera && camera.active) return null;
    const zone = zoneAdding(world, 'photoWall1');
    return zone ? { kind: 'zone', zoneId: zone.id } : { kind: 'hidden' };
  }
  return null;
}
function buildWorkerRows(G, world) {
  const desk = world.stations.get('hire1');
  const deskBuilt = !!(desk && desk.active);
  const activeDisplays = (world.displays || []).map(id => world.stations.get(id)).filter(st => st && st.active).map(st => ({ id: st.id, product: st.product }));
  const runnerList = (G.staffList || []).filter(s => s.kind === 'runner').map((s, i) => ({ index: i, assign: s.assign || null }));
  const rows = [];
  let teaser = null;
  // No staff desk yet: nobody can be hired, so the whole tab is the one teaser pointing at the desk.
  if (!deskBuilt) return { rows, teaser: { kind: 'desk', label: 'Staff desk', unlock: { kind: 'zone', zoneId: 'z_hire' } } };
  for (const w of WORKER_KINDS) {
    const count = G.staff[w.kind] | 0;
    const lock = roleLock(G, world, w.kind, count);
    if (lock) {
      if (!teaser && lock.kind !== 'hidden') teaser = { kind: w.kind, label: w.label, unlock: lock };
      continue;
    }
    const cost = w.kind === 'barista'
      ? baristaHireState(G.dayState && G.dayState.day, world.built, G.coins, count).cost
      : hireCost(w.kind, G.staff);
    const base = {
      kind: w.kind, label: w.label, desc: w.desc,
      count, cap: STAFF[w.kind].costs.length,
      hireCost: cost, hireMaxed: cost == null,
      hireDisabled: cost == null || G.coins < cost,
      showLevels: false, speed: null, carry: null, runners: null, displays: null,
    };
    // Only the three original roles have level ladders (G.staffLevels); the Barista and the
    // Photographer are hire-only.
    if (G.staffLevels && G.staffLevels[w.kind]) {
      const speedCost = workerUpgradeCost(w.kind, 'speed', G.staffLevels);
      const carryCost = w.hasCarry ? workerUpgradeCost(w.kind, 'carry', G.staffLevels) : null;
      base.showLevels = count >= 1;
      base.speed = levelRow('speed', G.staffLevels[w.kind].speed | 0, speedCost, G.coins);
      base.carry = w.hasCarry ? levelRow('carry', G.staffLevels[w.kind].carry | 0, carryCost, G.coins) : null;
      base.runners = w.kind === 'runner' ? runnerList : null;
      base.displays = w.kind === 'runner' ? activeDisplays : null;
    }
    rows.push(base);
  }
  return { rows, teaser };
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
  let teaser = null;
  for (const id of STAR_IDS) {
    const st = world.stations.get(id);
    if (!st) continue;
    if (!st.active) {
      const zone = zoneAdding(world, id);
      if (!teaser && zone) teaser = { kind: 'machine', key: id, label: STATION_LABEL[id] || id, product: st.product || null, unlock: { kind: 'zone', zoneId: zone.id } };
      continue;
    }
    const tier = (G.stars && G.stars[id]) || 1;
    const cost = nextStarCost(world.area, id, tier);
    rows.push({
      key: id, label: STATION_LABEL[id] || id, effect: starEffect(st.type, id, tier),
      tier, maxTier: 3, cost, disabled: cost == null || G.coins < cost,
    });
  }
  return { rows, teaser };
}

// The next piece of décor the café has not unlocked: the next star's set first — that is the Café
// Stars reward the player is working toward — else the first piece waiting on a build.
export function decorTeaser(built, bestStar) {
  const locked = DECOR.filter(item => !decorUnlocked(item, built, bestStar));
  const nextStar = (bestStar | 0) + 1;
  const item = locked.find(i => i.star === nextStar && (!i.requires || (built && built.has && built.has(i.requires))))
    || locked.find(i => !i.star && i.requires);
  if (!item) return null;
  return { id: item.id, icon: item.icon, price: item.price, unlock: item.star ? { kind: 'star', star: item.star } : { kind: 'zone', zoneId: item.requires } };
}

export function buildKioskModel(G, world, tab = 'upgrades', focusRow = null, door = null) {
  const workers = buildWorkerRows(G, world);
  const machines = buildMachineRows(G, world);
  const pawBest = pawBestStar(G.meta);
  return {
    coins: G.coins, tab: normalizeShopTab(tab), focusRow, door,
    player: buildPlayerRows(G),
    workers: workers.rows, staffTeaser: workers.teaser,
    machines: machines.rows, machineTeaser: machines.teaser,
    decorOwned: (G.meta && Array.isArray(G.meta.decor)) ? G.meta.decor : [],
    built: world.built,
    // The ratchet, so the decor tab lists a star set the moment it is earned.
    pawBest,
    decorTeaser: decorTeaser(world.built, pawBest),
  };
}
