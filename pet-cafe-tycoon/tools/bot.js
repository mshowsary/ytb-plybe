// tools/bot.js — headless economy pacing bot. No three.js, no DOM: pure sim + data only.
// This bot intentionally mirrors the LIVE career economy: adaptive weekly contracts, recipe mastery,
// Weekly Cups, day phases, service flow and the same owner priority loop used by the browser game.
import {
  createWorld, activeZones, payZone, stepOvens, stepMachines, takeFromOven, takeFromMachine,
  putOnDisplay, collectCash, refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, cleanSeat,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers, SPECIES } from '../src/sim/customers.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { createMover, setTarget, stepMover } from '../src/sim/mover.js';
import {
  spawnInterval, maxCustomers, salePrice, playerSpeed, carryCap, cafeLevel,
  ensureStars, hireCost, nextStarCost, STAR_IDS,
} from '../src/sim/economy.js';
import { createDay, stepDay, nextDay, spawnMult, capBonus, tipMult } from '../src/sim/day.js';
import {
  ensureCareer, chooseCareerGoal, careerGoalMet, careerGoalLabel,
  recordRecipeOrder, masteryMultiplier, recordCareerShift, awardWeeklyCup,
} from '../src/sim/career.js';
import { createCarry, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../src/sim/carry.js';
import { decide } from '../src/sim/botDecide.js';
import { AREA1 } from '../data/area1.js';
import { makeRng } from '../src/core/rng.js';

const DT = 1 / 30;
const MAX_DAYS = 25;
const wallStart = Date.now();

const world = createWorld(AREA1);
const G = {
  coins: 0,
  up: { speed: 0, carry: 0, income: 0 },
  staff: { runner: 0, cashier: 0, cleaner: 0 },
  staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
  machineLevels: { oven: 0, coffee: 0, display: 0 },
  boosts: {}, time: 0, world,
  meta: { reputation: 0, career: {} },
  serviceStreak: { count: 0, t: 0 }, shiftBestStreak: 0,
  dayState: createDay(), stars: {}, dayStats: { served: 0, lost: 0, earned: 0, bestStreak: 0 },
};
ensureCareer(G.meta);
G.goal = chooseCareerGoal(1, G.meta);
world.dayState = G.dayState; world.stars = G.stars;
const price = (key, seated) => Math.round(
  salePrice(key, G.up, G.boosts, seated, 0, tipMult(G.dayState)) * masteryMultiplier(G.meta, key),
);

let customers = [], staffList = [];
G.customers = customers;
let seq = 1, speciesIdx = 0, spawnT = 2;
let cachedBuiltSize = -1, interval = 4, maxC = 6;
const rng = makeRng(1);

function spawnCustomer() {
  const species = SPECIES[speciesIdx++ % SPECIES.length];
  const variant = { shirt: rng.i(0, 4), hair: rng.i(0, 3), skin: rng.i(0, 2) };
  const c = createCustomer(seq++, species, variant, AREA1);
  customers.push(c);
  custSpawnPhase.set(c.id, G.dayState.phase);
}

const owner = { x: 0, z: 2.5, rot: 0 };
G.P = owner;
G.carryKey = null; G.carryCount = 0;
const carry = createCarry(); G.carry = carry;
const ownerMover = createMover(owner.x, owner.z, 0.35, playerSpeed(G.up));
let stuckX = owner.x, stuckZ = owner.z, stuckT = 0;
function walkOwnerTo(tx, tz, speedNow, dt) {
  ownerMover.speed = speedNow;
  if (!ownerMover.hasTarget || ownerMover.tx !== tx || ownerMover.tz !== tz) {
    ownerMover.x = owner.x; ownerMover.z = owner.z;
    setTarget(ownerMover, tx, tz, world.grid);
    stuckX = owner.x; stuckZ = owner.z; stuckT = 0;
  }
  const arrived = stepMover(ownerMover, world.grid, [], dt);
  owner.x = ownerMover.x; owner.z = ownerMover.z; owner.rot = ownerMover.rot;
  if (!arrived && ownerMover.hasTarget) {
    if (Math.hypot(owner.x - stuckX, owner.z - stuckZ) > 0.02) { stuckX = owner.x; stuckZ = owner.z; stuckT = 0; }
    else {
      stuckT += dt;
      if (stuckT > 2.0) { ownerMover.hasTarget = false; stuckT = 0; return true; }
      if (stuckT > 1.0 && stuckT - dt <= 1.0) setTarget(ownerMover, tx, tz, world.grid);
    }
  }
  if (!arrived && ownerMover.hasTarget) {
    const dist = Math.hypot(tx - owner.x, tz - owner.z);
    if (dist < 0.3) { ownerMover.hasTarget = false; return true; }
  }
  return arrived || !ownerMover.hasTarget;
}
const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
const lastPos = new Map();

let arrivedT = 0, lastKind = null, lastStationId = null;
const kindCounts = {};
function ownerStep(dt) {
  const speed = playerSpeed(G.up);
  const target = decide(world, G);
  const k = target ? target.kind : 'null';
  kindCounts[k] = (kindCounts[k] || 0) + 1;
  if (!target) {
    if (ownerMover.hasTarget) { ownerMover.hasTarget = false; lastPos.delete(ownerMover); }
    lastKind = null; lastStationId = null;
    return;
  }
  if (target.kind !== lastKind || target.stationId !== lastStationId) {
    ownerMover.hasTarget = false; lastPos.delete(ownerMover);
    arrivedT = 0; lastKind = target.kind; lastStationId = target.stationId;
  }
  const arrived = walkOwnerTo(target.x, target.z, speed, dt);
  if (!arrived) return;
  switch (target.kind) {
    case 'register': return;
    case 'fetch': {
      const st = world.stations.get(target.stationId);
      if (!st || !st.active || st.stock <= 0) return;
      if (G.carryKey && G.carryKey !== target.product) return;
      const cap = carryCap(G.up); arrivedT += dt;
      while (arrivedT >= 0.35 && st.stock > 0 && G.carryCount < cap) {
        arrivedT -= 0.35;
        const k2 = (st.type === 'oven' ? takeFromOven : takeFromMachine)(world, st.id, 1);
        if (k2 > 0) { G.carryKey = target.product; G.carryCount++; }
      }
      return;
    }
    case 'drop': {
      const st = world.stations.get(target.stationId);
      if (!st || !G.carryKey) return;
      arrivedT += dt;
      while (arrivedT >= 0.15 && G.carryCount > 0 && st.stock < st.capacity) {
        arrivedT -= 0.15;
        const placed = putOnDisplay(world, st.id, G.carryKey, 1);
        if (placed <= 0) break;
        G.carryCount--; if (G.carryCount === 0) G.carryKey = null;
      }
      return;
    }
    case 'return': returnAll(carry); G.carryKey = null; G.carryCount = 0; return;
    case 'refillPickup': if (!carry.sack) takeSack(carry, target.sackKind); return;
    case 'refillDrop': {
      const st = world.stations.get(target.stationId); if (!st || !carry.sack) return;
      if (carry.sack === 'beans') { const used = Math.min(carry.sackLeft, Math.max(0, 20 - st.beans)); refillBeans(world, st.id, used); useSack(carry, used); }
      else { const used = refillBowl(world, st.id, carry.sackLeft); useSack(carry, used); }
      return;
    }
    case 'harvest': {
      const st = world.stations.get(target.stationId); if (!st || st.stage !== 3) return;
      carryAddFruit(carry, harvestBush(world, st.id), carryCap(G.up)); return;
    }
    case 'blend': {
      const st = world.stations.get(target.stationId); if (!st || carry.fruit <= 0) return;
      const added = stationAddFruit(world, st.id, carry.fruit); carry.fruit -= added; return;
    }
    case 'clean': {
      const st = world.stations.get(target.stationId); if (!st || !st.dirty) return;
      arrivedT += dt; if (arrivedT >= 1.0) { cleanSeat(world, st.id); arrivedT = 0; } return;
    }
    case 'cash': for (const id of world.checkouts) G.coins += collectCash(world, id); return;
    case 'build': {
      const r = payZone(world, target.zoneId, G.coins, dt); G.coins -= r.spent; return;
    }
  }
}

const dayReport = [];
let dayPurchases = [];
const custSpawnPhase = new Map();
const custWaitTime = new Map();
const phaseFriction = { morning: { n: 0, over: 0 }, rush: { n: 0, over: 0 }, afternoon: { n: 0, over: 0 }, closing: { n: 0, over: 0 } };
let daysToComplete = null, closingAfford = 0;
function affordableOptionsCount() {
  const coins = G.coins; let n = 0;
  for (const z of (world.activeZoneList || activeZones(world))) if ((z.price - (world.partial[z.id] || 0)) <= coins) n++;
  for (const kind of ['cashier', 'runner', 'cleaner']) { const c = hireCost(kind, G.staff); if (c != null && c <= coins) n++; }
  for (const id of STAR_IDS) {
    const st = world.stations.get(id); if (!st || !st.active) continue;
    const c = nextStarCost(world.area, id, (G.stars && G.stars[id]) || 1); if (c != null && c <= coins) n++;
  }
  return n;
}

let teleports = 0; const stalls = [];
let t = 0;
while (G.dayState.day <= MAX_DAYS) {
  G.time = t;
  G.serviceStreak.t = Math.max(0, G.serviceStreak.t - DT);
  if (world.built.size !== cachedBuiltSize) {
    cachedBuiltSize = world.built.size; interval = spawnInterval(world.built); maxC = maxCustomers(world.built);
  }
  const mult = spawnMult(G.dayState);
  const effMaxC = maxC + capBonus(G.dayState) + Math.min(3, Math.floor(cafeLevel(G) / 5));
  if (mult > 0) {
    spawnT -= DT;
    if (spawnT <= 0 && customers.length < effMaxC) { spawnT = interval / mult; spawnCustomer(); }
  }

  stepOvens(world, DT); stepMachines(world, DT); ownerStep(DT);
  for (const id of world.checkouts) { const co = world.stations.get(id); if (co.active && near(owner, co.front, 1.2)) co.serving = 'owner'; }
  stepCustomers(customers, world, price, DT);
  stepStaff(staffList, world, DT, () => {}, undefined, customers);

  for (const c of customers) {
    if (c.mood === 'wait') custWaitTime.set(c.id, (custWaitTime.get(c.id) || 0) + DT);
    if (c.done) {
      const phase = custSpawnPhase.get(c.id) || 'morning'; const bucket = phaseFriction[phase];
      bucket.n++; if ((custWaitTime.get(c.id) || 0) > 6) bucket.over++;
      custSpawnPhase.delete(c.id); custWaitTime.delete(c.id);
    }
  }
  customers = customers.filter(c => !c.done); G.customers = customers;

  const movers = [ownerMover, ...customers.map(c => c.mover), ...staffList.map(s => s.mover)];
  for (const m of movers) {
    teleports += m.teleports; m.teleports = 0;
    if (m.hasTarget) {
      const p = lastPos.get(m) || { x: m.x, z: m.z, t, d: Infinity };
      const d = Math.hypot(m.tx - m.x, m.tz - m.z);
      if (d < p.d - 0.02) { p.d = d; p.t = t; }
      else if (t - p.t > 3) { stalls.push({ t: +t.toFixed(1), kind: m.kind, x: +m.x.toFixed(2), z: +m.z.toFixed(2), tx: m.tx, tz: m.tz, d: +d.toFixed(2) }); p.t = t; }
      lastPos.set(m, p);
    } else lastPos.delete(m);
  }

  for (const e of world.events) {
    if (e.type === 'pay') {
      G.dayStats.served++; G.dayStats.earned += e.amount;
      G.serviceStreak.count = G.serviceStreak.t > 0 ? G.serviceStreak.count + 1 : 1;
      G.serviceStreak.t = 7;
      G.shiftBestStreak = Math.max(G.shiftBestStreak, G.serviceStreak.count);
      G.dayStats.bestStreak = G.shiftBestStreak;
      const paid = customers.find(c => c.id === e.id);
      recordRecipeOrder(G.meta, paid && paid.order || []);
    } else if (e.type === 'lost') {
      G.dayStats.lost++; G.serviceStreak = { count: 0, t: 0 };
    } else if (e.type === 'built') dayPurchases.push('built ' + e.zoneId);
    else if (e.type === 'purchase') dayPurchases.push(e.kind);
  }

  const dayEvents = stepDay(G.dayState, DT);
  for (const e of dayEvents) {
    if (e.type === 'phase' && e.phase === 'closing') closingAfford = affordableOptionsCount();
    else if (e.type === 'dayEnd') {
      for (const st of world.stations.values()) if (st.type === 'seat' && st.dirty) cleanSeat(world, st.id);
      const completedDay = G.dayState.day;
      const goal = G.goal; const met = careerGoalMet(goal, G.dayStats);
      if (met) G.coins += goal.reward;
      const outcomes = Math.max(1, G.dayStats.served + G.dayStats.lost);
      const lostRate = G.dayStats.lost / outcomes;
      const rating = lostRate <= 0.06 && (met || G.shiftBestStreak >= 8) ? 3 : lostRate <= 0.16 ? 2 : 1;
      recordCareerShift(G.meta, completedDay, G.dayStats, rating, met);
      const cup = awardWeeklyCup(G.meta, completedDay);
      if (cup.awarded) G.coins += cup.reward;
      dayReport.push({
        day: completedDay, earnings: G.dayStats.earned, served: G.dayStats.served, lost: G.dayStats.lost,
        goalText: careerGoalLabel(goal), goalMet: met, goalReward: met ? goal.reward : 0,
        cupReward: cup.awarded ? cup.reward : 0, afford: closingAfford, purchases: dayPurchases.slice(),
      });
      dayPurchases = []; G.dayStats = { served: 0, lost: 0, earned: 0, bestStreak: 0 };
      G.serviceStreak = { count: 0, t: 0 }; G.shiftBestStreak = 0;
      nextDay(G.dayState); G.goal = chooseCareerGoal(G.dayState.day, G.meta);
    }
  }

  if (daysToComplete == null) {
    ensureStars(G, world);
    if (world.built.size >= AREA1.zones.length && (G.stars.oven1 || 1) >= 2 && (G.stars.dispCookie || 1) >= 2) daysToComplete = G.dayState.day;
  }
  world.events.length = 0; t += DT;
}

const wallMs = Date.now() - wallStart;
console.log('Pet Café Tycoon — LIVE career economy bot');
console.log('day'.padEnd(5) + 'earnings'.padEnd(10) + 'served'.padEnd(8) + 'lost'.padEnd(6) + 'contract'.padEnd(28) + 'afford'.padEnd(9) + 'purchases');
for (const r of dayReport) {
  const reward = (r.goalReward || 0) + (r.cupReward || 0);
  const goalStr = `${r.goalText} ${r.goalMet ? 'MET+' + reward : 'missed'}`;
  console.log(String(r.day).padEnd(5) + r.earnings.toFixed(0).padEnd(10) + String(r.served).padEnd(8) + String(r.lost).padEnd(6) + goalStr.padEnd(28) + String(r.afford).padEnd(9) + r.purchases.join(', '));
}
console.log(`TOTAL game seconds: ${t.toFixed(1)} (${(t / 60).toFixed(1)} min, ${dayReport.length} days completed)`);

function dayEarnings(day) { const r = dayReport.find(x => x.day === day); return r ? r.earnings : null; }
const CHECKPOINTS = [
  { day: 1, lo: 220, hi: 400 },
  { day: 3, lo: 450, hi: 800 },
  { day: 5, lo: 700, hi: 1250 },
  { day: 8, lo: 900, hi: 1800 },
];
console.log('--- checkpoints (gross service earnings; contract/cup rewards excluded) ---');
let checkpointFail = false;
for (const cp of CHECKPOINTS) {
  const e = dayEarnings(cp.day); const ok = e != null && e >= cp.lo && e <= cp.hi;
  console.log(`day ${cp.day}: earnings=${e == null ? 'n/a' : e.toFixed(0)} target ${cp.lo}-${cp.hi} ${ok ? 'OK' : 'WARN'}`);
  if (!ok) checkpointFail = true;
}

console.log('--- friction index (share of customers who waited > 6s, by spawn phase) ---');
const frictionByPhase = {};
for (const phase of ['morning', 'rush', 'afternoon', 'closing']) {
  const b = phaseFriction[phase]; frictionByPhase[phase] = b.n > 0 ? b.over / b.n : 0;
  console.log(`  ${phase.padEnd(10)} ${(frictionByPhase[phase] * 100).toFixed(1)}% (${b.over}/${b.n})`);
}
const rushFrictionOk = frictionByPhase.rush >= 0.25 && frictionByPhase.rush <= 0.60;
const outsideOver = ['morning', 'afternoon', 'closing'].reduce((s, p) => s + phaseFriction[p].over, 0);
const outsideN = ['morning', 'afternoon', 'closing'].reduce((s, p) => s + phaseFriction[p].n, 0);
const outsideFriction = outsideOver / Math.max(1, outsideN);
console.log(`rush friction: ${(frictionByPhase.rush * 100).toFixed(1)}% (target 25-60%) ${rushFrictionOk ? 'OK' : 'WARN'}`);
console.log(`outside-rush friction: ${(outsideFriction * 100).toFixed(1)}% (target <25%) ${outsideFriction < 0.25 ? 'OK' : 'WARN'}`);
const lostPctPerDay = dayReport.map(r => (r.served + r.lost) > 0 ? r.lost / (r.served + r.lost) * 100 : 0);
const avgLostPct = lostPctPerDay.length ? lostPctPerDay.reduce((a, b) => a + b, 0) / lostPctPerDay.length : 0;
console.log(`lost sales: ${avgLostPct.toFixed(1)}% avg/day (target 4-10%) ${avgLostPct >= 4 && avgLostPct <= 10 ? 'OK' : 'WARN'}`);
console.log(`daysToComplete: ${daysToComplete == null ? 'NOT REACHED' : daysToComplete} (target 10-12) ${daysToComplete != null && daysToComplete >= 10 && daysToComplete <= 12 ? 'OK' : 'WARN'}`);
const affordVals = dayReport.filter(r => r.day >= 2 && r.day <= 8).map(r => r.afford);
console.log(`affordable options at closing (days 2-8): [${affordVals.join(', ')}] — healthy target is usually 1-3, not everything at once`);
console.log('stalls: ' + stalls.length + '  teleports: ' + teleports);
if (stalls.length) console.log('first stalls:', JSON.stringify(stalls.slice(0, 10)));
console.log('kind counts:', JSON.stringify(kindCounts));
console.log('café level (final): ' + cafeLevel(G) + ' stars: ' + JSON.stringify(G.stars));
console.log('career history days: ' + Object.keys(G.meta.career.history).length + ' cups: ' + JSON.stringify(G.meta.career.trophies));
console.log('wall clock: ' + wallMs + ' ms');

let gateFail = false;
if (stalls.length > 0) { console.error(`${stalls.length} STALLS (must be 0)`); gateFail = true; }
if (teleports > 0) { console.error(`${teleports} TELEPORTS (must be 0)`); gateFail = true; }
if (wallMs > 15000) { console.error('BOT WALL-CLOCK BUDGET EXCEEDED'); gateFail = true; }
if (daysToComplete == null) { console.error('area 1 never completed within ' + MAX_DAYS + ' days'); gateFail = true; }
if (checkpointFail || !rushFrictionOk || outsideFriction >= 0.25 || avgLostPct < 4 || avgLostPct > 10 || !(daysToComplete >= 10 && daysToComplete <= 12)) {
  console.log('(WARN lines are balance targets, not hard failures; deterministic movement remains the hard gate.)');
}
if (gateFail) process.exit(1);
