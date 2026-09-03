// test/collide.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { pushOut, stationBoxes } from '../src/sim/collide.js';

test('a circle overlapping a box on its +x side is pushed to x = box.x + hw + r', () => {
  const box = { x: 0, z: 0, hw: 1, hd: 1 };
  const p = { x: 1.1, z: 0 };
  const moved = pushOut(p, 0.2, [box]);
  assert.equal(moved, true);
  assert.ok(Math.abs(p.x - 1.2) < 1e-9, 'p.x=' + p.x);
  assert.ok(Math.abs(p.z - 0) < 1e-9, 'p.z=' + p.z);
});

test('a circle inside the box corner is pushed along the axis with the smallest penetration', () => {
  const box = { x: 0, z: 0, hw: 1, hd: 1 };
  const p = { x: 0.9, z: 0.3 }; // penX = 0.1, penZ = 0.7 → resolve along x
  const moved = pushOut(p, 0.2, [box]);
  assert.equal(moved, true);
  assert.ok(Math.abs(p.x - 1.2) < 1e-9, 'p.x=' + p.x); // box.x + hw + r
  assert.ok(Math.abs(p.z - 0.3) < 1e-9, 'z unchanged'); // z axis untouched
});

test('a non-overlapping circle is untouched and returns false', () => {
  const box = { x: 0, z: 0, hw: 1, hd: 1 };
  const p = { x: 5, z: 5 };
  const moved = pushOut(p, 0.2, [box]);
  assert.equal(moved, false);
  assert.equal(p.x, 5); assert.equal(p.z, 5);
});

test('pushOut resolves against multiple boxes in one call', () => {
  const boxes = [{ x: 0, z: 0, hw: 1, hd: 1 }, { x: 10, z: 10, hw: 1, hd: 1 }];
  const p = { x: 1.05, z: 0 };
  assert.equal(pushOut(p, 0.2, boxes), true);
  assert.ok(Math.abs(p.x - 1.2) < 1e-9);
});

test('stationBoxes: a rotated station (rot pi/2) yields swapped half extents', () => {
  const w = { stations: new Map([
    ['s1', { id: 's1', active: true, x: 2, z: 3, rot: Math.PI / 2, fw: 1.6, fd: 1.2 }],
  ]) };
  const boxes = stationBoxes(w);
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].hw - 0.6) < 1e-9); // fd/2
  assert.ok(Math.abs(boxes[0].hd - 0.8) < 1e-9); // fw/2
  assert.equal(boxes[0].x, 2); assert.equal(boxes[0].z, 3);
});

test('stationBoxes: an unrotated station keeps fw/fd order, and inactive stations are excluded', () => {
  const w = { stations: new Map([
    ['s1', { id: 's1', active: true, x: 0, z: 0, rot: 0, fw: 1.6, fd: 1.2 }],
    ['s2', { id: 's2', active: false, x: 5, z: 5, rot: 0, fw: 2, fd: 2 }],
  ]) };
  const boxes = stationBoxes(w);
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].hw - 0.8) < 1e-9);
  assert.ok(Math.abs(boxes[0].hd - 0.6) < 1e-9);
});

test('stationBoxes: a station lacking fw/fd defaults to a 1x1 footprint', () => {
  const w = { stations: new Map([
    ['s1', { id: 's1', active: true, x: 0, z: 0, rot: 0 }],
  ]) };
  const boxes = stationBoxes(w);
  assert.equal(boxes[0].hw, 0.5); assert.equal(boxes[0].hd, 0.5);
});
