import { applySave } from '../src/sim/save.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCareerGoal, ensureCareer } from '../src/sim/career.js';
const cafe = (...zones) => ({world:{built:new Set(zones)}});
test('capacity contracts freeze per shift and survive serialized metadata', () => {
 const meta={}; const first=chooseCareerGoal(1,meta,cafe()); assert.equal(first.target,20);
 assert.equal(chooseCareerGoal(1,meta,cafe('z_blender')).target,20);
 assert.equal(chooseCareerGoal(1,JSON.parse(JSON.stringify(meta)),cafe('z_blender')).target,20);
 assert.equal(chooseCareerGoal(8,meta,cafe('z_blender')).target,34);
});
test('underperformance and extreme personal best cannot alter capacity contract', () => {
 const a={},b={}; ensureCareer(a); ensureCareer(b);
 a.career.history['2']={earned:1}; b.career.history['2']={earned:10000000};
 assert.deepEqual(chooseCareerGoal(9,a,cafe('z_blender')),chooseCareerGoal(9,b,cafe('z_blender')));
 assert.equal(chooseCareerGoal(9,a,cafe()).target,1900);
});
test('new contracts preserve prior awards and reject malformed cached goals',()=>{
 const meta={};const c=ensureCareer(meta);c.trophies.gold=2;c.currentContract={day:1,goal:{kind:'serve',target:NaN}};
 assert.equal(chooseCareerGoal(1,meta,cafe()).target,20);assert.equal(c.trophies.gold,2);
});

test('canonical save restore preserves the frozen contract across capacity changes',()=>{
 const meta={};chooseCareerGoal(1,meta,cafe());
 const state={coins:0,up:{},staff:{},stats:{},settings:{}};
 assert.ok(applySave(state,{coins:20,meta,dayState:{day:1,phase:'opening',t:0}}));
 assert.equal(chooseCareerGoal(1,state.meta,cafe('z_blender')).target,20);
});
