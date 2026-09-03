// src/render/props.js
import * as THREE from 'three';
import { part, mesh, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial, gradientMap } from './palette.js';
import { PRODUCTS } from '../sim/economy.js';
import { Spring } from '../core/tween.js';

export function buildStatic(area) {
  const W = area.size.w, D = area.size.d, P = [];
  P.push(part('box', [90, 0.2, 90], '#CDE9B8', { y: -0.6 }));                                             // ground slab (sky never in frame at this pitch)
  // floor tiles (1 m checker) — merged
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++)
    P.push(part('box', [0.98, 0.3, 0.98], (x + z) & 1 ? C.floorA : C.floorB, { x: x - W / 2 + 0.5, y: -0.15, z: z - D / 2 + 0.5 }));
  P.push(part('rbox', [W + 0.6, 0.5, D + 0.6, 0.12], C.wood, { y: -0.45 }));                         // wooden plinth
  P.push(part('box', [W + 8, 0.2, 6], C.street, { y: -0.35, z: -D / 2 - 3 }));                        // street north
  P.push(part('box', [6, 0.2, D + 8], C.street, { x: -W / 2 - 3, y: -0.35 }));                          // street west
  // north wall with three windows, west wall with a door gap
  P.push(part('box', [W, 3, 0.4], C.wall, { y: 1.5, z: -D / 2 }));
  for (const x of [-5, 0, 5]) { P.push(part('box', [1.8, 1.3, 0.5], '#DDF6FF', { x, y: 1.7, z: -D / 2 })); P.push(part('box', [2.0, 0.12, 0.6], C.cream, { x, y: 1.0, z: -D / 2 })); }
  const dz = area.door.z;
  P.push(part('box', [0.4, 3, (dz - 1.2) + D / 2], C.wall, { x: -W / 2, y: 1.5, z: ((dz - 1.2) + (-D / 2)) / 2 }));   // west wall north part
  P.push(part('box', [0.4, 3, D / 2 - (dz + 1.2)], C.wall, { x: -W / 2, y: 1.5, z: ((dz + 1.2) + D / 2) / 2 }));      // west wall south part (door gap around z=door)
  P.push(part('box', [0.4, 0.6, 2.4], C.wall, { x: -W / 2, y: 2.7, z: area.door.z }));                   // lintel
  P.push(part('box', [0.3, 3.2, 0.3], C.woodDark, { x: -W / 2, y: 1.6, z: area.door.z - 1.3 }));
  P.push(part('box', [0.3, 3.2, 0.3], C.woodDark, { x: -W / 2, y: 1.6, z: area.door.z + 1.3 }));
  P.push(part('box', [0.4, 0.5, (dz - 1.2) + D / 2], C.wallDark, { x: -W / 2, y: 0.25, z: ((dz - 1.2) + (-D / 2)) / 2 }));  // skirting north part
  P.push(part('box', [0.4, 0.5, D / 2 - (dz + 1.2)], C.wallDark, { x: -W / 2, y: 0.25, z: ((dz + 1.2) + D / 2) / 2 }));    // skirting south part
  P.push(part('box', [W, 0.5, 0.4], C.wallDark, { y: 0.25, z: -D / 2 }));
  // low fence on the east and south edges
  for (let z = -D / 2; z <= D / 2; z += 1.5) P.push(part('box', [0.14, 0.9, 0.14], C.cream, { x: W / 2, y: 0.45, z }));
  P.push(part('box', [0.1, 0.12, D], C.cream, { x: W / 2, y: 0.8 }));
  for (let x = -W / 2; x <= W / 2; x += 1.5) P.push(part('box', [0.14, 0.9, 0.14], C.cream, { x, y: 0.45, z: D / 2 }));
  P.push(part('box', [W, 0.12, 0.1], C.cream, { y: 0.8, z: D / 2 }));
  // corner plants
  for (const [x, z] of [[W / 2 - 0.8, -D / 2 + 0.8], [W / 2 - 0.8, D / 2 - 0.8], [-W / 2 + 0.8, D / 2 - 0.8]]) {
    P.push(part('cyl', [0.32, 0.26, 0.5, 10], C.coral, { x, y: 0.25, z }));
    P.push(part('sph', [0.55, 10], C.plant, { x, y: 0.95, z })); P.push(part('sph', [0.38, 10], C.plantDark, { x: x + 0.25, y: 1.25, z: z - 0.1 }));
  }
  const g = new THREE.Group(); g.add(mesh(P));
  // awning over the ovens row: striped, angled. M3 T3 layout: production row spans x -6..8.
  // Loop v2 Task 3 (design section 6 — "every 5 stars unlocks a decoration set: awning colour"):
  // split into two SEPARATE merged meshes (one per stripe parity, each its own material instance —
  // `part()`/`mesh()` bake color into vertex attributes, so a single merged mesh can't be recolored
  // after the fact) so `g.awning.setSet(idx)` can retint both live without rebuilding geometry.
  const AWNING_SETS = [
    [C.coral, C.cream], // set 0 (default — the original look)
    ['#6EC6FF', C.cream], // set 1 — 5+ café stars
    ['#B48CF2', C.cream], // set 2 — 10+ café stars
  ];
  const awX0 = -6, awX1 = 8, awW = awX1 - awX0, awMid = (awX0 + awX1) / 2;
  const stripes = Math.round(awW);
  const partsA = [], partsB = []; // A = "primary" parity (+ the trim bar), B = "secondary" parity
  for (let i = 0; i < stripes; i++) (i & 1 ? partsB : partsA).push(part('box', [1.0, 0.06, 2.2], '#ffffff', { x: awX0 + i * 1.0 + 0.5, y: 0, z: 0 }));
  partsA.push(part('box', [awW, 0.1, 0.25], '#ffffff', { y: -0.05, z: 1.1 }));
  const matA = new THREE.MeshToonMaterial({ color: new THREE.Color(AWNING_SETS[0][0]), gradientMap: gradientMap() });
  const matB = new THREE.MeshToonMaterial({ color: new THREE.Color(AWNING_SETS[0][1]), gradientMap: gradientMap() });
  const awA = new THREE.Mesh(merge(partsA), matA); awA.receiveShadow = true;
  const awB = new THREE.Mesh(merge(partsB), matB); awB.receiveShadow = true;
  const aw = new THREE.Group(); aw.add(awA, awB);
  aw.position.set(awMid, 2.9, -D / 2 + 1.2); aw.rotation.x = 0.35; g.add(aw);
  g.awning = { setSet(idx) { const set = AWNING_SETS[Math.max(0, Math.min(AWNING_SETS.length - 1, idx))]; matA.color.set(set[0]); matB.color.set(set[1]); } };
  for (const x of [awX0 + 1, awX1 - 1]) { const pole = mesh([part('cyl', [0.06, 0.06, 2.9, 8], C.metal)]); pole.position.set(x, 1.45, -D / 2 + 2.2); g.add(pole); }
  return g;
}

export function counterMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [2.4, 1.0, 1.0, 0.08], C.cream, { y: 0.5 }),
    part('box', [2.5, 0.12, 1.1], C.wood, { y: 1.02 }),
    part('box', [2.2, 0.5, 0.06], C.coral, { y: 0.5, z: 0.52 }),
    part('box', [2.2, 0.55, 0.42], '#DDF6FF', { y: 1.4, z: -0.27 }),       // glass display (back half)
    part('box', [2.3, 0.06, 0.5], C.wood, { y: 1.7, z: -0.27 }),           // wood lid over glass
  ]));
  // Final review fix: sized from DISPLAY_CAP_LEVELS' max (economy.js: [12,16,20,24]) — 24
  // positions as 6 columns x 4 rows, spacing tightened (0.6->0.36 across x, 0.16->0.14 across z)
  // so all 6 columns still fit the 2.4m top (same ~1.8m span, now 5 gaps instead of 3) and 4 rows
  // still clear the front coral trim (z 0.52). Rows are ordered FRONT-first (r=0 at z=0.47, the
  // row nearest the customer-facing edge, stepping back toward z=0.05 as r increases) and the
  // loop fills a whole row (all 6 columns) before moving to the next one back, so
  // systems/visuals.js's v.items[i] — which lights up index 0..st.items.length-1 in slot order —
  // fills the visible front row first, exactly like the display filling up from what a customer
  // actually sees.
  g.slots = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) g.slots.push(new THREE.Vector3(-0.9 + c * 0.36, 1.16, 0.47 - r * 0.14));
  // small chalkboard bar on the front — its own mesh so setProduct can swap the color without rebuilding the merged counter geometry
  const barMat = new THREE.MeshToonMaterial({ color: new THREE.Color(PRODUCTS.cookie.color) });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.04), barMat); bar.position.set(0.9, 0.72, 0.54); bar.receiveShadow = true; g.add(bar);
  g.setProduct = key => { bar.material.color.set((PRODUCTS[key] || PRODUCTS.cookie).color); };
  return g;
}
export function ovenMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.6, 1.3, 1.2, 0.08], C.metal, { y: 0.65 }),
    part('box', [1.1, 0.6, 0.05], C.ink, { y: 0.65, z: 0.6 }),
    part('box', [1.0, 0.5, 0.02], '#FFB06B', { y: 0.65, z: 0.63 }),        // warm window
    part('box', [1.7, 0.1, 1.3], C.woodDark, { y: 1.35 }),
    part('cyl', [0.12, 0.12, 0.9, 8], C.ink, { x: 0.4, y: 1.85, z: -0.3 }),
    part('box', [0.9, 0.1, 0.5], C.wood, { y: 0.35, z: 0.95 }),            // output tray
  ]));
  g.outSlot = new THREE.Vector3(0, 0.45, 0.95);
  return g;
}
export function checkoutMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.6, 1.0, 0.9, 0.08], C.accent, { y: 0.5 }),
    part('box', [1.7, 0.12, 1.0], C.wood, { y: 1.02 }),
    part('rbox', [0.6, 0.5, 0.4, 0.05], C.ink, { x: 0.3, y: 1.3, z: -0.1 }),
    part('box', [0.5, 0.35, 0.05], '#9BF6FF', { x: 0.3, y: 1.32, z: 0.11 }),
  ]));
  return g;
}
function chairParts(angle, dist = 0.75) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rot = (x, z) => ({ x: x * cos + z * sin, z: -x * sin + z * cos });
  const seat = rot(0, dist), back = rot(0, dist + 0.23), legA = rot(0.18, dist - 0.15), legB = rot(-0.18, dist - 0.15);
  return [
    part('rbox', [0.5, 0.1, 0.5, 0.04], C.coral, { x: seat.x, y: 0.42, z: seat.z, ry: angle }),
    part('box', [0.45, 0.6, 0.08], C.coral, { x: back.x, y: 0.7, z: back.z, ry: angle }),
    part('cyl', [0.04, 0.04, 0.4, 6], C.woodDark, { x: legA.x, y: 0.2, z: legA.z }),
    part('cyl', [0.04, 0.04, 0.4, 6], C.woodDark, { x: legB.x, y: 0.2, z: legB.z }),
  ];
}
export function tableMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.7, 0.7, 0.08, 16], C.wood, { y: 0.72 }), part('cyl', [0.08, 0.12, 0.7, 8], C.woodDark, { y: 0.36 }),
    part('cyl', [0.45, 0.45, 0.06, 12], C.woodDark, { y: 0.03 }),
    ...chairParts(0, 1.05),           // south chair (human side, matches seat.pair.human's 1.05m offset — C1)
    part('cyl', [0.1, 0.13, 0.06, 12], C.pink, { x: 0.6, y: 0.03, z: 1.05 }),   // pet bowl (matches seat.pair.pet's offset — C1); no chair on the pet's side
  ]));
  return g;
}
export function hireDeskMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.0, 0.9, 1.6, 0.08], C.wood, { y: 0.45 }),
    part('box', [1.05, 0.08, 1.65], C.woodDark, { y: 0.94 }),
    part('box', [0.32, 0.02, 0.24], C.cream, { x: -0.1, y: 1.0, z: 0.5 }),          // clipboard
    part('box', [0.32, 0.16, 0.02], C.ink, { x: -0.1, y: 1.03, z: 0.38 }),          // clip
    part('cyl', [0.05, 0.05, 1.5, 8], C.woodDark, { x: 0.3, y: 1.65, z: -0.55 }),   // sign post
    part('box', [0.7, 0.5, 0.05], C.cream, { x: 0.3, y: 2.2, z: -0.55 }),           // sign board
    part('box', [0.7, 0.12, 0.06], C.coral, { x: 0.3, y: 2.4, z: -0.545 }),         // coral header stripe
  ]));
  return g;
}
export function kioskMesh() {
  const parts = [
    part('rbox', [1.0, 1.6, 0.5, 0.1], C.accent, { y: 0.8 }),
    part('box', [0.6, 0.5, 0.05], '#9BF6FF', { y: 1.1, z: 0.26 }),                  // screen
    part('cyl', [0.22, 0.22, 0.08, 10], C.cream, { y: 1.66 }),                      // gear-like disc
  ];
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; parts.push(part('box', [0.08, 0.05, 0.08], C.cream, { x: Math.sin(a) * 0.24, y: 1.66, z: Math.cos(a) * 0.24 })); }
  const g = new THREE.Group(); g.add(mesh(parts)); return g;
}
// Loop v2 Task 2: a small dark chalkboard sign — post + board — mounted at every eligible active
// station's front-left corner. visuals.js adds it as a CHILD of the station's own render group (in
// LOCAL, unrotated coordinates: +x local right, +z local front — the same convention world.js's
// own rotateOffset uses), so it inherits that group's build pop-in, rotation and active/visible
// state for free; the DOM label (name + product icon) projects from its precomputed world position
// each frame instead (systems/visuals.js's CHALK_Y).
export function chalkboardMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.035, 0.035, 0.8, 8], C.woodDark, { y: 0.4 }),
    part('rbox', [0.5, 0.36, 0.04, 0.04], C.ink, { y: 0.86 }),
    part('box', [0.44, 0.3, 0.01], '#2B2320', { y: 0.86, z: 0.025 }),
  ]));
  return g;
}
// M3 T3: bowl/bush/coffee/storage/blender station props — simple merged meshes, +z front,
// behaviour lands in Task 4. bushMesh's three berries are a single InstancedMesh (one extra
// draw call per bush, not three) so setStage(0..3) can scale them independently without
// re-merging geometry every time a bush ripens.
export function bowlMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.35, 0.3, 0.18, 14], C.pink, { y: 0.09 }),
    part('cyl', [0.28, 0.28, 0.05, 14], C.cream, { y: 0.16 }),
  ]));
  return g;
}
export function bushMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('sph', [0.45, 10], C.plant, { y: 0.4 }),
    part('cyl', [0.3, 0.34, 0.18, 10], C.wood, { y: 0.05 }),
  ]));
  const berryGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const berryMat = new THREE.MeshToonMaterial({ color: new THREE.Color(C.coral), gradientMap: gradientMap() });
  const im = new THREE.InstancedMesh(berryGeo, berryMat, 3); im.castShadow = false; im.count = 3;
  g.add(im);
  const positions = [[0.2, 0.55, 0.1], [-0.15, 0.6, -0.15], [0.05, 0.5, 0.25]];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  g.setStage = stage => {
    const t = Math.max(0, Math.min(3, stage | 0));
    const sc = t === 0 ? 0.0001 : t / 3;
    for (let i = 0; i < 3; i++) { p.set(positions[i][0], positions[i][1], positions[i][2]); s.setScalar(sc); m4.compose(p, q, s); im.setMatrixAt(i, m4); }
    im.instanceMatrix.needsUpdate = true;
  };
  g.setStage(0);
  return g;
}
export function coffeeMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [0.7, 0.9, 0.6, 0.06], C.metal, { y: 0.45 }),
    part('box', [0.5, 0.3, 0.05], C.ink, { y: 0.65, z: 0.31 }),
    part('box', [0.42, 0.22, 0.02], '#FFB06B', { y: 0.65, z: 0.335 }),
    part('cyl', [0.05, 0.05, 0.25, 8], C.woodDark, { x: 0.2, y: 0.75, z: 0.25 }),
    part('box', [0.6, 0.06, 0.5], C.woodDark, { y: 0.92 }),
  ]));
  return g;
}
// Loop v2 Task 1: was storageMesh — same geometry, renamed for the 'pantry' station type.
export function pantryMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.32, 0.4, 0.06, 10], C.wallDark, { y: 0.03 }),
    part('sph', [0.3, 8], C.wood, { x: -0.2, y: 0.28, sy: 1.1 }),
    part('sph', [0.3, 8], C.woodDark, { x: 0.22, y: 0.28, sy: 1.1 }),
    part('box', [0.16, 0.06, 0.02], C.cream, { x: -0.2, y: 0.46, rz: 0.3 }),
    part('box', [0.16, 0.06, 0.02], C.cream, { x: 0.22, y: 0.46, rz: -0.3 }),
  ]));
  return g;
}
// Loop v2 Task 1: the return crate — a small wooden crate with a down-arrow plate (merged), next
// to the pantry. Takes back any carried stack for zero coins (systems/stations.js).
export function crateMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [0.7, 0.5, 0.7], C.wood, { y: 0.25 }),
    part('box', [0.74, 0.06, 0.74], C.woodDark, { y: 0.51 }),
    part('box', [0.06, 0.5, 0.72], C.woodDark, { x: -0.32, y: 0.25 }),
    part('box', [0.06, 0.5, 0.72], C.woodDark, { x: 0.32, y: 0.25 }),
    part('box', [0.36, 0.36, 0.03], C.cream, { y: 0.75, z: 0.36 }),          // sign plate
  ]));
  // down-arrow on the sign plate, its own small mesh so the plate stays a simple merged box.
  const arrowMat = new THREE.MeshToonMaterial({ color: new THREE.Color(C.coral) });
  const arrow = new THREE.Mesh(merge([
    part('box', [0.06, 0.22, 0.01], C.coral, { y: 0.02 }),
    part('box', [0.05, 0.05, 0.01], C.coral, { y: -0.09, rz: Math.PI / 4 }),
    part('box', [0.05, 0.05, 0.01], C.coral, { y: -0.09, rz: -Math.PI / 4 }),
  ]), arrowMat);
  arrow.position.set(0, 0.75, 0.375); g.add(arrow);
  return g;
}
export function blenderMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [0.5, 0.35, 0.5, 0.05], C.wood, { y: 0.18 }),
    part('cyl', [0.18, 0.24, 0.55, 10], '#9BF6FF', { y: 0.63 }),
    part('cyl', [0.16, 0.16, 0.08, 10], C.ink, { y: 0.94 }),
  ]));
  return g;
}
// Task 4 carry props — small enough to sit on the owner/runner stack alongside (never mixed with,
// per the carry-slot rules in src/sim/carry.js) product items.
export function sackMesh(kind = 'beans') {
  const g = new THREE.Group();
  const color = kind === 'kibble' ? C.wood : C.woodDark;
  g.add(mesh([
    part('sph', [0.16, 8], color, { y: 0.16, sy: 1.25 }),
    part('cyl', [0.05, 0.08, 0.08, 8], C.cream, { y: 0.34 }),          // tied neck
  ]));
  return g;
}
export function fruitMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.15, 0.17, 0.1, 10], C.wood, { y: 0.05 }),           // basket
    part('sph', [0.06, 8], C.coral, { x: -0.05, y: 0.16, z: 0.02 }),
    part('sph', [0.06, 8], C.coral, { x: 0.05, y: 0.16, z: -0.02 }),
    part('sph', [0.06, 8], C.coral, { y: 0.2 }),
  ]));
  return g;
}
// Task 4: a dirty seat's plate + crumbs, parented to the table mesh and toggled by st.dirty.
export function dirtyMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.2, 0.2, 0.03, 16], C.cream, { y: 0.02 }),
    part('sph', [0.02, 6], C.woodDark, { x: 0.08, y: 0.04, z: 0.05 }),
    part('sph', [0.02, 6], C.woodDark, { x: -0.06, y: 0.04, z: -0.04 }),
    part('sph', [0.02, 6], C.woodDark, { x: 0.02, y: 0.04, z: -0.09 }),
  ]));
  return g;
}
const _itemGeo = new Map();
export function itemGeoFor(key) {
  if (!_itemGeo.has(key)) _itemGeo.set(key, merge([part('rbox', [0.28, 0.16, 0.28, 0.05], PRODUCTS[key].color), part('sph', [0.07, 8], C.cream, { y: 0.1 })]));
  return _itemGeo.get(key);
}
export function itemFor(key) {
  // small carried/stocked prop: skip the shadow pass (draw-call budget), it still reads fine unshadowed.
  const m = new THREE.Mesh(itemGeoFor(key), toonMaterial()); m.castShadow = false; m.receiveShadow = true; return m;
}
// M3 T5: the objective arrow — a small downward chevron (two angled bars), C.coin emissive so it
// reads over any background. src/systems/objective.js positions/bobs/rotates the returned group.
export function chevronMesh() {
  const parts = [
    part('box', [0.5, 0.15, 0.15], C.coin, { x: -0.2, rz: -0.62 }),
    part('box', [0.5, 0.15, 0.15], C.coin, { x: 0.2, rz: 0.62 }),
  ];
  const g = new THREE.Group();
  const m = new THREE.Mesh(merge(parts), emissiveMaterial(C.coin));
  m.castShadow = false; m.receiveShadow = false;
  g.add(m);
  return g;
}
// M3 T5: build-spot dashed floor outline — 16 thin dashes per side (fw x fd footprint,
// local right/forward axes so it works under any station rot), merged into one draw call.
// C.accent, sits just above the floor.
export function buildOutline(fw = 2.4, fd = 1.0) {
  const DASHES = 16; // per side, per the task brief
  const parts = [];
  const hw = fw / 2, hd = fd / 2;
  const addEdge = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const step = len / DASHES, dashLen = step * 0.55;
    const ang = Math.atan2(dx, dz);
    for (let i = 0; i < DASHES; i++) {
      const d0 = i * step + step / 2;
      const cx = x0 + ux * d0, cz = z0 + uz * d0;
      parts.push(part('box', [0.05, 0.04, dashLen], C.accent, { x: cx, y: 0.02, z: cz, ry: ang }));
    }
  };
  addEdge(-hw, -hd, hw, -hd); addEdge(hw, -hd, hw, hd);
  addEdge(hw, hd, -hw, hd); addEdge(-hw, hd, -hw, -hd);
  const g = new THREE.Group();
  const m = new THREE.Mesh(merge(parts), new THREE.MeshBasicMaterial({ vertexColors: true }));
  m.castShadow = false; m.receiveShadow = false;
  g.add(m);
  return g;
}
// M3 T5: the flat cream footprint slab inside a build outline — a simple "ghost of the station"
// placeholder at 25% opacity, cheaper than a real translucent copy of the station's own mesh.
export function buildGhost(fw = 2.4, fd = 1.0) {
  const geo = new THREE.BoxGeometry(fw * 0.9, 0.04, fd * 0.9);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.cream), transparent: true, opacity: 0.25, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.position.y = 0.015; m.castShadow = false; m.receiveShadow = false;
  return m;
}
export function zoneRing() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 8, 40), emissiveMaterial(C.accent)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.accent), transparent: true, opacity: 0.35 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; g.add(disc);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.coin), transparent: true, opacity: 0.8 })); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.025; fill.scale.setScalar(0.001); g.add(fill);
  g.ring = ring; g.pulse = new Spring(1, 120, 10);
  g.setProgress = t => fill.scale.setScalar(Math.max(0.001, t));
  return g;
}
export function cashPile(max = 60) {
  const geo = new THREE.BoxGeometry(0.32, 0.04, 0.18); const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(C.cash) });
  const im = new THREE.InstancedMesh(geo, mat, max); im.castShadow = true; im.count = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  im.setCount = n => {
    n = Math.min(max, n | 0); if (n === im.count) return;
    for (let i = 0; i < n; i++) { const col = i % 4, row = (i >> 2) % 4, lvl = i >> 4; p.set(-0.55 + col * 0.36, 0.02 + lvl * 0.045, -0.3 + row * 0.2); e.set(0, ((i * 7919) % 17) / 17 * 0.5 - 0.25, 0); q.setFromEuler(e); m.compose(p, q, s); im.setMatrixAt(i, m); }
    im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  };
  return im;
}
