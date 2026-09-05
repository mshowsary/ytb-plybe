import test from 'node:test';
import assert from 'node:assert/strict';
import { STAFF, hire, hireCost } from '../src/sim/economy.js';
import { BARISTA } from '../src/sim/barista.js';
import { buildKioskModel } from '../src/ui/models.js';

function state(day = 5, coins = 2300) {
  return {
    coins, dayState: { day, phase: 'morning' },
    up: { speed: 0, carry: 0, income: 0 },
    staff: { runner: 0, cashier: 0, cleaner: 0, barista: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    staffList: [], machineLevels: { oven: 0, coffee: 0, display: 0 }, stars: {},
  };
}
function world({ coffee = true, desk = true } = {}) {
  const stations = new Map();
  stations.set('hire1', { id: 'hire1', type: 'hire', active: desk });
  return { stations, built: new Set(coffee ? ['z_hire', 'z_coffee'] : ['z_hire']), displays: [], area: { zones: [] } };
}

test('live Barista price has one source of truth in STAFF', () => {
  assert.equal(STAFF.barista.costs[0], 2300);
  assert.equal(BARISTA.cost, STAFF.barista.costs[0]);
  assert.equal(BARISTA.speed, STAFF.barista.speed);
  assert.equal(BARISTA.carry, STAFF.barista.carry);
});

test('normal hire transaction can buy exactly one Barista', () => {
  const G = state(5, 5000);
  assert.equal(hireCost('barista', G.staff), 2300);
  const r = hire(G, 'barista');
  assert.equal(r.ok, true); assert.equal(r.cost, 2300); assert.equal(G.staff.barista, 1); assert.equal(G.coins, 2700);
  assert.equal(hire(G, 'barista').ok, false);
});

test('Workers sheet gates Barista behind Day 5 and Coffee build', () => {
  let G = state(4, 9999);
  let row = buildKioskModel(G, world(), 'workers').workers.find(r => r.kind === 'barista');
  assert.equal(row.hireDisabled, true); assert.match(row.desc, /Day 5/);

  G = state(5, 9999);
  row = buildKioskModel(G, world({ coffee: false }), 'workers').workers.find(r => r.kind === 'barista');
  assert.equal(row.hireDisabled, true); assert.match(row.desc, /Build Coffee/);

  row = buildKioskModel(G, world({ coffee: true }), 'workers').workers.find(r => r.kind === 'barista');
  assert.equal(row.hireDisabled, false); assert.equal(row.hireCost, 2300); assert.equal(row.showLevels, false);
});
