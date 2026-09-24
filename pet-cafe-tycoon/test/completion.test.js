import test from 'node:test';
import assert from 'node:assert/strict';
import {cafeCompletion} from '../src/sim/completion.js';
import {MASTERY} from '../src/sim/career.js';
import {STAR_IDS, STAFF} from '../src/sim/economy.js';
import {PET_SPECIES,PET_PROFILES,petKey} from '../src/sim/petBook.js';
test('completed room has a truthful optional path, not an invented next area',()=>{
 const G={world:{area:{zones:[{id:'last'}]},built:new Set()},meta:{}};
 assert.equal(cafeCompletion(G).roomComplete,false);G.world.built.add('last');
 assert.equal(cafeCompletion(G).roomComplete,true);assert.equal(cafeCompletion(G).allContentComplete,false);
 assert.match(cafeCompletion(G).next,/Optional/);
});
test('all authored content is complete only when every finite collection and upgrade is owned',()=>{
 const G={world:{area:{zones:[{id:'last'}]},built:new Set(['last'])},
 meta:{career:{renovationLevel:5,recipeSales:Object.fromEntries(Object.entries(MASTERY).map(([k,v])=>[k,v.thresholds.at(-1)]))},petFriendship:Object.fromEntries(PET_SPECIES.flatMap(s=>PET_PROFILES[s].map((_,v)=>[petKey(s,v),10])))},
 up:{speed:3,carry:3,income:3},
 staff:Object.fromEntries(Object.entries(STAFF).map(([k,v])=>[k,v.costs.length])),staffLevels:{runner:{speed:3,carry:3},cashier:{speed:3},cleaner:{speed:3}},machineLevels:{oven:3,coffee:3,display:3},stars:Object.fromEntries(STAR_IDS.map(id=>[id,3]))};
 // "Complete" now means the AUTHORED build-out is finished, not that progression has ended —
 // the ladders continue past these tiers. Owning every authored tier still reports complete.
 assert.equal(cafeCompletion(G).allContentComplete,true);
 // Continuing past the authored tiers must not un-complete it.
 G.stars.oven1=7;G.up.speed=9;assert.equal(cafeCompletion(G).allContentComplete,true);
 // Falling short of an authored tier still does.
 G.stars.oven1=2;assert.equal(cafeCompletion(G).allContentComplete,false);
});
