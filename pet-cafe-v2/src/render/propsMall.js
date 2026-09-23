// src/render/propsMall.js — the Mall Café's stations. Same footprints, same working spots and the same
// state shown (hopper fill, tray of goods, the plates on a used table) as the town's and the beach's,
// dressed for a shopping mall: white lacquer, a mint band, gold trim and marble tops. Every one faces
// +z (the room and the camera).
import * as THREE from 'three';
import { part, mesh } from './geo.js';
import { PRODUCTS, SUPPLIES } from '../game/layout.js';
import { signBoard, jukeboxModel } from './props.js';

// The Mall Café palette: white lacquer and marble, a mint band, navy, coral and gold.
export const MP = {
  white: '#FBF8F3', marble: '#F2EEE8', vein: '#DCD5CB', navy: '#34507F', navyD: '#253B61', mint: '#7FD1B9', mintD: '#4FAF95',
  coral: '#F47B6B', gold: '#C6A15B', goldL: '#E6C98A', lilac: '#B9A3E3', ink: '#2F3A40', steel: '#C9D3D8', rose: '#F6B9C4',
};
// Bold paint per product, so a counter is never the colour of the floor or of the goods on it.
const PAINT = { donut: MP.rose, bubbletea: MP.mint, waffle: '#F4D27A', jerky: '#F29A86' };
const paint = product => PAINT[product] || MP.mint;

// ---- supplies as the mall stores them: cardboard boxes with a coloured band and a picture ----------
export function boxParts(kind, x, y, z) {
  const band = SUPPLIES[kind].band;
  return [
    part('box', [0.38, 0.26, 0.28], '#D7A86E', { x, y: y + 0.13, z }),
    part('box', [0.39, 0.06, 0.29], band, { x, y: y + 0.15, z }),
    part('box', [0.36, 0.02, 0.05], '#C49360', { x, y: y + 0.265, z }),
    part('box', [0.12, 0.08, 0.01], '#FFFFFF', { x, y: y + 0.15, z: z + 0.146 }),
  ];
}

// ---- the four mall machines -------------------------------------------------------------------
export function mallMachineModel(def) {
  const pr = PRODUCTS[def.product], band = SUPPLIES[pr.supply].band, accent = pr.accent;
  const g = new THREE.Group();
  const P = [
    part('rbox', [1.46, 0.86, 1.0, 0.05], MP.white, { y: 0.43 }),
    part('box', [1.48, 0.12, 1.02], MP.navy, { y: 0.06 }),
    part('box', [1.47, 0.09, 1.01], paint(def.product), { y: 0.7 }),
    part('box', [1.56, 0.06, 1.14], MP.marble, { y: 0.92 }),
    part('box', [1.58, 0.02, 1.16], MP.gold, { y: 0.89 }),
    // hopper, banded like its box in the stockroom
    part('cyl', [0.21, 0.19, 0.5, 14], '#FFFFFF', { x: -0.48, y: 1.2, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], band, { x: -0.48, y: 1.46, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], band, { x: -0.48, y: 0.96, z: -0.28 }),
    part('box', [0.1, 0.4, 0.02], '#BFE4F5', { x: -0.48, y: 1.21, z: -0.075 }),
    part('box', [0.96, 0.02, 0.46], '#9AA5AB', { x: 0.1, y: 0.955, z: 0.25 }),
  ];
  let glowAt = { w: 0.14, h: 0.07, y: 1.3, z: 0.1, x: 0.3 }, hue = 0.08;
  if (pr.model === 'fryer') {
    // a steel fryer with golden oil and three donuts bobbing in it, a drip rack beside it
    P.push(part('box', [0.62, 0.22, 0.46], MP.steel, { x: 0.3, y: 1.05, z: -0.2 }),
      part('box', [0.56, 0.02, 0.4], '#E9B44C', { x: 0.3, y: 1.155, z: -0.2 }),
      part('box', [0.66, 0.03, 0.5], '#9AA5AB', { x: 0.3, y: 1.17, z: -0.2 }),
      part('torus', [0.07, 0.035, 6, 14], '#C98B4E', { x: 0.18, y: 1.17, z: -0.24 }),
      part('torus', [0.07, 0.035, 6, 14], '#C98B4E', { x: 0.38, y: 1.17, z: -0.14 }),
      part('torus', [0.07, 0.035, 6, 14], '#C98B4E', { x: 0.46, y: 1.17, z: -0.3 }),
      part('box', [0.04, 0.3, 0.04], MP.ink, { x: 0.62, y: 1.3, z: -0.2, rz: -0.5 }));
    glowAt = { w: 0.5, h: 0.05, y: 1.16, z: 0.035, x: 0.3 };
  } else if (pr.model === 'teabar') {
    // three tea urns — black tea, matcha and taro — with brass taps, a shaker and a jar of pearls
    [['#8A5A3C', 0.08], ['#8CC47A', 0.32], ['#B89AD9', 0.56]].forEach(([tea, x]) => P.push(
      part('cyl', [0.1, 0.1, 0.44, 12], '#EAF7FF', { x, y: 1.17, z: -0.26 }),
      part('cyl', [0.088, 0.088, 0.34, 12], tea, { x, y: 1.13, z: -0.26 }),
      part('cyl', [0.105, 0.105, 0.04, 12], MP.gold, { x, y: 1.4, z: -0.26 }),
      part('box', [0.04, 0.04, 0.1], MP.gold, { x, y: 1.02, z: -0.14 })));
    P.push(part('cyl', [0.06, 0.05, 0.2, 10], MP.steel, { x: 0.62, y: 1.05, z: 0.0 }),
      part('cyl', [0.07, 0.07, 0.14, 10], '#EAF7FF', { x: -0.1, y: 1.02, z: 0.02 }),
      part('cyl', [0.06, 0.06, 0.05, 10], '#2E2320', { x: -0.1, y: 0.98, z: 0.02 }));
    glowAt = { w: 0.5, h: 0.04, y: 0.99, z: -0.13, x: 0.32 }; hue = 0.35;
  } else if (pr.model === 'waffle') {
    // a double waffle iron, lids up, a golden waffle in each, and a jug of batter
    for (const wx of [0.12, 0.48]) P.push(
      part('cyl', [0.17, 0.17, 0.08, 16], MP.ink, { x: wx, y: 1.0, z: -0.18 }),
      part('cyl', [0.15, 0.15, 0.02, 16], '#E8A94A', { x: wx, y: 1.05, z: -0.18 }),
      part('cyl', [0.17, 0.17, 0.05, 16], MP.ink, { x: wx, y: 1.22, z: -0.36, rx: -1.1 }),
      part('box', [0.06, 0.03, 0.2], MP.gold, { x: wx, y: 1.0, z: 0.03 }));
    P.push(part('cyl', [0.07, 0.06, 0.18, 10], '#FFFFFF', { x: 0.66, y: 1.04, z: 0.05 }), part('cyl', [0.06, 0.06, 0.02, 10], '#F2C14E', { x: 0.66, y: 1.12, z: 0.05 }));
    glowAt = { w: 0.6, h: 0.04, y: 0.97, z: -0.01, x: 0.3 };
  } else {
    // the jerky smoker: a black cabinet with a chimney, a glowing slot, strips hanging on hooks
    P.push(part('rbox', [0.62, 0.52, 0.46, 0.04], '#2F3134', { x: 0.28, y: 1.21, z: -0.2 }),
      part('cyl', [0.06, 0.06, 0.34, 8], '#3B3E42', { x: 0.48, y: 1.62, z: -0.32 }),
      part('cyl', [0.08, 0.08, 0.04, 8], MP.coral, { x: 0.48, y: 1.8, z: -0.32 }),
      part('box', [0.5, 0.02, 0.02], MP.steel, { x: 0.28, y: 1.38, z: 0.035 }));
    for (const hx of [0.12, 0.24, 0.36, 0.44]) P.push(part('box', [0.05, 0.18, 0.02], '#9C4A33', { x: hx, y: 1.26, z: 0.04 }));
    glowAt = { w: 0.44, h: 0.05, y: 1.06, z: 0.035, x: 0.28 };
  }
  g.add(mesh(P));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(glowAt.w, glowAt.h), new THREE.MeshBasicMaterial({ color: '#FFB25E', toneMapped: false }));
  glow.position.set(glowAt.x, glowAt.y, glowAt.z); g.add(glow);
  const fillCol = { dough: '#FFE6D2', tea: '#B98A62', batter: '#F7D77A', meat: '#C9624E' }[pr.supply] || '#FFFFFF';
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 12), new THREE.MeshToonMaterial({ color: fillCol }));
  fill.position.set(-0.48, 0.99, -0.28); g.add(fill);
  const sign = signBoard(pr.emoji, accent); sign.position.set(-0.05, 2.35, -0.3);
  g.add(sign, mesh([part('cyl', [0.025, 0.025, 0.8, 6], MP.gold, { x: -0.05, y: 1.95, z: -0.42 })]));
  return {
    group: g, tray: { x: 0.1, y: 0.97, z: 0.25 },
    setLevel(f) { fill.scale.y = Math.max(0.02, f) * 0.44; fill.position.y = 0.99 + fill.scale.y / 2; },
    setBusy(on, t) { glow.material.color.setHSL(hue, 1, on ? 0.55 + Math.sin(t * 8) * 0.06 : 0.16); },
  };
}

// ---- a glass display case on a lacquered base: goods on show under a gold rail ---------------------
const glassMat = new THREE.MeshBasicMaterial({ color: '#E6F6FF', transparent: true, opacity: 0.16, depthWrite: false });
export function mallCounterModel(product) {
  const accent = PRODUCTS[product].accent;
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.76, 0.8, 0.78, 0.04], MP.white, { y: 0.44 }),
    part('box', [1.6, 0.46, 0.02], paint(product), { y: 0.46, z: 0.4 }),
    part('box', [1.78, 0.1, 0.8], MP.navy, { y: 0.05 }),
    part('box', [1.84, 0.05, 0.84], MP.marble, { y: 0.87 }),
    part('box', [1.86, 0.02, 0.86], MP.gold, { y: 0.845 }),
    part('box', [1.7, 0.02, 0.62], '#FFFFFF', { y: 0.905 }),
    part('cyl', [0.022, 0.022, 0.3, 6], MP.gold, { x: -0.86, y: 1.05, z: 0.36 }),
    part('cyl', [0.022, 0.022, 0.3, 6], MP.gold, { x: 0.86, y: 1.05, z: 0.36 }),
    part('cyl', [0.02, 0.02, 1.74, 6], MP.gold, { y: 1.2, z: 0.36, rz: Math.PI / 2 }),
  ]));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.26), glassMat); glass.position.set(0, 1.05, 0.36); glass.renderOrder = 2;
  g.add(glass);
  const sign = signBoard(PRODUCTS[product].emoji, accent, 0.44); sign.position.set(-0.75, 1.62, -0.25);
  g.add(sign, mesh([part('cyl', [0.025, 0.025, 0.36, 6], MP.gold, { x: -0.75, y: 1.44, z: -0.27 })]));
  return { group: g, shelf: { x: 0, y: 0.92, z: 0.02 } };
}

export function mallTillModel() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.36, 0.8, 0.78, 0.04], MP.white, { y: 0.44 }),
    part('box', [1.2, 0.46, 0.02], MP.lilac, { y: 0.46, z: 0.4 }),
    part('box', [1.38, 0.1, 0.8], MP.navy, { y: 0.05 }),
    part('box', [1.44, 0.05, 0.84], MP.marble, { y: 0.87 }),
    part('box', [1.46, 0.02, 0.86], MP.gold, { y: 0.845 }),
    // a tablet till on a stand, a card reader, and a gold tip jar
    part('cyl', [0.03, 0.05, 0.2, 8], MP.steel, { y: 1.0, z: -0.05 }),
    part('rbox', [0.46, 0.3, 0.03, 0.02], MP.ink, { y: 1.2, z: -0.06, rx: -0.35 }),
    part('box', [0.4, 0.24, 0.01], '#6FD3F0', { y: 1.2, z: -0.04, rx: -0.35 }),
    part('rbox', [0.12, 0.04, 0.18, 0.02], MP.ink, { x: -0.36, y: 0.92, z: 0.1 }),
    part('cyl', [0.11, 0.09, 0.2, 12], MP.goldL, { x: 0.45, y: 0.99 }),
    part('cyl', [0.05, 0.05, 0.03, 8], '#FFD84D', { x: 0.45, y: 1.1 }),
  ]));
  const sign = signBoard('💰', MP.gold, 0.44); sign.position.set(-0.45, 1.62, -0.25);
  g.add(sign, mesh([part('cyl', [0.025, 0.025, 0.36, 6], MP.gold, { x: -0.45, y: 1.44, z: -0.27 })]));
  return { group: g };
}

// the stockroom shelf: white steel with a mint back, one shelf of boxes per supply
export function mallPantryModel() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [0.06, 2.0, 0.85], MP.steel, { x: -0.72, y: 1.0 }), part('box', [0.06, 2.0, 0.85], MP.steel, { x: 0.72, y: 1.0 }),
    part('box', [1.5, 2.0, 0.04], MP.mint, { y: 1.0, z: -0.42 }),
    ...[0.08, 0.62, 1.16, 1.7].map(y => part('box', [1.44, 0.05, 0.82], MP.white, { y })),
    part('box', [1.56, 0.08, 0.9], MP.gold, { y: 2.02 }),
  ]));
  const rows = {};
  for (const [kind, y] of [['dough', 0.1], ['tea', 0.64], ['batter', 1.18], ['meat', 1.72]]) {
    const row = mesh([-0.42, 0, 0.42].flatMap(x => boxParts(kind, x, y, 0.1)));
    const sg = signBoard(SUPPLIES[kind].emoji, SUPPLIES[kind].band, 0.24); sg.position.set(0.84, y + 0.3, 0.3);
    const r = new THREE.Group(); r.add(row, sg); r.visible = kind === 'dough'; g.add(r); rows[kind] = r;
  }
  const sign = signBoard('🧺', MP.gold, 0.5); sign.position.set(0, 2.75, 0.1);
  g.add(sign);
  return { group: g, rows };
}

// marble café tables on a gold pedestal; velvet chairs, coral and mint in turn
let tableN = 0;
export function mallTableModel() {
  const g = new THREE.Group();
  const seat = (tableN++ % 2) ? MP.mint : MP.coral;
  const chair = (x, col) => {
    const s = Math.sign(x);
    return [
      part('rbox', [0.44, 0.1, 0.44, 0.05], col, { x, y: 0.47 }),
      part('rbox', [0.1, 0.5, 0.44, 0.05], col, { x: x + s * 0.2, y: 0.74, rz: -s * 0.12 }),
      part('cyl', [0.03, 0.03, 0.44, 6], MP.gold, { x, y: 0.22 }),
      part('cyl', [0.18, 0.2, 0.03, 12], MP.gold, { x, y: 0.015 }),
    ];
  };
  g.add(mesh([
    part('cyl', [0.54, 0.54, 0.05, 24], MP.marble, { y: 0.77 }),
    part('cyl', [0.555, 0.555, 0.02, 24], MP.gold, { y: 0.745 }),
    part('cyl', [0.045, 0.06, 0.72, 10], MP.gold, { y: 0.37 }),
    part('cyl', [0.26, 0.3, 0.04, 16], MP.gold, { y: 0.02 }),
    part('cyl', [0.05, 0.04, 0.12, 8], '#FFFFFF', { y: 0.85, z: -0.28 }),
    part('sph', [0.06, 7], MP.lilac, { y: 0.94, z: -0.28 }),
    ...chair(-0.78, seat), ...chair(0.78, seat),
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

export function mallModelFor(st) {
  switch (st.type) {
    case 'machine': return mallMachineModel(st);
    case 'counter': return mallCounterModel(st.product);
    case 'till': return mallTillModel();
    case 'pantry': return mallPantryModel();
    case 'table': return mallTableModel();
    case 'jukebox': return jukeboxModel();
    default: return { group: new THREE.Group() };
  }
}
