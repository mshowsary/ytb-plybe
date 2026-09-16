// Observational metrics only. Guest-seconds may exceed elapsed wall time.
export function createRecoveryMetrics() {
 const phases={}, purchases=[], idleIntervals=[], usefulActions={}; let idleStart=null;
 const phaseRow=phase=>phases[phase] ||= {ownerTravel:0,ownerAtTask:0,ownerIdle:0,deliveryWait:0,productionWait:0,refillWait:0,unknownStockWait:0};
 return {
  owner(phase,time,dt,kind,moving){
   phaseRow(phase)[!kind?'ownerIdle':moving?'ownerTravel':'ownerAtTask']+=dt;
   if(!kind && idleStart===null)idleStart=time;
   if(kind && idleStart!==null){idleIntervals.push({start:idleStart,seconds:time-idleStart});idleStart=null;}
  },
  useful(kind,amount=1){if(amount>0)usefulActions[kind]=(usefulActions[kind]||0)+amount;},
  stock(phase,world,display,dt){
   const source=[...world.stations.values()].find(s=>s.active && ['oven','coffee','blender'].includes(s.type) && (s.product || (s.type==='blender'?'smoothie':null))===display.product);
   const cause=!source?'unknownStockWait':source.stock>0?'deliveryWait':
    (source.type==='coffee' && source.beans<=0)||(source.type==='blender' && source.fruit<=0)?'refillWait':'productionWait';
   phaseRow(phase)[cause]+=dt;
  },
  purchase(time,kind){purchases.push({time,kind,interval: purchases.length?time-purchases.at(-1).time:null});},
  report(time){return {phases,usefulActions,purchases,idleIntervals:[...idleIntervals,...(idleStart===null?[]:[{start:idleStart,seconds:time-idleStart}])],units:{owner:'seconds',stock:'guest-seconds',purchase:'completed purchase/build events; partial payments excluded',useful:'items, refills, clean actions and build coins; not seconds'}};}
 };
}
