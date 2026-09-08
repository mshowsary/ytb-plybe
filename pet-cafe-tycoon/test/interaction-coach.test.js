import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSING_GRACE_METERS,
  MODE_FADE_SECONDS,
  MODE_HOLD_SECONDS,
  REFILLS_TO_MASTER,
  REFILL_EMPTY_SECONDS,
  REFILL_LESSON_KEYS,
  createCoachModeGate,
  createRefillProgress,
  createRefillReadiness,
  guestWaitingForStation,
  progressResetHides,
  refillCueMode,
  refillLessonNeed,
} from '../src/ui/interactionCoach.js';

// Task 0.8 (plan section 6.4): the owner reported the pantry demo "seems persistent until you open it for
// the first time, then it's gone". These tests pin the three rules that fix it - a lesson that only
// starts for a real need, half credit for the sack, and one mode owning the hand at a time.

const DT = 1 / 60;

function world({ beans = 0, stock = 0, coffeeActive = true, bowlActive = true } = {}) {
  return new Map([
    ['coffee1', {
      id: 'coffee1', type: 'coffee', active: coffeeActive, product: 'coffee',
      beans, stock: 0, front: { x: 2, z: 0 },
    }],
    ['bowl1', {
      id: 'bowl1', type: 'bowl', active: bowlActive, stock, capacity: 10, front: { x: 4, z: 0 },
    }],
  ]);
}

function game({ beans = 0, stock = 0, customers = [], at = { x: 0, z: 0 }, carry = null } = {}) {
  return {
    world: { stations: world({ beans, stock }) },
    carry: carry || { sack: null, sackLeft: 0, fruit: 0 },
    P: { x: at.x, z: at.z },
    customers,
  };
}

const wantsCoffee = () => ({ id: 1, done: false, state: 'queue', wish: { product: 'coffee', treat: false }, order: null });
const wantsCookieAndTreat = () => ({ id: 2, done: false, state: 'queue', wish: { product: 'cookie', treat: true }, order: null });

function run(readiness, G, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += DT) readiness.update(G, DT);
}

test('a guest only counts while it is still waiting for that family', () => {
  const stations = world();
  const coffee = stations.get('coffee1'), bowl = stations.get('bowl1');
  assert.equal(guestWaitingForStation({ customers: [wantsCoffee()] }, coffee), true);
  // A latte wish is the same family as the coffee machine.
  assert.equal(guestWaitingForStation({ customers: [{ done: false, state: 'queue', wish: { product: 'latte' } }] }, coffee), true);
  // A cookie wish never asks the espresso machine for anything.
  assert.equal(guestWaitingForStation({ customers: [{ done: false, state: 'queue', wish: { product: 'cookie' } }] }, coffee), false);
  // Goods already in hand: this guest is past the machine.
  assert.equal(guestWaitingForStation({ customers: [{ done: false, state: 'toSeat', wish: { product: 'coffee' }, order: ['coffee'] }] }, coffee), false);
  assert.equal(guestWaitingForStation({ customers: [{ done: false, state: 'leave', wish: { product: 'coffee' } }] }, coffee), false);

  assert.equal(guestWaitingForStation({ customers: [wantsCookieAndTreat()] }, bowl), true);
  assert.equal(guestWaitingForStation({ customers: [{ done: false, state: 'atBowl', wish: { product: 'cookie', treat: true }, order: ['cookie', 'treat'] }] }, bowl), false);
  assert.equal(guestWaitingForStation({ customers: [wantsCoffee()] }, bowl), false);
});

test('no refill lesson before the machine has been empty for six seconds', () => {
  const G = game({ beans: 0, stock: 5, customers: [wantsCoffee()] });
  const readiness = createRefillReadiness();
  const gate = st => readiness.ready(st, G);

  // Beans hit 0 this instant: the old coach started teaching here, which is the reported glitch.
  readiness.update(G, DT);
  assert.equal(refillLessonNeed(G, new Set(), gate), null);

  run(readiness, G, REFILL_EMPTY_SECONDS - 1);
  assert.ok(readiness.emptySeconds('coffee1') < REFILL_EMPTY_SECONDS);
  assert.equal(refillLessonNeed(G, new Set(), gate), null, 'still silent one second short of the gate');

  run(readiness, G, 1.2);
  assert.ok(readiness.emptySeconds('coffee1') >= REFILL_EMPTY_SECONDS);
  const lesson = refillLessonNeed(G, new Set(), gate);
  assert.equal(lesson && lesson.key, 'refillCoffee');
  assert.equal(lesson.supply, 'beans');
});

test('an empty machine nobody is waiting on is never a lesson', () => {
  const G = game({ beans: 0, stock: 5, customers: [] });
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 2);
  assert.ok(readiness.emptySeconds('coffee1') >= REFILL_EMPTY_SECONDS);
  assert.equal(refillLessonNeed(G, new Set(), st => readiness.ready(st, G)), null);

  // A guest with a cookie-and-treat wish asks the bowl, not the espresso machine.
  G.customers.push(wantsCookieAndTreat());
  assert.equal(refillLessonNeed(G, new Set(), st => readiness.ready(st, G)), null);

  G.customers.push(wantsCoffee());
  const lesson = refillLessonNeed(G, new Set(), st => readiness.ready(st, G));
  assert.equal(lesson && lesson.key, 'refillCoffee');
});

test('the empty clock restarts as soon as the machine has anything in it', () => {
  const G = game({ beans: 0, stock: 5, customers: [wantsCoffee()] });
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 1);
  assert.ok(readiness.ready(G.world.stations.get('coffee1'), G));
  G.world.stations.get('coffee1').beans = 20;
  readiness.update(G, DT);
  assert.equal(readiness.emptySeconds('coffee1'), 0);
  G.world.stations.get('coffee1').beans = 0;
  run(readiness, G, 2);
  assert.equal(readiness.ready(G.world.stations.get('coffee1'), G), false);
});

test('the bowl lesson waits for a guest who actually wants a treat', () => {
  const G = game({ beans: 20, stock: 0, customers: [wantsCoffee()] });
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 1);
  assert.equal(refillLessonNeed(G, new Set(), st => readiness.ready(st, G)), null);
  G.customers.push(wantsCookieAndTreat());
  const lesson = refillLessonNeed(G, new Set(), st => readiness.ready(st, G));
  assert.equal(lesson && lesson.key, 'refillBowl');
  assert.equal(lesson.label, 'PET TREATS');
});

test('half credit: once the sack is taken the hand only ever routes', () => {
  // First-timer: the pantry sheet choice and the pantry action button are still taught by tap.
  assert.equal(refillCueMode({ half: false, sheetChoice: true }), 'tap');
  assert.equal(refillCueMode({ half: false, pantryTapReady: true }), 'tap');

  // Sack taken. No combination of pantry affordances may produce a tap again.
  for (const sheetChoice of [false, true]) {
    for (const pantryTapReady of [false, true]) {
      for (const carryingSupply of [false, true]) {
        const mode = refillCueMode({ half: true, sheetChoice, pantryTapReady, carryingSupply });
        assert.notEqual(mode, 'tap', `half credit still tapped (sheet=${sheetChoice} btn=${pantryTapReady} carry=${carryingSupply})`);
      }
    }
  }
  // Carrying the beans, still away from the machine: route to the machine, nothing else.
  assert.equal(refillCueMode({ half: true, carryingSupply: true, nearMachine: false }), 'route');
  // Standing at the machine: the hold cue owns the frame.
  assert.equal(refillCueMode({ half: true, carryingSupply: true, nearMachine: true }), 'fall');
  // An open sheet is never covered by a world hand.
  assert.equal(refillCueMode({ half: true, overlay: true, carryingSupply: true }), 'none');
});

test('taking the right sack is half credit, and two refills prove every refill lesson', () => {
  const progress = createRefillProgress();
  const G = game({ beans: 0, stock: 0, customers: [wantsCoffee(), wantsCookieAndTreat()], at: { x: 2, z: 0 } });
  const coffee = G.world.stations.get('coffee1'), bowl = G.world.stations.get('bowl1');

  progress.observe(G);
  assert.equal(progress.hasSack('refillCoffee'), false);
  assert.deepEqual(progress.masteredKeys(), []);

  // Pantry: beans in hand. Half the lesson is already proven.
  G.carry = { sack: 'beans', sackLeft: 20, fruit: 0 };
  progress.observe(G);
  assert.equal(progress.hasSack('refillCoffee'), true);
  assert.equal(progress.hasSack('refillBowl'), false);
  assert.equal(progress.refills, 0);

  // Pour: the machine rose while the player's sack shrank, standing right at it.
  coffee.beans = 20; G.carry = { sack: null, sackLeft: 0, fruit: 0 };
  progress.observe(G);
  assert.equal(progress.refills, 1);
  assert.deepEqual(progress.masteredKeys(), [], 'one refill is not mastery');

  // Second refill, other supply.
  G.P = { x: 4, z: 0 };
  G.carry = { sack: 'kibble', sackLeft: 10, fruit: 0 };
  progress.observe(G);
  bowl.stock = 10; G.carry = { sack: null, sackLeft: 0, fruit: 0 };
  progress.observe(G);
  assert.equal(progress.refills, REFILLS_TO_MASTER);
  assert.deepEqual(progress.masteredKeys().sort(), [...REFILL_LESSON_KEYS].sort());

  // Both machines run dry again with guests waiting: the coach stays quiet for good.
  coffee.beans = 0; bowl.stock = 0;
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 2);
  const suppressed = new Set(progress.masteredKeys());
  assert.equal(refillLessonNeed(G, suppressed, st => readiness.ready(st, G)), null);
  assert.equal(refillLessonNeed(G, suppressed), null, 'ungated detector agrees once mastered');
});

test('a staff restock is not the player proving anything', () => {
  const progress = createRefillProgress();
  const G = game({ beans: 0, stock: 0, at: { x: 40, z: 40 } });
  progress.observe(G);
  // The runner tops the machine up while the owner is across the room, empty-handed.
  G.world.stations.get('coffee1').beans = 20;
  progress.observe(G);
  assert.equal(progress.refills, 0);
  assert.equal(progress.hasSack('refillCoffee'), false);
});

test('half credit and the refill tally round-trip through the learning payload', () => {
  const progress = createRefillProgress();
  progress.creditSack('refillBowl');
  progress.creditRefill('refillCoffee');
  const saved = JSON.parse(JSON.stringify(progress.snapshot()));
  assert.deepEqual(saved.sack.sort(), ['refillBowl:sack', 'refillCoffee:sack']);
  assert.equal(saved.refills, 1);

  const restored = createRefillProgress();
  restored.restore(saved);
  assert.equal(restored.hasSack('refillBowl'), true);
  assert.equal(restored.hasSack('refillCoffee'), true);
  assert.equal(restored.refills, 1);
  restored.creditRefill('refillBowl');
  assert.deepEqual(restored.masteredKeys().sort(), [...REFILL_LESSON_KEYS].sort());

  // Junk never invents credit.
  const clean = createRefillProgress();
  clean.restore({ sack: ['move:sack', 42, 'refillCoffee'], refills: 99 });
  assert.deepEqual(clean.sackKeys(), []);
  assert.equal(clean.refills, REFILLS_TO_MASTER);
  clean.restore(null);
  assert.equal(clean.refills, 0);
  assert.deepEqual(clean.sackKeys(), []);
});

test('a mode never switches twice inside the hold window', () => {
  const gate = createCoachModeGate();
  gate.request('tap', 'refillCoffee', 0);
  assert.equal(gate.mode, 'tap');

  // The pantry sheet closes: the world wants the route hand instead, every single frame.
  let t = 0;
  while (gate.mode === 'tap' && t < 5) { t += DT; gate.request('route', 'refillCoffee', DT); }
  assert.equal(gate.mode, 'route');
  assert.ok(t >= MODE_HOLD_SECONDS, `switched after only ${t.toFixed(3)}s`);
  assert.ok(t <= MODE_HOLD_SECONDS + MODE_FADE_SECONDS + 2 * DT, `cross-fade overran: ${t.toFixed(3)}s`);

  // Now flap the request the way an opening/closing sheet used to, and watch the switch times.
  const changes = [];
  let mode = gate.mode, clock = t;
  for (let i = 0; i < 60 * 6; i++) {
    clock += DT;
    gate.request(Math.floor(i / 18) % 2 ? 'tap' : 'route', 'refillCoffee', DT);
    if (gate.mode !== mode) { changes.push(clock); mode = gate.mode; }
  }
  assert.ok(changes.length > 0, 'the gate froze instead of eventually following the world');
  for (let i = 1; i < changes.length; i++) {
    assert.ok(changes[i] - changes[i - 1] >= MODE_HOLD_SECONDS,
      `two switches ${(changes[i] - changes[i - 1]).toFixed(3)}s apart`);
  }
});

test('a one-frame blip never costs the player their hand', () => {
  const gate = createCoachModeGate();
  gate.request('route', 'refillCoffee', 0);
  for (let i = 0; i < 60; i++) gate.request('route', 'refillCoffee', DT);
  // A single frame where the world asks for nothing (a sheet mid-open, say) starts a fade...
  let res = gate.request(null, null, DT);
  assert.equal(res.fading, true);
  assert.equal(gate.mode, 'route');
  // ...and asking for the same hand again cancels it outright instead of hiding.
  res = gate.request('route', 'refillCoffee', DT);
  assert.equal(res.fading, false);
  assert.equal(res.live, true);
  assert.equal(gate.mode, 'route');
});

test('closing on a nearby target never hides the hand', () => {
  // Walking the last few metres toward the machine used to reset the dwell and hide the cue.
  assert.equal(progressResetHides(1.2, 2.0), false);
  assert.equal(progressResetHides(CLOSING_GRACE_METERS, 12), false);
  // Far away, real progress still calms the cue down.
  assert.equal(progressResetHides(CLOSING_GRACE_METERS + 0.5, 12), true);
  // Standing still (or drifting away) is not progress.
  assert.equal(progressResetHides(9, 9), false);
  assert.equal(progressResetHides(9.5, 9), false);
  assert.equal(progressResetHides(null, 9), false);
  assert.equal(progressResetHides(9, null), false);
});
