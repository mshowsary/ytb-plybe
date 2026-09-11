// src/render/props.js
import * as THREE from 'three';
import { part, mesh, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial, gradientMap } from './palette.js';
import { PRODUCTS } from '../sim/economy.js';
import { Spring } from '../core/tween.js';
import { regionEdge } from '../sim/nav.js';

// The awning is one of the Paw Rating's four per-star effects (plan §3.4: "+10% arrivals, +1
// resident slot, an awning set, a decor set"). Indexed BY STAR: entry i is the café's awning at
// ★i, so entry 0 is an unrated café and there are PAW_AWNING_SETS (6) of them. Callers index it
// with pawRating.pawAwningSetIndex(pawBestStar(meta)), which is already clamped to this range;
// setSet() clamps again because this is render code and a bad index must dull the awning, not
// throw mid-frame.
//
// Set 0 is BIT-FOR-BIT the original coral/cream, so a café that has earned nothing looks exactly
// as it always did. Sets 1 and 2 are the two colours this array already shipped with (they were
// driven by café stars before the rating existed), kept unchanged so no live café's awning
// changes hue under it. 3-5 continue the same escalation into jewel tones and finally into the
// Golden Paw's own gold, all drawn from render/palette.js's existing families rather than a new
// accent: coral → sky → violet → rose → plum-and-gold → gold-on-plum, with the ★5 set simply
// inverting ★4's pair so the gold takes over the stripe rather than trimming it.
export const AWNING_SETS = Object.freeze([
  [C.coral, C.cream],       // ★0 — unrated café (the original look)
  ['#6EC6FF', C.cream],     // ★1 — sky
  ['#B48CF2', C.cream],     // ★2 — violet
  ['#E86FB0', C.cream],     // ★3 — rose
  ['#4A3B72', C.coin],      // ★4 — plum with gold trim (the star that opens legendary coats)
  [C.coin, '#4A3B72'],      // ★5 — gold on plum: the Golden Paw
].map(set => Object.freeze(set)));

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
  // Low fence on the east and south edges, each with a gate gap.
  //
  // Batch 1 put a gate in the SOUTH fence and hard-coded its half-width as a local 1.2 — a copy of
  // what src/sim/nav.js's fallback constant happened to be. data/area1.js actually authors
  // gateHalfW 2.4 for the terrace (matching gate1's fw 4.8), so the rendered gap has been half the
  // walkable one ever since and guests have been walking through two fence posts. Batch 4b needs a
  // second gate on the EAST fence anyway, so both gaps now come from the regions themselves
  // (nav.js regionEdge) — one source of truth, and the third region is data here too.
  const edgeFor = axis => {
    for (const r of (area.regions || [])) { const e = regionEdge(r, area); if (e && e.axis === axis) return e; }
    return null;
  };
  const southGate = edgeFor('z'), eastGate = edgeFor('x');
  const inGap = (gate, v) => !!gate && Math.abs(v - gate.gapCentre) < gate.gapHalf;
  // The solid spans of a rail that runs from `min` to `max` with `gate`'s gap punched out of it.
  const railSpans = (min, max, gate) => {
    if (!gate) return [[min, max]];
    const a = gate.gapCentre - gate.gapHalf, b = gate.gapCentre + gate.gapHalf;
    return [[min, Math.min(max, a)], [Math.max(min, b), max]].filter(([s, e]) => e - s > 0.01);
  };
  for (let z = -D / 2; z <= D / 2; z += 1.5) {
    if (inGap(eastGate, z)) continue;   // spa gate gap — filled by the removable gate mesh below
    P.push(part('box', [0.14, 0.9, 0.14], C.cream, { x: W / 2, y: 0.45, z }));
  }
  for (const [z0, z1] of railSpans(-D / 2, D / 2, eastGate)) {
    P.push(part('box', [0.1, 0.12, z1 - z0], C.cream, { x: W / 2, y: 0.8, z: (z0 + z1) / 2 }));
  }
  for (let x = -W / 2; x <= W / 2; x += 1.5) {
    if (inGap(southGate, x)) continue;  // terrace gate gap
    P.push(part('box', [0.14, 0.9, 0.14], C.cream, { x, y: 0.45, z: D / 2 }));
  }
  for (const [x0, x1] of railSpans(-W / 2, W / 2, southGate)) {
    P.push(part('box', [x1 - x0, 0.12, 0.1], C.cream, { x: (x0 + x1) / 2, y: 0.8, z: D / 2 }));
  }
  // corner plants
  for (const [x, z] of [[W / 2 - 0.8, -D / 2 + 0.8], [W / 2 - 0.8, D / 2 - 0.8], [-W / 2 + 0.8, D / 2 - 0.8]]) {
    P.push(part('cyl', [0.32, 0.26, 0.5, 10], C.coral, { x, y: 0.25, z }));
    P.push(part('sph', [0.55, 10], C.plant, { x, y: 0.95, z })); P.push(part('sph', [0.38, 10], C.plantDark, { x: x + 0.25, y: 1.25, z: z - 0.1 }));
  }
  const g = new THREE.Group(); g.add(mesh(P));
  // Gate infill: starts CLOSED (matching the pre-region look — a solid, seamless fence) and is
  // hidden by setOpen(true) once that region's zone is bought. A separate small mesh per gate so
  // neither ever requires rebuilding the one big merged geometry above.
  //
  // One infill PER REGION, keyed by region id in g.gates, because the two gates open on different
  // purchases. g.gate stays as an alias for the terrace's, so every existing caller is unchanged.
  g.gates = {};
  for (const r of (area.regions || [])) {
    const e = regionEdge(r, area);
    if (!e) continue;
    const h = e.gapHalf, c = e.gapCentre;
    const along = e.axis === 'z'
      ? [[c - h * 0.55, D / 2], [c + h * 0.55, D / 2]]              // south fence: posts vary in x
      : [[W / 2, c - h * 0.55], [W / 2, c + h * 0.55]];             // east fence: posts vary in z
    const parts = along.map(([px, pz]) => part('box', [0.14, 0.9, 0.14], C.cream, { x: px, y: 0.45, z: pz }));
    parts.push(e.axis === 'z'
      ? part('box', [h * 2, 0.12, 0.1], C.cream, { x: c, y: 0.8, z: D / 2 })
      : part('box', [0.1, 0.12, h * 2], C.cream, { x: W / 2, y: 0.8, z: c }));
    const gateMesh = mesh(parts);
    g.add(gateMesh);
    g.gates[r.id] = { setOpen(open) { gateMesh.visible = !open; } };
  }
  g.gate = g.gates.terrace || { setOpen() {} };
  // awning over the ovens row: striped, angled. M3 T3 layout: production row spans x -6..8.
  // Split into two SEPARATE merged meshes (one per stripe parity, each its own material instance —
  // `part()`/`mesh()` bake color into vertex attributes, so a single merged mesh can't be recolored
  // after the fact) so `g.awning.setSet(idx)` can retint both live without rebuilding geometry.
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
    // Owner feedback: "cookies on the counter share the counter's colour — hard to see even in
    // daylight." The wood top above is C.wood ('#D9A066'), the exact hex economyConfig.js's cookie
    // used to be — a cookie sitting flush on it visually merged into the surface. A pale paper tray
    // board breaks the two apart by VALUE (near-white vs. mid-tan) rather than relying only on the
    // hue fix below, so it still reads even for the couple of products (see economyConfig.js) that
    // stayed close to wood in hue. Sits flush on the wood top (top at y=1.02+0.06=1.08; this box is
    // 0.03 thick centred at 1.095, so its own top is 1.11) — the item slots below are raised by that
    // same 0.03 so every display item still sits ON the tray instead of clipping into it.
    part('box', [2.2, 0.03, 0.9], '#FFFDF7', { y: 1.095, z: 0.26 }),
  ]));
  // Final review fix: sized from DISPLAY_CAP_LEVELS' max (economy.js: [12,16,20,24]) — 24
  // positions as 6 columns x 4 rows, spacing tightened (0.6->0.36 across x, 0.16->0.14 across z)
  // so all 6 columns still fit the 2.4m top (same ~1.8m span, now 5 gaps instead of 3) and 4 rows
  // still clear the front coral trim (z 0.52). Rows are ordered FRONT-first (r=0 at z=0.47, the
  // row nearest the customer-facing edge, stepping back toward z=0.05 as r increases) and the
  // loop fills a whole row (all 6 columns) before moving to the next one back, so
  // systems/visuals.js's v.items[i] — which lights up index 0..st.items.length-1 in slot order —
  // fills the visible front row first, exactly like the display filling up from what a customer
  // actually sees. y raised 1.16->1.19 (+0.03, the tray board's own thickness added above) so
  // items sit on the tray's top face (1.11) with the same ~0.08-0.005 clearance they always had
  // above the bare wood — see the item geometries in itemGeoFor(), whose lowest point (the cupcake's
  // cup, -0.075 local) is what that clearance was ever sized against.
  g.slots = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) g.slots.push(new THREE.Vector3(-0.9 + c * 0.36, 1.19, 0.47 - r * 0.14));
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
// Task 4 / Batch 7: a dirty seat's bussed meal, parented to the table mesh and toggled by
// st.dirty. The owner's coherence ask (Batch 7, after DIRTY_EVERY went back to 1 in
// src/sim/customers.js) was that a used table reads as "a finished meal" at the game's own camera
// distance, not three crumbs on a saucer -- so this stacks a second plate and adds a coffee cup and
// a dropped fork alongside the original plate and crumbs. The cup mirrors itemGeoFor('coffee')'s
// own cup-plus-dark-disc construction below, just smaller and off to one side. Footprint stays
// inside ~0.5m so it still sits on the table top; visuals.js owns positioning the group at
// DIRTY_PROP_Y and fading it on 'cleaned' -- both untouched here.
export function dirtyMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    // Sized for the game's camera, not for a close-up: at play distance a 0.2 m plate read as "a
    // plate" (Batch 7's first screenshot), and the owner's whole point is that a used table must
    // be unmistakable. Plates 0.26 / 0.2, a cup you can see the top of, a fork the length of a hand.
    part('cyl', [0.26, 0.26, 0.035, 16], C.cream, { y: 0.02 }),
    part('cyl', [0.25, 0.25, 0.006, 16], '#F0D9C4', { y: 0.041 }),                       // plate rim shadow
    // A second, smaller plate stacked slightly askew on the first -- how a bussed table actually
    // looks, not a second identical plate set neatly beside it.
    part('cyl', [0.2, 0.2, 0.03, 14], C.cream, { x: 0.04, y: 0.058, z: -0.03 }),
    // The cup, and its dark coffee disc, parked to one side rather than centred.
    part('cyl', [0.08, 0.075, 0.13, 12], C.cream, { x: -0.3, y: 0.065, z: 0.14 }),
    part('cyl', [0.068, 0.068, 0.01, 12], '#422A20', { x: -0.3, y: 0.132, z: 0.14 }),
    part('box', [0.06, 0.02, 0.02], C.cream, { x: -0.2, y: 0.07, z: 0.14 }),               // handle
    // A dropped fork, its own thin metal sliver rather than another crumb.
    part('box', [0.17, 0.012, 0.02], C.metal, { x: 0.24, y: 0.045, z: 0.17, ry: 0.4 }),
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
// buildRegion(area, region, palette) renders a bought region's floor. It is deliberately generic
// over `region` (any future region reuses it) rather than hard-coded to the terrace, even though
// only the terrace exists this batch. One merged mesh (cheap: a border ring, a base slab, N plank
// strips, four corner planters and a gate arch — well under a hundred triangles per plank row).
//
// SEASONS. `palette` is optional and is one of environment.js's paletteForSeason(id) objects. It
// exists because, once the terrace is bought, this deck IS most of the default camera's frame:
// with the garden bands behind the camera, re-tinting the deck is the only way a season can change
// the colour temperature of the whole picture. Every fallback below is the literal this function
// shipped with, so calling it with no palette (or with a palette missing a key) renders exactly
// today's deck — the seasonal values live in environment.js's palette table, not here, so this
// file still owns no garden colour of its own.
export function buildRegion(area, region, palette = null) {
  const P = palette || {};
  const pick0 = (arr, fallback) => (Array.isArray(arr) && arr.length ? arr[0] : fallback);
  const border = P.deckBorder || '#E6E0D6';
  const base = P.deckBase || '#C69A6B';
  const plank = P.deckPlank || '#D9B48A';
  const potBody = P.planterBody || '#A9764E';
  const crownA = pick0(P.foliage, '#6FB56F');
  const crownB = pick0(P.leaf, '#57A45C');
  const bloom = pick0(P.petalPink, null);
  const bloomAlt = pick0(P.petalSun, null);
  const postColor = P.planterPost || '#C08A56';
  const archColor = P.planterRim || '#D9A066';

  const x0 = region.x0, x1 = region.x1, z0 = region.z0, z1 = region.z1;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const parts = [];
  // Stone border, a wide flat ring under the whole floor.
  parts.push(part('rbox', [w + 0.7, 0.42, d + 0.7, 0.1], border, { x: cx, y: -0.24, z: cz }));
  // Gap-colour base slab, then the surface on top. `region.floor` picks which surface: 'deck' is
  // the terrace's plank strips (unchanged, so the terrace renders byte-identically); 'tile' is the
  // spa's — a 1 m checker, echoing buildStatic's own interior floor so the spa reads as ROOM
  // rather than as a second deck, at the same one-merged-mesh cost.
  parts.push(part('box', [w, 0.05, d], base, { x: cx, y: -0.05, z: cz }));
  if (region.floor === 'tile') {
    const cols = Math.max(1, Math.round(w)), rowsT = Math.max(1, Math.round(d));
    const tw = w / cols, td = d / rowsT;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rowsT; j++) {
        parts.push(part('box', [tw - 0.05, 0.09, td - 0.05], (i + j) & 1 ? plank : border,
          { x: x0 + (i + 0.5) * tw, y: 0.0, z: z0 + (j + 0.5) * td }));
      }
    }
  } else {
    const plankD = 0.42, gap = 0.06, step = plankD + gap;
    const rows = Math.max(1, Math.floor((d + gap) / step));
    const usedD = rows * step - gap;
    const startZ = cz - usedD / 2 + plankD / 2;
    for (let i = 0; i < rows; i++) {
      parts.push(part('box', [w - 0.06, 0.09, plankD], plank, { x: cx, y: 0.0, z: startZ + i * step }));
    }
  }
  // Corner planters, echoing buildStatic's own corner planters above. The three blooms on top are
  // new with the seasonal pass: the crowns alone are two green spheres that read the same in every
  // season, and the west pair of these planters is in frame from the deck in both orientations.
  // Skipped entirely when no palette is supplied, so the un-palettised deck is byte-identical.
  //
  // SKIPPED ENTIRELY on a tile floor (the spa). These pots are render-only — they contribute no
  // nav or collision box — so a station authored near a corner sits straight through one. The
  // terrace's corners happen to be empty; the spa's north-west corner is bath1. Rather than
  // authoring the spa's stations around invisible geometry, the spa gets a real `planters` STATION
  // (blocking, in the lounge corner) and this loop stands down.
  const inset = 0.9;
  const cornerPots = region.floor === 'tile' ? [] : [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x0 + inset, z1 - inset], [x1 - inset, z1 - inset]];
  for (const [px, pz] of cornerPots) {
    parts.push(part('cyl', [0.3, 0.24, 0.46, 10], potBody, { x: px, y: 0.19, z: pz }));
    parts.push(part('sph', [0.5, 9], crownA, { x: px, y: 0.82, z: pz }));
    parts.push(part('sph', [0.35, 9], crownB, { x: px + 0.22, y: 1.08, z: pz - 0.1 }));
    if (bloom) {
      for (let i = 0; i < 3; i++) {
        const a = 0.6 + i * 2.1;
        parts.push(part('sph', [0.13, 6], i === 1 ? (bloomAlt || bloom) : bloom,
          { x: px + Math.cos(a) * 0.3, y: 1.12 + (i & 1) * 0.12, z: pz + Math.sin(a) * 0.3, sy: 0.75 }));
      }
    }
  }
  // Gate arch, straddling this region's own gate. Batch 4b: derived from regionEdge rather than
  // hard-coded to "x 0, just north of z0", so the spa's arch stands across the EAST fence facing
  // west with no second copy of this block. halfGate is the walkable gap plus 0.15 m of post, so
  // the posts land just OUTSIDE the lane instead of inside it — at the shipped literal 1.35 they
  // stood in the middle of a 2.4 m half-gap and actors walked straight through them.
  const edge = regionEdge(region, area);
  const archH = 2.5;
  if (edge) {
    const halfGate = edge.gapHalf + 0.15;
    if (edge.axis === 'z') {
      const gateX = edge.gapCentre, gateZ = z0 - 0.2;
      parts.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX - halfGate, y: archH / 2 - 0.1, z: gateZ }));
      parts.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX + halfGate, y: archH / 2 - 0.1, z: gateZ }));
      parts.push(part('box', [halfGate * 2 + 0.3, 0.18, 0.18], postColor, { x: gateX, y: archH - 0.1, z: gateZ }));
      parts.push(part('box', [halfGate * 2 + 0.2, 0.4, 0.05], archColor, { x: gateX, y: archH + 0.05, z: gateZ }));
    } else {
      const gateZ = edge.gapCentre, gateX = x0 + 0.2;
      parts.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX, y: archH / 2 - 0.1, z: gateZ - halfGate }));
      parts.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX, y: archH / 2 - 0.1, z: gateZ + halfGate }));
      parts.push(part('box', [0.18, 0.18, halfGate * 2 + 0.3], postColor, { x: gateX, y: archH - 0.1, z: gateZ }));
      parts.push(part('box', [0.05, 0.4, halfGate * 2 + 0.2], archColor, { x: gateX, y: archH + 0.05, z: gateZ }));
    }
  }
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
// ── Spa station meshes (plan 3.9) ────────────────────────────────────────────────────────────────
// All five are authored in LOCAL space with +z forward (the same convention every other station
// mesh here uses, so systems/visuals.js's existing rot handling applies unchanged), and all are
// one merged draw call each. They are sized to the fw/fd their data/area1.js rows declare, so the
// silhouette matches the footprint nav actually blocks — the mismatch that made Batch 1's décor
// look walkable when it wasn't.

// groom1 — a raised grooming table with a brush resting on it and a hose coil beneath. The brush
// is the read: it is the verb (plan 3.9's "brush hold"), and it is the one part high enough and
// coloured strongly enough to be legible at the play camera's pitch.
export function groomTableMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.3, 0.12, 0.9, 0.04], '#EAF6FF', { y: 0.86 }),                 // padded top
    part('box', [1.24, 0.06, 0.84], '#CFE7F5', { y: 0.93 }),                      // wipe-clean mat
    part('cyl', [0.09, 0.11, 0.8, 8], C.metal, { y: 0.4 }),                       // column
    part('cyl', [0.42, 0.42, 0.07, 12], C.metal, { y: 0.04 }),                    // base plate
    part('rbox', [0.3, 0.09, 0.13, 0.03], C.wood, { x: 0.42, y: 1.0, z: 0.2, ry: 0.35 }),  // brush back
    ...[-0.09, 0, 0.09].map(o => part('box', [0.2, 0.07, 0.02], C.ink, { x: 0.42 + o * 0.34, y: 0.94, z: 0.2 + o, ry: 0.35 })), // bristles
    part('cyl', [0.19, 0.19, 0.08, 12], '#7FB8D8', { y: 0.2, z: -0.3, rx: Math.PI / 2 }),   // hose coil
  ]));
  return g;
}
// bath1 — an open tub on legs with a foam line and a raised tap. Deliberately NOT a closed box:
// the pet has to be visible sitting in it once the content agents put one there.
export function bathTubMesh() {
  const g = new THREE.Group();
  const p = [
    part('cyl', [0.56, 0.5, 0.5, 14], '#EAF6FF', { y: 0.55 }),                    // tub body
    part('cyl', [0.5, 0.5, 0.06, 14], '#8FD3EE', { y: 0.72 }),                    // water
    part('cyl', [0.46, 0.46, 0.05, 14], '#FFFFFF', { y: 0.76 }),                  // foam
    part('cyl', [0.6, 0.6, 0.06, 14], C.metal, { y: 0.8 }),                       // rim
    part('cyl', [0.05, 0.05, 0.42, 8], C.metal, { y: 1.0, z: -0.52 }),            // tap riser
    part('box', [0.06, 0.06, 0.26], C.metal, { y: 1.19, z: -0.4 }),               // spout
    part('sph', [0.09, 8], '#FFFFFF', { x: 0.22, y: 0.92, z: 0.12, sy: 0.85 }),   // a stray suds blob
  ];
  for (const x of [-0.36, 0.36]) for (const z of [-0.36, 0.36]) {
    p.push(part('cyl', [0.05, 0.05, 0.6, 6], C.metal, { x, y: 0.3, z }));         // legs
  }
  g.add(mesh(p));
  return g;
}
// waterTank1 — pantryMesh's silhouette (a low plinth with two containers) rebuilt as a plumbed
// tank, so the spa's supply point reads as a sibling of the pantry and the cold pantry rather than
// as a new kind of object. Same trick coldPantryMesh already uses for the ice cream lane.
export function waterTankMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.34, 0.42, 0.07, 10], C.metal, { y: 0.035 }),                   // plinth
    part('cyl', [0.3, 0.3, 0.78, 12], '#BFEFFA', { y: 0.46 }),                    // tank
    part('cyl', [0.32, 0.32, 0.07, 12], C.metal, { y: 0.86 }),                    // lid
    part('cyl', [0.26, 0.26, 0.05, 12], '#8FD3EE', { y: 0.83 }),                  // water line
    part('cyl', [0.05, 0.05, 0.2, 8], C.metal, { y: 0.28, z: 0.3, rx: Math.PI / 2 }),  // spigot
    part('box', [0.14, 0.05, 0.05], C.metal, { y: 0.34, z: 0.36 }),               // spigot handle
  ]));
  return g;
}
// boutique1 — a shop rack: a frame, two hanging rails of accessory swatches and a shelf of boxes.
// Its own colour block (coral/violet swatches) is what separates it from the spa's blue-and-white
// wet stations from across the hall.
export function boutiqueRackMesh() {
  const g = new THREE.Group();
  const p = [
    part('box', [1.9, 0.09, 0.7], C.wood, { y: 0.06 }),                           // base
    part('box', [1.9, 0.08, 0.7], C.wood, { y: 0.92 }),                           // shelf
    part('cyl', [0.05, 0.05, 1.9, 8], C.woodDark, { x: -0.9, y: 0.95 }),
    part('cyl', [0.05, 0.05, 1.9, 8], C.woodDark, { x: 0.9, y: 0.95 }),
    part('cyl', [0.03, 0.03, 1.8, 8], C.metal, { y: 1.5, rz: Math.PI / 2 }),      // hanging rail
  ];
  const swatch = ['#F08AA8', '#B48CF2', '#6EC6FF', '#FFD166', '#8FD3EE'];
  swatch.forEach((hex, i) => {
    const x = -0.72 + i * 0.36;
    p.push(part('box', [0.26, 0.42, 0.04], hex, { x, y: 1.24 }));                 // hanging item
    p.push(part('cyl', [0.05, 0.05, 0.02, 8], C.metal, { x, y: 1.48, rx: Math.PI / 2 }));  // hook
  });
  for (let i = 0; i < 3; i++) p.push(part('rbox', [0.4, 0.24, 0.4, 0.04], i & 1 ? C.cream : C.coral, { x: -0.6 + i * 0.6, y: 1.08 }));
  g.add(mesh(p));
  return g;
}
// planters — the spa's décor cluster (three pots of different heights). A STATION, not part of
// buildRegion's floor, precisely so it blocks: buildRegion's own corner pots are render-only and a
// station can be authored on top of one, which is why the tile floor skips them (see buildRegion).
export function planterClusterMesh() {
  const g = new THREE.Group();
  const p = [];
  for (const [x, z, s] of [[-0.26, -0.1, 1.0], [0.26, 0.12, 0.78], [0.02, 0.34, 0.6]]) {
    p.push(part('cyl', [0.24 * s, 0.19 * s, 0.42 * s, 10], '#A9764E', { x, y: 0.21 * s, z }));
    p.push(part('cyl', [0.26 * s, 0.26 * s, 0.06 * s, 10], '#C08A56', { x, y: 0.44 * s, z }));
    p.push(part('sph', [0.34 * s, 8], C.plant, { x, y: 0.72 * s, z }));
    p.push(part('sph', [0.22 * s, 8], C.plantDark, { x: x + 0.16 * s, y: 0.92 * s, z: z - 0.07 * s }));
  }
  g.add(mesh(p));
  return g;
}
// spaSeat1-3 — a lounge seat for the owner waiting while their pet is pampered: a low bench with a
// cushion and a side table, in place of the café's round table. Same local convention as
// tableMesh (the human sits at +z 1.05, the pet waits at right 0.6), so seat.pair geometry and
// every seated-guest system read it exactly as they read an interior table.
export function spaLoungeMesh() {
  const g = new THREE.Group();
  const p = [
    part('rbox', [1.3, 0.16, 0.66, 0.05], C.wood, { y: 0.42 }),                   // bench slab
    part('rbox', [1.24, 0.12, 0.6, 0.05], '#EAF6FF', { y: 0.55 }),                // cushion
    part('rbox', [1.3, 0.5, 0.12, 0.04], C.wood, { y: 0.75, z: -0.3 }),           // low back
    part('cyl', [0.26, 0.24, 0.5, 10], C.woodDark, { x: 0.82, y: 0.25, z: 0.2 }), // side table
    part('cyl', [0.3, 0.3, 0.06, 12], C.cream, { x: 0.82, y: 0.53, z: 0.2 }),     // its top
    part('cyl', [0.09, 0.09, 0.12, 10], '#8FD3EE', { x: 0.82, y: 0.6, z: 0.2 }),  // a glass of water
    part('cyl', [0.1, 0.13, 0.06, 12], C.pink, { x: 0.6, y: 0.03, z: 1.05 }),     // pet bowl, matching seat.pair.pet
  ];
  for (const x of [-0.52, 0.52]) for (const z of [-0.22, 0.22]) {
    p.push(part('box', [0.1, 0.36, 0.1], C.woodDark, { x, y: 0.16, z }));         // legs
  }
  g.add(mesh(p));
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
