// Lightweight authored uniform overlay for the live Barista. Kept as one merged draw call so the
// specialist reads differently from a Runner without changing the shared human renderer.
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { C, toonMaterial } from './palette.js';

export function baristaUniformMesh() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(merge([
    // Cream café apron over the teal shirt.
    part('rbox', [0.50, 0.52, 0.055, 0.025], C.cream, { y: 0.88, z: 0.245 }),
    part('box', [0.55, 0.055, 0.060], C.woodDark, { y: 1.06, z: 0.255 }),
    // Small coffee-brown pocket and coral service towel.
    part('rbox', [0.23, 0.14, 0.025, 0.018], '#6B4A2B', { x: 0.10, y: 0.78, z: 0.286 }),
    part('rbox', [0.11, 0.30, 0.035, 0.018], C.coral, { x: -0.28, y: 0.69, z: 0.22, rz: 0.08 }),
    // Two tiny bean shapes make the chest badge read as coffee even at gameplay scale.
    part('sph', [0.042, 8], '#6B4A2B', { x: -0.07, y: 1.00, z: 0.298, sx: 0.72, sy: 1.18, rz: 0.42 }),
    part('sph', [0.042, 8], '#8A5A2B', { x: 0.01, y: 1.00, z: 0.298, sx: 0.72, sy: 1.18, rz: -0.42 }),
    // Short cream/brown barista visor: visually separate from the Runner's chef cap.
    part('rbox', [0.53, 0.075, 0.46, 0.035], C.cream, { y: 1.91, z: 0.01 }),
    part('box', [0.34, 0.045, 0.22], C.woodDark, { y: 1.88, z: 0.29 }),
  ]), toonMaterial());
  m.castShadow = false; m.receiveShadow = true;
  g.add(m);
  return g;
}
