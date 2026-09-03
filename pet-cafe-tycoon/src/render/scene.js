// src/render/scene.js
// No EffectComposer: it instantiates three's Timer, whose visibilitychange listener the Playables build guard forbids.
import * as THREE from 'three';
import { damp, lerp } from '../core/tween.js';
const YAW = 35 * Math.PI / 180, PITCH = 52 * Math.PI / 180, FOV = 40;   // camera sits south-east of the target (+x,+z), so the west door wall and north wall are at the back
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
  // sky dome
  { const g = new THREE.SphereGeometry(90, 24, 12); const n = g.getAttribute('position').count; const col = new Float32Array(n * 3);
    const top = new THREE.Color('#CFEFFF'), hor = new THREE.Color('#FFF4E6'), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const y = g.getAttribute('position').getY(i) / 90; c.copy(hor).lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.1))); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false })); sky.renderOrder = -1; scene.add(sky); }
  const hemi = new THREE.HemisphereLight('#FFF7EA', '#F2C9A8', 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF1D6', 1.6); sun.castShadow = true;
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.shadow.mapSize.set(innerWidth < 700 ? 1024 : 2048, innerWidth < 700 ? 1024 : 2048);
  scene.add(sun); scene.add(sun.target);
  const target = new THREE.Vector3(0, 0, 0), goal = new THREE.Vector3();
  const S = { renderer, scene, camera, sun, target, dist: 20 };
  let shakeAmt = 0;
  S.shake = amount => { shakeAmt = Math.max(shakeAmt, amount); };
  S.resize = () => {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const a = camera.aspect;
    // visible width: 10 m portrait (<=0.8), 18 m landscape (>=1.25), smoothly interpolated in between via 13 m at square (1.0)
    const want = a <= 0.8 ? 10 : a >= 1.25 ? 18 : a <= 1 ? lerp(10, 13, (a - 0.8) / 0.2) : lerp(13, 18, (a - 1) / 0.25);
    S.dist = want / (2 * Math.tan(FOV * Math.PI / 360) * camera.aspect);
    const size = innerWidth < 700 ? 1024 : 2048;
    if (sun.shadow.mapSize.width !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map = null; sun.shadow.needsUpdate = true; }
    place();
  };
  function place(dt = 0) {
    if (shakeAmt > 0) { shakeAmt *= Math.exp(-9 * dt); if (shakeAmt < 0.0005) shakeAmt = 0; }
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    camera.position.set(target.x + Math.sin(YAW) * cp * S.dist, target.y + sp * S.dist, target.z + Math.cos(YAW) * cp * S.dist);
    if (shakeAmt > 0) {
      const ang = Math.random() * Math.PI * 2;
      camera.position.x += Math.cos(ang) * shakeAmt;
      camera.position.y += Math.sin(ang * 1.3) * shakeAmt * 0.6;
      camera.position.z += Math.sin(ang) * shakeAmt;
    }
    camera.lookAt(target.x, target.y + 0.4, target.z);
    sun.position.set(target.x + 6, target.y + 12, target.z + 4); sun.target.position.copy(target);
  }
  S.follow = (x, z, dt) => { goal.set(x, 0, z); target.x = damp(target.x, goal.x, 6, dt); target.z = damp(target.z, goal.z, 6, dt); place(dt); };
  S.snap = (x, z) => { target.set(x, 0, z); place(); };
  S.render = () => renderer.render(scene, camera);
  S.setQuality = q => { renderer.shadowMap.enabled = q !== 'low'; };
  addEventListener('resize', S.resize); S.resize();
  return S;
}
