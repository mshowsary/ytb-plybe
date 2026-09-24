// src/render/roomMall.js — the Mall Café: a pet café on the ground floor of a bright shopping mall.
// Same footprint as the town café (x -7..3.6, z -5..5, door front-right), so the same floor plan works.
//
// PALETTE (see propsMall MP): white lacquer, marble and gold for everything built; a navy terrazzo
// floor under the tables (mid-dark, so pastel guests and every pet stand out on it), a coral-and-cream
// tiled kitchen, mint as the fresh accent and one pink neon paw as the sign. The walls on the camera
// side are glass, so the mall is always in view: marble concourse, shop fronts, palms, a fountain, an
// escalator, and shoppers going by with their bags.
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { ROOM } from '../game/layout.js';
import { createHuman } from './human.js';
import { createResidents } from './residents.js';
import { MP } from './propsMall.js';

const C = { floor: '#F1EBE2', grout: '#E0D7CA', walk: '#E8DFD2', terrazzo: '#2E6A5E', kitchenA: '#3F4550', kitchenB: '#D9D1C5', leaf: '#5DAE5A', leafD: '#3F8F45', pot: '#FBF8F3', water: '#7FD3EA' };
const glassMat = new THREE.MeshBasicMaterial({ color: '#DDF3FF', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const neonMat = new THREE.MeshBasicMaterial({ color: '#FF6FAE', toneMapped: false });

// a potted ficus: a white round pot and a few leafy balls
function ficus(P, x, z, s = 1) {
  P.push(part('cyl', [0.34 * s, 0.26 * s, 0.55 * s, 14], C.pot, { x, y: 0.275 * s, z }), part('cyl', [0.35 * s, 0.35 * s, 0.05 * s, 14], MP.gold, { x, y: 0.55 * s, z }));
  P.push(part('cyl', [0.04 * s, 0.05 * s, 0.9 * s, 6], '#8A6440', { x, y: 1.0 * s, z }));
  for (const [dx, dy, dz, r] of [[0, 1.6, 0, 0.42], [0.22, 1.35, 0.1, 0.3], [-0.2, 1.4, -0.08, 0.32], [0.05, 1.9, 0.02, 0.28]]) P.push(part('sph', [r * s, 8], dy > 1.5 ? C.leaf : C.leafD, { x: x + dx * s, y: dy * s, z: z + dz * s }));
}
// a shop front: coloured fascia, a lit window with goods in it, an awning, a round picture sign
function shopFront(P, x, z, w, col, awn, goods) {
  P.push(part('box', [w, 3.4, 0.4], col, { x, y: 1.7, z }));
  P.push(part('box', [w - 0.8, 1.9, 0.06], '#FFE9C2', { x, y: 1.25, z: z + 0.21 }));                  // the warm lit window
  P.push(part('box', [w - 0.7, 0.1, 0.2], MP.gold, { x, y: 0.28, z: z + 0.26 }), part('box', [w - 0.7, 0.1, 0.2], MP.gold, { x, y: 2.24, z: z + 0.26 }));
  goods.forEach((g, i) => P.push(part(g[0], g[1], g[2], { x: x - (w - 1.4) / 2 + i * (w - 1.4) / Math.max(1, goods.length - 1), y: 0.7, z: z + 0.36, ...(g[3] || {}) })));
  for (let k = 0; k < 7; k++) P.push(part('box', [(w - 0.4) / 7, 0.05, 0.9], k % 2 ? '#FFFFFF' : awn, { x: x - (w - 0.4) / 2 + (k + 0.5) * (w - 0.4) / 7, y: 2.62, z: z + 0.62, rx: 0.35 }));
  P.push(part('cyl', [0.42, 0.42, 0.08, 20], '#FFFFFF', { x, y: 3.0, z: z + 0.24, rx: Math.PI / 2 }), part('cyl', [0.36, 0.36, 0.09, 20], awn, { x, y: 3.0, z: z + 0.25, rx: Math.PI / 2 }));
}

export function createMallRoom(scene) {
  const { x0, x1, z0, z1, doorX0, doorX1 } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const out = [];

  // ---- the concourse: marble tiles with gold inlay, a walkway, a fountain, palms and benches ----------
  out.push(part('box', [120, 0.1, 90], C.floor, { y: -0.09, z: 4 }));
  for (let i = -15; i <= 15; i++) out.push(part('box', [0.04, 0.101, 90], C.grout, { x: i * 2.0 + 0.5, y: -0.089, z: 4 }));
  for (let j = -10; j <= 22; j++) out.push(part('box', [120, 0.101, 0.04], C.grout, { y: -0.089, z: j * 2.0 + 1 }));
  out.push(part('box', [120, 0.102, 2.2], C.walk, { y: -0.088, z: 7.2 }));                                       // where the shoppers walk
  out.push(part('box', [120, 0.103, 0.08], MP.gold, { y: -0.087, z: 6.05 }), part('box', [120, 0.103, 0.08], MP.gold, { y: -0.087, z: 8.35 }));
  // the fountain in the square below the café
  const fx = -2.5, fz = 11.6;
  out.push(part('cyl', [2.6, 2.7, 0.5, 32], MP.marble, { x: fx, y: 0.25, z: fz }), part('cyl', [2.3, 2.3, 0.06, 32], C.water, { x: fx, y: 0.48, z: fz }));
  out.push(part('cyl', [2.62, 2.62, 0.05, 32], MP.gold, { x: fx, y: 0.52, z: fz }));
  out.push(part('cyl', [0.3, 0.36, 1.2, 12], MP.marble, { x: fx, y: 0.9, z: fz }), part('cyl', [0.9, 0.5, 0.2, 18], MP.marble, { x: fx, y: 1.5, z: fz }), part('cyl', [0.8, 0.8, 0.04, 18], C.water, { x: fx, y: 1.6, z: fz }));
  // benches along the walkway, palms and ficus in white pots
  for (const bx of [-11, 8.5]) out.push(part('rbox', [1.8, 0.14, 0.55, 0.05], '#C9935E', { x: bx, y: 0.46, z: 9.4 }), part('rbox', [1.8, 0.5, 0.1, 0.04], '#C9935E', { x: bx, y: 0.75, z: 9.66 }),
    part('box', [0.08, 0.44, 0.5], MP.ink, { x: bx - 0.75, y: 0.22, z: 9.4 }), part('box', [0.08, 0.44, 0.5], MP.ink, { x: bx + 0.75, y: 0.22, z: 9.4 }));
  for (const [px, pz, s] of [[-8.2, 5.8, 1.1], [4.6, 5.9, 1.0], [-14, 6, 1.2], [10.8, 6.2, 1.2], [-6.5, 10.4, 1.0], [1.5, 10.6, 1.0], [7.2, -4.6, 1.3], [-9.8, -3.6, 1.2]]) ficus(out, px, pz, s);

  // ---- the neighbours: shop fronts across the concourse and an escalator going up ----------------------
  shopFront(out, 9.6, -6.2, 5.2, '#B9A3E3', MP.coral, [['sph', [0.25, 10], '#FFD84D'], ['box', [0.4, 0.4, 0.3], '#6FD3F0'], ['cone', [0.25, 0.5, 8], '#F47B6B'], ['sph', [0.22, 10], '#8CC47A']]);   // the toy shop
  shopFront(out, -12.4, -6.2, 5.6, '#7FD1B9', '#F0CD6A', [['box', [0.35, 0.5, 0.1], '#F47B6B'], ['box', [0.35, 0.55, 0.1], '#5B8FD6'], ['box', [0.35, 0.45, 0.1], '#F0CD6A'], ['box', [0.35, 0.5, 0.1], '#B9A3E3']]); // the bookshop
  // the escalator: a steel truss rising to the right, glass sides with a gold handrail, steps in stripes
  const ex = 13.5;
  for (let k = 0; k < 16; k++) out.push(part('box', [1.2, 0.08, 0.42], k % 2 ? '#9AA5AB' : '#7E8A90', { x: ex, y: 0.1 + k * 0.28, z: 2 - k * 0.42 }));
  out.push(part('box', [1.5, 0.3, 7.4], '#C9D3D8', { x: ex, y: 2.1, z: -1.2, rx: 0.59 }));
  for (const s of [-0.7, 0.7]) out.push(part('box', [0.06, 0.1, 7.6], MP.gold, { x: ex + s, y: 3.2, z: -1.2, rx: 0.59 }));
  // a mezzanine edge high at the back, a white balustrade with a gold rail, and hanging banners
  out.push(part('box', [70, 0.5, 2.0], MP.white, { y: 4.7, z: -9.5 }), part('box', [70, 0.06, 0.08], MP.gold, { y: 5.55, z: -8.55 }));
  for (let k = -12; k <= 12; k++) out.push(part('cyl', [0.03, 0.03, 0.8, 5], MP.white, { x: k * 2.5, y: 5.15, z: -8.55 }));
  const outside = mesh(out); outside.castShadow = true; outside.receiveShadow = true; scene.add(outside);

  // ---- the café: floors, walls, glass, the neon paw ----------------------------------------------------
  const P = [];
  // the dining floor: navy terrazzo with white, gold, coral and mint chips, and a gold ring under the tables
  P.push(part('box', [W + 0.4, 0.12, D - 3 + 0.2], C.terrazzo, { x: (x0 + x1) / 2, y: -0.06, z: z0 + 3 + (D - 3) / 2 }));
  // soft, sparse chips in the terrazzo: close to the floor's own value, so they read as stone, not confetti
  const chipCols = ['#6FA092', '#CDBFA4', '#4F8A7C', '#B99A74'];
  for (let i = 0; i < 110; i++) {
    const cx = x0 + 0.2 + ((i * 7.31) % 1) * (W - 0.4), cz = z0 + 3.2 + ((i * 3.77) % 1) * (D - 3.4);
    P.push(part('cyl', [0.03 + (i % 3) * 0.012, 0.03 + (i % 3) * 0.012, 0.012, 5], chipCols[i % chipCols.length], { x: cx, y: 0.002, z: cz, ry: i }));
  }
  P.push(part('cyl', [3.35, 3.35, 0.012, 48], MP.gold, { x: -1.0, y: 0.004, z: 2.6, sz: 0.6 }), part('cyl', [3.25, 3.25, 0.014, 48], C.terrazzo, { x: -1.0, y: 0.006, z: 2.6, sz: 0.6 }));
  // the kitchen floor: charcoal and stone tiles behind the service line (the owner's coral and white
  // must never blend into the floor they work on)
  P.push(part('box', [W, 0.03, 3.0], C.kitchenB, { x: (x0 + x1) / 2, y: 0.015, z: z0 + 1.5 }));
  for (let i = 0; i < Math.round(W / 0.75); i++) for (let j = 0; j < 4; j++) {
    if ((i + j) % 2) continue;
    P.push(part('box', [0.75, 0.032, 0.75], C.kitchenA, { x: x0 + 0.375 + i * 0.75, y: 0.016, z: z0 + 0.375 + j * 0.75 }));
  }
  // the back wall: white lacquer over a mint band, gold lines, pendant lamps over the service line
  P.push(part('box', [W + 0.5, 3.1, 0.24], MP.white, { x: (x0 + x1) / 2, y: 1.55, z: z0 - 0.12 }));
  P.push(part('box', [W + 0.52, 0.9, 0.26], MP.mint, { x: (x0 + x1) / 2, y: 0.45, z: z0 - 0.12 }), part('box', [W + 0.54, 0.05, 0.28], MP.gold, { x: (x0 + x1) / 2, y: 0.92, z: z0 - 0.12 }));
  P.push(part('box', [W + 0.54, 0.12, 0.3], MP.gold, { x: (x0 + x1) / 2, y: 3.1, z: z0 - 0.12 }));
  // the left wall: a white base with a glass storefront above it, gold mullions, a white fascia
  P.push(part('box', [0.24, 0.62, D + 0.24], MP.white, { x: x0 - 0.12, y: 0.31, z: (z0 + z1) / 2 }), part('box', [0.26, 0.04, D + 0.26], MP.gold, { x: x0 - 0.12, y: 0.63, z: (z0 + z1) / 2 }));
  for (let k = 0; k <= 5; k++) P.push(part('box', [0.08, 2.3, 0.08], MP.gold, { x: x0 - 0.12, y: 1.78, z: z0 + k * D / 5 }));
  P.push(part('box', [0.28, 0.5, D + 0.3], MP.white, { x: x0 - 0.12, y: 3.0, z: (z0 + z1) / 2 }));
  // a velvet pouf by the glass (the café cat's spot) and a tall ficus in the front corner
  P.push(part('cyl', [0.4, 0.42, 0.42, 16], MP.lilac, { x: x0 + 0.5, y: 0.21, z: 1.25 }), part('cyl', [0.41, 0.41, 0.03, 16], MP.gold, { x: x0 + 0.5, y: 0.02, z: 1.25 }));
  ficus(P, -6.45, 4.45, 0.95);
  // the front: a low white kerb with a glass balustrade and a gold rail either side of the door
  const balustrade = (a, b, z, alongZ = false) => {
    const len = b - a, m = (a + b) / 2;
    const at = alongZ ? { x: z, z: m } : { x: m, z };
    P.push(part('box', alongZ ? [0.24, 0.3, len] : [len, 0.3, 0.24], MP.white, { ...at, y: 0.15 }));
    P.push(part('box', alongZ ? [0.1, 0.06, len + 0.06] : [len + 0.06, 0.06, 0.1], MP.gold, { ...at, y: 1.1 }));
    const n = Math.max(1, Math.round(len / 1.3));
    for (let k = 0; k <= n; k++) { const v = a + len * k / n; P.push(part('box', [0.05, 0.8, 0.05], MP.gold, alongZ ? { x: z, y: 0.7, z: v } : { x: v, y: 0.7, z })); }
  };
  balustrade(x0 - 0.24, doorX0, z1); balustrade(doorX1, x1 + 0.24, z1); balustrade(z0, z1, x1 + 0.12, true);
  // the door: two gold posts and a neon arch with the paw
  for (const px of [doorX0, doorX1]) P.push(part('box', [0.12, 2.5, 0.14], MP.gold, { x: px, y: 1.25, z: z1 }));
  P.push(part('box', [doorX1 - doorX0 + 0.12, 0.16, 0.14], MP.gold, { x: (doorX0 + doorX1) / 2, y: 2.5, z: z1 }));
  // the bar end left of the till, and a sink station in the back corner
  P.push(part('rbox', [-6.3 - x0, 1.0, 0.8, 0.04], MP.white, { x: (x0 - 6.3) / 2, y: 0.5, z: -1.6 }), part('box', [-6.3 - x0 + 0.05, 0.05, 0.9], MP.marble, { x: (x0 - 6.3) / 2, y: 1.02, z: -1.6 }));
  P.push(part('rbox', [1.1, 0.9, 0.8, 0.04], MP.white, { x: 2.95, y: 0.45, z: z0 + 0.45 }), part('box', [1.12, 0.1, 0.82], MP.navy, { x: 2.95, y: 0.05, z: z0 + 0.45 }));
  P.push(part('box', [1.14, 0.05, 0.84], MP.marble, { x: 2.95, y: 0.92, z: z0 + 0.45 }), part('box', [0.56, 0.06, 0.45], '#7E939C', { x: 2.95, y: 0.93, z: z0 + 0.45 }));
  const room = mesh(P); room.castShadow = true; room.receiveShadow = true; scene.add(room);

  // glass panes (transparent, drawn after everything solid)
  const glass = new THREE.Group();
  const pane = (w, h, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; glass.add(m); };
  pane(D, 2.3, x0 - 0.12, 1.78, (z0 + z1) / 2, Math.PI / 2);
  pane(doorX0 - x0 + 0.24, 0.78, (x0 - 0.24 + doorX0) / 2, 0.69, z1);
  pane(x1 + 0.24 - doorX1, 0.78, (doorX1 + x1 + 0.24) / 2, 0.69, z1);
  pane(D, 0.78, x1 + 0.12, 0.69, (z0 + z1) / 2, Math.PI / 2);
  scene.add(glass);

  // the neon: a pink paw on the back wall and an arc over the door, with a soft glow round each
  const neon = new THREE.Group();
  const tube = (r, tr, x, y, z, arc = Math.PI * 2, rz = 0) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, tr, 8, 28, arc), neonMat); m.position.set(x, y, z); m.rotation.z = rz; neon.add(m); };
  const px = -2.2, py = 2.72, pz = z0 + 0.04;
  tube(0.22, 0.03, px, py - 0.08, pz);
  for (const [dx, dy] of [[-0.3, 0.2], [-0.11, 0.34], [0.11, 0.34], [0.3, 0.2]]) tube(0.075, 0.025, px + dx, py + dy, pz);
  tube(0.7, 0.03, (doorX0 + doorX1) / 2, 2.55, z1 + 0.08, Math.PI);
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,111,174,0.55)'); gr.addColorStop(1, 'rgba(255,111,174,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), haloMat); halo.position.set(px, py + 0.1, pz + 0.02); neon.add(halo);
  const halo2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), haloMat); halo2.position.set((doorX0 + doorX1) / 2, 2.8, z1 + 0.1); neon.add(halo2);
  scene.add(neon);

  // fountain jets: a few rising drops that fall back into the basin
  const jetMat = new THREE.MeshBasicMaterial({ color: '#EAFBFF', transparent: true, opacity: 0.8, toneMapped: false });
  const drops = [];
  for (let i = 0; i < 18; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), jetMat); scene.add(d); drops.push({ d, a: i / 18 * Math.PI * 2, t: i / 18 }); }

  // shoppers going by on the walkway with their bags
  const bagCols = ['#F47B6B', '#7FD1B9', '#B9A3E3', '#F0CD6A'];
  const shoppers = [0, 1, 2, 3].map(i => {
    const H = createHuman({ shirt: (i + 2) % 5, hair: i % 4, skin: (i * 2) % 3 }, 'customer');
    const bag = mesh([part('rbox', [0.3, 0.34, 0.14, 0.02], bagCols[i], { y: -0.22 }), part('box', [0.18, 0.1, 0.02], '#FFFFFF', { y: -0.02, z: 0.075 })], { cast: false });
    H.hand.add(bag); H.setCarry(0);
    scene.add(H.group);
    return { H, x: -18 + i * 9, z: i % 2 ? 7.6 : 6.8, v: (i % 2 ? -1 : 1) * (1.1 + i * 0.1) };
  });

  // two of the mall's own pets on a cushion by the bench, lazing and wandering a little
  const residents = createResidents(scene, { x0: -12.5, x1: -9.5, z0: 9.0, z1: 11.2 }, [
    { x: -11.2, z: 10.4, face: 0.3 }, { x: -10.2, z: 9.8, face: -0.4 }, { x: -12.0, z: 9.6, face: 0.8 },
  ], [['dog', 10], ['cat', 9]]);
  out.length = 0;
  const cushion = mesh([part('cyl', [0.9, 0.95, 0.16, 20], MP.coral, { x: -11.2, y: 0.08, z: 10.4 }), part('cyl', [0.7, 0.7, 0.03, 20], '#FFD1C8', { x: -11.2, y: 0.17, z: 10.4 })]);
  cushion.receiveShadow = true; scene.add(cushion);

  let t = 0;
  return {
    mesh: room,
    update(dt) {
      t += dt;
      residents.update(dt);
      const pulse = 0.9 + Math.sin(t * 2.2) * 0.1; haloMat.opacity = pulse;
      for (const o of drops) {
        o.t = (o.t + dt * 0.55) % 1;
        const r = 0.2 + o.t * 1.4, h = 1.65 + Math.sin(o.t * Math.PI) * 1.1;
        o.d.position.set(fx + Math.cos(o.a) * r, h, fz + Math.sin(o.a) * r * 0.9); o.d.scale.setScalar(1 - o.t * 0.4);
      }
      for (const s of shoppers) {
        s.x += s.v * dt;
        if (s.x > 22) s.x = -22; if (s.x < -22) s.x = 22;
        s.H.group.position.set(s.x, 0, s.z);
        s.H.update(dt, s.v, 0);
      }
    },
  };
}
