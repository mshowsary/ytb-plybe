// src/render/fx.js — particles (one instanced draw call), coins that fly to the wallet, floating numbers.
import * as THREE from 'three';

const PARTY = ['#FF8A80', '#FFD84D', '#7BC47F', '#6EC6FF', '#B79BFF', '#FFFFFF'];

export function createFx(scene, S, layer, walletEl) {
  const MAX = 500, parts = [];
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  im.count = 0; im.frustumCulled = false; scene.add(im);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  const scr = { x: 0, y: 0, on: true };

  const push = o => { if (parts.length < MAX) parts.push(o); };
  const F = {};
  // a puff of sparkles thrown up from a point
  F.burst = (x, y, z, hex = '#FFD84D', n = 12, power = 1) => {
    c.set(hex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (1.2 + Math.random() * 2) * power;
      push({ x, y, z, vx: Math.cos(a) * sp, vy: (2 + Math.random() * 2.5) * power, vz: Math.sin(a) * sp, life: 0.7, max: 0.7, g: 9, r: c.r, gg: c.g, b: c.b, sz: 0.8 + Math.random() * 0.8, spin: 0 });
    }
  };
  // soft dust at the feet (building, landing)
  F.dust = (x, z, n = 10, hex = '#EADFCB') => {
    c.set(hex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
      push({ x, y: 0.08, z, vx: Math.cos(a) * sp, vy: 0.4 + Math.random() * 0.8, vz: Math.sin(a) * sp, life: 0.6, max: 0.6, g: 1.5, r: c.r, gg: c.g, b: c.b, sz: 1.4 + Math.random(), spin: 0 });
    }
  };
  // rising steam (ovens)
  F.steam = (x, y, z) => push({ x: x + (Math.random() - 0.5) * 0.2, y, z, vx: (Math.random() - 0.5) * 0.1, vy: 0.5, vz: 0, life: 1.3, max: 1.3, g: 0, r: 1, gg: 1, b: 1, sz: 1.1, spin: 0 });
  // paper confetti falling over an area
  F.confetti = (x, z, spread = 4, n = 60) => {
    for (let i = 0; i < n; i++) {
      c.set(PARTY[i % PARTY.length]);
      push({ x: x + (Math.random() - 0.5) * spread * 2, y: 3 + Math.random() * 2, z: z + (Math.random() - 0.5) * spread * 2,
        vx: (Math.random() - 0.5) * 0.6, vy: -0.4 - Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.6, life: 3, max: 3, g: 0.05,
        r: c.r, gg: c.g, b: c.b, sz: 1.2, spin: 6 + Math.random() * 6, flat: true });
    }
  };
  // a firework: a sphere of sparks in the air and a flash at its heart
  F.firework = (x, y, z, hex) => {
    c.set(hex || PARTY[(Math.random() * 5) | 0]);
    for (let i = 0; i < 46; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = 2.8 + Math.random() * 0.8;
      push({ x, y, z, vx: r * Math.cos(a) * sp, vy: u * sp + 0.5, vz: r * Math.sin(a) * sp, life: 1.2, max: 1.2, g: 1.6, r: c.r, gg: c.g, b: c.b, sz: 1.5 + Math.random(), spin: 0 });
    }
    for (let i = 0; i < 3; i++) push({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.2, max: 0.2, g: 0, r: 1, gg: 1, b: 0.9, sz: 6, spin: 0 });
  };

  // coins that leap from a world point into the wallet, then call back once
  F.coins = (x, y, z, n = 5, onArrive) => {
    S.worldToScreen(x, y, z, scr);
    const r = walletEl.getBoundingClientRect(), tx = r.left + 26, ty = r.top + r.height / 2;
    let first = true;
    for (let i = 0; i < Math.min(n, 10); i++) {
      const d = document.createElement('div'); d.className = 'fcoin';
      const sx = scr.x + (Math.random() - 0.5) * 36, sy = scr.y + (Math.random() - 0.5) * 24;
      d.style.transform = `translate(${sx}px,${sy}px)`; layer.appendChild(d);
      setTimeout(() => { d.style.transition = 'transform .6s cubic-bezier(.45,-.35,.6,1), opacity .6s'; d.style.transform = `translate(${tx}px,${ty}px) scale(.7)`; }, 30 + i * 45);
      setTimeout(() => { d.remove(); if (first) { first = false; onArrive && onArrive(); } }, 660 + i * 45);
    }
  };
  F.number = (x, y, z, text, cls = '') => {
    S.worldToScreen(x, y, z, scr); if (!scr.on) return;
    const d = document.createElement('div'); d.className = 'fnum ' + cls; d.textContent = text;
    d.style.left = scr.x + 'px'; d.style.top = scr.y + 'px'; layer.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  };

  F.update = dt => {
    let k = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const o = parts[i]; o.life -= dt;
      if (o.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      o.vy -= o.g * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.y < 0.03) { o.y = 0.03; o.vy *= -0.25; o.vx *= 0.6; o.vz *= 0.6; }
      const fade = Math.min(1, o.life / o.max * 3);
      if (o.flat) { e.set(o.life * o.spin, o.life * o.spin * 0.7, 0); q.setFromEuler(e); s.set(o.sz * 1.4, o.sz * 0.25, o.sz); }
      else { q.identity(); s.setScalar(o.sz * fade); }
      p.set(o.x, o.y, o.z); m.compose(p, q, s); im.setMatrixAt(k, m);
      im.setColorAt(k, c.setRGB(o.r, o.gg, o.b)); k++;
    }
    im.count = k;
    if (k) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  };
  return F;
}
