// src/render/roomBeach.js — the Beach Shack: a driftwood deck on the sand with the sea behind it.
// Same footprint as the town café (x -7..3.6, z -5..5, door front-right), so the same floor plan works;
// the walls are low railings so the beach is always in view.
//
// PALETTE (a Mediterranean beach café; the same hexes as art/build_beach.py and propsBeach BP):
//   whitewash + navy for everything built, coral as the one warm accent, warm driftwood underfoot and
//   pale sand around it. Furniture is white and navy/coral on a mid-tone deck and a navy-and-white
//   rug, so a chair, a table and a guest always separate from what they stand on.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';
import { createBatch, kitHas } from './kit.js';
import { createResidents } from './residents.js';

export const BEACH_ROOM_KIT = [
  'beach/b_palm_a', 'beach/b_palm_b', 'beach/b_parasol_navy', 'beach/b_parasol_coral', 'beach/b_parasol_teal',
  'beach/b_lounger_navy', 'beach/b_lounger_coral', 'beach/b_surf_coral', 'beach/b_surf_navy', 'beach/b_surf_teal',
  'beach/b_cabana_navy', 'beach/b_cabana_coral', 'beach/b_tiki', 'beach/b_lifeguard', 'beach/b_plant', 'beach/b_lifering',
];

const C = {
  sand: '#F1E4C6', sandWet: '#DCCBA4', sandDark: '#E6D5B0', sea: '#4FB3CF', seaDeep: '#2F8FBA',
  deck: '#C8A57E', deckGap: '#A8865F', deckLight: '#D6B893', post: '#9C7A55',
  white: '#FAF7F0', cream: '#F4EFE6', navy: '#2E4A78', navyD: '#22385E', coral: '#EE7F5F', rope: '#E6D2A6',
  thatch: '#C9A76A', thatchD: '#AE8C52', leaf: '#4F9E5A', leafD: '#3A7D46',
};

export function createBeachRoom(scene) {
  const { x0, x1, z0, z1, doorX0, doorX1 } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const out = [];

  // ---- sand and the boardwalk ------------------------------------------------------------------
  out.push(part('box', [110, 0.1, 80], C.sand, { y: -0.09, z: 6 }));
  out.push(part('box', [110, 0.02, 2.6], C.sandWet, { y: -0.035, z: z0 - 4.3 }));
  for (let i = 0; i < 16; i++) {           // soft dunes with grass on the front beach
    const rx = -22 + (i * 5.3) % 44, rz = 11 + (i * 3.7) % 8;
    out.push(part('sph', [1.4 + (i % 3) * 0.4, 10], C.sandDark, { x: rx, y: -0.55, z: rz, sy: 0.45 }));
    for (let k = 0; k < 4; k++) out.push(part('cone', [0.05, 0.45, 4], '#8DB064', { x: rx + (k - 1.5) * 0.18, y: 0.1, z: rz + (k % 2) * 0.15, rz: (k - 1.5) * 0.25 }));
  }
  out.push(part('box', [60, 0.12, 3.0], C.deckLight, { x: 3, y: -0.02, z: z1 + 2.2, tex: 'wood' }));
  for (let i = -24; i < 30; i++) out.push(part('box', [0.04, 0.121, 3.0], C.deckGap, { x: i * 1.0, y: -0.019, z: z1 + 2.2 }));
  for (let i = -12; i < 15; i++) out.push(part('cyl', [0.06, 0.06, 0.8, 6], C.white, { x: i * 2.2, y: 0.4, z: z1 + 3.75 }));
  out.push(part('box', [60, 0.07, 0.1], C.white, { x: 3, y: 0.78, z: z1 + 3.75 }));
  out.push(part('cyl', [0.025, 0.025, 60, 5], C.rope, { x: 3, y: 0.5, z: z1 + 3.75, rz: Math.PI / 2 }));
  // shells and starfish scattered on the sand (never under the shack)
  for (let i = 0; i < 26; i++) {
    const sx = -24 + (i * 7.9) % 48, sz = -6 + (i * 5.1) % 22;
    if (sx > x0 - 1.5 && sx < x1 + 1.5 && sz > z0 - 1 && sz < z1 + 4.5) continue;
    if (i % 3 === 0) out.push(part('sph', [0.3 + (i % 4) * 0.12, 7], '#C9C1B4', { x: sx, y: 0.05, z: sz, sy: 0.6 }));
    else if (i % 3 === 1) out.push(part('cyl', [0.12, 0.12, 0.03, 5], C.coral, { x: sx, y: 0.02, z: sz }));
    else out.push(part('sph', [0.09, 6], '#FFE3D6', { x: sx, y: 0.03, z: sz, sy: 0.5 }));
  }
  out.push(part('box', [0.9, 0.02, 1.7], C.coral, { x: -8.8, y: 0.01, z: -1.2 }), part('box', [0.9, 0.02, 1.7], C.navy, { x: 8.4, y: 0.01, z: 6.4, ry: 0.4 }));
  const outside = mesh(out); outside.castShadow = true; outside.receiveShadow = true; scene.add(outside);

  // ---- the beach props, modelled in Blender (art/build_beach.py) ---------------------------------
  if (kitHas('beach/b_palm_a')) {
    const B = createBatch();
    for (const [n, x, z, ry, s] of [
      ['b_palm_a', -8.6, 6.3, 0.4, 1.0], ['b_palm_b', 5.4, 7.2, 2.0, 1.0], ['b_palm_a', -9.4, -5.6, 2.6, 1.1], ['b_palm_b', 6.0, -6.8, -0.6, 1.15],
      ['b_palm_a', -16, 8, 1.2, 1.2], ['b_palm_b', 14, 3, 0.2, 1.2], ['b_palm_a', -4, -9.5, 3.4, 1.0], ['b_palm_b', 1.2, -9.8, 1.0, 1.15],
      ['b_palm_a', 11, -6, 2.2, 1.1],
    ]) B.put('beach/' + n, x, 0, z, ry, s);
    B.put('beach/b_cabana_navy', -13.5, 0, -2.4, 0.2, 1); B.put('beach/b_cabana_coral', -13.2, 0, 1.2, -0.1, 1); B.put('beach/b_cabana_navy', -13.4, 0, 4.8, 0.1, 1);
    B.put('beach/b_parasol_navy', -9.8, 0, 1.4, 0, 1); B.put('beach/b_lounger_navy', -9.4, 0, 2.6, Math.PI + 0.1, 1); B.put('beach/b_lounger_coral', -10.4, 0, 2.6, Math.PI - 0.1, 1);
    B.put('beach/b_parasol_coral', -10.2, 0, -3.4, 0, 1); B.put('beach/b_lounger_coral', -9.9, 0, -2.2, Math.PI, 1);
    B.put('beach/b_parasol_teal', 7.4, 0, 3.0, 0, 1); B.put('beach/b_lounger_navy', 7.2, 0, 4.4, Math.PI + 0.35, 1);
    B.put('beach/b_parasol_navy', 12.2, 0, 7.2, 0, 1); B.put('beach/b_lounger_coral', 12.4, 0, 8.4, Math.PI + 0.2, 1);
    B.put('beach/b_lifeguard', 9.8, 0, -3.4, -0.3, 1);
    B.put('beach/b_surf_coral', 5.0, 0, -4.8, 0.15, 1); B.put('beach/b_surf_navy', 5.7, 0, -4.9, 0.0, 1); B.put('beach/b_surf_teal', 6.4, 0, -4.8, -0.2, 1);
    // on the deck: tiki torches at the door, potted palms in the corners, life rings on the rail
    B.put('beach/b_tiki', doorX0 - 0.25, 0, z1 + 0.35, 0, 1); B.put('beach/b_tiki', doorX1 + 0.25, 0, z1 + 0.35, 0, 1);
    B.put('beach/b_plant', -6.5, 0, 4.55, 0.3, 1.1); B.put('beach/b_plant', -6.5, 0, 0.2, 1.4, 0.95);
    B.put('beach/b_lifering', x0 - 0.05, 0.62, -0.6, Math.PI / 2, 1); B.put('beach/b_lifering', x1 + 0.08, 0.62, 3.0, -Math.PI / 2, 1);
    B.bake(scene);
  }

  // ---- the sea: two tones and a moving shoreline --------------------------------------------------
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshToonMaterial({ color: C.sea }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.05, z0 - 36); scene.add(sea);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(120, 30), new THREE.MeshToonMaterial({ color: C.seaDeep }));
  deep.rotation.x = -Math.PI / 2; deep.position.set(0, -0.04, z0 - 52); scene.add(deep);
  const foams = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.35 - i * 0.08), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85 - i * 0.2 }));
    f.rotation.x = -Math.PI / 2; f.position.set(0, -0.02 + i * 0.002, z0 - 5.8 - i * 1.4); scene.add(f); foams.push(f);
  }
  const boat = mesh([
    part('rbox', [1.8, 0.4, 0.7, 0.15], C.white, { y: 0.2 }), part('box', [1.7, 0.08, 0.6], C.navy, { y: 0.05 }),
    part('cyl', [0.04, 0.04, 2.0, 5], C.post, { y: 1.3 }), part('cone', [0.7, 1.7, 3], C.white, { x: 0.3, y: 1.25, sz: 0.1 }),
  ]);
  boat.position.set(-6, 0, z0 - 16); scene.add(boat);
  const buoy = mesh([part('sph', [0.3, 10], C.coral, { y: 0.15 }), part('cyl', [0.31, 0.31, 0.1, 10], C.white, { y: 0.2 })]);
  buoy.position.set(4, 0, z0 - 10); scene.add(buoy);
  const gullGeo = [part('box', [0.5, 0.03, 0.12], C.white, { x: -0.22, rz: 0.35 }), part('box', [0.5, 0.03, 0.12], C.white, { x: 0.22, rz: -0.35 }), part('sph', [0.07, 6], C.white)];
  const gulls = [0, 1, 2].map(i => { const g = mesh(gullGeo, { cast: false }); g.userData = { r: 6 + i * 3, h: 5 + i * 0.8, s: 0.25 + i * 0.07, a: i * 2 }; scene.add(g); return g; });

  // ---- the deck ---------------------------------------------------------------------------------
  const P = [];
  P.push(part('box', [W + 0.6, 0.2, D + 0.4], C.deck, { x: (x0 + x1) / 2, y: -0.08, z: (z0 + z1) / 2, tex: 'wood', texScale: 0.8 }));
  for (let i = 0; i < 20; i++) P.push(part('box', [W + 0.6, 0.201, 0.03], C.deckGap, { x: (x0 + x1) / 2, y: -0.079, z: z0 - 0.1 + i * 0.52 }));
  // the working floor behind the bar: pale whitewashed boards, a clear step apart from the deck
  P.push(part('box', [W, 0.03, 3.0], C.cream, { x: (x0 + x1) / 2, y: 0.035, z: z0 + 1.5, tex: 'wood', texScale: 0.6 }));
  // a navy-and-white striped rug under the tables: white chairs and tables read crisply against it
  const rugR = [3.3, 2.95, 2.6, 2.25, 1.9];
  rugR.forEach((r, i) => P.push(part('cyl', [r, r, 0.015 + i * 0.002, 40], i % 2 ? C.white : C.navy, { x: -1.0, y: 0.025 + i * 0.002, z: 2.6, sz: 0.6 })));

  // the back of the bar: whitewashed boards, navy trim, driftwood posts, bottle shelf, thatch
  P.push(part('box', [W, 1.2, 0.2], C.cream, { x: (x0 + x1) / 2, y: 0.6, z: z0 - 0.05, tex: 'wood' }));
  P.push(part('box', [W + 0.02, 0.14, 0.22], C.navy, { x: (x0 + x1) / 2, y: 0.07, z: z0 - 0.05 }));
  P.push(part('box', [W + 0.02, 0.08, 0.24], C.navy, { x: (x0 + x1) / 2, y: 1.2, z: z0 - 0.05 }));
  for (let i = 0; i < 7; i++) P.push(part('cyl', [0.13, 0.15, 3.0, 8], C.post, { x: x0 + i * (W / 6), y: 1.5, z: z0 - 0.05 }));
  P.push(part('box', [W + 0.8, 0.35, 0.9], C.thatch, { x: (x0 + x1) / 2, y: 3.1, z: z0 - 0.1 }));
  for (let i = 0; i < 30; i++) P.push(part('cone', [0.19, 0.55, 4], i % 2 ? C.thatch : C.thatchD, { x: x0 - 0.3 + i * ((W + 0.6) / 29), y: 2.72, z: z0 + 0.3, rx: Math.PI }));
  P.push(part('box', [W, 0.06, 0.3], C.post, { x: (x0 + x1) / 2, y: 1.95, z: z0 + 0.1 }));
  const bottle = [C.navy, C.coral, '#F2C76B', '#6FB7B0', '#5B8FB9'];
  for (let i = 0; i < 12; i++) P.push(part('cyl', [0.06, 0.07, 0.3, 8], bottle[i % 5], { x: x0 + 0.5 + i * 0.85, y: 2.13, z: z0 + 0.1 }));
  // bunting under the thatch: little navy / coral / white flags
  for (let i = 0; i < 22; i++) P.push(part('cone', [0.1, 0.2, 3], [C.navy, C.coral, C.white][i % 3], { x: x0 + 0.3 + i * (W - 0.6) / 21, y: 2.42, z: z0 + 0.45, rx: Math.PI, sz: 0.2 }));
  // side and front railings: white posts, a driftwood rail, a rope between
  const rail = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.2));
    for (let k = 0; k <= n; k++) P.push(part('cyl', [0.065, 0.075, 1.0, 7], C.white, { x: ax + (bx - ax) * k / n, y: 0.5, z: az + (bz - az) * k / n }));
    const alongZ = Math.abs(bz - az) > Math.abs(bx - ax), turn = alongZ ? { rx: Math.PI / 2 } : { rz: Math.PI / 2 };
    P.push(part('cyl', [0.055, 0.055, len, 6], C.post, { x: (ax + bx) / 2, y: 0.98, z: (az + bz) / 2, ...turn }));
    P.push(part('cyl', [0.025, 0.025, len, 5], C.rope, { x: (ax + bx) / 2, y: 0.62, z: (az + bz) / 2, ...turn }));
  };
  rail(x0, z0, x0, z1); rail(x1, z0, x1, z1); rail(x0, z1, doorX0, z1); rail(doorX1, z1, x1, z1);
  // the entrance sign: a navy surfboard with a white stripe
  P.push(part('rbox', [1.9, 0.55, 0.1, 0.22], C.navy, { x: (doorX0 + doorX1) / 2, y: 2.35, z: z1 }));
  P.push(part('rbox', [1.6, 0.14, 0.11, 0.06], C.white, { x: (doorX0 + doorX1) / 2, y: 2.35, z: z1 + 0.005 }));
  for (const px of [doorX0, doorX1]) P.push(part('cyl', [0.05, 0.05, 2.1, 6], C.white, { x: px, y: 1.05, z: z1 + 0.02 }));
  // the bar end left of the till, and a sink station in the back corner
  P.push(part('box', [-6.3 - x0, 1.0, 0.8], C.navy, { x: (x0 - 6.3) / 2, y: 0.5, z: -1.6 }));
  P.push(part('box', [-6.3 - x0 + 0.05, 0.07, 0.9], C.post, { x: (x0 - 6.3) / 2, y: 1.03, z: -1.6 }));
  P.push(part('box', [1.1, 0.9, 0.8], C.cream, { x: 2.95, y: 0.45, z: z0 + 0.45 }), part('box', [1.12, 0.12, 0.82], C.navy, { x: 2.95, y: 0.06, z: z0 + 0.45 }));
  P.push(part('box', [1.14, 0.05, 0.84], C.post, { x: 2.95, y: 0.92, z: z0 + 0.45 }), part('box', [0.56, 0.06, 0.45], '#7E939C', { x: 2.95, y: 0.93, z: z0 + 0.45 }));
  const deck = mesh(P); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);

  // the beach's own pets: lounging on the towels, in the parasols' shade, by the surfboards
  const residents = createResidents(scene, { x0: -11.6, x1: -8.2, z0: -4.2, z1: 3.8 }, [
    { x: -8.8, z: -1.2, face: 0.4 }, { x: -9.8, z: 1.1, face: 0.2 }, { x: -10.2, z: -3.1, face: -0.3 }, { x: -9.0, z: 3.4, face: 0.8 },
  ], [['dog', 6], ['cat', 5], ['bunny', 7]]);
  let t = 0;
  return {
    mesh: deck,
    update(dt) {
      t += dt;
      residents.update(dt);
      foams.forEach((f, i) => { f.position.z = z0 - 5.8 - i * 1.4 + Math.sin(t * 0.8 + i * 1.3) * 0.45; f.material.opacity = (0.85 - i * 0.2) * (0.75 + 0.25 * Math.sin(t * 0.8 + i)); });
      boat.position.y = Math.sin(t * 1.3) * 0.08; boat.rotation.z = Math.sin(t * 1.1) * 0.05; boat.position.x = -6 + Math.sin(t * 0.05) * 4;
      buoy.position.y = Math.sin(t * 1.7 + 1) * 0.07; buoy.rotation.x = Math.sin(t * 1.4) * 0.12;
      for (const g of gulls) {
        const u = g.userData, a = u.a + t * u.s;
        g.position.set(Math.cos(a) * u.r - 2, u.h + Math.sin(t * 2 + u.a) * 0.2, z0 - 8 + Math.sin(a) * u.r * 0.5);
        g.rotation.y = -a; g.scale.y = 1 + Math.sin(t * 8 + u.a) * 0.3;
      }
    },
  };
}
