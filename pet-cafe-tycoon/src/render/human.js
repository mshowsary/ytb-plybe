// src/render/human.js — stylized café people with merged detail geometry and a five-draw-call budget.
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { C, toonMaterial } from './palette.js';
import { damp } from '../core/tween.js';

let _bWaitGeo = null, _bAngryGeo = null;
function bWaitGeo() { return _bWaitGeo || (_bWaitGeo = merge([part('sph', [0.06, 8], C.white, { x: -0.15 }), part('sph', [0.06, 8], C.white), part('sph', [0.06, 8], C.white, { x: 0.15 })])); }
function bAngryGeo() { return _bAngryGeo || (_bAngryGeo = merge([part('rbox', [0.08, 0.3, 0.08, 0.03], '#FF3B3B', { y: 0.05 }), part('sph', [0.06, 8], '#FF3B3B', { y: -0.2 })])); }

export const SHIRTS = ['#FFB3C1', '#8FD3FF', '#FFE08A', '#B5F2C8', '#D9B8FF'];
export const HAIR = ['#3B2E2A', '#8A5A2B', '#E8C36A', '#C94F3D'];
export const SKIN = ['#FFD9B3', '#E0B48C', '#A9744F'];

const HIP_Y = 0.55, SHOULDER_Y = 1.25;

let _legGeo = null;
function legGeo() {
  if (_legGeo) return _legGeo;
  _legGeo = merge([
    part('rbox', [0.22, 0.5, 0.25, 0.055], C.ink, { y: -0.25 }),
    part('rbox', [0.28, 0.14, 0.38, 0.045], '#584741', { y: -0.54, z: 0.055 }),
    part('box', [0.26, 0.035, 0.36], '#2D2725', { y: -0.62, z: 0.055 }),
  ]);
  return _legGeo;
}

const _geoCache = new Map();
function geosFor(role, shirtHex, hairHex, skinHex) {
  const key = role + '|' + shirtHex + '|' + hairHex + '|' + skinHex;
  let g = _geoCache.get(key);
  if (g) return g;

  const bodyParts = [
    part('rbox', [0.64, 0.7, 0.43, 0.1], shirtHex, { y: 0.95 }),
    part('rbox', [0.5, 0.11, 0.045, 0.025], C.cream, { y: 1.23, z: 0.235 }),
  ];

  if (role === 'runner' || role === 'owner') {
    bodyParts.push(
      part('rbox', [0.51, 0.54, 0.075, 0.035], C.cream, { y: 0.86, z: 0.235 }),
      part('rbox', [0.31, 0.19, 0.035, 0.02], '#F5E5CF', { y: 0.8, z: 0.283 }),
      part('box', [0.54, 0.055, 0.05], '#E9D4BA', { y: 1.04, z: 0.27 }),
    );
  }
  if (role === 'cashier') {
    bodyParts.push(
      part('rbox', [0.56, 0.42, 0.055, 0.03], C.accent, { y: 1.02, z: 0.225 }),
      part('sph', [0.035, 7], '#FFF4E6', { x: -0.13, y: 1.08, z: 0.26 }),
      part('sph', [0.035, 7], '#FFF4E6', { x: 0.13, y: 1.08, z: 0.26 }),
    );
  }

  const armParts = [
    part('rbox', [0.17, 0.49, 0.17, 0.05], shirtHex, { y: -0.245 }),
    part('rbox', [0.18, 0.08, 0.18, 0.03], role === 'owner' || role === 'runner' ? C.cream : shirtHex, { y: -0.5 }),
    part('sph', [0.1, 8], skinHex, { y: -0.59 }),
  ];
  const armGeo = merge(armParts);

  const faceZ = 0.275;
  const headParts = [
    part('rbox', [0.5, 0.5, 0.5, 0.14], skinHex, { y: 1.62 }),
    part('sph', [0.07, 8], skinHex, { x: -0.27, y: 1.62, z: 0 }),
    part('sph', [0.07, 8], skinHex, { x: 0.27, y: 1.62, z: 0 }),
    part('sph', [0.05, 8], C.ink, { x: -0.11, y: 1.67, z: faceZ }),
    part('sph', [0.05, 8], C.ink, { x: 0.11, y: 1.67, z: faceZ }),
    part('sph', [0.017, 6], '#FFFFFF', { x: -0.095, y: 1.686, z: faceZ + 0.04 }),
    part('sph', [0.017, 6], '#FFFFFF', { x: 0.125, y: 1.686, z: faceZ + 0.04 }),
    part('sph', [0.035, 7], '#C98A73', { y: 1.58, z: faceZ + 0.025 }),
    part('box', [0.11, 0.022, 0.025], '#71453D', { y: 1.505, z: faceZ + 0.032 }),
    part('sph', [0.045, 8], C.pink, { x: -0.19, y: 1.55, z: 0.25 }),
    part('sph', [0.045, 8], C.pink, { x: 0.19, y: 1.55, z: 0.25 }),
  ];

  if (role === 'owner') {
    headParts.push(
      part('cyl', [0.29, 0.3, 0.12, 12], '#F7ECDD', { y: 1.92 }),
      part('rbox', [0.54, 0.12, 0.48, 0.05], C.cream, { y: 1.92 }),
      part('sph', [0.23, 12], C.cream, { x: -0.18, y: 2.08, sy: 0.82 }),
      part('sph', [0.26, 12], C.cream, { y: 2.13, sy: 0.82 }),
      part('sph', [0.23, 12], C.cream, { x: 0.18, y: 2.08, sy: 0.82 }),
      part('box', [0.22, 0.055, 0.035], C.coral, { y: 1.36, z: 0.23, rz: 0.36 }),
      part('box', [0.22, 0.055, 0.035], C.coral, { y: 1.36, z: 0.23, rz: -0.36 }),
    );
  } else if (role === 'runner') {
    headParts.push(
      part('rbox', [0.55, 0.18, 0.53, 0.08], C.cream, { y: 1.86 }),
      part('box', [0.35, 0.08, 0.23], C.cream, { y: 1.79, z: 0.31 }),
      part('rbox', [0.46, 0.13, 0.43, 0.05], hairHex, { y: 1.79, z: -0.04 }),
    );
  } else {
    headParts.push(
      part('rbox', [0.53, 0.2, 0.52, 0.09], hairHex, { y: 1.84, z: -0.02 }),
      part('rbox', [0.48, 0.2, 0.12, 0.05], hairHex, { y: 1.78, z: 0.23 }),
      part('rbox', [0.1, 0.27, 0.43, 0.05], hairHex, { x: -0.245, y: 1.72, z: -0.03 }),
      part('rbox', [0.1, 0.27, 0.43, 0.05], hairHex, { x: 0.245, y: 1.72, z: -0.03 }),
    );
    if (role === 'cashier') {
      headParts.push(part('rbox', [0.2, 0.065, 0.04, 0.025], C.accent, { y: 1.87, z: 0.27 }));
    }
  }

  const bodyHeadGeo = merge([...bodyParts, ...headParts]);
  g = { legGeo: legGeo(), bodyHeadGeo, armGeo };
  _geoCache.set(key, g);
  return g;
}

export function createHuman(variant = {}, role = 'customer') {
  const shirtHex = typeof variant.shirt === 'string' ? variant.shirt : SHIRTS[variant.shirt ?? 0];
  const hairHex = HAIR[variant.hair ?? 0];
  const skinHex = SKIN[variant.skin ?? 0];
  const G = geosFor(role, shirtHex, hairHex, skinHex);
  const mat = toonMaterial();
  const group = new THREE.Group();
  const legL = new THREE.Mesh(G.legGeo, mat); legL.position.set(-0.15, HIP_Y, 0); legL.castShadow = false; legL.receiveShadow = true;
  const legR = new THREE.Mesh(G.legGeo, mat); legR.position.set(0.15, HIP_Y, 0); legR.castShadow = false; legR.receiveShadow = true;
  const bodyHead = new THREE.Mesh(G.bodyHeadGeo, mat); bodyHead.castShadow = true; bodyHead.receiveShadow = true;
  const armL = new THREE.Mesh(G.armGeo, mat); armL.position.set(-0.44, SHOULDER_Y, 0); armL.castShadow = false; armL.receiveShadow = true;
  const armR = new THREE.Mesh(G.armGeo, mat); armR.position.set(0.44, SHOULDER_Y, 0); armR.castShadow = false; armR.receiveShadow = true;
  group.add(legL, legR, bodyHead, armL, armR);
  const hand = new THREE.Object3D(); hand.position.set(0, -0.59, 0); armR.add(hand);
  const stack = new THREE.Group(); stack.position.set(0, 1.05, 0.42); group.add(stack);

  const bubble = new THREE.Group(); bubble.position.set(0, 2.25, 0); bubble.visible = false; group.add(bubble);
  const bWait = new THREE.Mesh(bWaitGeo(), mat); bWait.castShadow = false; bWait.receiveShadow = true;
  const bAngry = new THREE.Mesh(bAngryGeo(), mat); bAngry.castShadow = false; bAngry.receiveShadow = true;
  bubble.add(bWait, bAngry);

  const H = { group, hand, stack, height: 2.04, _t: 0, _idleT: Math.random() * 6, _face: 0, _carryN: 0, _armBase: 0, _sitting: false, _tapT: 0 };
  H.setCarry = n => { H._carryN = n | 0; };
  H.setMood = m => { bubble.visible = m !== 'none'; bWait.visible = m === 'wait'; bAngry.visible = m === 'angry'; };
  H.tap = () => { H._tapT = 0.2; };
  H.sit = () => { H._sitting = true; group.position.y = -0.35; legL.rotation.x = -1.5; legR.rotation.x = -1.5; };
  H.stand = () => { H._sitting = false; group.position.y = 0; legL.rotation.x = 0; legR.rotation.x = 0; };
  H.update = (dt, vx, vz) => {
    const sp = Math.hypot(vx, vz); const moving = sp > 0.05;
    if (moving) H._face = Math.atan2(vx, vz);
    let d = H._face - group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); group.rotation.y += d * Math.min(1, dt * 14);
    H._t += dt * (moving ? 11 : 0); H._idleT += dt * 2;
    const sw = moving ? Math.sin(H._t) * 0.6 : 0;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    const bob = moving ? Math.abs(Math.sin(H._t)) * 0.05 : Math.sin(H._idleT) * 0.02;
    bodyHead.position.y = bob;
    H._armBase = damp(H._armBase, H._carryN > 0 ? -1.35 : 0, 20, dt);
    const armSwing = H._carryN > 0 ? 0 : (moving ? Math.sin(H._t) * 0.35 : 0);
    armL.position.y = SHOULDER_Y + bob; armR.position.y = SHOULDER_Y + bob;
    armL.rotation.x = H._armBase - armSwing; armR.rotation.x = H._armBase + armSwing;
    if (H._tapT > 0) {
      H._tapT = Math.max(0, H._tapT - dt);
      const k = Math.sin((1 - H._tapT / 0.2) * Math.PI);
      armR.rotation.x -= k * 0.6;
    }
  };
  return H;
}
