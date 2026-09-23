// src/render/roomBeach.js — the Beach Shack: a teak deck on the sand with the sea behind it.
// Same footprint as the town café (x -7..3.6, z -5..5, door front-right), so the same floor plan works;
// the walls become low railings so the beach is always in view.
//
// COLOUR RULE (after the first beach build was unreadable: yellow deck, yellow counters, pale goods):
// the deck is a deep warm teak, the counters are boldly painted (turquoise, coral, cobalt), every
// display top is dark wood so white and pastel goods pop, and the sand around is a different, cooler
// cream than anything you walk on. Nothing that matters shares a colour with what it stands on.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';

const C = {
  sand: '#EFE3C8', sandWet: '#DCCDA8', sandDark: '#E4D6B6', sea: '#5CB9D0', seaDeep: '#3C98BE', foam: '#FFFFFF',
  deck: '#B98A5E', deckDark: '#9C7049', deckLight: '#C99B6E', post: '#6E4A2A', rope: '#F1E2C0',
  thatch: '#C9A04E', thatchD: '#A9822F', leaf: '#3FAE5E', leafD: '#2E8C4A', trunk: '#8A6240',
};
const STRIPES = [['#E99C8C', '#FFFFFF'], ['#7CC6B8', '#FFFFFF'], ['#E9C27A', '#FFFFFF'], ['#9CC79A', '#FFFFFF']];

// A palm with a curved, ringed trunk and drooping fronds (each frond two bent segments).
export function palmParts(x, z, s = 1, lean = 0.25, dir = 0) {
  const P = [];
  let px = x, py = 0, pz = z;
  const dx = Math.cos(dir), dz = Math.sin(dir);
  for (let k = 0; k < 8; k++) {
    const t = k / 7, off = lean * t * t * 2.2 * s;
    px = x + dx * off; pz = z + dz * off; py = (0.25 + k * 0.5) * s;
    P.push(part('cyl', [0.11 * s * (1 - t * 0.25), 0.13 * s * (1 - t * 0.25), 0.52 * s, 8], k % 2 ? C.trunk : '#9C734C', { x: px, y: py, z: pz }));
  }
  const tx = px, ty = py + 0.3 * s, tz = pz;
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * Math.PI * 2 + 0.2;
    const cx = Math.cos(ang), cz = Math.sin(ang);
    P.push(part('box', [0.9 * s, 0.04, 0.32 * s], a % 2 ? C.leaf : C.leafD, { x: tx + cx * 0.42 * s, y: ty + 0.05, z: tz + cz * 0.42 * s, ry: -ang, rz: -0.15 }));
    P.push(part('box', [0.8 * s, 0.04, 0.26 * s], a % 2 ? C.leafD : C.leaf, { x: tx + cx * 1.1 * s, y: ty - 0.25 * s, z: tz + cz * 1.1 * s, ry: -ang, rz: -0.6 }));
  }
  for (const [ox, oz] of [[0.12, 0.08], [-0.1, 0.1], [0.02, -0.13]]) P.push(part('sph', [0.12 * s, 8], '#5E3F22', { x: tx + ox * s, y: ty - 0.12 * s, z: tz + oz * s }));
  return P;
}

export function createBeachRoom(scene) {
  const { x0, x1, z0, z1, doorX0, doorX1 } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const out = [];

  // ---- sand, shore and sea ------------------------------------------------------------------
  out.push(part('box', [110, 0.1, 80], C.sand, { y: -0.09, z: 6 }));
  out.push(part('box', [110, 0.02, 2.4], C.sandWet, { y: -0.035, z: z0 - 4.2 }));
  // dune ripples and grass tufts on the front beach
  for (let i = 0; i < 18; i++) {
    const rx = -22 + (i * 5.3) % 44, rz = 10 + (i * 3.7) % 9;
    out.push(part('sph', [1.4 + (i % 3) * 0.4, 10], C.sandDark, { x: rx, y: -0.55, z: rz, sy: 0.45 }));
    for (let k = 0; k < 4; k++) out.push(part('cone', [0.05, 0.45, 4], '#7FAE5A', { x: rx + (k - 1.5) * 0.18, y: 0.1, z: rz + (k % 2) * 0.15, rz: (k - 1.5) * 0.25 }));
  }
  // shells, starfish and rocks, so the sand is not a flat sheet
  for (let i = 0; i < 26; i++) {
    const sx = -24 + (i * 7.9) % 48, sz = -6 + (i * 5.1) % 22;
    if (sx > x0 - 1.5 && sx < x1 + 1.5 && sz > z0 - 1 && sz < z1 + 4.5) continue;
    if (i % 3 === 0) out.push(part('sph', [0.35 + (i % 4) * 0.15, 7], '#B8AFA2', { x: sx, y: 0.05, z: sz, sy: 0.6 }));
    else if (i % 3 === 1) out.push(part('cyl', [0.12, 0.12, 0.03, 5], '#FF8A5B', { x: sx, y: 0.02, z: sz }));
    else out.push(part('sph', [0.09, 6], '#FFE3D6', { x: sx, y: 0.03, z: sz, sy: 0.5 }));
  }
  // the boardwalk the guests arrive on, with a rail on the beach side
  out.push(part('box', [60, 0.12, 3.0], C.deckLight, { x: 3, y: -0.02, z: z1 + 2.2, tex: 'wood' }));
  for (let i = -24; i < 30; i++) out.push(part('box', [0.04, 0.121, 3.0], C.deckDark, { x: i * 1.0, y: -0.019, z: z1 + 2.2 }));
  for (let i = -12; i < 15; i++) out.push(part('cyl', [0.06, 0.06, 0.8, 6], C.post, { x: i * 2.2, y: 0.4, z: z1 + 3.75 }));
  out.push(part('box', [60, 0.08, 0.1], C.deckDark, { x: 3, y: 0.78, z: z1 + 3.75 }));

  // ---- the beach around the shack: cabanas, loungers, umbrellas, a lifeguard tower, surfboards ----
  const umbrella = (x, z, [a, b], tilt = 0) => {
    out.push(part('cyl', [0.03, 0.03, 2.3, 6], '#F4F4F4', { x, y: 1.15, z, rz: tilt }));
    for (let k = 0; k < 8; k++) out.push(part('cone', [0.95, 0.4, 3], k % 2 ? a : b, { x: x - tilt * 1.2, y: 2.35, z, ry: k / 8 * Math.PI * 2 }));
  };
  const lounger = (x, z, col, ry = 0) => {
    out.push(part('box', [0.7, 0.08, 1.7], col, { x, y: 0.3, z, ry }));
    out.push(part('box', [0.7, 0.08, 0.7], col, { x, y: 0.55, z: z - 0.8, rx: 0.9, ry }));
    for (const [lx, lz] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]]) out.push(part('cyl', [0.03, 0.03, 0.3, 5], '#FFFFFF', { x: x + lx, y: 0.15, z: z + lz }));
  };
  const cabana = (x, z, [a, b]) => {
    out.push(part('box', [1.8, 1.8, 1.6], '#FFFFFF', { x, y: 0.9, z }));
    for (let k = 0; k < 6; k++) out.push(part('box', [0.3, 1.8, 1.62], k % 2 ? a : b, { x: x - 0.75 + k * 0.3, y: 0.9, z }));
    out.push(part('box', [2.0, 0.12, 1.8], a, { x, y: 1.86, z }));
    out.push(part('cone', [1.35, 0.7, 4], b, { x, y: 2.26, z, ry: Math.PI / 4 }));
    out.push(part('box', [0.8, 1.3, 0.04], '#3B2E2A', { x, y: 0.65, z: z + 0.81 }));
  };
  cabana(-13.5, -2.5, STRIPES[0]); cabana(-13.5, 0.5, STRIPES[1]); cabana(-13.5, 3.5, STRIPES[2]);
  umbrella(-9.6, 1.0, STRIPES[0], 0.08); lounger(-9.6, 2.4, '#7CC6B8'); lounger(-10.6, 2.4, '#E99C8C');
  umbrella(-10, -3.6, STRIPES[2], -0.06); lounger(-10, -2.3, '#E9C27A');
  umbrella(7.2, 3.2, STRIPES[1], -0.1); lounger(7.0, 4.6, '#E99C8C', 0.3);
  out.push(part('box', [0.9, 0.02, 1.7], '#FF7FA8', { x: -8.8, y: 0.01, z: -1.2 }), part('box', [0.9, 0.02, 1.7], '#7BC47F', { x: 8.4, y: 0.01, z: 6.4, ry: 0.4 }));
  // lifeguard tower
  const LX = 9.5, LZ = -3.2;
  for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) out.push(part('cyl', [0.07, 0.07, 2.2, 6], '#FFFFFF', { x: LX + ox, y: 1.1, z: LZ + oz }));
  out.push(part('box', [1.7, 1.1, 1.7], '#DE7F74', { x: LX, y: 2.75, z: LZ }), part('box', [1.5, 0.5, 0.05], '#FFFFFF', { x: LX, y: 2.9, z: LZ + 0.86 }));
  out.push(part('cone', [1.4, 0.8, 4], '#FFFFFF', { x: LX, y: 3.7, z: LZ, ry: Math.PI / 4 }));
  out.push(part('box', [0.5, 0.06, 1.8], '#FFFFFF', { x: LX + 0.2, y: 1.2, z: LZ + 1.4, rx: -0.9 }));
  // surfboards stuck in the sand, a volleyball net
  const boards = ['#E99C8C', '#7CC6B8', '#E9C27A', '#9CC79A'];
  boards.forEach((b, i) => out.push(part('rbox', [0.5, 2.0, 0.08, 0.2], b, { x: 5.2 + i * 0.62, y: 0.95, z: -4.6, rz: (i - 1.5) * 0.08 })));
  out.push(part('cyl', [0.05, 0.05, 2.4, 6], '#FFFFFF', { x: 7.5, y: 1.2, z: 9.6 }), part('cyl', [0.05, 0.05, 2.4, 6], '#FFFFFF', { x: 12.5, y: 1.2, z: 9.6 }));
  out.push(part('box', [5.0, 0.8, 0.02], '#EDEDED', { x: 10, y: 1.9, z: 9.6 }), part('sph', [0.18, 10], '#FFC23D', { x: 9.2, y: 0.18, z: 10.4 }));
  // palms: tall, curved, ringed
  for (const [px, pz, s, l, d] of [[-8.6, 6.3, 1.15, 0.5, 2.5], [5.2, 7.0, 1.05, 0.45, 0.6], [-9.4, -5.6, 1.25, 0.55, 3.6], [5.8, -6.8, 1.2, 0.5, -0.4], [-16, 8, 1.3, 0.4, 2], [14, 3, 1.3, 0.5, 0.8], [-4, -9.5, 1.1, 0.4, 1.5], [1.2, -9.8, 1.25, 0.5, 2.2]]) out.push(...palmParts(px, pz, s, l, d));
  const outside = mesh(out); outside.castShadow = true; outside.receiveShadow = true; scene.add(outside);

  // ---- the sea: two tones and a shimmering, moving shoreline ------------------------------------
  const seaMat = new THREE.MeshToonMaterial({ color: C.sea });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 60, 60, 20), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.05, z0 - 36);
  scene.add(sea);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(120, 30), new THREE.MeshToonMaterial({ color: C.seaDeep }));
  deep.rotation.x = -Math.PI / 2; deep.position.set(0, -0.04, z0 - 52); scene.add(deep);
  const foamGeo = new THREE.BufferGeometry();
  const foams = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.35 - i * 0.08), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85 - i * 0.2 }));
    f.rotation.x = -Math.PI / 2; f.position.set(0, -0.02 + i * 0.002, z0 - 5.8 - i * 1.4); scene.add(f); foams.push(f);
  }
  // a little sailboat and a buoy bobbing offshore, and seagulls wheeling overhead
  const boat = mesh([
    part('rbox', [1.8, 0.4, 0.7, 0.15], '#FFFFFF', { y: 0.2 }), part('box', [1.7, 0.08, 0.6], '#FF6F61', { y: 0.05 }),
    part('cyl', [0.04, 0.04, 2.0, 5], '#8A6240', { y: 1.3 }), part('cone', [0.7, 1.7, 3], '#FFFFFF', { x: 0.3, y: 1.25, sz: 0.1 }),
  ]);
  boat.position.set(-6, 0, z0 - 16); scene.add(boat);
  const buoy = mesh([part('sph', [0.3, 10], '#FF4F4F', { y: 0.15 }), part('cyl', [0.31, 0.31, 0.1, 10], '#FFFFFF', { y: 0.2 })]);
  buoy.position.set(4, 0, z0 - 10); scene.add(buoy);
  const gullGeo = [part('box', [0.5, 0.03, 0.12], '#FFFFFF', { x: -0.22, rz: 0.35 }), part('box', [0.5, 0.03, 0.12], '#FFFFFF', { x: 0.22, rz: -0.35 }), part('sph', [0.07, 6], '#FFFFFF')];
  const gulls = [0, 1, 2].map(i => { const g = mesh(gullGeo, { cast: false }); g.userData = { r: 6 + i * 3, h: 5 + i * 0.8, s: 0.25 + i * 0.07, a: i * 2 }; scene.add(g); return g; });

  // ---- the deck ---------------------------------------------------------------------------------
  const P = [];
  P.push(part('box', [W + 0.6, 0.2, D + 0.4], C.deck, { x: (x0 + x1) / 2, y: -0.08, z: (z0 + z1) / 2, tex: 'wood', texScale: 0.8 }));
  for (let i = 0; i < 20; i++) P.push(part('box', [W + 0.6, 0.201, 0.03], C.deckDark, { x: (x0 + x1) / 2, y: -0.079, z: z0 - 0.1 + i * 0.52 }));
  // the working floor behind the bar: pale terracotta tiles, a clear step apart from the deck
  P.push(part('box', [W, 0.03, 3.0], '#F3D9C4', { x: (x0 + x1) / 2, y: 0.035, z: z0 + 1.5, tex: 'tile', texScale: 0.5 }));
  // a turquoise woven rug under the tables
  P.push(part('cyl', [3.3, 3.3, 0.015, 36], '#9BCFC9', { x: -1.0, y: 0.025, z: 2.6, sz: 0.6 }));
  P.push(part('cyl', [3.0, 3.0, 0.017, 36], '#C3E3DE', { x: -1.0, y: 0.027, z: 2.6, sz: 0.58 }));
  P.push(part('cyl', [2.2, 2.2, 0.019, 36], '#9BCFC9', { x: -1.0, y: 0.029, z: 2.6, sz: 0.56 }));

  // the back of the bar: a planked wall with carved tiki posts, bottle shelves, and a thatch roof line
  P.push(part('box', [W, 1.2, 0.2], '#7A5230', { x: (x0 + x1) / 2, y: 0.6, z: z0 - 0.05, tex: 'wood' }));
  for (let i = 0; i < 7; i++) {
    const x = x0 + i * (W / 6);
    P.push(part('cyl', [0.14, 0.16, 3.0, 8], C.post, { x, y: 1.5, z: z0 - 0.05 }));
    P.push(part('box', [0.24, 0.2, 0.05], '#7CC6B8', { x, y: 2.3, z: z0 + 0.1 }), part('box', [0.24, 0.06, 0.06], '#FFFFFF', { x, y: 2.25, z: z0 + 0.13 }));
  }
  P.push(part('box', [W + 0.8, 0.35, 0.9], C.thatch, { x: (x0 + x1) / 2, y: 3.1, z: z0 - 0.1 }));
  for (let i = 0; i < 30; i++) P.push(part('cone', [0.19, 0.55, 4], i % 2 ? C.thatch : C.thatchD, { x: x0 - 0.3 + i * ((W + 0.6) / 29), y: 2.72, z: z0 + 0.3, rx: Math.PI }));
  P.push(part('box', [W, 0.06, 0.3], C.post, { x: (x0 + x1) / 2, y: 1.95, z: z0 + 0.1 }));
  const bottle = ['#7CC6B8', '#E99C8C', '#E9C27A', '#9CC79A', '#B7A8E0'];
  for (let i = 0; i < 12; i++) P.push(part('cyl', [0.06, 0.07, 0.3, 8], bottle[i % 5], { x: x0 + 0.5 + i * 0.85, y: 2.13, z: z0 + 0.1 }));
  // side and front railings: rope between posts, low enough to see the beach over
  const rail = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.2));
    for (let k = 0; k <= n; k++) P.push(part('cyl', [0.07, 0.08, 1.0, 7], C.post, { x: ax + (bx - ax) * k / n, y: 0.5, z: az + (bz - az) * k / n }));
    // a rail lies along its own run: along z it turns on x, along x it turns on z
    const alongZ = Math.abs(bz - az) > Math.abs(bx - ax), turn = alongZ ? { rx: Math.PI / 2 } : { rz: Math.PI / 2 };
    P.push(part('cyl', [0.055, 0.055, len, 6], '#8C5A30', { x: (ax + bx) / 2, y: 0.98, z: (az + bz) / 2, ...turn }));
    P.push(part('cyl', [0.025, 0.025, len, 5], C.rope, { x: (ax + bx) / 2, y: 0.62, z: (az + bz) / 2, ...turn }));
  };
  rail(x0, z0, x0, z1); rail(x1, z0, x1, z1); rail(x0, z1, doorX0, z1); rail(doorX1, z1, x1, z1);
  // the entrance: two tiki torches and a surfboard sign
  for (const px of [doorX0, doorX1]) {
    P.push(part('cyl', [0.07, 0.09, 1.8, 7], C.post, { x: px, y: 0.9, z: z1 }));
    P.push(part('cyl', [0.13, 0.09, 0.22, 8], '#3B2E2A', { x: px, y: 1.9, z: z1 }));
    P.push(part('cone', [0.1, 0.25, 6], '#FF8A3D', { x: px, y: 2.13, z: z1 }));
  }
  P.push(part('rbox', [1.9, 0.55, 0.1, 0.22], '#E99C8C', { x: (doorX0 + doorX1) / 2, y: 2.35, z: z1 }));
  P.push(part('rbox', [1.6, 0.14, 0.11, 0.06], '#FFFFFF', { x: (doorX0 + doorX1) / 2, y: 2.35, z: z1 + 0.005 }));
  // the bar end left of the till
  P.push(part('box', [-6.3 - x0, 1.0, 0.8], '#7CC6B8', { x: (x0 - 6.3) / 2, y: 0.5, z: -1.6 }));
  P.push(part('box', [-6.3 - x0 + 0.05, 0.07, 0.9], '#5A3A22', { x: (x0 - 6.3) / 2, y: 1.03, z: -1.6 }));
  // a sink station in the back corner, and potted palms in the front corners
  P.push(part('box', [1.1, 0.9, 0.8], '#7CC6B8', { x: 2.95, y: 0.45, z: z0 + 0.45 }), part('box', [1.14, 0.05, 0.84], '#5A3A22', { x: 2.95, y: 0.92, z: z0 + 0.45 }), part('box', [0.56, 0.06, 0.45], '#7E939C', { x: 2.95, y: 0.93, z: z0 + 0.45 }));
  for (const [px, pz] of [[-6.55, 4.55], [-6.55, 0.2]]) {
    P.push(part('cyl', [0.26, 0.2, 0.4, 10], '#E99C8C', { x: px, y: 0.2, z: pz }));
    for (let a = 0; a < 6; a++) P.push(part('box', [0.7, 0.03, 0.2], a % 2 ? C.leaf : C.leafD, { x: px + Math.cos(a * 1.05) * 0.3, y: 0.66, z: pz + Math.sin(a * 1.05) * 0.3, ry: -a * 1.05, rz: -0.45 }));
  }
  const deck = mesh(P); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);

  let t = 0;
  return {
    mesh: deck,
    update(dt) {
      t += dt;
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
