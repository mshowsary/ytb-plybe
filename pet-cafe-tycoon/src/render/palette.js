// src/render/palette.js
import * as THREE from 'three';
export const C = { floorA: '#F3E2C7', floorB: '#EAD3B3', wall: '#BFE8D8', wallDark: '#9FD1BE', coral: '#FF8A80', cream: '#FFF4E6', wood: '#D9A066', woodDark: '#B9834A', plant: '#7BC47F', plantDark: '#5EA463', coin: '#FFD84D', accent: '#8B7CF6', ink: '#3B2E2A', street: '#CFCBC4', cash: '#7FD69A', metal: '#B8C4CC', skin: '#FFD9B3', cat: '#F5A25D', dog: '#E8C39E', bunny: '#FFFFFF', white: '#FFFFFF', pink: '#FFB3C1', black: '#2B2B2B' };
let _grad = null;
export function gradientMap() {
  if (_grad) return _grad;
  const data = new Uint8Array([110, 185, 255]);           // 3 steps: shadow, mid, light
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return _grad = t;
}
let _toon = null;
export function toonMaterial() {
  if (_toon) return _toon;
  return _toon = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap() });
}
// values above 1.0 with toneMapped:false read as saturated highlights
export function emissiveMaterial(hex) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.6), toneMapped: false }); }
