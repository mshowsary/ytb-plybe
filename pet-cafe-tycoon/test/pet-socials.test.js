import test from 'node:test';
import assert from 'node:assert/strict';
import { SOCIALS,normalizeSocials,startSocial,tickSocial,recordSocialSale,claimSocial,availableSocials } from '../src/sim/petSocials.js';
import { applySave,validateAndMigrateSave } from '../src/sim/save.js';
import { AREA1 } from '../data/area1.js';
test('social admission respects unlock, day, preparation window and one per shift',()=>{
 const s=normalizeSocials();
 assert.equal(startSocial(s,'cat',1,7,20,SOCIALS),false);
 assert.equal(startSocial(s,'cat',1,8,141,SOCIALS),false);
 assert.equal(startSocial(s,'cat',1,8,20,[]),false);
 assert.equal(startSocial(s,'cat',1,8,20,SOCIALS),true);
 assert.equal(startSocial(s,'dog',1,8,20,SOCIALS),false);
 assert.equal(tickSocial(s,8,110),true);
 assert.equal(startSocial(s,'dog',1,8,115,SOCIALS),false);
 assert.equal(startSocial(s,'dog',2,9,15,SOCIALS),true);
});
test('only featured products count; completed prize persists and pays once',()=>{
 const s=normalizeSocials();startSocial(s,'cat',2,8,20,SOCIALS);
 recordSocialSale(s,['cupcake','cookie'],8,30);assert.equal(s.active.count,0);
 recordSocialSale(s,['latte','coffee'],8,31);assert.equal(s.active.count,2);
 assert.equal(claimSocial(s),null);
 assert.equal(recordSocialSale(s,Array(20).fill('coffee'),8,32),true);
 assert.equal(s.active.count,10);assert.equal(tickSocial(s,10,240),false);
 assert.deepEqual(claimSocial(s),{id:'cat',tier:2,reward:200});assert.equal(claimSocial(s),null);
 assert.equal(s.best.cat,2);assert.equal(s.active,null);
});
test('deadline cannot be bypassed by a sale or a shift change',()=>{
 for(const [day,time] of [[8,110],[9,0]]){const s=normalizeSocials();startSocial(s,'dog',1,8,20,SOCIALS);assert.equal(recordSocialSale(s,Array(6).fill('cupcake'),day,time),false);assert.equal(claimSocial(s),null);}
});
test('legacy saves default safely and an active social survives canonical save/apply round trip',()=>{
 const s=normalizeSocials();startSocial(s,'bunny',3,8,25.5,SOCIALS);recordSocialSale(s,['smoothie'],8,30);
 const raw={coins:100,built:[],dayState:{day:8,t:30},meta:{socials:s}};
 const result=validateAndMigrateSave(raw,AREA1);assert.equal(result.ok,true);
 assert.deepEqual(result.data.meta.socials,s);
 const G={};applySave(G,result.data,AREA1);assert.deepEqual(G.meta.socials,s);
 assert.deepEqual(validateAndMigrateSave({coins:0,built:[]},AREA1).data.meta.socials,normalizeSocials());
});
test('upgraded latte bar remains eligible and malformed medal/reward data is bounded',()=>{
 const world={stations:new Map([['coffee',{active:true,type:'display',product:'latte'}]])};
 assert.deepEqual(availableSocials(world).map(s=>s.id),['cat']);
 const s=normalizeSocials({best:{cat:999},active:{id:'cat',day:8,tier:999,target:1,count:999,reward:999999,status:'ready',deadline:120}});
 assert.equal(s.best.cat,3);assert.equal(s.active.target,14);assert.equal(claimSocial(s).reward,320);
});
