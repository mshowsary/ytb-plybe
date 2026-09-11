import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { AREA1 } from '../data/area1.js';
import { stepBaristaState } from '../src/sim/baristaState.js';
function fixture(){
 const world=createWorld(AREA1,{built:['z_seats1','z_oven2','z_register2','z_hire','z_coffee']});
 return {world,s:{mover:{},x:0,z:0,state:'loading',idleT:0,workT:0,items:[],job:{sourceId:'coffee1',targetId:'barCoffee',product:'coffee',count:4}}};
}
test('shared loading consumes only remaining stock, then blocked delivery preserves carried cups',()=>{
 const {world,s}=fixture(),machine=world.stations.get('coffee1'),bar=world.stations.get('barCoffee');
 machine.stock=2;let taps=0,moved=0;const hooks={onTap:()=>taps++,onDelivery:()=>moved++};
 stepBaristaState(s,world,.05,hooks);assert.equal(machine.stock,0);assert.deepEqual(s.items,['coffee','coffee']);assert.equal(taps,1);
 bar.stock=bar.capacity;s.state='dropping';s.workT=0;stepBaristaState(s,world,.1,hooks);
 assert.equal(s.items.length,2);assert.equal(moved,0);
 bar.stock--;s.state='dropping';s.workT=0;stepBaristaState(s,world,.1,hooks);
 assert.equal(s.items.length,1);assert.equal(moved,1);assert.equal(bar.stock,bar.capacity);
});
test('shared worker recovers from removed destination without fabricating or losing inventory',()=>{
 const {world,s}=fixture();s.items=['coffee'];s.state='toBar';world.stations.get('barCoffee').active=false;
 stepBaristaState(s,world,.05);assert.equal(s.state,'idle');assert.deepEqual(s.items,['coffee']);
});
