import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { baristaUniformMesh } from '../src/render/barista.js';
import { coffeeCupGeometry } from '../src/render/coffeePolish.js';

test('Barista uniform is a compact one-draw-call authored overlay', () => {
  const g = baristaUniformMesh();
  assert.equal(g.children.length, 1);
  const m = g.children[0];
  assert.equal(m.isMesh, true);
  assert.equal(m.castShadow, false);
  m.geometry.computeBoundingBox();
  const box = m.geometry.boundingBox;
  const size = new THREE.Vector3(); box.getSize(size);
  assert.ok(size.x > 0.5 && size.x < 1.0);
  assert.ok(size.y > 1.1 && size.y < 2.2);
  assert.ok(size.z > 0.25 && size.z < 0.8);
});

test('coffee and latte cup geometry stay distinct cached drink silhouettes', () => {
  const coffee = coffeeCupGeometry(false), latte = coffeeCupGeometry(true);
  assert.equal(coffee, coffeeCupGeometry(false));
  assert.equal(latte, coffeeCupGeometry(true));
  assert.notEqual(coffee, latte);
  coffee.computeBoundingBox(); latte.computeBoundingBox();
  assert.ok(coffee.boundingBox.max.y > 0.16);
  assert.ok(latte.boundingBox.max.y >= coffee.boundingBox.max.y);
});
