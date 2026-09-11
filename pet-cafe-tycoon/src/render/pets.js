// src/render/pets.js — expressive stylized pets from merged primitives, kept at <= 6 draw calls.
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial } from './palette.js';
import { damp } from '../core/tween.js';
import { petProfile, isLegendaryProfile } from '../sim/petBook.js';
import { petAppearance } from './petAppearance.js';
import { petSocialPose } from './petSocialPose.js';
import {
  createPetTraitMotionState,
  petTraitContextActive,
  petTraitPose,
  stepPetTraitMotion,
} from './petTraitMotion.js';

const SPEC = {
  cat:   { body: C.cat,   belly: C.cream, earCol: '#E6A5A0', tail: 'long',  eye: C.ink, w: 0.5, h: 0.42, l: 0.8, accent: '#F3C16B' },
  dog:   { body: C.dog,   belly: C.cream, earCol: '#B98C64', tail: 'short', eye: C.ink, w: 0.56, h: 0.48, l: 0.9, accent: '#75BCE8' },
  bunny: { body: C.bunny, belly: C.pink,  earCol: C.pink,  tail: 'puff',  eye: C.ink, w: 0.46, h: 0.4, l: 0.7, accent: '#9B82E8' },
  // Task 2.6 (plan §3.7): round body, cheek pouches, tiny round ears, no visible tail. 'none' tail
  // kind resolves to a near-invisible geometry below (geosFor) rather than skipping the tail mesh
  // entirely, so every downstream P.update() branch that touches `tail.*` keeps working unchanged.
  hamster: { body: '#C9955B', belly: '#FFE9C6', earCol: '#EFC9A0', tail: 'none', eye: C.ink, w: 0.3, h: 0.26, l: 0.34, accent: '#B9834A' },
};
const _heartMat = emissiveMaterial(C.coral);
// One shared emissive material for every legendary pet's sparkle-dot overlay (plan §3.7: "a unique
// accent with sparkle emissive dots"). Cached like _heartMat so N legendary instances cost one
// material, not N.
const _sparkleMat = emissiveMaterial('#FFFFFF');
const _geoCache = new Map();
// Length of one stretch/yawn clip (see P.idleLife). Long enough to read at this camera distance,
// short enough that a resident is never mid-yawn in most frames.
const STRETCH_DUR = 1.5;

function specFor(species, variant = 0) {
  const base = SPEC[species] || SPEC.cat;
  const coat = petProfile(species, variant);
  const look = petAppearance(species, variant);
  return {
    ...base, ...look,
    w: base.w * look.size * look.width,
    h: base.h * look.size * look.height,
    l: base.l * look.size * look.length,
    body: coat.body, belly: coat.belly, accent: coat.accent,
  };
}

function geosFor(species, variant = 0) {
  const cacheKey = `${species}:${variant | 0}`;
  if (_geoCache.has(cacheKey)) return _geoCache.get(cacheKey);
  const s = specFor(species, variant);
  const legDims = [0.14, 0.27, 0.14, 0.05];
  const paw = (x, z) => part('rbox', [0.17, 0.09, 0.2, 0.045], s.belly, { x, y: 0.045, z: z + 0.035 });

  const legPairAGeo = merge([
    part('rbox', legDims, s.body, { x: -s.w * 0.32, y: 0.17, z: s.l * 0.3 }), paw(-s.w * 0.32, s.l * 0.3),
    part('rbox', legDims, s.body, { x: s.w * 0.32, y: 0.17, z: -s.l * 0.3 }), paw(s.w * 0.32, -s.l * 0.3),
  ]);
  const legPairBGeo = merge([
    part('rbox', legDims, s.body, { x: s.w * 0.32, y: 0.17, z: s.l * 0.3 }), paw(s.w * 0.32, s.l * 0.3),
    part('rbox', legDims, s.body, { x: -s.w * 0.32, y: 0.17, z: -s.l * 0.3 }), paw(-s.w * 0.32, -s.l * 0.3),
  ]);

  const bodyParts = [
    part('rbox', [s.w, s.h, s.l, 0.13], s.body, { y: 0.3 + s.h / 2 }),
    part('rbox', [s.w * 0.72, s.h * 0.54, s.l * 0.72, 0.09], s.belly, { y: 0.3 + s.h * 0.34, z: 0.035 }),
    part('rbox', [s.w * 0.9, 0.09, s.l * 0.78, 0.035], s.accent, { y: 0.3 + s.h * 0.76, z: 0.02 }),
    part('sph', [0.055, 7], '#E7B64E', { x: 0, y: 0.3 + s.h * 0.69, z: s.l * 0.43 }),
  ];
  // Broad markings survive the gameplay camera and are merged into the body draw call. They make
  // variants identifiable by more than hue without adding textures, materials or save data.
  if (s.pattern === 'saddle' || s.pattern === 'calico' || s.pattern === 'cloud') {
    bodyParts.push(part('sph', [s.w * .38, 9], s.patch, { x: -s.w * .18, y: .3 + s.h * .88, z: -s.l * .08, sx: 1.05, sy: .28, sz: 1.5 }));
  }
  if (s.pattern === 'tabby' || s.pattern === 'constellation') {
    bodyParts.push(
      part('rbox', [s.w * .16, .035, s.l * .42, .016], s.patch, { x: -s.w * .18, y: .3 + s.h * 1.01, z: -.04, rz: -.10 }),
      part('rbox', [s.w * .14, .035, s.l * .34, .016], s.patch, { x: s.w * .17, y: .3 + s.h * 1.01, z: -.12, rz: .12 }),
    );
  }
  if (species === 'cat') bodyParts.push(part('rbox', [s.w * 0.42, s.h * 0.12, s.l * 0.28, 0.04], s.accent, { y: 0.3 + s.h * 0.86, z: -s.l * 0.14 }));
  if (species === 'dog') bodyParts.push(part('rbox', [s.w * 0.48, s.h * 0.28, s.l * 0.22, 0.06], s.earCol, { x: -s.w * 0.16, y: 0.3 + s.h * 0.68, z: s.l * 0.2 }));
  const bodyGeo = merge(bodyParts);

  const hw = s.w * (s.head || 1);
  const headParts = [
    part('rbox', [hw * 1.1, hw * 0.95, hw * 0.95, Math.min(.14, hw * .28)], s.body, { y: 0 }),
    part('sph', [0.05, 8], species === 'dog' ? '#5A3D30' : C.pink, { y: -0.07, z: s.w * 0.515 }),
    part('rbox', [s.w * 0.52, s.w * 0.29, s.w * 0.3, 0.065], s.belly, { y: -0.13, z: s.w * 0.405 }),
    part('box', [0.09, 0.018, 0.02], '#6F4B43', { x: -0.055, y: -0.19, z: s.w * 0.54, rz: -0.25 }),
    part('box', [0.09, 0.018, 0.02], '#6F4B43', { x: 0.055, y: -0.19, z: s.w * 0.54, rz: 0.25 }),
  ];
  if (s.pattern === 'tuxedo' || s.pattern === 'blaze' || s.pattern === 'mask') {
    const wide = s.pattern === 'mask';
    headParts.push(part('sph', [hw * (wide ? .31 : .19), 9], s.patch, {
      x: wide ? -hw * .2 : 0, y: hw * .13, z: hw * .49,
      sx: wide ? 1.25 : .72, sy: wide ? .9 : 1.45, sz: .20,
    }));
  }
  if (s.pattern === 'calico') {
    headParts.push(
      part('sph', [hw * .23, 8], s.patch, { x: -hw * .28, y: hw * .18, z: hw * .45, sx: 1.1, sy: .75, sz: .22 }),
      part('sph', [hw * .15, 8], s.accent, { x: hw * .28, y: -hw * .08, z: hw * .48, sx: 1.1, sy: .8, sz: .2 }),
    );
  }

  if (species === 'cat') {
    headParts.push(
      part('cone', [0.13, 0.29, 4], s.body, { x: -s.w * 0.32, y: s.w * 0.55, ry: Math.PI / 4 }),
      part('cone', [0.13, 0.29, 4], s.body, { x: s.w * 0.32, y: s.w * 0.55, ry: Math.PI / 4 }),
      part('cone', [0.075, 0.19, 4], s.earCol, { x: -s.w * 0.32, y: s.w * 0.56, z: 0.025, ry: Math.PI / 4 }),
      part('cone', [0.075, 0.19, 4], s.earCol, { x: s.w * 0.32, y: s.w * 0.56, z: 0.025, ry: Math.PI / 4 }),
      part('box', [0.25, 0.014, 0.014], '#6F4B43', { x: -0.18, y: -0.12, z: s.w * 0.55, rz: 0.12 }),
      part('box', [0.25, 0.014, 0.014], '#6F4B43', { x: 0.18, y: -0.12, z: s.w * 0.55, rz: -0.12 }),
    );
  }
  if (species === 'bunny') {
    const lop = s.ears === 'lop';
    const split = s.ears === 'split';
    const leftRot = lop ? 1.0 : .15, rightRot = lop || split ? -1.0 : -.15;
    const earY = lop ? s.w * .42 : s.w * .72;
    headParts.push(
      part('rbox', [.15, .58, .09, .05], s.body, { x: -s.w * (lop ? .48 : .25), y: earY, rz: leftRot }),
      part('rbox', [.15, .58, .09, .05], s.body, { x: s.w * ((lop || split) ? .48 : .25), y: split ? s.w * .48 : earY, rz: rightRot }),
      part('rbox', [.07, .42, .035, .02], s.earCol, { x: -s.w * (lop ? .48 : .25), y: earY, z: .05, rz: leftRot }),
      part('rbox', [.07, .42, .035, .02], s.earCol, { x: s.w * ((lop || split) ? .48 : .25), y: split ? s.w * .48 : earY, z: .05, rz: rightRot }),
    );
  }
  if (species === 'dog') {
    if (s.ears === 'upright') {
      headParts.push(
        part('cone', [.13, .34, 5], s.earCol, { x: -s.w * .38, y: s.w * .58, ry: Math.PI / 4 }),
        part('cone', [.13, .34, 5], s.earCol, { x: s.w * .38, y: s.w * .58, ry: Math.PI / 4 }),
      );
    } else if (s.ears === 'round') {
      headParts.push(
        part('sph', [s.w * .24, 8], s.earCol, { x: -s.w * .50, y: s.w * .31, sy: 1.2 }),
        part('sph', [s.w * .24, 8], s.earCol, { x: s.w * .50, y: s.w * .31, sy: 1.2 }),
      );
    } else {
      headParts.push(
        part('rbox', [.13, .4, .23, .05], s.earCol, { x: -s.w * .59, y: s.w * .34, rz: -.12 }),
        part('rbox', [.13, .4, .23, .05], s.earCol, { x: s.w * .59, y: s.w * .34, rz: .12 }),
      );
    }
    headParts.push(part('rbox', [s.w * .34, s.w * .11, .025, .02], s.accent, { x: -s.w * .17, y: .24, z: s.w * .46, rz: -.2 }));
  }
  if (species === 'hamster') {
    headParts.push(
      // chubby cheek pouches, bulging low on either side of the muzzle
      part('sph', [s.w * 0.34, 10], s.body, { x: -s.w * 0.52, y: -0.05, z: s.w * 0.16 }),
      part('sph', [s.w * 0.34, 10], s.body, { x: s.w * 0.52, y: -0.05, z: s.w * 0.16 }),
      // tiny round ears, low-poly hemispheres so they read as small rather than as flags
      part('sph', [s.w * 0.2, 8], s.earCol, { x: -s.w * 0.32, y: s.w * 0.6, z: -s.w * 0.05 }),
      part('sph', [s.w * 0.2, 8], s.earCol, { x: s.w * 0.32, y: s.w * 0.6, z: -s.w * 0.05 }),
    );
  }
  const headGeo = merge(headParts);

  let tailGeo;
  if (s.tail === 'long') tailGeo = merge([
    part('cyl', [0.055, 0.075, 0.62, 8], s.body, { y: 0.3, rx: 0.5 }),
    part('sph', [0.075, 8], s.belly, { y: 0.56, z: -0.13 }),
  ]);
  else if (s.tail === 'short') tailGeo = merge([
    part('cyl', [0.06, 0.075, 0.32, 8], s.body, { y: 0.15, rx: 0.9 }),
    part('sph', [0.07, 8], s.belly, { y: 0.26, z: -0.08 }),
  ]);
  // Hamsters (plan §3.7: "no visible tail") still get a real mesh here -- every P.update() branch
  // below reads/writes `tail.rotation.*` unconditionally -- but it is sized to effectively nothing
  // (a handful of triangles at a hair's width) so it never reads on screen.
  else if (s.tail === 'none') tailGeo = part('sph', [0.001, 4], s.body);
  else tailGeo = merge([part('sph', [0.13, 10], C.white), part('sph', [0.07, 8], '#F4E8E1', { y: 0.05, z: 0.08 })]);

  const bWaitGeo = merge([part('sph', [0.06, 8], C.white, { x: -0.15 }), part('sph', [0.06, 8], C.white), part('sph', [0.06, 8], C.white, { x: 0.15 })]);
  const bAngryGeo = merge([part('rbox', [0.08, 0.3, 0.08, 0.03], '#FF3B3B', { y: 0.05 }), part('sph', [0.06, 8], '#FF3B3B', { y: -0.2 })]);

  // Legendary coat (variant index 4, every species): a scatter of small emissive dots across the
  // back, rendered as a separate mesh (own material) that rides along as a child of `body`. Built
  // only for the legendary profile so the other 16 pets pay nothing for it.
  let sparkleGeo = null;
  if (isLegendaryProfile(petProfile(species, variant))) {
    const top = 0.3 + s.h;
    sparkleGeo = merge([
      part('sph', [0.026, 6], '#FFFFFF', { x: 0, y: top * 0.98, z: s.l * 0.22 }),
      part('sph', [0.022, 6], '#FFFFFF', { x: -s.w * 0.22, y: top * 0.88, z: -s.l * 0.05 }),
      part('sph', [0.022, 6], '#FFFFFF', { x: s.w * 0.22, y: top * 0.9, z: -s.l * 0.12 }),
      part('sph', [0.02, 6], '#FFFFFF', { x: 0, y: top * 0.7, z: -s.l * 0.32 }),
      part('sph', [0.02, 6], '#FFFFFF', { x: -s.w * 0.14, y: top * 0.95, z: -s.l * 0.18 }),
    ]);
  }

  const g = { legPairAGeo, legPairBGeo, bodyGeo, headGeo, tailGeo, bWaitGeo, bAngryGeo, sparkleGeo };
  _geoCache.set(cacheKey, g);
  return g;
}

export function createPet(species, variant = 0) {
  const s = specFor(species, variant); const group = new THREE.Group();
  // Only the cat's 'long' tail needs the sit-pose curl below; 'short' and 'puff' already sit clear.
  const CURLS_TAIL = s.tail === 'long';
  const G = geosFor(species, variant); const mat = toonMaterial();
  const legPairA = new THREE.Mesh(G.legPairAGeo, mat); legPairA.castShadow = false; legPairA.receiveShadow = true;
  const legPairB = new THREE.Mesh(G.legPairBGeo, mat); legPairB.castShadow = false; legPairB.receiveShadow = true;
  const body = new THREE.Mesh(G.bodyGeo, mat); body.castShadow = true; body.receiveShadow = true;
  const head = new THREE.Mesh(G.headGeo, mat); head.castShadow = false; head.receiveShadow = true;
  head.position.set(0, 0.3 + s.h + s.w * 0.35, s.l * 0.45);
  const tail = new THREE.Mesh(G.tailGeo, mat); tail.castShadow = false; tail.receiveShadow = true;
  tail.position.set(0, 0.3 + s.h * 0.6, -s.l * 0.5); group.add(legPairA, legPairB, body, head, tail);
  if (G.sparkleGeo) { const sparkle = new THREE.Mesh(G.sparkleGeo, _sparkleMat); sparkle.castShadow = false; sparkle.receiveShadow = false; body.add(sparkle); }
  const neck = new THREE.Object3D(); neck.position.set(0, -s.w * 0.35, s.w * 0.55); head.add(neck);

  const eyesGroup = new THREE.Group();
  const eyeMat = new THREE.MeshToonMaterial({ color: s.eye });
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  const eyeR = Math.max(.048, Math.min(.068, s.w * .112));
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 8, 8), eyeMat);
  leftEye.position.set(-s.w * 0.25, 0.065, s.w * 0.47);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 8, 8), eyeMat);
  rightEye.position.set(s.w * 0.25, 0.065, s.w * 0.47);
  const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.019, 6, 6), pupilMat);
  leftPupil.position.set(-s.w * 0.23, 0.087, s.w * 0.515);
  const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.019, 6, 6), pupilMat);
  rightPupil.position.set(s.w * 0.27, 0.087, s.w * 0.515);
  eyesGroup.add(leftEye, rightEye, leftPupil, rightPupil);
  head.add(eyesGroup);

  const bubble = new THREE.Group(); bubble.position.set(0, head.position.y + s.w * 0.9, 0); bubble.visible = false; group.add(bubble);
  const bWait = new THREE.Mesh(G.bWaitGeo, mat); bWait.castShadow = false; bWait.receiveShadow = true;
  const bAngry = new THREE.Mesh(G.bAngryGeo, mat); bAngry.castShadow = false; bAngry.receiveShadow = true;
  const bHappy = new THREE.Mesh(heartGeo(), _heartMat); bHappy.scale.setScalar(0.5);
  bubble.add(bWait, bAngry, bHappy);
  const mouth = new THREE.Group(); mouth.position.set(0, -0.05, s.w * 0.7); head.add(mouth);
  const isHamster = species === 'hamster';
  // Task 2.4 (plan §3.5): accessory mount points. One attachment per node at a time -- re-equipping
  // a slot cleanly detaches whatever mesh was there before mounting the new one, so a caller never
  // has to track what it previously attached.
  const _attached = { head: null, neck: null };
  const P = {
    group, neck, head, height: head.position.y + s.w * 0.6, species, variant: variant | 0,
    _t: Math.random() * 6, _mood: 'none', _carried: null, _sitting: false, _face: 0, _hop: 0,
    _blinkClock: 0, _nextBlink: 2.5 + ((variant | 0) % 3) * 0.8,
    // Real-time clock (P._t is a gait clock that speeds up 6x while walking, so it cannot drive
    // breathing). _tailLift is written by idleLife and READ by update as part of its damp target —
    // idleLife must never add to tail.rotation itself, because update damps from the tail's own
    // previous value and an additive offset would feed back into it every frame.
    _life: Math.random() * 7, _tailLift: 0, _lookY: 0,
    _stretchT: Math.random() * 17, _stretchEvery: 13 + Math.random() * 7,
    _trait: createPetTraitMotionState((variant + 1) * 0.29), _traitClock: null, _traitActive: false,
  };
  // Pets already squash and stretch through the hop path below, and P.update never touches
  // group.scale, so a caller may scale the group freely. pop() just borrows the hop.
  P.setBaseScale = s => { group.scale.setScalar(Number(s) > 0 ? Number(s) : 1); };
  P.pop = () => { P._hop = Math.max(P._hop, 0.34); };
  // Residents (systems/residentPets.js) never walk, so everything that reads as alive has to come
  // out of this rig. setLifePhase pins every one of its clocks to a caller-chosen offset, so a row
  // of decorative pets never blinks, breathes or stretches in lockstep AND stays reproducible
  // across reloads — unlike the Math.random seeds a customer's short-lived pet is happy with.
  P.setLifePhase = phase => {
    const v = Math.abs(Number(phase) || 0);
    P._life = v; P._t = v * 1.7;
    P._blinkClock = v % 2.4; P._nextBlink = 2.5 + (v % 2.5);
    P._stretchT = v % 17; P._stretchEvery = 13 + (v % 7);
  };
  // Layered on top of whatever pose P.update just wrote, so it must be called immediately AFTER it.
  // Two cues update() cannot own: an occasional stretch/yawn, and a head turn toward something
  // nearby. `lookYaw` is the target bearing already expressed relative to this pet's own facing —
  // the caller owns the world transform (residents are parented under a furniture perch, so
  // group.position is not their world position), this only owns the pose.
  P.idleLife = (dt, opts = {}) => {
    const step = Math.min(0.12, Math.max(0, Number(dt) || 0));
    P._stretchT += step;
    while (P._stretchT >= P._stretchEvery) P._stretchT -= P._stretchEvery;
    let lift = 0;
    if (!opts.reducedMotion && P._stretchT < STRETCH_DUR) {
      const p = P._stretchT / STRETCH_DUR, e = Math.sin(p * Math.PI) ** 2;
      head.rotation.x -= 0.36 * e;                                   // nose up — the yawn
      head.rotation.z += Math.sin(p * Math.PI * 2) * 0.11 * e;
      body.scale.y *= 1 + 0.06 * e;                                  // ribcage lengthens
      body.scale.z *= 1 + 0.05 * e;
      lift = 0.3 * e;
    }
    P._tailLift = lift;
    const yaw = Number(opts.lookYaw);
    const want = opts.reducedMotion || !Number.isFinite(yaw) ? 0 : Math.max(-0.7, Math.min(0.7, yaw));
    P._lookY = damp(P._lookY, want, 3.5, step);
    head.rotation.y += P._lookY;
    body.rotation.z += P._lookY * 0.05;
  };
  P.setMood = m => { P._mood = m; bubble.visible = m !== 'none'; bWait.visible = m === 'wait'; bAngry.visible = m === 'angry'; bHappy.visible = m === 'happy'; };
  P.carry = m => { if (P._carried) mouth.remove(P._carried); P._carried = m; if (m) { m.position.set(0, 0, 0); m.scale.setScalar(0.8); mouth.add(m); } };
  // Task 2.4: mount (or clear, when mesh is falsy) one accessory on the 'head' or 'neck' node. The
  // pet rig owns the mount points; data/accessories.js owns what gets built and unlock rules.
  P.attach = (node, mesh) => {
    const key = node === 'neck' ? 'neck' : 'head';
    const target = key === 'neck' ? neck : head;
    if (_attached[key]) { target.remove(_attached[key]); _attached[key] = null; }
    if (mesh && mesh.isObject3D) { _attached[key] = mesh; target.add(mesh); }
    return _attached[key];
  };
  P.sit = () => { P._sitting = true; };
  P.stand = () => { P._sitting = false; };
  P.setHop = h => { P._hop = h; };
  P.social = (dt, { state = '', target = null, reducedMotion = false } = {}) => {
    const changed = P._socialState !== state;
    P._socialState = state;
    const near = target && Math.hypot(target.x - group.position.x, target.z - group.position.z) < 2.5;
    P._socialCooldown = Math.max(0, (P._socialCooldown || 0) - dt);
    if (reducedMotion || P._moving || P._traitActive) { P._socialT = 0; return; }
    if (!P._socialCooldown && ((near && !P._socialNear) || (changed && ['eating', 'atBowl', 'atRegister'].includes(state)))) {
      P._socialT = 1.9; P._socialCooldown = 9 + (variant | 0);
    }
    P._socialNear = near;
    P._socialT = Math.max(0, (P._socialT || 0) - dt);
    if (!P._socialT) return;
    const pose = petSocialPose(species, variant, 1 - P._socialT / 1.9, state === 'eating' || state === 'atBowl' ? 'eat' : 'greet');
    head.rotation.z += pose.tilt; head.rotation.x += pose.nod;
    tail.rotation.y = pose.wag;
    body.scale.y *= 1 + pose.squash;
    if (near) { const a = Math.atan2(target.x - group.position.x, target.z - group.position.z) - group.rotation.y; head.rotation.y += Math.max(-.55, Math.min(.55, Math.atan2(Math.sin(a), Math.cos(a)))) * Math.sin(Math.PI * (1 - P._socialT / 1.9)); }
  };
  P.update = (dt, moving, hop) => {
    P._moving = !!moving;
    head.rotation.y = 0;
    body.rotation.z = 0;
    if (hop !== undefined) P._hop = hop;
    P._t += dt * (moving ? 12 : 2);
    P._life += dt;
    // Task 2.6 (plan §3.7): hamsters sit up on their hind legs at idle rather than standing flat --
    // reuse the existing fold pose below (only ever previously entered by an explicit P.sit()) for
    // that stance, gated on species so cat/dog/bunny locomotion is untouched.
    const hamsterIdle = isHamster && !moving && !P._sitting;
    if (P._sitting || hamsterIdle) {
      // A sit that keeps every paw above whatever the pet is sitting ON. The old pose rotated BOTH
      // leg pairs by -1.2 rad, and because each pair holds one FRONT and one REAR leg that swung
      // the front legs up into the chest and drove the rear legs 0.27 m below y = 0. Hidden by
      // opaque café tiles; glaring the moment a resident sits on a 1.2 m windowsill. The pose is
      // now a fold — legs shorten to 60 %, tuck 0.12 rad, the body drops the same 0.12 as before
      // (which is what keeps the head meeting the shoulders) — and nothing dips past y = -0.05.
      legPairA.rotation.x = damp(legPairA.rotation.x, -0.12, 10, dt); legPairB.rotation.x = damp(legPairB.rotation.x, -0.12, 10, dt);
      const fold = damp(legPairA.scale.y, 0.6, 10, dt);
      legPairA.scale.y = fold; legPairB.scale.y = fold;
      body.position.y = damp(body.position.y, -0.12, 10, dt);
      // Lean the body upright on the haunches -- the "sits up on hind legs" silhouette. Only ever
      // written for hamster, so cat/dog/bunny's body.rotation.x stays untouched at its default 0.
      if (isHamster) body.rotation.x = damp(body.rotation.x, -0.16, 8, dt);
      tail.rotation.y = damp(tail.rotation.y, Math.sin(P._life * 0.9) * 0.16, 6, dt);
      if (CURLS_TAIL) {
        // The cat's 'long' tail is a 0.62 m rod, and straight in the sit pose it read as a loose
        // line hanging off the back of the pet — the stray line in the owner's resident screenshot.
        // Curl it around the flank and shorten it to 72 %: Euler order XYZ applies Rz before Rx, so
        // the z swings the tail out to the side first and the x then brings it forward, landing the
        // tip beside the hip at about y 0.47 / z -0.14 instead of out behind the rump at y 1.02.
        tail.rotation.x = damp(tail.rotation.x, 1.5 - P._tailLift, 8, dt);
        tail.rotation.z = damp(tail.rotation.z, 0.9 + Math.sin(P._life * 0.8) * 0.1, 8, dt);
        const curl = damp(tail.scale.x, 0.72, 8, dt); tail.scale.setScalar(curl);
      } else {
        tail.rotation.x = damp(tail.rotation.x, -0.9 - P._tailLift, 10, dt);
        tail.rotation.z = damp(tail.rotation.z, 0, 10, dt);
      }
    } else if (isHamster) {
      // Hop gait (plan §3.7): both leg pairs tuck together on each bound instead of the
      // alternating diagonal trot every other species uses, and the body bounces on each hop.
      const hopPhase = Math.abs(Math.sin(P._t * 0.9));
      legPairA.rotation.x = -0.5 * hopPhase; legPairB.rotation.x = -0.5 * hopPhase;
      if (legPairA.scale.y !== 1) {
        let unfold = damp(legPairA.scale.y, 1, 10, dt);
        if (Math.abs(unfold - 1) < 0.004) unfold = 1;
        legPairA.scale.y = unfold; legPairB.scale.y = unfold;
      }
      body.position.y = damp(body.position.y, hopPhase * 0.1, 10, dt);
      body.rotation.x = damp(body.rotation.x, 0, 8, dt);
      tail.rotation.y = Math.sin(P._t * 1.3) * 0.3;
    } else {
      const sw = moving ? Math.sin(P._t) * 0.7 : 0;
      legPairA.rotation.x = sw; legPairB.rotation.x = -sw;
      if (legPairA.scale.y !== 1) {
        let unfold = damp(legPairA.scale.y, 1, 10, dt);
        if (Math.abs(unfold - 1) < 0.004) unfold = 1;
        legPairA.scale.y = unfold; legPairB.scale.y = unfold;
      }
      body.position.y = damp(body.position.y, moving ? Math.abs(Math.sin(P._t)) * 0.04 : 0, 12, dt);
      tail.rotation.y = Math.sin(P._t * 1.3) * 0.5;
      tail.rotation.x = damp(tail.rotation.x, Math.sin(P._t * 0.7) * 0.2 - P._tailLift, 10, dt);
      if (tail.rotation.z !== 0 || tail.scale.x !== 1) {
        let z = damp(tail.rotation.z, 0, 10, dt); if (Math.abs(z) < 0.004) z = 0;
        let k = damp(tail.scale.x, 1, 10, dt); if (Math.abs(k - 1) < 0.004) k = 1;
        tail.rotation.z = z; tail.scale.setScalar(k);
      }
    }
    head.rotation.z = Math.sin(P._t * 0.5) * 0.05;
    head.rotation.x = moving ? Math.sin(P._t * 0.5) * 0.035 : Math.sin(P._t * 0.32) * 0.02;
    if (P._mood === 'happy') {
      head.rotation.z += Math.sin(P._t * 3) * 0.08;
      tail.rotation.y = Math.sin(P._t * 3) * 0.8;
    }
    // Blinking
    P._blinkClock += dt;
    if (P._blinkClock >= P._nextBlink) {
      const elapsed = P._blinkClock - P._nextBlink;
      if (elapsed < 0.12) {
        eyesGroup.scale.y = 0.1;
      } else {
        eyesGroup.scale.y = 1;
        P._blinkClock = 0;
        // Seeded off the pet's own life clock rather than Math.random, so a resident given a fixed
        // phase by setLifePhase blinks REPRODUCIBLY — the visual-reference and responsive-audit
        // workflows compare frames across runs, and a random blink makes every one of those
        // comparisons noisy. A customer's pet still seeds _life randomly, so it keeps its variety.
        const seed = Math.sin(P._life * 91.7 + 12.9898) * 43758.5453;
        P._nextBlink = 2.5 + (seed - Math.floor(seed)) * 2.5;
      }
    }
    // Squash and stretch
    if (P._hop > 0) {
      const hopRatio = Math.min(1, P._hop / 0.4);
      const hopPhase = Math.sin(hopRatio * Math.PI);
      body.scale.set(1 - hopPhase * 0.1, 1 + hopPhase * 0.18, 1 - hopPhase * 0.1);
    } else {
      // Breathing: +-2 % on the body's y at ~0.3 Hz (2*pi*0.3 = 1.885 rad/s). One multiply, and it
      // is most of the difference between a pet that is idle and a pet that is a prop.
      body.scale.set(1, 1 + Math.sin(P._life * 1.885) * 0.02, 1);
    }
    group.position.y = P._hop > 0 ? Math.sin(Math.min(1, P._hop / 0.4) * Math.PI) * 0.35 : 0;
    bubble.rotation.y += dt * 2; bubble.position.y = P.height + 0.25 + Math.sin(P._t * 0.8) * 0.04;
  };
  // Task 35: short context-owned personality clips layered over the current idle pose.
  // They never alter group x/z, target, mover state, inventory or simulation timing.
  P.react = (name, time, target, reducedMotion = false) => {
    const now = Number(time) || 0;
    const traitDt = P._traitClock == null ? 0 : Math.max(0, now - P._traitClock);
    P._traitClock = now;
    const distance = target ? Math.hypot(target.x - group.position.x, target.z - group.position.z) : Infinity;
    const result = stepPetTraitMotion(P._trait, name, traitDt, {
      idle: !P._moving && P._mood === 'none',
      context: petTraitContextActive(name, target, distance),
      reducedMotion,
    });
    P._traitActive = !!result.active;
    if (!result.active || !target) return;

    const angle = Math.atan2(target.x - group.position.x, target.z - group.position.z) - group.rotation.y;
    const gaze = Math.atan2(Math.sin(angle), Math.cos(angle));
    const pose = petTraitPose(name, result.progress, gaze);
    if (!pose) return;
    head.rotation.y = pose.headY;
    head.rotation.x += pose.headX;
    head.rotation.z += pose.headZ;
    body.rotation.z += pose.bodyZ || 0;
    if (pose.tailY == null) tail.rotation.y *= pose.tailScale;
    else tail.rotation.y = pose.tailY;
  };
  P.followTarget = (hx, hz, hrot, dt) => {
    const fx = Math.sin(hrot), fz = Math.cos(hrot), rx = Math.cos(hrot), rz = -Math.sin(hrot);
    const goalX = hx - fx * 0.9 + rx * 0.45, goalZ = hz - fz * 0.9 + rz * 0.45;
    const px = group.position.x, pz = group.position.z;
    const nx = damp(px, goalX, 8, dt), nz = damp(pz, goalZ, 8, dt);
    const dt2 = Math.max(dt, 1e-4); const vx = (nx - px) / dt2, vz = (nz - pz) / dt2;
    group.position.x = nx; group.position.z = nz;
    const speed = Math.hypot(vx, vz);
    if (speed > 0.05) P._face = Math.atan2(vx, vz);
    let d = P._face - group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); group.rotation.y += d * Math.min(1, dt * 10);
    P.update(dt, speed > 0.15, P._hop);
  };
  return P;
}

let _heart = null;
export function heartGeo() {
  if (_heart) return _heart;
  const sh = new THREE.Shape(); sh.moveTo(0, -0.5); sh.bezierCurveTo(-0.9, 0.2, -0.5, 0.9, 0, 0.45); sh.bezierCurveTo(0.5, 0.9, 0.9, 0.2, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }); g.center(); g.deleteAttribute('uv');
  return _heart = g;
}
