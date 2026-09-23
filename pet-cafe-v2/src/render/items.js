// src/render/items.js — every cookie, cupcake and flour sack in the café, drawn as instances.
// Systems call add() for each item they want on screen this frame; flush() uploads them. One draw
// call per item kind however many there are, so a busy café costs nothing extra.
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { toonMaterial } from './palette.js';
import { sackParts } from './props.js';
import { crateParts } from './propsBeach.js';
import { boxParts } from './propsMall.js';
import { SUPPLIES } from '../game/layout.js';

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
function coffeeGeo() {
  return merge([
    part('cyl', [0.11, 0.11, 0.015, 14], '#FFFFFF', { y: 0.008 }),
    part('cyl', [0.07, 0.055, 0.1, 12], '#FFFFFF', { y: 0.06 }),
    part('cyl', [0.062, 0.062, 0.01, 12], '#7A4A2A', { y: 0.106 }),
    part('cyl', [0.03, 0.03, 0.012, 8], '#F3E1C8', { y: 0.11 }),
    part('cyl', [0.022, 0.022, 0.05, 6], '#FFFFFF', { x: 0.08, y: 0.065, rx: Math.PI / 2, sx: 1, sz: 0.4 }),
  ]);
}
function treatGeo() {
  return merge([
    part('box', [0.14, 0.04, 0.05], '#E8C08A', { y: 0.025 }),
    part('sph', [0.035, 7], '#E8C08A', { x: -0.075, y: 0.025, z: 0.022 }), part('sph', [0.035, 7], '#E8C08A', { x: -0.075, y: 0.025, z: -0.022 }),
    part('sph', [0.035, 7], '#E8C08A', { x: 0.075, y: 0.025, z: 0.022 }), part('sph', [0.035, 7], '#E8C08A', { x: 0.075, y: 0.025, z: -0.022 }),
  ]);
}
const sackGeo = kind => () => merge(sackParts(kind, 0, 0, 0));
const crateGeo = kind => () => merge(crateParts(kind, 0, 0, 0));
function lemonadeGeo() {
  return merge([
    part('cyl', [0.065, 0.055, 0.16, 12], '#EAF7FF', { y: 0.08 }),
    part('cyl', [0.058, 0.05, 0.12, 12], '#F7DC4A', { y: 0.07 }),
    part('cyl', [0.03, 0.03, 0.01, 8], '#9BD66A', { x: 0.05, y: 0.16, rz: 0.5 }),
    part('cyl', [0.008, 0.008, 0.16, 5], '#FF7FA8', { x: -0.02, y: 0.18, rz: 0.25 }),
  ]);
}
function smoothieGeo() {
  return merge([
    part('cyl', [0.07, 0.05, 0.2, 12], '#FFFFFF', { y: 0.1 }),
    part('cyl', [0.065, 0.046, 0.17, 12], '#FF7FA8', { y: 0.09 }),
    part('sph', [0.07, 10], '#FFB6D0', { y: 0.2, sy: 0.5 }),
    part('cyl', [0.008, 0.008, 0.16, 5], '#3FB6A8', { x: 0.02, y: 0.26, rz: -0.2 }),
  ]);
}
function icecreamGeo() {
  return merge([
    part('cone', [0.06, 0.16, 10], '#E3B06A', { y: 0.08, rx: Math.PI }),
    part('sph', [0.07, 10], '#FFD6E6', { y: 0.19 }),
    part('sph', [0.06, 10], '#BFE9F7', { y: 0.27 }),
    part('sph', [0.02, 6], '#E0304F', { y: 0.33 }),
  ]);
}
function fishGeo() {
  return merge([
    part('cyl', [0.12, 0.1, 0.02, 12], '#FFFFFF', { y: 0.01 }),
    part('sph', [0.07, 8], '#9DBFE8', { y: 0.04, sx: 1.6, sy: 0.45 }),
    part('cone', [0.05, 0.07, 6], '#7FA7D9', { x: -0.14, y: 0.04, rz: Math.PI / 2 }),
    part('box', [0.1, 0.004, 0.01], '#5A6E8A', { y: 0.068, z: 0.01 }),
  ]);
}
// ---- the Mall Café's menu ----
function donutGeo() {
  const P = [part('torus', [0.075, 0.042, 8, 18], '#D69A5A', { y: 0.042 }),
    part('torus', [0.075, 0.036, 8, 18], '#FF8FB8', { y: 0.058, sy: 0.7 })];
  const sprinkle = ['#FFFFFF', '#FFD84D', '#6FD3F0', '#8CC47A'];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = 0.066 + (i % 2) * 0.018; P.push(part('box', [0.022, 0.008, 0.007], sprinkle[i % 4], { x: Math.cos(a) * r, y: 0.083, z: Math.sin(a) * r, ry: a * 1.7 })); }
  return merge(P);
}
function bubbleteaGeo() {
  const P = [
    part('cyl', [0.07, 0.055, 0.2, 14], '#EAF7FF', { y: 0.1 }),
    part('cyl', [0.064, 0.05, 0.16, 14], '#C8A07A', { y: 0.09 }),
    part('sph', [0.072, 12], '#EAF7FF', { y: 0.2, sy: 0.45 }),
    part('cyl', [0.013, 0.013, 0.2, 6], '#FF8FB8', { x: 0.02, y: 0.28, rz: -0.18 }),
  ];
  for (const [x, z] of [[-0.025, 0.02], [0.02, 0.03], [0.03, -0.02], [-0.02, -0.03], [0, 0]]) P.push(part('sph', [0.017, 5], '#2E2320', { x, y: 0.028, z }));
  return merge(P);
}
function waffleGeo() {
  const P = [part('box', [0.2, 0.03, 0.2], '#E8A94A', { y: 0.016 })];
  for (let i = -1; i <= 1; i++) { P.push(part('box', [0.2, 0.012, 0.018], '#C98530', { y: 0.034, z: i * 0.06 })); P.push(part('box', [0.018, 0.012, 0.2], '#C98530', { y: 0.034, x: i * 0.06 })); }
  P.push(part('box', [0.05, 0.02, 0.04], '#FFF3B0', { y: 0.046 }), part('sph', [0.03, 6], '#B8621E', { x: 0.05, y: 0.036, z: 0.04, sy: 0.3 }));
  return merge(P);
}
function jerkyGeo() {
  return merge([
    part('cyl', [0.018, 0.018, 0.2, 6], '#FFF3E0', { y: 0.03, rz: Math.PI / 2 }),
    part('sph', [0.03, 6], '#FFF3E0', { x: -0.1, y: 0.03, z: 0.015 }), part('sph', [0.03, 6], '#FFF3E0', { x: -0.1, y: 0.03, z: -0.015 }),
    part('sph', [0.07, 8], '#B5503A', { x: 0.03, y: 0.045, sx: 1.2, sy: 0.7 }),
    part('sph', [0.04, 6], '#D06A4E', { x: 0.05, y: 0.07, sx: 1.1, sy: 0.5 }),
  ]);
}
const boxGeo = kind => () => merge(boxParts(kind, 0, 0, 0));
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

const KINDS = { cookie: cookieGeo, cupcake: cupcakeGeo, coffee: coffeeGeo, treat: treatGeo, lemonade: lemonadeGeo, smoothie: smoothieGeo, icecream: icecreamGeo, fish: fishGeo,
  flour: sackGeo('flour'), beans: sackGeo('beans'), kibble: sackGeo('kibble'), lemons: crateGeo('lemons'), fruit: crateGeo('fruit'), cream: crateGeo('cream'), fishbox: crateGeo('fishbox'),
  donut: donutGeo, bubbletea: bubbleteaGeo, waffle: waffleGeo, jerky: jerkyGeo,
  dough: boxGeo('dough'), tea: boxGeo('tea'), batter: boxGeo('batter'), meat: boxGeo('meat'),
  tray: trayGeo, tip: tipGeo, plate: plateGeo };
const MAX = 160;

export function createItems(scene) {
  const mat = toonMaterial();
  const pools = {};
  for (const [k, fn] of Object.entries(KINDS)) {
    const im = new THREE.InstancedMesh(fn(), mat, MAX);
    im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
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
  if (SUPPLIES[kind]) return { x: 0, y: i * 0.38, z: 0 };
  const layer = (i / 2) | 0, col = i % 2;
  const h = { cupcake: 0.24, coffee: 0.13, lemonade: 0.18, smoothie: 0.27, icecream: 0.34, fish: 0.06, donut: 0.09, bubbletea: 0.3, waffle: 0.05, jerky: 0.09 }[kind] || 0.05;
  return { x: col ? 0.11 : -0.11, y: 0.03 + layer * h, z: 0 };
}

// Where item i sits on a display (a grid of 4 across, 2 deep), relative to the shelf centre.
export function shelfSlot(i, across = 4, pitch = 0.34, depth = 0.26) {
  const c = i % across, r = (i / across) | 0;
  return { x: (c - (across - 1) / 2) * pitch, z: (r - 0.5) * depth };
}
