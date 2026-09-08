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
  // Batch 1 — the terrace gate (plan 3.1/7.1). GATE_HALF_W mirrors src/sim/nav.js's own constant
  // (matching gate1's fw 2.4 in data/area1.js) — the gap the fence leaves for it is carved out of
  // the ALWAYS-solid south rail/posts here, and refilled by a small, separately-merged "gate
  // infill" mesh below (its own draw call) that starts closed and is the only piece
  // g.gate.setOpen() ever needs to touch.
  const GATE_HALF_W = 1.2;
  for (let x = -W / 2; x <= W / 2; x += 1.5) {
    if (Math.abs(x) < GATE_HALF_W) continue; // gate gap — filled by the removable gate mesh below
    P.push(part('box', [0.14, 0.9, 0.14], C.cream, { x, y: 0.45, z: D / 2 }));
  }
  // South rail, split around the gate gap so the two permanently-solid halves never move.
  const railHalfSpan = (W / 2 - GATE_HALF_W) / 2;
  P.push(part('box', [W / 2 - GATE_HALF_W, 0.12, 0.1], C.cream, { x: -GATE_HALF_W - railHalfSpan, y: 0.8, z: D / 2 }));
  P.push(part('box', [W / 2 - GATE_HALF_W, 0.12, 0.1], C.cream, { x: GATE_HALF_W + railHalfSpan, y: 0.8, z: D / 2 }));
  // corner plants
  for (const [x, z] of [[W / 2 - 0.8, -D / 2 + 0.8], [W / 2 - 0.8, D / 2 - 0.8], [-W / 2 + 0.8, D / 2 - 0.8]]) {
    P.push(part('cyl', [0.32, 0.26, 0.5, 10], C.coral, { x, y: 0.25, z }));
    P.push(part('sph', [0.55, 10], C.plant, { x, y: 0.95, z })); P.push(part('sph', [0.38, 10], C.plantDark, { x: x + 0.25, y: 1.25, z: z - 0.1 }));
  }
  const g = new THREE.Group(); g.add(mesh(P));
  // Gate infill: starts CLOSED (matching the pre-terrace look — a solid, seamless fence) and is
  // hidden by g.gate.setOpen(true) once z_terrace is bought. A separate small mesh so it never
  // requires rebuilding the one big merged geometry above.
  const gateMesh = mesh([
    part('box', [0.14, 0.9, 0.14], C.cream, { x: -GATE_HALF_W * 0.55, y: 0.45, z: D / 2 }),
    part('box', [0.14, 0.9, 0.14], C.cream, { x: GATE_HALF_W * 0.55, y: 0.45, z: D / 2 }),
    part('box', [GATE_HALF_W * 2, 0.12, 0.1], C.cream, { y: 0.8, z: D / 2 }),
  ]);
  g.add(gateMesh);
  g.gate = { setOpen(open) { gateMesh.visible = !open; } };
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
  const p = [
    part('rbox',[.82,.66,.46,.06],'#458C87',{y:.55,z:-.08}),
    part('box',[.74,.18,.06],C.metal,{y:.57,z:.18}),
    part('rbox',[.85,.08,.65,.025],C.ink,{y:.08,z:.08}),
    part('box',[.8,.05,.5],C.metal,{y:.91,z:-.04}),
    part('cyl',[.075,.075,.025,16],C.cream,{x:0,y:.76,z:.165,rx:Math.PI/2}),
    part('box',[.009,.055,.012],C.ink,{y:.78,z:.185,rz:-.5}),
  ];
  for(const x of [-.23,.23]) {
    p.push(part('cyl',[.09,.07,.1,12],C.metal,{x,y:.43,z:.18}),part('box',[.04,.04,.2],C.ink,{x,y:.4,z:.3}),part('cyl',[.07,.055,.12,12],C.cream,{x,y:.19,z:.22}),part('cyl',[.058,.058,.005,12],'#422A20',{x,y:.253,z:.22}),part('sph',[.026,8],'#B8E5B0',{x,y:.77,z:.165}));
  }
  for(let x=-.3;x<=.3;x+=.1) p.push(part('box',[.018,.012,.32],C.metal,{x,y:.126,z:.12}));
  p.push(part('cyl',[.025,.025,.35,8],C.metal,{x:.44,y:.38,z:.12,rz:-.22}));
  g.add(mesh(p)); return g;
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
// ── Resident pet furniture (plan §5.4) ─────────────────────────────────────────────────────────
// systems/residentPets.js used to drop scaled-up pets straight onto the café tiles, which read as
// oversized blocks dumped on the floor. Every resident now sits ON one of these five props, and
// each mesh carries `perch` — the LOCAL point where the pet's own y = 0 ground plane goes — so the
// placement maths lives next to the geometry that defines it instead of as magic numbers in the
// systems layer.
//
// All five are deliberately cheap. There is no `rbox` anywhere below: RoundedBoxGeometry at
// geo.js's segment count is 588 triangles per part, and the scene already sits close to its ~210k
// ceiling. The whole set is under 1.4k triangles, against ~21k freed by the two placeholder
// residents §5.4's furniture list retires.
//
// Bed rims are RINGS of 6-segment spheres rather than solid discs. That matters for more than
// looks: a pet has to sit INSIDE the rim (legs hidden, body above it) or it reads as standing on
// top of a cake, so each `perch` is set below the rim line, not on it.
function rimRing(count, rx, rz, y, radius, hex) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    parts.push(part('sph', [radius, 6], hex, { x: Math.sin(a) * rx, y, z: Math.cos(a) * rz }));
  }
  return parts;
}
// Round cat bed: nine coral tufts around a cream cushion pad. Rim top 0.33, pad top 0.18.
export function catBedMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.56, 0.52, 0.1, 14], C.coral, { y: 0.05 }),
    part('cyl', [0.46, 0.46, 0.1, 12], C.cream, { y: 0.13 }),
    ...rimRing(9, 0.45, 0.45, 0.17, 0.16, C.coral),
  ]));
  g.perch = new THREE.Vector3(0, 0.16, 0);
  return g;
}
// Windowsill cushion for the north window at x = -5. buildStatic's own sill board sits at
// y 0.94..1.06, z -7.3..-6.7 and is only 0.6 m deep — a shelf, not a seat. This ledge is mounted
// flush with it (local +z points into the room) so the two read as one deep sill a cat can loaf on,
// silhouetted against the window glass behind it.
export function windowCushionMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [1.7, 0.1, 0.8], C.wood, { y: 1.01, z: 0.1 }),                      // ledge, top 1.06
    part('box', [0.08, 0.3, 0.5], C.woodDark, { x: -0.7, y: 0.86 }),                // brackets, under the plank
    part('box', [0.08, 0.3, 0.5], C.woodDark, { x: 0.7, y: 0.86 }),
    part('sph', [0.44, 10], '#F2C4CE', { y: 1.14, z: 0.1, sy: 0.3, sz: 0.8 }),      // pillow, top 1.27
    part('sph', [0.2, 8], C.wall, { x: -0.62, y: 1.16, z: 0.06, sy: 0.42, sz: 0.9 }), // spare cushion
  ]));
  g.perch = new THREE.Vector3(0, 1.23, 0.12);
  return g;
}
// Cat tree for the kiosk corner: two sisal posts, a low shelf and a cushioned upper platform with a
// dangling ball. The top shelf is deliberately capped at 1.05 m: a sitting pet is 1.32 m to the ear
// tips at scale 1.0, so anything taller puts the cat's head into the top of a 3 m wall.
export function catTreeMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [0.72, 0.1, 1.05], C.woodDark, { y: 0.05 }),                         // base, top 0.10
    part('cyl', [0.1, 0.1, 0.62, 8], '#C9B79F', { y: 0.41, z: -0.32 }),              // short post 0.10..0.72
    part('cyl', [0.1, 0.1, 0.86, 8], '#C9B79F', { y: 0.53, z: 0.2 }),                // tall post 0.10..0.96
    part('box', [0.66, 0.08, 0.7], C.wood, { y: 0.76, z: -0.32 }),                   // mid shelf, top 0.80
    part('sph', [0.26, 8], C.cream, { y: 0.82, z: -0.32, sy: 0.22 }),                // mid cushion
    part('box', [0.66, 0.09, 0.94], C.wood, { y: 1.005, z: 0.2 }),                   // top shelf, top 1.05
    part('cyl', [0.34, 0.34, 0.09, 12], '#F4C9D3', { y: 1.095, z: 0.2, sz: 1.35 }),  // top cushion, top 1.14
    part('cyl', [0.014, 0.014, 0.26, 4], C.cream, { x: 0.28, y: 0.83, z: 0.5 }),     // toy string
    part('sph', [0.075, 6], C.coin, { x: 0.28, y: 0.67, z: 0.5 }),                   // dangling ball
  ]));
  // Perch pulled back from the shelf centre (0.2) to 0.08: at 0.2 the cat's muzzle reached
  // 12 mm into the kiosk mesh behind it. Legs still land at z -0.23..0.39 on a shelf spanning
  // -0.27..0.67, so the pose is unchanged.
  g.perch = new THREE.Vector3(0, 1.11, 0.08);
  return g;
}
// Dog basket for the door corner: an oval woven base, a folded blanket and an eleven-tuft rim. The
// long axis is local z so a dog (0.9 m nose to tail) lies along it without its chest in the rim.
export function dogBasketMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.72, 0.66, 0.16, 14], C.wood, { y: 0.08, sx: 0.6 }),
    part('cyl', [0.62, 0.62, 0.1, 12], C.wall, { y: 0.16, sx: 0.62 }),               // blanket, top 0.21
    ...rimRing(11, 0.42, 0.62, 0.2, 0.16, C.wood),                                   // rim, top 0.36
  ]));
  g.perch = new THREE.Vector3(0, 0.19, 0);
  return g;
}
// Bunny hutch for the garden. environment.js's own layout rule for the near band (z 7.5..14) is
// "low only — anything tall here sits between the camera and the café", so this is a roofed
// SLEEPING box over the back half only, 0.87 m tall, with an open straw-lined front the bunny
// actually sits in. A full-height hutch would both occlude the café and clip the bunny's ears.
export function bunnyHutchMesh() {
  const g = new THREE.Group();
  const p = [
    part('box', [1.34, 0.09, 1.5], C.wood, { y: 0.305 }),                            // floor, top 0.35
    part('box', [1.34, 0.44, 0.07], C.wood, { y: 0.57, z: -0.745 }),                 // back wall
    part('box', [1.46, 0.07, 0.6], C.coral, { y: 0.83, z: -0.48, rx: -0.14 }),       // roof, back third only
    part('box', [1.34, 0.12, 0.07], C.wood, { y: 0.41, z: 0.715 }),                  // front rail
    part('sph', [0.5, 8], '#E8CE93', { y: 0.36, z: 0.22, sy: 0.14, sx: 1.15, sz: 0.9 }), // straw, top 0.43
    part('cone', [0.055, 0.2, 6], '#F08A3C', { x: 0.5, y: 0.42, z: 0.56, rx: 1.45 }), // a dropped carrot
  ];
  for (const x of [-0.6, 0.6]) {
    p.push(part('box', [0.07, 0.44, 0.5], C.wood, { x, y: 0.57, z: -0.52 }));        // side walls, back section
    p.push(part('box', [0.07, 0.12, 0.94], C.wood, { x, y: 0.41, z: 0.28 }));        // side rails, open front
    for (const z of [-0.62, 0.62]) p.push(part('box', [0.11, 0.26, 0.11], C.woodDark, { x: x * 0.93, y: 0.13, z }));
  }
  g.add(mesh(p));
  g.perch = new THREE.Vector3(0, 0.4, 0.22);
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
  if (_itemGeo.has(key)) return _itemGeo.get(key);
  const color = PRODUCTS[key].color, parts = [];
  if (key === 'cookie') {
    parts.push(part('cyl', [.15, .15, .09, 16], color));
    for (const [x,z] of [[-.07,-.05],[.06,-.06],[0,.06],[.09,.035],[-.085,.055]])
      parts.push(part('sph', [.024, 6], '#563320', {x,y:.047,z,sy:.45}));
  } else if (key === 'cupcake') {
    parts.push(part('cyl', [.125,.085,.12,12], '#C7955D', {y:-.015}));
    for (let i=0;i<10;i++) { const t=i*Math.PI/5; parts.push(part('box',[.018,.1,.018], '#F3D7A0',{x:Math.cos(t)*.105,y:-.015,z:Math.sin(t)*.105})); }
    parts.push(part('sph',[.13,12],color,{y:.065,sy:.55}),part('sph',[.083,10],'#FFB4B0',{y:.12,sy:.7}),part('sph',[.031,8],'#C83955',{y:.183}));
  } else if (key === 'coffee' || key === 'latte') {
    parts.push(part('cyl',[.115,.09,.2,16],C.cream),part('cyl',[.099,.099,.008,16],key==='latte'?'#C99B69':'#422A20',{y:.103}));
    parts.push(part('box',[.09,.025,.035],C.cream,{x:.14,y:.065}),part('box',[.025,.12,.035],C.cream,{x:.177}),part('box',[.09,.025,.035],C.cream,{x:.14,y:-.055}));
    // A little milk paw distinguishes the latte from black coffee.
    if(key==='latte') for(const [x,z,r] of [[0,.02,.032],[-.044,-.025,.015],[0,-.04,.015],[.044,-.025,.015]]) parts.push(part('cyl',[r,r,.006,10],C.cream,{x,z,y:.11}));
  } else if (key === 'smoothie') {
    parts.push(part('cyl',[.11,.075,.22,12],color),part('cyl',[.12,.12,.025,12],C.cream,{y:.12}),part('cyl',[.012,.012,.17,6],'#F77F9A',{x:.025,y:.19,rz:-.22}),part('sph',[.045,8],'#D54879',{x:-.065,y:.15}));
  } else if(key === 'treat') {
    parts.push(part('rbox',[.2,.07,.08,.025],color));
    for(const x of [-.1,.1]) for(const z of [-.04,.04]) parts.push(part('sph',[.057,8],color,{x,z,sy:.7}));
  } else {
    parts.push(part('rbox',[.27,.12,.25,.02],color),part('box',[.255,.025,.235],'#46291C',{y:.07}));
    for(const [x,z] of [[-.07,-.06],[.06,-.04],[0,.07]]) parts.push(part('box',[.04,.018,.03],'#E8C58B',{x,z,y:.09,ry:.4}));
  }
  const geometry = merge(parts); _itemGeo.set(key, geometry); return geometry;
}
export function itemFor(key) {
  const m = new THREE.Mesh(itemGeoFor(key), toonMaterial());
  m.userData.product = key; m.castShadow = false; m.receiveShadow = true; return m;
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
// ── The terrace deck (plan 3.1/7.1) ─────────────────────────────────────────────────────────────
// buildRegion(area, region) renders a bought region's floor. It is deliberately generic over
// `region` (any future region reuses it) rather than hard-coded to the terrace, even though only
// the terrace exists this batch. One merged mesh (cheap: a border ring, a base slab, N plank
// strips, four corner planters and a gate arch — well under a hundred triangles per plank row).
export function buildRegion(area, region) {
  const x0 = region.x0, x1 = region.x1, z0 = region.z0, z1 = region.z1;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const parts = [];
  // Stone border, a wide flat ring under the whole deck.
  parts.push(part('rbox', [w + 0.7, 0.42, d + 0.7, 0.1], '#E6E0D6', { x: cx, y: -0.24, z: cz }));
  // Gap-colour base slab, then plank strips laid on top with a small reveal between them — cheaper
  // than a separate gap box per plank and reads the same way.
  parts.push(part('box', [w, 0.05, d], '#C69A6B', { x: cx, y: -0.05, z: cz }));
  const plankD = 0.42, gap = 0.06, step = plankD + gap;
  const rows = Math.max(1, Math.floor((d + gap) / step));
  const usedD = rows * step - gap;
  const startZ = cz - usedD / 2 + plankD / 2;
  for (let i = 0; i < rows; i++) {
    parts.push(part('box', [w - 0.06, 0.09, plankD], '#D9B48A', { x: cx, y: 0.0, z: startZ + i * step }));
  }
  // Corner planters, echoing buildStatic's own corner planters above.
  const inset = 0.9;
  for (const [px, pz] of [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x0 + inset, z1 - inset], [x1 - inset, z1 - inset]]) {
    parts.push(part('cyl', [0.3, 0.24, 0.46, 10], '#A9764E', { x: px, y: 0.19, z: pz }));
    parts.push(part('sph', [0.5, 9], '#6FB56F', { x: px, y: 0.82, z: pz }));
    parts.push(part('sph', [0.35, 9], '#57A45C', { x: px + 0.22, y: 1.08, z: pz - 0.1 }));
  }
  // Gate arch, straddling gate1's position (x 0, the fence line just north of z0) — matches
  // GATE_HALF_W (this file's buildStatic, and src/sim/nav.js's own copy) of 1.2.
  const gateX = 0, gateZ = z0 - 0.2, archH = 2.5, halfGate = 1.35, postColor = '#C08A56';
  parts.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX - halfGate, y: archH / 2 - 0.1, z: gateZ }));
  parts.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX + halfGate, y: archH / 2 - 0.1, z: gateZ }));
  parts.push(part('box', [halfGate * 2 + 0.3, 0.18, 0.18], postColor, { x: gateX, y: archH - 0.1, z: gateZ }));
  parts.push(part('box', [halfGate * 2 + 0.2, 0.4, 0.05], '#D9A066', { x: gateX, y: archH + 0.05, z: gateZ }));
  const g = new THREE.Group();
  g.add(mesh(parts));
  return g;
}
// ── Terrace station meshes (plan 3.1/7.2) ───────────────────────────────────────────────────────
// icecream1 mirrors coffeeMesh's shape/scale (a counter-height machine) but in ice-cream pastels
// with two swirl cones instead of a coffee spout.
export function icecreamMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [0.9, 0.62, 0.55, 0.06], '#EAF6FF', { y: 0.5 }),
    part('box', [0.82, 0.06, 0.5], C.metal, { y: 0.82 }),
    part('cyl', [0.16, 0.16, 0.05, 12], '#FFD6E7', { x: -0.22, y: 0.86 }),
    part('cyl', [0.15, 0.15, 0.05, 12], '#FFF0F5', { x: 0.1, y: 0.86 }),
    part('cone', [0.1, 0.24, 10], '#FFF0F5', { x: -0.22, y: 1.06 }),
    part('cone', [0.09, 0.2, 10], '#FFD6E7', { x: 0.1, y: 1.02 }),
    part('cyl', [0.05, 0.05, 0.28, 8], C.ink, { x: 0.38, y: 0.62, z: 0.2 }),
  ]));
  return g;
}
// coldPantry1 — pantryMesh's shape in icy tones, so the pair reads as a matched set from across
// the deck.
export function coldPantryMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.32, 0.4, 0.06, 10], '#9BD9E8', { y: 0.03 }),
    part('sph', [0.3, 8], '#DDF6FF', { x: -0.2, y: 0.28, sy: 1.1 }),
    part('sph', [0.3, 8], '#BFEFFA', { x: 0.22, y: 0.28, sy: 1.1 }),
    part('box', [0.16, 0.06, 0.02], '#FFFFFF', { x: -0.2, y: 0.46, rz: 0.3 }),
    part('box', [0.16, 0.06, 0.02], '#FFFFFF', { x: 0.22, y: 0.46, rz: -0.3 }),
  ]));
  return g;
}
// The pet photo booth (z_photo). Scope note: this batch renders the booth only — no queue, no
// mini-game (Batch 2, plan 3.2). A curtained cabinet with a lens front.
export function photoBoothMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [1.2, 1.9, 1.6], '#F2C4CE', { y: 0.95 }),
    part('box', [1.3, 0.12, 1.7], C.woodDark, { y: 1.9 }),
    part('rbox', [0.9, 1.0, 0.05, 0.05], C.wall, { y: 1.1, z: 0.83 }),
    part('cyl', [0.16, 0.16, 0.1, 14], C.ink, { y: 1.2, z: 0.86, rx: Math.PI / 2 }),
    part('cyl', [0.1, 0.1, 0.03, 14], '#9BF6FF', { y: 1.2, z: 0.92, rx: Math.PI / 2 }),
  ]));
  return g;
}
// The restroom hut (wc1) — a comfort buff, not a queue (plan 7.2's `tidy`). A small board hut.
export function restroomMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('box', [1.4, 1.7, 1.2], '#EFE0CE', { y: 0.85 }),
    part('box', [1.55, 0.12, 1.35], C.woodDark, { y: 1.72 }),
    part('box', [0.5, 1.1, 0.05], C.wood, { y: 0.6, z: 0.61 }),
    part('cyl', [0.04, 0.04, 0.2, 8], C.metal, { x: 0.18, y: 0.6, z: 0.64 }),
  ]));
  return g;
}
// fountain1 (decor, pre-splash) — a tiered stone fountain. z_splash later adds splash1 in the same
// spot as a play pool (plan 3.1); the render/systems layer that toggles which one is visible when
// both zones are built is outside this task's scope (props.js only supplies the two meshes).
export function fountainMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [1.1, 1.15, 0.22, 20], '#9CC08A', { y: 0.11 }),
    part('cyl', [0.95, 0.95, 0.08, 20], '#A8DCEF', { y: 0.24 }),
    part('cyl', [0.55, 0.6, 0.5, 14], '#E6E0D6', { y: 0.5 }),
    part('cyl', [0.45, 0.45, 0.06, 14], '#A8DCEF', { y: 0.76 }),
    part('cyl', [0.1, 0.14, 0.4, 10], '#E6E0D6', { y: 0.95 }),
    part('sph', [0.16, 8], '#A8DCEF', { y: 1.18 }),
  ]));
  return g;
}
// splash1 — a low play pool for pets, replacing fountain1's spot once z_splash is built.
export function splashPoolMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [1.15, 1.2, 0.2, 20], '#E6E0D6', { y: 0.1 }),
    part('cyl', [0.95, 0.95, 0.1, 20], '#A8DCEF', { y: 0.2 }),
    part('cyl', [0.5, 0.5, 0.03, 16], '#D8F0FA', { y: 0.26 }),
  ]));
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
