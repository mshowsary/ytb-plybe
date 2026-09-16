// Task 24 — deterministic staffing/progression experiment. EXPERIMENT ONLY.
// No live area prerequisite, staff price or arrival rule is mutated by this tool.
import {
  createWorld, activeZones, payZone, stepOvens, stepMachines, takeFromOven, takeFromMachine,
  putOnDisplay, collectCash, refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, cleanSeat,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers } from '../src/sim/customers.js';
import { createCustomerSpawnSequence, CUSTOMER_SPAWN_SEED } from '../src/sim/customerSpawn.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { createMover, setTarget, stepMover } from '../src/sim/mover.js';
import { beginActorStep, endActorStep } from '../src/sim/actorRoster.js';
import {
  salePrice, playerSpeed, carryCap, cafeLevel, ensureStars, hireCost, nextStarCost, STAR_IDS,
} from '../src/sim/economy.js';
import { createDay, stepDay, nextDay, spawnMult, capBonus, tipMult } from '../src/sim/day.js';
import {
  ensureCareer, chooseCareerGoal, careerGoalMet, recordRecipeOrder, masteryMultiplier,
  recordCareerShift, awardWeeklyCup,
} from '../src/sim/career.js';
import { createCarry, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../src/sim/carry.js';
import { createLedger } from '../src/sim/ledger.js';
import { decide } from '../src/sim/botDecide.js';
import {
  CURRENT_STAFFING_VARIANT, STAFFING_CANDIDATES, STAFFING_POLICIES, areaForStaffingVariant,
  staffingDemand, staffingHireCost, firstHireEntryCost,
} from '../src/sim/staffingExperiment.js';

const DT = 1 / 30;
const MAX_DAYS = 12;
const SEEDS = Object.freeze([CUSTOMER_SPAWN_SEED, CUSTOMER_SPAWN_SEED + 101, CUSTOMER_SPAWN_SEED + 211]);
const RUNNER_SPAWN = { x:4, z:-3 };
const CASHIER_FALLBACK = { x:-4, z:-0.2 };
const CLEANER_SPAWN = { x:-6, z:4 };

function totalStaff(staff) { return (staff.runner|0) + (staff.cashier|0) + (staff.cleaner|0); }
function nextEssential(staff) {
  if ((staff.cashier|0) < 1) return 'cashier';
  if ((staff.runner|0) < 1) return 'runner';
  if ((staff.cleaner|0) < 1) return 'cleaner';
  return null;
}
function pct(n) { return `${(n * 100).toFixed(1)}%`; }
function avg(rows, key) { return rows.length ? rows.reduce((s,r) => s + (Number(r[key]) || 0), 0) / rows.length : 0; }
function median(values) {
  const a = values.filter(Number.isFinite).sort((x,y)=>x-y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
}

function runScenario(variant, policy, seed) {
  const wallStart = Date.now();
  const area = areaForStaffingVariant(variant);
  const world = createWorld(area, null, seed);
  const G = {
    coins:0,
    up:{ speed:0, carry:0, income:0 },
    staff:{ runner:0, cashier:0, cleaner:0 },
    staffLevels:{ runner:{ speed:0, carry:0 }, cashier:{ speed:0 }, cleaner:{ speed:0 } },
    machineLevels:{ oven:0, coffee:0, display:0 },
    boosts:{}, time:0, world,
    meta:{ reputation:0, career:{} },
    serviceStreak:{ count:0, t:0 }, shiftBestStreak:0,
    dayState:createDay(), stars:{}, dayStats:{ served:0, lost:0, earned:0, bestStreak:0 },
  };
  ensureCareer(G.meta); G.goal = chooseCareerGoal(1, G.meta);
  world.dayState = G.dayState; world.stars = G.stars;
  let ledger = createLedger(null, { day:1, openingWallet:0 });
  const ledgerMismatches = [];
  const spawns = createCustomerSpawnSequence(seed);
  const price = (key, seated) => Math.round(
    salePrice(key, G.up, G.boosts, seated, 0, tipMult(G.dayState)) * masteryMultiplier(G.meta, key),
  );

  let customers = [], staffList = [];
  G.customers = customers;
  const carry = createCarry(); G.carry = carry; G.carryKey = null; G.carryCount = 0;
  let spawnT = 2, demandKey = '', interval = 7.5, baseMaxC = 4;
  const stockoutActive = new Set();
  const dayReport = [];
  const purchaseKinds = {};
  const spend = { build:0, hire:0, decision:0 };
  let firstHireAt = null, firstHireKind = null, coreCompleteAt = null, allZonesCompleteAt = null;
  let stockoutSeconds = 0, stockoutIncidents = 0, idleSeconds = 0, activeSeconds = 0;

  function spawnCustomer() {
    const next = spawns.next();
    const c = createCustomer(next.id, next.species, next.variant, area); c.petVariant = next.petVariant;
    customers.push(c);
  }

  function syncStaff() {
    const count = { runner:0, cashier:0, cleaner:0 };
    for (const s of staffList) if (count[s.kind] != null) count[s.kind]++;
    while (count.runner < (G.staff.runner|0)) { staffList.push(createStaff('runner', RUNNER_SPAWN)); count.runner++; }
    while (count.cashier < (G.staff.cashier|0)) {
      const co = world.stations.get('register1'); staffList.push(createStaff('cashier', co ? co.cash : CASHIER_FALLBACK)); count.cashier++;
    }
    while (count.cleaner < (G.staff.cleaner|0)) { staffList.push(createStaff('cleaner', CLEANER_SPAWN)); count.cleaner++; }
  }

  function recordFirstHire(kind) {
    if (firstHireAt != null) return;
    firstHireAt = G.time; firstHireKind = kind;
  }

  function buyManualHire(kind) {
    const cost = staffingHireCost(variant, kind, G.staff);
    if (cost == null || G.coins < cost) return false;
    G.coins -= cost; G.staff[kind] = (G.staff[kind]|0) + 1;
    ledger.record('spend', `hire:${kind}`, cost, { meta:{ policy:policy.id, variant:variant.id } });
    spend.hire += cost; purchaseKinds[`hire:${kind}`] = (purchaseKinds[`hire:${kind}`] || 0) + 1;
    world.emit({ type:'purchase', kind:`hire:${kind}`, at:G.time || 0 });
    recordFirstHire(kind);
    return true;
  }

  function maybeManualHire() {
    const desk = world.stations.get('hire1');
    if (!desk || !desk.active) return false;
    if (totalStaff(G.staff) === 0) return buyManualHire('cashier');
    if (!policy.staffFirst) return false;
    const kind = nextEssential(G.staff);
    return kind ? buyManualHire(kind) : false;
  }

  function staffReserve() {
    if (!policy.staffFirst) return 0;
    const desk = world.stations.get('hire1'); if (!desk || !desk.active) return 0;
    const kind = nextEssential(G.staff); if (!kind) return 0;
    const cost = staffingHireCost(variant, kind, G.staff);
    return cost == null ? 0 : Math.min(G.coins, cost);
  }

  const owner = { x:0, z:2.5, rot:0 }; G.P = owner;
  const ownerMover = createMover(owner.x, owner.z, 0.35, playerSpeed(G.up));
  let arrivedT = 0, lastKind = null, lastStationId = null;
  let stuckX = owner.x, stuckZ = owner.z, stuckT = 0;
  const near = (a,b,r) => (a.x-b.x)**2 + (a.z-b.z)**2 < r*r;

  function walkOwnerTo(tx, tz, dt) {
    ownerMover.speed = playerSpeed(G.up) * policy.ownerSpeedScale;
    if (!ownerMover.hasTarget || ownerMover.tx !== tx || ownerMover.tz !== tz) {
      ownerMover.x = owner.x; ownerMover.z = owner.z; setTarget(ownerMover, tx, tz, world.grid);
      stuckX = owner.x; stuckZ = owner.z; stuckT = 0;
    }
    const arrived = stepMover(ownerMover, world.grid, [], dt);
    owner.x = ownerMover.x; owner.z = ownerMover.z; owner.rot = ownerMover.rot;
    if (!arrived && ownerMover.hasTarget) {
      if (Math.hypot(owner.x-stuckX, owner.z-stuckZ) > 0.02) { stuckX=owner.x; stuckZ=owner.z; stuckT=0; }
      else {
        stuckT += dt;
        if (stuckT > 2) { ownerMover.hasTarget=false; stuckT=0; return true; }
        if (stuckT > 1 && stuckT-dt <= 1) setTarget(ownerMover, tx, tz, world.grid);
      }
    }
    if (!arrived && ownerMover.hasTarget && Math.hypot(tx-owner.x, tz-owner.z) < 0.3) { ownerMover.hasTarget=false; return true; }
    return arrived || !ownerMover.hasTarget;
  }

  function snapshotPurchaseState() {
    return {
      staff:{...G.staff}, up:{...G.up}, machine:{...G.machineLevels}, stars:{...G.stars}, coins:G.coins,
    };
  }

  function chooseOwnerTarget() {
    maybeManualHire();
    const reserve = staffReserve();
    const realCoins = G.coins;
    G.coins = Math.max(0, realCoins - reserve);
    const before = snapshotPurchaseState();
    let target = decide(world, G);
    const purchaseSpent = Math.max(0, before.coins - G.coins);
    G.coins = realCoins - purchaseSpent;
    if (purchaseSpent) {
      ledger.record('spend', 'purchase:decision', purchaseSpent, { meta:{ policy:policy.id, variant:variant.id, targetKind:target?.kind || null } });
      spend.decision += purchaseSpent;
      if (firstHireAt == null && totalStaff(G.staff) > totalStaff(before.staff)) {
        const kind = ['cashier','runner','cleaner'].find(k => (G.staff[k]|0) > (before.staff[k]|0)) || 'staff';
        recordFirstHire(kind);
      }
    }

    // Staff-first experimental policy treats the early Desk as the meaningful progression branch.
    // It may replace another MONEY target, but never interrupts register/restock/refill/clean work.
    if (variant.earlyDesk && policy.staffFirst && !world.built.has('z_hire') && target && (target.kind === 'build' || target.kind === 'cash')) {
      const active = (world.activeZoneList || activeZones(world)).find(z => z.id === 'z_hire');
      if (active && (G.coins > 0 || (world.partial.z_hire|0) > 0)) target = { x:active.x, z:active.z, kind:'build', zoneId:'z_hire' };
    }
    return { target, reserve:staffReserve() };
  }

  function ownerStep(dt) {
    const choice = chooseOwnerTarget(), target = choice.target;
    if (!target) { idleSeconds += dt; ownerMover.hasTarget=false; lastKind=null; lastStationId=null; return; }
    activeSeconds += dt;
    if (target.kind !== lastKind || target.stationId !== lastStationId || target.zoneId !== G._lastZoneId) {
      ownerMover.hasTarget=false; arrivedT=0; lastKind=target.kind; lastStationId=target.stationId || null; G._lastZoneId=target.zoneId || null;
    }
    const arrived = walkOwnerTo(target.x, target.z, dt); if (!arrived) return;
    switch (target.kind) {
      case 'register': return;
      case 'fetch': {
        const st=world.stations.get(target.stationId); if(!st||!st.active||st.stock<=0||(G.carryKey&&G.carryKey!==target.product))return;
        const cap=carryCap(G.up); arrivedT+=dt;
        while(arrivedT>=0.35&&st.stock>0&&G.carryCount<cap){arrivedT-=0.35;const got=(st.type==='oven'?takeFromOven:takeFromMachine)(world,st.id,1);if(got>0){G.carryKey=target.product;G.carryCount++;}}
        return;
      }
      case 'drop': {
        const st=world.stations.get(target.stationId);if(!st||!G.carryKey)return;arrivedT+=dt;
        while(arrivedT>=0.15&&G.carryCount>0&&st.stock<st.capacity){arrivedT-=0.15;const n=putOnDisplay(world,st.id,G.carryKey,1);if(n<=0)break;G.carryCount--;if(G.carryCount===0)G.carryKey=null;}return;
      }
      case 'return': returnAll(carry); G.carryKey=null; G.carryCount=0; return;
      case 'refillPickup': if(!carry.sack)takeSack(carry,target.sackKind);return;
      case 'refillDrop': {
        const st=world.stations.get(target.stationId);if(!st||!carry.sack)return;
        if(carry.sack==='beans'){const used=Math.min(carry.sackLeft,Math.max(0,20-st.beans));refillBeans(world,st.id,used);useSack(carry,used);}
        else{const used=refillBowl(world,st.id,carry.sackLeft);useSack(carry,used);}return;
      }
      case 'harvest': { const st=world.stations.get(target.stationId);if(!st||st.stage!==3)return;carryAddFruit(carry,harvestBush(world,st.id),carryCap(G.up));return; }
      case 'blend': { const st=world.stations.get(target.stationId);if(!st||carry.fruit<=0)return;const n=stationAddFruit(world,st.id,carry.fruit);carry.fruit-=n;return; }
      case 'clean': { const st=world.stations.get(target.stationId);if(!st||!st.dirty)return;arrivedT+=dt;if(arrivedT>=1){cleanSeat(world,st.id);arrivedT=0;}return; }
      case 'cash': {
        for(const id of world.checkouts){const amount=collectCash(world,id);if(amount<=0)continue;G.coins+=amount;ledger.record('collection',`register:${id}`,amount,{meta:{checkoutId:id}});}return;
      }
      case 'build': {
        const spendable=Math.max(0,G.coins-choice.reserve);if(spendable<=0)return;
        const r=payZone(world,target.zoneId,spendable,dt);if(r.spent>0){G.coins-=r.spent;spend.build+=r.spent;ledger.record('spend',`build:${target.zoneId}`,r.spent,{meta:{zoneId:target.zoneId}});}return;
      }
    }
  }

  function observeStockouts() {
    const alive = new Set();
    for (const c of customers) {
      if (!c || c.done) continue; alive.add(c.id);
      const display = c.counterId && world.stations.get(c.counterId);
      const out = c.state === 'queue' && c.mood === 'wait' && display && display.active && display.stock <= 0;
      if (out) {
        stockoutSeconds += DT;
        if (!stockoutActive.has(c.id)) { stockoutActive.add(c.id); stockoutIncidents++; }
      } else stockoutActive.delete(c.id);
    }
    for (const id of [...stockoutActive]) if (!alive.has(id)) stockoutActive.delete(id);
  }

  function coreZoneIds() {
    return area.zones.filter(z => !(variant.earlyDesk && z.id === 'z_register2')).map(z => z.id);
  }
  const coreIds = coreZoneIds();

  let t = 0;
  while (G.dayState.day <= MAX_DAYS) {
    G.time=t; G.serviceStreak.t=Math.max(0,G.serviceStreak.t-DT);
    const demand = staffingDemand(variant, world.built, G.staff);
    const key = `${demand.interval}:${demand.maxCustomers}`;
    if (key !== demandKey) { demandKey=key; interval=demand.interval; baseMaxC=demand.maxCustomers; }
    const mult=spawnMult(G.dayState);
    const effMaxC=baseMaxC+capBonus(G.dayState)+Math.min(3,Math.floor(cafeLevel(G)/5));
    if(mult>0){spawnT-=DT;if(spawnT<=0&&customers.length<effMaxC){spawnT=interval/mult;spawnCustomer();}}

    stepOvens(world,DT);stepMachines(world,DT);ownerStep(DT);
    for(const id of world.checkouts){const co=world.stations.get(id);if(co.active&&near(owner,co.front,1.2))co.serving='owner';}
    syncStaff();
    beginActorStep(world,customers,staffList);
    stepCustomers(customers,world,price,DT);
    stepStaff(staffList,world,DT,amount=>{if(amount<=0)return;G.coins+=amount;ledger.record('collection','register:staff',amount,{meta:{by:'cashier'}});},G.staffLevels,customers);
    endActorStep(world);
    observeStockouts();

    for(const e of world.events){
      if(e.type==='pay'){
        G.dayStats.served++;G.dayStats.earned+=e.amount;G.serviceStreak.count=G.serviceStreak.t>0?G.serviceStreak.count+1:1;G.serviceStreak.t=7;
        G.shiftBestStreak=Math.max(G.shiftBestStreak,G.serviceStreak.count);G.dayStats.bestStreak=G.shiftBestStreak;
        const c=customers.find(x=>x.id===e.id),order=c?.order||[];ledger.record('sale',`service:${order.length?order.join('+'):'unknown'}`,e.amount,{meta:{customerId:e.id,checkoutId:e.checkoutId||null}});recordRecipeOrder(G.meta,order);
      } else if(e.type==='lost'){G.dayStats.lost++;G.serviceStreak={count:0,t:0};}
      else if(e.type==='purchase'){purchaseKinds[e.kind]=(purchaseKinds[e.kind]||0)+1;}
    }
    customers=customers.filter(c=>!c.done);G.customers=customers;

    const dayEvents=stepDay(G.dayState,DT);
    for(const e of dayEvents){if(e.type!=='dayEnd')continue;
      for(const st of world.stations.values())if(st.type==='seat'&&st.dirty)cleanSeat(world,st.id);
      const completedDay=G.dayState.day,goal=G.goal,met=careerGoalMet(goal,G.dayStats);
      if(met){G.coins+=goal.reward;ledger.record('bonus','contract',goal.reward,{meta:{day:completedDay}});}
      const outcomes=Math.max(1,G.dayStats.served+G.dayStats.lost),lostRate=G.dayStats.lost/outcomes;
      const rating=lostRate<=0.06&&(met||G.shiftBestStreak>=8)?3:lostRate<=0.16?2:1;
      recordCareerShift(G.meta,completedDay,G.dayStats,rating,met);
      const cup=awardWeeklyCup(G.meta,completedDay);if(cup.awarded){G.coins+=cup.reward;ledger.record('bonus','weekly-cup',cup.reward,{meta:{day:completedDay}});}
      const accounting=ledger.report(G.coins);if(!accounting.reconciled)ledgerMismatches.push({day:completedDay,...accounting});
      dayReport.push({day:completedDay,served:G.dayStats.served,lost:G.dayStats.lost,goalMet:met,wallet:G.coins,sales:accounting.sale,collection:accounting.collection,bonus:accounting.bonus,spend:accounting.spend});
      G.dayStats={served:0,lost:0,earned:0,bestStreak:0};G.serviceStreak={count:0,t:0};G.shiftBestStreak=0;
      nextDay(G.dayState);G.goal=chooseCareerGoal(G.dayState.day,G.meta);ledger.reset(G.dayState.day,G.coins);
    }

    ensureStars(G,world);
    if(coreCompleteAt==null&&coreIds.every(id=>world.built.has(id)))coreCompleteAt=t;
    if(allZonesCompleteAt==null&&area.zones.every(z=>world.built.has(z.id)))allZonesCompleteAt=t;
    world.events.length=0;t+=DT;
  }

  const served=dayReport.reduce((s,r)=>s+r.served,0),lost=dayReport.reduce((s,r)=>s+r.lost,0),outcomes=Math.max(1,served+lost);
  const goalsMet=dayReport.filter(r=>r.goalMet).length;
  return {
    variant:variant.id,policy:policy.id,seed,
    firstHireMinutes:firstHireAt==null?null:firstHireAt/60,firstHireKind,
    entryCost:firstHireEntryCost(variant),
    coreCompleteMinutes:coreCompleteAt==null?null:coreCompleteAt/60,
    allZonesCompleteMinutes:allZonesCompleteAt==null?null:allZonesCompleteAt/60,
    served,lost,lostRate:lost/outcomes,goalRate:dayReport.length?goalsMet/dayReport.length:0,
    stockoutSeconds,stockoutIncidents,idleSeconds,activeSeconds,
    finalWallet:Math.round(G.coins),spend:{...spend,total:spend.build+spend.hire+spend.decision},purchaseKinds,
    ledgerMismatches,spawnDraws:spawns.snapshot().rngDraws,days:dayReport.length,wallMs:Date.now()-wallStart,
  };
}

function summarize(rows) {
  return {
    runs:rows.length,
    firstHireMedian:median(rows.map(r=>r.firstHireMinutes)),
    coreCompleteMedian:median(rows.map(r=>r.coreCompleteMinutes)),
    lostRate:avg(rows,'lostRate'),goalRate:avg(rows,'goalRate'),
    stockoutSeconds:avg(rows,'stockoutSeconds'),idleSeconds:avg(rows,'idleSeconds'),
    finalWallet:avg(rows,'finalWallet'),spend:avg(rows.map(r=>({x:r.spend.total})),'x'),
  };
}

function runSweep() {
  const seed=SEEDS[0],policy=STAFFING_POLICIES.staffFirst;
  return STAFFING_CANDIDATES.map(variant=>{
    const run=runScenario(variant,policy,seed);
    return {variant,run,distance:run.firstHireMinutes==null?Infinity:Math.abs(run.firstHireMinutes-8),inWindow:run.firstHireMinutes!=null&&run.firstHireMinutes>=6&&run.firstHireMinutes<=10};
  });
}

export function runStaffingProgressionExperiment() {
  const sweep=runSweep();
  const eligible=sweep.filter(x=>x.inWindow).sort((a,b)=>a.distance-b.distance||b.variant.firstHireCost-a.variant.firstHireCost);
  const selected=(eligible[0]||sweep.slice().sort((a,b)=>a.distance-b.distance)[0]).variant;

  const robust=[];
  for(const variant of [CURRENT_STAFFING_VARIANT,selected])for(const policy of Object.values(STAFFING_POLICIES))for(const seed of SEEDS)robust.push(runScenario(variant,policy,seed));
  const currentRows=robust.filter(r=>r.variant===CURRENT_STAFFING_VARIANT.id),candidateRows=robust.filter(r=>r.variant===selected.id);
  const current=summarize(currentRows),candidate=summarize(candidateRows);
  const staffFirstCandidate=candidateRows.filter(r=>r.policy==='staff-first');
  const staffFirstMedian=median(staffFirstCandidate.map(r=>r.firstHireMinutes));
  const lostDelta=candidate.lostRate-current.lostRate;
  const stockoutDelta=candidate.stockoutSeconds-current.stockoutSeconds;
  const completionDelta=(candidate.coreCompleteMedian??99)-(current.coreCompleteMedian??99);
  const qualifies=staffFirstMedian!=null&&staffFirstMedian>=6&&staffFirstMedian<=10&&lostDelta<=0.03&&completionDelta<=4&&robust.every(r=>r.ledgerMismatches.length===0&&r.coreCompleteMinutes!=null);
  const downside = lostDelta>0.005 ? `lost-sale rate +${(lostDelta*100).toFixed(1)}pp` : stockoutDelta>60 ? `stockout exposure +${stockoutDelta.toFixed(0)}s/run` : candidate.finalWallet<current.finalWallet ? `ending wallet ${Math.round(current.finalWallet-candidate.finalWallet)} lower on average` : 'no material measured service downside versus current arm';
  return { sweep:sweep.map(x=>({variant:x.variant.id,firstHireCost:x.variant.firstHireCost,firstHireMinutes:x.run.firstHireMinutes,coreCompleteMinutes:x.run.coreCompleteMinutes,lostRate:x.run.lostRate,stockoutSeconds:x.run.stockoutSeconds,entryCost:x.run.entryCost,inWindow:x.inWindow})),selected:selected.id,selectedCost:selected.firstHireCost,current,candidate,staffFirstMedian,lostDelta,stockoutDelta,completionDelta,qualifies,downside,runs:robust };
}

if (process.argv[1] && process.argv[1].endsWith('staffing-progression-experiment.js')) {
  const report=runStaffingProgressionExperiment();
  console.log('Pet Café — TASK 24 STAFF-FIRST PROGRESSION EXPERIMENT');
  console.log('experiment only: Desk after Cupcakes; second register parallel/optional; candidate demand ignores Desk and follows productive lines + useful staff');
  console.log('--- first-hire price sweep (staff-first policy, fixed seed) ---');
  for(const r of report.sweep)console.log(`${r.variant.padEnd(17)} entry ${String(r.entryCost.total).padEnd(5)} | first hire ${r.firstHireMinutes==null?'never':r.firstHireMinutes.toFixed(1)+'m'} | core ${r.coreCompleteMinutes==null?'n/a':r.coreCompleteMinutes.toFixed(1)+'m'} | lost ${pct(r.lostRate)} | stockout ${r.stockoutSeconds.toFixed(0)}s ${r.inWindow?'TARGET':''}`);
  console.log(`SELECTED FOR ROBUSTNESS: ${report.selected} (first Cashier ${report.selectedCost})`);
  console.log('--- 3 policies × 3 fixed seeds ---');
  for(const variant of [CURRENT_STAFFING_VARIANT.id,report.selected]){
    for(const policy of Object.values(STAFFING_POLICIES)){
      const rows=report.runs.filter(r=>r.variant===variant&&r.policy===policy.id),s=summarize(rows);
      console.log(`${variant.padEnd(17)} ${policy.id.padEnd(11)} hire ${s.firstHireMedian==null?'never':s.firstHireMedian.toFixed(1)+'m'} | core ${s.coreCompleteMedian==null?'n/a':s.coreCompleteMedian.toFixed(1)+'m'} | lost ${pct(s.lostRate)} | goals ${pct(s.goalRate)} | stockout ${s.stockoutSeconds.toFixed(0)}s | idle ${s.idleSeconds.toFixed(0)}s | wallet ${Math.round(s.finalWallet)}`);
    }
  }
  console.log(`CANDIDATE: ${report.qualifies?report.selected:'NONE SUPPORTED YET'}`);
  console.log(`DOWNSIDE: ${report.downside}`);
  console.log(`COST LEDGER: current entry ${firstHireEntryCost(CURRENT_STAFFING_VARIANT).total}; selected entry ${firstHireEntryCost(STAFFING_CANDIDATES.find(v=>v.id===report.selected)).total}; selected first-hire ${report.selectedCost}`);
  console.log(`ROBUST DELTAS: first-hire staff-first median ${report.staffFirstMedian?.toFixed(1)??'n/a'}m | lost ${(report.lostDelta*100).toFixed(1)}pp | stockout ${report.stockoutDelta.toFixed(0)}s/run | core completion ${report.completionDelta.toFixed(1)}m`);
  console.log('TASK24_STAFFING_JSON '+JSON.stringify(report));
  let fail=false;
  for(const r of report.runs){if(r.ledgerMismatches.length){console.error(`${r.variant}/${r.policy}/${r.seed}: ledger mismatch`);fail=true;}if(r.coreCompleteMinutes==null){console.error(`${r.variant}/${r.policy}/${r.seed}: core room did not complete`);fail=true;}}
  if(fail)process.exitCode=1;
}
