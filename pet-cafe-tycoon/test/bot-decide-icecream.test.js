import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/sim/world.js';
import { decide } from '../src/sim/botDecide.js';
import { AREA1 } from '../data/area1.js';

// The economy bot's garden policy (docs/SHIP-PLAN-2026-09-19.md §1.2). These exercise botDecide.js's
// real priority chain (the same one tools/bot.js and the in-game auto-play bot both call) against
// the real garden station data, rather than a synthetic station shape that could drift from
// world.js's actual contract. Batch 1's cream refills are gone with the cold pantry: the stand's
// machine needs no supply, so the bot's garden work is stocking the stand and emptying its jar.

const GARDEN_BUILT = [
  'z_seats1', 'z_oven2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2',
  'z_terrace',
];

function freshGame(world) {
  return {
    coins: 0, up: {}, staff: {}, staffLevels: {}, machineLevels: {}, boosts: {}, time: 0, world,
    carry: { sack: null, sackLeft: 0, fruit: 0 }, carryKey: null, carryCount: 0,
    P: { x: 0, z: 2.5 }, customers: [],
  };
}

function gardenWorld() {
  const world = createWorld(AREA1, { built: GARDEN_BUILT });
  // Isolate the garden paths from the OTHER refill needs a fresh world happens to start with
  // (bowl1.stock starts at 0, i.e. "needs kibble", by createWorld's own default).
  world.stations.get('coffee1').beans = 20;
  world.stations.get('bowl1').stock = 5;
  return world;
}

test('the garden stand and its machine are active once z_terrace is built', () => {
  const world = gardenWorld();
  for (const id of ['icecream1', 'barIce']) assert.equal(world.stations.get(id).active, true, `${id} should be active`);
  assert.equal(world.stations.get('barIce').selfServe, true, 'the stand takes its guests\' money itself');
});

test('an empty ice cream machine is never a refill errand: there is nothing to fetch for it', () => {
  const world = gardenWorld();
  const ice = world.stations.get('icecream1');
  ice.stock = 0;
  const G = freshGame(world);
  const target = decide(world, G);
  assert.ok(!target || (target.kind !== 'refillPickup' && target.kind !== 'refillDrop'), `got ${target && target.kind}`);
});

test('a guest wishing ice cream is served by fetching from icecream1, same as any other machine', () => {
  const world = gardenWorld();
  world.stations.get('icecream1').stock = 3;
  const G = freshGame(world);
  G.customers = [{ id: 1, done: false, state: 'queue', slot: 0, mood: 'wait', wish: { product: 'icecream' } }];

  const target = decide(world, G);
  assert.equal(target.kind, 'fetch');
  assert.equal(target.stationId, 'icecream1');
  assert.equal(target.product, 'icecream');
});

test('a sundae wish (icecream1\'s alt recipe) is fetched from the same machine via family matching', () => {
  const world = gardenWorld();
  world.stations.get('icecream1').stock = 3;
  const G = freshGame(world);
  G.customers = [{ id: 1, done: false, state: 'queue', slot: 0, mood: 'wait', wish: { product: 'sundae' } }];

  const target = decide(world, G);
  assert.equal(target.kind, 'fetch');
  assert.equal(target.stationId, 'icecream1');
});

test('a stand running low is topped up from its machine even with nobody waiting at it', () => {
  // Garden guests arrive in bursts from the street; an empty stand when they get there is a lost
  // sale, so the bot keeps it stocked the way a player glancing at the garden would.
  const world = gardenWorld();
  world.stations.get('icecream1').stock = 6;
  world.stations.get('barIce').stock = 1;
  const G = freshGame(world);
  const target = decide(world, G);
  assert.equal(target.kind, 'fetch');
  assert.equal(target.stationId, 'icecream1');
  // A well-stocked stand leaves the owner to the café.
  world.stations.get('barIce').stock = 6;
  G._bot = null;
  const idle = decide(world, G);
  assert.ok(!idle || idle.stationId !== 'icecream1', `a stocked stand still drew the bot: ${idle && idle.kind}`);
});

test('the stand\'s cash jar is fetched like a register pile once it is worth the walk', () => {
  const world = gardenWorld();
  const stand = world.stations.get('barIce');
  const G = freshGame(world);
  G.time = 20; // past the 15 s "money is due" window, so a fresh pick looks at cash first
  // Pocket change in the jar is emptied in passing whenever the owner stocks the stand, not fetched
  // from across the gate.
  stand.pile = 60;
  const small = decide(world, G);
  assert.ok(!small || small.kind !== 'cash', `a 60-coin jar drew the bot out: ${small && small.kind}`);
  stand.pile = 200;
  G._bot = null; G.time = 40;
  const target = decide(world, G);
  assert.equal(target.kind, 'cash');
  assert.equal(target.stationId, 'barIce');
  assert.deepEqual({ x: target.x, z: target.z }, stand.cash);
  assert.deepEqual(stand.cash, stand.front, 'the jar is emptied from the spot the owner stocks the stand from');
});

test('a register is served from behind the till, where the live owner stands', () => {
  const world = gardenWorld();
  const reg = world.stations.get('register1');
  const G = freshGame(world);
  world._regQueues = new Map([['register1', [{ id: 9, slot: 0, state: 'atRegister', paid: false }]]]);
  const target = decide(world, G);
  assert.equal(target.kind, 'register');
  assert.deepEqual({ x: target.x, z: target.z }, reg.serve);
  assert.notDeepEqual(reg.serve, reg.front);
});

test('the interior pantry still serves beans/kibble refills', () => {
  const world = gardenWorld();
  world.stations.get('coffee1').beans = 0; // now the ONLY thing needing a refill
  const G = freshGame(world);

  const target = decide(world, G);
  assert.equal(target.kind, 'refillPickup');
  assert.equal(target.sackKind, 'beans');
  assert.equal(target.stationId, 'pantry1');
});

test('the garden is bought like any other zone once affordable (no garden-specific gate)', () => {
  // Only z_seats1..z_seats2 built (NOT z_terrace itself yet) — z_terrace is the only active zone
  // once the lounge is built; buildTarget()'s generic "cheapest affordable active zone" logic needs
  // no garden-specific code to pick it up.
  const world = createWorld(AREA1, {
    // z_register2 is also active this far into the chain and cheaper than the garden, so it must
    // be built too (or buildTarget's own "cheapest affordable active zone" rule correctly, and
    // unsurprisingly, prefers it — that is not the thing this test is about).
    // z_photo (the Pet camera, 2400) is the garden's parallel branch after the lounge and cheaper
    // than it, so it is built here too for the same reason z_register2 is.
    built: ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender', 'z_garden', 'z_seats2', 'z_photo'],
  });
  // Isolate the build decision from the OTHER refill need a fresh world happens to start with
  // (bowl1.stock starts at 0, i.e. "needs kibble") — same reasoning as gardenWorld() above.
  world.stations.get('bowl1').stock = 5;
  const G = freshGame(world);
  G.coins = 25000;
  G.time = 20; // past the 15s "money is due" window so a fresh pick considers build/cash first

  const target = decide(world, G);
  assert.equal(target.kind, 'build');
  assert.equal(target.zoneId, 'z_terrace');
});
