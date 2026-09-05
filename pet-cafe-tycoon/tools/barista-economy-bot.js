// Deterministic long-run A/B for the live Barista economy decision.
//
// This intentionally does NOT grant Barista upgrades or ad power. It compares the same competent
// 25-day owner policy twice from the same seed:
//   baseline      — current generic staffing/purchase strategy
//   barista-aware — after Cashier + first Runner, save for the Day-5/Coffee-gated 2,300 coin Barista
//                    before Cleaner/second Runner and let that worker own routine coffee-lane chores.
//
// Unlike the older tools/bot.js report, this harness mirrors the browser staff system by actually
// spawning pure sim Runner/Cashier/Cleaner workers after their hire counters change. The Barista
// state machine below mirrors systems/baristaWorker.js's navigation, work timers, bean thresholds
// and carry/drop cadence without any Three.js/render dependency. That makes the A/B useful for an
// economy decision rather than merely measuring the cost of counters that never became workers.
import {
  createWorld, activeZones, payZone, stepOvens, stepMachines, takeFromOven, takeFromMachine,
  putOnDisplay, collectCash, refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, cleanSeat,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers, SPECIES } from '../src/sim/customers.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { createMover, setTarget, stepMover } from '../src/sim/mover.js';
import {
  spawnInterval, maxCustomers, salePrice, playerSpeed, carryCap, cafeLevel,
  ensureStars, hireCost, hire, nextStarCost, STAR_IDS, familyOf,
} from '../src/sim/economy.js';
import { createDay, stepDay, nextDay, spawnMult, capBonus, tipMult } from '../src/sim/day.js';
import {
  ensureCareer, chooseCareerGoal, careerGoalMet, careerGoalLabel,
  recordRecipeOrder, masteryMultiplier, recordCareerShift, awardWeeklyCup,
} from '../src/sim/career.js';
import { createCarry, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../src/sim/carry.js';
import { decide } from '../src/sim/botDecide.js';
import { BARISTA, baristaDecision, baristaHireState, baristaLane } from '../src/sim/barista.js';
import { AREA1 } from '../data/area1.js';
import { makeRng } from '../src/core/rng.js';

const DT = 1 / 30;
const MAX_DAYS = 25;
const RUNNER_SPAWN = { x: 4, z: -3 };
const CASHIER_FALLBACK = { x: -4, z: -0.2 };
const CLEANER_SPAWN = { x: -6, z: 4 };
const BARISTA_FALLBACK = { x: 0.5, z: -3.3 };
const STATION_ARRIVE_EPS = 0.14;
const IDLE_ARRIVE_EPS = 0.35;

function pct(n) { return `${(n * 100).toFixed(1)}%`; }
function pp(n) { return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}pp`; }
function dayValue(rows, day, key = 'earnings') { return rows.find(r => r.day === day)?.[key] ?? null; }

function runScenario({ name, baristaAware }) {
  const wallStart = Date.now();
  const world = createWorld(AREA1);
  const G = {
    coins: 0,
    up: { speed: 0, carry: 0, income: 0 },
    staff: { runner: 0, cashier: 0, cleaner: 0, barista: 0 },
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
  const custSpawnPhase = new Map();
  const custWaitTime = new Map();
  const phaseFriction = {
    morning: { n: 0, over: 0 }, rush: { n: 0, over: 0 },
    afternoon: { n: 0, over: 0 }, closing: { n: 0, over: 0 },
  };
  const coffeeFlow = { done: 0, over: 0, served: 0, lost: 0 };

  function spawnCustomer() {
    const species = SPECIES[speciesIdx++ % SPECIES.length];
    const variant = { shirt: rng.i(0, 4), hair: rng.i(0, 3), skin: rng.i(0, 2) };
    const c = createCustomer(seq++, species, variant, AREA1);
    customers.push(c); custSpawnPhase.set(c.id, G.dayState.phase);
  }

  // Browser-equivalent generic staff spawning. The live systems/staff.js layer performs exactly
  // this count -> pure-sim-worker synchronization; the older economy bot imported createStaff but
  // never instantiated those counters, which made its staff purchases economically invisible.
  function syncGenericStaff() {
    const counts = { runner: 0, cashier: 0, cleaner: 0 };
    for (const s of staffList) if (counts[s.kind] != null) counts[s.kind]++;
    while (counts.runner < (G.staff.runner | 0)) { staffList.push(createStaff('runner', RUNNER_SPAWN)); counts.runner++; }
    while (counts.cashier < (G.staff.cashier | 0)) {
      const co = world.stations.get('register1');
      staffList.push(createStaff('cashier', co ? co.cash : CASHIER_FALLBACK)); counts.cashier++;
    }
    while (counts.cleaner < (G.staff.cleaner | 0)) { staffList.push(createStaff('cleaner', CLEANER_SPAWN)); counts.cleaner++; }
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
    if (!arrived && ownerMover.hasTarget && Math.hypot(tx - owner.x, tz - owner.z) < 0.3) {
      ownerMover.hasTarget = false; return true;
    }
    return arrived || !ownerMover.hasTarget;
  }
  const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;

  // Headless mirror of systems/baristaWorker.js. Keeping the same states/timers here is deliberate:
  // the A/B should pay for a worker that has to physically walk the coffee lane, not an instant
  // spreadsheet bonus that teleports beans/cups into place.
  let barista = null;
  const baristaMetrics = { hiredDay: null, hiredAt: null, cupsMoved: 0, beanRefills: 0, jobs: 0 };
  function spawnBarista() {
    if (barista) return;
    const lane = baristaLane(world), p = lane?.machine?.front || BARISTA_FALLBACK;
    const mover = createMover(p.x, p.z, 0.30, BARISTA.speed); mover.kind = 'barista';
    barista = { mover, x: p.x, z: p.z, state: 'idle', job: null, items: [], workT: 0, idleT: 0 };
  }
  function targetPoint(id) { const st = id && world.stations.get(id); return st && st.active ? st.front : null; }
  function stopBarista() { if (barista) { barista.mover.hasTarget = false; barista.mover.vx = 0; barista.mover.vz = 0; } }
  function moveBaristaTo(point, dt) {
    if (!barista || !point) return false;
    const m = barista.mover;
    if (m.tx !== point.x || m.tz !== point.z) setTarget(m, point.x, point.z, world.grid);
    if (!world._movers) world._movers = [];
    world._movers.push(m);
    const justArrived = stepMover(m, world.grid, world._movers, dt);
    world._movers.pop();
    barista.x = m.x; barista.z = m.z;
    if (justArrived) return true;
    const distance = Math.hypot(point.x - barista.x, point.z - barista.z);
    if (distance < STATION_ARRIVE_EPS) { m.hasTarget = false; return true; }
    if (!m.hasTarget) {
      if (distance < IDLE_ARRIVE_EPS) return true;
      setTarget(m, point.x, point.z, world.grid);
    }
    return false;
  }
  function startBaristaDecision() {
    if (!barista) return;
    if (barista.items.length) {
      const lane = baristaLane(world);
      if (lane?.bar) {
        barista.job = { kind: 'restockCoffee', targetId: lane.bar.id, product: barista.items[0], count: barista.items.length };
        barista.state = 'toBar'; return;
      }
    }
    const d = baristaDecision(world); barista.job = d;
    if (d.kind === 'refillBeans') barista.state = 'toPantry';
    else if (d.kind === 'restockCoffee') barista.state = 'toMachine';
    else { barista.state = 'idle'; barista.idleT = 0.25; stopBarista(); return; }
    baristaMetrics.jobs++;
  }
  function stepBarista(dt) {
    if ((G.staff.barista | 0) <= 0) { barista = null; return; }
    if (!barista) spawnBarista();
    if (!barista) return;
    if (barista.state === 'idle') {
      barista.idleT -= dt; if (barista.idleT <= 0) startBaristaDecision(); return;
    }
    const j = barista.job || {};
    if (barista.state === 'toPantry') {
      const p = targetPoint(j.pantryId); if (!p) { barista.state = 'idle'; return; }
      if (moveBaristaTo(p, dt)) { stopBarista(); barista.workT = 0.35; barista.state = 'fetchBeans'; }
    } else if (barista.state === 'fetchBeans') {
      barista.workT -= dt; if (barista.workT <= 0) barista.state = 'toRefill';
    } else if (barista.state === 'toRefill') {
      const p = targetPoint(j.machineId); if (!p) { barista.state = 'idle'; return; }
      if (moveBaristaTo(p, dt)) {
        stopBarista(); const used = refillBeans(world, j.machineId, j.amount);
        if (used > 0) baristaMetrics.beanRefills++;
        barista.state = 'idle'; barista.idleT = 0.18;
      }
    } else if (barista.state === 'toMachine') {
      const p = targetPoint(j.sourceId); if (!p) { barista.state = 'idle'; return; }
      if (moveBaristaTo(p, dt)) { stopBarista(); barista.workT = Math.max(0.18, (j.count | 0) * 0.16); barista.state = 'loading'; }
    } else if (barista.state === 'loading') {
      barista.workT -= dt;
      if (barista.workT <= 0) {
        const src = world.stations.get(j.sourceId);
        const wanted = Math.min(BARISTA.carry, j.count | 0, src ? src.stock | 0 : 0);
        const got = wanted > 0 ? takeFromMachine(world, j.sourceId, wanted) : 0;
        for (let i = 0; i < got; i++) barista.items.push(j.product);
        barista.state = barista.items.length ? 'toBar' : 'idle';
      }
    } else if (barista.state === 'toBar') {
      const p = targetPoint(j.targetId); if (!p) { barista.state = 'idle'; return; }
      if (moveBaristaTo(p, dt)) { stopBarista(); barista.workT = 0.08; barista.state = 'dropping'; }
    } else if (barista.state === 'dropping') {
      barista.workT -= dt; if (barista.workT > 0) return;
      const key = barista.items[0];
      if (!key) { barista.state = 'idle'; barista.idleT = 0.12; return; }
      const put = putOnDisplay(world, j.targetId, key, 1);
      if (put > 0) {
        barista.items.shift(); baristaMetrics.cupsMoved++; barista.workT = 0.08;
      } else { barista.state = 'idle'; barista.idleT = 0.35; }
      if (!barista.items.length) { barista.state = 'idle'; barista.idleT = 0.12; }
    }
  }

  function baristaGoalPending() {
    if (!baristaAware || (G.staff.barista | 0) > 0 || (G.staff.runner | 0) <= 0) return false;
    const state = baristaHireState(G.dayState.day, world.built, G.coins, G.staff.barista);
    return state.unlocked;
  }
  function reserveAmount() { return baristaGoalPending() ? Math.min(BARISTA.cost, Math.max(0, G.coins)) : 0; }
  function maybeHireBarista() {
    if (!baristaGoalPending() || G.coins < BARISTA.cost) return false;
    const state = baristaHireState(G.dayState.day, world.built, G.coins, G.staff.barista);
    if (!state.available) return false;
    const r = hire(G, 'barista');
    if (!r.ok) return false;
    baristaMetrics.hiredDay = G.dayState.day; baristaMetrics.hiredAt = G.time;
    world.events.push({ type: 'purchase', kind: 'hire:barista', at: G.time || 0 });
    return true;
  }

  // Once hired, a competent owner stops volunteering for routine coffee-lane chores. The decision
  // engine predates Barista, so for its read-only target selection we temporarily present a stable
  // Coffee Bar / non-empty bean tank. Real world state is restored immediately afterward; customers,
  // machines, Runner and Barista all continue seeing the actual stock. Existing coffee/bean carry
  // commitments are allowed to finish instead of being discarded.
  function withBaristaDecisionShadow(fn) {
    if (!baristaAware || (G.staff.barista | 0) <= 0 || G.carryKey || carry.sack === 'beans') return fn();
    const lane = baristaLane(world); if (!lane) return fn();
    const barStock = lane.bar.stock, beans = lane.machine.beans;
    lane.bar.stock = lane.bar.capacity;
    if (lane.machine.beans <= 0) lane.machine.beans = 1;
    try { return fn(); } finally { lane.bar.stock = barStock; lane.machine.beans = beans; }
  }

  let arrivedT = 0, lastKind = null, lastStationId = null;
  const kindCounts = {}, ownerCoffeeTicks = { total: 0 };
  function decideOwnerTarget() {
    maybeHireBarista();
    const realCoins = G.coins, reserve = reserveAmount();
    G.coins = Math.max(0, realCoins - reserve);
    const spendableBefore = G.coins;
    const target = withBaristaDecisionShadow(() => decide(world, G));
    const purchaseSpent = Math.max(0, spendableBefore - G.coins);
    G.coins = realCoins - purchaseSpent;
    return { target, reserve: reserveAmount() };
  }
  function ownerStep(dt) {
    const speed = playerSpeed(G.up);
    const choice = decideOwnerTarget(), target = choice.target;
    const k = target ? target.kind : 'null'; kindCounts[k] = (kindCounts[k] || 0) + 1;
    if (target) {
      const st = target.stationId && world.stations.get(target.stationId);
      const coffeeTarget = target.sackKind === 'beans' || (st && (
        st.type === 'coffee' || (st.type === 'display' && familyOf(st.product) === 'coffee')
      ));
      if (coffeeTarget) ownerCoffeeTicks.total++;
    }
    if (!target) {
      ownerMover.hasTarget = false; lastKind = null; lastStationId = null; return;
    }
    if (target.kind !== lastKind || target.stationId !== lastStationId) {
      ownerMover.hasTarget = false; arrivedT = 0; lastKind = target.kind; lastStationId = target.stationId;
    }
    const arrived = walkOwnerTo(target.x, target.z, speed, dt); if (!arrived) return;
    switch (target.kind) {
      case 'register': return;
      case 'fetch': {
        const st = world.stations.get(target.stationId);
        if (!st || !st.active || st.stock <= 0 || (G.carryKey && G.carryKey !== target.product)) return;
        const cap = carryCap(G.up); arrivedT += dt;
        while (arrivedT >= 0.35 && st.stock > 0 && G.carryCount < cap) {
          arrivedT -= 0.35;
          const got = (st.type === 'oven' ? takeFromOven : takeFromMachine)(world, st.id, 1);
          if (got > 0) { G.carryKey = target.product; G.carryCount++; }
        }
        return;
      }
      case 'drop': {
        const st = world.stations.get(target.stationId); if (!st || !G.carryKey) return;
        arrivedT += dt;
        while (arrivedT >= 0.15 && G.carryCount > 0 && st.stock < st.capacity) {
          arrivedT -= 0.15; const placed = putOnDisplay(world, st.id, G.carryKey, 1); if (placed <= 0) break;
          G.carryCount--; if (G.carryCount === 0) G.carryKey = null;
        }
        return;
      }
      case 'return': returnAll(carry); G.carryKey = null; G.carryCount = 0; return;
      case 'refillPickup': if (!carry.sack) takeSack(carry, target.sackKind); return;
      case 'refillDrop': {
        const st = world.stations.get(target.stationId); if (!st || !carry.sack) return;
        if (carry.sack === 'beans') {
          const used = Math.min(carry.sackLeft, Math.max(0, 20 - st.beans)); refillBeans(world, st.id, used); useSack(carry, used);
        } else { const used = refillBowl(world, st.id, carry.sackLeft); useSack(carry, used); }
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
        const spendable = Math.max(0, G.coins - choice.reserve);
        const r = payZone(world, target.zoneId, spendable, dt); G.coins -= r.spent; return;
      }
    }
  }

  const dayReport = [];
  let dayPurchases = [], daysToComplete = null, closingAfford = 0;
  function affordableOptionsCount() {
    const coins = G.coins; let n = 0;
    for (const z of (world.activeZoneList || activeZones(world))) if ((z.price - (world.partial[z.id] || 0)) <= coins) n++;
    for (const kind of ['cashier', 'runner', 'cleaner']) { const c = hireCost(kind, G.staff); if (c != null && c <= coins) n++; }
    const bs = baristaHireState(G.dayState.day, world.built, coins, G.staff.barista);
    if (baristaAware && (G.staff.runner | 0) > 0 && bs.unlocked && bs.available) n++;
    for (const id of STAR_IDS) {
      const st = world.stations.get(id); if (!st || !st.active) continue;
      const c = nextStarCost(world.area, id, (G.stars && G.stars[id]) || 1); if (c != null && c <= coins) n++;
    }
    return n;
  }

  const lastPos = new Map(); let teleports = 0; const stalls = [];
  function trackMovers(t) {
    const movers = [ownerMover, ...customers.map(c => c.mover), ...staffList.map(s => s.mover), ...(barista ? [barista.mover] : [])];
    for (const m of movers) {
      teleports += m.teleports || 0; m.teleports = 0;
      if (m.hasTarget) {
        const p = lastPos.get(m) || { x: m.x, z: m.z, t, d: Infinity };
        const d = Math.hypot(m.tx - m.x, m.tz - m.z);
        if (d < p.d - 0.02) { p.d = d; p.t = t; }
        else if (t - p.t > 3) { stalls.push({ t: +t.toFixed(1), kind: m.kind, d: +d.toFixed(2) }); p.t = t; }
        lastPos.set(m, p);
      } else lastPos.delete(m);
    }
  }

  let t = 0;
  while (G.dayState.day <= MAX_DAYS) {
    G.time = t; G.serviceStreak.t = Math.max(0, G.serviceStreak.t - DT);
    if (world.built.size !== cachedBuiltSize) {
      cachedBuiltSize = world.built.size; interval = spawnInterval(world.built); maxC = maxCustomers(world.built);
    }
    const mult = spawnMult(G.dayState), effMaxC = maxC + capBonus(G.dayState) + Math.min(3, Math.floor(cafeLevel(G) / 5));
    if (mult > 0) {
      spawnT -= DT;
      if (spawnT <= 0 && customers.length < effMaxC) { spawnT = interval / mult; spawnCustomer(); }
    }

    stepOvens(world, DT); stepMachines(world, DT); ownerStep(DT);
    for (const id of world.checkouts) { const co = world.stations.get(id); if (co.active && near(owner, co.front, 1.2)) co.serving = 'owner'; }
    stepCustomers(customers, world, price, DT);
    syncGenericStaff();
    stepStaff(staffList, world, DT, amount => { G.coins += amount; }, G.staffLevels, customers);
    stepBarista(DT);
    trackMovers(t);

    // Consume event bus while done customers still exist so product-family diagnostics are real.
    for (const e of world.events) {
      const c = (e.id != null) ? customers.find(x => x.id === e.id) : null;
      if (e.type === 'pay') {
        G.dayStats.served++; G.dayStats.earned += e.amount;
        G.serviceStreak.count = G.serviceStreak.t > 0 ? G.serviceStreak.count + 1 : 1; G.serviceStreak.t = 7;
        G.shiftBestStreak = Math.max(G.shiftBestStreak, G.serviceStreak.count); G.dayStats.bestStreak = G.shiftBestStreak;
        recordRecipeOrder(G.meta, c?.order || []);
        if (c && familyOf(c.wish?.product) === 'coffee') coffeeFlow.served++;
      } else if (e.type === 'lost') {
        G.dayStats.lost++; G.serviceStreak = { count: 0, t: 0 };
        if (c && familyOf(c.wish?.product) === 'coffee') coffeeFlow.lost++;
      } else if (e.type === 'built') dayPurchases.push('built ' + e.zoneId);
      else if (e.type === 'purchase') dayPurchases.push(e.kind);
    }

    for (const c of customers) {
      if (c.mood === 'wait') custWaitTime.set(c.id, (custWaitTime.get(c.id) || 0) + DT);
      if (c.done) {
        const phase = custSpawnPhase.get(c.id) || 'morning', bucket = phaseFriction[phase];
        const waited = custWaitTime.get(c.id) || 0; bucket.n++; if (waited > 6) bucket.over++;
        if (familyOf(c.wish?.product) === 'coffee') { coffeeFlow.done++; if (waited > 6) coffeeFlow.over++; }
        custSpawnPhase.delete(c.id); custWaitTime.delete(c.id);
      }
    }
    customers = customers.filter(c => !c.done); G.customers = customers;

    const dayEvents = stepDay(G.dayState, DT);
    for (const e of dayEvents) {
      if (e.type === 'phase' && e.phase === 'closing') closingAfford = affordableOptionsCount();
      else if (e.type === 'dayEnd') {
        for (const st of world.stations.values()) if (st.type === 'seat' && st.dirty) cleanSeat(world, st.id);
        const completedDay = G.dayState.day, goal = G.goal, met = careerGoalMet(goal, G.dayStats);
        if (met) G.coins += goal.reward;
        const outcomes = Math.max(1, G.dayStats.served + G.dayStats.lost), lostRate = G.dayStats.lost / outcomes;
        const rating = lostRate <= 0.06 && (met || G.shiftBestStreak >= 8) ? 3 : lostRate <= 0.16 ? 2 : 1;
        recordCareerShift(G.meta, completedDay, G.dayStats, rating, met);
        const cup = awardWeeklyCup(G.meta, completedDay); if (cup.awarded) G.coins += cup.reward;
        dayReport.push({
          day: completedDay, earnings: G.dayStats.earned, served: G.dayStats.served, lost: G.dayStats.lost,
          goalText: careerGoalLabel(goal), goalMet: met, goalReward: met ? goal.reward : 0,
          cupReward: cup.awarded ? cup.reward : 0, afford: closingAfford, purchases: dayPurchases.slice(), coins: Math.round(G.coins),
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

  const frictionByPhase = {};
  for (const p of ['morning', 'rush', 'afternoon', 'closing']) {
    const b = phaseFriction[p]; frictionByPhase[p] = b.n ? b.over / b.n : 0;
  }
  const outsideOver = ['morning', 'afternoon', 'closing'].reduce((s, p) => s + phaseFriction[p].over, 0);
  const outsideN = ['morning', 'afternoon', 'closing'].reduce((s, p) => s + phaseFriction[p].n, 0);
  const lostRates = dayReport.map(r => (r.served + r.lost) ? r.lost / (r.served + r.lost) : 0);
  const avgLost = lostRates.length ? lostRates.reduce((a, b) => a + b, 0) / lostRates.length : 0;
  const totalEarnings = dayReport.reduce((s, r) => s + r.earnings, 0);
  const finalStaff = { ...G.staff };

  return {
    name, baristaAware, dayReport, daysToComplete, totalEarnings,
    day8: dayValue(dayReport, 8), day10: dayValue(dayReport, 10), day12: dayValue(dayReport, 12),
    avgLost, rushFriction: frictionByPhase.rush, outsideFriction: outsideOver / Math.max(1, outsideN),
    coffeeWaitOver6: coffeeFlow.done ? coffeeFlow.over / coffeeFlow.done : 0,
    coffeeFlow, finalStaff, finalCoins: Math.round(G.coins),
    barista: baristaMetrics, ownerCoffeeTicks: ownerCoffeeTicks.total,
    stalls: stalls.length, teleports, firstStalls: stalls.slice(0, 5),
    wallMs: Date.now() - wallStart, kindCounts,
  };
}

const baseline = runScenario({ name: 'baseline-staff-aware', baristaAware: false });
const withBarista = runScenario({ name: 'barista-aware', baristaAware: true });

let cumulativeIncrement = 0, recoupDay = null;
if (withBarista.barista.hiredDay != null) {
  for (let d = withBarista.barista.hiredDay; d <= MAX_DAYS; d++) {
    cumulativeIncrement += (dayValue(withBarista.dayReport, d) || 0) - (dayValue(baseline.dayReport, d) || 0);
    if (recoupDay == null && cumulativeIncrement >= BARISTA.cost) recoupDay = d;
  }
}
const delta = {
  daysToComplete: (withBarista.daysToComplete ?? 99) - (baseline.daysToComplete ?? 99),
  totalEarnings: withBarista.totalEarnings - baseline.totalEarnings,
  day8: (withBarista.day8 || 0) - (baseline.day8 || 0),
  day10: (withBarista.day10 || 0) - (baseline.day10 || 0),
  day12: (withBarista.day12 || 0) - (baseline.day12 || 0),
  avgLost: withBarista.avgLost - baseline.avgLost,
  rushFriction: withBarista.rushFriction - baseline.rushFriction,
  outsideFriction: withBarista.outsideFriction - baseline.outsideFriction,
  coffeeWaitOver6: withBarista.coffeeWaitOver6 - baseline.coffeeWaitOver6,
  ownerCoffeeTicks: withBarista.ownerCoffeeTicks - baseline.ownerCoffeeTicks,
  cumulativeServiceIncrementAfterHire: cumulativeIncrement,
  recoupDay,
};

const usefulCoffeeRelief = withBarista.barista.cupsMoved >= 10 && withBarista.ownerCoffeeTicks < baseline.ownerCoffeeTicks;
const progressionSafe = delta.daysToComplete <= 1;
const frictionSafe = delta.avgLost <= 0.02;
let recommendation = 'HOLD BARISTA UPGRADES';
if (usefulCoffeeRelief && progressionSafe && frictionSafe && (recoupDay != null || delta.totalEarnings > 0)) {
  recommendation = 'BASE BARISTA LOOKS USEFUL — KEEP UPGRADES LOCKED UNTIL PLAYTEST';
} else if (!usefulCoffeeRelief) {
  recommendation = 'BASE BARISTA IS NOT EARNING ITS ROLE YET — DO NOT ADD UPGRADES';
} else if (!progressionSafe || !frictionSafe) {
  recommendation = 'BARISTA OPPORTUNITY COST NEEDS TUNING — DO NOT ADD UPGRADES';
}

console.log('Pet Café — BARISTA ECONOMY A/B (deterministic 25-day career)');
console.log('policy: Cashier -> first Runner -> reserve 2,300 for Barista (Day 5 + Coffee required) -> resume Cleaner/second Runner');
console.log('both arms simulate real Runner/Cashier/Cleaner bodies; Barista arm uses live-equivalent movement/work timings');
console.log('');
for (const s of [baseline, withBarista]) {
  console.log(`--- ${s.name} ---`);
  console.log(`Area 1 completion: day ${s.daysToComplete ?? 'NOT REACHED'} | total service earnings: ${s.totalEarnings} | final wallet: ${s.finalCoins}`);
  console.log(`Day 8/10/12 gross: ${s.day8}/${s.day10}/${s.day12}`);
  console.log(`lost sales: ${pct(s.avgLost)} | rush wait>6s: ${pct(s.rushFriction)} | outside-rush wait>6s: ${pct(s.outsideFriction)}`);
  console.log(`coffee wait>6s: ${pct(s.coffeeWaitOver6)} (${s.coffeeFlow.over}/${s.coffeeFlow.done}) | coffee served/lost: ${s.coffeeFlow.served}/${s.coffeeFlow.lost}`);
  console.log(`staff: ${JSON.stringify(s.finalStaff)} | owner coffee-chore ticks: ${s.ownerCoffeeTicks}`);
  if (s.baristaAware) console.log(`Barista: hired day ${s.barista.hiredDay ?? 'never'} | cups moved ${s.barista.cupsMoved} | bean refills ${s.barista.beanRefills} | jobs ${s.barista.jobs}`);
  console.log(`movement: stalls ${s.stalls}, teleports ${s.teleports} | wall ${s.wallMs}ms`);
}
console.log('');
console.log('--- Barista delta vs staff-aware baseline ---');
console.log(`Area 1 days: ${delta.daysToComplete >= 0 ? '+' : ''}${delta.daysToComplete}`);
console.log(`service earnings total: ${delta.totalEarnings >= 0 ? '+' : ''}${delta.totalEarnings}`);
console.log(`Day 8/10/12: ${delta.day8 >= 0 ? '+' : ''}${delta.day8} / ${delta.day10 >= 0 ? '+' : ''}${delta.day10} / ${delta.day12 >= 0 ? '+' : ''}${delta.day12}`);
console.log(`lost sales: ${pp(delta.avgLost)} | rush friction: ${pp(delta.rushFriction)} | outside friction: ${pp(delta.outsideFriction)}`);
console.log(`coffee wait>6s: ${pp(delta.coffeeWaitOver6)} | owner coffee-chore ticks: ${delta.ownerCoffeeTicks >= 0 ? '+' : ''}${delta.ownerCoffeeTicks}`);
console.log(`incremental service earnings from hire day onward: ${delta.cumulativeServiceIncrementAfterHire >= 0 ? '+' : ''}${delta.cumulativeServiceIncrementAfterHire}`);
console.log(`gross-service recoup of 2,300: ${delta.recoupDay == null ? 'not reached by Day 25' : 'Day ' + delta.recoupDay}`);
console.log(`RECOMMENDATION: ${recommendation}`);

const report = { baseline, withBarista, delta, recommendation };
console.log('BARISTA_ECONOMY_JSON ' + JSON.stringify(report));

let fail = false;
for (const s of [baseline, withBarista]) {
  if (s.stalls > 0 || s.teleports > 0) { console.error(`${s.name}: movement regression (${s.stalls} stalls, ${s.teleports} teleports)`); fail = true; }
  if (s.wallMs > 20000) { console.error(`${s.name}: simulation exceeded 20s wall-clock budget`); fail = true; }
  if (s.daysToComplete == null) { console.error(`${s.name}: Area 1 never completed`); fail = true; }
}
if (withBarista.barista.hiredDay == null) { console.error('Barista-aware arm never purchased the Barista; A/B is invalid'); fail = true; }
if (withBarista.barista.hiredDay < BARISTA.unlockDay) { console.error('Barista purchased before Day-5 unlock'); fail = true; }
if (withBarista.barista.cupsMoved <= 0) { console.error('Barista was purchased but never moved a coffee-family cup'); fail = true; }
if (fail) process.exit(1);
