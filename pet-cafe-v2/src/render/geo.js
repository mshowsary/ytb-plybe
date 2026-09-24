// src/render/geo.js — colored primitive parts merged into one geometry (one draw call per prop type)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toonMaterial } from './palette.js';
import { TILES, BLANK } from './grain.js';
const _c = new THREE.Color();
// The centre of grain.js's pure-white `blank` tile. EVERY geometry in the game must end up with a
// `uv` attribute — mergeGeometries throws the moment two inputs disagree on their attribute set,
// and this file's whole job is merging — so an untagged part is not left without one, it is pointed
// at white. A constant is enough for that (no projection, no bounding box), which matters because
// the overwhelming majority of the world's parts are untagged.
const BLANK_U = BLANK.u0 + BLANK.du * 0.5, BLANK_V = BLANK.v0 + BLANK.dv * 0.5;
export function blankUV(g) {
  const n = g.getAttribute('position').count, arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { arr[i * 2] = BLANK_U; arr[i * 2 + 1] = BLANK_V; }
  g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  return g;
}
export function colorize(g, hex) {
  const n = g.getAttribute('position').count; const arr = new Float32Array(n * 3);
  _c.set(hex); for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // Backstop for everything that reaches colorize() from outside part() — environment.js's own
  // bloom/festoon primitives delete their uv and come straight here (environment.js `finish`), and
  // they get merged in the same meshes as part() geometry.
  if (!g.getAttribute('uv')) blankUV(g);
  return g;
}
// Box-project `g` into one of grain.js's atlas tiles.
//
// SCALE. The grain has to have a physical size — a 4 m counter and a 0.2 m plate must not show the
// same number of wood rings — so UVs are metres divided by the tile's authored world span
// (TILES[name].m), not a normalised 0..1 across the face. The catch is that a part can show AT MOST
// ONE copy of its tile: UVs interpolate linearly across a quad, and repeating inside an atlas would
// need a fract() in the fragment shader, which would mean a custom material and therefore a draw
// call per prop. So a part LARGER than its tile's span stretches the tile to fit instead of
// spilling into the neighbouring tile. That is done PER WORLD AXIS rather than uniformly, which is
// what keeps a 20 m deck plank looking like a plank — its grain stretches along its length (which
// is what plank grain does) instead of the whole tile collapsing into a 2 % sliver across its
// width. Using one scale per axis rather than one per face also means adjacent faces agree where
// they meet.
function projectUV(g, tile, texScale) {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  if (!nor) return blankUV(g);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const m = Math.max(1e-4, tile.m * texScale);
  const sx = Math.max(m, bb.max.x - bb.min.x), sy = Math.max(m, bb.max.y - bb.min.y), sz = Math.max(m, bb.max.z - bb.min.z);
  const n = pos.count, arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = (pos.getX(i) - cx) / sx; v = (pos.getZ(i) - cz) / sz; }        // faces up/down
    else if (ax >= az) { u = (pos.getZ(i) - cz) / sz; v = (pos.getY(i) - cy) / sy; }               // faces east/west
    else { u = (pos.getX(i) - cx) / sx; v = (pos.getY(i) - cy) / sy; }                             // faces north/south
    u += 0.5; v += 0.5;
    arr[i * 2] = tile.u0 + (u < 0 ? 0 : u > 1 ? 1 : u) * tile.du;
    arr[i * 2 + 1] = tile.v0 + (v < 0 ? 0 : v > 1 ? 1 : v) * tile.dv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  return g;
}
export function part(kind, d, hex, xf = {}) {
  let g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(d[0], d[1], d[2]); break;
    // ONE segment now, not two (it was three before Batch 8). A RoundedBoxGeometry's cost grows with
    // the square of this number — 108 triangles at 1, 300 at 2, 588 at 3 — and the rounded box is the
    // game's most-used primitive by a wide margin: a character rig alone is fifteen of them, so at
    // two segments sixteen actors on stage cost 46k triangles in fillets nobody can resolve. At this
    // camera a 6-8 cm fillet is a handful of pixels, and one segment draws it as a chamfer that is
    // indistinguishable from the two-segment curve in a side-by-side capture at 1280x720.
    // A caller that genuinely needs a showpiece curve passes `seg`.
    case 'rbox': g = new RoundedBoxGeometry(d[0], d[1], d[2], xf.seg ?? 1, d[3] ?? 0.06); break;
    case 'cyl': g = new THREE.CylinderGeometry(d[0], d[1], d[2], d[3] ?? 16); break;
    case 'sph': g = new THREE.SphereGeometry(d[0], d[1] ?? 14, (d[1] ?? 14) >> 1); break;
    case 'cone': g = new THREE.ConeGeometry(d[0], d[1], d[2] ?? 12); break;
    case 'torus': g = new THREE.TorusGeometry(d[0], d[1], d[2] ?? 8, d[3] ?? 16); break;     // lies flat (rotated to the xz plane)
    default: throw new Error('part kind ' + kind);
  }
  if (kind === 'torus') g.rotateX(Math.PI / 2);
  g.deleteAttribute('uv');     // every primitive's own UV layout is thrown away; we project our own
  if (xf.sx || xf.sy || xf.sz) g.scale(xf.sx ?? 1, xf.sy ?? 1, xf.sz ?? 1);
  if (xf.rx) g.rotateX(xf.rx); if (xf.ry) g.rotateY(xf.ry); if (xf.rz) g.rotateZ(xf.rz);
  // Projected AFTER the scale and rotation (so the grain is sized and oriented in world axes) but
  // BEFORE the translate, so two copies of the same prop in different places get identical UVs.
  // An unknown tile name falls through to blank rather than throwing: this is render code.
  const tile = xf.tex ? TILES[xf.tex] : null;
  if (tile) projectUV(g, tile, xf.texScale ?? 1);
  g.translate(xf.x ?? 0, xf.y ?? 0, xf.z ?? 0);
  return colorize(g, hex);
}
// The height band a standing body actually fills. Only parts reaching into it can be walked into.
const BODY_LO = 0.25, BODY_HI = 1.6;

export function merge(parts) {
  const gs = parts.map(p => p.index ? p.toNonIndexed() : p);
  for (const g of gs) if (!g.getAttribute('uv')) blankUV(g);   // last line of defence for the uv contract
  const g = mergeGeometries(gs, false); g.computeBoundingSphere();
  // Once the parts are merged, a single AABB cannot tell a floor plinth from an extractor hood two
  // metres up, so the horizontal reach of the SOLID, body-height part of a prop is recorded here
  // while the parts still exist. The player's collision uses it: a station's hand-written fw/fd
  // footprint understated the drawn oven by 0.60 m and the drawn counter by 0.21 m, so the owner's
  // body sank into both (owner playtest, 2026-09-16). See src/systems/visuals.js.
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const p of gs) {
    p.computeBoundingBox();
    const b = p.boundingBox;
    if (!b || b.max.y < BODY_LO || b.min.y > BODY_HI) continue;
    if (b.min.x < minx) minx = b.min.x;
    if (b.max.x > maxx) maxx = b.max.x;
    if (b.min.z < minz) minz = b.min.z;
    if (b.max.z > maxz) maxz = b.max.z;
  }
  if (minx !== Infinity) g.userData.bodyBox = { minx, maxx, minz, maxz };
  return g;
}
// Below this bounding-sphere radius a prop does not cast a sun shadow. Every shadow caster is a
// second draw call — the scene is rendered again into the shadow map — and at the café's wide camera
// the shadow of a cup, a plate, a menu card or a shelf item is a couple of pixels that nobody will
// ever miss. Batch 8 measured 110 casters in a built day-12 café; furniture and bodies are what the
// eye reads as grounded, and Batch 8's contact shadows now anchor everything else for one draw call
// in total. Callers that genuinely need a small caster can still pass `cast: true` explicitly.
// 0.4, up from 0.28 (ship plan §1.9 budget): the shadow pass was 87 of the static scene's 184 draw
// calls, and a prop smaller than a chair seat — a sack, a basket of fruit, a sign — still reads as
// grounded on its contact shadow.
const SHADOW_MIN_RADIUS = 0.4;

// Fold extra parts into a mesh that has already been built, without costing a draw call.
//
// Used by systems/visuals.js to put a station's sign on the station's own geometry. The bodyBox is
// carried over from the mesh it started as, deliberately: `merge()` recomputes it from everything in
// the band a standing body fills, and a sign is render-only — it contributes no collision anywhere
// (sim/nav.js, sim/ownerReach.js and world.js all read the station's box, not its mesh). Letting the
// sign's post grow the box would make the owner bump into a sign, and would give a station too short
// to have a box at all (the pet treat bowl) a brand new one.
export function addParts(m, parts) {
  if (!m || !m.geometry || !parts || !parts.length) return m;
  const keep = m.geometry.userData && m.geometry.userData.bodyBox;
  const g = merge([m.geometry, ...parts]);
  if (keep) g.userData.bodyBox = keep; else delete g.userData.bodyBox;
  m.geometry = g;
  return m;
}

export function mesh(parts, opts = {}) {
  const g = merge(parts);
  const m = new THREE.Mesh(g, opts.material || toonMaterial());
  const r = g.boundingSphere ? g.boundingSphere.radius : Infinity;
  m.castShadow = opts.cast ?? (r >= SHADOW_MIN_RADIUS);
  m.receiveShadow = opts.receive ?? true;
  return m;
}
