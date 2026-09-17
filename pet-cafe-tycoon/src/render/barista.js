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

// The Runner's line badge — a coloured apron panel in the colour of the product that runner looks
// after, with a matching cap band.
//
// The owner's day-18 report ran "the hire logic is chaos: the first Runner I hire, with no
// assignment, fills cookies, cupcakes, smoothies, coffee." Runners CAN be assigned to one counter
// (sim/staff.js `assign`), but the assignment lived only as a chip inside a menu, so from the play
// field every worker in a chef cap looked identical and every one of them looked like it was doing
// everything at random. Wearing the line makes "that one is on cupcakes" something you read off the
// floor, which is the whole point of assigning them.
//
// Its own material, not the shared toon one, so setColor() recolours a live worker the instant the
// player moves them to another counter. One extra draw call per runner.
export function runnerApronMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(C.cream) });
  // A TABARD, not a bib: front AND back panels plus a band right round the cap. A worker walking
  // away from the camera is the common case in a top-down cafe -- they spend half the shift with
  // their back to you on the way to an oven -- so a chest-only badge would be invisible exactly
  // when you most want to know who just walked off with the tray.
  const m = new THREE.Mesh(merge([
    part('rbox', [0.46, 0.46, 0.05, 0.022], '#FFFFFF', { y: 0.86, z: 0.245 }),   // front panel
    part('rbox', [0.46, 0.46, 0.05, 0.022], '#FFFFFF', { y: 0.86, z: -0.245 }),  // back panel
    part('box', [0.52, 0.05, 0.055], '#FFFFFF', { y: 1.04, z: 0.252 }),          // waist tie
    part('box', [0.52, 0.05, 0.055], '#FFFFFF', { y: 1.04, z: -0.252 }),
    part('box', [0.10, 0.44, 0.05], '#FFFFFF', { x: -0.14, y: 1.20, z: 0.245 }), // shoulder straps
    part('box', [0.10, 0.44, 0.05], '#FFFFFF', { x: 0.14, y: 1.20, z: 0.245 }),
    part('box', [0.50, 0.065, 0.44], '#FFFFFF', { y: 1.80 }),                    // cap band, all round
  ]), mat);
  m.castShadow = false; m.receiveShadow = true;
  g.add(m);
  // White vertex colours above, so the material's own colour IS the badge colour.
  g.setColor = hex => mat.color.set(hex);
  return g;
}
