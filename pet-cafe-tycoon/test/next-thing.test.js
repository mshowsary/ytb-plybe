// test/next-thing.test.js — there is NEVER a day with nothing to work towards (ship plan §1.6c).
//
// The finding this exists for: the bot owns every zone by day 13, and the economy report measured
// "no purposeful goal after the last zone" — only invisible +% ladders. src/sim/nextThing.js is the
// answer the Café card's row draws, and this walks a café from empty to finished and asserts it
// never once comes back blank.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA1 } from '../data/area1.js';
import { createWorld } from '../src/sim/world.js';
import { nextThing } from '../src/sim/nextThing.js';
import { cafeDayModel } from '../src/ui/cafeDayModel.js';
import { RENOVATIONS } from '../src/sim/career.js';
import { PAW_PET_KEYS, PAW_TARGETS } from '../src/sim/pawRating.js';

const KINDS = new Set(['build', 'theme', 'star', 'upgrade', 'pets', 'complete']);
const book = n => Object.fromEntries(PAW_PET_KEYS.slice(0, n).map(k => [k, 1]));

function cafe(builtIds = [], meta = {}, coins = 0, stats = { served: 0 }) {
  const world = createWorld(AREA1);
  for (const id of builtIds) world.built.add(id);
  return { world, coins, stats, meta: { petBook: {}, petFriendship: {}, album: {}, career: {}, pawBest: 0, ...meta } };
}

test('an empty café is saving for its first pad, and it is the cheapest open one', () => {
  const g = cafe();
  const n = nextThing(g);
  assert.equal(n.kind, 'build');
  assert.equal(n.id, 'z_seats1');
  assert.equal(n.price, AREA1.zones.find(z => z.id === 'z_seats1').price);
});

test('walking the whole zone chain always names the next pad, never nothing', () => {
  const built = [];
  const seen = [];
  for (let i = 0; i < AREA1.zones.length; i++) {
    const n = nextThing(cafe(built));
    assert.equal(n.kind, 'build', `zone ${i} still names a build`);
    assert.ok(n.price > 0);
    seen.push(n.id);
    built.push(n.id);
  }
  assert.equal(new Set(seen).size, AREA1.zones.length, 'every zone is named exactly once');
  // ...and the very next read, with everything built, is NOT blank.
  assert.ok(KINDS.has(nextThing(cafe(built)).kind));
});

test('after the last build the answer is the next star row, then the themes it opens', () => {
  const all = AREA1.zones.map(z => z.id);
  // A café that has everything built but no stars: the row holding the next star is the answer.
  const early = nextThing(cafe(all, {}, 5000, { served: PAW_TARGETS.served }));
  assert.equal(early.kind, 'star');
  assert.ok(early.target > early.current, 'the row it names is genuinely unfinished');

  // At ★3 the first café theme is on sale, and that is a thing to SPEND on rather than grind for.
  const starred = nextThing(cafe(all, { pawBest: 3 }, 5000, { served: 999 }));
  assert.equal(starred.kind, 'theme');
  assert.equal(starred.price, RENOVATIONS[0].cost);
  assert.equal(starred.star, RENOVATIONS[0].star);

  // Every theme bought, still ★4: back to the star rows.
  const themed = nextThing(cafe(all, { pawBest: 4, career: { renovationLevel: RENOVATIONS.length } }, 50000, { served: 999 }));
  assert.equal(themed.kind, 'star');
});

test('a finished café falls through to the collection tail and only then to complete', () => {
  const all = AREA1.zones.map(z => z.id);
  const done = {
    pawBest: 5,
    career: { renovationLevel: RENOVATIONS.length },
    petBook: book(14),
    petFriendship: Object.fromEntries(PAW_PET_KEYS.slice(0, 5).map(k => [k, 10])),
    album: Object.fromEntries(PAW_PET_KEYS.map(k => [k, { shots: 3, best: 2 }])),
  };
  const tail = nextThing(cafe(all, done, 90000, { served: 9999 }));
  assert.equal(tail.kind, 'pets', 'the pets still unmet are a real next thing');
  assert.ok(tail.target > tail.current);

  const everything = nextThing(cafe(all, { ...done, petBook: book(20) }, 90000, { served: 9999 }));
  assert.equal(everything.kind, 'complete');
  // ...unless the Shop still has something, which it always does (the star ladder never ends).
  const withShop = nextThing(cafe(all, { ...done, petBook: book(20) }, 90000, { served: 9999 }),
    { cheapestUpgrade: { id: 'star:oven1', cost: 480 } });
  assert.equal(withShop.kind, 'upgrade');
  assert.equal(withShop.price, 480);
});

test('nextThing is total: it never returns null and never throws on a half-built state', () => {
  for (const g of [cafe(), cafe(['z_seats1']), { meta: {} }, { world: null, meta: null }, {}]) {
    const n = nextThing(g);
    assert.ok(n && KINDS.has(n.kind), JSON.stringify(n));
  }
});

test('the Café card draws it every day of a ten-day run, and never a blank row', () => {
  // The shape the probe checks live: walk ten days of a café that finishes its chain, and assert
  // the Today row names something on every one of them.
  const script = [
    [], ['z_seats1'], ['z_seats1', 'z_oven2'], ['z_seats1', 'z_oven2', 'z_register2'],
    ['z_seats1', 'z_oven2', 'z_register2', 'z_hire'],
    ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee'],
    ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl'],
    ['z_seats1', 'z_oven2', 'z_register2', 'z_hire', 'z_coffee', 'z_bowl', 'z_blender'],
    AREA1.zones.map(z => z.id),
    AREA1.zones.map(z => z.id),
  ];
  for (let day = 1; day <= script.length; day++) {
    const g = cafe(script[day - 1], { pawBest: Math.min(4, Math.floor(day / 3)) }, 3000, { served: day * 30 });
    g.dayState = { day, t: 10, phase: 'morning' };
    g.dayStats = {};
    const model = cafeDayModel(g);
    assert.ok(model.next, `day ${day} has a next thing`);
    assert.notEqual(model.next.kind, 'complete', `day ${day} still has somewhere to go`);
    assert.ok(model.next.price != null || model.next.target != null,
      `day ${day} shows a price or a progress pair, never an empty chip`);
  }
});
