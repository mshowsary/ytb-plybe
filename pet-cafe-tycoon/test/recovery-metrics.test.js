import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryMetrics} from '../tools/recovery-metrics.js';
test('recovery metrics separate owner time, completed purchases and guest waiting causes',()=>{
 const m=createRecoveryMetrics();m.owner('rush',0,2,null,false);m.owner('rush',2,1,'drop',true);m.owner('rush',3,1,'drop',false);
 m.purchase(4,'hire');m.purchase(9,'build');m.useful('deliveredItems',3);
 const world={stations:new Map([['b',{active:true,type:'blender',stock:0,fruit:0}]])};
 m.stock('rush',world,{product:'smoothie'},2);world.stations.get('b').fruit=1;m.stock('rush',world,{product:'smoothie'},3);world.stations.get('b').stock=2;m.stock('rush',world,{product:'smoothie'},4);
 const r=m.report(10);assert.equal(r.phases.rush.refillWait,2);assert.equal(r.phases.rush.productionWait,3);assert.equal(r.phases.rush.deliveryWait,4);
 assert.equal(r.phases.rush.ownerTravel+r.phases.rush.ownerAtTask+r.phases.rush.ownerIdle,4);
 assert.deepEqual(r.idleIntervals,[{start:0,seconds:2}]);assert.equal(r.purchases[1].interval,5);assert.equal(r.usefulActions.deliveredItems,3);
});
