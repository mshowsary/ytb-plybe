import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MECHANIC_LEARNING_VERSION,
  REFRESH_AFTER_FAILURES,
  normalizeMechanicLearning,
  refillLessonNeed,
  selectCoachPriority,
  urgentCustomerNeed,
} from '../src/ui/interactionCoach.js';

test('Task 29: canonical mechanic learning keeps only proven known mechanics', () => {
  const learning = normalizeMechanicLearning({
    v: MECHANIC_LEARNING_VERSION,
    proven: ['refillCoffee', 'hire', 'not-a-real-mechanic', 'refillCoffee'],
  });
  assert.deepEqual(learning, {
    v: MECHANIC_LEARNING_VERSION,
    proven: ['hire', 'refillCoffee'],
  });
});

test('Task 29: legacy saves infer demonstrated intro mechanics instead of restarting lessons', () => {
  const learning = normalizeMechanicLearning(null, {
    intro: { step: 5 },
    stats: { served: 3 },
    staff: { runner: 1, cashier: 0, cleaner: 0, barista: 0 },
    upgrades: { speed: 1, carry: 0, income: 0 },
  });
  assert.deepEqual(learning.proven, ['build', 'cash', 'hire', 'kiosk', 'move', 'pickup', 'serve']);
});

test('Task 29: malformed learning is sanitized while save evidence still migrates', () => {
  const learning = normalizeMechanicLearning({ v: 999, proven: 'everything' }, {
    intro: { step: 2 },
  });
  assert.equal(learning.v, MECHANIC_LEARNING_VERSION);
  assert.deepEqual(learning.proven, ['build', 'move']);
});

test('Task 29: object-of-booleans learning form migrates defensively', () => {
  const learning = normalizeMechanicLearning({
    v: MECHANIC_LEARNING_VERSION,
    proven: { refillBowl: true, blend: false, harvest: true, bogus: true },
  });
  assert.deepEqual(learning.proven, ['harvest', 'refillBowl']);
  assert.equal(REFRESH_AFTER_FAILURES, 2);
});

test('Task 29: proven refill lesson is absent from first-use detector after reload', () => {
  const coffee = { id: 'coffee1', type: 'coffee', active: true, beans: 0, front: { x: 3, z: 4 } };
  const G = {
    P: { x: 0, z: 0 },
    carry: { sack: null, sackLeft: 0, fruit: 0 },
    world: { stations: new Map([['coffee1', coffee]]) },
  };
  const firstUse = refillLessonNeed(G, new Set());
  assert.equal(firstUse.key, 'refillCoffee');
  assert.equal(firstUse.supply, 'beans');
  assert.equal(refillLessonNeed(G, new Set(['refillCoffee'])), null);
});

test('Task 30: arbitration is strict urgent -> stock -> construction -> contextual', () => {
  assert.equal(selectCoachPriority({ urgent: true, stock: true, construction: true, contextual: true }), 'urgent');
  assert.equal(selectCoachPriority({ stock: true, construction: true, contextual: true }), 'stock');
  assert.equal(selectCoachPriority({ construction: true, contextual: true }), 'construction');
  assert.equal(selectCoachPriority({ contextual: true }), 'contextual');
  assert.equal(selectCoachPriority({}), null);
});

test('Task 30: <=4s live customer patience is classified as urgent', () => {
  assert.equal(urgentCustomerNeed({ customers: [{ state: 'queue', patience: 4, done: false }] }), true);
  assert.equal(urgentCustomerNeed({ customers: [{ state: 'queue', patience: 4.01, done: false }] }), false);
  assert.equal(urgentCustomerNeed({ customers: [{ state: 'leave', patience: 1, done: false }] }), false);
});
