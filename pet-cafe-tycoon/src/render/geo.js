// src/render/geo.js — colored primitive parts merged into one geometry (one draw call per prop type)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toonMaterial } from './palette.js';
const _c = new THREE.Color();
export function colorize(g, hex) {
  const n = g.getAttribute('position').count; const arr = new Float32Array(n * 3);
  _c.set(hex); for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
export function part(kind, d, hex, xf = {}) {
  let g;
  switch (kind) {
    case 'box': g = new THREE.BoxGeometry(d[0], d[1], d[2]); break;
    case 'rbox': g = new RoundedBoxGeometry(d[0], d[1], d[2], 3, d[3] ?? 0.06); break;
    case 'cyl': g = new THREE.CylinderGeometry(d[0], d[1], d[2], d[3] ?? 16); break;
    case 'sph': g = new THREE.SphereGeometry(d[0], d[1] ?? 14, (d[1] ?? 14) >> 1); break;
    case 'cone': g = new THREE.ConeGeometry(d[0], d[1], d[2] ?? 12); break;
    default: throw new Error('part kind ' + kind);
  }
  g.deleteAttribute('uv');
  if (xf.sx || xf.sy || xf.sz) g.scale(xf.sx ?? 1, xf.sy ?? 1, xf.sz ?? 1);
  if (xf.rx) g.rotateX(xf.rx); if (xf.ry) g.rotateY(xf.ry); if (xf.rz) g.rotateZ(xf.rz);
  g.translate(xf.x ?? 0, xf.y ?? 0, xf.z ?? 0);
  return colorize(g, hex);
}
export function merge(parts) { const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p), false); g.computeBoundingSphere(); return g; }
export function mesh(parts, opts = {}) {
  const m = new THREE.Mesh(merge(parts), opts.material || toonMaterial());
  m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true; return m;
}
