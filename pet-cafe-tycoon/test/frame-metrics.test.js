import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameMetrics} from '../src/core/frameMetrics.js';
test('frame diagnostics preserve uncapped stalls, bound memory and remain opt-in',()=>{
 const m=createFrameMetrics(3);m.record({frameMs:900});assert.equal(m.report().sampleCount,0);
 m.start();for(const frameMs of [10,20,30,250])m.record({frameMs,drawCalls:12,triangles:400});
 const r=m.stop();assert.equal(r.sampleCount,3);assert.equal(r.frameMs.max,250);assert.equal(r.stallsOver100ms,1);assert.equal(r.maxDrawCalls,12);assert.equal(r.heapBytesMax,null);
 m.record({frameMs:900});assert.equal(m.report().frameMs.max,250);m.start();assert.equal(m.report().sampleCount,0);
});
