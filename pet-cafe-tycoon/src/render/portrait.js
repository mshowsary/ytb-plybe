// src/render/portrait.js — deterministic pet portrait rendering (plan §3.2.1, task 2.2 renderer
// half). Portraits are NEVER stored as pixels: a portrait is a pure render of
// (petKey, poseId, accessoryId), produced on demand with the MAIN renderer into an offscreen
// WebGLRenderTarget, read back to a 2D canvas and cached in a session-lived Map keyed by that
// triple. Reloading the page, or evicting the cache, reproduces the exact same image -- nothing
// about the pixels themselves is ever saved (`meta.album`/`meta.equipped`, owned by other agents,
// only ever store the (petKey, accessoryId) facts a portrait is derived from).
//
// WIRING (not done here — see this task's handoff): main.js must pass its one THREE.WebGLRenderer
// into renderPetPortrait(); nothing in this module creates its own renderer or canvas element.
import * as THREE from 'three';
import { createPet } from './pets.js';
import { parsePetKey } from '../sim/petBook.js';
import { accessoryMesh } from '../../data/accessories.js';

export const PORTRAIT_SIZE = 256;

// Poses a portrait can be posed in. Deliberately small and generic today -- whoever wires the photo
// studio's per-species pose clips (plan §3.2: "cats loaf, dogs sit-tilt, bunnies ear-up, hamsters
// cheeks") can add entries here keyed by whatever poseId the mini-game settles on; an unknown
// poseId falls back to 'idle' rather than throwing, so a forged/stale poseId can never crash a
// render.
const POSES = {
  idle: pet => { pet.stand(); pet.update(1.5, false, 0); },
  sit: pet => { pet.sit(); pet.update(1.5, false, 0); },
  // The four photo-studio poses, keyed by systems/photo.js's poseForSpecies output. The rig write
  // comes AFTER pet.update: update() damps head/neck toward its own targets every call, so a
  // rotation applied before it is smoothed straight back out and the pose reads as plain 'idle'.
  loaf: pet => { pet.sit(); pet.update(1.5, false, 0); pet.head.rotation.x += 0.13; },
  'sit-tilt': pet => { pet.sit(); pet.update(1.5, false, 0); pet.head.rotation.z += 0.3; },
  'ear-up': pet => { pet.stand(); pet.update(1.5, false, 0); pet.head.rotation.x -= 0.22; },
  cheeks: pet => { pet.sit(); pet.update(1.5, false, 0); pet.head.rotation.y += 0.36; pet.head.rotation.x += 0.07; },
};
function poseFor(poseId) { return POSES[poseId] ? poseId : 'idle'; }

const _cache = new Map();

let _scene = null, _camera = null, _rt = null;
function ensureScene() {
  if (_scene) return;
  _scene = new THREE.Scene();

  // Two-tone gradient backdrop: a single vertex-coloured plane (no texture), light at the top,
  // slightly deeper at the bottom, matching this codebase's "no textures, vertex colours" rule.
  const backGeo = new THREE.PlaneGeometry(6, 6, 1, 1);
  const colors = new Float32Array(backGeo.attributes.position.count * 3);
  const top = new THREE.Color('#FFF4E6'), bottom = new THREE.Color('#F3C9A8');
  const pos = backGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const c = pos.getY(i) > 0 ? top : bottom;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  backGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const backdrop = new THREE.Mesh(backGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthWrite: false }));
  backdrop.position.set(0, 0.7, -1.6);
  _scene.add(backdrop);

  _camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  _camera.position.set(0.55, 1.05, 2.3);
  _camera.lookAt(0, 0.5, 0);

  const key = new THREE.DirectionalLight('#FFFFFF', 2.0);
  key.position.set(1.4, 2.2, 1.6);
  _scene.add(key);
  const rim = new THREE.DirectionalLight('#BFD9FF', 1.1);
  rim.position.set(-1.6, 1.2, -1.8);
  _scene.add(rim);
  _scene.add(new THREE.AmbientLight('#FFFFFF', 0.35));

  _rt = new THREE.WebGLRenderTarget(PORTRAIT_SIZE, PORTRAIT_SIZE, { depthBuffer: true });
}

function cacheKeyFor(petKeyStr, poseId, accessoryId) {
  return `${petKeyStr}|${poseId}|${accessoryId || ''}`;
}

// Renders (or returns the cached) data URL for one (petKey, poseId, accessoryId) portrait.
// `renderer` is the game's single THREE.WebGLRenderer, passed in by the caller (never created
// here). Returns null for an invalid petKey/renderer rather than throwing, so a forged album entry
// or a call before the renderer exists can never crash the UI that requested it.
export function renderPetPortrait(renderer, { petKey: petKeyStr, poseId, accessoryId = null } = {}) {
  if (!renderer || typeof renderer.setRenderTarget !== 'function') return null;
  const parsed = parsePetKey(petKeyStr);
  if (!parsed) return null;
  const resolvedPose = poseFor(poseId);
  const resolvedAccessory = typeof accessoryId === 'string' && accessoryId ? accessoryId : null;
  const cacheKey = cacheKeyFor(parsed.key, resolvedPose, resolvedAccessory);
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  ensureScene();

  const pet = createPet(parsed.species, parsed.variant);
  // Every render of the same (petKey, poseId) must produce the same pose -- setLifePhase(0) pins
  // every one of the rig's own clocks (gait/blink/stretch) to a fixed offset instead of the
  // Math.random() seed createPet() otherwise assigns, which is what makes this deterministic.
  pet.setLifePhase(0);
  POSES[resolvedPose](pet);
  pet.group.position.set(0, 0, 0);
  // Pet faces are authored toward +Z and the portrait camera sits at +Z. The previous 0.82π turn
  // showed the rump and tail in the Pet Book, hiding the identity detail this view exists for.
  pet.group.rotation.y = -0.24; // slight three-quarter turn while keeping both eyes readable

  if (resolvedAccessory) {
    const built = accessoryMesh(resolvedAccessory);
    if (built) pet.attach(built.slot, built.mesh);
  }

  _scene.add(pet.group);
  renderer.setRenderTarget(_rt);
  renderer.render(_scene, _camera);
  renderer.setRenderTarget(null);
  _scene.remove(pet.group);

  const size = PORTRAIT_SIZE;
  const buffer = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(_rt, 0, 0, size, size, buffer);

  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  // WebGL read-back rows are bottom-up; canvas ImageData rows are top-down.
  for (let y = 0; y < size; y++) {
    const srcStart = (size - 1 - y) * size * 4;
    const dstStart = y * size * 4;
    image.data.set(buffer.subarray(srcStart, srcStart + size * 4), dstStart);
  }
  ctx.putImageData(image, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');

  _cache.set(cacheKey, dataUrl);
  return dataUrl;
}

// Test/session hygiene only -- never called from game code. Clears the render cache (not any
// saved state, which this module never touches).
export function clearPortraitCache() {
  _cache.clear();
}
