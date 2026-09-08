import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MECHANIC_LEARNING_VERSION,
  REFILLS_TO_MASTER,
  REFRESH_AFTER_FAILURES,
  normalizeMechanicLearning,
  normalizeRefillProgress,
  coachEscalationStage,
  selectCoachPriority,
  stableContextAction,
} from '../src/sim/mechanicLearning.js';
import { createRefillProgress, refillLessonNeed, urgentCustomerNeed } from '../src/ui/interactionCoach.js';

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

test('Task 29: stable contextual IDs are derived from world state, never UI copy', () => {
  const stations = new Map([
    ['desk', { id: 'desk', type: 'hire', active: true, front: { x: 0.8, z: 0 } }],
    ['kiosk', { id: 'kiosk', type: 'kiosk', active: true, front: { x: 0.9, z: 0 } }],
    ['pantry', { id: 'pantry', type: 'pantry', active: true, front: { x: 1, z: 0 } }],
    ['return', { id: 'return', type: 'return', active: true, front: { x: 0.7, z: 0 } }],
  ]);
  const G = { P: { x: 0, z: 0 }, world: { stations }, carry: { sack: null, fruit: 0 }, owner: { items: [] } };
  assert.equal(stableContextAction(G), 'pantry');
  G.owner.items.push({});
  assert.equal(stableContextAction(G), 'return');
  stations.get('return').active = false;
  stations.get('pantry').active = false;
  assert.equal(stableContextAction(G), 'hire'); // same priority as kiosk, nearest wins
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

test('Task 0.8: half credit and the refill tally survive the canonical save boundary', () => {
  const progress = createRefillProgress();
  progress.creditRefill('refillCoffee'); // a pour also credits the sack that fed it
  progress.creditSack('refillBowl');

  // Exactly what the coach hands the save layer, through exactly the save layer's normalizer.
  const payload = normalizeMechanicLearning({
    v: MECHANIC_LEARNING_VERSION, proven: ['pantry'], ...progress.snapshot(),
  });
  assert.deepEqual(payload.proven, ['pantry']);
  assert.deepEqual(payload.sack, ['refillBowl:sack', 'refillCoffee:sack']);
  assert.equal(payload.refills, 1);

  const restored = createRefillProgress();
  restored.restore(normalizeMechanicLearning(JSON.parse(JSON.stringify(payload))));
  assert.equal(restored.hasSack('refillCoffee'), true);
  assert.equal(restored.hasSack('refillBowl'), true);
  assert.equal(restored.refills, 1);
  restored.creditRefill('refillBowl');
  assert.deepEqual(restored.masteredKeys().sort(), ['refillBowl', 'refillCoffee']);
});

test('Task 0.8: an untouched refill lesson adds nothing to the canonical payload', () => {
  const learning = normalizeMechanicLearning({
    v: MECHANIC_LEARNING_VERSION, proven: ['pantry'], ...createRefillProgress().snapshot(),
  });
  assert.deepEqual(learning, { v: MECHANIC_LEARNING_VERSION, proven: ['pantry'] });
});

test('Task 0.8: a tampered half-credit payload is bounded, never inflated', () => {
  const learning = normalizeMechanicLearning({
    v: MECHANIC_LEARNING_VERSION,
    proven: [],
    sack: ['refillCoffee:sack', 'refillCoffee:sack', 'move:sack', 'refillBowl', 42, {}, null],
    refills: 9999,
  });
  assert.deepEqual(learning.sack, ['refillCoffee:sack'], 'only known, de-duplicated sack marks');
  assert.equal(learning.refills, REFILLS_TO_MASTER, 'the tally is clamped, never trusted');

  assert.deepEqual(normalizeRefillProgress({ refills: -5 }), { sack: [], refills: 0 });
  assert.deepEqual(normalizeRefillProgress({ refills: 1.9 }), { sack: [], refills: 1 });
  assert.deepEqual(normalizeRefillProgress({ refills: 'lots', sack: 'all' }), { sack: [], refills: 0 });
  assert.deepEqual(normalizeRefillProgress(null), { sack: [], refills: 0 });
});

test('Task 0.8: half credit from a foreign payload version is dropped with its proven list', () => {
  const learning = normalizeMechanicLearning({
    v: 999, proven: ['refillCoffee'], sack: ['refillCoffee:sack'], refills: 2,
  });
  assert.deepEqual(learning, { v: MECHANIC_LEARNING_VERSION, proven: [] });
});

test('Task 30: exact adaptive escalation is natural -> pulse -> route', () => {
  assert.equal(coachEscalationStage(0), 'natural');
  assert.equal(coachEscalationStage(2.999), 'natural');
  assert.equal(coachEscalationStage(3), 'pulse');
  assert.equal(coachEscalationStage(6.999), 'pulse');
  assert.equal(coachEscalationStage(7), 'route');
  assert.equal(coachEscalationStage(30), 'route');
  assert.equal(coachEscalationStage(3, true), 'static');
  assert.equal(coachEscalationStage(30, true), 'static');
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
