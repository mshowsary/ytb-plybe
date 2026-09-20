import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_REFILL_KEYS,
  REFILL_EMPTY_SECONDS,
  createRefillProgress,
  createRefillReadiness,
  refillLessonNeed,
} from '../src/ui/interactionCoach.js';

// The garden's ice cream machine needs no supply (docs/SHIP-PLAN-2026-09-19.md §1.2: cream and its
// cold pantry are cut). Batch 1 gave it a `refillIce` coach lesson mirroring refillCoffee; with no
// supply to run out of, that lesson must never fire — an empty machine is simply one that has not
// made the next cone yet, and a garden guest waiting on it is waiting on the owner or a Runner to
// carry cones, not on a sack. The coach reads the machine's supply through sim/supplies.js, which is
// where "drinks nothing" is decided (supplyLevel is Infinity for such a machine).

function game({ stock = 0, active = true, customers = [], at = { x: 0, z: 0 }, carry = null } = {}) {
  const stations = new Map([
    ['icecream1', { id: 'icecream1', type: 'icecream', active, product: 'icecream', stock, front: { x: 8, z: 0 } }],
    ['coffee1', { id: 'coffee1', type: 'coffee', active: true, product: 'coffee', beans: 12, stock: 0, front: { x: 0, z: 0 } }],
  ]);
  return { world: { stations }, carry: carry || { sack: null, sackLeft: 0, fruit: 0 }, P: { x: at.x, z: at.z }, customers };
}

const wantsIcecream = () => ({ id: 9, done: false, state: 'queue', wish: { product: 'icecream', treat: false }, order: null });
const wantsSundae = () => ({ id: 10, done: false, state: 'queue', wish: { product: 'sundae', treat: false }, order: null });
const wantsCoffee = () => ({ id: 11, done: false, state: 'queue', wish: { product: 'coffee', treat: false }, order: null });

const DT = 1 / 60;
function run(readiness, G, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += DT) readiness.update(G, DT);
}

test('an empty ice cream machine never raises a refill lesson, even with garden guests waiting on it', () => {
  for (const guest of [wantsIcecream(), wantsSundae()]) {
    const G = game({ stock: 0, customers: [guest] });
    const readiness = createRefillReadiness();
    run(readiness, G, REFILL_EMPTY_SECONDS * 3);
    assert.equal(readiness.emptySeconds('icecream1'), 0, 'the machine never reads as out of anything');
    assert.equal(refillLessonNeed(G, new Set(), st => readiness.ready(st, G)), null, `${guest.wish.product}: no lesson`);
    assert.equal(refillLessonNeed(G, new Set()), null, 'nor from the bare "empty right now" detector');
  }
});

test('the coffee lesson beside it still fires exactly as before', () => {
  const G = game({ stock: 0, customers: [wantsCoffee()] });
  G.world.stations.get('coffee1').beans = 0;
  const readiness = createRefillReadiness();
  run(readiness, G, REFILL_EMPTY_SECONDS + 1);
  const lesson = refillLessonNeed(G, new Set(), st => readiness.ready(st, G));
  assert.equal(lesson && lesson.key, 'refillCoffee');
  assert.equal(lesson.stationId, 'coffee1');
});

test('no refill can be credited at the ice cream machine: its level never moves', () => {
  const progress = createRefillProgress();
  const G = game({ stock: 0, customers: [wantsIcecream()], at: { x: 8, z: 0 } });
  progress.observe(G);
  G.world.stations.get('icecream1').stock = 6; // it made cones — that is not a refill
  progress.observe(G);
  assert.equal(progress.refills, 0);
});

test('two refills of any supply master every refill lesson', () => {
  const progress = createRefillProgress();
  progress.creditRefill('refillCoffee');
  assert.deepEqual(progress.masteredKeys(), [], 'one refill is not mastery');
  progress.creditRefill('refillBowl');
  assert.deepEqual(progress.masteredKeys().sort(), [...ALL_REFILL_KEYS].sort());
});
