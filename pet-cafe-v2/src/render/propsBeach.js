// src/render/propsBeach.js — the Beach Shack's stations. Same footprints, same working spots and the
// same state shown (hopper fill, tray of goods) as the town's, dressed for the sand: bamboo, rope,
// bright paint. Every one faces +z (the room and the camera).
import * as THREE from 'three';
import { part, merge, mesh } from './geo.js';
import { PRODUCTS, SUPPLIES } from '../game/layout.js';
import { signBoard, jukeboxModel } from './props.js';
import { kitHas, createBatch } from './kit.js';

// The Beach Shack palette (the same hexes as art/build_beach.py): whitewash, navy, coral, driftwood.
export const BP = { white: '#FAF7F0', cream: '#F4EFE6', navy: '#2E4A78', navyD: '#22385E', coral: '#EE7F5F', teal: '#6FB7B0', yellow: '#F2C76B', blue: '#5B8FB9', wood: '#C8A57E', woodD: '#9C7A55', trunkD: '#6E5238', sand: '#EAD7B0' };
const BAMBOO = BP.wood, BAMBOO_D = BP.woodD, ROPE = '#E6D2A6', TOP = BP.trunkD, STEEL = '#C9D3D8', INK = '#2F3A40';
// Bold paint per product, so a counter is never the colour of the deck or of the goods on it.
const PAINT = { lemonade: BP.yellow, smoothie: BP.coral, icecream: BP.blue, fish: BP.teal };
const KIT_COUNTER = { lemonade: 'beach/b_counter_yellow', smoothie: 'beach/b_counter_coral', icecream: 'beach/b_counter_blue', fish: 'beach/b_counter_teal' };
export const BEACH_STATION_KIT = [...Object.values(KIT_COUNTER), 'beach/b_till', 'beach/b_table', 'beach/b_chair_coral', 'beach/b_chair_navy'];
const paint = product => PAINT[product] || BP.teal;

function bambooSkirt(w, h, d, z, col = BAMBOO) {
  const P = [];
  const n = Math.round(w / 0.12);
  for (let i = 0; i < n; i++) P.push(part('cyl', [0.055, 0.055, h, 6], i % 2 ? col : BAMBOO_D, { x: -w / 2 + 0.06 + i * (w - 0.12) / (n - 1), y: h / 2, z }));
  return P;
}

// ---- supplies as the beach stores them: crates, a tub, a cooler ---------------------------------
export function crateParts(kind, x, y, z) {
  const band = SUPPLIES[kind].band;
  if (kind === 'cream') return [
    part('cyl', [0.15, 0.13, 0.3, 12], '#FFFFFF', { x, y: y + 0.15, z }),
    part('cyl', [0.16, 0.16, 0.05, 12], band, { x, y: y + 0.31, z }),
  ];
  if (kind === 'fishbox') return [
    part('rbox', [0.36, 0.26, 0.24, 0.04], band, { x, y: y + 0.13, z }),
    part('rbox', [0.38, 0.06, 0.26, 0.03], '#FFFFFF', { x, y: y + 0.28, z }),
    part('box', [0.12, 0.03, 0.01], '#FFFFFF', { x, y: y + 0.14, z: z + 0.125 }),
  ];
  const fruit = kind === 'lemons' ? '#F7D32E' : '#E8546B';
  const P = [
    part('box', [0.36, 0.18, 0.26], '#C99A5B', { x, y: y + 0.09, z, tex: 'wood' }),
    part('box', [0.37, 0.04, 0.27], band, { x, y: y + 0.12, z }),
  ];
  for (const [dx, dz] of [[-0.1, -0.06], [0.02, 0.05], [0.1, -0.04], [-0.04, 0.07]]) P.push(part('sph', [0.07, 7], fruit, { x: x + dx, y: y + 0.22, z: z + dz }));
  return P;
}

// ---- the four beach machines ------------------------------------------------------------------
export function beachMachineModel(def) {
  const pr = PRODUCTS[def.product], band = SUPPLIES[pr.supply].band, accent = pr.accent;
  const g = new THREE.Group();
  const P = [
    part('box', [1.46, 0.86, 1.0], BP.cream, { y: 0.43 }),
    part('box', [1.48, 0.12, 1.02], BP.navy, { y: 0.06 }),
    part('box', [1.47, 0.1, 1.01], paint(def.product), { y: 0.72 }),
    part('box', [1.56, 0.06, 1.16], BP.woodD, { y: 0.92, tex: 'wood' }),
    // hopper, banded like its crate on the pantry shelf
    part('cyl', [0.21, 0.19, 0.5, 14], '#FFFFFF', { x: -0.48, y: 1.2, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], band, { x: -0.48, y: 1.46, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], band, { x: -0.48, y: 0.96, z: -0.28 }),
    part('box', [0.1, 0.4, 0.02], '#BFE4F5', { x: -0.48, y: 1.21, z: -0.075 }),
    part('box', [0.96, 0.02, 0.46], '#3A2616', { x: 0.1, y: 0.955, z: 0.25 }),
  ];
  let glowAt = { w: 0.14, h: 0.07, y: 1.3, z: 0.1, x: 0.3 };
  if (pr.model === 'juicer') {
    P.push(part('cyl', [0.2, 0.2, 0.46, 16], '#EAF7FF', { x: 0.3, y: 1.2, z: -0.18 }),
      part('cyl', [0.18, 0.18, 0.34, 16], '#F7DC4A', { x: 0.3, y: 1.15, z: -0.18 }),
      part('cyl', [0.21, 0.21, 0.04, 16], '#F29A38', { x: 0.3, y: 1.45, z: -0.18 }),
      part('box', [0.06, 0.06, 0.12], STEEL, { x: 0.3, y: 1.02, z: 0.02 }),
      part('sph', [0.06, 7], '#F7D32E', { x: 0.62, y: 1.0, z: -0.3 }), part('sph', [0.06, 7], '#F7D32E', { x: 0.7, y: 1.0, z: -0.2 }));
    glowAt = { w: 0.1, h: 0.05, y: 1.5, z: -0.18, x: 0.3 };
  } else if (pr.model === 'blender') {
    for (const bx of [0.12, 0.5]) P.push(
      part('box', [0.2, 0.12, 0.2], INK, { x: bx, y: 1.02, z: -0.2 }),
      part('cyl', [0.1, 0.08, 0.32, 12], '#EAF7FF', { x: bx, y: 1.24, z: -0.2 }),
      part('cyl', [0.085, 0.075, 0.2, 12], '#FF7FA8', { x: bx, y: 1.18, z: -0.2 }),
      part('cyl', [0.105, 0.105, 0.03, 12], INK, { x: bx, y: 1.41, z: -0.2 }));
    glowAt = { w: 0.06, h: 0.04, y: 1.02, z: -0.09, x: 0.12 };
  } else if (pr.model === 'icecream') {
    P.push(part('rbox', [0.7, 0.55, 0.5, 0.06], '#FFFFFF', { x: 0.3, y: 1.22, z: -0.18 }),
      part('box', [0.72, 0.06, 0.52], '#8FD8F0', { x: 0.3, y: 1.52, z: -0.18 }),
      part('cyl', [0.04, 0.02, 0.12, 8], STEEL, { x: 0.18, y: 0.99, z: 0.02 }), part('cyl', [0.04, 0.02, 0.12, 8], STEEL, { x: 0.42, y: 0.99, z: 0.02 }),
      part('cone', [0.1, 0.2, 10], '#FFB6D0', { x: 0.3, y: 1.66, z: -0.18 }),
      part('cone', [0.05, 0.14, 8], '#E3B06A', { x: 0.3, y: 1.52, z: -0.18, rx: Math.PI }));
    glowAt = { w: 0.2, h: 0.06, y: 1.3, z: 0.075, x: 0.3 };
  } else {
    // the fish grill: a charcoal drum with a hood and a lick of flame under the grate
    P.push(part('cyl', [0.34, 0.3, 0.2, 16], '#2F3134', { x: 0.28, y: 1.05, z: -0.15 }),
      part('box', [0.62, 0.02, 0.5], '#8C8F93', { x: 0.28, y: 1.16, z: -0.15 }),
      part('sph', [0.33, 16], '#3B3E42', { x: 0.28, y: 1.17, z: -0.42, sz: 0.35, sy: 0.9 }),
      part('box', [0.08, 0.04, 0.2], '#C0504D', { x: 0.28, y: 1.52, z: -0.42 }));
    for (const fx of [0.12, 0.3, 0.46]) P.push(part('sph', [0.07, 7], '#8FB4E6', { x: fx, y: 1.19, z: -0.1, sx: 1.6, sy: 0.5 }));
    glowAt = { w: 0.5, h: 0.05, y: 1.15, z: 0.12, x: 0.28 };
  }
  g.add(mesh(P));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(glowAt.w, glowAt.h), new THREE.MeshBasicMaterial({ color: '#FFB25E', toneMapped: false }));
  glow.position.set(glowAt.x, glowAt.y, glowAt.z); g.add(glow);
  const fillCol = { lemons: '#F7DC4A', fruit: '#FF7FA8', cream: '#FFFFFF', fishbox: '#8FB4E6' }[pr.supply] || '#FFFFFF';
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 12), new THREE.MeshToonMaterial({ color: fillCol }));
  fill.position.set(-0.48, 0.99, -0.28); g.add(fill);
  const sign = signBoard(pr.emoji, accent); sign.position.set(-0.05, 2.35, -0.3);
  g.add(sign, mesh([part('cyl', [0.03, 0.03, 0.8, 6], BAMBOO_D, { x: -0.05, y: 1.95, z: -0.42 })]));
  return {
    group: g, tray: { x: 0.1, y: 0.97, z: 0.25 },
    setLevel(f) { fill.scale.y = Math.max(0.02, f) * 0.44; fill.position.y = 0.99 + fill.scale.y / 2; },
    setBusy(on, t) { glow.material.color.setHSL(pr.model === 'icecream' || pr.model === 'blender' ? 0.5 : 0.08, 1, on ? 0.55 + Math.sin(t * 8) * 0.06 : 0.16); },
  };
}

// ---- a bamboo counter: goods on an open shelf with a rope-edged front ---------------------------
const glassMat = new THREE.MeshBasicMaterial({ color: '#DDF3FF', transparent: true, opacity: 0.14, depthWrite: false });
export function beachCounterModel(product) {
  const accent = PRODUCTS[product].accent;
  const g = new THREE.Group();
  if (kitHas(KIT_COUNTER[product])) {
    const B = createBatch(); B.put(KIT_COUNTER[product], 0, 0, 0, 0, 1); B.bake(g);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.24), glassMat); glass.position.set(0, 1.08, 0.38); glass.renderOrder = 2;
    g.add(glass, mesh([part('box', [1.74, 0.03, 0.04], BP.woodD, { y: 1.21, z: 0.38 }), part('cyl', [0.02, 0.02, 0.28, 6], BP.woodD, { x: -0.86, y: 1.07, z: 0.38 }), part('cyl', [0.02, 0.02, 0.28, 6], BP.woodD, { x: 0.86, y: 1.07, z: 0.38 })]));
    const sign = signBoard(PRODUCTS[product].emoji, accent, 0.44); sign.position.set(-0.75, 1.62, -0.25);
    g.add(sign, mesh([part('cyl', [0.03, 0.03, 0.36, 6], BP.woodD, { x: -0.75, y: 1.44, z: -0.27 })]));
    return { group: g, shelf: { x: 0, y: 0.945, z: 0.02 } };
  }
  g.add(mesh([
    ...bambooSkirt(1.8, 0.14, 0.8, 0.4),
    part('box', [1.76, 0.84, 0.78], paint(product), { y: 0.42 }),
    part('box', [1.77, 0.1, 0.79], '#FFFFFF', { y: 0.7 }),
    part('box', [1.84, 0.06, 0.84], BAMBOO_D, { y: 0.89, tex: 'wood' }),
    part('box', [1.7, 0.02, 0.62], TOP, { y: 0.93 }),
    part('cyl', [0.03, 0.03, 1.84, 6], ROPE, { y: 0.84, z: 0.41, rz: Math.PI / 2 }),
    part('cyl', [0.035, 0.035, 0.28, 6], BAMBOO_D, { x: -0.86, y: 1.05, z: 0.36 }),
    part('cyl', [0.035, 0.035, 0.28, 6], BAMBOO_D, { x: 0.86, y: 1.05, z: 0.36 }),
    part('cyl', [0.03, 0.03, 1.76, 6], BAMBOO_D, { y: 1.18, z: 0.36, rz: Math.PI / 2 }),
  ]));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.24), glassMat); glass.position.set(0, 1.05, 0.36); glass.renderOrder = 2;
  g.add(glass);
  const sign = signBoard(PRODUCTS[product].emoji, accent, 0.44); sign.position.set(-0.75, 1.62, -0.25);
  g.add(sign, mesh([part('cyl', [0.03, 0.03, 0.36, 6], BAMBOO_D, { x: -0.75, y: 1.44, z: -0.27 })]));
  return { group: g, shelf: { x: 0, y: 0.94, z: 0.02 } };
}

export function beachTillModel() {
  const g = new THREE.Group();
  if (kitHas('beach/b_till')) {
    const B = createBatch(); B.put('beach/b_till', 0, 0, 0, 0, 1); B.bake(g);
    const sign = signBoard('💰', BP.navy, 0.44); sign.position.set(-0.45, 1.62, -0.25);
    g.add(sign, mesh([part('cyl', [0.03, 0.03, 0.36, 6], BP.woodD, { x: -0.45, y: 1.44, z: -0.27 })]));
    return { group: g };
  }
  g.add(mesh([
    ...bambooSkirt(1.4, 0.86, 0.8, 0.4),
    part('box', [1.36, 0.84, 0.78], '#E9C27A', { y: 0.42 }),
    part('box', [1.37, 0.1, 0.79], '#FFFFFF', { y: 0.7 }),
    part('box', [1.44, 0.06, 0.84], BAMBOO_D, { y: 0.89, tex: 'wood' }),
    part('rbox', [0.56, 0.12, 0.44, 0.03], '#2F6F6A', { y: 0.98 }),
    part('rbox', [0.5, 0.2, 0.34, 0.04], '#F29A38', { y: 1.13, z: -0.03 }),
    part('box', [0.36, 0.2, 0.03], '#23312F', { y: 1.3, z: -0.1, rx: -0.5 }),
    part('sph', [0.12, 10], '#8B5A2B', { x: 0.45, y: 1.02, sy: 0.8 }),      // a coconut tip jar
    part('cyl', [0.12, 0.12, 0.02, 10], '#FFFFFF', { x: 0.45, y: 1.1 }),
    part('cyl', [0.05, 0.05, 0.03, 8], '#FFD84D', { x: 0.45, y: 1.12 }),
  ]));
  const sign = signBoard('💰', '#3FB6A8', 0.44); sign.position.set(-0.45, 1.62, -0.25);
  g.add(sign, mesh([part('cyl', [0.03, 0.03, 0.36, 6], BAMBOO_D, { x: -0.45, y: 1.44, z: -0.27 })]));
  return { group: g };
}

export function beachPantryModel() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [0.08, 2.0, 0.85], BAMBOO_D, { x: -0.72, y: 1.0 }), part('box', [0.08, 2.0, 0.85], BAMBOO_D, { x: 0.72, y: 1.0 }),
    part('box', [1.5, 2.0, 0.04], BP.cream, { y: 1.0, z: -0.42 }),
    ...[0.08, 0.62, 1.16, 1.7].map(y => part('box', [1.44, 0.05, 0.82], BAMBOO, { y, tex: 'wood' })),
    part('cone', [0.95, 0.5, 10], BP.navy, { y: 2.3 }),
  ]));
  const rows = {};
  for (const [kind, y] of [['lemons', 0.1], ['fruit', 0.64], ['cream', 1.18], ['fishbox', 1.18]]) {
    const xs = kind === 'cream' ? [-0.45, -0.15] : kind === 'fishbox' ? [0.2, 0.5] : [-0.42, 0, 0.42];
    const row = mesh(xs.flatMap(x => crateParts(kind, x, y, 0.12)));
    const sg = signBoard(SUPPLIES[kind].emoji, SUPPLIES[kind].band, 0.24); sg.position.set(kind === 'cream' ? -0.84 : 0.84, y + 0.3, 0.3);
    const r = new THREE.Group(); r.add(row, sg); r.visible = kind === 'lemons'; g.add(r); rows[kind] = r;
  }
  const sign = signBoard('🧺', '#D9B46A', 0.5); sign.position.set(0, 2.75, 0.1);
  g.add(sign);
  return { group: g, rows };
}

let tableN = 0;
export function beachTableModel() {
  const g = new THREE.Group();
  if (kitHas('beach/b_table')) {
    // white tables with navy rims; the chairs alternate coral and navy cushions table to table
    const B = createBatch(), chair = (tableN++ % 2) ? 'beach/b_chair_navy' : 'beach/b_chair_coral';
    B.put('beach/b_table', 0, 0, 0, 0, 1);
    B.put(chair, -0.8, 0, 0, Math.PI / 2, 1);
    B.put(chair, 0.8, 0, 0, -Math.PI / 2, 1);
    B.bake(g);
    const dirty = mesh([
      part('cyl', [0.15, 0.12, 0.02, 12], '#FFFFFF', { x: -0.2, y: 0.79 }),
      part('cyl', [0.15, 0.12, 0.02, 12], '#FFFFFF', { x: 0.2, y: 0.79, z: 0.05 }),
      part('cyl', [0.05, 0.04, 0.12, 8], '#EAF7FF', { x: 0.05, y: 0.84, z: 0.22 }),
      ...[[-0.3, 0.2], [0.1, -0.15], [0.32, -0.1]].map(([x, z]) => part('sph', [0.018, 4], '#E8B04A', { x, y: 0.785, z })),
    ], { cast: false });
    dirty.visible = false; g.add(dirty);
    return { group: g, dirty, tipAt: { x: 0, y: 0.79, z: 0.25 } };
  }
  const chair = (x, col) => {
    const s = Math.sign(x);
    return [
      part('rbox', [0.42, 0.06, 0.42, 0.03], col, { x, y: 0.46 }),
      part('rbox', [0.06, 0.46, 0.42, 0.03], col, { x: x + s * 0.2, y: 0.7, rz: -s * 0.18 }),
      ...[[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].map(([dx, dz]) => part('cyl', [0.022, 0.022, 0.45, 5], BAMBOO_D, { x: x + dx, y: 0.225, z: dz })),
    ];
  };
  g.add(mesh([
    part('cyl', [0.52, 0.52, 0.06, 22], BAMBOO, { y: 0.76, tex: 'wood' }),
    part('cyl', [0.5, 0.5, 0.02, 22], '#8ACBC5', { y: 0.795 }),
    part('cyl', [0.3, 0.3, 0.022, 22], '#FFFFFF', { y: 0.797 }),
    part('cyl', [0.53, 0.53, 0.03, 22], ROPE, { y: 0.74 }),
    part('cyl', [0.06, 0.08, 0.72, 8], BAMBOO_D, { y: 0.37 }),
    part('cyl', [0.26, 0.3, 0.05, 14], BAMBOO_D, { y: 0.025 }),
    part('cyl', [0.06, 0.05, 0.1, 8], '#FFFFFF', { y: 0.85, z: -0.28 }),
    part('sph', [0.06, 6], '#FF7FA8', { y: 0.94, z: -0.28 }),
    ...chair(-0.78, '#E99C8C'), ...chair(0.78, '#E9C27A'),
  ]));
  const dirty = mesh([
    part('cyl', [0.15, 0.12, 0.02, 12], '#FFFFFF', { x: -0.2, y: 0.81 }),
    part('cyl', [0.15, 0.12, 0.02, 12], '#FFFFFF', { x: 0.2, y: 0.81, z: 0.05 }),
    part('cyl', [0.05, 0.04, 0.12, 8], '#EAF7FF', { x: 0.05, y: 0.86, z: 0.22 }),
    ...[[-0.3, 0.2], [0.1, -0.15], [0.32, -0.1]].map(([x, z]) => part('sph', [0.018, 4], '#E8B04A', { x, y: 0.805, z })),
  ], { cast: false });
  dirty.visible = false; g.add(dirty);
  return { group: g, dirty, tipAt: { x: 0, y: 0.81, z: 0.25 } };
}

export function beachModelFor(st) {
  switch (st.type) {
    case 'machine': return beachMachineModel(st);
    case 'counter': return beachCounterModel(st.product);
    case 'till': return beachTillModel();
    case 'pantry': return beachPantryModel();
    case 'table': return beachTableModel();
    case 'jukebox': return jukeboxModel();
    default: return { group: new THREE.Group() };
  }
}
