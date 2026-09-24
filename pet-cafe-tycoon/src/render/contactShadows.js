// src/render/contactShadows.js — one instanced pool of soft dark ellipses that anchor every
// character, pet and visible prop to the surface it rests on (program plan §5 Batch 8 item 4).
//
// WHY THIS EXISTS
// The café has exactly one shadow source: scene.js's single DirectionalLight with PCFSoftShadowMap.
// Most small props turn castShadow off to keep that map cheap (geo.js's `part()` still defaults
// cast/receive to true, but a cup, a plate or a pet's paws are exactly the kind of small prop that
// gets it turned off for cost), so those objects sit on the floor with nothing under them -- the
// room reads like everything is hovering a millimetre off the tile. A contact shadow is the
// cheapest fix that actually works: a small soft dark disc directly under an object, independent of
// where the sun happens to be.
//
// ONE DRAW CALL, ALWAYS
// Every registered shadow -- guest, pet, staff member, owner, resident, station -- is one instance
// of the SAME unit circle, the SAME soft radial-falloff texture and the SAME MeshBasicMaterial,
// drawn by exactly one THREE.InstancedMesh. add() never creates geometry or a material; it only
// claims a slot description in a plain array. update() rewrites every ACTIVE slot's matrix and
// per-instance alpha into the shared buffer, then sets `mesh.count` to how many are actually in use
// this frame, so an empty café or a hidden station costs nothing beyond the one draw call itself.
//
// SUN-AWARE
// Strength and softness both key off render/daylight.js's own state (the same object game.js reads
// for the night blend), not a second clock: a high midday sun makes a tight, dark anchor; a low
// dusk sun spreads it wider and softer; after dark, once the room is lit from within rather than by
// the sun, contact shadows fade to nearly nothing rather than reading as a stray dark smear.
import * as THREE from 'three';
import { C } from './palette.js';

const CAPACITY = 256;
// Metres above the resting surface -- enough to beat z-fighting with the floor underneath, and
// safely below every other floor decal this game draws (petMess.js's pawprints start at y 0.018).
const SURFACE_LIFT = 0.011;
// Metres of lift a moving actor can rise before its shadow bottoms out at minimum size/strength --
// render/pets.js's own hop tops out at 0.35 (`group.position.y = ... * 0.35`), so a full hop reads
// as a real departure from the floor without ever quite vanishing.
const HOP_FADE_RANGE = 0.3;

const clamp01 = v => (v > 1 ? 1 : v < 0 ? 0 : v || 0);
const lerpN = (a, b, t) => a + (b - a) * t;

// A soft round falloff baked into a DataTexture at boot -- the game ships zero asset bytes. Same
// technique as render/daylight.js's own radialTexture() (kept private to that module, so this is a
// small duplicate rather than an import-order dependency between two otherwise-unrelated systems).
function radialTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1, v = ((y + 0.5) / size) * 2 - 1;
      const r = Math.min(1, Math.sqrt(u * u + v * v));
      // Gentler than daylight.js's glow sprites (2.4) in the other direction: a light pool wants a
      // tiny bright point, but a contact shadow needs enough of a solid-ish core to actually read
      // against the floor once tonemapped and graded, with the falloff still doing the "soft, not a
      // hard disc" work at the rim.
      const a = Math.pow(Math.max(0, 1 - r), 1.5);
      const i = (y * size + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Module-level handle to the live system, for the one creation site (render/owner.js) that has no
// parameter path to the render/scene.js bundle `S` -- game.js constructs the owner with zero
// arguments and this program does not touch game.js. Same "cache a singleton at module scope"
// shape palette.js already uses for its toon material/gradient map.
let CURRENT = null;
export function currentContactShadows() { return CURRENT; }

export function createContactShadows(S) {
  const scene = S && S.scene;
  const geometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  // A plain per-instance attribute (NOT the built-in `instanceColor`, which only ever reaches
  // diffuseColor.rgb) so every instance can fade independently -- a hopping pet's shadow lightens
  // as it rises while every other instance on screen keeps its own strength that same frame.
  const instanceAlpha = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  instanceAlpha.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceAlpha', instanceAlpha);

  const map = radialTexture(64);
  const material = new THREE.MeshBasicMaterial({
    map, color: new THREE.Color(C.ink), transparent: true, depthWrite: false, toneMapped: false,
  });
  // Splices a per-instance alpha into MeshBasicMaterial's stock shader. `instanceMatrix` is already
  // injected by three's own instancing prefix; this is the same trick for one extra float.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instanceAlpha;\nvarying float vShadowAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShadowAlpha = instanceAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShadowAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vShadowAlpha;');
  };

  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // instances can span the whole café; not worth tracking a per-frame bound
  // After the floor (opaque, default renderOrder 0 -- and depth-tested against regardless, so a
  // shadow can never paint over geometry standing in front of it) and before the transparent
  // overlays layered on top of characters elsewhere in this program: the night interior glow
  // (render/daylight.js, renderOrder 4) and the staff first-hire beacon (systems/staff.js, 7-8).
  mesh.renderOrder = 1;
  mesh.count = 0;
  mesh.name = 'contactShadows';
  if (scene) scene.add(mesh);

  const handles = new Set();
  const wpos = new THREE.Vector3();
  const posV = new THREE.Vector3();
  const scaleV = new THREE.Vector3();
  const IDQ = new THREE.Quaternion();
  const mtx = new THREE.Matrix4();
  let overflowWarned = false;

  // object3d: anything with getWorldPosition (a THREE.Object3D). opts:
  //   radius   metres, the resting footprint's soft radius (default 0.45)
  //   strength 0..1, this object's own contribution before the sun/night multiplier (default 0.5)
  //   follow   true (default) re-reads the object's world position every update() -- a moving
  //            actor. false caches it once at add() time -- a placed prop that never moves again.
  //   groundY  the world Y this object is considered "grounded" at, so height above it (not above
  //            world 0) is what fades/shrinks a hopping pet or a resident perched on furniture.
  //            Defaults to floor level (0) for a following object, or to the object's own current
  //            height for a static one -- a placed prop or a settled resident IS its own ground,
  //            so leaving this off never fades furniture sitting above/below world y=0.
  function add(object3d, opts = {}) {
    if (!object3d || typeof object3d.getWorldPosition !== 'function') return null;
    object3d.getWorldPosition(wpos);
    const follow = opts.follow !== false;
    const handle = {
      object3d,
      radius: opts.radius != null ? opts.radius : 0.45,
      strength: opts.strength != null ? opts.strength : 0.5,
      follow,
      groundY: opts.groundY != null ? opts.groundY : (follow ? 0 : wpos.y),
      visible: true,
      wx: wpos.x, wy: wpos.y, wz: wpos.z,
    };
    handles.add(handle);
    return handle;
  }
  function remove(handle) {
    if (handle) handles.delete(handle);
  }

  // Called once per frame from the main loop, after everything else has moved and after
  // daylight.update() so S.daylight.state reflects THIS frame's time of day.
  function update() {
    const dstate = S && S.daylight && S.daylight.state;
    const elevation = dstate ? dstate.elevation : 55;
    const interior = dstate ? clamp01(dstate.interior) : 0;
    // 14deg is render/daylight.js's own floor for the sun (see its KEYFRAMES comment: the shadow
    // camera box goes out of range below it); 60deg is the midday keyframe -- so this spans the
    // whole authored day. `interior` is the same 0..1 "the room is lit from within" number the
    // after-dark glow layer reads, already 0 all day and ramping through sunset/dusk: it is what
    // actually pulls contact shadows down to nearly nothing once the sun stops being the story.
    const sunK = clamp01((elevation - 14) / 46);
    const strengthK = lerpN(0.32, 1, sunK) * (1 - interior * 0.82);
    const radiusK = lerpN(1.22, 1, sunK) * lerpN(1, 0.85, interior);

    let n = 0;
    for (const h of handles) {
      if (n >= CAPACITY) {
        if (!overflowWarned) { overflowWarned = true; console.warn('[contactShadows] capacity exceeded; dropping extra instances'); }
        break;
      }
      if (!h.visible || h.radius <= 0 || h.strength <= 0) continue;
      if (h.follow) { h.object3d.getWorldPosition(wpos); h.wx = wpos.x; h.wy = wpos.y; h.wz = wpos.z; }
      const lift = Math.max(0, h.wy - h.groundY);
      const liftK = Math.min(1, lift / HOP_FADE_RANGE);
      const alpha = h.strength * strengthK * (1 - liftK * 0.7);
      if (alpha <= 0.006) continue; // effectively invisible -- skip the instance rather than draw a zero
      const r = Math.max(0.02, h.radius * radiusK * (1 - liftK * 0.45));
      posV.set(h.wx, h.groundY + SURFACE_LIFT, h.wz);
      scaleV.set(r, 1, r);
      mtx.compose(posV, IDQ, scaleV);
      mesh.setMatrixAt(n, mtx);
      instanceAlpha.setX(n, alpha);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    instanceAlpha.needsUpdate = true;
  }

  const api = { add, remove, update, mesh };
  CURRENT = api;
  return api;
}
