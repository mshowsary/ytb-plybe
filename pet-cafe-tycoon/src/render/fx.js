// src/render/fx.js
import * as THREE from 'three';
import { heartGeo } from './pets.js';
import { emissiveMaterial } from './palette.js';
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
export function createFx(scene, camera, layer, walletEl) {
  const MAXP = 300; const parts = [];
  const pm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), MAXP);
  pm.count = 0; pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3); scene.add(pm);
  const hearts = []; const hg = heartGeo(); const hm = emissiveMaterial('#FF8A80');
  const F = { camera };
  F.project = (x, y, z, out) => { _v.set(x, y, z).project(camera); out.sx = (_v.x * 0.5 + 0.5) * innerWidth; out.sy = (-_v.y * 0.5 + 0.5) * innerHeight; out.visible = _v.z < 1; return out; };
  F.burst = (x, y, z, hex, n = 12) => { const c = new THREE.Color(hex);
    for (let i = 0; i < n && parts.length < MAXP; i++) { const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 2.5, vz: Math.sin(a) * sp, life: 0.6, r: c.r, g: c.g, b: c.b, sz: 0.6 + Math.random() * 0.8 }); } };
  F.hearts = (x, y, z, n = 3) => { for (let i = 0; i < n && hearts.length < 24; i++) { const m = new THREE.Mesh(hg, hm); m.scale.setScalar(0.18); m.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.3); scene.add(m); hearts.push({ m, life: 1.2, vx: (Math.random() - 0.5) * 0.4 }); } };
  const tmp = { sx: 0, sy: 0, visible: true };
  F.coinArc = (x, y, z, n = 6, onArrive) => { F.project(x, y, z, tmp); const r = walletEl.getBoundingClientRect(); const tx = r.left + 24, ty = r.top + r.height / 2; let first = true;
    for (let i = 0; i < Math.min(n, 12); i++) { const d = document.createElement('div'); d.className = 'fcoin';
      const sx = tmp.sx + (Math.random() - 0.5) * 40, sy = tmp.sy + (Math.random() - 0.5) * 40; d.style.left = sx + 'px'; d.style.top = sy + 'px'; layer.appendChild(d);
      setTimeout(() => { d.style.transition = 'left .55s cubic-bezier(.3,-.3,.6,1), top .55s cubic-bezier(.4,.2,.2,1), transform .55s'; d.style.left = tx + 'px'; d.style.top = ty + 'px'; d.style.transform = 'translate(-50%,-50%) scale(.6)'; }, 20 + i * 40);
      setTimeout(() => { d.remove(); if (first && onArrive) { first = false; onArrive(); } }, 600 + i * 40); } };
  // M3 T5: a green cash bill flying FROM the wallet TO a build outline while it's being paid off
  // (opposite direction of coinArc, which flies coins TO the wallet on a sale) — zones.js calls
  // this at most once per BILL_INTERVAL while genuinely spending on an active zone.
  F.billFly = (x, y, z) => {
    F.project(x, y, z, tmp);
    if (!tmp.visible) return;
    const r = walletEl.getBoundingClientRect(); const sx = r.left + 24, sy = r.top + r.height / 2;
    const d = document.createElement('div'); d.className = 'fbill';
    d.style.left = sx + 'px'; d.style.top = sy + 'px'; d.style.opacity = '1'; layer.appendChild(d);
    requestAnimationFrame(() => {
      d.style.transition = 'left .5s cubic-bezier(.3,-.2,.5,1), top .5s cubic-bezier(.4,.1,.3,1), transform .5s, opacity .5s';
      d.style.left = tmp.sx + 'px'; d.style.top = tmp.sy + 'px';
      d.style.transform = 'translate(-50%,-50%) scale(.7) rotate(18deg)'; d.style.opacity = '0.3';
    });
    setTimeout(() => d.remove(), 550);
  };
  F.number = (x, y, z, text, cls) => { F.project(x, y, z, tmp); if (!tmp.visible) return; const d = document.createElement('div'); d.className = cls ? 'fnum ' + cls : 'fnum'; d.textContent = text; d.style.left = tmp.sx + 'px'; d.style.top = tmp.sy + 'px'; layer.appendChild(d); setTimeout(() => d.remove(), 950); };
  F.update = dt => {
    let k = 0;
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      _p.set(p.x, p.y, p.z); _s.setScalar(p.sz * Math.min(1, p.life * 3)); _m.compose(_p, _q, _s); pm.setMatrixAt(k, _m); pm.setColorAt(k, _c.setRGB(p.r, p.g, p.b)); k++; }
    pm.count = k; if (k) { pm.instanceMatrix.needsUpdate = true; pm.instanceColor.needsUpdate = true; }
    for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h.life -= dt; if (h.life <= 0) { scene.remove(h.m); hearts.splice(i, 1); continue; }
      h.m.position.y += dt * 0.9; h.m.position.x += h.vx * dt; h.m.scale.setScalar(0.18 * Math.min(1, h.life * 2)); h.m.lookAt(camera.position); }
  };
  return F;
}
