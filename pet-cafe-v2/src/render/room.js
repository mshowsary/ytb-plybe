// src/render/room.js — the café building and the street around it. All static, merged into a few meshes.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';

const COL = {
  grass: '#8FCF6E', grassDark: '#78BD5C', walk: '#EFE6D8', curb: '#D9CDBB', road: '#9A9AA4', dash: '#F4F1EA',
  wall: '#F6E7D3', wallLow: '#E7B98F', trim: '#B9834A', backsplash: '#DDEFF2', tileA: '#FBF7F0', tileB: '#EDE5D8',
  plank: '#E4B98A', plankDark: '#D7A877', window: '#BFE4F5', frame: '#FFFFFF', pot: '#D9785B', leaf: '#6FBF6A',
  leafDark: '#58A857', trunk: '#8A6240', rug: '#F08A78', rugIn: '#FFE3C4', brass: '#E3B34C',
};

export function createRoom(scene) {
  const { x0, x1, z0, z1, doorX0, doorX1 } = ROOM;
  const P = [];
  const W = x1 - x0, D = z1 - z0;

  // ---- outside: lawn, pavement, road ------------------------------------------------------
  const out = [];
  out.push(part('box', [80, 0.1, 60], COL.grass, { y: -0.08, z: 6 }));
  out.push(part('box', [40, 0.04, 2.2], COL.walk, { x: 3, y: -0.02, z: z1 + 1.35, tex: 'tile' }));
  out.push(part('box', [40, 0.1, 0.18], COL.curb, { x: 3, y: 0, z: z1 + 2.5 }));
  out.push(part('box', [40, 0.02, 4.2], COL.road, { x: 3, y: -0.03, z: z1 + 4.7 }));
  for (let i = -8; i < 12; i++) out.push(part('box', [1.1, 0.021, 0.14], COL.dash, { x: i * 2.2, y: -0.01, z: z1 + 4.7 }));
  // trees and bushes along the pavement and behind the café
  const tree = (x, z, s = 1) => {
    out.push(part('cyl', [0.12 * s, 0.16 * s, 1.3 * s, 7], COL.trunk, { x, y: 0.65 * s, z }));
    out.push(part('sph', [0.85 * s, 10], COL.leaf, { x, y: 1.75 * s, z }));
    out.push(part('sph', [0.6 * s, 9], COL.leafDark, { x: x + 0.45 * s, y: 1.45 * s, z: z + 0.25 * s }));
  };
  tree(-9.5, 6.2, 1.1); tree(9.2, 6.0, 1.0); tree(-10.5, -2, 1.3); tree(10.5, -3.5, 1.2); tree(-3, -8, 1.4); tree(4, -8.5, 1.5);
  for (const [x, z] of [[-8.6, 3.5], [8.4, 2.5], [-8.4, -5.2], [8.6, -1]]) {
    out.push(part('sph', [0.55, 9], COL.leafDark, { x, y: 0.35, z })); out.push(part('sph', [0.42, 9], COL.leaf, { x: x + 0.35, y: 0.3, z: z + 0.2 }));
  }
  const outside = mesh(out); outside.castShadow = false; scene.add(outside);

  // ---- floors: tiles in the kitchen, planks on the dining floor -----------------------------
  const kitchenD = -2.0 - z0;
  P.push(part('box', [W, 0.1, kitchenD], COL.tileA, { x: (x0 + x1) / 2, y: -0.05, z: z0 + kitchenD / 2, tex: 'tile', texScale: 0.5 }));
  P.push(part('box', [W, 0.1, z1 + 2.0], COL.plank, { x: (x0 + x1) / 2, y: -0.05, z: (z1 - 2.0) / 2, tex: 'wood', texScale: 0.8 }));
  for (let i = 0; i < 14; i++) P.push(part('box', [W, 0.101, 0.025], COL.plankDark, { x: (x0 + x1) / 2, y: -0.049, z: -1.75 + i * 0.5 }));
  // a round rug under the dining tables
  P.push(part('cyl', [3.3, 3.3, 0.015, 36], COL.rug, { x: -1.0, y: 0.008, z: 2.6, sz: 0.6 }));
  P.push(part('cyl', [2.95, 2.95, 0.017, 36], COL.rugIn, { x: -1.0, y: 0.01, z: 2.6, sz: 0.58 }));
  // doormat
  P.push(part('box', [1.4, 0.02, 0.7], '#B5654A', { x: (doorX0 + doorX1) / 2, y: 0.01, z: z1 - 0.5 }));

  // ---- walls ------------------------------------------------------------------------------
  const H = 3.0, T = 0.25;
  // back wall: warm plaster, a tiled splash behind the kitchen, two windows over the empty right half
  P.push(part('box', [W + T * 2, H, T], COL.wall, { x: (x0 + x1) / 2, y: H / 2, z: z0 - T / 2, tex: 'plaster' }));
  P.push(part('box', [W, 1.5, 0.03], COL.backsplash, { x: (x0 + x1) / 2, y: 0.95, z: z0 + 0.02, tex: 'tile', texScale: 0.35 }));
  P.push(part('box', [W + T * 2, 0.12, T + 0.06], COL.trim, { x: (x0 + x1) / 2, y: H, z: z0 - T / 2 }));
  for (const wx of [0.5, 2.5]) {
    P.push(part('box', [1.8, 1.2, 0.04], COL.window, { x: wx, y: 2.05, z: z0 + 0.04 }));
    P.push(part('box', [1.95, 0.1, 0.12], COL.frame, { x: wx, y: 2.7, z: z0 + 0.06 }));
    P.push(part('box', [1.95, 0.1, 0.18], COL.frame, { x: wx, y: 1.4, z: z0 + 0.08 }));
    P.push(part('box', [0.08, 1.2, 0.1], COL.frame, { x: wx, y: 2.05, z: z0 + 0.06 }));
  }
  // a long shelf with jars above the ovens
  P.push(part('box', [5.6, 0.07, 0.34], COL.trim, { x: -3.6, y: 2.25, z: z0 + 0.2, tex: 'wood' }));
  const jarCols = ['#F7C8A0', '#FFE08A', '#C9E7B0', '#F5B0C0', '#BFD9F2'];
  for (let i = 0; i < 9; i++) {
    const jx = -6.1 + i * 0.62;
    P.push(part('cyl', [0.11, 0.11, 0.26, 10], jarCols[i % 5], { x: jx, y: 2.42, z: z0 + 0.2 }));
    P.push(part('cyl', [0.12, 0.12, 0.05, 10], COL.trim, { x: jx, y: 2.58, z: z0 + 0.2 }));
  }
  // left wall: plaster, a wainscot, a window and two framed pet pictures
  P.push(part('box', [T, H, D], COL.wall, { x: x0 - T / 2, y: H / 2, z: (z0 + z1) / 2, tex: 'plaster' }));
  P.push(part('box', [0.04, 1.0, D], COL.wallLow, { x: x0 + 0.02, y: 0.5, z: (z0 + z1) / 2, tex: 'wood' }));
  P.push(part('box', [0.08, 0.08, D], COL.trim, { x: x0 + 0.04, y: 1.02, z: (z0 + z1) / 2 }));
  P.push(part('box', [T + 0.06, 0.12, D + 0.5], COL.trim, { x: x0 - T / 2, y: H, z: (z0 + z1) / 2 }));
  P.push(part('box', [0.04, 1.1, 1.6], COL.window, { x: x0 + 0.03, y: 2.0, z: 1.2 }));
  P.push(part('box', [0.1, 1.24, 0.1], COL.frame, { x: x0 + 0.05, y: 2.0, z: 0.4 }));
  P.push(part('box', [0.1, 1.24, 0.1], COL.frame, { x: x0 + 0.05, y: 2.0, z: 2.0 }));
  P.push(part('box', [0.46, 0.08, 1.8], COL.frame, { x: x0 + 0.23, y: 1.42, z: 1.2 }));      // a deep sill: the cat sleeps here
  for (const [pz, c] of [[-0.9, '#F5A25D'], [3.0, '#8FD3FF']]) {
    P.push(part('box', [0.06, 0.62, 0.52], COL.trim, { x: x0 + 0.04, y: 1.95, z: pz }));
    P.push(part('box', [0.07, 0.5, 0.4], c, { x: x0 + 0.05, y: 1.95, z: pz }));
    P.push(part('sph', [0.12, 8], '#FFFFFF', { x: x0 + 0.09, y: 1.92, z: pz, sx: 0.4 }));
  }
  // right wall: a low half-wall with a sill, so the camera sees over it into the room
  P.push(part('box', [T, 1.0, D], COL.wallLow, { x: x1 + T / 2, y: 0.5, z: (z0 + z1) / 2, tex: 'wood' }));
  P.push(part('box', [T + 0.14, 0.08, D + 0.3], COL.trim, { x: x1 + T / 2, y: 1.02, z: (z0 + z1) / 2 }));
  for (let i = 0; i < 5; i++) P.push(part('cyl', [0.05, 0.05, 1.9, 6], COL.trim, { x: x1 + T / 2, y: 2.0, z: z0 + 0.1 + i * (D - 0.2) / 4 }));
  P.push(part('box', [T + 0.06, 0.12, D + 0.3], COL.trim, { x: x1 + T / 2, y: H, z: (z0 + z1) / 2 }));
  // front: a low planter wall either side of the door, flowers in it
  const planter = (a, b) => {
    const len = b - a, mx = (a + b) / 2;
    P.push(part('box', [len, 0.55, 0.34], COL.wallLow, { x: mx, y: 0.275, z: z1, tex: 'wood' }));
    P.push(part('box', [len + 0.04, 0.06, 0.42], COL.trim, { x: mx, y: 0.57, z: z1 }));
    P.push(part('box', [len - 0.1, 0.05, 0.26], '#6B4A33', { x: mx, y: 0.56, z: z1 }));
    const flowers = ['#FF8A80', '#FFD84D', '#FFFFFF', '#C79BFF', '#FF9EBB'];
    for (let fx = a + 0.25, k = 0; fx < b - 0.15; fx += 0.34, k++) {
      P.push(part('sph', [0.13, 7], k % 2 ? COL.leaf : COL.leafDark, { x: fx, y: 0.68, z: z1 }));
      P.push(part('sph', [0.06, 6], flowers[k % flowers.length], { x: fx + 0.05, y: 0.8, z: z1 + 0.06 }));
    }
  };
  planter(x0 - T, doorX0); planter(doorX1, x1 + T);
  // door frame posts and a paw sign over the door
  for (const px of [doorX0, doorX1]) P.push(part('box', [0.14, 2.3, 0.3], COL.trim, { x: px, y: 1.15, z: z1 }));
  P.push(part('box', [doorX1 - doorX0 + 0.14, 0.18, 0.3], COL.trim, { x: (doorX0 + doorX1) / 2, y: 2.35, z: z1 }));
  P.push(part('cyl', [0.34, 0.34, 0.06, 20], '#FFF4E6', { x: (doorX0 + doorX1) / 2, y: 2.75, z: z1, rx: Math.PI / 2 }));
  P.push(part('sph', [0.1, 8], '#F08A78', { x: (doorX0 + doorX1) / 2, y: 2.7, z: z1 + 0.04, sz: 0.4 }));
  for (const [dx, dy] of [[-0.14, 0.14], [0, 0.19], [0.14, 0.14]]) P.push(part('sph', [0.045, 6], '#F08A78', { x: (doorX0 + doorX1) / 2 + dx, y: 2.7 + dy - 0.05, z: z1 + 0.04, sz: 0.4 }));
  // the bar end left of the till (closes the service line against the left wall)
  P.push(part('rbox', [x0 < -6.3 ? -6.3 - x0 : 0.7, 1.0, 0.8, 0.05], COL.trim, { x: (x0 - 6.3) / 2, y: 0.5, z: -1.6, tex: 'wood' }));
  P.push(part('box', [-6.3 - x0 + 0.05, 0.07, 0.9], '#F3E4CC', { x: (x0 - 6.3) / 2, y: 1.03, z: -1.6 }));

  // ---- the rest of a working kitchen: a sink and a fridge in the back-right corner ----------
  const SX = 2.95;
  P.push(part('rbox', [1.1, 0.9, 0.8, 0.05], '#DCE6EA', { x: SX, y: 0.45, z: z0 + 0.45 }));
  P.push(part('box', [1.14, 0.05, 0.84], '#9FB1BA', { x: SX, y: 0.92, z: z0 + 0.45 }));
  P.push(part('box', [0.56, 0.06, 0.45], '#7E939C', { x: SX, y: 0.93, z: z0 + 0.45 }));
  P.push(part('cyl', [0.025, 0.025, 0.3, 6], '#C9D3D8', { x: SX, y: 1.08, z: z0 + 0.16 }));
  P.push(part('box', [0.04, 0.04, 0.2], '#C9D3D8', { x: SX, y: 1.22, z: z0 + 0.25 }));
  for (let i = 0; i < 3; i++) P.push(part('cyl', [0.1, 0.1, 0.02, 12], '#FFFFFF', { x: SX + 0.3, y: 0.96 + i * 0.022, z: z0 + 0.55 }));

  // ---- décor: potted plants in the corners ----------------------------------------------
  const plant = (x, z, s = 1) => {
    P.push(part('cyl', [0.26 * s, 0.2 * s, 0.4 * s, 10], COL.pot, { x, y: 0.2 * s, z }));
    P.push(part('sph', [0.36 * s, 9], COL.leaf, { x, y: 0.62 * s, z }));
    P.push(part('sph', [0.26 * s, 8], COL.leafDark, { x: x + 0.16 * s, y: 0.82 * s, z: z - 0.08 * s }));
  };
  plant(-6.55, 4.55); plant(-6.55, 0.2, 0.8);

  const room = mesh(P); room.castShadow = true; room.receiveShadow = true; scene.add(room);

  return { mesh: room };
}
