// src/render/props.js — the station models. Every one faces +z (toward the room and the camera),
// shows what it is at a glance (a picture sign on top), and shows its state without words: the flour
// left in an oven's bin, the goods on its tray, the plates on a used table.
import * as THREE from 'three';
import { part, merge, mesh } from './geo.js';
import { PRODUCTS, SUPPLIES } from '../game/layout.js';
import * as L from '../game/layout.js';
import { beachModelFor } from './propsBeach.js';

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

// ---- machines: an oven, an espresso machine, a treat press. All share one cabinet and one idea:
// a hopper on the back-left whose fill you can see (banded in its supply's colour, the same band as
// the sacks on the pantry shelf), and a tray on the front where the finished goods appear.
function machineBase(accent, band) {
  return [
    part('rbox', [1.5, 0.9, 1.1, 0.06], '#EFE8DD', { y: 0.45 }),
    part('box', [1.56, 0.06, 1.16], WOOD_D, { y: 0.92, tex: 'wood' }),
    part('box', [1.52, 0.1, 1.12], accent, { y: 0.1 }),
    part('box', [1.3, 0.5, 0.02], accent, { y: 0.45, z: 0.555 }),
    part('cyl', [0.21, 0.19, 0.5, 14], '#FFFFFF', { x: -0.48, y: 1.2, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], band, { x: -0.48, y: 1.46, z: -0.28 }),
    part('cyl', [0.23, 0.23, 0.05, 14], band, { x: -0.48, y: 0.96, z: -0.28 }),
    part('box', [0.96, 0.02, 0.46], '#9AA5AB', { x: 0.1, y: 0.955, z: 0.25, tex: 'metal' }),
  ];
}
export function machineModel(def) {
  const pr = PRODUCTS[def.product], band = SUPPLIES[pr.supply].band, accent = pr.accent;
  def = { ...def, model: pr.model };
  const g = new THREE.Group();
  const P = machineBase(accent, band);
  let glowAt = null;
  if (def.model === 'oven') {
    P.push(
      part('rbox', [1.0, 0.5, 0.05, 0.03], '#3B3F46', { y: 0.5, z: 0.57 }),
      part('box', [0.7, 0.05, 0.05], STEEL, { y: 0.8, z: 0.6 }),
      part('cyl', [0.045, 0.045, 0.03, 10], INK, { x: 0.58, y: 0.75, z: 0.58, rx: Math.PI / 2 }),
      part('box', [1.3, 0.34, 0.55], STEEL, { y: 2.05, z: -0.28, tex: 'metal' }),
      part('box', [1.0, 0.16, 0.4], '#AEB9BF', { y: 1.82, z: -0.25 }),
      part('cyl', [0.12, 0.12, 0.8, 10], STEEL, { y: 2.6, z: -0.35 }),
    );
    glowAt = { w: 0.7, h: 0.26, y: 0.52, z: 0.601, x: 0 };
  } else if (def.model === 'coffee') {
    // a chrome espresso machine with two group heads, a steam wand and cups warming on top
    P.push(
      part('rbox', [0.9, 0.5, 0.5, 0.05], '#D2DBE0', { x: 0.25, y: 1.2, z: -0.18, tex: 'metal' }),
      part('box', [0.92, 0.06, 0.52], '#2F3A40', { x: 0.25, y: 1.47, z: -0.18 }),
      part('cyl', [0.06, 0.05, 0.1, 10], '#2F3A40', { x: 0.05, y: 1.0, z: 0.1 }),
      part('cyl', [0.06, 0.05, 0.1, 10], '#2F3A40', { x: 0.45, y: 1.0, z: 0.1 }),
      part('box', [0.2, 0.03, 0.04], INK, { x: 0.05, y: 1.0, z: 0.2 }),
      part('box', [0.2, 0.03, 0.04], INK, { x: 0.45, y: 1.0, z: 0.2 }),
      part('cyl', [0.012, 0.012, 0.3, 5], STEEL, { x: 0.68, y: 1.05, z: 0.05, rz: 0.4 }),
      part('cyl', [0.06, 0.06, 0.03, 12], '#FFFFFF', { x: 0.25, y: 1.53, z: -0.2 }),
      part('cyl', [0.06, 0.06, 0.03, 12], '#FFFFFF', { x: 0.25, y: 1.56, z: -0.2 }),
    );
    glowAt = { w: 0.14, h: 0.07, y: 1.32, z: 0.075, x: 0.25 };
  } else {
    // the treat press: a little baking press with a bone-shaped mould and a crank
    P.push(
      part('rbox', [0.8, 0.42, 0.5, 0.06], '#7FB8E8', { x: 0.25, y: 1.16, z: -0.18 }),
      part('rbox', [0.84, 0.08, 0.54, 0.03], '#5E97C9', { x: 0.25, y: 1.4, z: -0.18 }),
      part('cyl', [0.03, 0.03, 0.34, 6], STEEL, { x: 0.72, y: 1.25, z: -0.18, rz: Math.PI / 2 }),
      part('sph', [0.05, 8], '#F29A38', { x: 0.9, y: 1.25, z: -0.18 }),
      part('box', [0.3, 0.05, 0.1], '#FFF4E6', { x: 0.25, y: 1.2, z: 0.08 }),
      part('sph', [0.05, 6], '#FFF4E6', { x: 0.1, y: 1.2, z: 0.08 }),
      part('sph', [0.05, 6], '#FFF4E6', { x: 0.4, y: 1.2, z: 0.08 }),
    );
    glowAt = { w: 0.34, h: 0.1, y: 1.28, z: 0.075, x: 0.25 };
  }
  P.push(part('box', [0.1, 0.4, 0.02], '#BFE4F5', { x: -0.48, y: 1.21, z: -0.075 }));   // the hopper's window
  g.add(mesh(P));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(glowAt.w, glowAt.h), new THREE.MeshBasicMaterial({ color: '#FFB25E', toneMapped: false }));
  glow.position.set(glowAt.x, glowAt.y, glowAt.z); g.add(glow);
  const fillCol = pr.supply === 'beans' ? '#6B4226' : pr.supply === 'kibble' ? '#C98A4B' : '#FFFDF6';
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1, 12), new THREE.MeshToonMaterial({ color: fillCol }));
  fill.position.set(-0.48, 0.99, -0.28); g.add(fill);
  const sign = signBoard(pr.emoji, accent); sign.position.set(-0.05, 2.35, -0.3);
  g.add(sign, mesh([part('cyl', [0.02, 0.02, 0.8, 6], WOOD_D, { x: -0.05, y: 1.95, z: -0.42 })]));
  return {
    group: g,
    tray: { x: 0.1, y: 0.97, z: 0.25 },
    setLevel(f) { fill.scale.y = Math.max(0.02, f) * 0.44; fill.position.y = 0.99 + fill.scale.y / 2; },
    setBusy(on, t) { glow.material.color.setHSL(def.model === 'coffee' ? 0.4 : 0.08, 1, on ? 0.55 + Math.sin(t * 8) * 0.06 : 0.16); },
  };
}

// ---- the display counter ------------------------------------------------------------------------
const glassMat = new THREE.MeshBasicMaterial({ color: '#DDF3FF', transparent: true, opacity: 0.16, depthWrite: false });
export function counterModel(product) {
  const accent = PRODUCTS[product].accent;
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
  const sign = signBoard(PRODUCTS[product].emoji, accent, 0.44); sign.position.set(-0.75, 1.62, -0.25);
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

// ---- the pantry: a real larder shelf. One row per supply, each row appears once a machine needs
// it. The sacks are the same sacks people carry, banded in the colour of the hopper they fill.
export function sackParts(kind, x, y, z) {
  const band = SUPPLIES[kind].band;
  if (kind === 'kibble') return [
    part('rbox', [0.32, 0.4, 0.2, 0.05], '#F29A38', { x, y: y + 0.2, z }),
    part('box', [0.33, 0.06, 0.21], '#C86F1C', { x, y: y + 0.38, z }),
    part('box', [0.12, 0.04, 0.012], '#FFF4E6', { x, y: y + 0.2, z: z + 0.105 }),
    part('sph', [0.03, 5], '#FFF4E6', { x: x - 0.07, y: y + 0.2, z: z + 0.105 }),
    part('sph', [0.03, 5], '#FFF4E6', { x: x + 0.07, y: y + 0.2, z: z + 0.105 }),
  ];
  const cloth = kind === 'beans' ? '#C9A277' : '#F3E6CC';
  return [
    part('rbox', [0.34, 0.36, 0.24, 0.08], cloth, { x, y: y + 0.18, z, tex: 'fabric' }),
    part('cyl', [0.07, 0.11, 0.1, 8], cloth, { x, y: y + 0.4, z }),
    part('box', [0.345, 0.1, 0.245], band, { x, y: y + 0.2, z }),
  ];
}
export function pantryModel() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [0.06, 2.0, 0.85], WOOD_D, { x: -0.72, y: 1.0, tex: 'wood' }),
    part('box', [0.06, 2.0, 0.85], WOOD_D, { x: 0.72, y: 1.0, tex: 'wood' }),
    part('box', [1.5, 2.0, 0.04], '#D8B48A', { y: 1.0, z: -0.42, tex: 'wood' }),
    ...[0.08, 0.7, 1.32, 1.96].map(y => part('box', [1.44, 0.05, 0.82], WOOD, { y, tex: 'wood' })),
    part('cyl', [0.22, 0.18, 0.16, 12], '#C98E4E', { x: 0.3, y: 2.06, z: 0.05 }),
  ]));
  const rows = {};
  for (const [kind, y] of [['flour', 0.1], ['beans', 0.72], ['kibble', 1.34]]) {
    const row = mesh([-0.42, 0, 0.42].flatMap(x => sackParts(kind, x, y, 0.12)));
    const sg = signBoard(SUPPLIES[kind].emoji, SUPPLIES[kind].band, 0.26); sg.position.set(0.84, y + 0.3, 0.3);
    const r = new THREE.Group(); r.add(row, sg); r.visible = kind === 'flour'; g.add(r); rows[kind] = r;
  }
  const sign = signBoard('🧺', '#B9834A', 0.5); sign.position.set(-0.3, 2.35, 0.1);
  g.add(sign);
  return { group: g, rows };
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
  if (L.LOC.theme === 'beach') return beachModelFor(st);
  switch (st.type) {
    case 'machine': return machineModel(st);
    case 'counter': return counterModel(st.product);
    case 'till': return tillModel();
    case 'pantry': return pantryModel();
    case 'table': return tableModel();
    case 'jukebox': return jukeboxModel();
    default: return { group: new THREE.Group() };
  }
}
