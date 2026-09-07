import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncCarriedItems } from '../src/render/carriedItems.js';
import { itemGeoFor } from '../src/render/props.js';
test('runner replaces a stale product at equal count and retains unchanged meshes', () => {
  const stack = new THREE.Group(), meshes = [];
  syncCarriedItems(stack, meshes, ['cookie', 'cookie']);
  const first = meshes[0], second = meshes[1];
  const simulationItems = ['cupcake', 'cookie'];
  syncCarriedItems(stack, meshes, simulationItems);
  assert.notEqual(meshes[0], first); assert.equal(first.parent, null);
  assert.equal(meshes[0].userData.product, 'cupcake'); assert.equal(meshes[1], second);
  assert.equal(stack.children.length, 2); assert.deepEqual(simulationItems, ['cupcake','cookie']);
  syncCarriedItems(stack, meshes, []); assert.equal(stack.children.length, 0);
});
test('all menu models have finite cached geometry and distinct silhouettes', () => {
  const signatures = new Set();
  for (const key of ['cookie','cupcake','coffee','smoothie','treat','brownie','latte']) {
    const g = itemGeoFor(key); assert.equal(g, itemGeoFor(key));
    g.computeBoundingBox(); assert.ok(Number.isFinite(g.boundingSphere.radius));
    assert.ok(g.boundingSphere.radius > 0);
    signatures.add(g.getAttribute('position').count + ':' + g.boundingBox.max.y);
  }
  assert.equal(signatures.size, 7);
});
