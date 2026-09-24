import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeWorld,emitWorld } from '../src/sim/events.js';
test('explicit observers preserve old wrapper priority and queued event identity',()=>{
  const w={events:[]},seen=[],push=w.events.push,pay={type:'pay'};
  subscribeWorld(w,()=>seen.push('friendship'),10);
  subscribeWorld(w,()=>seen.push('friction'),20);
  subscribeWorld(w,()=>seen.push('mess'),30);
  emitWorld(w,pay);assert.deepEqual(seen,['mess','friction','friendship']);assert.equal(w.events[0],pay);assert.equal(w.events.push,push);
});
test('unsubscribe is independent and idempotent across repeated setup and frame clearing',()=>{
  const w={events:[]};let a=0,b=0;
  const off=subscribeWorld(w,()=>a++);subscribeWorld(w,()=>b++);emitWorld(w,{});off();off();
  w.events.length=0;emitWorld(w,{});assert.equal(a,1);assert.equal(b,2);assert.equal(w.events.length,1);
});
