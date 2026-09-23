// src/render/room.js — the town café's building, dressed with the KayKit Restaurant and Furniture kits
// (CC0, Kay Lousberg). Walls, floors and décor are baked into a few merged meshes (render/kit.js).
// The camera side (the front and the right) stays low so the room is always in view.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';
import { createTownStreet } from './townStreet.js';
import { createBatch } from './kit.js';

export const TOWN_ROOM_KIT = [
  'restaurant/wall', 'restaurant/wall_window_open', 'restaurant/wall_window_closed', 'restaurant/floor_kitchen',
  'restaurant/kitchencounter_sink_backsplash', 'restaurant/kitchencabinet', 'restaurant/extractorhood', 'restaurant/jar_A_medium',
  'restaurant/jar_B_medium', 'restaurant/jar_C_medium', 'restaurant/menu',
  'furniture/pictureframe_large_A', 'furniture/pictureframe_large_B', 'furniture/pictureframe_medium', 'furniture/shelf_B_large_decorated',
  'furniture/lamp_standing', 'furniture/cactus_medium_A', 'furniture/cactus_medium_B', 'furniture/rug_rectangle_stripes_A',
];

const COL = { plank: '#D9A46E', plankDark: '#C48F5A', trim: '#B9834A', wallLow: '#E7B98F', leaf: '#6FBF6A', leafDark: '#58A857' };

export function createRoom(scene) {
  const { x0, x1, z0, z1, doorX0, doorX1 } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const street = createTownStreet(scene);
  const B = createBatch();

  // ---- walls: KayKit wall pieces sized to the room (4 across the back, 4 down the left) --------
  const WH = 0.78;                                   // 4 kit units tall -> ~3.1 m
  const bw = W / 4, bs = [bw / 4, WH, 0.7];
  ['wall', 'wall', 'wall_window_open', 'wall_window_open'].forEach((n, i) => B.put('restaurant/' + n, x0 + bw * (i + 0.5), 0, z0 - 0.12, 0, bs));
  const lw = D / 4, ls = [lw / 4, WH, 0.7];
  ['wall', 'wall_window_closed', 'wall_window_open', 'wall'].forEach((n, i) => B.put('restaurant/' + n, x0 - 0.12, 0, z0 + lw * (i + 0.5), Math.PI / 2, ls));
  // ---- floors: checker tiles in the kitchen, planks on the dining floor -----------------------
  for (let i = 0; i < 4; i++) B.put('restaurant/floor_kitchen', x0 + bw * (i + 0.5), -0.4, z0 + 1.5, 0, [bw / 4, 0.8, 3.0 / 4]);
  // ---- the kitchen: a sink counter in the corner, cabinets over the machines -----------------
  B.put('restaurant/kitchencounter_sink_backsplash', 2.95, 0, z0 + 0.55, 0, 0.55);
  for (const hx of [-4.0, -2.2, -0.4, 1.4]) B.put('restaurant/kitchencabinet', hx, 0.55, z0 + 0.02, 0, [0.62, 0.55, 0.45]);
  // a row of jars above the pantry
  [['jar_A_medium', -6.4], ['jar_B_medium', -6.0], ['jar_C_medium', -5.6]].forEach(([n, x]) => B.put('restaurant/' + n, x, 2.2, z0 + 0.3, 0, 0.35));
  // ---- décor: pictures, lamps, cacti, a striped rug under the tables ---------------------------
  B.put('furniture/pictureframe_large_A', x0 + 0.05, 2.0, -0.9, Math.PI / 2, 0.75);
  B.put('furniture/pictureframe_large_B', x0 + 0.05, 2.0, 3.4, Math.PI / 2, 0.75);
  B.put('furniture/pictureframe_medium', -1.2, 2.2, z0 + 0.05, 0, 0.8);
  B.put('furniture/lamp_standing', -6.45, 0, 0.3, 0, 0.75);
  B.put('furniture/cactus_medium_A', -6.4, 0, 4.5, 0, 0.6);
  B.put('furniture/cactus_medium_B', 3.1, 0, 4.4, 0, 0.55);
  B.put('furniture/rug_rectangle_stripes_A', -1.0, 0.0, 2.6, 0, [1.9, 0.3, 1.45]);
  B.bake(scene);

  // ---- the parts the kits do not have: dining planks, the low camera-side walls, the door --------
  const P = [];
  P.push(part('box', [W, 0.1, z1 + 2.0], COL.plank, { x: (x0 + x1) / 2, y: -0.05, z: (z1 - 2.0) / 2, tex: 'wood', texScale: 0.8 }));
  for (let i = 0; i < 14; i++) P.push(part('box', [W, 0.101, 0.025], COL.plankDark, { x: (x0 + x1) / 2, y: -0.049, z: -1.75 + i * 0.5 }));
  P.push(part('box', [1.4, 0.02, 0.7], '#B5654A', { x: (doorX0 + doorX1) / 2, y: 0.01, z: z1 - 0.5 }));
  const T = 0.25;
  // right wall: a low half-wall with a sill, so the camera sees over it into the room
  P.push(part('box', [T, 1.0, D], COL.wallLow, { x: x1 + T / 2, y: 0.5, z: (z0 + z1) / 2, tex: 'wood' }));
  P.push(part('box', [T + 0.14, 0.08, D + 0.3], COL.trim, { x: x1 + T / 2, y: 1.02, z: (z0 + z1) / 2 }));
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
  P.push(part('rbox', [-6.3 - x0, 1.0, 0.8, 0.05], COL.trim, { x: (x0 - 6.3) / 2, y: 0.5, z: -1.6, tex: 'wood' }));
  P.push(part('box', [-6.3 - x0 + 0.05, 0.07, 0.9], '#F3E4CC', { x: (x0 - 6.3) / 2, y: 1.03, z: -1.6 }));
  // a deep sill under the left window: the café cat sleeps here
  P.push(part('box', [0.46, 0.08, 1.6], '#FFFFFF', { x: x0 + 0.23, y: 1.42, z: 1.25 }));
  const room = mesh(P); room.castShadow = true; room.receiveShadow = true; scene.add(room);
  return { mesh: room, update: dt => street.update(dt) };
}
