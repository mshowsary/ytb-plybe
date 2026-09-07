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
// Everything merges into a handful of draw calls via geo.js, and the layout is seeded so it is
// identical on every device and across reloads.

import * as THREE from 'three';
import { part, mesh } from './geo.js';

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

const GRASS = ['#BFE0A2', '#B4D998', '#C7E6AC', '#AAD190'];
const FLOWERS = ['#FF8FA8', '#FFC861', '#F2789F', '#FFE28A', '#C99BE8', '#FF9F6E'];
const FOLIAGE = ['#6FB56F', '#5EA463', '#7BC47F', '#549456'];
const TRUNK = '#9A6B4A';
const TOWN = ['#E8D6C6', '#DCC6BE', '#EFE0CE', '#D6C4C8', '#E3D2BC'];

// Keeps scenery clear of the café slab, its plinth and the pavements already drawn by props.js.
function insideCafe(x, z) { return x > -14 && x < 13 && z > -11 && z < 7.4; }

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
    solid.push(part('box', [w, 0.12, d], pick(GRASS), { x, y: -0.48 + r() * 0.05, z }));
  }

  // Grass tufts and pebbles. Small vertical detail is what stops a lawn reading as a painted plane;
  // they are concentrated in the near band because that is the only part at legible scale.
  for (let i = 0; i < 150; i++) {
    const x = -22 + r() * 44, z = south + 0.6 + r() * 13;
    if (insideCafe(x, z)) continue;
    const h = 0.16 + r() * 0.22;
    solid.push(part('cone', [0.09 + r() * 0.05, h, 4], pick(FOLIAGE), { x, y: -0.5 + h / 2, z }));
  }
  for (let i = 0; i < 46; i++) {
    const x = -20 + r() * 40, z = south + 1.0 + r() * 12;
    if (insideCafe(x, z)) continue;
    const s0 = 0.12 + r() * 0.16;
    solid.push(part('sph', [s0, 5], r() < 0.5 ? '#CFC7BA' : '#BEB4A6', { x, y: -0.48, z, sy: 0.55 }));
  }

  // ---- Near garden: the foreground the player stares at all game ---------------------------------
  // A paw-print path curving away from the café gate, so the eye has somewhere to travel.
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = -6 + t * 15 + Math.sin(t * 4.2) * 1.7;
    const z = south + 1.1 + t * 9.5;
    solid.push(part('cyl', [0.36, 0.36, 0.08, 9], '#F7EFE0', { x, y: -0.43, z, sz: 0.78 }));
    for (const [ox, oz] of [[-0.22, 0.3], [0.0, 0.36], [0.22, 0.3]]) {
      solid.push(part('cyl', [0.11, 0.11, 0.07, 6], '#F7EFE0', { x: x + ox, y: -0.43, z: z + oz }));
    }
  }

  // Flower beds hugging the fence line: the strongest colour in the frame, closest to the player.
  for (let i = 0; i < 14; i++) {
    const bx = -13 + i * 2.15 + r() * 0.5;
    const bz = south + 0.9 + r() * 0.5;
    solid.push(part('rbox', [2.0, 0.34, 1.15, 0.1], '#A9764E', { x: bx, y: -0.36, z: bz }));
    solid.push(part('box', [1.75, 0.16, 0.92], '#6B4A34', { x: bx, y: -0.2, z: bz }));
    for (let f = 0; f < 8; f++) {
      const fx = bx - 0.75 + r() * 1.5, fz = bz - 0.36 + r() * 0.72;
      const h = 0.22 + r() * 0.18;
      solid.push(part('cyl', [0.035, 0.035, h, 4], '#5EA463', { x: fx, y: -0.12 + h / 2, z: fz }));
      bright.push(part('sph', [0.15 + r() * 0.07, 6], pick(FLOWERS), { x: fx, y: -0.12 + h, z: fz, sy: 0.74 }));
    }
  }

  // A pond. Water is the cheapest way to break a field of green, and ducks aside, pets drink here.
  {
    const px = 9.5, pz = south + 6.2;
    solid.push(part('cyl', [3.1, 3.1, 0.18, 14], '#9CC08A', { x: px, y: -0.5, z: pz, sz: 0.72 }));
    solid.push(part('cyl', [2.72, 2.72, 0.16, 14], '#79B8D4', { x: px, y: -0.45, z: pz, sz: 0.72 }));
    bright.push(part('cyl', [2.3, 2.3, 0.05, 14], '#A8DCEF', { x: px, y: -0.4, z: pz, sz: 0.72 }));
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, rad = 0.5 + r() * 1.5;
      solid.push(part('cyl', [0.3 + r() * 0.16, 0.3, 0.045, 7], '#6FB56F',
        { x: px + Math.cos(a) * rad, y: -0.37, z: pz + Math.sin(a) * rad * 0.72, sz: 0.8 }));
    }
  }

  // Pet agility course. Pure theme: the café's garden is a place pets visibly play in.
  {
    const gx = -6.5, gz = south + 5.4;
    // hoop
    solid.push(part('cyl', [0.09, 0.09, 1.5, 8], '#E8A0A8', { x: gx - 0.85, y: 0.25, z: gz }));
    solid.push(part('cyl', [0.09, 0.09, 1.5, 8], '#E8A0A8', { x: gx + 0.85, y: 0.25, z: gz }));
    solid.push(part('cyl', [0.86, 0.86, 0.13, 20], '#FF8FA8', { x: gx, y: 0.78, z: gz, rx: Math.PI / 2, sz: 1 }));
    solid.push(part('cyl', [0.72, 0.72, 0.15, 20], '#BFE0A2', { x: gx, y: 0.78, z: gz, rx: Math.PI / 2, sz: 1 }));
    // low ramp
    solid.push(part('box', [2.3, 0.14, 1.3], '#D9A066', { x: gx + 4.4, y: 0.0, z: gz + 0.6, rz: 0.2 }));
    solid.push(part('box', [0.16, 0.5, 1.3], '#B9834A', { x: gx + 5.4, y: -0.2, z: gz + 0.6 }));
    // tunnel
    for (let i = 0; i < 5; i++) {
      solid.push(part('cyl', [0.62, 0.62, 0.22, 14], i % 2 ? '#8FC8E8' : '#B4E0F2',
        { x: gx + 8.6, y: 0.12, z: gz - 0.9 + i * 0.5, rx: Math.PI / 2 }));
    }
    // two bowls
    for (const ox of [10.6, 11.3]) {
      solid.push(part('cyl', [0.26, 0.2, 0.16, 12], '#E88CA6', { x: gx + ox, y: -0.32, z: gz + 1.4 }));
    }
  }

  // Benches facing the café, so the garden reads as somewhere people sit rather than empty lawn.
  for (const [bx, bz] of [[2.2, south + 3.0], [-10.5, south + 2.4]]) {
    solid.push(part('rbox', [1.9, 0.14, 0.6, 0.05], '#C89A6B', { x: bx, y: 0.05, z: bz }));
    solid.push(part('rbox', [1.9, 0.5, 0.13, 0.05], '#C89A6B', { x: bx, y: 0.3, z: bz - 0.24 }));
    for (const ox of [-0.75, 0.75]) solid.push(part('box', [0.13, 0.42, 0.5], '#8A6B50', { x: bx + ox, y: -0.16, z: bz }));
  }

  // ---- Mid ring: hedges and trees ---------------------------------------------------------------
  const treeAt = (x, z, scale) => {
    const h = (1.5 + r() * 1.3) * scale;
    solid.push(part('cyl', [0.17 * scale, 0.23 * scale, h, 5], TRUNK, { x, y: -0.5 + h / 2, z }));
    const crown = pick(FOLIAGE);
    solid.push(part('sph', [0.95 * scale, 7], crown, { x, y: -0.5 + h + 0.5 * scale, z, sy: 1.12 }));
    solid.push(part('sph', [0.66 * scale, 6], crown, { x: x + 0.42 * scale, y: -0.5 + h + 1.05 * scale, z: z - 0.2 * scale }));
    solid.push(part('sph', [0.55 * scale, 6], pick(FOLIAGE), { x: x - 0.46 * scale, y: -0.5 + h + 0.85 * scale, z: z + 0.22 * scale }));
  };

  // White picket line at the garden edge: a bright horizontal that separates near garden from the
  // tree ring behind it, and reads instantly as "this is a kept garden" rather than open field.
  for (let x = -20; x <= 22; x += 0.85) {
    if (x > -1.8 && x < 3.8) continue; // gap on the paw path
    solid.push(part('box', [0.13, 0.78, 0.13], '#FBF3E6', { x, y: -0.12, z: south + 10.6 }));
  }
  for (const yy of [0.06, -0.22]) {
    solid.push(part('box', [18.4, 0.1, 0.08], '#FBF3E6', { x: -11, y: yy, z: south + 10.6 }));
    solid.push(part('box', [18.4, 0.1, 0.08], '#FBF3E6', { x: 12.8, y: yy, z: south + 10.6 }));
  }

  // Hedge line marking the garden's far boundary — a clean horizontal that stops the eye.
  for (let x = -18; x <= 20; x += 1.5) {
    if (x > -1.5 && x < 3.5) continue; // gap where the paw path leads out
    solid.push(part('box', [1.5, 1.0, 1.1], pick(FOLIAGE), { x, y: 0.0, z: south + 12.5 }));
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
    const col = pick(TOWN);
    solid.push(part('box', [w, h, 4 + r() * 3], col, { x, y: -0.5 + h / 2, z }));
    solid.push(part('box', [w * 1.08, 0.5, 4.4], '#C89187', { x, y: -0.5 + h + 0.25, z }));
  }

  const group = new THREE.Group();
  group.name = 'environment';
  group.add(mesh(solid, { cast: true, receive: true }));
  // Unlit pieces stay vivid under the toon ramp: flowers should pop, not sit in shadow.
  group.add(mesh(bright, {
    cast: false, receive: false,
    material: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
  }));
  return group;
}
