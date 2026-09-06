import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPreviewKind, semanticBuildGhost } from '../src/render/buildPreview.js';

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
