// src/render/decor.js — one mesh factory per décor catalogue item.
//
// Same construction rules as render/props.js: colored primitives merged into a single geometry so
// each prop costs one draw call, toon material, no textures, no addons beyond the two geo.js
// already uses. Nothing here reads game state — a factory is a pure id -> Object3D function and the
// systems layer owns placement, so the render layer stays replay-safe and screenshot-stable.
//
// LOCAL SPACE: floor props are authored with y = 0 at the floor and their visual front facing +z.
// Wall props (art, hanging planters, the paw sign) are authored centred on their own mount point,
// also facing +z, so a slot rotation of PI/2 turns them to face east off the west wall.
import * as THREE from 'three';
import { part, mesh, merge } from './geo.js';
import { C, emissiveMaterial } from './palette.js';
import { DECOR_BY_ID } from '../../data/decor.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// wall art — a framed picture. `motif` draws the subject so the four art rows are distinguishable
// from across the room without any text on them.
function framedArt({ w = 0.92, h = 0.74, frame = C.wood, canvas = C.cream, motif = C.cat }) {
  const P = [
    part('rbox', [w, h, 0.07, 0.02], frame),
    part('box', [w - 0.14, h - 0.14, 0.04], canvas, { z: 0.03 }),
  ];
  // a simple sitting-pet silhouette: head, body, two ears
  P.push(part('sph', [h * 0.15, 12], motif, { y: h * 0.09, z: 0.055 }));
  P.push(part('sph', [h * 0.2, 12], motif, { y: -h * 0.16, z: 0.055, sy: 0.85 }));
  P.push(part('cone', [h * 0.07, h * 0.13, 8], motif, { x: -h * 0.11, y: h * 0.22, z: 0.055 }));
  P.push(part('cone', [h * 0.07, h * 0.13, 8], motif, { x: h * 0.11, y: h * 0.22, z: 0.055 }));
  return mesh(P, { receive: false });
}

// a wider landscape panel for the top-tier mural
function muralPanel() {
  const w = 2.2, h = 1.1;
  const P = [
    part('rbox', [w, h, 0.08, 0.02], C.woodDark),
    part('box', [w - 0.16, h - 0.16, 0.04], '#FFF1D8', { z: 0.035 }),
    part('box', [w - 0.16, 0.26, 0.03], C.plant, { y: -h / 2 + 0.21, z: 0.05 }),
  ];
  for (let i = 0; i < 5; i++) {
    P.push(part('cone', [0.16, 0.34, 8], i & 1 ? C.plantDark : C.plant, { x: -0.8 + i * 0.4, y: -0.02, z: 0.05 }));
  }
  P.push(part('sph', [0.13, 12], C.coin, { x: 0.72, y: 0.28, z: 0.05 }));
  return mesh(P, { receive: false });
}

// hanging planter on a wall bracket: origin at the bracket mount, foliage spills below.
function hangingPlanter(pot) {
  const P = [
    part('box', [0.07, 0.07, 0.5], C.woodDark, { z: 0.25 }),               // bracket arm
    part('box', [0.14, 0.3, 0.07], C.woodDark, { y: -0.1 }),               // wall plate
    part('cyl', [0.03, 0.03, 0.3, 6], C.metal, { y: -0.15, z: 0.46 }),     // cord
    part('cyl', [0.24, 0.17, 0.26, 12], pot, { y: -0.42, z: 0.46 }),       // pot
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    P.push(part('sph', [0.15, 10], i & 1 ? C.plant : C.plantDark, {
      x: Math.cos(a) * 0.2, y: -0.3 - (i % 3) * 0.09, z: 0.46 + Math.sin(a) * 0.2, sy: 1.5,
    }));
  }
  return mesh(P, { receive: false });
}

// flat floor rug — deliberately thin and shadow-receiving only, so it reads as fabric on tile.
function rug(a, b, w = 2.6, d = 1.8) {
  return mesh([
    part('rbox', [w, 0.04, d, 0.08], a),
    part('rbox', [w - 0.5, 0.05, d - 0.36, 0.08], b, { y: 0.008 }),
    part('rbox', [w - 1.5, 0.06, d - 1.02, 0.08], a, { y: 0.014 }),
  ], { cast: false });
}

// standing lantern: post + a glowing head on its own emissive material (two draw calls, and the
// only place in this module that needs a second material).
function lantern(glow) {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.16, 0.2, 0.1, 10], C.woodDark, { y: 0.05 }),
    part('cyl', [0.05, 0.05, 1.5, 8], C.metal, { y: 0.8 }),
    part('box', [0.28, 0.06, 0.28], C.woodDark, { y: 1.53 }),
    part('cone', [0.24, 0.2, 8], C.woodDark, { y: 1.86 }),
    part('sph', [0.05, 8], C.woodDark, { y: 2.0 }),
  ]));
  const head = new THREE.Mesh(
    part('rbox', [0.26, 0.32, 0.26, 0.05], '#ffffff', { y: 1.7 }),
    emissiveMaterial(glow),
  );
  g.add(head);
  return g;
}

function catTree() {
  const P = [
    part('rbox', [1.0, 0.12, 0.9, 0.05], C.woodDark, { y: 0.06 }),
    part('cyl', [0.09, 0.09, 1.5, 10], C.wood, { y: 0.82 }),
    part('rbox', [0.7, 0.1, 0.6, 0.05], C.pink, { y: 0.62, x: 0.22 }),
    part('rbox', [0.62, 0.1, 0.56, 0.05], C.pink, { y: 1.12, x: -0.2 }),
    part('cyl', [0.34, 0.34, 0.34, 12], C.cream, { y: 1.72 }),                 // top basket
    part('cyl', [0.28, 0.28, 0.3, 12], C.pink, { y: 1.78 }),
    part('sph', [0.09, 8], C.coral, { y: 0.34, x: 0.4, z: 0.3 }),              // dangling toy
  ];
  return mesh(P);
}

function birdFeeder() {
  const P = [
    part('cyl', [0.2, 0.24, 0.12, 10], C.plantDark, { y: 0.06 }),
    part('cyl', [0.06, 0.06, 1.7, 8], C.woodDark, { y: 0.9 }),
    part('rbox', [0.62, 0.07, 0.62, 0.03], C.wood, { y: 1.66 }),
    part('box', [0.5, 0.32, 0.05], '#FFF1D8', { y: 1.85, z: 0.28 }),
    part('box', [0.5, 0.32, 0.05], '#FFF1D8', { y: 1.85, z: -0.28 }),
    part('cone', [0.52, 0.34, 4], C.coral, { y: 2.16, ry: Math.PI / 4 }),
    part('sph', [0.07, 8], C.wood, { y: 1.73, x: 0.1 }),
    part('sph', [0.07, 8], C.wood, { y: 1.73, x: -0.12, z: 0.1 }),
  ];
  return mesh(P);
}

// a leaning bicycle: wheels are thin cylinders rotated to face along x, which reads correctly at
// this camera pitch and stays inside the primitive set geo.js exposes.
function bicycle() {
  const wheel = x => [
    part('cyl', [0.34, 0.34, 0.07, 18], C.black, { x, y: 0.36, rz: Math.PI / 2 }),
    part('cyl', [0.24, 0.24, 0.09, 14], '#4A4548', { x, y: 0.36, rz: Math.PI / 2 }),
    part('cyl', [0.06, 0.06, 0.11, 8], C.metal, { x, y: 0.36, rz: Math.PI / 2 }),
  ];
  const P = [
    ...wheel(-0.56), ...wheel(0.56),
    part('box', [1.1, 0.06, 0.05], C.coral, { y: 0.72, rz: 0.08 }),
    part('box', [0.06, 0.5, 0.05], C.coral, { x: -0.28, y: 0.56, rz: 0.35 }),
    part('box', [0.06, 0.62, 0.05], C.coral, { x: 0.4, y: 0.6, rz: -0.28 }),
    part('box', [0.26, 0.09, 0.16], C.woodDark, { x: -0.44, y: 0.88 }),          // saddle
    part('box', [0.06, 0.06, 0.44], C.black, { x: 0.5, y: 0.94 }),               // handlebar
    part('rbox', [0.34, 0.26, 0.3, 0.04], C.wood, { x: 0.6, y: 0.72 }),          // front basket
    part('sph', [0.12, 10], C.plant, { x: 0.6, y: 0.88 }),
  ];
  const m = mesh(P);
  m.rotation.z = 0.06;                                                            // leaning on the wall
  return m;
}

// the chalk paw sign: a small board with a paw print, nothing written on it.
function pawSign() {
  const P = [
    part('rbox', [0.86, 0.66, 0.07, 0.03], C.woodDark),
    part('box', [0.72, 0.52, 0.04], '#2E3833', { z: 0.03 }),
    part('sph', [0.12, 12], C.cream, { y: -0.06, z: 0.055, sy: 0.8, sz: 0.4 }),
  ];
  for (let i = 0; i < 4; i++) {
    P.push(part('sph', [0.055, 10], C.cream, { x: -0.15 + i * 0.1, y: 0.12 + (i === 1 || i === 2 ? 0.04 : 0), z: 0.055, sz: 0.4 }));
  }
  return mesh(P, { receive: false });
}

// A-frame chalk menu board. ICONS ONLY: a cookie disc, a cup and a coin — never words, because it
// stands on the play field where the no-English rule applies.
function menuBoard() {
  const panel = (z, tilt) => [
    part('rbox', [0.9, 1.1, 0.06, 0.03], C.woodDark, { y: 0.72, z, rx: tilt }),
    part('box', [0.76, 0.94, 0.03], '#2E3833', { y: 0.72, z: z + (tilt > 0 ? -0.05 : 0.05), rx: tilt }),
  ];
  const P = [
    ...panel(0.12, -0.13), ...panel(-0.12, 0.13),
    part('box', [0.86, 0.05, 0.3], C.wood, { y: 1.28 }),
    part('cyl', [0.18, 0.18, 0.03, 14], C.wood, { y: 0.95, z: 0.2, rx: -0.13 }),        // cookie
    part('cyl', [0.13, 0.11, 0.2, 12], C.cream, { y: 0.66, z: 0.2, rx: -0.13 }),        // cup
    part('cyl', [0.12, 0.12, 0.03, 14], C.coin, { y: 0.38, z: 0.2, rx: -0.13 }),        // coin
  ];
  return mesh(P);
}

// ---- terrace factories (authored now, unreachable until Batch 1 builds the terrace) -----------
function umbrella(canopy) {
  return mesh([
    part('cyl', [0.26, 0.3, 0.12, 12], C.metal, { y: 0.06 }),
    part('cyl', [0.05, 0.05, 2.3, 8], C.woodDark, { y: 1.2 }),
    part('cone', [1.5, 0.6, 10], canopy, { y: 2.5 }),
    part('sph', [0.08, 8], C.woodDark, { y: 2.86 }),
  ]);
}
function stringLights() {
  const g = new THREE.Group();
  const cable = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, x = -3 + t * 6;
    cable.push(part('box', [0.52, 0.03, 0.03], C.woodDark, { x, y: -Math.sin(t * Math.PI) * 0.4 }));
  }
  g.add(mesh(cable, { cast: false, receive: false }));
  const bulbs = [];
  const hues = ['#FFD84D', '#FF8A80', '#8B7CF6', '#7BC47F', '#6EC6FF'];
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10, x = -3 + t * 6;
    bulbs.push(part('sph', [0.09, 8], hues[i % hues.length], { x, y: -Math.sin(t * Math.PI) * 0.4 - 0.12 }));
  }
  g.add(new THREE.Mesh(merge(bulbs), emissiveMaterial('#FFF0C0')));
  return g;
}

// ---------------------------------------------------------------------------------------------
export const DECOR_MESH = {
  d_paw_sign: pawSign,
  d_rug_door: () => rug('#E4694F', '#F5C784', 2.0, 1.3),
  d_art_cat: () => framedArt({ motif: C.cat }),
  d_plant_hang_a: () => hangingPlanter(C.coral),
  d_lantern_a: () => lantern('#FFD84D'),
  d_art_dog: () => framedArt({ frame: C.woodDark, canvas: '#EAF4FF', motif: '#C38D9E' }),
  d_rug_lounge: () => rug(C.accent, '#D5CDF7'),
  d_plant_hang_b: () => hangingPlanter(C.pink),
  d_lantern_b: () => lantern('#FF8A80'),
  d_art_bunny: () => framedArt({ canvas: C.cream, motif: '#E8B4B8' }),
  d_feeder_a: birdFeeder,
  d_rug_hearth: () => rug(C.plant, '#DDF0CE', 2.4, 1.7),
  d_plant_hang_c: () => hangingPlanter('#6EC6FF'),
  d_lantern_c: () => lantern('#B48CF2'),
  d_menu_board: menuBoard,
  d_cat_tree_a: catTree,
  d_feeder_b: birdFeeder,
  d_art_mural: muralPanel,
  d_bicycle: bicycle,
  d_cat_tree_b: catTree,
  d_umbrella_a: () => umbrella(C.coral),
  d_umbrella_b: () => umbrella('#6EC6FF'),
  d_umbrella_c: () => umbrella(C.plant),
  d_terrace_lights: stringLights,

  // Paw Rating sets (plan §3.4), one per star. Colours mirror each row's authored icon in
  // data/decor.js so the shop chip and the object in the room read as the same piece, and the
  // palette warms toward gold as the rating climbs.
  d_star1_rug: () => rug('#C98A00', '#F5E0B0', 2.2, 1.5),
  d_star1_art: () => framedArt({ frame: '#C98A00', canvas: '#FFF1D8', motif: '#E4694F' }),
  d_star1_lantern: () => lantern('#FFE08A'),

  d_star2_plant_w: () => hangingPlanter('#7BC47F'),
  d_star2_plant_e: () => hangingPlanter('#C98A00'),
  d_star2_rug: () => rug('#5EA463', '#E4F2D6', 2.4, 1.6),

  d_star3_art_a: () => framedArt({ frame: '#8E6236', canvas: '#FFF4E6', motif: '#F5A25D' }),
  d_star3_art_b: () => framedArt({ frame: '#8E6236', canvas: '#EAF4FF', motif: '#8B7CF6' }),
  d_star3_art_c: () => framedArt({ frame: '#8E6236', canvas: '#FFF1D8', motif: '#6EC6FF' }),

  d_star4_lantern_a: () => lantern('#FFB74D'),
  d_star4_lantern_b: () => lantern('#FF8A80'),
  d_star4_cat_tree: catTree,

  d_star5_sign: pawSign,
  d_star5_mural: muralPanel,
  d_star5_lights: stringLights,
};

export function hasDecorMesh(id) {
  return Object.prototype.hasOwnProperty.call(DECOR_MESH, id);
}

// Builds the mesh for one catalogue id and parks it on its authored slot. Returns null for an
// unknown id so a tampered save can never ask the renderer to invent an object.
export function decorMesh(id) {
  const item = DECOR_BY_ID.get(id);
  if (!item || !hasDecorMesh(id)) return null;
  const obj = DECOR_MESH[id]();
  obj.position.set(item.slot.x, item.slot.y || 0, item.slot.z);
  obj.rotation.y = item.slot.rot || 0;
  obj.name = 'decor:' + id;
  return obj;
}
