// src/render/scene.js — renderer, warm café lighting, and a camera that frames the room on any screen.
import * as THREE from 'three';
import { damp, lerp } from '../core/tween.js';

const YAW = 0.36, PITCH = 0.9, FOV = 35;    // camera comes from the front-right, looking down ~52°

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ED3EA');
  scene.fog = new THREE.Fog('#B8DFF0', 34, 64);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 120);
  const hemi = new THREE.HemisphereLight('#FFF1DC', '#9C8467', 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFE2B8', 1.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#DDEBFF', 0.45); fill.position.set(-10, 8, 6); scene.add(fill);

  const target = new THREE.Vector3(), goal = new THREE.Vector3();
  let dist = 18, shake = 0, override = null, overrideT = 0;
  const S = { renderer, scene, camera, sun };

  S.resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // Frame about 13 m across on a phone held upright and about 15 m of floor top-to-bottom on a
    // wide screen, whichever needs the camera further back. Characters stay big enough to read.
    const t = Math.tan(FOV * Math.PI / 360);
    const across = camera.aspect < 1 ? 12.2 : 17;
    dist = Math.max(across / (2 * t * camera.aspect), 11.5 / (2 * t));
    if (camera.aspect < 0.62) dist = Math.min(dist, 27);
  };

  // Portrait looks a little ahead of the owner (toward the kitchen); wide screens centre them.
  const lead = () => camera.aspect < 1 ? 1.2 : 0.4;

  // The camera leans a third of the way toward the middle of the café, so the room stays framed.
  const MID = { x: -1.7, z: 0 };
  const pull = () => camera.aspect < 1 ? 0.5 : 0.3;   // phones lean further in, so both walls stay in frame
  S.follow = (x, z, dt) => {
    goal.set(lerp(x, MID.x, pull()), 0, lerp(z, MID.z, pull()) - lead());
    const k = dt > 0 ? 1 - Math.exp(-6 * dt) : 1;
    target.lerp(goal, k);
    place(dt);
  };
  S.snap = (x, z) => { target.set(lerp(x, MID.x, pull()), 0, lerp(z, MID.z, pull()) - lead()); place(0); };
  S.shake = a => { shake = Math.max(shake, a); };
  // A held shot (the grand opening): look at `p` from `d` for `t` seconds, then glide home.
  S.look = (p, d, t) => { override = { x: p.x, z: p.z, d }; overrideT = t; };

  let blend = 0;
  function place(dt) {
    if (overrideT > 0) overrideT -= dt;
    blend = damp(blend, overrideT > 0 ? 1 : 0, 2.2, dt || 1);
    const vx = override ? lerp(target.x, override.x, blend) : target.x;
    const vz = override ? lerp(target.z, override.z, blend) : target.z;
    const d = override ? lerp(dist, override.d, blend) : dist;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    camera.position.set(vx + Math.sin(YAW) * cp * d, sp * d, vz + Math.cos(YAW) * cp * d);
    if (shake > 0) {
      shake *= Math.exp(-10 * (dt || 0.016));
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(vx, 0.3, vz);
    sun.position.set(vx + 7, 14, vz + 9); sun.target.position.set(vx, 0, vz);
  }

  S.worldToScreen = (x, y, z, out) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    out.x = (v.x * 0.5 + 0.5) * innerWidth; out.y = (-v.y * 0.5 + 0.5) * innerHeight;
    out.on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    return out;
  };
  S.render = () => renderer.render(scene, camera);
  addEventListener('resize', S.resize); S.resize();
  return S;
}
