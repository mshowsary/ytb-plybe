// src/render/pets.js — blocky pets from primitives. Legs merged into two diagonal-pair meshes so a pet is <= 6 draw calls
// (legPairA, legPairB, body, head, tail, +1 mood bubble mesh when a mood is active).
import * as THREE from 'three';
import { part, mesh, merge } from './geo.js';
import { C, toonMaterial, emissiveMaterial } from './palette.js';
import { damp } from '../core/tween.js';
const SPEC = {
  cat:   { body: C.cat,   belly: C.cream, ear: 'cone',  earCol: C.cat,   tail: 'long',  eye: C.ink, w: 0.5, h: 0.42, l: 0.8 },
  dog:   { body: C.dog,   belly: C.cream, ear: 'flop',  earCol: '#C8A078', tail: 'short', eye: C.ink, w: 0.56, h: 0.48, l: 0.9 },
  bunny: { body: C.bunny, belly: C.pink,  ear: 'tall',  earCol: C.pink,  tail: 'puff',  eye: C.ink, w: 0.46, h: 0.4, l: 0.7 },
};
const _heartMat = emissiveMaterial(C.coral);
const _geoCache = new Map();
function geosFor(species) {
  if (_geoCache.has(species)) return _geoCache.get(species);
  const s = SPEC[species] || SPEC.cat;
  const legDims = [0.14, 0.3, 0.14, 0.05];
  // diagonal pairs share phase in the walk cycle (FL+BR same phase, FR+BL opposite), so each pair merges into one mesh.
  const legPairAGeo = merge([
    part('rbox', legDims, s.body, { x: -s.w * 0.32, y: 0.15, z: s.l * 0.3 }),
    part('rbox', legDims, s.body, { x: s.w * 0.32, y: 0.15, z: -s.l * 0.3 }),
  ]);
  const legPairBGeo = merge([
    part('rbox', legDims, s.body, { x: s.w * 0.32, y: 0.15, z: s.l * 0.3 }),
    part('rbox', legDims, s.body, { x: -s.w * 0.32, y: 0.15, z: -s.l * 0.3 }),
  ]);
  const bodyGeo = merge([
    part('rbox', [s.w, s.h, s.l, 0.12], s.body, { y: 0.3 + s.h / 2 }),
    part('rbox', [s.w * 0.7, s.h * 0.5, s.l * 0.7, 0.08], s.belly, { y: 0.3 + s.h * 0.35, z: 0.02 }),
  ]);
  const headParts = [
    part('rbox', [s.w * 1.1, s.w * 0.95, s.w * 0.95, 0.14], s.body, { y: 0 }),
    part('sph', [0.055, 8], s.eye, { x: -s.w * 0.25, y: 0.06, z: s.w * 0.47 }), part('sph', [0.055, 8], s.eye, { x: s.w * 0.25, y: 0.06, z: s.w * 0.47 }),
    part('sph', [0.045, 8], C.pink, { y: -0.08, z: s.w * 0.5 }),
    part('rbox', [s.w * 0.5, s.w * 0.28, s.w * 0.3, 0.06], s.belly, { y: -0.12, z: s.w * 0.4 }),    // muzzle
  ];
  if (s.ear === 'cone') { headParts.push(part('cone', [0.12, 0.26, 4], s.earCol, { x: -s.w * 0.32, y: s.w * 0.55, ry: Math.PI / 4 }), part('cone', [0.12, 0.26, 4], s.earCol, { x: s.w * 0.32, y: s.w * 0.55, ry: Math.PI / 4 })); }
  if (s.ear === 'tall') { headParts.push(part('rbox', [0.14, 0.55, 0.08, 0.04], s.body, { x: -s.w * 0.25, y: s.w * 0.7, rz: 0.15 }), part('rbox', [0.14, 0.55, 0.08, 0.04], s.body, { x: s.w * 0.25, y: s.w * 0.7, rz: -0.15 }), part('rbox', [0.07, 0.4, 0.03, 0.02], s.earCol, { x: -s.w * 0.25, y: s.w * 0.72, z: 0.04, rz: 0.15 }), part('rbox', [0.07, 0.4, 0.03, 0.02], s.earCol, { x: s.w * 0.25, y: s.w * 0.72, z: 0.04, rz: -0.15 })); }
  if (s.ear === 'flop') { headParts.push(part('rbox', [0.1, 0.36, 0.2, 0.04], s.earCol, { x: -s.w * 0.58, y: s.w * 0.4 }), part('rbox', [0.1, 0.36, 0.2, 0.04], s.earCol, { x: s.w * 0.58, y: s.w * 0.4 })); }  // static — merged in, no per-frame animation
  const headGeo = merge(headParts);
  let tailGeo;
  if (s.tail === 'long') tailGeo = merge([part('cyl', [0.05, 0.07, 0.6, 8], s.body, { y: 0.3, rx: 0.5 })]);
  else if (s.tail === 'short') tailGeo = merge([part('cyl', [0.05, 0.06, 0.3, 8], s.body, { y: 0.15, rx: 0.9 })]);
  else tailGeo = merge([part('sph', [0.12, 8], C.white)]);
  const bWaitGeo = merge([part('sph', [0.06, 8], C.white, { x: -0.15 }), part('sph', [0.06, 8], C.white), part('sph', [0.06, 8], C.white, { x: 0.15 })]);
  const bAngryGeo = merge([part('rbox', [0.08, 0.3, 0.08, 0.03], '#FF3B3B', { y: 0.05 }), part('sph', [0.06, 8], '#FF3B3B', { y: -0.2 })]);
  const g = { legPairAGeo, legPairBGeo, bodyGeo, headGeo, tailGeo, bWaitGeo, bAngryGeo };
  _geoCache.set(species, g);
  return g;
}
export function createPet(species) {
  const s = SPEC[species] || SPEC.cat; const group = new THREE.Group();
  const G = geosFor(species); const mat = toonMaterial();
  // draw-call budget: only the body casts a shadow (it's the one that grounds the pet visually);
  // legs/head/tail swing or tilt independently every frame and skip the shadow pass.
  const legPairA = new THREE.Mesh(G.legPairAGeo, mat); legPairA.castShadow = false; legPairA.receiveShadow = true;
  const legPairB = new THREE.Mesh(G.legPairBGeo, mat); legPairB.castShadow = false; legPairB.receiveShadow = true;
  const body = new THREE.Mesh(G.bodyGeo, mat); body.castShadow = true; body.receiveShadow = true;
  const head = new THREE.Mesh(G.headGeo, mat); head.castShadow = false; head.receiveShadow = true;
  head.position.set(0, 0.3 + s.h + s.w * 0.35, s.l * 0.45);
  const tail = new THREE.Mesh(G.tailGeo, mat); tail.castShadow = false; tail.receiveShadow = true;
  tail.position.set(0, 0.3 + s.h * 0.6, -s.l * 0.5); group.add(legPairA, legPairB, body, head, tail);
  const neck = new THREE.Object3D(); neck.position.set(0, -s.w * 0.35, s.w * 0.55); head.add(neck);
  // mood bubble
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
    group.position.y = P._hop > 0 ? Math.sin(Math.min(1, P._hop / 0.4) * Math.PI) * 0.35 : 0;
    bubble.rotation.y += dt * 2; bubble.position.y = P.height + 0.25 + Math.sin(P._t * 0.8) * 0.04;
  };
  // goal = human position - facing*0.9 + right*0.45; position damped lambda 8; faces its own velocity; moving = own speed > 0.15
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
