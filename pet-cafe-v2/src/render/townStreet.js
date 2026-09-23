// src/render/townStreet.js — the town around the café, built from the KayKit City Builder kit (CC0):
// real road tiles with a crossing at the café door, KayKit buildings across the street and on both
// sides, streetlights, benches, bushes, hydrants and bins on the pavement, and KayKit cars going by.
// Static pieces are baked into merged meshes (render/kit.js). The guests' lane (z 7.2) stays clear.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';
import { createBatch, kitClone, kitHas } from './kit.js';

export const STREET_KIT = [
  'city/road_straight', 'city/road_straight_crossing', 'city/streetlight', 'city/bench', 'city/bush', 'city/firehydrant',
  'city/trash_A', 'city/dumpster', 'city/box_A', 'city/building_A', 'city/building_B', 'city/building_C', 'city/building_D',
  'city/building_E', 'city/building_F', 'city/building_G', 'city/building_H',
  'city/car_sedan', 'city/car_taxi', 'city/car_hatchback', 'city/car_stationwagon',
];
const CITY = 3.6;                    // city-kit scale: a 2-unit tile becomes a 7.2 m block

const C = { grass: '#86C766', paveA: '#E4DACB', paveB: '#D6CAB8', curb: '#BEB19E', leaf: '#5DB05A', leafD: '#469A45', leafL: '#7CC86A', trunk: '#7A5638' };

export function treeParts(x, z, s = 1, seed = 0) {
  const P = [part('cyl', [0.13 * s, 0.2 * s, 1.6 * s, 7], C.trunk, { x, y: 0.8 * s, z })];
  const balls = [[0, 2.1, 0, 0.95], [0.55, 1.85, 0.2, 0.7], [-0.5, 1.9, -0.15, 0.72], [0.1, 2.55, -0.25, 0.65], [-0.2, 1.7, 0.45, 0.6]];
  balls.forEach(([bx, by, bz, r], i) => P.push(part('sph', [r * s, 10], [C.leaf, C.leafD, C.leafL][(i + seed) % 3], { x: x + bx * s, y: by * s, z: z + bz * s })));
  return P;
}

export function createTownStreet(scene) {
  const { z0, z1 } = ROOM;
  const P = [];
  // ground and pavements (the pavement is ours: the guests walk along z 7.2)
  P.push(part('box', [140, 0.1, 100], C.grass, { y: -0.09, z: 0 }));
  const pz0 = z1 + 0.2, pz1 = 8.6;
  P.push(part('box', [80, 0.06, pz1 - pz0], C.paveA, { x: 0, y: -0.03, z: (pz0 + pz1) / 2, tex: 'tile', texScale: 0.35 }));
  for (let i = -40; i <= 40; i += 2) P.push(part('box', [0.05, 0.061, pz1 - pz0], C.paveB, { x: i, y: -0.029, z: (pz0 + pz1) / 2 }));
  P.push(part('box', [80, 0.06, 3.0], C.paveA, { x: 0, y: -0.03, z: pz1 + 7.2 + 1.5, tex: 'tile', texScale: 0.35 }));
  // the side alley between the café and the right-hand block (the delivery van parks here), and a
  // small patio on the left with a row of trees
  P.push(part('box', [3.0, 0.05, 10.4], '#CFC4B4', { x: 5.2, y: -0.035, z: -0.3, tex: 'tile', texScale: 0.3 }));
  P.push(part('box', [4.4, 0.05, 10.4], '#D9CBB6', { x: -9.6, y: -0.035, z: -0.3, tex: 'tile', texScale: 0.35 }));
  for (let i = 0; i < 4; i++) P.push(...treeParts(-9.6, -4 + i * 2.6, 0.75, i));
  const ground = mesh(P); ground.castShadow = true; ground.receiveShadow = true; scene.add(ground);

  if (!kitHas('city/road_straight')) return { update() {} };
  const B = createBatch();
  // ---- the road: kit tiles along x, a zebra crossing at the café door ---------------------------
  const RZ = pz1 + 3.6;
  for (let i = -6; i <= 6; i++) {
    const x = 2.75 + i * 2 * CITY;
    B.put(i === 0 ? 'city/road_straight_crossing' : 'city/road_straight', x, -0.34, RZ, Math.PI / 2, CITY);
  }
  // ---- buildings: a row facing the café across the road, and one block either side -------------
  const across = ['building_B', 'building_E', 'building_C', 'building_F', 'building_A', 'building_H', 'building_D'];
  across.forEach((b, i) => B.put('city/' + b, -21.6 + i * 7.2, -0.02, RZ + 7.4 + 3.6, Math.PI, CITY));
  B.put('city/building_G', -16, -0.02, -1.2, Math.PI / 2, CITY);
  B.put('city/building_C', -16, -0.02, -8.4, Math.PI / 2, CITY);
  B.put('city/building_E', 11.6, -0.02, -1.2, -Math.PI / 2, CITY);
  B.put('city/building_A', 11.6, -0.02, -8.4, -Math.PI / 2, CITY);
  // behind the café: a row of rooftops beyond the back garden
  ['building_H', 'building_B'].forEach((b, i) => B.put('city/' + b, -3.6 + i * 7.2, -0.02, z0 - 9.5, 0, CITY));
  // ---- street furniture on the pavement (off the guests' lane at z 7.2) ------------------------
  const SL = pz1 - 0.35;
  for (const lx of [-12.5, -5, 7.4, 14.5]) B.put('city/streetlight', lx, 0, SL, 0, CITY);
  B.put('city/bench', -2.6, 0, z1 + 0.9, 0, CITY * 1.1);
  B.put('city/bench', 9.8, 0, z1 + 0.9, 0, CITY * 1.1);
  for (const [bx, bz] of [[-7.2, SL], [-8.6, SL], [8.6, SL], [12.8, SL], [-14, SL]]) B.put('city/bush', bx, 0, bz, 0, CITY);
  B.put('city/firehydrant', 4.4, 0, SL + 0.1, 0, CITY);
  B.put('city/trash_A', -3.9, 0, SL + 0.1, 0, CITY);
  B.put('city/dumpster', 6.0, 0, -4.2, Math.PI, CITY * 0.8);
  B.put('city/box_A', 4.4, 0, -4.6, 0.3, CITY * 0.7);
  B.bake(scene);

  // ---- traffic: kit cars in both lanes ---------------------------------------------------------
  const carNames = ['city/car_sedan', 'city/car_taxi', 'city/car_hatchback', 'city/car_stationwagon'];
  const cars = [];
  let spawnT = 1.2;
  return {
    update(dt) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = 4 + Math.random() * 5;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const car = kitClone(carNames[(Math.random() * carNames.length) | 0], CITY * 1.05);
        car.position.set(dir > 0 ? -40 : 40, 0.02, RZ + (dir > 0 ? 1.7 : -1.7));
        car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(car);
        cars.push({ car, dir, v: 5 + Math.random() * 2.5 });
      }
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        c.car.position.x += c.dir * c.v * dt;
        if (Math.abs(c.car.position.x) > 42) { scene.remove(c.car); cars.splice(i, 1); }
      }
    },
  };
}
