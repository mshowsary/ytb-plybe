import test from 'node:test';
import assert from 'node:assert/strict';
import { roombaOfferFor, ROOMBA_REWARD_ID } from '../src/systems/economyExperience.js';

function state(count = 3) {
  return {
    coins: 500,
    staff: { runner: 0, cashier: 0, cleaner: 0 },
    staffLevels: { runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 } },
    up: { speed: 0, carry: 0, income: 0 },
    customers: Array.from({ length: 4 }, (_, i) => ({ id: i, state: 'eating', mood: 'none', patience: 17, done: false })),
    dayState: { day: 3, phase: 'rush' },
    dayStats: { serviceMisses: 0 },
    time: 120,
    petMess: { count, roombaActive: false, sweep() { return this.count; } },
  };
}
function world() { return { stations: new Map([['hire1', { id: 'hire1', type: 'hire', active: true }]]) }; }

test('Roomba rewarded id is isolated from crew and pet-break rewards', () => {
  assert.equal(ROOMBA_REWARD_ID, 'pet-cafe-roomba-sweep');
});

test('Roomba offer is actionable only for two or more pet pawprint patches', () => {
  assert.equal(roombaOfferFor(state(1), world()), null);
  const r = roombaOfferFor(state(3), world());
  assert.equal(r.mode, 'roomba');
  assert.equal(r.key, 'roomba');
  assert.equal(r.duration, 18);
  assert.match(r.detail, /Dirty tables still belong/);
});

test('Roomba offer disappears while a sweep is already active', () => {
  const G = state(3); G.petMess.roombaActive = true;
  assert.equal(roombaOfferFor(G, world()), null);
});
