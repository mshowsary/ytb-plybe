import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_ARM_SECONDS, insideBuildFootprint, stepBuildIntent } from '../src/sim/buildIntent.js';

test('walking across a build footprint never arms payment', () => {
  const state = { t: 0 };
  let r;
  for (let i = 0; i < 120; i++) r = stepBuildIntent(state, true, 1.2, 1 / 60);
  assert.equal(r.armed, false);
  assert.equal(state.t, 0);
});

test('standing still must deliberately dwell before payment arms', () => {
  const state = { t: 0 };
  let r;
  for (let t = 0; t < BUILD_ARM_SECONDS - 0.05; t += 0.05) r = stepBuildIntent(state, true, 0, 0.05);
  assert.equal(r.armed, false);
  r = stepBuildIntent(state, true, 0, 0.1);
  assert.equal(r.armed, true);
});

test('leaving or moving resets build intent', () => {
  const state = { t: 0 };
  stepBuildIntent(state, true, 0, 0.4);
  stepBuildIntent(state, false, 0, 0.05);
  assert.equal(state.t, 0);
  stepBuildIntent(state, true, 0, 0.4);
  stepBuildIntent(state, true, 1, 0.05);
  assert.equal(state.t, 0);
});

test('build footprint uses the actual rotated rectangle instead of a generic circle', () => {
  const zone = { x: 0, z: 0 };
  assert.equal(insideBuildFootprint({ x: 0.9, z: 0 }, zone, 2, 1, 0, 0), true);
  assert.equal(insideBuildFootprint({ x: 0, z: 0.7 }, zone, 2, 1, 0, 0), false);
  assert.equal(insideBuildFootprint({ x: 0, z: 0.9 }, zone, 2, 1, Math.PI / 2, 0), true);
});
