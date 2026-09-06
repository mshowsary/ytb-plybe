// Task 24 v4 — experiment only. Uses the proven bot orchestration but changes no live economy.
// Policy correction: "staff-first" keeps normal construction/chores before the Desk, then reserves
// only for the first meaningful worker. No artificial pre-Desk steering.
import {
  createWorld, activeZones, payZone, stepOvens, stepMachines, takeFromOven, takeFromMachine,
  putOnDisplay, collectCash, refillBeans, refillBowl, harvestBush, addFruit as stationAddFruit, cleanSeat,
} from '../src/sim/world.js';
import { createCustomer, stepCustomers } from '../src/sim/customers.js';
import { createCustomerSpawnSequence, CUSTOMER_SPAWN_SEED } from '../src/sim/customerSpawn.js';
import { createStaff, stepStaff } from '../src/sim/staff.js';
import { createMover, setTarget, stepMover } from '../src/sim/mover.js';
import { beginActorStep, endActorStep } from '../src/sim/actorRoster.js';
import { salePrice, playerSpeed, carryCap, cafeLevel, ensureStars } from '../src/sim/economy.js';
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
const totalStaff = s => (s.runner|0) + (s.cashier|0) + (s.cleaner|0);
const firstKind = v => v.firstHireKind || (v.earlyDesk ? 'runner' : 'cashier');
const deskCost = v => v.deskCost == null ? 480 : v.deskCost;
const mean = (rows, fn) => rows.length ? rows.reduce((a,r)=>a+fn(r),0)/rows.length : 0;
const pct = n => `${(100*n).toFixed(1)}%`;
function median(values) {
  const a = values.filter(Number.isFinite).sort((x,y)=>x-y);
  if (!a.length) return null;
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
}

function runScenario(variant, policy, seed) {
  const wallStart = Date.now();
  const area = areaForStaffingVariant(variant);
  const world = createWorld(area, null, seed);
  const G = {
    coins:0, up:{speed:0,carry:0,income:0}, staff:{runner:0,cashier:0,cleaner:0},
    staffLevels:{runner:{speed:0,carry:0},cashier:{speed:0},cleaner:{speed:0}},
    machineLevels:{oven:0,coffee:0,display:0}, boosts:{}, time:0, world,
    meta:{reputation:0,career:{}}, serviceStreak:{count:0,t:0}, shiftBestStreak:0,
    dayState:createDay(), stars:{}, dayStats:{served:0,lost:0,earned:0,bestStreak:0},
  };
  ensureCareer(G.meta); G.goal = chooseCareerGoal(1,G.meta);
  world.dayState = G.dayState; world.stars = G.stars;
  let ledger = createLedger(null,{day:1,openingWallet:0});
  const ledgerMismatches = [];
  const spawns = createCustomerSpawnSequence(seed);
  const price = (key,seated) => Math.round(
    salePrice(key,G.up,G.boosts,seated,0,tipMult(G.dayState))*masteryMultiplier(G.meta,key),
  );

  let customers = [], staffList = []; G.customers = customers;
  const carry = createCarry(); G.carry = carry; G.carryKey = null; G.carryCount = 0;
  let spawnT=2, interval=7.5, baseMaxC=4, demandKey='';
  let firstHireAt=null, firstHireKind=null, cupcakeBuiltAt=null, deskBuiltAt=null, coreCompleteAt=null;
  let stockoutSeconds=0, stockoutIncidents=0, idleSeconds=0, activeSeconds=0;
  const stockoutActive = new Set(), dayRows = [], purchases = {};
  const spend = {build:0,manualHire:0,decision:0};

  function spawnCustomer(){const n=spawns.next();const c=createCustomer(n.id,n.species,n.variant,area);c.petVariant=n.petVariant;customers.push(c);}
  function syncStaff(){
    const c={runner:0,cashier:0,cleaner:0}; for(const s of staffList)if(c[s.kind]!=null)c[s.kind]++;
    while(c.runner<(G.staff.runner|0)){staffList.push(createStaff('runner',RUNNER_SPAWN));c.runner++;}
    while(c.cashier<(G.staff.cashier|0)){const co=world.stations.get('register1');staffList.push(createStaff('cashier',co?co.cash:CASHIER_FALLBACK));c.cashier++;}
    while(c.cleaner<(G.staff.cleaner|0)){staffList.push(createStaff('cleaner',CLEANER_SPAWN));c.cleaner++;}
  }
  function noteFirstHire(before){
    if(firstHireAt!=null||totalStaff(G.staff)<=totalStaff(before))return;
    firstHireAt=G.time; firstHireKind=['runner','cashier','cleaner'].find(k=>(G.staff[k]|0)>(before[k]|0))||'staff';
  }
  function manualHire(kind){
    const cost=staffingHireCost(variant,kind,G.staff); if(cost==null||G.coins<cost)return false;
    const before={...G.staff}; G.coins-=cost; G.staff[kind]=(G.staff[kind]|0)+1;
    ledger.record('spend',`hire:${kind}`,cost,{meta:{variant:variant.id,policy:policy.id}}); spend.manualHire+=cost;
    world.emit({type:'purchase',kind:`hire:${kind}`,at:G.time}); noteFirstHire(before); return true;
  }
  function maybeFirstHire(){
    if(totalStaff(G.staff)!==0)return false;
    const desk=world.stations.get('hire1'); if(!desk||!desk.active)return false;
    // Candidate needs a manual first Runner because botDecide intentionally retains live hire order.
    // Current/staff-first uses the same manual boundary for a fair one-hire reservation comparison.
    if(variant.earlyDesk||policy.staffFirst)return manualHire(firstKind(variant));
    return false;
  }
  function reserve(){
    if(!policy.staffFirst||totalStaff(G.staff)!==0)return 0;
    const desk=world.stations.get('hire1'); if(!desk||!desk.active)return 0;
    const cost=staffingHireCost(variant,firstKind(variant),G.staff);
    return cost==null?0:Math.min(G.coins,cost);
  }

  const owner={x:0,z:2.5,rot:0}; G.P=owner;
  const ownerMover=createMover(owner.x,owner.z,0.35,playerSpeed(G.up));
  let stuckX=owner.x,stuckZ=owner.z,stuckT=0,arrivedT=0,lastKind=null,lastStationId=null,lastZoneId=null;
  const near=(a,b,r)=>(a.x-b.x)**2+(a.z-b.z)**2<r*r;
  function walk(tx,tz){
    ownerMover.speed=playerSpeed(G.up)*policy.ownerSpeedScale;
    if(!ownerMover.hasTarget||ownerMover.tx!==tx||ownerMover.tz!==tz){ownerMover.x=owner.x;ownerMover.z=owner.z;setTarget(ownerMover,tx,tz,world.grid);stuckX=owner.x;stuckZ=owner.z;stuckT=0;}
    const arrived=stepMover(ownerMover,world.grid,[],DT); owner.x=ownerMover.x;owner.z=ownerMover.z;owner.rot=ownerMover.rot;
    if(!arrived&&ownerMover.hasTarget){
      if(Math.hypot(owner.x-stuckX,owner.z-stuckZ)>0.02){stuckX=owner.x;stuckZ=owner.z;stuckT=0;}
      else{stuckT+=DT;if(stuckT>2){ownerMover.hasTarget=false;stuckT=0;return true;}if(stuckT>1&&stuckT-DT<=1)setTarget(ownerMover,tx,tz,world.grid);}
    }
    if(!arrived&&ownerMover.hasTarget&&Math.hypot(tx-owner.x,tz-owner.z)<0.3){ownerMover.hasTarget=false;return true;}
    return arrived||!ownerMover.hasTarget;
  }

  function chooseTarget(){
    maybeFirstHire();
    const hold=reserve(), real=G.coins, staffBefore={...G.staff};
    // This is the entire staff-first policy: after Desk unlock, hide reserved first-hire money from
    // ordinary purchase arbitration. Before Desk unlock, execution is identical to balanced play.
    G.coins=Math.max(0,real-hold); const beforeCoins=G.coins;
    const target=decide(world,G);
    const spent=Math.max(0,beforeCoins-G.coins); G.coins=real-spent;
    if(spent){ledger.record('spend','purchase:decision',spent,{meta:{variant:variant.id,policy:policy.id,targetKind:target?.kind||null}});spend.decision+=spent;noteFirstHire(staffBefore);}
    return {target,hold:reserve()};
  }

  function ownerStep(){
    const {target,hold}=chooseTarget();
    if(!target){idleSeconds+=DT;ownerMover.hasTarget=false;lastKind=lastStationId=lastZoneId=null;return;}
    activeSeconds+=DT;
    const stationId=target.stationId||null,zoneId=target.zoneId||null;
    if(target.kind!==lastKind||stationId!==lastStationId||zoneId!==lastZoneId){ownerMover.hasTarget=false;arrivedT=0;lastKind=target.kind;lastStationId=stationId;lastZoneId=zoneId;}
    if(!walk(target.x,target.z))return;
    switch(target.kind){
      case'register':return;
      case'fetch':{const st=world.stations.get(target.stationId);if(!st||!st.active||st.stock<=0||(G.carryKey&&G.carryKey!==target.product))return;const cap=carryCap(G.up);arrivedT+=DT;while(arrivedT>=.35&&st.stock>0&&G.carryCount<cap){arrivedT-=.35;const n=(st.type==='oven'?takeFromOven:takeFromMachine)(world,st.id,1);if(n>0){G.carryKey=target.product;G.carryCount++;}}return;}
      case'drop':{const st=world.stations.get(target.stationId);if(!st||!G.carryKey)return;arrivedT+=DT;while(arrivedT>=.15&&G.carryCount>0&&st.stock<st.capacity){arrivedT-=.15;const n=putOnDisplay(world,st.id,G.carryKey,1);if(n<=0)break;G.carryCount--;if(!G.carryCount)G.carryKey=null;}return;}
      case'return':returnAll(carry);G.carryKey=null;G.carryCount=0;return;
      case'refillPickup':if(!carry.sack)takeSack(carry,target.sackKind);return;
      case'refillDrop':{const st=world.stations.get(target.stationId);if(!st||!carry.sack)return;if(carry.sack==='beans'){const n=Math.min(carry.sackLeft,Math.max(0,20-st.beans));refillBeans(world,st.id,n);useSack(carry,n);}else{const n=refillBowl(world,st.id,carry.sackLeft);useSack(carry,n);}return;}
      case'harvest':{const st=world.stations.get(target.stationId);if(st&&st.stage===3)carryAddFruit(carry,harvestBush(world,st.id),carryCap(G.up));return;}
      case'blend':{const st=world.stations.get(target.stationId);if(st&&carry.fruit>0)carry.fruit-=stationAddFruit(world,st.id,carry.fruit);return;}
      case'clean':{const st=world.stations.get(target.stationId);if(!st||!st.dirty)return;arrivedT+=DT;if(arrivedT>=1){cleanSeat(world,st.id);arrivedT=0;}return;}
      case'cash':for(const id of world.checkouts){const n=collectCash(world,id);if(n>0){G.coins+=n;ledger.record('collection',`register:${id}`,n,{meta:{checkoutId:id}});}}return;
      case'build':{const available=Math.max(0,G.coins-hold);if(!available)return;const r=payZone(world,target.zoneId,available,DT);if(r.spent>0){G.coins-=r.spent;spend.build+=r.spent;ledger.record('spend',`build:${target.zoneId}`,r.spent,{meta:{zoneId:target.zoneId}});}return;}
    }
  }

  function observeStockouts(){
    const alive=new Set();for(const c of customers){if(!c||c.done)continue;alive.add(c.id);const d=c.counterId&&world.stations.get(c.counterId);const out=c.state==='queue'&&c.mood==='wait'&&d&&d.active&&d.stock<=0;if(out){stockoutSeconds+=DT;if(!stockoutActive.has(c.id)){stockoutActive.add(c.id);stockoutIncidents++;}}else stockoutActive.delete(c.id);}for(const id of [...stockoutActive])if(!alive.has(id))stockoutActive.delete(id);
  }
  const coreIds=area.zones.filter(z=>!(variant.earlyDesk&&z.id==='z_register2')).map(z=>z.id);
  let t=0;
  while(G.dayState.day<=MAX_DAYS){
    G.time=t;G.serviceStreak.t=Math.max(0,G.serviceStreak.t-DT);
    const d=staffingDemand(variant,world.built,G.staff),key=`${d.interval}:${d.maxCustomers}`;if(key!==demandKey){demandKey=key;interval=d.interval;baseMaxC=d.maxCustomers;}
    const mult=spawnMult(G.dayState),effMaxC=baseMaxC+capBonus(G.dayState)+Math.min(3,Math.floor(cafeLevel(G)/5));
    if(mult>0){spawnT-=DT;if(spawnT<=0&&customers.length<effMaxC){spawnT=interval/mult;spawnCustomer();}}
    stepOvens(world,DT);stepMachines(world,DT);ownerStep();
    for(const id of world.checkouts){const co=world.stations.get(id);if(co.active&&near(owner,co.front,1.2))co.serving='owner';}
    syncStaff();beginActorStep(world,customers,staffList);stepCustomers(customers,world,price,DT);
    stepStaff(staffList,world,DT,n=>{if(n>0){G.coins+=n;ledger.record('collection','register:staff',n,{meta:{by:'cashier'}});}},G.staffLevels,customers);endActorStep(world);observeStockouts();
    for(const e of world.events){
      if(e.type==='pay'){G.dayStats.served++;G.dayStats.earned+=e.amount;G.serviceStreak.count=G.serviceStreak.t>0?G.serviceStreak.count+1:1;G.serviceStreak.t=7;G.shiftBestStreak=Math.max(G.shiftBestStreak,G.serviceStreak.count);G.dayStats.bestStreak=G.shiftBestStreak;const c=customers.find(x=>x.id===e.id),order=c?.order||[];ledger.record('sale',`service:${order.length?order.join('+'):'unknown'}`,e.amount,{meta:{customerId:e.id,checkoutId:e.checkoutId||null}});recordRecipeOrder(G.meta,order);}
      else if(e.type==='lost'){G.dayStats.lost++;G.serviceStreak={count:0,t:0};}
      else if(e.type==='purchase')purchases[e.kind]=(purchases[e.kind]||0)+1;
      else if(e.type==='built'){if(e.zoneId==='z_oven2'&&cupcakeBuiltAt==null)cupcakeBuiltAt=t;if(e.zoneId==='z_hire'&&deskBuiltAt==null)deskBuiltAt=t;}
    }
    customers=customers.filter(c=>!c.done);G.customers=customers;
    for(const e of stepDay(G.dayState,DT)){if(e.type!=='dayEnd')continue;for(const st of world.stations.values())if(st.type==='seat'&&st.dirty)cleanSeat(world,st.id);const day=G.dayState.day,goal=G.goal,met=careerGoalMet(goal,G.dayStats);if(met){G.coins+=goal.reward;ledger.record('bonus','contract',goal.reward,{meta:{day}});}const outcomes=Math.max(1,G.dayStats.served+G.dayStats.lost),lostRate=G.dayStats.lost/outcomes,rating=lostRate<=.06&&(met||G.shiftBestStreak>=8)?3:lostRate<=.16?2:1;recordCareerShift(G.meta,day,G.dayStats,rating,met);const cup=awardWeeklyCup(G.meta,day);if(cup.awarded){G.coins+=cup.reward;ledger.record('bonus','weekly-cup',cup.reward,{meta:{day}});}const a=ledger.report(G.coins);if(!a.reconciled)ledgerMismatches.push({day,...a});dayRows.push({day,served:G.dayStats.served,lost:G.dayStats.lost,goalMet:met,wallet:G.coins,sales:a.sale,spend:a.spend});G.dayStats={served:0,lost:0,earned:0,bestStreak:0};G.serviceStreak={count:0,t:0};G.shiftBestStreak=0;nextDay(G.dayState);G.goal=chooseCareerGoal(G.dayState.day,G.meta);ledger.reset(G.dayState.day,G.coins);}
    ensureStars(G,world);if(coreCompleteAt==null&&coreIds.every(id=>world.built.has(id)))coreCompleteAt=t;world.events.length=0;t+=DT;
  }
  const served=dayRows.reduce((s,r)=>s+r.served,0),lost=dayRows.reduce((s,r)=>s+r.lost,0),goals=dayRows.filter(r=>r.goalMet).length;
  return {variant:variant.id,policy:policy.id,seed,firstHireMinutes:firstHireAt==null?null:firstHireAt/60,firstHireKind,cupcakeBuiltMinutes:cupcakeBuiltAt==null?null:cupcakeBuiltAt/60,deskBuiltMinutes:deskBuiltAt==null?null:deskBuiltAt/60,entryCost:firstHireEntryCost(variant),coreCompleteMinutes:coreCompleteAt==null?null:coreCompleteAt/60,served,lost,lostRate:lost/Math.max(1,served+lost),goalRate:goals/Math.max(1,dayRows.length),stockoutSeconds,stockoutIncidents,idleSeconds,activeSeconds,finalWallet:Math.round(G.coins),spend:{...spend,total:spend.build+spend.manualHire+spend.decision},purchases,ledgerMismatches,spawnDraws:spawns.snapshot().rngDraws,days:dayRows.length,wallMs:Date.now()-wallStart};
}

function summary(rows){return{runs:rows.length,firstHireMedian:median(rows.map(r=>r.firstHireMinutes)),deskBuiltMedian:median(rows.map(r=>r.deskBuiltMinutes)),coreCompleteMedian:median(rows.map(r=>r.coreCompleteMinutes)),lostRate:mean(rows,r=>r.lostRate),goalRate:mean(rows,r=>r.goalRate),stockoutSeconds:mean(rows,r=>r.stockoutSeconds),idleSeconds:mean(rows,r=>r.idleSeconds),finalWallet:mean(rows,r=>r.finalWallet),spend:mean(rows,r=>r.spend.total),served:mean(rows,r=>r.served)};}
function evaluate(variant,rows,current){
  const s=summary(rows),sf=rows.filter(r=>r.policy==='staff-first'),staffFirstMedian=median(sf.map(r=>r.firstHireMinutes));
  const firstKindOk=sf.every(r=>r.firstHireKind===firstKind(variant));
  const lostDelta=s.lostRate-current.lostRate,stockoutDelta=s.stockoutSeconds-current.stockoutSeconds,completionDelta=(s.coreCompleteMedian??99)-(current.coreCompleteMedian??99),goalDelta=s.goalRate-current.goalRate;
  const valid=rows.every(r=>!r.ledgerMismatches.length&&r.coreCompleteMinutes!=null&&r.served>0);
  const qualifies=valid&&firstKindOk&&staffFirstMedian!=null&&staffFirstMedian>=6&&staffFirstMedian<=10&&lostDelta<=.03&&stockoutDelta<=120&&completionDelta<=4&&goalDelta>=-.10;
  const score=(staffFirstMedian==null?100:Math.abs(staffFirstMedian-8))+Math.max(0,lostDelta)*40+Math.max(0,stockoutDelta)/300+Math.max(0,completionDelta)/2+Math.max(0,-goalDelta)*10;
  return{variant:variant.id,firstHireKind:firstKind(variant),deskCost:deskCost(variant),firstHireCost:variant.firstHireCost,summary:s,staffFirstMedian,firstKindOk,lostDelta,stockoutDelta,completionDelta,goalDelta,valid,qualifies,score};
}

export function runStaffingProgressionExperiment(){
  const sanity=runScenario(CURRENT_STAFFING_VARIANT,STAFFING_POLICIES.balanced,SEEDS[0]);
  if(sanity.served<20||sanity.spend.build<=0||sanity.lostRate>=.8)throw new Error(`Task24 baseline invalid: served=${sanity.served}, build=${sanity.spend.build}, lost=${sanity.lostRate}`);
  const sweep=STAFFING_CANDIDATES.map(variant=>{const run=runScenario(variant,STAFFING_POLICIES.staffFirst,SEEDS[0]);const dist=run.firstHireMinutes==null?Infinity:Math.abs(run.firstHireMinutes-8);return{variant,run,dist,inWindow:run.firstHireMinutes!=null&&run.firstHireMinutes>=6&&run.firstHireMinutes<=10};});
  if(sweep.some(x=>x.run.ledgerMismatches.length))throw new Error('Task24 sweep ledger mismatch');
  const ranked=sweep.slice().sort((a,b)=>a.inWindow!==b.inWindow?(a.inWindow?-1:1):(a.inWindow?(a.run.lostRate-b.run.lostRate||a.run.stockoutSeconds-b.run.stockoutSeconds||a.dist-b.dist):(a.dist-b.dist||a.run.lostRate-b.run.lostRate)));
  const shortlist=ranked.slice(0,Math.min(3,ranked.length)).map(x=>x.variant);
  const currentRuns=[];for(const p of Object.values(STAFFING_POLICIES))for(const seed of SEEDS)currentRuns.push(runScenario(CURRENT_STAFFING_VARIANT,p,seed));
  const current=summary(currentRuns),candidateRuns=[],evaluations=[];
  for(const variant of shortlist){const rows=[];for(const p of Object.values(STAFFING_POLICIES))for(const seed of SEEDS){const run=runScenario(variant,p,seed);rows.push(run);candidateRuns.push(run);}evaluations.push(evaluate(variant,rows,current));}
  evaluations.sort((a,b)=>(Number(b.qualifies)-Number(a.qualifies))||a.score-b.score);
  const best=evaluations[0],selected=STAFFING_CANDIDATES.find(v=>v.id===best.variant),selectedRuns=candidateRuns.filter(r=>r.variant===best.variant),allRuns=[...currentRuns,...candidateRuns];
  if(allRuns.some(r=>r.ledgerMismatches.length))throw new Error('Task24 robustness ledger mismatch');
  return{sanity,sweep:sweep.map(x=>({variant:x.variant.id,firstHireKind:firstKind(x.variant),deskCost:deskCost(x.variant),firstHireCost:x.variant.firstHireCost,cupcakeBuiltMinutes:x.run.cupcakeBuiltMinutes,deskBuiltMinutes:x.run.deskBuiltMinutes,firstHireMinutes:x.run.firstHireMinutes,coreCompleteMinutes:x.run.coreCompleteMinutes,lostRate:x.run.lostRate,stockoutSeconds:x.run.stockoutSeconds,entryCost:x.run.entryCost,inWindow:x.inWindow})),shortlist:shortlist.map(v=>v.id),evaluations,selected:selected.id,selectedFirstHireKind:firstKind(selected),selectedDeskCost:deskCost(selected),selectedCost:selected.firstHireCost,current,candidate:summary(selectedRuns),qualifies:best.qualifies,staffFirstMedian:best.staffFirstMedian,lostDelta:best.lostDelta,stockoutDelta:best.stockoutDelta,completionDelta:best.completionDelta,goalDelta:best.goalDelta,downside:best.lostDelta>.005?`lost-sale rate +${(100*best.lostDelta).toFixed(1)}pp`:best.stockoutDelta>60?`stockout exposure +${best.stockoutDelta.toFixed(0)}s/run`:best.goalDelta<-.03?`goal completion ${(100*-best.goalDelta).toFixed(1)}pp lower`:best.summary.finalWallet<current.finalWallet?`ending wallet ${Math.round(current.finalWallet-best.summary.finalWallet)} lower on average`:'no material measured service downside versus current arm',runs:allRuns};
}

if(process.argv[1]&&process.argv[1].endsWith('staffing-progression-experiment-v4.js')){
  const r=runStaffingProgressionExperiment();
  console.log('Pet Café — TASK 24 EARLY-RUNNER PROGRESSION EXPERIMENT v4');
  console.log(`SANITY current/balanced: served ${r.sanity.served}, lost ${pct(r.sanity.lostRate)}, build ${r.sanity.spend.build}, core ${r.sanity.coreCompleteMinutes?.toFixed(1)??'n/a'}m`);
  console.log('--- staff-first sweep ---');
  for(const x of r.sweep)console.log(`${x.variant.padEnd(24)} entry ${String(x.entryCost.total).padEnd(5)} | desk ${x.deskBuiltMinutes?.toFixed(1)??'n/a'}m | hire ${x.firstHireMinutes?.toFixed(1)??'never'}m | lost ${pct(x.lostRate)} | stockout ${x.stockoutSeconds.toFixed(0)}s ${x.inWindow?'TARGET':''}`);
  console.log(`SHORTLIST: ${r.shortlist.join(', ')}`);
  for(const e of r.evaluations)console.log(`ROBUST ${e.variant}: ${e.firstHireKind} ${e.staffFirstMedian?.toFixed(1)??'n/a'}m | lost Δ ${(100*e.lostDelta).toFixed(1)}pp | stockout Δ ${e.stockoutDelta.toFixed(0)}s | core Δ ${e.completionDelta.toFixed(1)}m | goals Δ ${(100*e.goalDelta).toFixed(1)}pp | ${e.qualifies?'QUALIFIES':'reject'}`);
  console.log(`CANDIDATE: ${r.qualifies?r.selected:'NONE SUPPORTED YET'}`);
  console.log(`DOWNSIDE: ${r.downside}`);
  console.log(`COST LEDGER: current ${firstHireEntryCost(CURRENT_STAFFING_VARIANT).total}; selected ${firstHireEntryCost(STAFFING_CANDIDATES.find(v=>v.id===r.selected)).total}; Desk ${r.selectedDeskCost}; first ${r.selectedFirstHireKind} ${r.selectedCost}`);
  console.log('TASK24_STAFFING_JSON '+JSON.stringify(r));
}
