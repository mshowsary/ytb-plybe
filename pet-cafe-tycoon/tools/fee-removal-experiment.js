// Task 22 — paired, deterministic fee-removal measurement. EXPERIMENT ONLY.
// Live service/waste systems are not changed by this tool. Each policy runs twice from the same
// customer RNG stream: current direct fees vs fee-free direct deductions, while lost sales remain.
import {
  createWorld, activeZones, payZone, stepOvens, stepMachines, takeFromOven, takeFromMachine,
  putOnDisplay, collectCash, refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, cleanSeat,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers, PATIENCE, SETTLE_WAIT } from '../src/sim/customers.js';
import { createCustomerSpawnSequence } from '../src/sim/customerSpawn.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { createMover, setTarget, stepMover } from '../src/sim/mover.js';
import { beginActorStep, endActorStep } from '../src/sim/actorRoster.js';
import {
  spawnInterval, maxCustomers, salePrice, playerSpeed, carryCap, cafeLevel,
  ensureStars, hireCost, hire, nextStarCost, STAR_IDS,
} from '../src/sim/economy.js';
import { createDay, stepDay, nextDay, spawnMult, capBonus, tipMult } from '../src/sim/day.js';
import {
  ensureCareer, chooseCareerGoal, careerGoalMet, careerGoalLabel,
  recordRecipeOrder, masteryMultiplier, recordCareerShift, awardWeeklyCup,
} from '../src/sim/career.js';
import { createCarry, takeSack, useSack, addFruit as carryAddFruit, returnAll } from '../src/sim/carry.js';
import { createLedger } from '../src/sim/ledger.js';
import { decide } from '../src/sim/botDecide.js';
import { dirtyTablesBlockingSeats } from '../src/sim/serviceQuality.js';
import { frictionSeverity, SERVICE_FRICTION_DAILY_CAP } from '../src/sim/serviceFriction.js';
import {
  FEE_VARIANTS, FEE_EXPERIMENT_POLICIES, measuredRecoveryFee, measuredFrictionFee, measuredWasteFee,
  feeRemovalRead,
} from '../src/sim/feeExperiment.js';
import { AREA1 } from '../data/area1.js';

const DT = 1 / 30;
const MAX_DAYS = 15;
const SOFT_WAIT = 2.5;
const RUNNER_SPAWN = { x: 4, z: -3 };
const CASHIER_FALLBACK = { x: -4, z: -0.2 };
const CLEANER_SPAWN = { x: -6, z: 4 };

function nextEssentialStaff(staff) {
  if ((staff.cashier | 0) < 1) return 'cashier';
  if ((staff.runner | 0) < 1) return 'runner';
  if ((staff.cleaner | 0) < 1) return 'cleaner';
  return null;
}

function runScenario(policy, variant) {
  const wallStart = Date.now();
  const world = createWorld(AREA1);
  const G = {
    coins:0,
    up:{ speed:0, carry:0, income:0 },
    staff:{ runner:0, cashier:0, cleaner:0 },
    staffLevels:{ runner:{ speed:0, carry:0 }, cashier:{ speed:0 }, cleaner:{ speed:0 } },
    machineLevels:{ oven:0, coffee:0, display:0 },
    boosts:{}, time:0, world,
    meta:{ reputation:0, career:{} },
    serviceStreak:{ count:0, t:0 }, shiftBestStreak:0,
    dayState:createDay(), stars:{}, dayStats:{ served:0, lost:0, earned:0, serviceFees:0, serviceMisses:0, wasteFees:0, bestStreak:0 },
  };
  ensureCareer(G.meta); G.goal = chooseCareerGoal(1, G.meta);
  world.dayState = G.dayState; world.stars = G.stars;
  let ledger = createLedger(null, { day:1, openingWallet:0 });
  const ledgerMismatches = [];
  const spawns = createCustomerSpawnSequence();
  const price = (key, seated) => Math.round(salePrice(key, G.up, G.boosts, seated, 0, tipMult(G.dayState)) * masteryMultiplier(G.meta, key));

  let customers = [], staffList = [];
  G.customers = customers;
  const carry = createCarry(); G.carry = carry; G.carryKey = null; G.carryCount = 0;
  let spawnT = 2, cachedBuiltSize = -1, interval = 4, maxC = 6;
  const waitRecords = new Map(), previousState = new Map(), stockoutActive = new Set();
  let frictionUsed = 0;

  const metrics = {
    policy:policy.id, variant:variant.id, days:[],
    feesCharged:0, feesWouldCharge:0, recoveryFees:0, frictionFees:0, wasteFees:0,
    stockoutSeconds:0, stockoutIncidents:0, idleSeconds:0, activeSeconds:0,
    goalsMet:0, goalsTotal:0, firstHireAt:null, maxWallet:0, minWallet:0,
  };

  function spawnCustomer() {
    const next = spawns.next();
    const c = createCustomer(next.id, next.species, next.variant, AREA1); c.petVariant = next.petVariant;
    customers.push(c);
  }

  function syncStaff() {
    const count = { runner:0, cashier:0, cleaner:0 };
    for (const s of staffList) if (count[s.kind] != null) count[s.kind]++;
    while (count.runner < (G.staff.runner | 0)) { staffList.push(createStaff('runner', RUNNER_SPAWN)); count.runner++; }
    while (count.cashier < (G.staff.cashier | 0)) {
      const co = world.stations.get('register1'); staffList.push(createStaff('cashier', co ? co.cash : CASHIER_FALLBACK)); count.cashier++;
    }
    while (count.cleaner < (G.staff.cleaner | 0)) { staffList.push(createStaff('cleaner', CLEANER_SPAWN)); count.cleaner++; }
  }

  function applyFee(model, category, bucket) {
    metrics.feesWouldCharge += model.raw;
    if (!model.charged) return 0;
    G.coins -= model.charged;
    metrics.feesCharged += model.charged;
    metrics[bucket] += model.charged;
    G.dayStats.serviceFees = (G.dayStats.serviceFees | 0) + (bucket === 'wasteFees' ? 0 : model.charged);
    if (bucket === 'wasteFees') G.dayStats.wasteFees = (G.dayStats.wasteFees | 0) + model.charged;
    ledger.record('deduction', category, model.charged);
    return model.charged;
  }

  function feeRecovery(reason, category = `service:${reason}`) {
    return applyFee(measuredRecoveryFee(reason, G.coins, variant), category, 'recoveryFees');
  }
  function feeFriction(kind, severity) {
    const remaining = Math.max(0, SERVICE_FRICTION_DAILY_CAP - frictionUsed);
    const model = measuredFrictionFee(kind, severity, G.coins, remaining, variant);
    const charged = applyFee(model, `friction:${kind}`, 'frictionFees');
    frictionUsed += charged;
    return charged;
  }
  function feeWaste(productKeys, fruit) {
    return applyFee(measuredWasteFee(productKeys, fruit, G.coins, variant), 'waste:return', 'wasteFees');
  }

  function waitRecord(c) {
    let r = waitRecords.get(c.id);
    if (!r) {
      r = { shelfStart:null, shelfCounter:null, shelfCharged:false, substituteCharged:false, registerStart:null, registerCharged:false, tableCharged:false };
      waitRecords.set(c.id, r);
    }
    return r;
  }

  function observeFrictionAfterStep() {
    const alive = new Set();
    for (const c of customers) {
      if (!c || c.done) continue;
      alive.add(c.id); const r = waitRecord(c);
      if (c.state === 'queue' && c.mood === 'wait' && !r.shelfCharged) {
        if (r.shelfCounter !== c.counterId || r.shelfStart == null) { r.shelfCounter = c.counterId; r.shelfStart = Number(c.patience); }
        const waited = Math.max(0, Number(r.shelfStart) - Number(c.patience));
        if (waited >= SOFT_WAIT && feeFriction('shelfWait', frictionSeverity(waited, SOFT_WAIT, SETTLE_WAIT)) > 0) r.shelfCharged = true;
      }
      if (c.state === 'atRegister' && !r.registerCharged) {
        if (r.registerStart == null) r.registerStart = Number(c.patience);
        const waited = Math.max(0, Number(r.registerStart) - Number(c.patience));
        if (waited >= SOFT_WAIT && c.mood === 'wait' && feeFriction('registerWait', frictionSeverity(waited, SOFT_WAIT, 8)) > 0) r.registerCharged = true;
      }
      const prev = previousState.get(c.id);
      if (!r.tableCharged && prev === 'atRegister' && c.state === 'leave' && c.paid && dirtyTablesBlockingSeats(world)) {
        feeRecovery('table', 'service:table'); r.tableCharged = true;
      }
      previousState.set(c.id, c.state);

      const display = c.counterId && world.stations.get(c.counterId);
      const isStockout = c.state === 'queue' && c.mood === 'wait' && display && display.active && display.stock <= 0;
      if (isStockout) {
        metrics.stockoutSeconds += DT;
        if (!stockoutActive.has(c.id)) { stockoutActive.add(c.id); metrics.stockoutIncidents++; }
      } else stockoutActive.delete(c.id);
    }
    for (const id of waitRecords.keys()) if (!alive.has(id)) waitRecords.delete(id);
    for (const id of previousState.keys()) if (!alive.has(id)) previousState.delete(id);
    for (const id of [...stockoutActive]) if (!alive.has(id)) stockoutActive.delete(id);
  }

  const owner = { x:0, z:2.5, rot:0 }; G.P = owner;
  const ownerMover = createMover(owner.x, owner.z, 0.35, playerSpeed(G.up));
  let arrivedT = 0, lastKind = null, lastStationId = null, stuckX = owner.x, stuckZ = owner.z, stuckT = 0;
  function walkOwnerTo(tx, tz, dt) {
    ownerMover.speed = playerSpeed(G.up) * policy.ownerSpeedScale;
    if (!ownerMover.hasTarget || ownerMover.tx !== tx || ownerMover.tz !== tz) {
      ownerMover.x = owner.x; ownerMover.z = owner.z; setTarget(ownerMover, tx, tz, world.grid);
      stuckX = owner.x; stuckZ = owner.z; stuckT = 0;
    }
    const arrived = stepMover(ownerMover, world.grid, [], dt);
    owner.x = ownerMover.x; owner.z = ownerMover.z; owner.rot = ownerMover.rot;
    if (!arrived && ownerMover.hasTarget) {
      if (Math.hypot(owner.x - stuckX, owner.z - stuckZ) > 0.02) { stuckX = owner.x; stuckZ = owner.z; stuckT = 0; }
      else {
        stuckT += dt;
        if (stuckT > 2) { ownerMover.hasTarget = false; stuckT = 0; return true; }
        if (stuckT > 1 && stuckT - dt <= 1) setTarget(ownerMover, tx, tz, world.grid);
      }
    }
    if (!arrived && ownerMover.hasTarget && Math.hypot(tx - owner.x, tz - owner.z) < 0.3) { ownerMover.hasTarget = false; return true; }
    return arrived || !ownerMover.hasTarget;
  }
  const near = (a,b,r) => (a.x-b.x)**2 + (a.z-b.z)**2 < r*r;

  function staffFirstPurchaseAndReserve() {
    if (!policy.reserveEssentialStaff) return 0;
    const desk = world.stations.get('hire1'); if (!desk || !desk.active) return 0;
    const kind = nextEssentialStaff(G.staff); if (!kind) return 0;
    const cost = hireCost(kind, G.staff); if (cost == null) return 0;
    if (G.coins >= cost) {
      const before = G.coins, r = hire(G, kind);
      if (r.ok) {
        const spent = before - G.coins; ledger.record('spend', `hire:${kind}`, spent, { meta:{ policy:policy.id } });
        world.emit({ type:'purchase', kind:`hire:${kind}`, at:G.time });
        if (metrics.firstHireAt == null) metrics.firstHireAt = G.time;
      }
    }
    const next = nextEssentialStaff(G.staff); if (!next) return 0;
    const nextCost = hireCost(next, G.staff); return nextCost == null ? 0 : Math.min(G.coins, nextCost);
  }

  function chooseOwnerTarget() {
    const reserve = staffFirstPurchaseAndReserve();
    const real = G.coins;
    G.coins = Math.max(0, real - reserve);
    const before = G.coins;
    const target = decide(world, G);
    const purchaseSpent = Math.max(0, before - G.coins);
    G.coins = real - purchaseSpent;
    if (purchaseSpent) {
      ledger.record('spend', 'purchase:decision', purchaseSpent, { meta:{ policy:policy.id, targetKind:target?.kind || null } });
      if (metrics.firstHireAt == null && ((G.staff.cashier|0)+(G.staff.runner|0)+(G.staff.cleaner|0)) > 0) metrics.firstHireAt = G.time;
    }
    return { target, reserve:policy.reserveEssentialStaff ? staffFirstPurchaseAndReserve() : 0 };
  }

  function ownerStep(dt) {
    const choice = chooseOwnerTarget(), target = choice.target;
    if (!target) { metrics.idleSeconds += dt; ownerMover.hasTarget = false; lastKind = null; lastStationId = null; return; }
    metrics.activeSeconds += dt;
    if (target.kind !== lastKind || target.stationId !== lastStationId) {
      ownerMover.hasTarget = false; arrivedT = 0; lastKind = target.kind; lastStationId = target.stationId;
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
      case 'return': {
        const productKeys = G.carryKey ? Array.from({ length:G.carryCount }, () => G.carryKey) : [];
        feeWaste(productKeys, carry.fruit);
        returnAll(carry); G.carryKey=null; G.carryCount=0; return;
      }
      case 'refillPickup': if(!carry.sack)takeSack(carry,target.sackKind);return;
      case 'refillDrop': {const st=world.stations.get(target.stationId);if(!st||!carry.sack)return;if(carry.sack==='beans'){const used=Math.min(carry.sackLeft,Math.max(0,20-st.beans));refillBeans(world,st.id,used);useSack(carry,used);}else{const used=refillBowl(world,st.id,carry.sackLeft);useSack(carry,used);}return;}
      case 'harvest': {const st=world.stations.get(target.stationId);if(!st||st.stage!==3)return;carryAddFruit(carry,harvestBush(world,st.id),carryCap(G.up));return;}
      case 'blend': {const st=world.stations.get(target.stationId);if(!st||carry.fruit<=0)return;const n=stationAddFruit(world,st.id,carry.fruit);carry.fruit-=n;return;}
      case 'clean': {const st=world.stations.get(target.stationId);if(!st||!st.dirty)return;arrivedT+=dt;if(arrivedT>=1){cleanSeat(world,st.id);arrivedT=0;}return;}
      case 'cash': for(const id of world.checkouts){const amount=collectCash(world,id);if(amount>0){G.coins+=amount;ledger.record('collection',`register:${id}`,amount,{meta:{by:'owner'}});}}return;
      case 'build': {const spendable=Math.max(0,G.coins-choice.reserve);const r=payZone(world,target.zoneId,spendable,dt);if(r.spent>0){G.coins-=r.spent;ledger.record('spend',`build:${target.zoneId}`,r.spent,{meta:{zoneId:target.zoneId}});}return;}
    }
  }

  let daysToComplete = null, t = 0;
  while (G.dayState.day <= MAX_DAYS) {
    G.time=t; G.serviceStreak.t=Math.max(0,G.serviceStreak.t-DT);
    if(world.built.size!==cachedBuiltSize){cachedBuiltSize=world.built.size;interval=spawnInterval(world.built);maxC=maxCustomers(world.built);}
    const mult=spawnMult(G.dayState),effMax=maxC+capBonus(G.dayState)+Math.min(3,Math.floor(cafeLevel(G)/5));
    if(mult>0){spawnT-=DT;if(spawnT<=0&&customers.length<effMax){spawnT=interval/mult;spawnCustomer();}}

    stepOvens(world,DT);stepMachines(world,DT);ownerStep(DT);
    for(const id of world.checkouts){const co=world.stations.get(id);if(co.active&&near(owner,co.front,1.2))co.serving='owner';}
    syncStaff(); beginActorStep(world,customers,staffList,[]);
    stepCustomers(customers,world,price,DT);
    stepStaff(staffList,world,DT,amount=>{if(amount>0){G.coins+=amount;ledger.record('collection','register:staff',amount,{meta:{by:'cashier'}});}},G.staffLevels,customers);
    endActorStep(world);

    for(const e of world.events){
      const c=e.id!=null?customers.find(x=>x.id===e.id):null;
      if(e.type==='pay'){
        G.dayStats.served++;G.dayStats.earned+=e.amount;G.serviceStreak.count=G.serviceStreak.t>0?G.serviceStreak.count+1:1;G.serviceStreak.t=7;G.shiftBestStreak=Math.max(G.shiftBestStreak,G.serviceStreak.count);G.dayStats.bestStreak=G.shiftBestStreak;
        const order=c?.order||[];ledger.record('sale',`service:${order.length?order.join('+'):'unknown'}`,e.amount,{meta:{customerId:e.id,checkoutId:e.checkoutId||null}});recordRecipeOrder(G.meta,order);
        const r=waitRecords.get(e.id);if(c&&r&&!r.registerCharged&&r.registerStart!=null){const waited=Math.max(0,Number(r.registerStart)-Number(c.patience));if(waited>=SOFT_WAIT&&feeFriction('registerWait',frictionSeverity(waited,SOFT_WAIT,8))>0)r.registerCharged=true;}
      } else if(e.type==='settled'){
        const r=waitRecord(e.id);if(!r.substituteCharged){const stress=c&&Number.isFinite(Number(c.patience))?Math.max(0,PATIENCE-Number(c.patience)):SETTLE_WAIT;if(feeFriction('substitute',frictionSeverity(stress,SETTLE_WAIT,PATIENCE*0.75))>0)r.substituteCharged=true;}
      } else if(e.type==='lost'){
        G.dayStats.lost++;G.serviceStreak={count:0,t:0};G.dayStats.serviceMisses=(G.dayStats.serviceMisses|0)+1;feeRecovery(e.reason);
      }
    }
    observeFrictionAfterStep();
    customers=customers.filter(c=>!c.done);G.customers=customers;

    const dayEvents=stepDay(G.dayState,DT);
    for(const e of dayEvents){if(e.type!=='dayEnd')continue;
      for(const st of world.stations.values())if(st.type==='seat'&&st.dirty)cleanSeat(world,st.id);
      const completedDay=G.dayState.day,goal=G.goal,met=careerGoalMet(goal,G.dayStats);metrics.goalsTotal++;if(met)metrics.goalsMet++;
      if(met){G.coins+=goal.reward;ledger.record('bonus','contract',goal.reward,{meta:{day:completedDay}});}
      const outcomes=Math.max(1,G.dayStats.served+G.dayStats.lost),lostRate=G.dayStats.lost/outcomes;
      const rating=lostRate<=0.06&&(met||G.shiftBestStreak>=8)?3:lostRate<=0.16?2:1;recordCareerShift(G.meta,completedDay,G.dayStats,rating,met);
      const cup=awardWeeklyCup(G.meta,completedDay);if(cup.awarded){G.coins+=cup.reward;ledger.record('bonus','weekly-cup',cup.reward,{meta:{day:completedDay}});}
      const accounting=ledger.report(G.coins);if(!accounting.reconciled)ledgerMismatches.push({day:completedDay,...accounting});
      metrics.days.push({day:completedDay,sales:accounting.sale,collected:accounting.collection,bonus:accounting.bonus,spend:accounting.spend,deduction:accounting.deduction,wallet:G.coins,served:G.dayStats.served,lost:G.dayStats.lost,goal:careerGoalLabel(goal),goalMet:met,built:world.built.size});
      G.dayStats={served:0,lost:0,earned:0,serviceFees:0,serviceMisses:0,wasteFees:0,bestStreak:0};G.serviceStreak={count:0,t:0};G.shiftBestStreak=0;frictionUsed=0;
      nextDay(G.dayState);G.goal=chooseCareerGoal(G.dayState.day,G.meta);ledger=createLedger(null,{day:G.dayState.day,openingWallet:G.coins});
    }
    ensureStars(G,world);if(daysToComplete==null&&world.built.size>=AREA1.zones.length&&(G.stars.oven1||1)>=2&&(G.stars.dispCookie||1)>=2)daysToComplete=G.dayState.day;
    world.events.length=0;metrics.maxWallet=Math.max(metrics.maxWallet,G.coins);metrics.minWallet=Math.min(metrics.minWallet,G.coins);t+=DT;
  }

  const totals=metrics.days.reduce((a,d)=>({sales:a.sales+d.sales,collected:a.collected+d.collected,bonus:a.bonus+d.bonus,spend:a.spend+d.spend,deduction:a.deduction+d.deduction,served:a.served+d.served,lost:a.lost+d.lost}),{sales:0,collected:0,bonus:0,spend:0,deduction:0,served:0,lost:0});
  return {...metrics,...totals,finalWallet:G.coins,daysToComplete,builtZones:world.built.size,stars:{...G.stars},goalRate:metrics.goalsTotal?metrics.goalsMet/metrics.goalsTotal:0,spawnDraws:spawns.snapshot().rngDraws,ledgerMismatches,wallMs:Date.now()-wallStart};
}

function pairedPolicy(policy) {
  const current=runScenario(policy,FEE_VARIANTS.current),feeFree=runScenario(policy,FEE_VARIANTS.feeFree);
  return {policy:policy.id,current,feeFree,delta:feeRemovalRead(current,feeFree)};
}

export function runFeeRemovalExperiment() {
  const pairs=Object.values(FEE_EXPERIMENT_POLICIES).map(pairedPolicy);
  const largestSurplus=Math.max(...pairs.map(p=>p.delta.surplusShareOfSpend));
  const maxAcceleration=Math.max(...pairs.map(p=>p.delta.completionDelta));
  let read;
  if(largestSurplus<=0.10&&maxAcceleration<=1) read='No replacement sink is indicated by this model. Remove direct punishments in Task 23, then re-measure human play before adding any sink.';
  else if(largestSurplus<=0.25&&maxAcceleration<=1) read='Fee removal creates a modest surplus in at least one policy. Prefer tuning existing optional renovation/star sinks later; do not add a failure penalty.';
  else read='Fee removal materially increases retained wallet or progression speed in at least one policy. Do not replace it with punishment; quantify the surplus against existing optional late-game sinks after staffing/progression work.';
  return {pairs,read,largestSurplus,maxAcceleration};
}

function row(s){return `wallet ${s.finalWallet} | sales ${s.sales} | spend ${s.spend} | fees ${s.feesCharged} | lost ${s.lost} | stockout ${s.stockoutSeconds.toFixed(1)}s/${s.stockoutIncidents} | idle ${s.idleSeconds.toFixed(1)}s | goals ${(s.goalRate*100).toFixed(0)}% | room day ${s.daysToComplete??'n/a'} | first hire ${s.firstHireAt==null?'n/a':(s.firstHireAt/60).toFixed(1)+'m'}`;}

if(process.argv[1]&&process.argv[1].endsWith('fee-removal-experiment.js')){
  const report=runFeeRemovalExperiment();
  console.log('Pet Café — DIRECT FEE REMOVAL EXPERIMENT (15 deterministic shifts; no live tuning)');
  console.log('lost sales remain enabled in BOTH variants; only service/friction/return wallet deductions are toggled');
  console.log('slow = same priorities at 80% owner movement speed; staff-first = reserve for Cashier -> Runner -> Cleaner once Desk exists');
  for(const p of report.pairs){console.log(`\n--- ${p.policy} ---`);console.log('current : '+row(p.current));console.log('fee-free: '+row(p.feeFree));console.log(`delta   : wallet ${p.delta.walletDelta>=0?'+':''}${p.delta.walletDelta}; surplus/spend ${(p.delta.surplusShareOfSpend*100).toFixed(1)}%; room acceleration ${p.delta.completionDelta} day(s); fees avoided ${p.feeFree.feesWouldCharge}`);}
  console.log('\nREAD: '+report.read);
  console.log('FEE_REMOVAL_JSON '+JSON.stringify(report));
  let fail=false;for(const p of report.pairs){for(const s of [p.current,p.feeFree]){if(s.ledgerMismatches.length){console.error(`${p.policy}/${s.variant}: ledger mismatch`);fail=true;}if(s.spawnDraws!==p.current.spawnDraws){console.error(`${p.policy}: paired RNG draw mismatch`);fail=true;}}}
  if(fail)process.exitCode=1;
}
