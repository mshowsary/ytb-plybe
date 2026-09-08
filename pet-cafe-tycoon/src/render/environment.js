// src/render/environment.js — the world beyond the café walls.
//
// WHY THIS EXISTS
// props.js lays a single 90x90 slab of flat green and notes "sky never in frame at this pitch".
// That holds in landscape. In portrait the camera pitches down over a much taller frame and the
// slab fills the bottom third with dead, untextured colour — the single loudest "unfinished"
// signal in a screenshot, and the first thing that separates this from a studio build.
//
// The café occupies x -10..10, z -7..7, with +z toward the camera. Streets already exist north and
// west, which is the FAR side. Everything the player actually sees below the café — the near side,
// +z and +x — was empty. So that is where the content goes.
//
// LAYOUT RULES
//   near  (z 7.5..14)  low only: grass, beds, path, pond, agility toys. Anything tall here sits
//                      between the camera and the café and would occlude the game.
//   mid   (z 14..24)   trees and hedges, tall enough to read as a world, far enough not to block.
//   far   (z 24..40)   town silhouette, no detail, pure depth cue.
//
// TRIANGLE BUDGET (garden)
// The near band is static, merged and permanently on screen, so it is both the cheapest place to
// spend triangles and the most expensive place to waste them. Every bloom is assembled from 3- and
// 4-segment primitives whose exact cost is written beside it, and the whole near-band population is
// held under the ceiling of 120 blooms at 40 triangles each. What makes a flower read as a flower
// at this scale is the silhouette — a five-lobed rosette instead of one blob — not the facet count,
// which is why a pile of tiny primitives beats a single smooth sphere for a fraction of the cost.
//
// Everything merges into a handful of draw calls via geo.js, and the layout is seeded so it is
// identical on every device and across reloads.

import * as THREE from 'three';
import { part, mesh, colorize } from './geo.js';

// Small deterministic PRNG (mulberry32). A fixed layout matters: screenshots, the visual-reference
// workflow and the responsive audit all compare frames across runs.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Palette ------------------------------------------------------------------------------------
// Exported and kept in one block on purpose: Seasons re-tints the garden by swapping these arrays,
// and that stays cheap only while no garden colour literal lives anywhere else in this file.
// Bloom colours are deliberately saturated. The previous muted set was chosen to sit inside the
// sepia grade; with that grade gone, muted petals read as grey hexagons in a screenshot.
export const GARDEN_PALETTE = {
  grass: ['#BFE0A2', '#B4D998', '#C7E6AC', '#AAD190'],
  foliage: ['#6FB56F', '#5EA463', '#7BC47F', '#549456'],
  trunk: '#9A6B4A',
  town: ['#E8D6C6', '#DCC6BE', '#EFE0CE', '#D6C4C8', '#E3D2BC'],
  townRoof: '#C89187',
  pebble: ['#CFC7BA', '#BEB4A6'],

  // Blooms. Four families, so a bed reads as planted rather than dyed one colour.
  petalPink: ['#FF4D8D', '#FF6FA8', '#F5297A', '#FF89B8', '#E63C86'],
  petalSun: ['#FFC219', '#FFD84A', '#FFA800', '#FFE066'],
  petalViolet: ['#A94BF0', '#8B5CF6', '#C766F2', '#7B45DE'],
  petalWhite: ['#FFFFFF', '#FFF2F8', '#FFF8E8'],
  bloomCore: ['#FFD84A', '#FFC219', '#FF9C33', '#FFE8A0'],
  daisyCore: '#FFC219',

  stem: '#4F9455',
  leaf: ['#57A45C', '#4A8F50', '#68B36A'],

  planterBody: '#A9764E',
  planterRim: '#D9A066',
  planterPost: '#C08A56',
  soil: '#5A3E2B',

  pathStone: '#D8CFC2',
  pathStoneToe: '#CDC2B3',

  pondRim: '#9CC08A',
  pondDeep: '#79B8D4',
  pondShallow: '#A8DCEF',
  lily: '#6FB56F',
  reedStem: '#4E8F52',
  reedHead: '#8A5A3A',

  hoopPost: '#E8A0A8',
  hoopRing: '#FF8FA8',
  hoopInner: '#BFE0A2',
  ramp: '#D9A066',
  rampLeg: '#B9834A',
  tunnelA: '#8FC8E8',
  tunnelB: '#B4E0F2',
  bowl: '#E88CA6',
  benchSeat: '#C89A6B',
  benchLeg: '#8A6B50',
  picket: '#FBF3E6',
};

const P = GARDEN_PALETTE;
// The four petal families, picked as a set so every bloom commits to one hue instead of speckling.
const PETAL_SETS = [P.petalPink, P.petalSun, P.petalViolet, P.petalWhite];
// Three size classes, exactly as the garden spec calls for.
const BLOOM_SCALES = [0.78, 1.0, 1.26];

// Keeps scenery clear of the café slab, its plinth and the pavements already drawn by props.js.
function insideCafe(x, z) { return x > -14 && x < 13 && z > -11 && z < 7.4; }

// ---- Bloom primitives ---------------------------------------------------------------------------
// geo.js `part()` cannot express the two shapes the flower budget depends on:
//   * an open-ended cone — half the triangles of a closed one, and on a stem or a leaf the missing
//     cap always faces the soil or the flower centre, so it is never visible;
//   * a sphere whose height segments are not width>>1 — `part('sph', [r, 3])` would build a
//     degenerate zero-triangle sphere, while a real 3x2 sphere is a usable 6-triangle petal.
// Both still produce plain merged geometry, so neither costs an extra draw call.
function finish(g, hex) { g.deleteAttribute('uv'); return colorize(g, hex); }

// A stem or a reed: 3 triangles. Tapers upward, which reads as a stalk and hides the open base.
function stalk(out, hex, r0, h, x, y, z, lean = 0) {
  const g = new THREE.ConeGeometry(r0, h, 3, 1, true);
  g.translate(0, h / 2, 0);
  if (lean) g.rotateZ(lean);
  g.translate(x, y, z);
  out.push(finish(g, hex));
}

// A leaf: 3 triangles. A narrow open cone laid out and up from the base of the stem.
function leafBlade(out, hex, s, x, y, z, ang, lean = 1.12) {
  const g = new THREE.ConeGeometry(0.075 * s, 0.34 * s, 3, 1, true);
  g.scale(1, 1, 0.5);
  g.translate(0, 0.17 * s, 0);
  g.rotateZ(lean);
  g.rotateY(ang);
  g.translate(x, y, z);
  out.push(finish(g, hex));
}

// A petal: a flattened sphere pushed out along the flower's radius and tilted up at the tip.
// `seg` 3 costs 6 triangles, `seg` 4 costs 8 — the only knob that matters at this size.
function petalLobe(out, hex, r, seg, cx, cy, cz, ang, tilt, len, flat, wide) {
  const g = new THREE.SphereGeometry(r, seg, 2);
  g.scale(len, flat, wide);
  g.translate(r * len * 0.92, 0, 0);
  g.rotateZ(tilt);
  g.rotateY(ang);
  g.translate(cx, cy, cz);
  out.push(finish(g, hex));
}

// A dome: a flower's centre, and the cattail on a reed. 6 triangles at seg 3, 8 at seg 4.
function dome(out, hex, r, seg, x, y, z, flat = 0.8) {
  const g = new THREE.SphereGeometry(r, seg, 2);
  g.scale(1, flat, 1);
  g.translate(x, y, z);
  out.push(finish(g, hex));
}

// ---- One plant ----------------------------------------------------------------------------------
// Three species, so a bed varies in silhouette and not only in hue, and so the average cost lands
// under the 40-triangle ceiling: the tulip is very cheap and pays for the cluster, which is not.
// Every petal is a 3x2 sphere (6 triangles) and every stem and leaf an open 3-sided cone (3), so
// the bloom head — petals plus centre — is 36 or 38 triangles for a cluster or a daisy and 18 for a
// tulip, all inside the 40-triangle ceiling. Whole plants, stem and leaves included:
//   cluster  42 / 47 / 47   (small / mid / large)
//   tulip    27             (any size)
//   daisy    42 / 44 / 44
// Stems and leaves go to the toon-lit pass; petals go to the unlit bright pass so the saturation
// survives the shadow ramp instead of sinking into it.
function addPlant(solid, bright, r, x, z, soilY) {
  const s = BLOOM_SCALES[(r() * 3) | 0];
  const small = s < 0.9;
  const coreSeg = small ? 3 : 4;                  // centre dome: 6 or 8 triangles
  const h = (0.2 + r() * 0.16) * s;               // stem height
  const cy = soilY + h;
  const spin = r() * Math.PI * 2;
  const kind = r();
  const leafCol = P.leaf[(r() * P.leaf.length) | 0];
  const family = PETAL_SETS[(r() * PETAL_SETS.length) | 0];
  const petalCol = family[(r() * family.length) | 0];

  stalk(solid, P.stem, 0.028 * s, h, x, soilY - 0.01, z);                       // 3

  if (kind < 0.36) {
    // Layered petal cluster: five petals in a ring with alternating tilt, so the ring reads as two
    // overlapping layers rather than a flat pinwheel, capped by a contrasting centre dome.
    for (let i = 0; i < 5; i++) {
      const a = spin + i * (Math.PI * 2 / 5);
      const tilt = (i & 1) ? 0.62 : 0.34;
      petalLobe(bright, petalCol, 0.105 * s, 3, x, cy, z, a, tilt, 1.35, 0.38, 0.98);
    }                                                                          // 30
    dome(bright, P.bloomCore[(r() * P.bloomCore.length) | 0], 0.072 * s, coreSeg,
      x, cy + 0.035 * s, z);                                                   // 6 or 8
    leafBlade(solid, leafCol, s, x, soilY + 0.01, z, spin + 1.1);              // 3
    if (!small) leafBlade(solid, leafCol, s, x, soilY + 0.01, z, spin + 4.0);  // 3
  } else if (kind < 0.71) {
    // Tulip: three tall petals leaned in until they close into a cup. An inverted cone would be
    // cheaper still, but its flat cap points straight at a camera that looks down, and a coloured
    // polygon facing the player is the exact thing this rework exists to remove.
    const lean = 1.02 + r() * 0.2;
    for (let i = 0; i < 3; i++) {
      const a = spin + i * (Math.PI * 2 / 3);
      petalLobe(bright, petalCol, 0.085 * s, 3, x, cy + 0.02 * s, z, a, lean, 1.9, 0.42, 0.9);
    }                                                                          // 18
    leafBlade(solid, leafCol, s * 1.15, x, soilY + 0.01, z, spin + 0.6, 1.3);  // 3
    leafBlade(solid, leafCol, s * 1.15, x, soilY + 0.01, z, spin + 3.7, 1.3);  // 3
  } else {
    // Daisy: long thin white petals around a saturated yellow eye. The one bloom allowed to be
    // white, which is what makes the pinks and violets beside it look saturated.
    const white = P.petalWhite[(r() * P.petalWhite.length) | 0];
    for (let i = 0; i < 5; i++) {
      const a = spin + i * (Math.PI * 2 / 5);
      petalLobe(bright, white, 0.072 * s, 3, x, cy, z, a, 0.28, 2.1, 0.26, 0.62);
    }                                                                          // 30
    dome(bright, P.daisyCore, 0.062 * s, coreSeg, x, cy + 0.012 * s, z, 0.7);   // 6 or 8
    leafBlade(solid, leafCol, s, x, soilY + 0.01, z, spin + 2.3);              // 3
  }
}

export function buildEnvironment(area) {
  const W = area.size.w, D = area.size.d;
  const south = D / 2;   // +7, the near fence line
  const east = W / 2;    // +10
  const r = rng(0x9E3779B9);
  const solid = [];      // merged toon geometry
  const bright = [];     // merged unlit geometry (flowers, water sparkle)

  const pick = arr => arr[(r() * arr.length) | 0];

  // ---- Ground cover -----------------------------------------------------------------------------
  // Broad, slightly varied patches instead of one flat colour. Overlapping quads at tiny height
  // offsets read as mown grass without a texture or a single extra draw call.
  for (let i = 0; i < 170; i++) {
    const x = -34 + r() * 68, z = -20 + r() * 58;
    if (insideCafe(x, z)) continue;
    const w = 2 + r() * 6, d = 2 + r() * 6;
    solid.push(part('box', [w, 0.12, d], pick(P.grass), { x, y: -0.48 + r() * 0.05, z }));
  }

  // Grass tufts and pebbles. Small vertical detail is what stops a lawn reading as a painted plane;
  // they are concentrated in the near band because that is the only part at legible scale.
  for (let i = 0; i < 150; i++) {
    const x = -22 + r() * 44, z = south + 0.6 + r() * 13;
    if (insideCafe(x, z)) continue;
    const h = 0.16 + r() * 0.22;
    solid.push(part('cone', [0.09 + r() * 0.05, h, 4], pick(P.foliage), { x, y: -0.5 + h / 2, z }));
  }
  for (let i = 0; i < 46; i++) {
    const x = -20 + r() * 40, z = south + 1.0 + r() * 12;
    if (insideCafe(x, z)) continue;
    const s0 = 0.12 + r() * 0.16;
    solid.push(part('sph', [s0, 5], r() < 0.5 ? P.pebble[0] : P.pebble[1], { x, y: -0.48, z, sy: 0.55 }));
  }

  // ---- Near garden: the foreground the player stares at all game ---------------------------------
  // A paw-print path curving away from the café gate, so the eye has somewhere to travel. Half as
  // many prints as before, smaller and a shade darker: at 26 near-white discs the path competed
  // with the flower beds for attention, and the beds should win.
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const x = -6 + t * 15 + Math.sin(t * 4.2) * 1.7;
    const z = south + 1.1 + t * 9.5;
    solid.push(part('cyl', [0.27, 0.27, 0.07, 9], P.pathStone, { x, y: -0.44, z, sz: 0.78 }));
    for (const [ox, oz] of [[-0.17, 0.23], [0.0, 0.27], [0.17, 0.23]]) {
      solid.push(part('cyl', [0.082, 0.082, 0.06, 6], P.pathStoneToe, { x: x + ox, y: -0.44, z: z + oz }));
    }
  }

  // Flower beds hugging the fence line: the strongest colour in the frame, closest to the player.
  // The trough is a plain box with a wooden rim and four corner posts rather than a rounded box —
  // it reads as carpentry instead of a lozenge, and RoundedBoxGeometry at 3 segments costs 588
  // triangles against 12 for a box, which is the entire flower budget spent on a planter.
  const soilY = -0.12;   // top of the soil; every stem starts here
  let blooms = 0;
  for (let i = 0; i < 14; i++) {
    const bx = -13 + i * 2.15 + r() * 0.5;
    const bz = south + 0.9 + r() * 0.5;
    solid.push(part('box', [2.0, 0.34, 1.15], P.planterBody, { x: bx, y: -0.36, z: bz }));
    solid.push(part('box', [1.75, 0.16, 0.92], P.soil, { x: bx, y: -0.2, z: bz }));
    // Wooden edge: two long boards, two short boards, four corner posts standing slightly proud.
    for (const oz of [-0.505, 0.505]) {
      solid.push(part('box', [2.08, 0.13, 0.14], P.planterRim, { x: bx, y: -0.16, z: bz + oz }));
    }
    for (const ox of [-0.97, 0.97]) {
      solid.push(part('box', [0.14, 0.13, 1.2], P.planterRim, { x: bx + ox, y: -0.16, z: bz }));
    }
    for (const ox of [-0.965, 0.965]) {
      for (const oz of [-0.49, 0.49]) {
        solid.push(part('box', [0.17, 0.46, 0.17], P.planterPost, { x: bx + ox, y: -0.30, z: bz + oz }));
      }
    }
    for (let f = 0; f < 8; f++) {
      const fx = bx - 0.72 + r() * 1.44, fz = bz - 0.32 + r() * 0.64;
      addPlant(solid, bright, r, fx, fz, soilY);
      blooms++;
    }
  }

  // A pond. Water is the cheapest way to break a field of green, and ducks aside, pets drink here.
  {
    const px = 9.5, pz = south + 6.2;
    solid.push(part('cyl', [3.1, 3.1, 0.18, 14], P.pondRim, { x: px, y: -0.5, z: pz, sz: 0.72 }));
    solid.push(part('cyl', [2.72, 2.72, 0.16, 14], P.pondDeep, { x: px, y: -0.45, z: pz, sz: 0.72 }));
    bright.push(part('cyl', [2.3, 2.3, 0.05, 14], P.pondShallow, { x: px, y: -0.4, z: pz, sz: 0.72 }));
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, rad = 0.5 + r() * 1.5;
      solid.push(part('cyl', [0.3 + r() * 0.16, 0.3, 0.045, 7], P.lily,
        { x: px + Math.cos(a) * rad, y: -0.37, z: pz + Math.sin(a) * rad * 0.72, sz: 0.8 }));
    }
    // Three reeds on the far lip: vertical accents against a horizontal disc of water, which is the
    // only thing the pond was missing. 17 triangles each.
    for (const [rx, rz] of [[-2.35, -0.55], [-2.05, -1.05], [2.5, -0.5]]) {
      const rh = 0.85 + r() * 0.45;
      const bxr = px + rx, bzr = pz + rz * 0.72;
      stalk(solid, P.reedStem, 0.035, rh, bxr, -0.46, bzr, (r() - 0.5) * 0.16);
      dome(bright, P.reedHead, 0.055, 4, bxr, -0.46 + rh + 0.08, bzr, 2.6);
      leafBlade(solid, P.reedStem, 1.5, bxr, -0.46, bzr, r() * 6.28, 0.9);
      leafBlade(solid, P.reedStem, 1.5, bxr, -0.46, bzr, r() * 6.28, 1.25);
    }
  }

  // Pet agility course. Pure theme: the café's garden is a place pets visibly play in.
  {
    const gx = -6.5, gz = south + 5.4;
    // hoop
    solid.push(part('cyl', [0.09, 0.09, 1.5, 8], P.hoopPost, { x: gx - 0.85, y: 0.25, z: gz }));
    solid.push(part('cyl', [0.09, 0.09, 1.5, 8], P.hoopPost, { x: gx + 0.85, y: 0.25, z: gz }));
    solid.push(part('cyl', [0.86, 0.86, 0.13, 20], P.hoopRing, { x: gx, y: 0.78, z: gz, rx: Math.PI / 2, sz: 1 }));
    solid.push(part('cyl', [0.72, 0.72, 0.15, 20], P.hoopInner, { x: gx, y: 0.78, z: gz, rx: Math.PI / 2, sz: 1 }));
    // low ramp
    solid.push(part('box', [2.3, 0.14, 1.3], P.ramp, { x: gx + 4.4, y: 0.0, z: gz + 0.6, rz: 0.2 }));
    solid.push(part('box', [0.16, 0.5, 1.3], P.rampLeg, { x: gx + 5.4, y: -0.2, z: gz + 0.6 }));
    // tunnel
    for (let i = 0; i < 5; i++) {
      solid.push(part('cyl', [0.62, 0.62, 0.22, 14], i % 2 ? P.tunnelA : P.tunnelB,
        { x: gx + 8.6, y: 0.12, z: gz - 0.9 + i * 0.5, rx: Math.PI / 2 }));
    }
    // two bowls
    for (const ox of [10.6, 11.3]) {
      solid.push(part('cyl', [0.26, 0.2, 0.16, 12], P.bowl, { x: gx + ox, y: -0.32, z: gz + 1.4 }));
    }
  }

  // Benches facing the café, so the garden reads as somewhere people sit rather than empty lawn.
  for (const [bx, bz] of [[2.2, south + 3.0], [-10.5, south + 2.4]]) {
    solid.push(part('rbox', [1.9, 0.14, 0.6, 0.05], P.benchSeat, { x: bx, y: 0.05, z: bz }));
    solid.push(part('rbox', [1.9, 0.5, 0.13, 0.05], P.benchSeat, { x: bx, y: 0.3, z: bz - 0.24 }));
    for (const ox of [-0.75, 0.75]) solid.push(part('box', [0.13, 0.42, 0.5], P.benchLeg, { x: bx + ox, y: -0.16, z: bz }));
  }

  // ---- Mid ring: hedges and trees ---------------------------------------------------------------
  const treeAt = (x, z, scale) => {
    const h = (1.5 + r() * 1.3) * scale;
    solid.push(part('cyl', [0.17 * scale, 0.23 * scale, h, 5], P.trunk, { x, y: -0.5 + h / 2, z }));
    const crown = pick(P.foliage);
    solid.push(part('sph', [0.95 * scale, 7], crown, { x, y: -0.5 + h + 0.5 * scale, z, sy: 1.12 }));
    solid.push(part('sph', [0.66 * scale, 6], crown, { x: x + 0.42 * scale, y: -0.5 + h + 1.05 * scale, z: z - 0.2 * scale }));
    solid.push(part('sph', [0.55 * scale, 6], pick(P.foliage), { x: x - 0.46 * scale, y: -0.5 + h + 0.85 * scale, z: z + 0.22 * scale }));
  };

  // White picket line at the garden edge: a bright horizontal that separates near garden from the
  // tree ring behind it, and reads instantly as "this is a kept garden" rather than open field.
  for (let x = -20; x <= 22; x += 0.85) {
    if (x > -1.8 && x < 3.8) continue; // gap on the paw path
    solid.push(part('box', [0.13, 0.78, 0.13], P.picket, { x, y: -0.12, z: south + 10.6 }));
  }
  for (const yy of [0.06, -0.22]) {
    solid.push(part('box', [18.4, 0.1, 0.08], P.picket, { x: -11, y: yy, z: south + 10.6 }));
    solid.push(part('box', [18.4, 0.1, 0.08], P.picket, { x: 12.8, y: yy, z: south + 10.6 }));
  }

  // Hedge line marking the garden's far boundary — a clean horizontal that stops the eye.
  for (let x = -18; x <= 20; x += 1.5) {
    if (x > -1.5 && x < 3.5) continue; // gap where the paw path leads out
    solid.push(part('box', [1.5, 1.0, 1.1], pick(P.foliage), { x, y: 0.0, z: south + 12.5 }));
  }

  for (let i = 0; i < 22; i++) {
    const x = -30 + r() * 62, z = south + 13.5 + r() * 10;
    treeAt(x, z, 0.85 + r() * 0.6);
  }
  // East flank: fills the right edge in landscape, where the café stops at x = 10.
  for (let i = 0; i < 12; i++) treeAt(east + 4 + r() * 14, -14 + r() * 26, 0.8 + r() * 0.55);
  // A few behind the north wall so the roofline is not the last thing in the frame.
  for (let i = 0; i < 10; i++) treeAt(-30 + r() * 60, -18 - r() * 8, 0.9 + r() * 0.6);

  // ---- Far ring: town silhouette ----------------------------------------------------------------
  // No detail at all, only massing and pale colour. Depth, not scenery.
  for (let i = 0; i < 26; i++) {
    const x = -46 + r() * 96;
    const z = i % 2 === 0 ? south + 26 + r() * 12 : -30 - r() * 12;
    const w = 3.5 + r() * 5, h = 3.5 + r() * 7;
    const col = pick(P.town);
    solid.push(part('box', [w, h, 4 + r() * 3], col, { x, y: -0.5 + h / 2, z }));
    solid.push(part('box', [w * 1.08, 0.5, 4.4], P.townRoof, { x, y: -0.5 + h + 0.25, z }));
  }

  const group = new THREE.Group();
  group.name = 'environment';
  group.userData.blooms = blooms;   // near-band bloom count, for the triangle-budget check
  group.add(mesh(solid, { cast: true, receive: true }));
  // Unlit pieces stay vivid under the toon ramp: flowers should pop, not sit in shadow.
  group.add(mesh(bright, {
    cast: false, receive: false,
    material: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
  }));
  return group;
}
