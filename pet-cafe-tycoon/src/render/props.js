// src/render/props.js
import * as THREE from 'three';
import { part, mesh, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial, gradientMap } from './palette.js';
import { grainAtlas, TILES } from './grain.js';
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

// The paved ground around the café, as rectangles: {x0, x1, z0, z1, top}. buildStatic draws them
// and environment.js keeps its lawn, tufts, beds and trees off them, so the two can never disagree
// about where the street is (a tuft used to poke up through the west street, a flower bed sat on it).
//   north     runs on past the east lot into the fog instead of stopping mid-lawn at x 14
//   west      runs down past the terrace to the garden fence (z 17.6) instead of stopping at z 11
//   sidewalk  at y 0, the café floor's own level, from the north corner to the terrace's south edge:
//             guests spawn at x -11.5 and walk at y 0, and the street top is -0.25, so every arrival
//             used to hover 25 cm above the pavement
export function groundCutouts(area) {
  const W = area.size.w, D = area.size.d;
  const terrace = (area.regions || []).find(r => r.id === 'terrace');
  const walkEnd = Math.max(D / 2 + 0.3, terrace ? terrace.z1 + 0.35 : 0);
  return {
    plinth: { x0: -W / 2 - 0.3, x1: W / 2 + 0.3, z0: -D / 2 - 0.3, z1: D / 2 + 0.3, top: 0 },
    north: { x0: -W / 2 - 6, x1: 46, z0: -D / 2 - 6, z1: -D / 2, top: -0.25 },
    west: { x0: -W / 2 - 6, x1: -W / 2, z0: -D / 2, z1: 17.2, top: -0.25 },
    sidewalk: { x0: -W / 2 - 2.2, x1: -W / 2, z0: -D / 2, z1: walkEnd, top: 0 },
  };
}
const slab = (r, h, hex) => part('box', [r.x1 - r.x0, h, r.z1 - r.z0], hex, { x: (r.x0 + r.x1) / 2, y: r.top - h / 2, z: (r.z0 + r.z1) / 2 });

// The café floor: flat quads, one per 1 m tile, lying FLUSH on one slab. They used to be 280 boxes
// with 2 cm gaps between them, and at play distance a gap is narrower than a pixel: the depth-outline
// pass (post.js) caught it on some rows and not others, so thin diagonal lines crawled across the
// floor whenever the camera moved a centimetre. With no gap there is no depth step to find. The joint
// is in the texture now (grain.js paintTile draws half of it along every edge), where mipmapping
// blends it instead of aliasing it. 560 triangles, against 3,360 for the boxes.
function tileFloor(W, D) {
  const n = W * D * 6, t = TILES.tile;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const cA = new THREE.Color(C.floorA), cB = new THREE.Color(C.floorB);
  let k = 0;
  const put = (x, z, u, v, c) => {
    pos[k * 3] = x; pos[k * 3 + 2] = z; nor[k * 3 + 1] = 1;
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    uv[k * 2] = t.u0 + u * t.du; uv[k * 2 + 1] = t.v0 + v * t.dv; k++;
  };
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) {
    const x0 = i - W / 2, z0 = j - D / 2, x1 = x0 + 1, z1 = z0 + 1, c = (i + j) & 1 ? cA : cB;
    put(x0, z0, 0, 0, c); put(x0, z1, 0, 1, c); put(x1, z1, 1, 1, c);
    put(x0, z0, 0, 0, c); put(x1, z1, 1, 1, c); put(x1, z0, 1, 0, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function buildStatic(area) {
  const W = area.size.w, D = area.size.d, P = [];
  P.push(part('box', [90, 0.2, 90], '#CDE9B8', { y: -0.6 }));                                             // ground slab (sky never in frame at this pitch)
  // The floor slab stops 2 mm under the tiles, so its top is never drawn against them.
  P.push(part('box', [W, 0.3, D], C.floorB, { y: -0.152 }));
  P.push(tileFloor(W, D));
  P.push(part('rbox', [W + 0.6, 0.5, D + 0.6, 0.12], C.wood, { y: -0.45, tex: 'wood' }));                         // wooden plinth
  const ground = groundCutouts(area);
  P.push(slab(ground.north, 0.2, C.street));
  P.push(slab(ground.west, 0.2, C.street));
  // Pale paving on a deep base, so its street side reads as a kerb, and a kerb stone 1 cm proud of
  // the paving along the road edge.
  const walk = ground.sidewalk;
  P.push(slab(walk, 0.47, '#ECE5DA'));
  P.push(part('box', [0.16, 0.34, walk.z1 - walk.z0], '#D6CEC2', { x: walk.x0 + 0.06, y: -0.16, z: (walk.z0 + walk.z1) / 2 }));
  // north wall with three windows, west wall with a door gap
  P.push(part('box', [W, 3, 0.4], C.wall, { y: 1.5, z: -D / 2, tex: 'plaster' }));
  for (const x of [-5, 0, 5]) { P.push(part('box', [1.8, 1.3, 0.5], '#DDF6FF', { x, y: 1.7, z: -D / 2 })); P.push(part('box', [2.0, 0.12, 0.6], C.cream, { x, y: 1.0, z: -D / 2 })); }
  const dz = area.door.z;
  P.push(part('box', [0.4, 3, (dz - 1.2) + D / 2], C.wall, { x: -W / 2, y: 1.5, z: ((dz - 1.2) + (-D / 2)) / 2, tex: 'plaster' }));   // west wall north part
  P.push(part('box', [0.4, 3, D / 2 - (dz + 1.2)], C.wall, { x: -W / 2, y: 1.5, z: ((dz + 1.2) + D / 2) / 2, tex: 'plaster' }));      // west wall south part (door gap around z=door)
  P.push(part('box', [0.4, 0.6, 2.4], C.wall, { x: -W / 2, y: 2.7, z: area.door.z }));                   // lintel
  P.push(part('box', [0.3, 3.2, 0.3], C.woodDark, { x: -W / 2, y: 1.6, z: area.door.z - 1.3 }));
  P.push(part('box', [0.3, 3.2, 0.3], C.woodDark, { x: -W / 2, y: 1.6, z: area.door.z + 1.3 }));
  // Skirting stands 2 cm proud of the wall's faces: at the wall's own 0.4 m those faces were exactly
  // coplanar with the plaster's, in a different colour. Its ends step 2 cm the same way — past the
  // wall's end where it meets the fence, and 2 cm SHORT of the door jambs, so none of it reaches into
  // the doorway.
  P.push(part('box', [0.44, 0.5, (dz - 1.2) + D / 2], C.wallDark, { x: -W / 2, y: 0.25, z: ((dz - 1.2) + (-D / 2)) / 2 - 0.02 }));  // skirting north part
  P.push(part('box', [0.44, 0.5, D / 2 - (dz + 1.2)], C.wallDark, { x: -W / 2, y: 0.25, z: ((dz + 1.2) + D / 2) / 2 + 0.02 }));    // skirting south part
  P.push(part('box', [W + 0.04, 0.5, 0.44], C.wallDark, { y: 0.25, z: -D / 2 }));
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
  g.name = 'static';   // tools/prop-overlap-smoke.js checks its poles, arms and plants against stations
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
  for (let i = 0; i < stripes; i++) (i & 1 ? partsB : partsA).push(part('box', [1.0, 0.06, 2.2], '#ffffff', { x: awX0 + i * 1.0 + 0.5, y: 0, z: 0, tex: 'fabric' }));
  partsA.push(part('box', [awW, 0.1, 0.25], '#ffffff', { y: -0.05, z: 1.1, tex: 'fabric' }));
  const matA = new THREE.MeshToonMaterial({ color: new THREE.Color(AWNING_SETS[0][0]), gradientMap: gradientMap(), map: grainAtlas() });
  const matB = new THREE.MeshToonMaterial({ color: new THREE.Color(AWNING_SETS[0][1]), gradientMap: gradientMap(), map: grainAtlas() });
  const awA = new THREE.Mesh(merge(partsA), matA); awA.receiveShadow = true;
  const awB = new THREE.Mesh(merge(partsB), matB); awB.receiveShadow = true;
  const aw = new THREE.Group(); aw.add(awA, awB);
  aw.position.set(awMid, 2.9, -D / 2 + 1.2); aw.rotation.x = 0.35; g.add(aw);
  g.awning = { setSet(idx) { const set = AWNING_SETS[Math.max(0, Math.min(AWNING_SETS.length - 1, idx))]; matA.color.set(set[0]); matB.color.set(set[1]); } };
  // Hung from the wall on folding arms, not stood on poles. The poles came down at x -5 and 7, one
  // through oven1's worktop and one through the blender, and any pole on that row lands in front of
  // SOME machine as the kitchen grows. Each arm runs from a plate high on the wall — above the
  // windows, the framed art and the bunting line — out to the awning's front bar, just under the
  // fabric, at x positions clear of the three windows and of the pennants either side.
  const arms = [];
  const wallZ = -D / 2 + 0.2, plateY = 2.62;
  const frontZ = aw.position.z + Math.cos(aw.rotation.x) * 1.0;
  const frontY = aw.position.y - Math.sin(aw.rotation.x) * 1.0 - 0.07;
  for (const x of [awX0 + 0.2, awMid + 0.35, awX1 - 0.2]) {
    arms.push(part('box', [0.12, 0.34, 0.05], C.metal, { x, y: plateY + 0.1, z: wallZ + 0.025 }));
    const dy = frontY - plateY, dzA = frontZ - wallZ, len = Math.hypot(dy, dzA);
    arms.push(part('cyl', [0.028, 0.028, len, 6], C.metal, { x, y: (plateY + frontY) / 2, z: (wallZ + frontZ) / 2, rx: Math.atan2(dzA, dy) }));
  }
  g.add(mesh(arms, { cast: false }));
  return g;
}

// ── the self-serve stand dressing (ship plan §1.9, Batch G item 3) ──────────────────────────────
// From the play camera barIce read as "a plain white slab": it is the same counterMesh every
// interior display uses, but it faces WEST, so the camera (fixed at yaw 35°, looking from +x/+z)
// only ever sees its back panel and its end — cream on cream with nothing on either. The interior
// counters get away with it because the eye reads them off their coral front strip and the cakes
// piled on top, both of which face the room.
//
// A stand gets the same treatment the other terrace stations got: a body in the ice cream pastels
// (matching icecreamMesh's cabinet, so machine and counter read as one shop), and a striped canopy
// on two posts over the top — a silhouette that says "stand" from every side, above head height,
// where no guest queueing at it can hide it. The posts stand at local x ±1.1, INSIDE the counter
// top's own ±1.25, so nothing the nav grid or the queue corridor measures moves; the canopy itself
// is above geo.js's body band, so it adds no collision at all.
const STAND_BODY = '#FFC7D9', STAND_STRIPE = '#FF9DBB';
function standCanopyParts() {
  const P = [];
  for (const x of [-1.1, 1.1]) {
    P.push(part('cyl', [0.045, 0.045, 1.28, 6], C.cream, { x, y: 1.66, z: -0.1 }));
  }
  // A striped valance angled forward, built the way buildStatic's awning is: one strip per stripe,
  // all at the same height and depth, so they are coplanar by construction and no strip can float
  // above or sink into the one beside it.
  for (let i = 0; i < 12; i++) {
    P.push(part('box', [0.2, 0.07, 0.72], i & 1 ? STAND_STRIPE : C.cream,
      { x: -1.1 + i * 0.2 + 0.1, y: 2.3, z: 0.12, rx: 0.3, tex: 'fabric' }));
  }
  P.push(part('box', [2.4, 0.14, 0.05], STAND_STRIPE, { y: 2.19, z: 0.44 }));
  for (let i = 0; i < 7; i++) {
    P.push(part('cyl', [0.09, 0.09, 0.04, 10], STAND_STRIPE, { x: -1.08 + i * 0.36, y: 2.12, z: 0.44, rx: Math.PI / 2 }));
  }
  // A cone hung under the ridge, point down: the stand's own shop sign, readable from both ends.
  P.push(part('cyl', [0.04, 0.04, 0.26, 6], C.metal, { y: 2.06, z: -0.34 }));
  P.push(part('cyl', [0.17, 0.015, 0.34, 12], '#E0A560', { y: 1.72, z: -0.34, tex: 'fabric' }));
  P.push(part('sph', [0.19, 10], '#FFF6FA', { y: 1.92, z: -0.34, sy: 0.55 }));
  P.push(part('sph', [0.14, 10], STAND_BODY, { y: 2.03, z: -0.34, sy: 0.6 }));
  P.push(part('sph', [0.05, 8], '#E0405F', { y: 2.12, z: -0.34 }));
  // A tub of spare cones standing on the counter's far end, where the item stack never reaches.
  P.push(part('cyl', [0.16, 0.13, 0.22, 10], C.metal, { x: -1.02, y: 1.19, z: -0.18, tex: 'metal' }));
  for (const [dx, dz] of [[-0.05, -0.05], [0.05, -0.02], [0, 0.06]]) {
    P.push(part('cone', [0.055, 0.28, 8], '#E0A560', { x: -1.02 + dx, y: 1.42, z: -0.18 + dz, tex: 'fabric' }));
  }
  return P;
}
export function counterMesh(st = null) {
  const stand = !!(st && st.selfServe);
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [2.4, 1.0, 1.0, 0.08], stand ? STAND_BODY : C.cream, { y: 0.5 }),
    part('box', [2.5, 0.12, 1.1], C.wood, { y: 1.02, tex: 'wood' }),
    part('box', [2.2, 0.5, 0.06], stand ? STAND_STRIPE : C.coral, { y: 0.5, z: 0.52 }),
    ...(stand ? standCanopyParts() : []),
    // The glass used to be a 0.42 m DEEP box standing on the back half of the counter top, with a
    // wood lid over it. Together they ate 0.48 m of the 1.1 m top, which is why the item grid was
    // crammed into the strip that was left and its rows came out 0.14 m apart — less than one cookie
    // wide, so rows 2, 3 and 4 landed inside row 1 and the owner's report read "the second row is
    // squeezed into the first, you can barely tell there are two rows". The glass is a thin BACK
    // PANEL now and the lid is a cornice on top of it, which gives the whole top back to the display.
    part('box', [2.3, 0.62, 0.06], '#DDF6FF', { y: 1.42, z: -0.5 }),      // glass back panel
    part('box', [2.4, 0.08, 0.18], C.wood, { y: 1.77, z: -0.5, tex: 'wood' }),          // cornice
    // Pale paper (near-white) against C.wood's mid-tan is what keeps a '#D9A066'-era cookie visible
    // on a '#D9A066' counter top — the separation is by VALUE, so it holds for the couple of
    // products (see economyConfig.js) that stayed close to wood in hue.
    // Two deep steps, tops at 1.11 and 1.27. The case holds twelve at a glance and doubles UP, not
    // back, as it is starred (see systems/visuals.js) — which is why two rows 0.42 m apart beat four
    // rows crammed into the same top. Occlusion was never the problem at this camera (52 degrees
    // down, a row further back clears the row in front of it easily). SCREEN CROWDING was: a 0.22 m
    // smoothie stepped back only 0.14 m overlapped the smoothie in front of it outright. 0.42 m of
    // depth plus a 0.16 m lift clears the tallest product this game sells with room to spare.
    // The back step warms slightly so the two read as steps rather than one slab.
    part('box', [2.24, 0.03, 0.32], '#FFFDF7', { y: 1.095, z: 0.39, tex: 'paper' }),
    part('box', [2.24, 0.19, 0.64], '#FFF7EC', { y: 1.175, z: -0.10, tex: 'paper' }),
  ]));
  // Twelve positions — DISPLAY_CAP_LEVELS' BASE (economy.js: [12,16,20,24]) — as 6 columns across
  // two stepped rows. 0.36 m between columns clears the widest product the game sells (a coffee cup
  // with its handle is 0.31 m). Each row sits 0.08 m above its own step's top face, the clearance
  // itemGeoFor()'s lowest point (the cupcake's cup, -0.075 local) was always sized against.
  // The upgrades above twelve do not add a third and fourth row, they stack a second layer on these
  // same twelve — systems/visuals.js measures each product's own height and lifts layer 2 by it —
  // so a starred case reads as a case piled high rather than as more rows crushed into the top.
  // Rows stay FRONT-first (r=0 nearest the guest) and the loop fills a whole row before starting
  // the next, so the stack, which lights up slots 0..stock-1 in order, fills the front first.
  const ROW_Y = [1.19, 1.35], ROW_Z = [0.40, -0.02];
  g.slots = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) g.slots.push(new THREE.Vector3(-0.9 + c * 0.36, ROW_Y[r], ROW_Z[r]));
  // small chalkboard bar on the front — its own mesh so setProduct can swap the color without rebuilding the merged counter geometry
  const barMat = new THREE.MeshToonMaterial({ color: new THREE.Color(PRODUCTS.cookie.color) });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.04), barMat); bar.position.set(0.9, 0.72, 0.54); bar.receiveShadow = true; g.add(bar);
  g.setProduct = key => { bar.material.color.set((PRODUCTS[key] || PRODUCTS.cookie).color); };
  return g;
}
export function ovenMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.6, 1.3, 1.2, 0.08], C.metal, { y: 0.65, tex: 'metal' }),
    part('box', [1.1, 0.6, 0.05], C.ink, { y: 0.65, z: 0.6 }),
    part('box', [1.0, 0.5, 0.02], '#FFB06B', { y: 0.65, z: 0.63 }),        // warm window
    part('box', [1.7, 0.1, 1.3], C.woodDark, { y: 1.35, tex: 'wood' }),
    part('cyl', [0.12, 0.12, 0.9, 8], C.ink, { x: 0.4, y: 1.85, z: -0.3 }),
    part('box', [0.9, 0.1, 0.5], C.wood, { y: 0.35, z: 0.95, tex: 'wood' }),            // output tray
  ]));
  g.outSlot = new THREE.Vector3(0, 0.45, 0.95);
  return g;
}
export function checkoutMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.6, 1.0, 0.9, 0.08], C.accent, { y: 0.5 }),
    part('box', [1.7, 0.12, 1.0], C.wood, { y: 1.02, tex: 'wood' }),
    part('rbox', [0.6, 0.5, 0.4, 0.05], C.ink, { x: 0.3, y: 1.3, z: -0.1, tex: 'metal' }),
    part('box', [0.5, 0.35, 0.05], '#9BF6FF', { x: 0.3, y: 1.32, z: 0.11 }),
  ]));
  return g;
}
function chairParts(angle, dist = 0.75) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rot = (x, z) => ({ x: x * cos + z * sin, z: -x * sin + z * cos });
  const seat = rot(0, dist), back = rot(0, dist + 0.23), legA = rot(0.18, dist - 0.15), legB = rot(-0.18, dist - 0.15);
  return [
    part('rbox', [0.5, 0.1, 0.5, 0.04], C.coral, { x: seat.x, y: 0.42, z: seat.z, ry: angle, tex: 'fabric' }),
    part('box', [0.45, 0.6, 0.08], C.coral, { x: back.x, y: 0.7, z: back.z, ry: angle, tex: 'fabric' }),
    part('cyl', [0.04, 0.04, 0.4, 6], C.woodDark, { x: legA.x, y: 0.2, z: legA.z }),
    part('cyl', [0.04, 0.04, 0.4, 6], C.woodDark, { x: legB.x, y: 0.2, z: legB.z }),
  ];
}
export function tableMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.7, 0.7, 0.08, 16], C.wood, { y: 0.72, tex: 'wood' }), part('cyl', [0.08, 0.12, 0.7, 8], C.woodDark, { y: 0.36 }),
    part('cyl', [0.45, 0.45, 0.06, 12], C.woodDark, { y: 0.03, tex: 'wood' }),
    ...chairParts(0, 1.05),           // south chair (human side, matches seat.pair.human's 1.05m offset — C1)
    part('cyl', [0.1, 0.13, 0.06, 12], C.pink, { x: 0.6, y: 0.03, z: 1.05 }),   // pet bowl (matches seat.pair.pet's offset — C1); no chair on the pet's side
  ]));
  return g;
}
export function hireDeskMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('rbox', [1.0, 0.9, 1.6, 0.08], C.wood, { y: 0.45, tex: 'wood' }),
    part('box', [1.05, 0.08, 1.65], C.woodDark, { y: 0.94, tex: 'wood' }),
    part('box', [0.32, 0.02, 0.24], C.cream, { x: -0.1, y: 1.0, z: 0.5 }),          // clipboard
    part('box', [0.32, 0.16, 0.02], C.ink, { x: -0.1, y: 1.03, z: 0.38 }),          // clip
    part('cyl', [0.05, 0.05, 1.5, 8], C.woodDark, { x: 0.3, y: 1.65, z: -0.55 }),   // sign post
    part('box', [0.7, 0.5, 0.05], C.cream, { x: 0.3, y: 2.2, z: -0.55, tex: 'paper' }),           // sign board
    part('box', [0.7, 0.12, 0.06], C.coral, { x: 0.3, y: 2.4, z: -0.545 }),         // coral header stripe
  ]));
  return g;
}
// ── station signs (ship plan §1.9) ──────────────────────────────────────────────────────────────
// What this replaces: `chalkboardMesh`, a small BLACK board on a post standing at each station's
// front-LEFT corner, outside its footprint. Its only content was a DOM chip that faded in within
// 5 m, so from the play camera the room held twenty blank black lollipops — "what is this" clutter —
// one of them planted in the ★3 resident cat's bed, and each one its own mesh in both the main and
// the shadow pass (measured: 20 + 20 draw calls).
//
// Three things change, and the first two are why the sign can exist at all:
//
//   1. THE PICTOGRAM IS IN THE GEOMETRY. grain.js paints each glyph into the shared detail atlas,
//      so the board face carries it on the world's one MeshToonMaterial. It says what the station is
//      from any distance, with no text and no DOM.
//   2. IT IS PARTS, NOT A MESH. signParts() hands back geometry that systems/visuals.js merges into
//      the station's OWN mesh, so a sign costs zero draw calls instead of two.
//   3. IT STANDS INSIDE THE STATION'S OWN FOOTPRINT, not beside it. Ground a station occupies is
//      already ground nobody walks on and nothing else is placed on, so a sign there can never be in
//      a walkway, a queue slot or a resident pet's bed. On a tall station the post is swallowed by
//      the body and only the board shows, which is what a shop sign should look like anyway.
//
// `faceYaw` is the WORLD yaw the board turns to (visuals.js passes the camera's own), because the
// camera never rotates: a sign that faced each station's own front would show the player the back of
// half of them, and the atlas glyph mirrored.
const SIGN_POST_TOP = 1.66;
const SIGN_BOARD_Y = 1.92;
const SIGN_W = 0.70, SIGN_H = 0.52;
// The board is TILTED BACK, like a menu stand, because the camera looks down at 52°. Stood upright
// it was seen 52° off its own normal, so a 0.52 m board projected 21 px tall against 48 px wide and
// the trilinear filter picked a mip off the compressed axis: measured on a 4x crop of a real frame,
// the cupcake glyph came out as a soft grey blob. At 30° the board is within 22° of face-on, the
// glyph is nearly square on screen, and it still reads as a sign rather than as a tabletop.
//
// 30° and not more, for a second reason: geo.js box-projects UVs by dominant normal axis, and past
// ~37° the board's normal tips into the "faces up" branch, which would map the glyph off the wrong
// pair of axes.
const SIGN_TILT = 30 * Math.PI / 180;
export function signParts(glyph, lx = 0, lz = 0, faceYaw = 0) {
  if (!glyph || !TILES['sign:' + glyph]) return null;
  const ct = Math.cos(SIGN_TILT), st = Math.sin(SIGN_TILT);
  const nx = Math.sin(faceYaw) * ct, ny = st, nz = Math.cos(faceYaw) * ct;
  // Built facing +z and UNROTATED, then turned afterwards. part() projects its UVs before it
  // translates but AFTER it rotates, and the projection picks its axes from the world normal — so a
  // board authored already-turned came out with its glyph mirrored on every station whose rotation
  // pushed cos(faceYaw - rot) negative (the garden stand, the treat bowl, the fruit bushes). Rotating
  // the finished geometry moves positions and normals and leaves the UVs exactly as projected.
  const turn = g => { g.rotateX(-SIGN_TILT); g.rotateY(faceYaw); return g; };
  const frame = turn(part('rbox', [SIGN_W, SIGN_H, 0.06, 0.03], C.woodDark));
  frame.translate(lx, SIGN_BOARD_Y, lz);
  // The face stands 1.5 cm proud of its frame along the board's own normal, so the two never share
  // a depth, and it is the only part in the game that addresses a sign tile.
  const face = turn(part('box', [SIGN_W - 0.09, SIGN_H - 0.09, 0.012], '#FFF8E7', { tex: 'sign:' + glyph }));
  face.translate(lx + nx * 0.037, SIGN_BOARD_Y + ny * 0.037, lz + nz * 0.037);
  return [
    part('cyl', [0.032, 0.032, SIGN_POST_TOP, 6], C.woodDark, { x: lx, y: SIGN_POST_TOP / 2, z: lz }),
    frame,
    face,
  ];
}
/** Where signParts() puts the board, for tests and audits that need to know without building it. */
export const SIGN_GEOMETRY = Object.freeze({ boardY: SIGN_BOARD_Y, w: SIGN_W, h: SIGN_H, postTop: SIGN_POST_TOP });
// M3 T3: bowl/bush/coffee/storage/blender station props — simple merged meshes, +z front,
// behaviour lands in Task 4. bushMesh's three berries are a single InstancedMesh (one extra
// draw call per bush, not three) so setStage(0..3) can scale them independently without
// re-merging geometry every time a bush ripens.
export function bowlMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('cyl', [0.35, 0.3, 0.18, 14], C.pink, { y: 0.09, tex: 'ceramic' }),
    part('cyl', [0.28, 0.28, 0.05, 14], C.cream, { y: 0.16 }),
  ]));
  return g;
}
export function bushMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    part('sph', [0.45, 10], C.plant, { y: 0.4, tex: 'leaf' }),
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
    part('rbox',[.82,.66,.46,.06],'#458C87',{y:.55,z:-.08,tex:'metal'}),
    part('box',[.74,.18,.06],C.metal,{y:.57,z:.18}),
    part('rbox',[.85,.08,.65,.025],C.ink,{y:.08,z:.08}),
    part('box',[.8,.05,.5],C.metal,{y:.91,z:-.04,tex:'metal'}),
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
    part('sph', [0.3, 8], C.wood, { x: -0.2, y: 0.28, sy: 1.1, tex: 'paper' }),
    part('sph', [0.3, 8], C.woodDark, { x: 0.22, y: 0.28, sy: 1.1, tex: 'paper' }),
    part('box', [0.16, 0.06, 0.02], C.cream, { x: -0.2, y: 0.46, rz: 0.3 }),
    part('box', [0.16, 0.06, 0.02], C.cream, { x: 0.22, y: 0.46, rz: -0.3 }),
  ]));
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
// All five are deliberately cheap. There is no `rbox` anywhere below: RoundedBoxGeometry is the
// most expensive primitive geo.js offers and the scene already sits close to its ceiling. The whole
// set is under 1.4k triangles, against ~21k freed by the two placeholder residents §5.4's
// furniture list retires.
//
// None of the five casts a sun shadow (ship plan §1.9's budget): a bed, a basket, a hutch and a
// cushion are floor furniture whose whole shadow story is the contact shadow systems/residentPets.js
// already gives them, and every one of them was costing a second draw call in the shadow pass.
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
    part('cyl', [0.46, 0.46, 0.1, 12], C.cream, { y: 0.13, tex: 'fabric' }),
    ...rimRing(9, 0.45, 0.45, 0.17, 0.16, C.coral),
  ], { cast: false }));
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
    part('box', [1.7, 0.1, 0.8], C.wood, { y: 1.01, z: 0.1, tex: 'wood' }),                      // ledge, top 1.06
    part('box', [0.08, 0.3, 0.5], C.woodDark, { x: -0.7, y: 0.86 }),                // brackets, under the plank
    part('box', [0.08, 0.3, 0.5], C.woodDark, { x: 0.7, y: 0.86 }),
    part('sph', [0.44, 10], '#F2C4CE', { y: 1.14, z: 0.1, sy: 0.3, sz: 0.8, tex: 'fabric' }),      // pillow, top 1.27
    part('sph', [0.2, 8], C.wall, { x: -0.62, y: 1.16, z: 0.06, sy: 0.42, sz: 0.9 }), // spare cushion
  ], { cast: false }));
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
    part('box', [0.66, 0.09, 0.94], C.wood, { y: 1.005, z: 0.2, tex: 'wood' }),                   // top shelf, top 1.05
    part('cyl', [0.34, 0.34, 0.09, 12], '#F4C9D3', { y: 1.095, z: 0.2, sz: 1.35, tex: 'fabric' }),  // top cushion, top 1.14
    part('cyl', [0.014, 0.014, 0.26, 4], C.cream, { x: 0.28, y: 0.83, z: 0.5 }),     // toy string
    part('sph', [0.075, 6], C.coin, { x: 0.28, y: 0.67, z: 0.5 }),                   // dangling ball
  ], { cast: false }));
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
    part('cyl', [0.72, 0.66, 0.16, 14], C.wood, { y: 0.08, sx: 0.6, tex: 'fabric' }),
    part('cyl', [0.62, 0.62, 0.1, 12], C.wall, { y: 0.16, sx: 0.62, tex: 'fabric' }),               // blanket, top 0.21
    ...rimRing(11, 0.42, 0.62, 0.2, 0.16, C.wood),                                   // rim, top 0.36
  ], { cast: false }));
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
    part('box', [1.34, 0.09, 1.5], C.wood, { y: 0.305, tex: 'wood' }),                            // floor, top 0.35
    part('box', [1.34, 0.44, 0.07], C.wood, { y: 0.57, z: -0.745, tex: 'wood' }),                 // back wall
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
  g.add(mesh(p, { cast: false }));
  g.perch = new THREE.Vector3(0, 0.4, 0.22);
  return g;
}
// Task 4 carry props — small enough to sit on the owner/runner stack alongside (never mixed with,
// per the carry-slot rules in src/sim/carry.js) product items. Beans and kibble are the whole list
// (src/sim/supplies.js): the ice cream machine drinks nothing and the spa's water left with it.
export function sackMesh(kind = 'beans') {
  const g = new THREE.Group();
  const color = kind === 'kibble' ? C.wood : C.woodDark;
  const parts = [
    part('sph', [0.16, 8], color, { y: 0.16, sy: 1.25, tex: 'paper' }),
    part('cyl', [0.05, 0.08, 0.08, 8], C.cream, { y: 0.34 }),          // tied neck
  ];
  // A label so the two sacks are not the same brown lump: three beans, or a paw for the kibble.
  if (kind === 'kibble') parts.push(part('sph', [0.05, 7], '#8C6239', { y: 0.17, z: 0.15, sz: 0.4 }));
  else for (const x of [-0.05, 0, 0.05]) parts.push(part('sph', [0.022, 6], '#3E2A1F', { x, y: 0.19, z: 0.15, sz: 0.5 }));
  g.add(mesh(parts));
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
    part('cyl', [0.26, 0.26, 0.035, 16], C.cream, { y: 0.02, tex: 'ceramic' }),
    part('cyl', [0.25, 0.25, 0.006, 16], '#F0D9C4', { y: 0.041 }),                       // plate rim shadow
    // A second, smaller plate stacked slightly askew on the first -- how a bussed table actually
    // looks, not a second identical plate set neatly beside it.
    part('cyl', [0.2, 0.2, 0.03, 14], C.cream, { x: 0.04, y: 0.058, z: -0.03, tex: 'ceramic' }),
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
    parts.push(part('cyl',[.115,.09,.2,16],C.cream,{tex:'ceramic'}),part('cyl',[.099,.099,.008,16],key==='latte'?'#C99B69':'#422A20',{y:.103}));
    parts.push(part('box',[.09,.025,.035],C.cream,{x:.14,y:.065}),part('box',[.025,.12,.035],C.cream,{x:.177}),part('box',[.09,.025,.035],C.cream,{x:.14,y:-.055}));
    // A little milk paw distinguishes the latte from black coffee.
    if(key==='latte') for(const [x,z,r] of [[0,.02,.032],[-.044,-.025,.015],[0,-.04,.015],[.044,-.025,.015]]) parts.push(part('cyl',[r,r,.006,10],C.cream,{x,z,y:.11}));
  } else if (key === 'smoothie') {
    parts.push(part('cyl',[.11,.075,.22,12],color),part('cyl',[.12,.12,.025,12],C.cream,{y:.12}),part('cyl',[.012,.012,.17,6],'#F77F9A',{x:.025,y:.19,rz:-.22}),part('sph',[.045,8],'#D54879',{x:-.065,y:.15}));
  } else if(key === 'treat') {
    parts.push(part('rbox',[.2,.07,.08,.025],color));
    for(const x of [-.1,.1]) for(const z of [-.04,.04]) parts.push(part('sph',[.057,8],color,{x,z,sy:.7}));
  } else if (key === 'icecream') {
    // Owner report, day 18: "the ice cream counter lacks details — they look like pieces of
    // brownies." They WERE brownies. icecream, sundae and pupcup all fell through to the `else`
    // below, which is the BROWNIE geometry, tinted with each product's own colour — so a case of
    // #FFF0F5 ice cream rendered as a case of pale brownies with chocolate crumb on top.
    // A waffle cone under a scoop, a drizzle and a cherry. Fabric grain reads as the cone's waffle
    // at this size, the same trick the awning uses for canvas.
    parts.push(part('cyl',[.098,.014,.17,12],'#DFA662',{y:.005,tex:'fabric'}));
    parts.push(part('sph',[.108,10],color,{y:.125}));
    parts.push(part('sph',[.075,9],'#F6A8C0',{y:.172,sy:.5}));
    parts.push(part('sph',[.03,8],'#C83955',{y:.228}));
  } else if (key === 'sundae') {
    // The alt recipe on the same counter (world.js ALT_PRODUCT), so it has to read as a RICHER
    // version of the cone at a glance: a footed glass, two scoops, sauce and a cherry.
    parts.push(part('cyl',[.105,.052,.13,12],'#EAF6FF',{y:-.015,tex:'ceramic'}));
    parts.push(part('cyl',[.07,.07,.02,12],'#EAF6FF',{y:-.075,tex:'ceramic'}));
    parts.push(part('sph',[.094,10],color,{y:.075}));
    parts.push(part('sph',[.076,10],'#FFF6FA',{y:.145}));
    parts.push(part('sph',[.066,9],'#C4577E',{y:.178,sy:.42}));
    parts.push(part('sph',[.03,8],'#C83955',{y:.222}));
  } else if (key === 'pupcup') {
    // A pet portion: a small paper cup, a dollop, and a biscuit bone standing in it so it is never
    // mistaken for the guests' ice cream sold from the same terrace.
    parts.push(part('cyl',[.086,.062,.11,12],'#FFF6E8',{y:-.02,tex:'paper'}));
    parts.push(part('sph',[.084,10],color,{y:.048,sy:.85}));
    parts.push(part('rbox',[.03,.075,.022,.01],'#C9853F',{y:.12,rz:.22}));
    for (const s of [-1,1]) parts.push(part('sph',[.024,8],'#C9853F',{x:-.016*s,y:.12+.038*s}));
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
// over `region` (any future region reuses it) rather than hard-coded to the terrace. One merged mesh
// (cheap: a border ring, a base slab, N plank strips, a gate threshold, corner planters, the gate
// arch and — terrace only — the street entrance's arch and hedge).
//
// SEASONS. `palette` is optional and is one of environment.js's paletteForSeason(id) objects. It
// exists because, once the terrace is bought, this deck IS most of the default camera's frame:
// with the garden bands behind the camera, re-tinting the deck is the only way a season can change
// the colour temperature of the whole picture. Every fallback below is the literal this function
// shipped with, so calling it with no palette (or with a palette missing a key) renders exactly
// today's deck — the seasonal values live in environment.js's palette table, not here, so this
// file still owns no garden colour of its own.
export function buildRegion(area, region, palette = null) {
  const pieces = regionPieces(area, region, palette);
  const g = new THREE.Group();
  // No sun shadow (ship plan §1.9's peak budget). It is a FLOOR: the planks, the border and the
  // threshold lie flat on the ground and cast nothing a player can see, and the pots and the arch
  // that ride in the same merged mesh were dragging the whole 1.6k-triangle deck through the shadow
  // pass for two soft posts. The deck still receives, so everything standing on it is grounded.
  g.add(mesh([...pieces.base, ...pieces.rows.flatMap(r => r.parts), ...pieces.extras], { cast: false }));
  return g;
}

// The same floor, split the way the build reveal lays it (environment.js): the base (stone border,
// gap slab and the gate threshold), one merged geometry per plank row ordered outward from the gate,
// and the furniture that stands on it. Built only when a region is bought during play.
export function regionRevealPieces(area, region, palette = null) {
  const pieces = regionPieces(area, region, palette);
  return {
    base: merge(pieces.base),
    rows: pieces.rows.map(r => ({ geometry: merge(r.parts), along: r.along, cross: r.cross })),
    extras: pieces.extras.length ? merge(pieces.extras) : null,
    axis: pieces.axis,
  };
}

// Where the terrace's own street entrance is. data/area1.js authors it (plan §1.2); until it does,
// the plan's coordinates.
export function terraceDoorOf(area) {
  const d = area && area.terraceDoor;
  return d && Number.isFinite(d.x) && Number.isFinite(d.z) ? d : { x: -9.6, z: 12.6 };
}

function regionPieces(area, region, palette) {
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
  const edge = regionEdge(region, area);
  const axis = edge ? edge.axis : 'z';
  const baseParts = [], rows = [], extras = [];
  // The WALKING SURFACE IS y = 0, like the café floor. Everything else in the game — actors, contact
  // shadows, furniture feet, the photo pose mat, build outlines — already treats y 0 as the floor;
  // the planks used to stand 4.5 cm proud of it, so feet sank into them, every contact shadow lay
  // under the boards and the gate had a trench and a lip across the busiest path in the café.
  // Stone border, a wide flat ring under the whole floor, 8.5 cm below the walking surface and
  // 1.5 cm below the gap slab it runs under, so the two never share a depth.
  baseParts.push(part('rbox', [w + 0.7, 0.42, d + 0.7, 0.1], border, { x: cx, y: -0.295, z: cz }));
  // Gap-colour base slab, then the surface on top. `region.floor` picks which surface: 'deck' is
  // the terrace's plank strips; 'tile' is a 1 m checker echoing buildStatic's interior floor.
  baseParts.push(part('box', [w, 0.05, d], base, { x: cx, y: -0.095, z: cz }));
  let firstEdge, gap;
  if (region.floor === 'tile') {
    const cols = Math.max(1, Math.round(w)), rowsT = Math.max(1, Math.round(d));
    const tw = w / cols, td = d / rowsT;
    gap = 0.025;
    const lines = axis === 'x' ? cols : rowsT, across = axis === 'x' ? rowsT : cols;
    for (let a = 0; a < lines; a++) {
      const parts = [];
      for (let b = 0; b < across; b++) {
        const i = axis === 'x' ? a : b, j = axis === 'x' ? b : a;
        parts.push(part('box', [tw - 0.05, 0.09, td - 0.05], (i + j) & 1 ? plank : border,
          { x: x0 + (i + 0.5) * tw, y: -0.045, z: z0 + (j + 0.5) * td, tex: 'tile' }));
      }
      rows.push({ parts, along: axis === 'x' ? x0 + (a + 0.5) * tw : z0 + (a + 0.5) * td, cross: axis === 'x' ? cz : cx });
    }
    firstEdge = axis === 'x' ? x0 + 0.025 : z0 + 0.025;
  } else {
    const plankD = 0.42;
    gap = 0.06;
    const step = plankD + gap;
    const nRows = Math.max(1, Math.floor((d + gap) / step));
    const usedD = nRows * step - gap;
    const startZ = cz - usedD / 2 + plankD / 2;
    for (let i = 0; i < nRows; i++) {
      const z = startZ + i * step;
      rows.push({ parts: [part('box', [w - 0.06, 0.09, plankD], plank, { x: cx, y: -0.045, z, tex: 'wood' })], along: z, cross: cx });
    }
    firstEdge = startZ - plankD / 2;
  }
  // A south region's planks run parallel to its gate, so the reveal lays them away from it; the
  // rows come back ordered by distance from the gate line either way.
  if (edge) rows.sort((a, b) => Math.abs(a.along - edge.line) - Math.abs(b.along - edge.line));

  // Corner planters, echoing buildStatic's own corner planters above. The three blooms on top are
  // new with the seasonal pass: the crowns alone are two green spheres that read the same in every
  // season, and the west pair of these planters is in frame from the deck in both orientations.
  // Skipped entirely when no palette is supplied, so the un-palettised deck is byte-identical.
  //
  // SKIPPED ENTIRELY on a tile floor. These pots are render-only — they contribute no nav or
  // collision box — so a station authored near a corner sits straight through one. Every terrace
  // build that went into a corner — the ice cream machine (north-east), the corner table
  // (south-west), the restroom (south-east) — was authored after these pots and stood straight
  // through one (tools/prop-overlap-smoke.js measured 100, 98 and 147 of the pots' vertices inside
  // those three footprints). A corner that has a station authored in it — built yet or not — gets
  // no pot: an empty corner until the lane arrives beats a pot the lane is later built through.
  const inset = 0.9;
  const POT_REACH = 0.55;   // the crown's radius plus a little air
  const occupied = (px, pz) => (area && area.stations || []).some(st => {
    if (!st.fw || !st.fd || st.type === 'gate') return false;
    const c = Math.cos(st.rot || 0), s = Math.sin(st.rot || 0);
    const dx = px - st.x, dz = pz - st.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < st.fw / 2 + POT_REACH && Math.abs(lz) < st.fd / 2 + POT_REACH;
  });
  const cornerPots = region.floor === 'tile' ? [] : [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x0 + inset, z1 - inset], [x1 - inset, z1 - inset]]
    .filter(([px, pz]) => !occupied(px, pz));
  for (const [px, pz] of cornerPots) {
    extras.push(part('cyl', [0.3, 0.24, 0.46, 10], potBody, { x: px, y: 0.19, z: pz }));
    extras.push(part('sph', [0.5, 9], crownA, { x: px, y: 0.82, z: pz }));
    extras.push(part('sph', [0.35, 9], crownB, { x: px + 0.22, y: 1.08, z: pz - 0.1 }));
    if (bloom) {
      for (let i = 0; i < 3; i++) {
        const a = 0.6 + i * 2.1;
        extras.push(part('sph', [0.13, 6], i === 1 ? (bloomAlt || bloom) : bloom,
          { x: px + Math.cos(a) * 0.3, y: 1.12 + (i & 1) * 0.12, z: pz + Math.sin(a) * 0.3, sy: 0.75 }));
      }
    }
  }
  // Gate arch, straddling this region's own gate, derived from regionEdge. halfGate is the walkable
  // gap plus 0.15 m of post, so the posts land just OUTSIDE the lane instead of inside it.
  const archH = 2.5;
  if (edge) {
    const halfGate = edge.gapHalf + 0.15;
    if (edge.axis === 'z') {
      const gateX = edge.gapCentre, gateZ = z0 - 0.2;
      extras.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX - halfGate, y: archH / 2 - 0.1, z: gateZ }));
      extras.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX + halfGate, y: archH / 2 - 0.1, z: gateZ }));
      extras.push(part('box', [halfGate * 2 + 0.3, 0.18, 0.18], postColor, { x: gateX, y: archH - 0.1, z: gateZ }));
      extras.push(part('box', [halfGate * 2 + 0.2, 0.4, 0.05], archColor, { x: gateX, y: archH + 0.05, z: gateZ }));
    } else {
      const gateZ = edge.gapCentre, gateX = x0 + 0.2;
      extras.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX, y: archH / 2 - 0.1, z: gateZ - halfGate }));
      extras.push(part('cyl', [0.1, 0.12, archH, 8], postColor, { x: gateX, y: archH / 2 - 0.1, z: gateZ + halfGate }));
      extras.push(part('box', [0.18, 0.18, halfGate * 2 + 0.3], postColor, { x: gateX, y: archH - 0.1, z: gateZ }));
      extras.push(part('box', [0.05, 0.4, halfGate * 2 + 0.2], archColor, { x: gateX, y: archH + 0.05, z: gateZ }));
    }
    // The threshold: the floor runs through the gate at y 0, from the fence line to the first row,
    // over the café plinth and the stone border that used to show there as a trench with a lip.
    // It stops a board's gap short of the first row, like every other row, and never overlaps the
    // café tiles (they end exactly on the fence line), so nothing in it is coplanar with anything.
    const depth = firstEdge - gap - edge.line;
    if (depth > 0.05) {
      const span = halfGate * 2, mid = edge.line + depth / 2;
      baseParts.push(edge.axis === 'z'
        ? part('box', [span, 0.09, depth], region.floor === 'tile' ? border : plank, { x: edge.gapCentre, y: -0.045, z: mid, tex: 'wood' })
        : part('box', [depth, 0.09, span], region.floor === 'tile' ? border : plank, { x: mid, y: -0.045, z: edge.gapCentre, tex: 'wood' }));
    }
  }
  // The terrace's own street entrance (plan §1.2): a garden arch in the deck's WEST edge, facing the
  // sidewalk, with a low clipped hedge along the rest of that edge so the opening is the one way in
  // and the edge beside the sidewalk — the same height as the deck now — does not read as open.
  if (region.id === 'terrace') {
    const door = terraceDoorOf(area);
    const half = 1.0, hx = x0 - 0.25;
    const lo = Math.max(z0, door.z - half), hi = Math.min(z1, door.z + half);
    // From the café's south fence post (z 7.07) to the border's south end.
    for (const [a, b] of [[z0 - 0.33, lo - 0.12], [hi + 0.12, z1 + 0.3]]) {
      if (b - a < 0.3) continue;
      extras.push(part('box', [0.4, 0.42, b - a], crownB, { x: hx, y: 0.21, z: (a + b) / 2 }));
      extras.push(part('box', [0.34, 0.14, b - a - 0.06], crownA, { x: hx, y: 0.47, z: (a + b) / 2 }));
    }
    const dz = (lo + hi) / 2, postZ = [lo - 0.08, hi + 0.08], topY = 2.3;
    for (const z of postZ) extras.push(part('cyl', [0.08, 0.1, topY, 8], postColor, { x: hx, y: topY / 2, z }));
    extras.push(part('box', [0.14, 0.14, hi - lo + 0.36], postColor, { x: hx, y: topY, z: dz }));
    // A swag of leaves and blooms along the crossbar, so it reads as a garden arch from the sidewalk.
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, z = lo - 0.05 + t * (hi - lo + 0.1), y = topY + 0.08 - 0.16 * Math.sin(Math.PI * t);
      extras.push(part('sph', [0.13, 6], i & 1 ? crownB : crownA, { x: hx, y, z, sy: 0.8 }));
      if (bloom && (i === 2 || i === 6)) extras.push(part('sph', [0.08, 6], i === 2 ? bloom : (bloomAlt || bloom), { x: hx + 0.1, y: y + 0.04, z }));
    }
    // A coir mat across the opening, 1.2 cm proud of the sidewalk and the planks either side of it.
    extras.push(part('box', [0.95, 0.03, hi - lo - 0.2], '#C9795C', { x: x0 - 0.02, y: -0.003, z: dz, tex: 'fabric' }));
  }
  return { base: baseParts, rows, extras, axis };
}
// ── Terrace station meshes (plan 3.1/7.2) ───────────────────────────────────────────────────────
// icecream1 mirrors coffeeMesh's shape/scale (a counter-height machine) but in ice-cream pastels
// with two swirl cones instead of a coffee spout.
// ── Station toppers ─────────────────────────────────────────────────────────────────────────────
// The day-18 report on the terrace and the spa was a list of objects nobody could name: "a square
// thing", "a photograph stand", "a table and long chairs", "machines that don't make sense". Walked
// with the game's own camera, it was fair. The kitchen's stations each had a silhouette that says
// what they do — the oven's lit window, the coffee machine's group heads, a counter full of cakes —
// and the later ones never got one: the ice cream machine was a 0.9 m box standing in a 1.6 m
// footprint, the cream supply two pale spheres, the restroom a blank box with its only door facing
// sideways away from the camera, the photo booth a pink cabinet with a porthole.
//
// The genre's answer, and the one used here, is a TOPPER: one oversized, unmistakable object on
// top of each station — a giant soft-serve cone, a water drop, bubbles, a crescent-moon door, a
// camera on a tripod. Toppers sit above head height, so they read from anywhere on the deck and from
// every side, which matters because the camera sees most of these stations side-on. Each body also
// fills the footprint the nav grid blocks, so what looks solid is exactly what is solid.
// icecream1 — a soft-serve counter: a striped pastel cabinet filling the 1.6 x 1.2 footprint, a
// chrome top, the machine with its two dispensing heads, and the lane's shop sign — a giant cone.
export function icecreamMesh() {
  const g = new THREE.Group();
  const P = [];
  P.push(part('rbox', [1.5, 0.92, 1.08, 0.08], '#FFC7D9', { y: 0.46 }));                 // cabinet
  P.push(part('rbox', [1.3, 0.62, 0.04, 0.03], C.cream, { y: 0.5, z: 0.55 }));           // front panel
  for (let i = 0; i < 5; i++) P.push(part('box', [0.12, 0.6, 0.012], '#FF9DBB', { x: -0.52 + i * 0.26, y: 0.5, z: 0.575 }));
  for (let i = 0; i < 4; i++) P.push(part('box', [0.012, 0.6, 0.12], '#FF9DBB', { x: 0.755, y: 0.5, z: -0.39 + i * 0.26 }));
  P.push(part('box', [1.58, 0.07, 1.16], C.metal, { y: 0.955, tex: 'metal' }));           // counter top
  P.push(part('rbox', [1.0, 0.62, 0.55, 0.07], '#F4FAFF', { y: 1.3, z: -0.22, tex: 'metal' })); // machine
  P.push(part('box', [0.92, 0.09, 0.5], '#DDEBF5', { y: 1.65, z: -0.22, tex: 'metal' }));  // its lid
  for (const x of [-0.24, 0.24]) {
    P.push(part('rbox', [0.2, 0.18, 0.16, 0.04], '#E6EEF5', { x, y: 1.22, z: 0.12, tex: 'metal' })); // head
    P.push(part('cyl', [0.045, 0.02, 0.12, 8], C.metal, { x, y: 1.08, z: 0.14 }));                   // nozzle
    P.push(part('box', [0.05, 0.16, 0.04], C.ink, { x, y: 1.42, z: 0.14 }));                          // pull
  }
  P.push(part('box', [0.8, 0.03, 0.22], '#C9D4DC', { y: 1.005, z: 0.22 }));               // drip tray
  // The sign: a giant cone on a short chrome post, point down, a pink-and-white swirl and a cherry.
  P.push(part('cyl', [0.04, 0.04, 0.34, 8], C.metal, { y: 1.86, z: -0.22 }));
  P.push(part('cyl', [0.25, 0.02, 0.48, 14], '#E0A560', { y: 2.27, z: -0.22, tex: 'fabric' }));
  P.push(part('sph', [0.27, 12], '#FFF6FA', { y: 2.55, z: -0.22, sy: 0.55 }));
  P.push(part('sph', [0.21, 12], '#FFD1E3', { y: 2.71, z: -0.22, sy: 0.6 }));
  P.push(part('sph', [0.14, 10], '#FFF6FA', { y: 2.85, z: -0.22, sy: 0.7 }));
  P.push(part('cone', [0.07, 0.15, 8], '#FFD1E3', { y: 2.97, z: -0.22 }));
  P.push(part('sph', [0.06, 8], '#E0405F', { y: 3.07, z: -0.22 }));
  g.add(mesh(P));
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
// ── Spa station meshes (plan 3.9) ────────────────────────────────────────────────────────────────
// All five are authored in LOCAL space with +z forward (the same convention every other station
// mesh here uses, so systems/visuals.js's existing rot handling applies unchanged), and all are
// one merged draw call each. They are sized to the fw/fd their data/area1.js rows declare, so the
// silhouette matches the footprint nav actually blocks — the mismatch that made Batch 1's décor
// look walkable when it wasn't.


export function cashPile(max = 60) {
  const geo = new THREE.BoxGeometry(0.32, 0.04, 0.18); const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(C.cash) });
  const im = new THREE.InstancedMesh(geo, mat, max); im.castShadow = true; im.count = 0;
  im.name = 'cashPile';   // it sits ON a register by design; named so audits can tell it from a clip
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  im.setCount = n => {
    n = Math.min(max, n | 0); if (n === im.count) return;
    for (let i = 0; i < n; i++) { const col = i % 4, row = (i >> 2) % 4, lvl = i >> 4; p.set(-0.55 + col * 0.36, 0.02 + lvl * 0.045, -0.3 + row * 0.2); e.set(0, ((i * 7919) % 17) / 17 * 0.5 - 0.25, 0); q.setFromEuler(e); m.compose(p, q, s); im.setMatrixAt(i, m); }
    im.count = n; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  };
  return im;
}
