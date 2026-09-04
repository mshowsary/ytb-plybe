import test from 'node:test';
import assert from 'node:assert/strict';
import { rushCrewOfferFor } from '../src/systems/economyExperience.js';
import { applySave } from '../src/sim/save.js';

function world({ readyRunnerWork = true } = {}) {
  const stations = new Map([
    ['register1', { id: 'register1', type: 'checkout', active: true, serving: '' }],
    ['dispCookie', { id: 'dispCookie', type: 'display', active: true, stock: 1, capacity: 8, product: 'cookie' }],
    ['dispCupcake', { id: 'dispCupcake', type: 'display', active: true, stock: 0, capacity: 8, product: 'cupcake' }],
    ['hire1', { id: 'hire1', type: 'hire', active: true }],
  ]);
  if (readyRunnerWork) stations.set('oven1', { id: 'oven1', type: 'oven', active: true, stock: 6, product: 'cookie' });
  return { stations };
}

function levels() {
  return { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } };
}

function baseState(overrides = {}) {
  return {
    coins: 400,
    staff: { runner: 1, cashier: 1, cleaner: 0 },
    staffList: [],
    staffLevels: levels(),
    up: { speed: 0, carry: 0, income: 0 },
    customers: [],
    dayState: { day: 4, phase: 'rush', t: 90 },
    dayStats: { serviceMisses: 0 },
    time: 120,
    ...overrides,
  };
}

test('owned cashier can receive contextual Rush Crew during a real checkout bottleneck', () => {
  const G = baseState({
    customers: [{ id: 1, state: 'atRegister', registerId: 'register1', mood: 'wait', patience: 2.5, done: false }],
  });
  const offer = rushCrewOfferFor(G, world(), { now: 120 });
  assert.ok(offer);
  assert.equal(offer.mode, 'crew');
  assert.equal(offer.role, 'cashier');
  assert.equal(offer.key, 'crew:cashier');
  assert.match(offer.detail, /existing Cashier/i);
});

test('Rush Crew never acts as a free hire and never offers a no-op max-tier reward', () => {
  const customers = [{ id: 1, state: 'atRegister', registerId: 'register1', mood: 'wait', patience: 2.5, done: false }];
  assert.equal(rushCrewOfferFor(baseState({ staff: { runner: 1, cashier: 0, cleaner: 0 }, customers }), world(), { now: 120 }), null);

  const maxed = { runner: { speed: 3, carry: 3 }, cashier: { speed: 3 }, cleaner: { speed: 3 } };
  assert.equal(rushCrewOfferFor(baseState({ staffLevels: maxed, customers }), world(), { now: 120 }), null);
});

function runnerPressure() {
  return [
    { id: 1, state: 'queue', counterId: 'dispCookie', slot: 0, mood: 'wait', patience: 8, wish: { product: 'cookie', treat: false }, done: false },
    { id: 2, state: 'queue', counterId: 'dispCookie', slot: 0, mood: 'wait', patience: 7, wish: { product: 'cookie', treat: false }, done: false },
  ];
}

test('owned runner is selected only when empty-display pressure has matching ready work', () => {
  const G = baseState({ customers: runnerPressure() });
  const offer = rushCrewOfferFor(G, world(), { now: 120 });
  assert.ok(offer);
  assert.equal(offer.role, 'runner');

  assert.equal(
    rushCrewOfferFor(baseState({ customers: runnerPressure() }), world({ readyRunnerWork: false }), { now: 120 }),
    null,
    'a faster Runner cannot help while the requested food is still baking',
  );
});

test('runner carrying the requested product keeps Rush Crew useful even if production just emptied', () => {
  const G = baseState({
    customers: runnerPressure(),
    staffList: [{ kind: 'runner', items: ['cookie'] }],
  });
  const offer = rushCrewOfferFor(G, world({ readyRunnerWork: false }), { now: 120 });
  assert.ok(offer);
  assert.equal(offer.role, 'runner');
});

test('applySave restores rewarded Rush Crew only into that exact same active rush', () => {
  function target() {
    return {
      coins: 0,
      up: { speed: 0, carry: 0, income: 0 },
      staff: { runner: 0, cashier: 0, cleaner: 0 },
      stats: {}, settings: {}, boosts: {},
    };
  }
  function saveFor(phase, day = 4) {
    return {
      coins: 10,
      upgrades: { speed: 0, carry: 0, income: 0 },
      staff: { runner: 1, cashier: 0, cleaner: 0 },
      stats: {}, settings: {},
      staffLevels: levels(), machineLevels: {}, meta: {}, intro: {}, stars: {}, dayStats: {},
      dayState: { day, phase, t: 100 },
      boosts: { rushCrew: { role: 'runner', day: 4 } },
    };
  }

  const active = target();
  applySave(active, saveFor('rush'));
  assert.deepEqual(active.boosts.rushCrew, { role: 'runner', day: 4 });

  const afternoon = target();
  applySave(afternoon, saveFor('afternoon'));
  assert.equal(afternoon.boosts.rushCrew, undefined);

  const laterDay = target();
  applySave(laterDay, saveFor('rush', 5));
  assert.equal(laterDay.boosts.rushCrew, undefined);
});
