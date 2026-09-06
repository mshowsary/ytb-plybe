import fs from 'node:fs';
import {runScenario} from './staffing-progression-experiment-v4.js';
import {makeStaffingVariant,STAFFING_POLICIES} from '../src/sim/staffingExperiment.js';
const variant=makeStaffingVariant({earlyDesk:true,deskCost:300,firstHireKind:'runner',firstHireCost:150});
const runs=[];
for(const policy of Object.values(STAFFING_POLICIES))for(const seed of [1337,1438,1548])for(const scale of [1,1.1]){
 const result=runScenario(variant,policy,seed,{capacityContracts:true,rushIntervalScale:scale});
 runs.push({...result,rushIntervalScale:scale});
}
const summary=[];
for(const policy of Object.values(STAFFING_POLICIES))for(const scale of [1,1.1]){
 const rows=runs.filter(r=>r.policy===policy.id&&r.rushIntervalScale===scale);const mean=f=>rows.reduce((n,r)=>n+f(r),0)/rows.length;
 const median=values=>{const a=values.slice().sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
 const purchaseIntervalMedian=median(rows.flatMap(r=>r.recovery.purchases.map(p=>p.interval).filter(Number.isFinite)));
 const idleIntervalMedian=median(rows.flatMap(r=>r.recovery.idleIntervals.map(x=>x.seconds)));
 const usefulActions={};for(const key of new Set(rows.flatMap(r=>Object.keys(r.recovery.usefulActions))))usefulActions[key]=mean(r=>r.recovery.usefulActions[key]||0);
 const phases={};for(const phase of ['morning','rush','afternoon','closing']){
  phases[phase]={};for(const key of Object.keys(rows[0].recovery.phases[phase]))phases[phase][key]=mean(r=>r.recovery.phases[phase][key]);
 }
 summary.push({policy:policy.id,rushIntervalScale:scale,served:mean(r=>r.served),lost:mean(r=>r.lost),wallet:mean(r=>r.finalWallet),firstHireMinutes:mean(r=>r.firstHireMinutes),purchaseIntervalMedian,idleIntervalMedian,meanLongestIdle:mean(r=>Math.max(0,...r.recovery.idleIntervals.map(x=>x.seconds))),usefulActions,stockoutGuestSeconds:mean(r=>r.stockoutSeconds),idleSeconds:mean(r=>r.idleSeconds),phases});
}
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/task28-recovery.json',JSON.stringify({runs,summary},null,2));
fs.writeFileSync('docs/task28-recovery-evidence.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary.map(({phases,...row})=>row),null,2));
if(runs.some(r=>r.ledgerMismatches.length))throw new Error('recovery experiment ledger mismatch');
