import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { coffeeCupGeometry, espressoDetailMesh, createCoffeePolish } from '../src/render/coffeePolish.js';

test('coffee and latte use authored cup geometry with baked vertex colors', () => {
  const coffee = coffeeCupGeometry(false), latte = coffeeCupGeometry(true);
  assert.ok(coffee.getAttribute('position').count > 40);
  assert.ok(coffee.getAttribute('color'));
  assert.ok(latte.getAttribute('position').count > coffee.getAttribute('position').count);
  assert.equal(coffeeCupGeometry(false), coffee);
  assert.equal(coffeeCupGeometry(true), latte);
});

test('espresso detail stays compact: one merged render mesh with recognizable front depth', () => {
  const g = espressoDetailMesh();
  let meshes = 0, positions = 0;
  g.traverse(o => { if (o.isMesh) { meshes++; positions += o.geometry.getAttribute('position').count; } });
  assert.equal(meshes, 1);
  assert.ok(positions > 100);
});

test('coffee polish follows station activation and only swaps carried coffee-family geometry', () => {
  const coffeeSt = { id: 'coffee1', type: 'coffee', x: 2, z: -1, rot: Math.PI / 2, active: false };
  const world = { stations: new Map([['coffee1', coffeeSt], ['oven1', { id: 'oven1', type: 'oven', active: true }]]) };
  const scene = new THREE.Scene();
  const coffee = new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2)); coffee.userData.product = 'coffee';
  const cookieGeo = new THREE.BoxGeometry(.2,.2,.2); const cookie = new THREE.Mesh(cookieGeo); cookie.userData.product = 'cookie';
  const owner = { items: [coffee, cookie] };
  const polish = createCoffeePolish(world, scene, owner);
  assert.equal(polish.details.length, 1);
  assert.equal(polish.details[0].g.visible, false);
  coffeeSt.active = true; polish.update();
  assert.equal(polish.details[0].g.visible, true);
  assert.equal(coffee.userData.coffeePolished, true);
  assert.notEqual(coffee.geometry.type, 'BoxGeometry');
  assert.equal(cookie.geometry, cookieGeo);
});
