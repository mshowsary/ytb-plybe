import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPreviewKind, semanticBuildGhost } from '../src/render/buildPreview.js';
import {
  BUILD_ANTICIPATION_SECONDS,
  BUILD_REVEAL_SECONDS,
  BUILD_SETTLE_SECONDS,
  BUILD_REVEAL_TOTAL_SECONDS,
  buildRevealPhase,
  buildRevealScale,
} from '../src/render/buildReveal.js';

function boundsOf(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

function meshCount(object) {
  let count = 0;
  object.traverse(n => { if (n.isMesh) count++; });
  return count;
}

test('Task 32: known build spots use the authored future station silhouette', () => {
  for (const type of ['oven', 'display', 'seat', 'hire', 'coffee', 'bowl', 'blender']) {
    assert.equal(buildPreviewKind({ type }), 'semantic', type);
    const ghost = semanticBuildGhost({ type }, 2.4, 1.2);
    assert.equal(ghost.userData.buildPreview, 'semantic', type);
    assert.equal(ghost.userData.stationType, type, type);
    assert.ok(meshCount(ghost) >= 1, `${type} must render an authored silhouette`);
    const size = boundsOf(ghost);
    // The authored treat bowl is deliberately low-profile (~0.17m). This threshold only proves
    // the semantic preview has real vertical form and cannot be mistaken for the old floor ghost.
    assert.ok(size.y > 0.12, `${type} preview must rise visibly above the floor; y=${size.y}`);
  }
});

test('Task 32: semantic ghost materials stay translucent, unlit and non-shadowing', () => {
  const ghost = semanticBuildGhost({ type: 'hire' }, 2.4, 1.2);
  let checked = 0;
  ghost.traverse(n => {
    if (!n.isMesh) return;
    checked++;
    assert.equal(n.material.type, 'MeshBasicMaterial');
    assert.equal(n.material.transparent, true);
    assert.ok(n.material.opacity > 0 && n.material.opacity <= 0.25);
    assert.equal(n.material.depthWrite, false);
    assert.equal(n.castShadow, false);
    assert.equal(n.receiveShadow, false);
  });
  assert.ok(checked > 0);
});

test('Task 32: unknown future object falls back safely to the old footprint ghost', () => {
  assert.equal(buildPreviewKind({ type: 'future-mystery' }), 'footprint');
  const ghost = semanticBuildGhost({ type: 'future-mystery' }, 2, 1);
  assert.equal(ghost.userData.buildPreview, 'footprint');
  assert.equal(ghost.isMesh, true);
  const size = boundsOf(ghost);
  assert.ok(size.y < 0.1);
});

test('Task 32: reveal uses the exact anticipation -> reveal -> settle timing contract', () => {
  assert.equal(BUILD_ANTICIPATION_SECONDS, 0.15);
  assert.equal(BUILD_REVEAL_SECONDS, 0.35);
  assert.equal(BUILD_SETTLE_SECONDS, 0.20);
  assert.equal(BUILD_REVEAL_TOTAL_SECONDS, 0.70);
  assert.equal(buildRevealPhase(0.149), 'anticipation');
  assert.equal(buildRevealPhase(0.15), 'reveal');
  assert.equal(buildRevealPhase(0.499), 'reveal');
  assert.equal(buildRevealPhase(0.50), 'settle');
  assert.equal(buildRevealPhase(0.699), 'settle');
  assert.equal(buildRevealPhase(0.70), 'done');
});

test('Task 32: reveal is hidden during anticipation, overshoots gently, then settles to one', () => {
  assert.equal(buildRevealScale(0.10), 0);
  const middle = buildRevealScale(0.32);
  assert.ok(middle > 0 && middle < 1.09);
  const settle = buildRevealScale(0.55);
  assert.ok(settle >= 1 && settle <= 1.08);
  assert.equal(buildRevealScale(1), 1);
  assert.equal(buildRevealScale(0.16, true), 1);
});
