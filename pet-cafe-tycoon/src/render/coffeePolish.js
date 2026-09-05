// Lightweight authored espresso-machine detail layered over the existing compact coffee prop.
// It keeps the game's merged low-poly language while making the machine read immediately as an
// espresso machine: pressure gauge, group head, portafilter, twin spouts, steam wand, drip tray,
// bean hopper and cup warmer. It also upgrades carried coffee/latte meshes to real cup silhouettes.
import * as THREE from 'three';
import { part, mesh, merge } from './geo.js';
import { C, toonMaterial } from './palette.js';

let _coffeeGeo = null, _latteGeo = null;
export function coffeeCupGeometry(latte = false) {
  if (latte && _latteGeo) return _latteGeo;
  if (!latte && _coffeeGeo) return _coffeeGeo;
  const liquid = latte ? '#C99A70' : '#4A2B1D';
  const parts = [
    part('cyl', [0.12, 0.10, 0.16, 12], C.cream, { y: 0.08 }),
    part('cyl', [0.096, 0.096, 0.018, 12], liquid, { y: 0.165 }),
    // squared C-handle: tiny at gameplay scale but readable against the dark coffee.
    part('box', [0.07, 0.025, 0.025], C.cream, { x: 0.13, y: 0.12 }),
    part('box', [0.025, 0.085, 0.025], C.cream, { x: 0.165, y: 0.08 }),
    part('box', [0.07, 0.025, 0.025], C.cream, { x: 0.13, y: 0.04 }),
  ];
  if (latte) parts.push(part('sph', [0.075, 8], '#FFF2D6', { y: 0.18, sy: 0.28 }));
  const geo = merge(parts);
  if (latte) _latteGeo = geo; else _coffeeGeo = geo;
  return geo;
}

export function espressoDetailMesh() {
  const g = new THREE.Group();
  g.add(mesh([
    // top bean hopper and lid
    part('cyl', [0.14, 0.17, 0.20, 12], '#5D4032', { x: -0.18, y: 1.03, z: -0.05 }),
    part('cyl', [0.18, 0.18, 0.035, 12], C.ink, { x: -0.18, y: 1.145, z: -0.05 }),
    // pressure gauge face, oriented toward +z/front
    part('cyl', [0.105, 0.105, 0.035, 16], C.cream, { x: 0.17, y: 0.78, z: 0.365, rx: Math.PI / 2 }),
    part('cyl', [0.072, 0.072, 0.038, 16], C.ink, { x: 0.17, y: 0.78, z: 0.384, rx: Math.PI / 2 }),
    part('box', [0.06, 0.012, 0.015], '#FF8A80', { x: 0.19, y: 0.79, z: 0.408, rz: -0.55 }),
    // group head and portafilter
    part('cyl', [0.14, 0.14, 0.09, 14], C.ink, { x: -0.08, y: 0.59, z: 0.36, rx: Math.PI / 2 }),
    part('cyl', [0.115, 0.115, 0.05, 14], C.woodDark, { x: -0.08, y: 0.57, z: 0.42, rx: Math.PI / 2 }),
    part('cyl', [0.035, 0.04, 0.31, 8], C.woodDark, { x: 0.10, y: 0.57, z: 0.43, rz: Math.PI / 2 }),
    // twin espresso spouts
    part('cyl', [0.018, 0.018, 0.15, 8], C.ink, { x: -0.13, y: 0.45, z: 0.43 }),
    part('cyl', [0.018, 0.018, 0.15, 8], C.ink, { x: -0.03, y: 0.45, z: 0.43 }),
    // steam wand on the right, angled outward
    part('cyl', [0.022, 0.026, 0.34, 8], C.ink, { x: 0.29, y: 0.43, z: 0.36, rz: -0.28 }),
    part('sph', [0.035, 8], C.ink, { x: 0.335, y: 0.27, z: 0.36 }),
    // drip tray + three visible grate rails
    part('rbox', [0.58, 0.055, 0.34, 0.025], C.ink, { y: 0.25, z: 0.34 }),
    part('box', [0.035, 0.012, 0.27], C.metal, { x: -0.16, y: 0.284, z: 0.34 }),
    part('box', [0.035, 0.012, 0.27], C.metal, { x: 0.00, y: 0.284, z: 0.34 }),
    part('box', [0.035, 0.012, 0.27], C.metal, { x: 0.16, y: 0.284, z: 0.34 }),
    // two clean cups on the warmer
    part('cyl', [0.09, 0.075, 0.10, 10], C.cream, { x: 0.10, y: 1.02, z: 0.04 }),
    part('cyl', [0.09, 0.075, 0.10, 10], C.cream, { x: 0.29, y: 1.02, z: 0.04 }),
  ], { cast: false, receive: true }));
  return g;
}

export function createCoffeePolish(world, scene, owner = null) {
  const details = [];
  for (const st of world.stations.values()) {
    if (!st || st.type !== 'coffee') continue;
    const g = espressoDetailMesh();
    g.position.set(st.x, 0, st.z); g.rotation.y = st.rot || 0; g.visible = !!st.active;
    scene.add(g); details.push({ st, g });
  }

  function polishCarriedCoffee() {
    if (!owner || !Array.isArray(owner.items)) return;
    for (const item of owner.items) {
      const product = item && item.userData && item.userData.product;
      if ((product !== 'coffee' && product !== 'latte') || item.userData.coffeePolished) continue;
      item.geometry = coffeeCupGeometry(product === 'latte');
      item.material = toonMaterial();
      item.userData.coffeePolished = true;
      item.castShadow = false; item.receiveShadow = true;
    }
  }

  return {
    details,
    update() {
      for (const d of details) d.g.visible = !!d.st.active;
      polishCarriedCoffee();
    },
    destroy() { for (const d of details) { scene.remove(d.g); d.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); } },
  };
}
