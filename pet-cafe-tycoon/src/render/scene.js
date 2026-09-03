// src/render/scene.js — premium lighting + slow adaptive resolution for Playables hardware.
// No EffectComposer: it instantiates three's Timer, whose visibilitychange listener the build guard forbids.
import * as THREE from 'three';
import { damp, lerp } from '../core/tween.js';

const YAW = 35 * Math.PI / 180, PITCH = 52 * Math.PI / 180, FOV = 40;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  let basePixelRatio = Math.min(devicePixelRatio || 1, 1.75), renderScale = 1;
  renderer.setPixelRatio(basePixelRatio * renderScale);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#F7EDE2', 42, 88);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);

  // Sky dome with a warm horizon so the low-poly art has a premium illustrative backdrop.
  {
    const g = new THREE.SphereGeometry(90, 24, 12), n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3), top = new THREE.Color('#CDEEFF'), hor = new THREE.Color('#FFF0DE'), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const y = g.getAttribute('position').getY(i) / 90;
      c.copy(hor).lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.1)));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
    sky.renderOrder = -1; scene.add(sky);
  }

  const hemi = new THREE.HemisphereLight('#FFF7EA', '#E7BFA5', 0.78); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFF0CF', 2.05); sun.castShadow = true;
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60; sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.025;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight('#D9E8FF', 0.32); fill.position.set(-8, 7, -10); scene.add(fill);

  const target = new THREE.Vector3(0, 0, 0), goal = new THREE.Vector3();
  const S = { renderer, scene, camera, sun, target, dist: 20 };
  let shakeAmt = 0;
  S.shake = amount => { shakeAmt = Math.max(shakeAmt, amount); };

  function applyRenderScale(next) {
    next = Math.max(0.68, Math.min(1, next));
    if (Math.abs(next - renderScale) < 0.03) return;
    renderScale = next;
    renderer.setPixelRatio(basePixelRatio * renderScale);
    renderer.setSize(innerWidth, innerHeight, false);
  }

  S.resize = () => {
    const w = innerWidth, h = innerHeight;
    basePixelRatio = Math.min(devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(basePixelRatio * renderScale); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const a = camera.aspect;
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
    sun.position.set(target.x + 7, target.y + 13, target.z + 5); sun.target.position.copy(target);
  }

  S.follow = (x, z, dt) => { goal.set(x, 0, z); target.x = damp(target.x, goal.x, 6, dt); target.z = damp(target.z, goal.z, 6, dt); place(dt); };
  S.snap = (x, z) => { target.set(x, 0, z); place(); };

  // Hysteresis keeps resolution changes invisible while rescuing sustained low frame rates.
  let avgDt = 1 / 60, sampleFrames = 0, cooldownFrames = 0;
  S.noteFrame = dt => {
    avgDt += (dt - avgDt) * 0.035;
    if (cooldownFrames > 0) { cooldownFrames--; return; }
    if (++sampleFrames < 120) return;
    sampleFrames = 0;
    if (avgDt > 1 / 48 && renderScale > 0.7) { applyRenderScale(renderScale - 0.1); cooldownFrames = 180; }
    else if (avgDt < 1 / 58 && renderScale < 0.99) { applyRenderScale(renderScale + 0.05); cooldownFrames = 240; }
  };

  S.render = () => renderer.render(scene, camera);
  S.setQuality = q => {
    renderer.shadowMap.enabled = q !== 'low';
    if (q === 'low') applyRenderScale(0.72); else if (q === 'high') applyRenderScale(1);
  };
  addEventListener('resize', S.resize); S.resize();
  return S;
}
