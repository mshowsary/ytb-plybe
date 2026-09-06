import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAFF_DEMO_SECONDS,
  STAFF_DEMO_MECHANICS,
  hasStaffDemo,
  nextStaffDemoJob,
} from '../src/sim/staffTeaching.js';

function world() {
  return {
    stations: new Map([
      ['dispCookie', { id: 'dispCookie', type: 'display', active: true, front: { x: 3, z: 1 } }],
      ['register1', { id: 'register1', type: 'checkout', active: true, front: { x: -2, z: 0 }, cash: { x: -2.4, z: .2 } }],
    ]),
    _regQueues: new Map([['register1', []]]),
  };
}

test('Task 33: demonstration length is inside the required 2–3 second beat', () => {
  assert.equal(STAFF_DEMO_SECONDS, 2.5);
  assert.ok(STAFF_DEMO_SECONDS >= 2 && STAFF_DEMO_SECONDS <= 3);
});

test('Task 33: runner lesson waits for a real carried delivery to a real active display', () => {
  const w = world();
  const runner = { kind: 'runner', state: 'toOven', target: 'oven1', items: [] };
  assert.equal(nextStaffDemoJob([runner], w, new Set()), null);
  runner.state = 'toCounter'; runner.target = 'dispCookie'; runner.items = ['cookie'];
  const job = nextStaffDemoJob([runner], w, new Set());
  assert.equal(job.role, 'runner');
  assert.equal(job.mechanic, STAFF_DEMO_MECHANICS.runner);
  assert.equal(job.worker, runner);
  assert.deepEqual(job.targetPoint, { x: 3, z: 1 });
});

test('Task 33: cashier lesson requires a genuine queue rather than fabricating checkout work', () => {
  const w = world();
  const cashier = { kind: 'cashier', target: 'register1' };
  assert.equal(nextStaffDemoJob([cashier], w, new Set()), null);
  w._regQueues.set('register1', [{ id: 9 }]);
  const job = nextStaffDemoJob([cashier], w, new Set());
  assert.equal(job.role, 'cashier');
  assert.equal(job.mechanic, STAFF_DEMO_MECHANICS.cashier);
  assert.deepEqual(job.targetPoint, { x: -2.4, z: .2 });
});

test('Task 33: once one employee role was demonstrated no other role repeats the sequence', () => {
  const w = world(); w._regQueues.set('register1', [{ id: 1 }]);
  const runner = { kind: 'runner', state: 'toCounter', target: 'dispCookie', items: ['cookie'] };
  const cashier = { kind: 'cashier', target: 'register1' };
  assert.equal(hasStaffDemo(new Set([STAFF_DEMO_MECHANICS.runner])), true);
  assert.equal(nextStaffDemoJob([runner, cashier], w, new Set([STAFF_DEMO_MECHANICS.runner])), null);
  assert.equal(nextStaffDemoJob([runner, cashier], w, new Set([STAFF_DEMO_MECHANICS.cashier])), null);
});

test('Task 33: cleaner alone cannot trigger a made-up delivery/checkout lesson', () => {
  const w = world();
  const cleaner = { kind: 'cleaner', state: 'toSeat', target: 'seat1', items: [] };
  assert.equal(nextStaffDemoJob([cleaner], w, new Set()), null);
});
