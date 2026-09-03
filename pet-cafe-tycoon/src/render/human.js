// src/render/human.js — blocky toy human (customers, runner, cashier, owner).
// Meshes: legL, legR, body+head (merged, one draw), armL, armR = 5. Only the merged
// body+head mesh casts a shadow (legs/arms swing independently and skip the shadow pass).
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { C, toonMaterial } from './palette.js';
import { damp } from '../core/tween.js';

// I7: mood bubble parts — same shapes the pet's bubble uses (three white dots for 'wait', a red
// exclamation mark for 'angry'), no heart (the pet keeps that one for 'seated', via fx.hearts).
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
  return _legGeo = merge([part('rbox', [0.22, 0.55, 0.26, 0.06], C.ink, { y: -0.275 })]);
}

const _geoCache = new Map();
function geosFor(role, shirtHex, hairHex, skinHex) {
  const key = role + '|' + shirtHex + '|' + hairHex + '|' + skinHex;
  let g = _geoCache.get(key);
  if (g) return g;
  const bodyParts = [part('rbox', [0.62, 0.72, 0.42, 0.1], shirtHex, { y: 0.95 })];
  if (role === 'runner' || role === 'owner') bodyParts.push(part('rbox', [0.5, 0.55, 0.08, 0.04], C.cream, { y: 0.86, z: 0.23 }));   // apron
  if (role === 'cashier') bodyParts.push(part('rbox', [0.56, 0.4, 0.06, 0.04], C.accent, { y: 1.06, z: 0.22 }));                     // vest
  const armGeo = merge([
    part('rbox', [0.16, 0.55, 0.16, 0.05], shirtHex, { y: -0.275 }),
    part('sph', [0.09, 8], skinHex, { y: -0.56 }),
  ]);
  const headParts = [
    part('rbox', [0.5, 0.5, 0.5, 0.14], skinHex, { y: 1.62 }),
    part('sph', [0.045, 8], C.ink, { x: -0.11, y: 1.65, z: 0.27 }), part('sph', [0.045, 8], C.ink, { x: 0.11, y: 1.65, z: 0.27 }),
    part('sph', [0.045, 8], C.pink, { x: -0.19, y: 1.55, z: 0.25 }), part('sph', [0.045, 8], C.pink, { x: 0.19, y: 1.55, z: 0.25 }),
  ];
  if (role === 'owner') {
    headParts.push(part('cyl', [0.28, 0.3, 0.12, 12], C.cream, { y: 1.94 }), part('sph', [0.28, 12], C.cream, { y: 2.08, sy: 0.7 }));   // chef hat
  } else {
    const capHex = role === 'runner' ? C.cream : hairHex;
    headParts.push(part('rbox', [0.54, 0.18, 0.54, 0.08], capHex, { y: 1.86 }));           // cap
    headParts.push(part('box', [0.5, 0.14, 0.12], capHex, { y: 1.78, z: 0.22 }));          // front fringe
  }
  // body + head share the exact same per-frame transform (both just bob by the same amount, no
  // independent rotation), so they're merged into one draw call; legs and arms swing independently
  // and stay separate meshes.
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
  // legs and arms swing independently frame to frame, so they don't cast shadows (draw-call budget:
  // the shadow pass would otherwise double their cost) — the merged body+head mesh still grounds
  // everyone with a real shadow.
  const legL = new THREE.Mesh(G.legGeo, mat); legL.position.set(-0.15, HIP_Y, 0); legL.castShadow = false; legL.receiveShadow = true;
  const legR = new THREE.Mesh(G.legGeo, mat); legR.position.set(0.15, HIP_Y, 0); legR.castShadow = false; legR.receiveShadow = true;
  const bodyHead = new THREE.Mesh(G.bodyHeadGeo, mat); bodyHead.castShadow = true; bodyHead.receiveShadow = true;
  const armL = new THREE.Mesh(G.armGeo, mat); armL.position.set(-0.44, SHOULDER_Y, 0); armL.castShadow = false; armL.receiveShadow = true;
  const armR = new THREE.Mesh(G.armGeo, mat); armR.position.set(0.44, SHOULDER_Y, 0); armR.castShadow = false; armR.receiveShadow = true;
  group.add(legL, legR, bodyHead, armL, armR);
  const hand = new THREE.Object3D(); hand.position.set(0, -0.56, 0); armR.add(hand);
  const stack = new THREE.Group(); stack.position.set(0, 1.05, 0.42); group.add(stack);

  // I7: mood bubble, positioned above the head.
  const bubble = new THREE.Group(); bubble.position.set(0, 2.25, 0); bubble.visible = false; group.add(bubble);
  const bWait = new THREE.Mesh(bWaitGeo(), mat); bWait.castShadow = false; bWait.receiveShadow = true;
  const bAngry = new THREE.Mesh(bAngryGeo(), mat); bAngry.castShadow = false; bAngry.receiveShadow = true;
  bubble.add(bWait, bAngry);

  const H = { group, hand, stack, height: 1.95, _t: 0, _idleT: Math.random() * 6, _face: 0, _carryN: 0, _armBase: 0, _sitting: false, _tapT: 0 };
  H.setCarry = n => { H._carryN = n | 0; };
  H.setMood = m => { bubble.visible = m !== 'none'; bWait.visible = m === 'wait'; bAngry.visible = m === 'angry'; };
  // I7/T3: the register "cha-ching" tap — a brief right-arm bump (reuses the walk-cycle swing
  // amplitude) independent of movement/carry state, for the owner/cashier each time a register
  // processes a customer. 0.2s one-shot; a fresh call while one is still playing just restarts it.
  H.tap = () => { H._tapT = 0.2; };
  // I6: sit lowers the group and bends the legs back under the table; stand restores the walk pose.
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
      const k = Math.sin((1 - H._tapT / 0.2) * Math.PI); // 0 -> 1 -> 0 bump over 0.2s
      armR.rotation.x -= k * 0.6;
    }
  };
  return H;
}
