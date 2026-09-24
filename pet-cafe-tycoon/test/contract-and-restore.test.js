import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBaristaWorker } from '../src/systems/baristaWorker.js';
import { contractModel } from '../src/ui/contractBadge.js';
test('Barista restore wrapper preserves successful and rejected results and safely detaches',()=>{
 let accepted=true,calls=0;const restore=()=>{calls++;return accepted;};
 const G={world:{stations:new Map()},staff:{barista:0},restore};const worker=createBaristaWorker(G,new THREE.Scene());
 assert.equal(G.restore({}),true);accepted=false;assert.equal(G.restore({}),false);assert.equal(calls,2);
 worker.destroy();assert.equal(G.restore,restore);
});
// The 'streak' kind was retired with the rival contract in Batch E1 (an 8x service streak is not
// something a player can watch themselves doing); the three kinds that replaced it are checked here
// in its place. Everything else about the ring -- the real metric, the clamp, the per-shift key,
// the null guard -- is asserted exactly as before.
test('contract model uses the actual metric, clamps the ring and keys completion per shift',()=>{
 assert.equal(contractModel({kind:'serve',target:24},{served:6},1).ratio,.25);
 assert.equal(contractModel({kind:'earn',target:100},{earned:120},1).ratio,1);
 assert.equal(contractModel({kind:'seated',target:5},{seatedServed:5},1).complete,true);
 assert.equal(contractModel({kind:'photos',target:4},{photos:1},1).ratio,.25);
 assert.equal(contractModel({kind:'icecream',target:8},{iceCreams:2},1).ratio,.25);
 assert.equal(contractModel({kind:'streak',target:5},{bestStreak:5},1),null,'a retired kind draws no ring');
 assert.notEqual(contractModel({kind:'serve',target:24},{},1).key,contractModel({kind:'serve',target:24},{},2).key);
 assert.equal(contractModel(null,{},1),null);
});
