import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../tools/certify-batch.js';
test('a failed or timed-out check stays red but cannot suppress later checks',()=>{
  let calls=0;const outcomes=[{status:1,stderr:'broken'},{status:null,error:new Error('timeout')},{status:0,stdout:'ok'}];
  const results=runChecks(['broken','timeout','healthy'].map(name=>({name,command:['node',name],timeoutMs:50})),()=>outcomes[calls++]);
  assert.equal(calls,3);assert.deepEqual(results.map(r=>r.status),['failed','failed','passed']);
  assert.match(results[1].output,/timeout/);
});
