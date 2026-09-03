// src/render/pets.js — expressive stylized pets from merged primitives, kept at <= 6 draw calls.
import * as THREE from 'three';
import { part, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial } from './palette.js';
import { damp } from '../core/tween.js';

const SPEC = {
  cat:   { body: C.cat,   belly: C.cream, ear: 'cone',  earCol: '#E6A5A0', tail: 'long',  eye: C.ink, w: 0.5, h: 0.42, l: 0.8, accent: '#F3C16B' },
  dog:   { body: C.dog,   belly: C.cream, ear: 'flop',  earCol: '#B98C64', tail: 'short', eye: C.ink, w: 0.56, h: 0.48, l: 0.9, accent: '#75BCE8' },
  bunny: { body: C.bunny, belly: C.pink,  ear: 'tall',  earCol: C.pink,  tail: 'puff',  eye: C.ink, w: 0.46, h: 0.4, l: 0.7, accent: '#9B82E8' },
};
const _heartMat = emissiveMaterial(C.coral);
const _geoCache = new Map();

function geosFor(species) {
  if (_geoCache.has(species)) return _geoCache.get(species);
  const s = SPEC[species] || SPEC.cat;
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
  if (species === 'cat') bodyParts.push(part('rbox', [s.w * 0.42, s.h * 0.12, s.l * 0.28, 0.04], '#B7A6A0', { y: 0.3 + s.h * 0.86, z: -s.l * 0.14 }));
  if (species === 'dog') bodyParts.push(part('rbox', [s.w * 0.48, s.h * 0.28, s.l * 0.22, 0.06], '#B98C64', { x: -s.w * 0.16, y: 0.3 + s.h * 0.68, z: s.l * 0.2 }));
  const bodyGeo = merge(bodyParts);

  const headParts = [
    part('rbox', [s.w * 1.1, s.w * 0.95, s.w * 0.95, 0.14], s.body, { y: 0 }),
    part('sph', [0.058, 8], s.eye, { x: -s.w * 0.25, y: 0.065, z: s.w * 0.47 }),
    part('sph', [0.058, 8], s.eye, { x: s.w * 0.25, y: 0.065, z: s.w * 0.47 }),
    part('sph', [0.019, 6], '#FFFFFF', { x: -s.w * 0.23, y: 0.087, z: s.w * 0.515 }),
    part('sph', [0.019, 6], '#FFFFFF', { x: s.w * 0.27, y: 0.087, z: s.w * 0.515 }),
    part('sph', [0.05, 8], species === 'dog' ? '#5A3D30' : C.pink, { y: -0.07, z: s.w * 0.515 }),
    part('rbox', [s.w * 0.52, s.w * 0.29, s.w * 0.3, 0.065], s.belly, { y: -0.13, z: s.w * 0.405 }),
    part('box', [0.09, 0.018, 0.02], '#6F4B43', { x: -0.055, y: -0.19, z: s.w * 0.54, rz: -0.25 }),
    part('box', [0.09, 0.018, 0.02], '#6F4B43', { x: 0.055, y: -0.19, z: s.w * 0.54, rz: 0.25 }),
  ];

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
    headParts.push(
      part('rbox', [0.15, 0.58, 0.09, 0.05], s.body, { x: -s.w * 0.25, y: s.w * 0.72, rz: 0.15 }),
      part('rbox', [0.15, 0.58, 0.09, 0.05], s.body, { x: s.w * 0.25, y: s.w * 0.72, rz: -0.15 }),
      part('rbox', [0.07, 0.42, 0.035, 0.02], s.earCol, { x: -s.w * 0.25, y: s.w * 0.73, z: 0.05, rz: 0.15 }),
      part('rbox', [0.07, 0.42, 0.035, 0.02], s.earCol, { x: s.w * 0.25, y: s.w * 0.73, z: 0.05, rz: -0.15 }),
    );
  }
  if (species === 'dog') {
    headParts.push(
      part('rbox', [0.13, 0.4, 0.23, 0.05], s.earCol, { x: -s.w * 0.59, y: s.w * 0.34, rz: -0.12 }),
      part('rbox', [0.13, 0.4, 0.23, 0.05], s.earCol, { x: s.w * 0.59, y: s.w * 0.34, rz: 0.12 }),
      part('rbox', [s.w * 0.34, s.w * 0.11, 0.025, 0.02], '#B98C64', { x: -s.w * 0.17, y: 0.24, z: s.w * 0.46, rz: -0.2 }),
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
  else tailGeo = merge([part('sph', [0.13, 10], C.white), part('sph', [0.07, 8], '#F4E8E1', { y: 0.05, z: 0.08 })]);

  const bWaitGeo = merge([part('sph', [0.06, 8], C.white, { x: -0.15 }), part('sph', [0.06, 8], C.white), part('sph', [0.06, 8], C.white, { x: 0.15 })]);
  const bAngryGeo = merge([part('rbox', [0.08, 0.3, 0.08, 0.03], '#FF3B3B', { y: 0.05 }), part('sph', [0.06, 8], '#FF3B3B', { y: -0.2 })]);
  const g = { legPairAGeo, legPairBGeo, bodyGeo, headGeo, tailGeo, bWaitGeo, bAngryGeo };
  _geoCache.set(species, g);
  return g;
}

export function createPet(species) {
  const s = SPEC[species] || SPEC.cat; const group = new THREE.Group();
  const G = geosFor(species); const mat = toonMaterial();
  const legPairA = new THREE.Mesh(G.legPairAGeo, mat); legPairA.castShadow = false; legPairA.receiveShadow = true;
  const legPairB = new THREE.Mesh(G.legPairBGeo, mat); legPairB.castShadow = false; legPairB.receiveShadow = true;
  const body = new THREE.Mesh(G.bodyGeo, mat); body.castShadow = true; body.receiveShadow = true;
  const head = new THREE.Mesh(G.headGeo, mat); head.castShadow = false; head.receiveShadow = true;
  head.position.set(0, 0.3 + s.h + s.w * 0.35, s.l * 0.45);
  const tail = new THREE.Mesh(G.tailGeo, mat); tail.castShadow = false; tail.receiveShadow = true;
  tail.position.set(0, 0.3 + s.h * 0.6, -s.l * 0.5); group.add(legPairA, legPairB, body, head, tail);
  const neck = new THREE.Object3D(); neck.position.set(0, -s.w * 0.35, s.w * 0.55); head.add(neck);

  const bubble = new THREE.Group(); bubble.position.set(0, head.position.y + s.w * 0.9, 0); bubble.visible = false; group.add(bubble);
  const bWait = new THREE.Mesh(G.bWaitGeo, mat); bWait.castShadow = false; bWait.receiveShadow = true;
  const bAngry = new THREE.Mesh(G.bAngryGeo, mat); bAngry.castShadow = false; bAngry.receiveShadow = true;
  const bHappy = new THREE.Mesh(heartGeo(), _heartMat); bHappy.scale.setScalar(0.5);
  bubble.add(bWait, bAngry, bHappy);
  const mouth = new THREE.Group(); mouth.position.set(0, -0.05, s.w * 0.7); head.add(mouth);
  const P = { group, neck, height: head.position.y + s.w * 0.6, _t: Math.random() * 6, _mood: 'none', _carried: null, _sitting: false, _face: 0, _hop: 0 };
  P.setMood = m => { P._mood = m; bubble.visible = m !== 'none'; bWait.visible = m === 'wait'; bAngry.visible = m === 'angry'; bHappy.visible = m === 'happy'; };
  P.carry = m => { if (P._carried) mouth.remove(P._carried); P._carried = m; if (m) { m.position.set(0, 0, 0); m.scale.setScalar(0.8); mouth.add(m); } };
  P.sit = () => { P._sitting = true; };
  P.stand = () => { P._sitting = false; };
  P.setHop = h => { P._hop = h; };
  P.update = (dt, moving, hop) => {
    if (hop !== undefined) P._hop = hop;
    P._t += dt * (moving ? 12 : 2);
    if (P._sitting) {
      legPairA.rotation.x = damp(legPairA.rotation.x, -1.2, 10, dt); legPairB.rotation.x = damp(legPairB.rotation.x, -1.2, 10, dt);
      body.position.y = damp(body.position.y, -0.12, 10, dt);
      tail.rotation.y = damp(tail.rotation.y, 0, 10, dt); tail.rotation.x = damp(tail.rotation.x, -0.9, 10, dt);
    } else {
      const sw = moving ? Math.sin(P._t) * 0.7 : 0;
      legPairA.rotation.x = sw; legPairB.rotation.x = -sw;
      body.position.y = damp(body.position.y, moving ? Math.abs(Math.sin(P._t)) * 0.04 : 0, 12, dt);
      tail.rotation.y = Math.sin(P._t * 1.3) * 0.5; tail.rotation.x = damp(tail.rotation.x, Math.sin(P._t * 0.7) * 0.2, 10, dt);
    }
    head.rotation.z = Math.sin(P._t * 0.5) * 0.05;
    head.rotation.x = moving ? Math.sin(P._t * 0.5) * 0.035 : Math.sin(P._t * 0.32) * 0.02;
    group.position.y = P._hop > 0 ? Math.sin(Math.min(1, P._hop / 0.4) * Math.PI) * 0.35 : 0;
    bubble.rotation.y += dt * 2; bubble.position.y = P.height + 0.25 + Math.sin(P._t * 0.8) * 0.04;
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
