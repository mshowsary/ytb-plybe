import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceFrictionCost, frictionSeverity, SERVICE_FRICTION_DAILY_CAP } from '../src/sim/serviceFriction.js';

test('service friction fees scale by severity instead of charging one flat amount', () => {
  assert.equal(serviceFrictionCost('shelfWait', 0, 100), 2);
  assert.equal(serviceFrictionCost('shelfWait', 1, 100), 5);
  assert.equal(serviceFrictionCost('substitute', 0, 100), 4);
  assert.equal(serviceFrictionCost('substitute', 1, 100), 8);
  assert.equal(serviceFrictionCost('registerWait', 0, 100), 3);
  assert.equal(serviceFrictionCost('registerWait', 1, 100), 7);
});

test('service friction is wallet-capped and shift-cap aware', () => {
  assert.equal(SERVICE_FRICTION_DAILY_CAP, 40);
  assert.equal(serviceFrictionCost('registerWait', 1, 4, 40), 4);
  assert.equal(serviceFrictionCost('registerWait', 1, 100, 2), 2);
  assert.equal(serviceFrictionCost('registerWait', 1, 0, 40), 0);
  assert.equal(serviceFrictionCost('unknown', 1, 100, 40), 0);
});

test('wait severity ramps only after the soft threshold and saturates at the severe threshold', () => {
  assert.equal(frictionSeverity(1, 2.5, 6), 0);
  assert.equal(frictionSeverity(2.5, 2.5, 6), 0);
  assert.ok(frictionSeverity(4, 2.5, 6) > 0 && frictionSeverity(4, 2.5, 6) < 1);
  assert.equal(frictionSeverity(8, 2.5, 6), 1);
});
