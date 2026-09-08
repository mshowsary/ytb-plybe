import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import {
  DECOR, DECOR_BY_ID, DECOR_IDS, TERRACE_ZONE, decorCatalogue, decorUnlocked,
} from '../data/decor.js';
import {
  buyDecor, decorCost, ownedDecor, ownsDecor, affordableDecor, cheapestDecor,
  UPGRADES, STAFF, upgradeCost, hireCost,
} from '../src/sim/economy.js';
import { decorMesh, DECOR_MESH } from '../src/render/decor.js';
import { install as installDecor } from '../src/systems/decor.js';
import { decorRows } from '../src/ui/sheets.js';
import { validateAndMigrateSave } from '../src/sim/save.js';

const state = (over = {}) => ({ coins: 0, meta: { reputation: 0, decor: [] }, ...over });
const interior = () => DECOR.filter(i => i.region === 'interior');

// ---------------------------------------------------------------------------------------------
// catalogue
test('the catalogue is 24 authored items with unique ids inside the authored price band', () => {
  assert.equal(DECOR.length, 24);
  assert.equal(new Set(DECOR_IDS).size, 24);
  for (const item of DECOR) {
    assert.equal(typeof item.id, 'string', item.id);
    assert.ok(Number.isInteger(item.price) && item.price >= 60 && item.price <= 900, `${item.id} price ${item.price}`);
    assert.equal(item.rep, 1, `${item.id} must grant exactly +1 reputation`);
    assert.ok(item.region === 'interior' || item.region === 'terrace', `${item.id} region`);
    assert.ok(typeof item.icon === 'string' && item.icon.startsWith('<svg'), `${item.id} icon`);
    for (const axis of ['x', 'y', 'z', 'rot']) {
      assert.ok(Number.isFinite(item.slot[axis]), `${item.id} slot.${axis}`);
    }
  }
});

// The whole point of the catalogue: on days 2-6 the wallet is small, so most of the shelf has to
// be small too. A catalogue that skewed expensive would recreate the gap it exists to close.
test('prices are weighted to the low end so an early wallet always has a target', () => {
  const prices = interior().map(i => i.price).sort((a, b) => a - b);
  assert.equal(prices[0], 60, 'the cheapest item must sit at the authored 60-coin floor');
  assert.ok(prices.filter(p => p <= 200).length >= 8, `expected >= 8 items <= 200, got ${prices.filter(p => p <= 200).length}`);
  assert.ok(prices.filter(p => p <= 120).length >= 4, 'at least four items must be reachable on a day-2 wallet');
  // Cheaper than every other sink in the game, which is what makes it the filler.
  const cheapestLadder = Math.min(
    ...Object.keys(UPGRADES).map(k => upgradeCost(k, { speed: 0, carry: 0, income: 0 })),
    ...Object.keys(STAFF).map(k => hireCost(k, {})),
    ...AREA1.zones.map(z => z.price),
  );
  assert.ok(prices[0] < cheapestLadder, `decor floor ${prices[0]} must undercut the cheapest existing sink ${cheapestLadder}`);
});

test('terrace items are inert this batch: gated on a zone that does not exist yet', () => {
  const zoneIds = new Set(AREA1.zones.map(z => z.id));
  // Batch 1 landed the terrace, so this guard flips as it was written to: the zone now EXISTS,
  // and what must still hold is that terrace decor stays locked until that zone is BUILT.
  assert.equal(zoneIds.has(TERRACE_ZONE), true, 'z_terrace exists from Batch 1 onward');
  const terrace = DECOR.filter(i => i.region === 'terrace');
  assert.ok(terrace.length > 0);
  for (const item of terrace) {
    assert.equal(item.requires, TERRACE_ZONE);
    // built-set, not zone-list: owning the definition is not owning the zone.
    assert.equal(decorUnlocked(item, new Set()), false);
  }
  // ...so they never list, whatever is built.
  // The BUILT set, not the zone list. Passing every zone id used to mean 'nothing is gated' only
  // because z_terrace did not exist; now it does, and a zone existing is not a zone built.
  const listed = decorCatalogue(new Set());
  assert.equal(listed.length, interior().length);
  assert.equal(listed.some(i => i.region === 'terrace'), false);
  // and they never sell, even to a rich player
  const s = state({ coins: 999999 });
  assert.deepEqual(buyDecor(s, terrace[0].id), { ok: false, cost: terrace[0].price });
  assert.equal(s.coins, 999999);
  assert.deepEqual(s.meta.decor, []);
});

test('interior slots sit inside the room and clear every station footprint', () => {
  const { w, d } = AREA1.size;
  for (const item of interior()) {
    assert.ok(Math.abs(item.slot.x) <= w / 2, `${item.id} x out of bounds`);
    assert.ok(Math.abs(item.slot.z) <= d / 2, `${item.id} z out of bounds`);
    for (const st of AREA1.stations) {
      const gap = Math.hypot(st.x - item.slot.x, st.z - item.slot.z);
      assert.ok(gap >= 0.9, `${item.id} is ${gap.toFixed(2)}m from station ${st.id}`);
    }
  }
  // no two pieces occupy the same volume (wall pieces are allowed above floor pieces)
  const list = interior();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].slot, b = list[j].slot;
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      assert.ok(gap >= 0.9, `${list[i].id} and ${list[j].id} overlap (${gap.toFixed(2)}m)`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// economy
test('buyDecor follows the buyUpgrade/hire contract: deduct, mark owned, +1 reputation', () => {
  const s = state({ coins: 200 });
  const item = DECOR_BY_ID.get('d_paw_sign');
  assert.equal(decorCost('d_paw_sign'), item.price);

  const r = buyDecor(s, 'd_paw_sign');
  assert.equal(r.ok, true);
  assert.equal(r.cost, item.price);
  assert.equal(s.coins, 200 - item.price);
  assert.deepEqual(ownedDecor(s), ['d_paw_sign']);
  assert.equal(ownsDecor(s, 'd_paw_sign'), true);
  assert.equal(s.meta.reputation, 1);
});

test('buyDecor never mutates the wallet on a refusal', () => {
  const s = state({ coins: 59 });
  assert.deepEqual(buyDecor(s, 'd_paw_sign'), { ok: false, cost: 60 });   // too poor by one coin
  assert.equal(s.coins, 59);
  assert.deepEqual(s.meta.decor, []);
  assert.equal(s.meta.reputation, 0);

  assert.deepEqual(buyDecor(s, 'not-a-decor-id'), { ok: false, cost: null });
  assert.equal(s.coins, 59);

  s.coins = 1000;
  assert.equal(buyDecor(s, 'd_paw_sign').ok, true);
  const after = s.coins;
  const second = buyDecor(s, 'd_paw_sign');                                // already owned
  assert.equal(second.ok, false);
  assert.equal(second.owned, true);
  assert.equal(s.coins, after);
  assert.deepEqual(s.meta.decor, ['d_paw_sign']);
  assert.equal(s.meta.reputation, 1, 'a repeat buy must not pay reputation twice');
});

test('buyDecor creates the owned list on a state that has never seen decor', () => {
  const s = { coins: 500 };
  assert.equal(buyDecor(s, 'd_rug_door').ok, true);
  assert.deepEqual(s.meta.decor, ['d_rug_door']);
  assert.equal(s.meta.reputation, 1);
});

test('affordable/cheapest track the wallet and the owned list', () => {
  const s = state({ coins: 0 });
  assert.deepEqual(affordableDecor(s).map(i => i.id), []);
  assert.equal(cheapestDecor(s).id, 'd_paw_sign');

  s.coins = 100;
  const ids = affordableDecor(s).map(i => i.id);
  assert.ok(ids.length >= 3, `expected several affordable at 100 coins, got ${ids.length}`);
  assert.ok(ids.every(id => DECOR_BY_ID.get(id).price <= 100));

  assert.equal(buyDecor(s, 'd_paw_sign').ok, true);
  assert.equal(affordableDecor(s).some(i => i.id === 'd_paw_sign'), false, 'an owned item is no longer on offer');
  assert.equal(cheapestDecor(s).id, 'd_rug_door');

  // owning the whole interior shelf exhausts it (terrace stays gated)
  const rich = state({ coins: 1_000_000 });
  for (const item of interior()) assert.equal(buyDecor(rich, item.id).ok, true, item.id);
  assert.equal(cheapestDecor(rich), null);
  assert.equal(rich.meta.reputation, interior().length);
});

// This is the defect the catalogue exists to fix, stated as an assertion: at every early-day income
// level the bot measures, there is at least one thing on the shelf priced within reach.
test('invariant A: an early-day wallet always has at least one affordable decor row', () => {
  const EARLY_DAY_INCOME = [400, 500, 650, 800, 950, 1100, 1400];  // plan 4.2 days 2-8
  for (const income of EARLY_DAY_INCOME) {
    const s = state({ coins: Math.round(income * 0.15) });   // a wallet with 15% of a day left in it
    assert.ok(affordableDecor(s).length >= 1, `income ${income}: nothing affordable`);
  }
});

// ---------------------------------------------------------------------------------------------
// render + systems
test('every catalogue id has a mesh factory, parked on its authored slot', () => {
  assert.deepEqual(Object.keys(DECOR_MESH).sort(), [...DECOR_IDS].sort());
  for (const item of DECOR) {
    const obj = decorMesh(item.id);
    assert.ok(obj, `${item.id} has no mesh`);
    assert.equal(obj.name, 'decor:' + item.id);
    assert.equal(obj.position.x, item.slot.x);
    assert.equal(obj.position.z, item.slot.z);
    assert.equal(obj.rotation.y, item.slot.rot);
  }
  assert.equal(decorMesh('not-a-decor-id'), null);
});

function fakeScene() {
  const objects = [];
  return {
    objects,
    add: o => { objects.push(o); },
    remove: o => { const i = objects.indexOf(o); if (i >= 0) objects.splice(i, 1); },
  };
}

test('install places owned decor immediately and pops a newly bought piece in', () => {
  const G = { coins: 1000, meta: { reputation: 0, decor: ['d_paw_sign'] } };
  const scene = fakeScene();
  const sys = installDecor(G, scene);

  assert.equal(sys.count, 1);
  assert.equal(scene.objects.length, 1);
  assert.equal(sys.animating, false, 'the restored set must not animate');
  assert.equal(scene.objects[0].scale.x, 1);

  assert.equal(buyDecor(G, 'd_rug_door').ok, true);
  sys.reveal('d_rug_door');
  assert.equal(sys.count, 2);
  assert.equal(sys.animating, true);
  const popped = scene.objects.find(o => o.name === 'decor:d_rug_door');
  assert.ok(popped.scale.x < 1, 'a fresh purchase starts small');

  for (let i = 0; i < 60; i++) sys.update(1 / 60);
  assert.equal(sys.animating, false);
  assert.equal(popped.scale.x, 1);
  assert.equal(popped.position.y, DECOR_BY_ID.get('d_rug_door').slot.y);

  // dropping an id (a tampered restore, or a rebuild) removes the object again
  G.meta.decor = ['d_paw_sign'];
  sys.sync();
  assert.equal(sys.count, 1);
  assert.equal(scene.objects.length, 1);

  sys.dispose();
  assert.equal(scene.objects.length, 0);
});

// The system is self-driving on purpose: the owned list is its only input, so main.js needs one
// update(dt) call and the buy site never has to remember to announce the purchase.
test('a purchase appears from update(dt) alone, with no reveal() call', () => {
  const G = { coins: 1000, meta: { reputation: 0, decor: [] } };
  const scene = fakeScene();
  const sys = installDecor(G, scene);
  assert.equal(sys.count, 0);

  assert.equal(buyDecor(G, 'd_paw_sign').ok, true);
  sys.update(1 / 60);
  assert.equal(sys.count, 1);
  assert.equal(sys.animating, true, 'it still pops, it just was not told to');
});

test('install ignores unknown and still-gated ids', () => {
  const G = { coins: 0, meta: { decor: ['d_umbrella_a', 'not-a-decor-id', 'd_paw_sign'] } };
  const scene = fakeScene();
  const sys = installDecor(G, scene);
  assert.equal(sys.count, 1);
  assert.equal(sys.has('d_paw_sign'), true);
  assert.equal(sys.has('d_umbrella_a'), false);
});

// ---------------------------------------------------------------------------------------------
// kiosk rows
test('kiosk decor rows are icon+price only, marked owned, and never list terrace pieces', () => {
  const rows = decorRows({ coins: 100, decorOwned: ['d_paw_sign'] });
  assert.equal(rows.length, interior().length);
  assert.equal(rows.some(r => r.id.startsWith('d_umbrella')), false);
  for (const r of rows) {
    assert.ok(r.icon.startsWith('<svg'));
    assert.equal(typeof r.price, 'number');
    assert.equal('label' in r, false, 'a row must carry no words');
  }
  const sign = rows.find(r => r.id === 'd_paw_sign');
  assert.equal(sign.owned, true);
  assert.equal(rows.find(r => r.id === 'd_rug_door').disabled, false);      // 70 <= 100
  assert.equal(rows.find(r => r.id === 'd_cat_tree_a').disabled, true);     // 430 > 100
  // an explicit model wins over the derived list
  assert.deepEqual(decorRows({ decor: [{ id: 'x', price: 1, icon: '<svg/>' }] }).map(r => r.id), ['x']);
});

// ---------------------------------------------------------------------------------------------
// persistence
test('decor purchases and the reputation they grant survive the canonical save gate', () => {
  const s = state({ coins: 5000 });
  buyDecor(s, 'd_paw_sign'); buyDecor(s, 'd_rug_door'); buyDecor(s, 'd_art_cat');
  assert.equal(s.meta.reputation, 3);

  const result = validateAndMigrateSave({
    v: 5, coins: s.coins, dayState: { day: 2, t: 10 },
    meta: { completedDays: 1, reputation: s.meta.reputation, decor: s.meta.decor },
  }, AREA1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.meta.decor, ['d_paw_sign', 'd_rug_door', 'd_art_cat']);
  // 1 settled shift caps shift-earned reputation at 3, and the 3 owned pieces widen it to 6.
  assert.equal(result.data.meta.reputation, 3);
});
