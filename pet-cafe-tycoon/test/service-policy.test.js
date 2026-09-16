import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeServicePolicy,prepareServicePolicy,serviceIncident,recordOrdinaryServiceShift,reassureGuest} from '../src/sim/servicePolicy.js';
import {validateAndMigrateSave,applySave} from '../src/sim/save.js';
import {AREA1} from '../data/area1.js';
import {createWorld} from '../src/sim/world.js';
import {createCustomer,stepCustomers,PATIENCE,WAIT_SEAT_GRACE} from '../src/sim/customers.js';
function game(day=8){const G={coins:1000,dayState:{day},meta:{servicePolicy:normalizeServicePolicy({enabledFrom:8,notice:true})},dayStats:{earned:700,serviceFees:0},stats:{}};prepareServicePolicy(G);return G;}
test('old mature saves get a protected shift and early days never charge',()=>{
 const G=game(12);G.meta.servicePolicy=normalizeServicePolicy();assert.equal(prepareServicePolicy(G),false);assert.equal(G.meta.servicePolicy.enabledFrom,13);
 for(const day of [1,3,7]){const g=game(day);assert.equal(serviceIncident(g,{serviceVisitId:1,recoveryQuote:100},'register').fee,0);assert.equal(g.coins,1000);}
});
// Batch 6: the fee is unconditionally 0 -- the policy observes, it never charges. The wallet and
// shift-cap bounds this test used to pin down have nothing left to bound, so what it pins down now
// is the bookkeeping the charge used to ride on, which every caller still depends on: one incident
// per visit, that memory surviving a save/restore, the causes tally still moving, and the wallet
// standing perfectly still through all of it -- even for a player holding 2 coins.
test('incident is once per visit including after restore, and never takes a coin',()=>{
 const G=game(),c={serviceVisitId:1,recoveryQuote:24};
 const first=serviceIncident(G,c,'register');assert.equal(first.fee,0);assert.equal(first.duplicate,false);
 assert.equal(serviceIncident(G,c,'counter').duplicate,true);
 assert.equal(G.coins,1000);assert.equal(G.dayStats.serviceFees,0);
 const raw={coins:G.coins,built:[],dayState:{day:8,t:20},meta:G.meta,dayStats:G.dayStats,stats:G.stats};
 const save=validateAndMigrateSave(raw,AREA1);assert.equal(save.ok,true);const restored={};applySave(restored,save.data,AREA1);
 assert.equal(serviceIncident(restored,c,'register').duplicate,true);assert.equal(restored.coins,1000);
 for(let i=2;i<30;i++)serviceIncident(G,{serviceVisitId:i,recoveryQuote:200},'counter');
 assert.equal(G.meta.servicePolicy.spent,0);assert.equal(G.coins,1000);
 assert.equal(G.meta.servicePolicy.causes.counter,28);assert.equal(G.meta.servicePolicy.causes.register,1);
 const broke=game();broke.coins=2;assert.equal(serviceIncident(broke,c,'register').fee,0);assert.equal(broke.coins,2);
});
test('table incidents are still counted for paid and unpaid guests, and refund nothing',()=>{const G=game();assert.equal(serviceIncident(G,{serviceVisitId:1,paid:true,amount:31},'table').fee,0);assert.equal(serviceIncident(G,{serviceVisitId:2,paid:false,amount:31},'table').fee,0);assert.equal(G.coins,1000);assert.equal(G.meta.servicePolicy.causes.table,2);});
test('only ordinary product sales inform the next frozen baseline',()=>{const G=game();G.meta.socials={lastDay:8};recordOrdinaryServiceShift(G);assert.deepEqual(G.meta.servicePolicy.ordinary,[]);for(const day of [9,10,11]){G.dayState.day=day;G.dayStats.earned=1000;recordOrdinaryServiceShift(G);}G.dayState.day=12;prepareServicePolicy(G);assert.equal(G.meta.servicePolicy.baseline,1000);G.dayStats.earned=999999;prepareServicePolicy(G);assert.equal(G.meta.servicePolicy.baseline,1000);});
test('reassurance restores 20 percent once and cannot revive a departed visitor',()=>{const c={state:'atRegister',patience:5};assert.equal(reassureGuest(c,PATIENCE),true);assert.equal(c.patience,5+PATIENCE*.2);assert.equal(reassureGuest(c,PATIENCE),false);assert.equal(reassureGuest({state:'leave',patience:5},PATIENCE),false);});
// Batch 7: the grace is WAIT_SEAT_GRACE (12s) now, not the old mature-policy-only 8s, and it
// applies whenever dirty tables block seating (servicePolicyActive is left set here purely as
// documentation of the mature-policy scenario this test models — the waitSeat case itself no
// longer reads that flag at all, see src/sim/customers.js's proceedToSeatOrLeave).
test('dirty-table waiting gives twelve seconds to recover, with no clean-occupied penalty',()=>{
 const w=createWorld(AREA1,{built:['z_seats1']},42);w.servicePolicyActive=true;
 const seats=[...w.stations.values()].filter(s=>s.type==='seat'&&s.active);assert.ok(seats.length);for(const s of seats){s.dirty=true;s.occupied=false;}
 const c=createCustomer(1,'cat',0,AREA1);Object.assign(c,{state:'waitSeat',paid:true,amount:24,dirtyWait:0,wish:{product:'cookie',treat:false}});
 for(let i=0;i<11;i++)stepCustomers([c],w,()=>8,1);assert.equal(c.state,'waitSeat');assert.equal(w.events.some(e=>e.type==='tableRefund'),false);
 seats[0].dirty=false;stepCustomers([c],w,()=>8,.1);assert.equal(c.state,'toSeat');assert.equal(w.events.some(e=>e.type==='tableRefund'),false);
 for(const s of seats){s.dirty=true;s.occupied=false;}Object.assign(c,{state:'waitSeat',dirtyWait:0});stepCustomers([c],w,()=>8,WAIT_SEAT_GRACE+0.1);assert.equal(c.state,'leave');assert.equal(w.events.filter(e=>e.type==='tableRefund').length,1);
 w.events.length=0;for(const s of seats){s.dirty=false;s.occupied=true;}Object.assign(c,{state:'waitSeat',dirtyWait:0});stepCustomers([c],w,()=>8,WAIT_SEAT_GRACE+0.1);assert.equal(w.events.some(e=>e.type==='tableRefund'),false);
});
