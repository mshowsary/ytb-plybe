// src/render/palette.js
import * as THREE from 'three';
import { grainAtlas } from './grain.js';
// De-sepia (plan §5.2): the floor is CREAM, not tan. The walls stay mint and the wood stays
// '#D9A066' — the room was never meant to read as an old photograph.
export const C = { floorA: '#F7F0E6', floorB: '#EFE5D6', wall: '#BFE8D8', wallDark: '#9FD1BE', coral: '#FF8A80', cream: '#FFF4E6', wood: '#D9A066', woodDark: '#B9834A', plant: '#7BC47F', plantDark: '#5EA463', coin: '#FFD84D', accent: '#8B7CF6', ink: '#3B2E2A', street: '#CFCBC4', cash: '#7FD69A', metal: '#B8C4CC', skin: '#FFD9B3', cat: '#F5A25D', dog: '#E8C39E', bunny: '#FFFFFF', white: '#FFFFFF', pink: '#FFB3C1', black: '#2B2B2B' };
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
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap() });
  // Surface grain (plan §5 Batch 8.3). ONE canvas atlas on the ONE shared material: because
  // essentially the whole world renders through this object, a `map` set here reaches every prop
  // for zero extra draw calls — and a second material would cost one per prop, which is the trade
  // this whole design exists to avoid. geo.js points each part at the atlas tile it wants and
  // leaves everything else on the atlas's pure-white `blank` tile, so an untagged surface is
  // untouched. Null under `node --test`, where there is no canvas to draw on; the material is then
  // exactly what it was before this batch.
  const grain = grainAtlas();
  if (grain) m.map = grain;
  return _toon = m;
}
// values above 1.0 with toneMapped:false read as saturated highlights
export function emissiveMaterial(hex) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.6), toneMapped: false }); }
