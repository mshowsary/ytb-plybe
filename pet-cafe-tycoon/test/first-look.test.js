// test/first-look.test.js — one quiet demo per new thing (docs/SHIP-PLAN-2026-09-19.md §1.8).
//
// This file replaces two that pinned behaviour Batch F deliberately deletes:
//
//   * test/intro-affordability.test.js pinned introBuildGuidance — the intro's step-4 chain that
//     re-ran bake → stock → serve → cash for as long as the player was short of the 90-coin Tables
//     plot. It ran 13 s → 97 s of day 1 with the floor trail on screen a quarter of the day
//     (research/onboarding, 2026-09-19). The function is gone; the first minute stops after serve
//     and the build lesson opens once, when a pad is genuinely affordable.
//   * test/staff-teaching.test.js pinned nextStaffDemoJob — the 2.5 s purple ring under whichever
//     worker happened to be mid-chore, which fired off the worker's own state machine, was
//     routinely off screen, deliberately excluded the cleaner because there was no chore to point
//     at, and never played again once ANY role had been demonstrated. Replaced by one lesson per
//     role, armed by the hire itself, cleaner included.
//
// Everything those two files were really protecting survives, inverted: teaching happens once, it
// is triggered by something the player did, and it never invents work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LESSONS, laneOpen, affordablePad, createFirstLook,
  PRESENT_SECONDS, AWAIT_SECONDS, ARM_SECONDS, QUEUE_MAX,
} from '../src/systems/firstLook.js';
import { createIntro } from '../src/systems/intro.js';
import { FIRST_LOOK_IDS, normalizeFirstLook, normalizeMechanicLearning, MECHANIC_LEARNING_VERSION } from '../src/sim/mechanicLearning.js';

const byId = id => LESSONS.find(l => l.id === id);

function station(id, type, x, z, extra = {}) {
  return [id, { id, type, x, z, active: true, front: { x, z: z + 1.3 }, ...extra }];
}

function makeWorld(extra = []) {
  const zones = [
    { id: 'z_seats1', x: -6.75, z: 4.3, price: 90, adds: ['seat1'] },
    { id: 'z_oven2', x: 5, z: -3.2, price: 220, adds: ['oven2'], requires: 'z_seats1' },
  ];
  return {
    area: { zones },
    activeZoneList: zones,
    built: new Set(),
    partial: {},
    events: [],
    pose: null,
    stations: new Map([
      station('oven1', 'oven', 6.5, -5.2, { stock: 0, product: 'cookie' }),
      station('dispCookie', 'display', 2, -2, { stock: 0, product: 'cookie', capacity: 8 }),
      station('register1', 'checkout', -5.5, -2, { serving: '', pile: 0, cash: { x: -5.9, z: -1.6 } }),
      ...extra,
    ]),
  };
}

function makeGame(world, over = {}) {
  const proven = new Set();
  return {
    coins: 0, P: { x: 0, z: 2.5, vx: 0, vz: 0 },
    world, carry: { sack: null, sackLeft: 0, fruit: 0 },
    owner: { items: [] },
    staff: { runner: 0, cashier: 0, cleaner: 0, barista: 0, photographer: 0 },
    staffList: [], up: { speed: 0, carry: 0, income: 0 },
    dayState: { day: 1, phase: 'open' }, intro: {}, userPaused: false,
    markMechanic: k => proven.add(k), mechanicProven: k => proven.has(k),
    _proven: proven,
    ...over,
  };
}

// A lesson context, exactly the shape systems/firstLook.js hands its pure predicates.
const ctxFor = (G, world, flags = { menuOpened: false }) => ({ G, world, flags });

// ---- the table itself ---------------------------------------------------------------------------

test('every lesson id is persistable, so no lesson can replay for ever', () => {
  for (const lesson of LESSONS) {
    assert.ok(FIRST_LOOK_IDS.includes(lesson.id), `${lesson.id} is missing from FIRST_LOOK_IDS`);
  }
  // ...and the five mechanics the research run found with NO introduction at all are all covered.
  for (const id of ['photo', 'bowl', 'garden', 'icestand', 'pantry', 'hire']) {
    assert.ok(byId(id), `no lesson introduces ${id}`);
  }
});

test('a ghost hand is only ever offered for a tap, a hold or a timing ring', () => {
  for (const lesson of LESSONS) {
    assert.ok([null, undefined, 'tap', 'hold', 'ring'].includes(lesson.hand),
      `${lesson.id} wants hand mode ${lesson.hand}`);
  }
});

test('a bubble is 2-3 cells, never a sentence', () => {
  const G = makeGame(makeWorld());
  for (const lesson of LESSONS) {
    const cells = lesson.glyphs(ctxFor(G, G.world));
    assert.ok(cells.length >= 2 && cells.length <= 3, `${lesson.id} drew ${cells.length} cells, expected 2-3`);
    for (const cell of cells) {
      const text = String(cell).replace(/<[^>]*>/g, '').trim();
      assert.ok(!/[A-Za-z]{2,}/.test(text), `${lesson.id} draws the word "${text}"`);
    }
  }
});

// ---- the triggers -------------------------------------------------------------------------------

test('the build lesson opens on the first affordable pad and nowhere else', () => {
  const world = makeWorld();
  const G = makeGame(world);
  const L = ctxFor(G, world);
  const build = byId('build');
  assert.equal(build.arm(L), false, 'broke, nothing to buy');
  G.coins = 89;
  assert.equal(build.arm(L), false, 'one coin short is not an invitation');
  G.coins = 90;
  assert.equal(build.arm(L), true);
  assert.equal(affordablePad(L).id, 'z_seats1');
  // A partly-paid pad counts what is left, not the sticker price.
  G.coins = 40; world.partial.z_seats1 = 50;
  assert.equal(build.arm(L), true);
  assert.equal(affordablePad(L).id, 'z_seats1');
  // And once anything is built, this lesson is over: it teaches the FIRST purchase.
  world.built.add('z_seats1');
  assert.equal(build.arm(L), false);
  assert.equal(build.done(L), true);
});

test('a purchase introduces what it bought: the five mechanics that had no introduction at all', () => {
  const world = makeWorld([
    station('pantry1', 'pantry', -2.2, -5.2),
    station('coffee1', 'coffee', 0.5, -5.2, { beans: 20, stock: 0, product: 'coffee' }),
    station('barCoffee', 'display', -1, -2, { stock: 0, product: 'coffee', capacity: 8 }),
    station('bowl1', 'bowl', 6.8, 2.5, { stock: 0, capacity: 10 }),
    station('hire1', 'hire', -6.5, 2.6),
    station('icecream1', 'icecream', 7, 10, { stock: 0, product: 'icecream' }),
    station('barIce', 'display', 7.2, 10.2, { stock: 0, product: 'icecream', capacity: 8, selfServe: true }),
    station('photoWall1', 'wall', -8, 3.6),
  ]);
  const G = makeGame(world, { coins: 500 });
  const L = ctxFor(G, world);
  for (const id of ['hire', 'coffee', 'bowl', 'garden', 'photo']) {
    assert.equal(byId(id).arm(L), true, `${id} did not arm with its station standing in the room`);
  }
  // The desk is bought with almost everything the player has, so the hire lesson waits for the
  // wallet too: a ghost hand on a HIRE button whose every row is greyed out teaches nothing.
  G.coins = 40;
  assert.equal(byId('hire').arm(L), false, 'the hire lesson offered a hire the player cannot pay for');
  G.coins = 500; G.staff.runner = 1;
  assert.equal(byId('hire').arm(L), false, 'a café that already has staff is not introduced to hiring');
  G.staff.runner = 0;
  // The pantry hand-over is taught by the FIRST problem it solves, not by the purchase: a dry
  // machine with no beans in hand.
  assert.equal(byId('pantry').arm(L), false, 'a full coffee machine has nothing to teach');
  world.stations.get('coffee1').beans = 0;
  assert.equal(byId('pantry').arm(L), true);
  G.carry.sack = 'beans';
  assert.equal(byId('pantry').arm(L), false, 'a sack already in hand is the lesson already learned');
  // The stand's own chore, likewise: cones run out.
  assert.equal(byId('icestand').arm(L), true);
  world.stations.get('barIce').stock = 4;
  assert.equal(byId('icestand').arm(L), false);
});

test('an unbuilt station teaches nothing', () => {
  const world = makeWorld([station('bowl1', 'bowl', 6.8, 2.5, { active: false, stock: 0 })]);
  const L = ctxFor(makeGame(world), world);
  assert.equal(byId('bowl').arm(L), false);
});

test('the first worker of each role gets one lesson, cleaner included, aimed at its own lane', () => {
  const world = makeWorld([station('dispCupcake', 'display', 5, -2, { stock: 0, product: 'cupcake', capacity: 8 })]);
  const G = makeGame(world);
  const L = ctxFor(G, world);
  for (const id of ['roleRunner', 'roleCashier', 'roleCleaner', 'roleBarista', 'rolePhotographer']) {
    assert.equal(byId(id).arm(L), false, `${id} armed with nobody hired`);
  }
  // The old staff demo deliberately refused to teach the cleaner, because it needed an existing
  // delivery or checkout chore to point at. A hire is its own trigger, so the cleaner is in.
  G.staffList.push({ kind: 'cleaner', x: -9, z: 4.2, target: null });
  assert.equal(byId('roleCleaner').arm(L), true);
  assert.equal(byId('roleRunner').arm(L), false, 'one role hired is not every role taught');

  // Camera AND bubble are both on the worker, and both follow them: a new hire walks in at the door,
  // twelve metres from the counter they are heading for, so framing the counter would be a shot of
  // an empty counter. The lane is what the second glyph names.
  G.staffList.push({ kind: 'runner', x: -9, z: 4.2, target: 'dispCupcake' });
  const runner = byId('roleRunner');
  assert.equal(runner.arm(L), true);
  assert.deepEqual(runner.focus(L), { x: -9, z: 4.2 });
  const bubble = runner.bubbleAt(L);
  assert.equal(bubble.x, -9);
  assert.equal(bubble.z, 4.2);
  const worker = G.staffList.find(s => s.kind === 'runner');
  worker.x = -3; worker.z = 0;
  assert.deepEqual(runner.focus(L), { x: -3, z: 0 }, 'the look follows the worker rather than freezing');
});

test('the pose lesson runs only while a pet is actually posing and no shot has started', () => {
  const world = makeWorld();
  const G = makeGame(world);
  const L = ctxFor(G, world);
  assert.equal(byId('pose').arm(L), false);
  world.pose = { x: 1, z: 1, session: null };
  assert.equal(byId('pose').arm(L), true);
  assert.equal(byId('pose').done(L), false);
  world.pose.session = { species: 'cat' };
  assert.equal(byId('pose').done(L), true, 'the shot started: the lesson is over');
});

test('the upgrades lesson waits for day 2 and for coins, and ends on the tap it asked for', () => {
  const world = makeWorld();
  world.built.add('z_seats1');
  const G = makeGame(world);
  const flags = { menuOpened: false };
  const L = ctxFor(G, world, flags);
  const up = byId('upgrades');
  G.coins = 500;
  assert.equal(up.arm(L), false, 'day 1 is the first minute, not a shopping trip');
  G.dayState.day = 2;
  assert.equal(up.arm(L), true);
  G.coins = 120;
  assert.equal(up.arm(L), false, 'an offer the player cannot take is not an offer');
  G.coins = 500;
  assert.equal(up.done(L), false);
  flags.menuOpened = true;
  assert.equal(up.done(L), true);
  assert.equal(up.arm(L), false, 'a player who has already opened the card is not shown the door');
});

// ---- the lane -----------------------------------------------------------------------------------

test('the lane is closed by the opening minute, a sheet, a pause and a rush', () => {
  assert.equal(laneOpen({}), true);
  assert.equal(laneOpen({ intro: true }), false, 'the opening minute owns the screen');
  assert.equal(laneOpen({ modal: true }), false, 'nothing draws under a sheet or the day summary');
  assert.equal(laneOpen({ paused: true }), false);
  assert.equal(laneOpen({ rush: true }), false, 'a rush is not the moment to introduce something');
  assert.equal(laneOpen({ rush: true, blocking: true }), true,
    'unless the lesson IS what the waiting guest is stuck behind');
});

test('the lessons that may interrupt a rush are exactly the ones a guest is waiting on', () => {
  const blocking = LESSONS.filter(l => l.blocking).map(l => l.id).sort();
  assert.deepEqual(blocking, ['clean', 'pantry', 'pose']);
});

// ---- the whole loop, driven ---------------------------------------------------------------------

function drive(fl, seconds, dt = 1 / 30) {
  for (let i = 0; i < Math.round(seconds / dt); i++) fl.update(dt);
}

function harness(over = {}, worldExtra = []) {
  const world = makeWorld(worldExtra);
  const G = makeGame(world, over);
  const ctx = { world, fx: null, els: null, owner: G.owner, audio: null };
  const fl = createFirstLook(G, null, ctx);
  return { G, world, fl };
}

test('a lesson presents once, then waits for the player, then never plays again', () => {
  const { G, world, fl } = harness();
  G.coins = 90;
  fl.update(1 / 30);
  assert.equal(fl.activeId, 'build', 'the affordable pad took the lane');
  drive(fl, PRESENT_SECONDS + 0.2);
  assert.equal(fl.activePhase, 'await', 'the presentation beat is short; the bubble then waits');
  assert.equal(G.firstLookActive, true);
  assert.deepEqual(G.firstLookPoint && [G.firstLookPoint.x, G.firstLookPoint.z], [-6.75, 4.3]);

  world.built.add('z_seats1');
  fl.update(1 / 30);
  assert.equal(fl.activeId, null, 'doing the thing ends the lesson');
  assert.equal(G.firstLookActive, false);
  assert.equal(G.firstLookPoint, null);

  // And it is spent for good, even with the world put back exactly as it was.
  world.built.clear(); G.coins = 90;
  drive(fl, 5);
  assert.equal(fl.activeId, null, 'the build lesson replayed');
  assert.ok(fl.seen('build'));
});

test('an ignored lesson gives up instead of nagging', () => {
  const { G, fl } = harness();
  G.coins = 90;
  drive(fl, PRESENT_SECONDS + AWAIT_SECONDS + 1);
  assert.equal(fl.activeId, null, 'the bubble was still up after its whole await window');
  assert.ok(fl.seen('build'));
});

test('one lesson at a time, and the opening minute holds them all off', () => {
  const { G, world, fl } = harness({ intro: { active: true, step: 0 } },
    [station('hire1', 'hire', -6.5, 2.6)]);
  G.coins = 500;
  drive(fl, 4);
  assert.equal(fl.activeId, null, 'a lesson opened over the opening minute');
  assert.ok(!fl.seen('build'), 'and the opening minute must not SPEND the lessons it held off');
  assert.ok(!fl.seen('hire'));
  assert.equal(fl.armedIds.length, QUEUE_MAX);

  G.intro.active = false;
  fl.update(1 / 30);
  assert.equal(fl.activeId, 'build');
  assert.equal(fl.armedIds.includes('hire'), true, 'the second one waits its turn rather than stacking');
  world.built.add('z_seats1');
  drive(fl, PRESENT_SECONDS + 0.5);
  assert.equal(fl.activeId, 'hire', 'and takes the lane once the first is done');
});

test('a lesson whose subject went away while it waited is quietly dropped', () => {
  const seat = station('seat1', 'seat', -6.75, 4.3, { dirty: true });
  const { world, fl, G } = harness({ intro: { active: true, step: 0 } }, [seat]);
  drive(fl, 2);
  assert.deepEqual(fl.armedIds, ['clean']);
  world.stations.get('seat1').dirty = false;
  G.intro.active = false;
  fl.update(1 / 30);
  assert.equal(fl.activeId, null, 'a wiped table was still introduced');
  assert.ok(fl.seen('clean'));
});

test('an armed lesson the lane never freed for is spent, not stored up for later', () => {
  const { G, fl } = harness({}, [station('coffee1', 'coffee', 0.5, -5.2, { beans: 20, stock: 0, product: 'coffee' })]);
  G.dayState.phase = 'rush';
  drive(fl, ARM_SECONDS + 1);
  assert.equal(fl.activeId, null);
  assert.ok(fl.seen('coffee'), 'a lesson that never got a free minute must not fire out of context later');
});

// Measured on the live 3-day probe: the first pad became affordable during day 1's rush, when a
// lesson correctly stands aside, and the build lesson then expired unseen — so the player was never
// shown how to buy anything. The two lessons the progression hangs on wait instead of expiring.
test('the build and hire lessons wait for a free minute rather than expiring unseen', () => {
  const { G, fl } = harness({}, [station('hire1', 'hire', -6.5, 2.6)]);
  G.coins = 500;
  G.dayState.phase = 'rush';
  drive(fl, ARM_SECONDS * 3);
  assert.equal(fl.activeId, null, 'a lesson opened in the middle of a rush');
  assert.ok(!fl.seen('build'), 'the build lesson was spent by a rush it was right to sit out');
  assert.deepEqual(fl.armedIds, ['build', 'hire'], 'both are still waiting, in the order they armed');
  G.dayState.phase = 'afternoon';
  fl.update(1 / 30);
  assert.equal(fl.activeId, 'build');
});

test('the shown set survives a save, and an unknown id cannot ride in on one', () => {
  const { fl } = harness();
  fl.skipAll();
  const payload = normalizeMechanicLearning({
    v: MECHANIC_LEARNING_VERSION, proven: ['serve'], looks: [...fl.snapshot(), 'not-a-lesson'],
  });
  assert.deepEqual(payload.looks, [...FIRST_LOOK_IDS].sort());
  fl.restore(payload.looks);
  for (const id of FIRST_LOOK_IDS) assert.ok(fl.seen(id));
  assert.equal(normalizeFirstLook({ looks: ['hire', 'hire', 'nope', 7] }).join(','), 'hire');
  assert.deepEqual(normalizeFirstLook(null), []);
  // A save written before this batch has no `looks` at all, and must serialize unchanged.
  assert.equal('looks' in normalizeMechanicLearning({ v: MECHANIC_LEARNING_VERSION, proven: ['serve'] }), false);
});

// ---- the first minute ---------------------------------------------------------------------------

test('the first minute is bake, stock, serve — and marks each one learned as it goes', () => {
  const world = makeWorld();
  const G = makeGame(world);
  const fx = { burst() {} };
  const intro = createIntro(G, null, { world, owner: G.owner, fx, audio: null, els: null });

  intro.update(1 / 30);
  assert.equal(G.intro.step, 0);
  assert.deepEqual([G.intro.target.x, G.intro.target.z], [6.5, -5.2], 'step 0 is the oven');

  G.owner.items.push({ userData: { product: 'cookie' } });
  intro.update(1 / 30);
  assert.equal(G.intro.step, 1);
  assert.deepEqual([G.intro.target.x, G.intro.target.z], [2, -2], 'step 1 is the display');
  assert.ok(G.mechanicProven('pickup'), 'baking taught pickup and nothing marked it');
  assert.ok(G.mechanicProven('move'));

  world.stations.get('dispCookie').stock = 1;
  intro.update(1 / 30);
  assert.equal(G.intro.step, 2);
  assert.deepEqual([G.intro.target.x, G.intro.target.z], [-5.5, -2], 'step 2 is the register');
  assert.ok(G.mechanicProven('deliver'));

  world.events.push({ type: 'processed' });
  intro.update(1 / 30);
  assert.equal(G.intro.step, 5, 'the opening ends after the first sale, not after a build');
  assert.equal(G.intro.active, false);
  assert.equal(G.intro.target, null);
  assert.ok(G.mechanicProven('serve'));
  assert.ok(G.mechanicProven('cash'), 'the objective must never re-teach cash minutes later');
});

test('the opening never sends the player at a build plot', () => {
  const world = makeWorld();
  const G = makeGame(world, { coins: 1000 });
  const intro = createIntro(G, null, { world, owner: G.owner, fx: { burst() {} }, audio: null, els: null });
  for (let i = 0; i < 90; i++) intro.update(1 / 30);
  assert.equal(G.intro.step, 0, 'the opening waits for the player, it does not advance on coins');
  assert.equal(G.intro.target.kind, 'bake');
  assert.notEqual(G.intro.target.kind, 'build');
});

test('a save written by the old five-step opening lands on done rather than on a deleted step', () => {
  const world = makeWorld();
  for (const step of [3, 4]) {
    const G = makeGame(world, { intro: { step, active: true } });
    const intro = createIntro(G, null, { world, owner: G.owner, fx: { burst() {} }, audio: null, els: null });
    intro.update(1 / 30);
    assert.equal(G.intro.step, 5);
    assert.equal(G.intro.active, false);
  }
});

test('a patient lesson waiting out a rush does not hold back the lesson a guest is waiting on', () => {
  const seat = station('seat1', 'seat', -6.75, 4.3, { dirty: false });
  const { G, world, fl } = harness({}, [seat]);
  G.coins = 90;
  G.dayState.phase = 'rush';
  drive(fl, 1);
  assert.deepEqual(fl.armedIds, ['build'], 'the build lesson is armed and rightly waiting');
  world.stations.get('seat1').dirty = true;
  drive(fl, 0.5);
  assert.equal(fl.activeId, 'clean', 'a dirty table is exactly what a rush lets through');
  assert.ok(!fl.seen('build'), 'and the patient lesson is still waiting its turn');
});
