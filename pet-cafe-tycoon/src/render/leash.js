// src/render/leash.js — a sagging 3-point line from a human's hand to a pet's neck.
import * as THREE from 'three';
export function createLeash(scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const mat = new THREE.LineBasicMaterial({ color: '#7A5A3A' });
  const line = new THREE.Line(geo, mat); line.frustumCulled = false;
  let added = false, handObj = null, neckObj = null;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const L = { line };
  L.attach = (handObj_, neckObj_) => { handObj = handObj_; neckObj = neckObj_; if (!added) { scene.add(line); added = true; } };
  L.detach = () => { handObj = null; neckObj = null; if (added) { scene.remove(line); added = false; } geo.dispose(); mat.dispose(); };
  L.update = () => {
    if (!handObj || !neckObj) return;
    handObj.getWorldPosition(a); neckObj.getWorldPosition(b);
    const arr = geo.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = (a.x + b.x) * 0.5; arr[4] = (a.y + b.y) * 0.5 - 0.15; arr[5] = (a.z + b.z) * 0.5;
    arr[6] = b.x; arr[7] = b.y; arr[8] = b.z;
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  };
  return L;
}
