// src/render/hotspots.js — glowing rings on the floor under things the owner can act on right now:
// gold under a table whose guest wants something, blue at the delivery hatch, pink under a pet
// waiting to be stroked. Pictures, not words: a ring that pulses says "here".
import * as THREE from 'three';

const ringGeo = new THREE.RingGeometry(0.62, 0.8, 40);
const fillGeo = new THREE.CircleGeometry(0.62, 40);
const mats = new Map();
const matFor = (hex, a) => {
  const k = hex + a; if (mats.has(k)) return mats.get(k);
  const m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: a, depthWrite: false, toneMapped: false });
  mats.set(k, m); return m;
};

export function createHotspots(scene) {
  const pool = [];
  let used = 0, t = 0;
  function get() {
    if (used < pool.length) return pool[used++];
    const ring = new THREE.Mesh(ringGeo, matFor('#FFFFFF', 0.9)), fill = new THREE.Mesh(fillGeo, matFor('#FFFFFF', 0.25));
    for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; }
    const g = new THREE.Group(); g.add(fill, ring); scene.add(g);
    const h = { g, ring, fill }; pool.push(h); used++; return h;
  }
  return {
    begin(dt) { used = 0; t += dt; },
    // color: a hex; r: radius in metres; phase offsets the pulse so neighbours do not beat together
    show(x, z, color, r = 1, phase = 0, y = 0.06) {
      const h = get();
      h.ring.material = matFor(color, 0.95); h.fill.material = matFor(color, 0.22);
      const p = r * (1 + Math.sin(t * 5 + phase) * 0.07);
      h.g.position.set(x, y, z); h.g.scale.set(p, 1, p); h.g.visible = true;
    },
    end() { for (let i = used; i < pool.length; i++) pool[i].g.visible = false; },
  };
}
