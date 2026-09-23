// src/render/townStreet.js — the town around the café: a real street, not a lawn with lollipops.
// Neighbouring shops on both sides (a florist on the left, a bookshop past the side alley on the right),
// a paved pavement with lamps, benches, a bike rack and a mailbox, a road with a crosswalk at the café
// door and cars going by, and a garden with a fence, a shed and full trees behind the café.
//
// The guests' lane (z 7.2, from x 9 to the door and away to the left) is kept clear of every prop.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';

const C = {
  grass: '#86C766', grassD: '#6FB053', paveA: '#E9DFD0', paveB: '#DCCFBC', curb: '#C9BBA6', road: '#6F7580', line: '#F5F1E6',
  brickA: '#D88A6A', brickB: '#C47457', plaster: '#F4E6CF', blue: '#6FA8DC', roofA: '#B5584A', roofB: '#8A9BB0', trim: '#FFFFFF',
  wood: '#9C6B3A', woodD: '#7A5230', leaf: '#5DB05A', leafD: '#469A45', leafL: '#7CC86A', trunk: '#7A5638', iron: '#3E4A52',
};

// A tree made of several overlapping canopy balls in three greens, on a proper trunk.
export function treeParts(x, z, s = 1, seed = 0) {
  const P = [part('cyl', [0.13 * s, 0.2 * s, 1.6 * s, 7], C.trunk, { x, y: 0.8 * s, z })];
  const balls = [[0, 2.1, 0, 0.95], [0.55, 1.85, 0.2, 0.7], [-0.5, 1.9, -0.15, 0.72], [0.1, 2.55, -0.25, 0.65], [-0.2, 1.7, 0.45, 0.6]];
  balls.forEach(([bx, by, bz, r], i) => P.push(part('sph', [r * s, 10], [C.leaf, C.leafD, C.leafL][(i + seed) % 3], { x: x + bx * s, y: by * s, z: z + bz * s })));
  return P;
}
const bushParts = (x, z, s = 1, flower = null) => {
  const P = [part('sph', [0.5 * s, 9], C.leafD, { x, y: 0.35 * s, z, sy: 0.8 }), part('sph', [0.38 * s, 9], C.leaf, { x: x + 0.3 * s, y: 0.32 * s, z: z + 0.15 * s, sy: 0.8 })];
  if (flower) for (let k = 0; k < 5; k++) P.push(part('sph', [0.07 * s, 6], flower, { x: x + Math.cos(k * 1.3) * 0.35 * s, y: 0.62 * s, z: z + Math.sin(k * 1.3) * 0.3 * s }));
  return P;
};
const lampParts = (x, z) => [
  part('cyl', [0.12, 0.16, 0.2, 8], C.iron, { x, y: 0.1, z }),
  part('cyl', [0.05, 0.06, 3.2, 8], C.iron, { x, y: 1.7, z }),
  part('box', [0.5, 0.05, 0.05], C.iron, { x: x + 0.2, y: 3.25, z }),
  part('cone', [0.2, 0.25, 8], C.iron, { x: x + 0.4, y: 3.15, z }),
];
const benchParts = (x, z, ry = 0) => {
  const cx = Math.cos(ry), sx = Math.sin(ry), at = (dx, dz) => ({ x: x + dx * cx + dz * sx, z: z - dx * sx + dz * cx });
  const P = [];
  for (const [dz, dy] of [[0, 0.45], [0.14, 0.45], [-0.14, 0.45]]) P.push(part('box', [1.6, 0.05, 0.12], C.wood, { ...at(0, dz), y: dy, ry }));
  P.push(part('box', [1.6, 0.35, 0.05], C.wood, { ...at(0, -0.24), y: 0.72, ry }));
  for (const dx of [-0.7, 0.7]) P.push(part('box', [0.06, 0.45, 0.45], C.iron, { ...at(dx, 0), y: 0.23, ry }));
  return P;
};

// A shop front: two storeys, a pitched roof, windows with frames, an awning over a display window.
function shopParts(x0, x1, z0, z1, wall, roof, awning, H = 5.2) {
  const P = [], w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  P.push(part('box', [w, H, d], wall, { x: cx, y: H / 2, z: cz, tex: 'plaster' }));
  P.push(part('box', [w + 0.2, 0.25, d + 0.2], C.trim, { x: cx, y: H, z: cz }));
  // the roof ridge runs along x
  P.push(part('box', [w + 0.4, 0.2, d / 2 + 0.5], roof, { x: cx, y: H + 0.6, z: cz + d / 4 + 0.1, rx: -0.32 }));
  P.push(part('box', [w + 0.4, 0.2, d / 2 + 0.5], roof, { x: cx, y: H + 0.6, z: cz - d / 4 - 0.1, rx: 0.32 }));
  P.push(part('box', [0.5, 0.9, 0.5], C.brickB, { x: x0 + 0.9, y: H + 1.1, z: cz - 0.5 }));
  // front: display window, door, awning; upstairs: two windows with flower boxes
  const fz = z1 + 0.01;
  P.push(part('box', [w * 0.45, 1.5, 0.05], '#BFE4F5', { x: x0 + w * 0.3, y: 1.3, z: fz }));
  P.push(part('box', [w * 0.45 + 0.16, 0.12, 0.1], C.trim, { x: x0 + w * 0.3, y: 2.1, z: fz }), part('box', [w * 0.45 + 0.16, 0.12, 0.14], C.trim, { x: x0 + w * 0.3, y: 0.52, z: fz }));
  P.push(part('box', [0.9, 2.0, 0.06], '#5A3A22', { x: x0 + w * 0.75, y: 1.0, z: fz }), part('sph', [0.05, 6], '#E3B34C', { x: x0 + w * 0.75 + 0.3, y: 1.0, z: fz + 0.05 }));
  for (let k = 0; k < 6; k++) P.push(part('box', [w / 6, 0.08, 1.0], k % 2 ? awning : C.trim, { x: x0 + w / 12 + k * w / 6, y: 2.55, z: fz + 0.45, rx: 0.35 }));
  if (H > 4.5) for (const wx of [x0 + w * 0.28, x0 + w * 0.72]) {
    P.push(part('box', [1.0, 1.1, 0.05], '#BFE4F5', { x: wx, y: 3.8, z: fz }));
    P.push(part('box', [1.16, 0.1, 0.1], C.trim, { x: wx, y: 4.38, z: fz }), part('box', [0.06, 1.1, 0.08], C.trim, { x: wx, y: 3.8, z: fz }));
    P.push(part('box', [1.1, 0.2, 0.25], C.wood, { x: wx, y: 3.2, z: fz + 0.12 }));
    for (let k = 0; k < 4; k++) P.push(part('sph', [0.09, 6], ['#FF8A80', '#FFD84D', '#FF9EBB', '#C79BFF'][k], { x: wx - 0.4 + k * 0.27, y: 3.38, z: fz + 0.14 }));
  }
  return P;
}

export function createTownStreet(scene) {
  const { x0, x1, z0, z1 } = ROOM;
  const P = [];
  // ground: grass everywhere, then the paving and the road on top
  P.push(part('box', [120, 0.1, 90], C.grass, { y: -0.09, z: 0 }));
  // pavement in front of the café and the shops (the guests walk along z 7.2)
  const pz0 = z1 + 0.2, pz1 = 8.4;
  P.push(part('box', [70, 0.06, pz1 - pz0], C.paveA, { x: 0, y: -0.03, z: (pz0 + pz1) / 2, tex: 'tile', texScale: 0.35 }));
  for (let i = -30; i <= 30; i += 2) P.push(part('box', [0.05, 0.061, pz1 - pz0], C.paveB, { x: i, y: -0.029, z: (pz0 + pz1) / 2 }));
  P.push(part('box', [70, 0.16, 0.25], C.curb, { x: 0, y: 0.0, z: pz1 + 0.1 }));
  // the road, lane dashes and a crosswalk at the café door
  const rz0 = pz1 + 0.22, rz1 = rz0 + 4.4;
  P.push(part('box', [70, 0.04, rz1 - rz0], C.road, { x: 0, y: -0.04, z: (rz0 + rz1) / 2 }));
  for (let i = -30; i < 30; i += 3) if (Math.abs(i - 2.7) > 2.5) P.push(part('box', [1.5, 0.041, 0.14], C.line, { x: i, y: -0.018, z: (rz0 + rz1) / 2 }));
  for (let k = 0; k < 7; k++) P.push(part('box', [1.6, 0.042, 0.35], C.line, { x: 2.75, y: -0.017, z: rz0 + 0.35 + k * 0.6 }));
  P.push(part('box', [70, 0.16, 0.25], C.curb, { x: 0, y: 0.0, z: rz1 + 0.1 }));
  P.push(part('box', [70, 0.06, 2.4], C.paveA, { x: 0, y: -0.03, z: rz1 + 1.4, tex: 'tile', texScale: 0.35 }));
  // across the road: a little park with trees and flower beds
  for (let i = 0; i < 8; i++) P.push(...treeParts(-16 + i * 4.6 + (i % 2) * 0.8, rz1 + 4.6 + (i % 3) * 0.9, 1.05 + (i % 3) * 0.12, i));
  for (let i = 0; i < 6; i++) P.push(...bushParts(-13 + i * 5.2, rz1 + 3.1, 1, ['#FF8A80', '#FFD84D', '#C79BFF'][i % 3]));

  // ---- the neighbours ---------------------------------------------------------------------------
  // the florist, left of the café (its right wall is the café's left neighbour across a narrow gap)
  P.push(...shopParts(-24, -13.5, -5.5, 4.6, C.brickA, C.roofA, '#FF8A80', 3.4));
  // between the florist and the café: the florist's little patio, a flower cart and planted beds
  P.push(part('box', [5.2, 0.05, 9.6], '#D9CBB6', { x: -10.4, y: -0.035, z: -0.4, tex: 'tile', texScale: 0.35 }));
  P.push(part('box', [1.6, 0.7, 0.8], '#6FA8DC', { x: -10.4, y: 0.65, z: 2.4 }), part('box', [1.7, 0.08, 0.9], '#FFFFFF', { x: -10.4, y: 1.02, z: 2.4 }));
  for (const [wx, wz] of [[-11.1, 2.8], [-9.7, 2.8]]) P.push(part('cyl', [0.3, 0.3, 0.06, 12], '#3E4A52', { x: wx, y: 0.3, z: wz, rx: Math.PI / 2 }));
  for (let k = 0; k < 8; k++) P.push(part('sph', [0.13, 7], ['#FF8A80', '#FFD84D', '#FF9EBB', '#C79BFF', '#FFFFFF'][k % 5], { x: -11.0 + (k % 4) * 0.4, y: 1.18 + (k > 3 ? 0.12 : 0), z: 2.25 + (k > 3 ? 0.25 : 0) }));
  P.push(part('box', [0.05, 1.2, 0.05], '#3E4A52', { x: -11.2, y: 1.5, z: 2.1 }), part('cone', [0.9, 0.35, 8], '#FF8A80', { x: -11.2, y: 2.2, z: 2.1 }));
  for (let i = 0; i < 4; i++) P.push(...bushParts(-11.6 + (i % 2) * 2.4, -3.8 + i * 1.6, 0.9, ['#FF8A80', '#FFD84D', '#C79BFF', '#FF9EBB'][i]));
  for (let k = 0; k < 5; k++) {
    const bx = -22.4 + k * 1.3;
    P.push(part('cyl', [0.22, 0.18, 0.35, 10], C.blue, { x: bx, y: 0.18, z: 5.4 }));
    for (let f = 0; f < 4; f++) P.push(part('sph', [0.09, 6], ['#FF8A80', '#FFD84D', '#FF9EBB', '#FFFFFF'][(k + f) % 4], { x: bx + (f - 1.5) * 0.09, y: 0.45 + (f % 2) * 0.06, z: 5.4 + (f % 2) * 0.06 }));
  }
  // the bookshop, right of the side alley where the delivery van parks
  P.push(...shopParts(8.8, 18, -5.5, 4.6, C.plaster, C.roofB, '#6FA8DC', 3.4));
  P.push(part('box', [1.2, 0.9, 0.5], C.woodD, { x: 14.6, y: 0.45, z: 5.2 }));
  for (let k = 0; k < 6; k++) P.push(part('box', [0.14, 0.34, 0.26], ['#E8546B', '#6FA8DC', '#FFD84D', '#7BC47F', '#B79BFF', '#FF8A5B'][k], { x: 14.1 + k * 0.18, y: 1.07, z: 5.2 }));
  // the side alley between the café and the bookshop: cobbles
  P.push(part('box', [2.8, 0.05, 10.4], '#CFC4B4', { x: 5.2, y: -0.035, z: -0.3, tex: 'tile', texScale: 0.3 }));

  // ---- street furniture along the pavement (clear of the guests' lane at z 7.2) -----------------
  for (const lx of [-12, -4.5, 5.2, 12]) P.push(...lampParts(lx, pz1 - 0.2));
  P.push(...benchParts(-3.0, z1 + 0.75, Math.PI), ...benchParts(9.5, z1 + 0.75, Math.PI));
  // bike rack with two bikes, a mailbox, a hydrant, a bin
  P.push(part('box', [1.6, 0.05, 0.05], C.iron, { x: -9.5, y: 0.55, z: pz1 - 0.5 }));
  for (const bx of [-10.0, -9.0]) {
    P.push(part('cyl', [0.3, 0.3, 0.04, 14], '#2F3A40', { x: bx, y: 0.32, z: pz1 - 0.85, rx: Math.PI / 2, ry: Math.PI / 2 }));
    P.push(part('cyl', [0.3, 0.3, 0.04, 14], '#2F3A40', { x: bx, y: 0.32, z: pz1 - 0.05, rx: Math.PI / 2, ry: Math.PI / 2 }));
    P.push(part('box', [0.05, 0.05, 0.8], bx < -9.5 ? '#FF6F61' : '#6FA8DC', { x: bx, y: 0.55, z: pz1 - 0.45 }));
  }
  P.push(part('rbox', [0.45, 1.0, 0.4, 0.1], '#3F7FD6', { x: 4.3, y: 0.5, z: pz1 - 0.3 }), part('box', [0.3, 0.04, 0.02], '#FFFFFF', { x: 4.3, y: 0.85, z: pz1 - 0.09 }));
  P.push(part('cyl', [0.14, 0.16, 0.55, 8], '#E8403A', { x: 7.2, y: 0.28, z: pz1 - 0.2 }), part('sph', [0.14, 8], '#E8403A', { x: 7.2, y: 0.58, z: pz1 - 0.2 }));
  P.push(part('cyl', [0.25, 0.22, 0.8, 10], '#5E8C6A', { x: -6.2, y: 0.4, z: pz1 - 0.35 }));
  // street trees in square grates
  for (const tx of [-7.6, 8.2]) { P.push(part('box', [1.0, 0.03, 1.0], C.iron, { x: tx, y: -0.005, z: pz1 - 0.55 })); P.push(...treeParts(tx, pz1 - 0.55, 0.85, 1)); }

  // ---- behind the café: a garden with a fence, a shed and hedges -------------------------------
  const gz = z0 - 0.4;
  for (let i = -14; i <= 14; i += 0.5) P.push(part('box', [0.12, 1.1, 0.06], '#FFFFFF', { x: i, y: 0.55, z: gz - 5.5 }));
  P.push(part('box', [28, 0.08, 0.08], '#FFFFFF', { x: 0, y: 0.85, z: gz - 5.5 }), part('box', [28, 0.08, 0.08], '#FFFFFF', { x: 0, y: 0.35, z: gz - 5.5 }));
  P.push(part('box', [2.2, 1.8, 1.8], '#8FB9A8', { x: -3.8, y: 0.9, z: gz - 3.2 }), part('box', [2.5, 0.12, 2.1], C.roofA, { x: -3.8, y: 1.95, z: gz - 3.2, rx: 0.12 }), part('box', [0.7, 1.3, 0.04], '#FFFFFF', { x: -3.8, y: 0.65, z: gz - 2.29 }));
  for (let i = 0; i < 9; i++) P.push(...bushParts(-11 + i * 2.6, gz - 1.2 - (i % 2) * 0.5, 1.1, i % 3 === 0 ? '#FF9EBB' : null));
  for (const [tx, tz, s, sd] of [[-9, gz - 3.5, 1.3, 0], [0.5, gz - 4.0, 1.4, 1], [4.8, gz - 2.8, 1.2, 2], [-12.5, gz - 2, 1.1, 1]]) P.push(...treeParts(tx, tz, s, sd));

  const street = mesh(P); street.castShadow = true; street.receiveShadow = true; scene.add(street);

  // glowing lamp heads (they catch the eye even by day)
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFE6A8').multiplyScalar(1.3), toneMapped: false });
  for (const lx of [-12, -4.5, 5.2, 12]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow); b.position.set(lx + 0.4, 3.02, pz1 - 0.2); scene.add(b); }

  // ---- cars going by -------------------------------------------------------------------------------
  const carCols = ['#FF6F61', '#6FA8DC', '#FFD84D', '#7BC47F', '#FFFFFF'];
  const makeCar = col => {
    const g = mesh([
      part('rbox', [2.2, 0.55, 1.1, 0.18], col, { y: 0.5 }),
      part('rbox', [1.3, 0.5, 1.0, 0.18], col, { x: -0.1, y: 0.95 }),
      part('box', [1.2, 0.38, 1.02], '#BFE4F5', { x: -0.1, y: 0.97 }),
      ...[[-0.7, 0.52], [0.7, 0.52], [-0.7, -0.52], [0.7, -0.52]].map(([wx, wz]) => part('cyl', [0.22, 0.22, 0.14, 12], '#2B2B2B', { x: wx, y: 0.22, z: wz, rx: Math.PI / 2 })),
      part('box', [0.05, 0.12, 0.25], '#FFF3B0', { x: 1.1, y: 0.55, z: 0.32 }), part('box', [0.05, 0.12, 0.25], '#FFF3B0', { x: 1.1, y: 0.55, z: -0.32 }),
    ]);
    scene.add(g); return g;
  };
  const cars = [];
  let spawnT = 1.5;
  return {
    update(dt) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = 5 + Math.random() * 6;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const car = makeCar(carCols[(Math.random() * carCols.length) | 0]);
        car.position.set(dir > 0 ? -34 : 34, 0, dir > 0 ? rz1 - 1.1 : rz0 + 1.1);
        car.rotation.y = dir > 0 ? 0 : Math.PI;
        cars.push({ car, dir, v: 5 + Math.random() * 2 });
      }
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        c.car.position.x += c.dir * c.v * dt;
        c.car.position.y = Math.abs(Math.sin(c.car.position.x * 2)) * 0.015;
        if (Math.abs(c.car.position.x) > 36) { scene.remove(c.car); c.car.geometry.dispose(); cars.splice(i, 1); }
      }
    },
  };
}
