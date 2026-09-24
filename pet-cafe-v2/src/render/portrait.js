// src/render/portrait.js — a pet's face as a picture (for the review cards on the city map): the
// game's own 3D pet, rendered once into a small offscreen target and kept as a data URL.
import * as THREE from 'three';
import { createPet } from './pets.js';

const cache = new Map();
let rig = null;

export function petPortrait(renderer, species, variant = 0, size = 160) {
  const key = species + ':' + variant;
  if (cache.has(key)) return cache.get(key);
  if (!rig) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#FFF6E8', '#B8A58C', 1.5));
    const key1 = new THREE.DirectionalLight('#FFFFFF', 1.6); key1.position.set(1.5, 2.5, 3); scene.add(key1);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    rig = { scene, rt, cam: new THREE.PerspectiveCamera(24, 1, 0.05, 30), px: new Uint8Array(size * size * 4) };
  }
  const P = createPet(species, variant);
  P.update(0.016, false);
  rig.scene.add(P.group);
  P.group.updateMatrixWorld(true);
  const head = new THREE.Vector3(); P.head.getWorldPosition(head);
  const r = P.height * 0.55;
  rig.cam.position.set(head.x + r * 0.55, head.y + r * 0.2, head.z + r * 4.4);
  rig.cam.lookAt(head.x, head.y - r * 0.22, head.z);
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha(), prevRT = renderer.getRenderTarget();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rig.rt); renderer.clear(); renderer.render(rig.scene, rig.cam);
  renderer.readRenderTargetPixels(rig.rt, 0, 0, size, size, rig.px);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevAlpha);
  rig.scene.remove(P.group);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(rig.px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(img, 0, 0);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
