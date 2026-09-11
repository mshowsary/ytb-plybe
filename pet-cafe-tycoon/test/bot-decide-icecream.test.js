import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, refreshActive } from '../src/sim/world.js';
import { decide } from '../src/sim/botDecide.js';
import { AREA1 } from '../data/area1.js';

// Task E2 (batch 1, plan 3.1): "refill cream exactly like beans, and buy the terrace chain when
// affordable." These tests exercise botDecide.js's real priority chain (the same one tools/bot.js
// and the in-game auto-play bot both call) against the real terrace station data, all the way to
// the ice cream lane, rather than a synthetic station shape that could drift from world.js's actual
// contract.

const TERRACE_ICECREAM_BUILT = [
  'z_seats1', 'z_oven2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2',
  'z_terrace', 'z_icecream',
];

function freshGame(world) {
  return {
    coins: 0, up: {}, staff: {}, staffLevels: {}, machineLevels: {}, boosts: {}, time: 0, world,
    carry: { sack: null, sackLeft: 0, fruit: 0 }, carryKey: null, carryCount: 0,
    P: { x: 0, z: 2.5 }, customers: [],
  };
}

function worldWithIcecream() {
  const world = createWorld(AREA1, { built: TERRACE_ICECREAM_BUILT });
  // Isolate the cream/icecream paths from the OTHER refill needs a fresh world happens to start
  // with (bowl1.stock starts at 0, i.e. "needs kibble", by createWorld's own default).
  world.stations.get('coffee1').beans = 20;
  world.stations.get('bowl1').stock = 5;
  return world;
}

test('terrace ice cream lane stations are active once z_icecream is built', () => {
  const world = worldWithIcecream();
  for (const id of ['icecream1', 'barIce', 'coldPantry1']) {
    assert.equal(world.stations.get(id).active, true, `${id} should be active`);
  }
});

test('cream is refilled exactly like beans: needCream routes to the CREAM pantry, not pantry1', () => {
  const world = worldWithIcecream();
  world.stations.get('icecream1').cream = 0;
  const G = freshGame(world);

  const target = decide(world, G);
  assert.equal(target.kind, 'refillPickup');
  assert.equal(target.sackKind, 'cream');
  // coldPantry1 is the one with `supplies: ['cream']` in data/area1.js — pantry1 (beans/kibble)
  // would be the wrong building entirely for a cream refill.
  assert.equal(target.stationId, 'coldPantry1');
});

test('carrying a cream sack drops it at the (active) ice cream machine, mirroring beans', () => {
  const world = worldWithIcecream();
  world.stations.get('icecream1').cream = 0;
  const G = freshGame(world);
  G.carry = { sack: 'cream', sackLeft: 20, fruit: 0 };

  const target = decide(world, G);
  assert.equal(target.kind, 'refillDrop');
  assert.equal(target.stationId, 'icecream1');
});

test('a guest wishing ice cream is served by fetching from icecream1, same as any other machine', () => {
  const world = worldWithIcecream();
  world.stations.get('icecream1').stock = 3;
  const G = freshGame(world);
  G.customers = [{ id: 1, done: false, state: 'queue', slot: 0, mood: 'wait', wish: { product: 'icecream' } }];

  const target = decide(world, G);
  assert.equal(target.kind, 'fetch');
  assert.equal(target.stationId, 'icecream1');
  assert.equal(target.product, 'icecream');
});

test('a sundae wish (icecream1\'s alt recipe) is fetched from the same machine via family matching', () => {
  const world = worldWithIcecream();
  world.stations.get('icecream1').stock = 3;
  const G = freshGame(world);
  G.customers = [{ id: 1, done: false, state: 'queue', slot: 0, mood: 'wait', wish: { product: 'sundae' } }];

  const target = decide(world, G);
  assert.equal(target.kind, 'fetch');
  assert.equal(target.stationId, 'icecream1');
});

test('the interior pantry still serves beans/kibble refills unaffected by the new cream branch', () => {
  const world = worldWithIcecream();
  world.stations.get('coffee1').beans = 0; // now the ONLY thing needing a refill
  const G = freshGame(world);

  const target = decide(world, G);
  assert.equal(target.kind, 'refillPickup');
  assert.equal(target.sackKind, 'beans');
  assert.equal(target.stationId, 'pantry1');
});

test('the terrace zone chain is bought like any other zone once affordable (no icecream-specific gate)', () => {
  // Only z_seats1..z_seats2 built (NOT z_terrace itself yet) — z_terrace (20000) is the cheapest
  // active zone once the owner can afford it; buildTarget()'s generic "cheapest affordable active
  // zone" logic needs no terrace-specific code to pick it up.
  const world = createWorld(AREA1, {
    // z_register2 is also active this far into the chain and cheaper than the terrace, so it must
    // be built too (or buildTarget's own "cheapest affordable active zone" rule correctly, and
    // unsurprisingly, prefers it over the terrace — that is not the thing this test is about).
    built: ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2'],
  });
  // Isolate the build decision from the OTHER refill need a fresh world happens to start with
  // (bowl1.stock starts at 0, i.e. "needs kibble") — same reasoning as worldWithIcecream() above.
  world.stations.get('bowl1').stock = 5;
  const G = freshGame(world);
  G.coins = 25000;
  G.time = 20; // past the 15s "money is due" window so a fresh pick considers build/cash first

  const target = decide(world, G);
  assert.equal(target.kind, 'build');
  assert.equal(target.zoneId, 'z_terrace');
});
