// src/render/props.js — the station models. Every one faces +z (toward the room and the camera),
// shows what it is at a glance (a picture sign on top), and shows its state without words: the flour
// left in an oven's bin, the goods on its tray, the plates on a used table.
import * as THREE from 'three';
import { part, merge, mesh } from './geo.js';

const WOOD = '#B9834A', WOOD_D = '#8E6236', TOP = '#F3E4CC', STEEL = '#C9D3D8', INK = '#3B2E2A';
const SIGN_YAW = 0.36;                     // boards turn to face the camera (scene.js YAW)

// ---- picture signs: an emoji painted on a cream board ------------------------------------------
const signCache = new Map();
function signMaterial(emoji, ring) {
  const key = emoji + ring;
  if (signCache.has(key)) return signCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#FFF8EA'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = ring; g.stroke();
  g.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  signCache.set(key, m); return m;
}
export function signBoard(emoji, ring = '#E3A25B', size = 0.5) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 28), signMaterial(emoji, ring));
  disc.rotation.set(-0.35, SIGN_YAW, 0, 'YXZ');
  disc.position.y = 0.02;
  g.add(disc);
  return g;
}

// ---- the oven -----------------------------------------------------------------------------------
export function ovenModel(product) {
  const accent = product === 'cupcake' ? '#FF9EBB' : '#F2A65A';
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.5, 0.9, 1.1, 0.06], '#EFE8DD', { y: 0.45 }),
    part('box', [1.56, 0.06, 1.16], WOOD_D, { y: 0.92, tex: 'wood' }),
    part('box', [1.52, 0.1, 1.12], accent, { y: 0.1 }),
    part('rbox', [1.0, 0.5, 0.05, 0.03], '#3B3F46', { y: 0.5, z: 0.55 }),          // door
    part('box', [0.7, 0.05, 0.05], STEEL, { y: 0.8, z: 0.58 }),                      // handle
    part('cyl', [0.045, 0.045, 0.03, 10], INK, { x: 0.58, y: 0.75, z: 0.56, rx: Math.PI / 2 }),
    part('cyl', [0.045, 0.045, 0.03, 10], INK, { x: 0.58, y: 0.6, z: 0.56, rx: Math.PI / 2 }),
    // hood and flue against the wall
    part('box', [1.3, 0.34, 0.55], STEEL, { y: 2.05, z: -0.28, tex: 'metal' }),
    part('box', [1.0, 0.16, 0.4], '#AEB9BF', { y: 1.82, z: -0.25 }),
    part('cyl', [0.12, 0.12, 0.8, 10], STEEL, { y: 2.6, z: -0.35 }),
    // the flour bin on the back-left of the top (its fill is a separate mesh, below)
    part('cyl', [0.21, 0.19, 0.5, 14], '#FFFFFF', { x: -0.48, y: 1.2, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], '#6FA8DC', { x: -0.48, y: 1.46, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], '#6FA8DC', { x: -0.48, y: 0.96, z: -0.28 }),
    // a baking tray on the front of the top: this is where the baked goods appear
    part('box', [0.96, 0.02, 0.46], '#9AA5AB', { x: 0.1, y: 0.955, z: 0.25, tex: 'metal' }),
  ]));
  // oven window glows while baking
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshBasicMaterial({ color: '#FFB25E', toneMapped: false }));
  glow.position.set(0, 0.52, 0.581); g.add(glow);
  // flour level: a white column inside a glass window on the bin
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 12), new THREE.MeshToonMaterial({ color: '#FFFDF6' }));
  fill.position.set(-0.48, 0.99, -0.28); g.add(fill);
  const win = mesh([part('box', [0.1, 0.4, 0.02], '#BFE4F5', { x: -0.48, y: 1.21, z: -0.075 })], { cast: false });
  g.add(win);
  const sign = signBoard(product === 'cupcake' ? '🧁' : '🍪', accent); sign.position.set(0.52, 1.35, -0.2);
  const post = mesh([part('cyl', [0.02, 0.02, 0.4, 6], WOOD_D, { x: 0.52, y: 1.12, z: -0.22 })]);
  g.add(sign, post);
  return {
    group: g,
    tray: { x: 0.1, y: 0.97, z: 0.25 },
    setFlour(f) { fill.scale.y = Math.max(0.02, f) * 0.44; fill.position.y = 0.99 + fill.scale.y / 2; },
    setBaking(on, t) { glow.material.color.setHSL(0.08, 1, on ? 0.55 + Math.sin(t * 8) * 0.06 : 0.18); },
  };
}

// ---- the display counter ------------------------------------------------------------------------
const glassMat = new THREE.MeshBasicMaterial({ color: '#DDF3FF', transparent: true, opacity: 0.16, depthWrite: false });
export function counterModel(product) {
  const accent = product === 'cupcake' ? '#FF9EBB' : '#F2A65A';
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.8, 0.86, 0.8, 0.05], accent, { y: 0.43 }),
    part('box', [1.7, 0.6, 0.02], '#FFF4E6', { y: 0.46, z: 0.405 }),
    part('box', [1.84, 0.06, 0.84], WOOD, { y: 0.89, tex: 'wood' }),
    part('box', [1.84, 0.1, 0.84], WOOD_D, { y: 0.05 }),
    part('box', [1.7, 0.02, 0.62], TOP, { y: 0.93 }),
    // a low sneeze-guard frame on the guest side; the goods sit open on the shelf behind it
    ...[-0.86, 0.86].map(x => part('box', [0.035, 0.26, 0.035], WOOD_D, { x, y: 1.05, z: 0.36 })),
    part('box', [1.76, 0.03, 0.05], WOOD_D, { y: 1.18, z: 0.36 }),
  ]));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.24), glassMat); glass.position.set(0, 1.05, 0.36); glass.renderOrder = 2;
  g.add(glass);
  const sign = signBoard(product === 'cupcake' ? '🧁' : '🍪', accent, 0.44); sign.position.set(-0.75, 1.62, -0.25);
  const post = mesh([part('cyl', [0.02, 0.02, 0.36, 6], WOOD_D, { x: -0.75, y: 1.44, z: -0.27 })]);
  g.add(sign, post);
  return { group: g, shelf: { x: 0, y: 0.94, z: 0.02 } };
}

// ---- the till ----------------------------------------------------------------------------------
export function tillModel() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.4, 0.86, 0.8, 0.05], '#7FC8B6', { y: 0.43 }),
    part('box', [1.3, 0.6, 0.02], '#FFF4E6', { y: 0.46, z: 0.405 }),
    part('box', [1.44, 0.06, 0.84], WOOD, { y: 0.89, tex: 'wood' }),
    part('box', [1.44, 0.1, 0.84], WOOD_D, { y: 0.05 }),
    // the register: drawer, body, sloped screen facing the cashier and a little display for the guest
    part('rbox', [0.56, 0.12, 0.44, 0.03], '#2F6F6A', { y: 0.98 }),
    part('rbox', [0.5, 0.2, 0.34, 0.04], '#3E8C85', { y: 1.13, z: -0.03 }),
    part('box', [0.36, 0.2, 0.03], '#23312F', { y: 1.3, z: -0.1, rx: -0.5 }),
    part('box', [0.2, 0.09, 0.02], '#9FF0C8', { y: 1.31, z: 0.12, rx: 0.3 }),
    ...[0, 1, 2].flatMap(r => [0, 1, 2].map(c => part('box', [0.06, 0.02, 0.05], '#FFF4E6', { x: -0.08 + c * 0.08, y: 1.24, z: 0.06 + r * 0.035 - 0.07 }))),
    // bell and a tip jar
    part('cyl', [0.07, 0.09, 0.02, 12], '#D9A441', { x: 0.45, y: 0.93 }),
    part('sph', [0.07, 10], '#E8B84F', { x: 0.45, y: 0.97, sy: 0.8 }),
    part('cyl', [0.09, 0.08, 0.2, 12], '#DFF3FA', { x: -0.48, y: 1.02, z: 0.1 }),
    part('cyl', [0.06, 0.06, 0.08, 10], '#FFD84D', { x: -0.48, y: 0.96, z: 0.1 }),
  ]));
  const sign = signBoard('💰', '#3E8C85', 0.44); sign.position.set(0.5, 1.62, -0.25);
  const post = mesh([part('cyl', [0.02, 0.02, 0.36, 6], WOOD_D, { x: 0.5, y: 1.44, z: -0.27 })]);
  g.add(sign, post);
  return { group: g };
}

// ---- the pantry: a real shelf of flour sacks against the back wall ------------------------------
export function pantryModel() {
  const g = new THREE.Group();
  const P = [
    ...[-0.72, 0.72].map(x => part('box', [0.06, 2.0, 0.85], WOOD_D, { x, y: 1.0, tex: 'wood' })),
    part('box', [1.5, 2.0, 0.04], '#D8B48A', { y: 1.0, z: -0.42, tex: 'wood' }),
    ...[0.08, 0.72, 1.36, 1.98].map(y => part('box', [1.44, 0.05, 0.82], WOOD, { y, tex: 'wood' })),
  ];
  // sacks on the lower two shelves: the same sack the owner carries
  const sack = (x, y, z) => {
    P.push(part('rbox', [0.34, 0.36, 0.24, 0.08], '#F3E6CC', { x, y: y + 0.18, z, tex: 'fabric' }));
    P.push(part('cyl', [0.07, 0.11, 0.1, 8], '#F3E6CC', { x, y: y + 0.4, z }));
    P.push(part('box', [0.345, 0.1, 0.245], '#6FA8DC', { x, y: y + 0.2, z }));
  };
  for (const x of [-0.42, 0, 0.42]) { sack(x, 0.1, 0.12); sack(x, 0.74, 0.12); }
  // jars and a basket up top
  const jars = ['#F7C8A0', '#FFE08A', '#C9E7B0', '#F5B0C0'];
  for (let i = 0; i < 4; i++) P.push(part('cyl', [0.1, 0.1, 0.24, 10], jars[i], { x: -0.5 + i * 0.33, y: 1.51, z: 0.05 }));
  P.push(part('cyl', [0.22, 0.18, 0.16, 12], '#C98E4E', { x: 0.2, y: 2.08, z: 0.05 }));
  g.add(mesh(P));
  const sign = signBoard('🌾', '#6FA8DC', 0.5); sign.position.set(0, 2.35, 0.1);
  g.add(sign);
  return { group: g };
}

// ---- a table and its two chairs ------------------------------------------------------------------
export function tableModel() {
  const g = new THREE.Group();
  const chair = x => {
    const s = Math.sign(x);
    return [
      part('rbox', [0.42, 0.06, 0.42, 0.03], '#F08A78', { x, y: 0.46 }),
      part('rbox', [0.06, 0.5, 0.42, 0.03], '#E0705F', { x: x + s * 0.2, y: 0.72 }),
      ...[[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].map(([dx, dz]) => part('cyl', [0.022, 0.022, 0.45, 5], WOOD_D, { x: x + dx, y: 0.225, z: dz })),
    ];
  };
  g.add(mesh([
    part('cyl', [0.52, 0.52, 0.06, 22], WOOD, { y: 0.76, tex: 'wood' }),
    part('cyl', [0.5, 0.5, 0.02, 22], '#F6E9D6', { y: 0.795 }),
    part('cyl', [0.06, 0.08, 0.72, 8], WOOD_D, { y: 0.37 }),
    part('cyl', [0.26, 0.3, 0.05, 14], WOOD_D, { y: 0.025 }),
    part('cyl', [0.05, 0.05, 0.12, 8], '#FFFFFF', { y: 0.86, z: -0.28 }),     // little vase
    part('sph', [0.05, 6], '#FF8A80', { y: 0.95, z: -0.28 }),
    ...chair(-0.78), ...chair(0.78),
  ]));
  // what a finished meal leaves behind
  const dirty = mesh([
    part('cyl', [0.15, 0.12, 0.02, 12], '#FFFFFF', { x: -0.2, y: 0.81 }),
    part('cyl', [0.15, 0.12, 0.02, 12], '#FFFFFF', { x: 0.2, y: 0.81, z: 0.05 }),
    part('sph', [0.03, 5], '#C8843E', { x: -0.16, y: 0.83 }), part('sph', [0.025, 5], '#C8843E', { x: 0.24, y: 0.83, z: 0.08 }),
    part('cyl', [0.05, 0.04, 0.09, 8], '#FFFFFF', { x: 0.05, y: 0.85, z: 0.22 }),
    ...[[-0.3, 0.2], [0.1, -0.15], [0.32, -0.1], [-0.05, 0.3]].map(([x, z]) => part('sph', [0.018, 4], '#D9A06A', { x, y: 0.805, z })),
  ], { cast: false });
  dirty.visible = false; g.add(dirty);
  return { group: g, dirty, tipAt: { x: 0, y: 0.81, z: 0.25 } };
}

// ---- the jukebox -----------------------------------------------------------------------------
export function jukeboxModel() {
  const g = new THREE.Group();
  const W = 0.72, D = 0.5, H = 1.0;
  g.add(mesh([
    part('rbox', [W, H, D, 0.06], WOOD_D, { y: H / 2, tex: 'wood' }),
    part('cyl', [W / 2, W / 2, D, 18], WOOD, { y: H, rx: Math.PI / 2, tex: 'wood' }),
    part('box', [W + 0.06, 0.08, D + 0.06], WOOD_D, { y: 0.04 }),
    part('box', [0.5, 0.3, 0.02], '#2E3A4A', { y: 0.98, z: D / 2 + 0.005 }),
    part('cyl', [0.12, 0.12, 0.012, 16], '#1E1E24', { y: 0.98, z: D / 2 + 0.02, rx: Math.PI / 2 }),
    part('cyl', [0.04, 0.04, 0.014, 10], '#FF8A80', { y: 0.98, z: D / 2 + 0.024, rx: Math.PI / 2 }),
    part('box', [0.5, 0.34, 0.02], STEEL, { y: 0.5, z: D / 2 + 0.005 }),
    ...[0, 1, 2, 3, 4].map(i => part('box', [0.46, 0.022, 0.012], '#8C99A3', { y: 0.37 + i * 0.066, z: D / 2 + 0.018 })),
  ]));
  const lights = new THREE.Mesh(merge([
    part('cyl', [W / 2 + 0.015, W / 2 + 0.015, 0.05, 18], '#fff', { y: H, z: D / 2 - 0.02, rx: Math.PI / 2 }),
    part('cyl', [0.03, 0.03, 0.8, 8], '#fff', { x: -W / 2 + 0.03, y: 0.5, z: D / 2 - 0.01 }),
    part('cyl', [0.03, 0.03, 0.8, 8], '#fff', { x: W / 2 - 0.03, y: 0.5, z: D / 2 - 0.01 }),
  ]), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FF9EC0').multiplyScalar(1.5), toneMapped: false }));
  g.add(lights);
  return { group: g, lights };
}

// ---- see-through preview for a build pad -----------------------------------------------------
const ghostMat = new THREE.MeshBasicMaterial({ color: '#9FDBFF', transparent: true, opacity: 0.32, depthWrite: false });
export function ghostOf(group) {
  const g = group.clone(true), mat = ghostMat.clone();
  g.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

export function modelFor(st) {
  switch (st.type) {
    case 'oven': return ovenModel(st.product);
    case 'counter': return counterModel(st.product);
    case 'till': return tillModel();
    case 'pantry': return pantryModel();
    case 'table': return tableModel();
    case 'jukebox': return jukeboxModel();
    default: return { group: new THREE.Group() };
  }
}
