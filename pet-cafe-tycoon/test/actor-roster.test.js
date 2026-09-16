import test from 'node:test';
import assert from 'node:assert/strict';
import { beginActorStep,endActorStep } from '../src/sim/actorRoster.js';
import { createWorld } from '../src/sim/world.js';
import { createMover,setTarget,stepMover } from '../src/sim/mover.js';
import { moveBaristaTo } from '../src/sim/baristaState.js';
import { stepStaff } from '../src/sim/staff.js';
import { AREA1 } from '../data/area1.js';
test('one immutable roster includes all roles once and excludes departed actors',()=>{
 const world={},a={mover:{}},b={mover:{}},c={mover:{}};
 const roster=beginActorStep(world,[a,{done:true,mover:{}}],[b,a],[c]);
 assert.deepEqual(roster,[a.mover,b.mover,c.mover]);assert.ok(Object.isFrozen(roster));
 assert.throws(()=>roster.push({}),TypeError);endActorStep(world);
 assert.equal(world._actorRosterActive,false);assert.equal(world._movers.length,0);
});
for (const [name,points] of [
 ['coffee lane',[[-1,-2.5,2,-2.5],[2,-2,-1,-2],[.5,-3.2,.5,-1.2]]],
 ['doorway',[[-8.8,3,-7,3],[-7,3.7,-8.8,3.7],[-8,2.5,-8,4.5]]],
]) test(`${name}: mixed roles finish without roster changes or position jumps`,()=>{
 const world=createWorld(AREA1,{built:AREA1.zones.map(z=>z.id)});
 const actors=points.map(([x,z,tx,tz],i)=>{
  const mover=createMover(x,z,.3,2.4);mover.kind=['barista','runner','customer'][i];setTarget(mover,tx,tz,world.grid);
  return {x,z,mover,target:{x:tx,z:tz},arrived:false};
 });
 for(let tick=0;tick<1600 && actors.some(a=>!a.arrived);tick++){
  const roster=beginActorStep(world,[actors[2]],[actors[1]],[actors[0]]);world.grid.frame++;
  for(const [i,a] of actors.entries()){
   if(a.arrived)continue;const x=a.mover.x,z=a.mover.z;
   if(i===0)a.arrived=moveBaristaTo(a,world,a.target,.05);
   else { a.arrived=stepMover(a.mover,world.grid,roster,.05) || Math.hypot(a.mover.x-a.target.x,a.mover.z-a.target.z)<.15; }
   assert.ok(Math.hypot(a.mover.x-x,a.mover.z-z)<.2,'no teleport');
   assert.equal(world._movers,roster);assert.equal(roster.length,3);
  }
  endActorStep(world);
 }
 assert.ok(actors.every(a=>a.arrived),'all actors reach their destination without orbiting');
 // Standalone sim tests can safely use their legacy roster after an orchestrated step ends.
 stepStaff([],world,.05);assert.equal(world._movers.length,0);
});
