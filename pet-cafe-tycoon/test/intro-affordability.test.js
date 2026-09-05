import test from 'node:test';
import assert from 'node:assert/strict';
import { introBuildGuidance } from '../src/systems/intro.js';

function station(id, type, x, z, extra = {}) {
  return [id, { id, type, x, z, active:true, ...extra }];
}

function makeWorld(partial = 0) {
  const firstZone = { id:'z_tables', label:'Tables', price:90, x:4, z:2 };
  return {
    area:{ zones:[firstZone] },
    partial: partial ? { z_tables:partial } : {},
    activeZoneList:[firstZone],
    stations:new Map([
      station('oven1','oven',-3,1,{ stock:0 }),
      station('dispCookie','display',-1,1,{ stock:0, product:'cookie' }),
      station('register1','register',1,1,{ serving:'', money:0, cash:{ x:1.4, z:1 } }),
    ]),
    checkouts:['register1'],
    _regQueues:new Map(),
  };
}

function game(coins, products = []) {
  return {
    coins,
    customers:[],
    P:{ x:0, z:0 },
    owner:{ items:products.map(product => ({ userData:{ product } })) },
  };
}

test('first 8-coin payout does not strand intro at the unaffordable Tables zone', () => {
  const target = introBuildGuidance(game(8), makeWorld());
  assert.ok(target);
  assert.notEqual(target.kind, 'build');
  assert.equal(target.kind, 'bake');
  assert.equal(target.remaining, 90);
});

test('a full 48-coin batch still routes through useful café work rather than unaffordable Tables', () => {
  const target = introBuildGuidance(game(48), makeWorld());
  assert.ok(target);
  assert.notEqual(target.kind, 'build');
  assert.equal(target.kind, 'bake');
  assert.equal(target.remaining, 90);
});

test('partial investment is respected and build guidance begins exactly when remaining price is affordable', () => {
  const world = makeWorld(50);
  const short = introBuildGuidance(game(39), world);
  assert.notEqual(short.kind, 'build');
  assert.equal(short.remaining, 40);

  const exact = introBuildGuidance(game(40), world);
  assert.deepEqual(exact, { x:4, z:2, kind:'build', remaining:40 });
});

test('when short on Tables, a genuine pending service job wins over fallback baking', () => {
  const world = makeWorld();
  const register = world.stations.get('register1');
  register.money = 8;
  const target = introBuildGuidance(game(8), world);
  assert.equal(target.kind, 'collect');
  assert.equal(target.x, register.cash.x);
  assert.equal(target.z, register.cash.z);
});

test('held baked product routes to stock before sending the beginner back to the oven', () => {
  const target = introBuildGuidance(game(20, ['cookie']), makeWorld());
  assert.equal(target.kind, 'stock');
  assert.equal(target.x, -1);
  assert.equal(target.z, 1);
});
