// src/render/items.js — every cookie, cupcake and flour sack in the café, drawn as instances.
// Systems call add() for each item they want on screen this frame; flush() uploads them. One draw
// call per item kind however many there are, so a busy café costs nothing extra.
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { toonMaterial } from './palette.js';

function cookieGeo() {
  const P = [part('cyl', [0.12, 0.125, 0.045, 14], '#D89A52', { y: 0.022 })];
  for (const [x, z] of [[0.04, 0.03], [-0.05, 0.02], [0.0, -0.06], [-0.02, 0.07], [0.07, -0.03]]) P.push(part('sph', [0.018, 5], '#5A3521', { x, y: 0.046, z }));
  return merge(P);
}
function cupcakeGeo() {
  const P = [part('cyl', [0.1, 0.075, 0.11, 12], '#FFFFFF', { y: 0.055 })];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.push(part('box', [0.018, 0.105, 0.012], '#FF7FA6', { x: Math.sin(a) * 0.088, y: 0.056, z: Math.cos(a) * 0.088, ry: a })); }
  P.push(part('sph', [0.1, 12], '#FFC2D6', { y: 0.14, sy: 0.75 }));
  P.push(part('sph', [0.065, 10], '#FFD6E4', { y: 0.2, sy: 0.8 }));
  P.push(part('sph', [0.028, 8], '#E0304F', { y: 0.25 }));
  return merge(P);
}
function sackGeo() {
  return merge([
    part('rbox', [0.34, 0.36, 0.24, 0.08], '#F3E6CC', { y: 0.18, tex: 'fabric' }),
    part('cyl', [0.07, 0.11, 0.1, 8], '#F3E6CC', { y: 0.4, tex: 'fabric' }),
    part('cyl', [0.075, 0.075, 0.03, 8], '#B98A4E', { y: 0.37 }),
    part('box', [0.345, 0.1, 0.245], '#6FA8DC', { y: 0.2 }),
    part('sph', [0.035, 6], '#FFFFFF', { y: 0.2, z: 0.125, sz: 0.3 }),
  ]);
}
function trayGeo() {
  return merge([
    part('box', [0.5, 0.025, 0.38], '#B9834A', { y: 0.012, tex: 'wood' }),
    part('box', [0.5, 0.04, 0.025], '#9C6B3A', { y: 0.03, z: 0.18 }),
    part('box', [0.5, 0.04, 0.025], '#9C6B3A', { y: 0.03, z: -0.18 }),
  ]);
}
function tipGeo() {
  return merge([0, 1, 2].map(i => part('cyl', [0.06, 0.06, 0.018, 10], '#FFD84D', { x: (i - 1) * 0.02, y: 0.01 + i * 0.02, z: (i % 2) * 0.02 })));
}
function plateGeo() {
  return merge([
    part('cyl', [0.16, 0.13, 0.025, 14], '#FFFFFF', { y: 0.012 }),
    part('sph', [0.025, 5], '#C8843E', { x: 0.04, y: 0.03, z: 0.02 }), part('sph', [0.02, 5], '#C8843E', { x: -0.05, y: 0.03, z: -0.03 }),
  ]);
}

const KINDS = { cookie: cookieGeo, cupcake: cupcakeGeo, flour: sackGeo, tray: trayGeo, tip: tipGeo, plate: plateGeo };
const MAX = 160;

export function createItems(scene) {
  const mat = toonMaterial();
  const pools = {};
  for (const [k, fn] of Object.entries(KINDS)) {
    const im = new THREE.InstancedMesh(fn(), mat, MAX);
    im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    scene.add(im); pools[k] = { im, n: 0 };
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  return {
    begin() { for (const k in pools) pools[k].n = 0; },
    add(kind, x, y, z, ry = 0, scale = 1) {
      const pool = pools[kind]; if (!pool || pool.n >= MAX) return;
      e.set(0, ry, 0); q.setFromEuler(e); p.set(x, y, z); s.setScalar(scale);
      m.compose(p, q, s); pool.im.setMatrixAt(pool.n++, m);
    },
    flush() {
      for (const k in pools) { const { im, n } = pools[k]; im.count = n; im.instanceMatrix.needsUpdate = true; }
    },
  };
}

// Where item i of n sits in a carried stack, relative to the chest (local +z is forward).
// Pastries ride on a tray in two columns; sacks stack straight up in the arms.
export function stackSlot(kind, i) {
  if (kind === 'flour') return { x: 0, y: i * 0.33, z: 0 };
  const layer = (i / 2) | 0, col = i % 2;
  return { x: col ? 0.11 : -0.11, y: 0.03 + layer * (kind === 'cupcake' ? 0.24 : 0.05), z: 0 };
}

// Where item i sits on a display (a grid of 4 across, 2 deep), relative to the shelf centre.
export function shelfSlot(i, across = 4, pitch = 0.34, depth = 0.26) {
  const c = i % across, r = (i / across) | 0;
  return { x: (c - (across - 1) / 2) * pitch, z: (r - 0.5) * depth };
}
