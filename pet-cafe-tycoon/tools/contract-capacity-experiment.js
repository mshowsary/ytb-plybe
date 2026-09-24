// Task 27 paired live-simulation experiment; no browser/publisher certification implied.
import fs from 'node:fs';
import { runScenario } from './staffing-progression-experiment-v4.js';
import { makeStaffingVariant, STAFFING_POLICIES } from '../src/sim/staffingExperiment.js';
const variant=makeStaffingVariant({earlyDesk:true,deskCost:300,firstHireKind:'runner',firstHireCost:150});
const seeds=[1337,1438,1548,1777,1999];
const runs=[];
for(const policy of Object.values(STAFFING_POLICIES))for(const seed of seeds){
 for(const capacityContracts of [false,true])runs.push({...runScenario(variant,policy,seed,{capacityContracts}),capacityContracts});
}
const summary=[];
for(const policy of Object.values(STAFFING_POLICIES))for(const candidate of [false,true]){
 const rows=runs.filter(r=>r.policy===policy.id && r.capacityContracts===candidate);
 const learned=rows.flatMap(r=>r.dayRows.filter(d=>d.day>2));
 summary.push({policy:policy.id,candidate,successAfterLearning:learned.filter(d=>d.goalMet).length/learned.length,firstShiftServed:rows.map(r=>r.dayRows[0].served),ledgerMismatches:rows.reduce((n,r)=>n+r.ledgerMismatches.length,0)});
}
const report={seeds,shifts:12,learningShiftsExcluded:2,summary,runs};
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/task27-contracts.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(summary,null,2));
if(summary.some(r=>r.ledgerMismatches))process.exitCode=1;
