// src/render/roomBeach.js — the Beach Shack: an open wooden deck on the sand with the sea behind it.
// Same footprint as the town café (x -7..3.6, z -5..5, door front-right), so the same floor plan works;
// only the walls become low bamboo railings so the beach and the sea are always in view.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';

const C = {
  sand: '#F4DDA8', sandDark: '#E8C98A', sea: '#3FB8D8', seaDeep: '#2A94C4', foam: '#FFFFFF',
  deck: '#E7C08A', deckDark: '#D4A96E', bamboo: '#D9B46A', bambooD: '#B38B45', thatch: '#D8B25E',
  palm: '#8A6240', leaf: '#4FB86A', leafD: '#3E9E58', towelA: '#FF7FA8', towelB: '#3FB6A8', umbA: '#FF6F61', umbB: '#FFFFFF',
};

export function createBeachRoom(scene) {
  const { x0, x1, z0, z1, doorX0, doorX1 } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const out = [];
  // sand, a wet band at the shore, and the sea behind the shack
  out.push(part('box', [90, 0.1, 70], C.sand, { y: -0.08, z: 5, tex: 'plaster', texScale: 2 }));
  out.push(part('box', [90, 0.02, 3], C.sandDark, { y: -0.025, z: z0 - 3.5 }));
  out.push(part('box', [90, 0.04, 40], C.sea, { y: -0.04, z: z0 - 25 }));
  out.push(part('box', [90, 0.041, 24], C.seaDeep, { y: -0.035, z: z0 - 36 }));
  for (let i = -9; i < 10; i++) out.push(part('box', [2.6, 0.045, 0.16], C.foam, { x: i * 4.4 + (i % 2) * 1.2, y: -0.02, z: z0 - 5.2 + (i % 3) * 0.3 }));
  // the boardwalk the guests arrive on
  out.push(part('box', [40, 0.06, 1.8], C.deckDark, { x: 3, y: -0.01, z: z1 + 2.2, tex: 'wood' }));
  for (let i = -8; i < 12; i++) out.push(part('box', [0.05, 0.061, 1.8], '#B98A55', { x: i * 1.1, y: -0.009, z: z1 + 2.2 }));
  // palms
  const palm = (x, z, s = 1, lean = 0.15) => {
    for (let k = 0; k < 6; k++) out.push(part('cyl', [0.12 * s, 0.14 * s, 0.6 * s, 7], k % 2 ? C.palm : '#9C734C', { x: x + lean * k * 0.3 * s, y: (0.3 + k * 0.58) * s, z }));
    const tx = x + lean * 1.8 * s, ty = 3.6 * s;
    for (let a = 0; a < 6; a++) {
      const ang = a / 6 * Math.PI * 2;
      out.push(part('box', [1.5 * s, 0.05, 0.36 * s], a % 2 ? C.leaf : C.leafD, { x: tx + Math.cos(ang) * 0.65 * s, y: ty - 0.18, z: z + Math.sin(ang) * 0.65 * s, ry: -ang, rz: -0.35 }));
    }
    out.push(part('sph', [0.14 * s, 7], '#6B4A2A', { x: tx + 0.1, y: ty - 0.25, z: z + 0.1 }));
    out.push(part('sph', [0.14 * s, 7], '#6B4A2A', { x: tx - 0.12, y: ty - 0.28, z: z - 0.05 }));
  };
  palm(-9.2, 5.5, 1.1); palm(6.5, 6.8, 1.0, -0.2); palm(-10, -3, 1.2); palm(7.8, -2.5, 1.15, -0.15); palm(-5, -8.2, 1.0); palm(4.8, -8.5, 1.1);
  // umbrellas, towels, a surfboard and a sandcastle on the beach around the shack
  const umbrella = (x, z, a, b) => {
    out.push(part('cyl', [0.03, 0.03, 2.2, 6], '#EDEDED', { x, y: 1.1, z }));
    for (let k = 0; k < 8; k++) out.push(part('cone', [0.9, 0.35, 3], k % 2 ? a : b, { x, y: 2.25, z, ry: k / 8 * Math.PI * 2, sx: 1, sz: 0.5 }));
  };
  umbrella(-8.8, 1.5, C.umbA, C.umbB); umbrella(6.2, 2.2, C.towelB, C.umbB); umbrella(8.8, 8.5, '#F7C948', C.umbB);
  out.push(part('box', [0.8, 0.02, 1.6], C.towelA, { x: -8.6, y: 0.01, z: 2.6 }), part('box', [0.8, 0.02, 1.6], C.towelB, { x: 6.9, y: 0.01, z: 3.2, ry: 0.3 }));
  out.push(part('rbox', [0.5, 1.9, 0.08, 0.04], '#FF8A5B', { x: 4.1, y: 0.95, z: 4.3, rx: -0.25 }));
  out.push(part('cyl', [0.34, 0.4, 0.3, 8], C.sandDark, { x: -7.8, y: 0.12, z: 7.8 }), part('cyl', [0.18, 0.22, 0.28, 8], C.sandDark, { x: -7.8, y: 0.4, z: 7.8 }));
  const outside = mesh(out); outside.castShadow = false; scene.add(outside);

  // ---- the deck --------------------------------------------------------------------------------
  const P = [];
  P.push(part('box', [W + 0.6, 0.2, D + 0.4], C.deck, { x: (x0 + x1) / 2, y: -0.08, z: (z0 + z1) / 2, tex: 'wood', texScale: 0.8 }));
  for (let i = 0; i < 20; i++) P.push(part('box', [W + 0.6, 0.201, 0.025], C.deckDark, { x: (x0 + x1) / 2, y: -0.079, z: z0 - 0.1 + i * 0.52 }));
  // kitchen floor: a row of bright tiles behind the bar
  P.push(part('box', [W, 0.02, 3.0], '#FFF4DE', { x: (x0 + x1) / 2, y: 0.03, z: z0 + 1.5, tex: 'tile', texScale: 0.5 }));
  // a big round rug of woven straw under the tables
  P.push(part('cyl', [3.3, 3.3, 0.015, 36], '#E9C98C', { x: -1.0, y: 0.025, z: 2.6, sz: 0.6 }));
  P.push(part('cyl', [2.95, 2.95, 0.017, 36], '#F6DFAE', { x: -1.0, y: 0.027, z: 2.6, sz: 0.58 }));

  // the back of the bar: a low bamboo wall with tiki posts, shelves of bottles and a thatched top
  P.push(part('box', [W, 1.1, 0.2], C.bamboo, { x: (x0 + x1) / 2, y: 0.55, z: z0 - 0.05, tex: 'wood' }));
  for (let x = x0; x <= x1 + 0.01; x += (W / 6)) {
    P.push(part('cyl', [0.12, 0.14, 2.9, 8], C.bambooD, { x, y: 1.45, z: z0 - 0.05 }));
    P.push(part('cyl', [0.16, 0.16, 0.1, 8], '#F29A38', { x, y: 2.95, z: z0 - 0.05 }));
  }
  P.push(part('box', [W + 0.6, 0.35, 0.8], C.thatch, { x: (x0 + x1) / 2, y: 3.05, z: z0 - 0.1 }));
  for (let i = 0; i < 26; i++) P.push(part('cone', [0.2, 0.5, 4], i % 2 ? C.thatch : '#C9A04E', { x: x0 + 0.1 + i * (W / 25), y: 2.7, z: z0 + 0.25, rx: Math.PI }));
  P.push(part('box', [W, 0.06, 0.3], C.bambooD, { x: (x0 + x1) / 2, y: 1.9, z: z0 + 0.1 }));
  const bottle = ['#3FB6A8', '#FF7FA8', '#F7C948', '#8FD8F0', '#FF8A5B'];
  for (let i = 0; i < 12; i++) P.push(part('cyl', [0.06, 0.07, 0.3, 8], bottle[i % 5], { x: x0 + 0.5 + i * 0.85, y: 2.08, z: z0 + 0.1 }));
  // side and front railings: rope between bamboo posts, low enough to see the beach over
  const rail = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.2));
    for (let k = 0; k <= n; k++) P.push(part('cyl', [0.07, 0.08, 1.0, 7], C.bambooD, { x: ax + (bx - ax) * k / n, y: 0.5, z: az + (bz - az) * k / n }));
    const ang = Math.atan2(bz - az, bx - ax);
    P.push(part('cyl', [0.05, 0.05, len, 6], C.bamboo, { x: (ax + bx) / 2, y: 0.98, z: (az + bz) / 2, ry: -ang, rz: Math.PI / 2 }));
    P.push(part('cyl', [0.025, 0.025, len, 5], '#E8D3A6', { x: (ax + bx) / 2, y: 0.6, z: (az + bz) / 2, ry: -ang, rz: Math.PI / 2 }));
  };
  rail(x0, z0, x0, z1); rail(x1, z0, x1, z1); rail(x0, z1, doorX0, z1); rail(doorX1, z1, x1, z1);
  // the entrance: two tiki torches and a surfboard sign
  for (const px of [doorX0, doorX1]) {
    P.push(part('cyl', [0.07, 0.09, 1.8, 7], C.bambooD, { x: px, y: 0.9, z: z1 }));
    P.push(part('cyl', [0.13, 0.09, 0.22, 8], '#6B4A2A', { x: px, y: 1.9, z: z1 }));
  }
  P.push(part('rbox', [1.8, 0.5, 0.08, 0.2], '#3FB6A8', { x: (doorX0 + doorX1) / 2, y: 2.3, z: z1 }));
  P.push(part('rbox', [1.5, 0.12, 0.09, 0.05], '#FFFFFF', { x: (doorX0 + doorX1) / 2, y: 2.3, z: z1 + 0.005 }));
  // the bar end left of the till, in bamboo
  P.push(part('box', [-6.3 - x0, 1.0, 0.8], C.bamboo, { x: (x0 - 6.3) / 2, y: 0.5, z: -1.6, tex: 'wood' }));
  P.push(part('box', [-6.3 - x0 + 0.05, 0.07, 0.9], '#F6E7C8', { x: (x0 - 6.3) / 2, y: 1.03, z: -1.6 }));
  // a sink station where the town has one, and potted palms in the corners
  P.push(part('box', [1.1, 0.9, 0.8], C.bamboo, { x: 2.95, y: 0.45, z: z0 + 0.45 }), part('box', [0.56, 0.06, 0.45], '#7E939C', { x: 2.95, y: 0.93, z: z0 + 0.45 }));
  for (const [px, pz] of [[-6.55, 4.55], [-6.55, 0.2]]) {
    P.push(part('cyl', [0.26, 0.2, 0.4, 10], '#F29A38', { x: px, y: 0.2, z: pz }));
    for (let a = 0; a < 5; a++) P.push(part('box', [0.7, 0.03, 0.2], C.leaf, { x: px + Math.cos(a * 1.25) * 0.3, y: 0.62, z: pz + Math.sin(a * 1.25) * 0.3, ry: -a * 1.25, rz: -0.4 }));
  }
  const deck = mesh(P); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
  return { mesh: deck };
}
