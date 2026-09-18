import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_REFILL_KEYS,
  REFILL_EMPTY_SECONDS,
  createRefillProgress,
  createRefillReadiness,
  refillLessonNeed,
} from '../src/ui/interactionCoach.js';

// Task E1 (batch 1, plan 3.1): the ice cream lane's `refillIce` lesson mirrors refillCoffee exactly
// (cream instead of beans — world.js's icecream station shape is coffee's with `cream` swapped in
// for `beans`), and must obey the exact same Task-0.8 lifecycle rules Batch 0 wrote for the other
// two: only start once the machine has been empty >= REFILL_EMPTY_SECONDS AND a guest is genuinely
// waiting on that family, half credit for taking the right sack, and mastery generalises across
// every supply.

function game({ cream = 0, active = true, customers = [], at = { x: 0, z: 0 }, carry = null } = {}) {
  const stations = new Map([
    ['icecream1', {
      id: 'icecream1', type: 'icecream', active, product: 'icecream',
      cream, stock: 0, front: { x: 8, z: 0 },
    }],
  ]);
  return { world: { stations }, carry: carry || { sack: null, sackLeft: 0, fruit: 0 }, P: { x: at.x, z: at.z }, customers };
}

const wantsIcecream = () => ({ id: 9, done: false, state: 'queue', wish: { product: 'icecream', treat: false }, order: null });
const wantsSundae = () => ({ id: 10, done: false, state: 'queue', wish: { product: 'sundae', treat: false }, order: null });
const wantsCookie = () => ({ id: 11, done: false, state: 'queue', wish: { product: 'cookie', treat: false }, order: null });

const DT = 1 / 60;
function run(readiness, G, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += DT) readiness.update(G, DT);
}

test('refillIce mirrors refillCoffee: needs the machine empty AND a genuine ice cream wait', () => {
  const G = game({ cream: 0, customers: [wantsIcecream()] });
  const readiness = createRefillReadiness();
  const gate = st => readiness.ready(st, G);

  // Cream hit 0 this instant — must not fire yet (same rule as coffee/bowl).
  readiness.update(G, DT);
  assert.equal(refillLessonNeed(G, new Set(), gate), null);

  run(readiness, G, REFILL_EMPTY_SECONDS - 1);
  assert.equal(refillLessonNeed(G, new Set(), gate), null, 'still short of the six-second gate');

  run(readiness, G, 1.2);
  const lesson = refillLessonNeed(G, new Set(), gate);
  assert.equal(lesson && lesson.key, 'refillIce');
  assert.equal(lesson.supply, 'cream');
});

test('a sundae wish is the same family as icecream — it also counts as genuinely waiting', () => {
  const G = game({ cream: 0, customers: [wantsSundae()] });
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 1);
  const lesson = refillLessonNeed(G, new Set(), st => readiness.ready(st, G));
  assert.equal(lesson && lesson.key, 'refillIce');
});

test('no guest waiting on ice cream: the empty machine teaches nothing', () => {
  const G = game({ cream: 0, customers: [wantsCookie()] });
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 2);
  assert.equal(refillLessonNeed(G, new Set(), st => readiness.ready(st, G)), null);
});

test('an inactive (not-yet-built) ice cream lane never coaches', () => {
  const G = game({ cream: 0, active: false, customers: [wantsIcecream()] });
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 2);
  assert.equal(refillLessonNeed(G, new Set(), st => readiness.ready(st, G)), null);
});

test('half credit: taking the cream sack marks refillIce half-proven', () => {
  const progress = createRefillProgress();
  const G = game({ cream: 0, customers: [wantsIcecream()], at: { x: 8, z: 0 } });
  const icecream = G.world.stations.get('icecream1');

  progress.observe(G);
  assert.equal(progress.hasSack('refillIce'), false);

  G.carry = { sack: 'cream', sackLeft: 20, fruit: 0 };
  progress.observe(G);
  assert.equal(progress.hasSack('refillIce'), true);
  assert.equal(progress.refills, 0);

  icecream.cream = 20; G.carry = { sack: null, sackLeft: 0, fruit: 0 };
  progress.observe(G);
  assert.equal(progress.refills, 1);
});

test('two refills of any supply (including cream) master every refill lesson', () => {
  const progress = createRefillProgress();
  progress.creditRefill('refillIce');
  assert.deepEqual(progress.masteredKeys(), [], 'one refill is not mastery');
  progress.creditRefill('refillIce');
  assert.deepEqual(progress.masteredKeys().sort(), [...ALL_REFILL_KEYS].sort());
});

test('mastered refillIce is suppressed exactly like the others', () => {
  const G = game({ cream: 0, customers: [wantsIcecream()] });
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 2);
  const suppressed = new Set(['refillIce']);
  assert.equal(refillLessonNeed(G, suppressed, st => readiness.ready(st, G)), null);
});
