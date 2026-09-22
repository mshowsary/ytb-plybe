// src/game/pads.js — build pads (DESIGN.md rule 4). A pad is the footprint of the thing it builds, on
// the spot where it will stand, with a see-through preview of it. Stand on it and coins flow in.
// When you cannot afford the rest yet, a ▶ chip offers to pay half for a video (once per pad).
import * as THREE from 'three';
import { PADS, STAFF } from './layout.js';
import { modelFor, ghostOf } from '../render/props.js';
import { createHuman } from '../render/human.js';

const LABEL_Y = 1.9;

function padTexture(w, d) {
  const c = document.createElement('canvas'); const k = 128;
  c.width = Math.round(w * k); c.height = Math.round(d * k);
  return { c, g: c.getContext('2d'), tex: new THREE.CanvasTexture(c) };
}
function drawPad(t, frac) {
  const { c, g } = t, W = c.width, H = c.height, r = 22, m = 8;
  g.clearRect(0, 0, W, H);
  const rr = (x, y, w, h) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  rr(m, m, W - m * 2, H - m * 2); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill();
  g.save(); rr(m, m, W - m * 2, H - m * 2); g.clip();
  g.fillStyle = 'rgba(126,214,154,0.85)'; g.fillRect(m, m, (W - m * 2) * frac, H - m * 2);
  g.restore();
  rr(m, m, W - m * 2, H - m * 2); g.setLineDash([22, 14]); g.lineWidth = 9; g.strokeStyle = '#FFFFFF'; g.stroke();
  t.tex.needsUpdate = true;
}

export function createPads(ctx) {
  const { W, scene, S, fx, audio, layer, platform, onBuilt } = ctx;
  const live = new Map();              // pad id -> { pad, rect, mesh, tex, ghost, label, boost, frac }
  const scr = { x: 0, y: 0, on: true };
  let billT = 0;

  function rectFor(pad) {
    if (pad.builds.startsWith('staff:')) { const h = STAFF[pad.builds.slice(6)].home; return { x: h.x, z: h.z, w: 1.1, d: 1.1 }; }
    const st = W.stations.get(pad.builds);
    if (st.type === 'table') return { x: st.x, z: st.z, w: 2.3, d: 1.15 };
    return { x: st.x, z: st.z, w: st.fw + 0.1, d: st.fd + 0.1 };
  }

  function open(pad) {
    const rect = rectFor(pad);
    const tex = padTexture(rect.w, rect.d);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.w, rect.d), new THREE.MeshBasicMaterial({ map: tex.tex, transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(rect.x, 0.03, rect.z); mesh.renderOrder = 1;
    scene.add(mesh);
    let ghost;
    if (pad.builds.startsWith('staff:')) {
      const role = pad.builds.slice(6);
      ghost = ghostOf(createHuman({ shirt: STAFF[role].shirt }, role === 'cashier' ? 'cashier' : 'runner').group);
      ghost.position.set(rect.x, 0, rect.z);
    } else {
      const st = W.stations.get(pad.builds);
      ghost = ghostOf(modelFor(st).group);
      ghost.position.set(st.x, 0, st.z); ghost.rotation.y = st.rot || 0;
    }
    scene.add(ghost);
    const label = document.createElement('div'); label.className = 'padlabel';   // touches pass through (only the ▶ button is tappable)
    label.innerHTML = '<span class="coin"></span><b></b><button class="boost" aria-label="Watch a video to pay half">▶ ½</button>';
    layer.appendChild(label);
    const boost = label.querySelector('.boost');
    const L = { pad, rect, mesh, tex, ghost, label, boost, frac: -1, boosted: false };
    boost.addEventListener('click', async e => {
      e.stopPropagation();
      if (L.boosted) return;
      boost.disabled = true;
      const ok = await platform.rewarded('pet-cafe-build-boost');
      boost.disabled = false;
      if (!ok) return;
      L.boosted = true;
      const left = pad.price - (W.paid[pad.id] || 0);
      W.paid[pad.id] = (W.paid[pad.id] || 0) + Math.min(left, Math.ceil(pad.price / 2));
      audio.play('coin'); fx.burst(rect.x, 0.6, rect.z, '#B79BFF', 20);
    });
    live.set(pad.id, L);
  }
  function close(id) {
    const L = live.get(id); if (!L) return;
    scene.remove(L.mesh, L.ghost); L.mesh.geometry.dispose(); L.tex.tex.dispose(); L.label.remove();
    live.delete(id);
  }

  function update(dt, owner) {
    const want = W.padsOpen();
    for (const id of [...live.keys()]) if (!want.find(p => p.id === id)) close(id);
    for (const p of want) if (!live.has(p.id)) open(p);
    billT -= dt;
    for (const L of live.values()) {
      const { pad, rect } = L;
      let paid = W.paid[pad.id] || 0;
      const on = Math.abs(owner.x - rect.x) < rect.w / 2 + 0.05 && Math.abs(owner.z - rect.z) < rect.d / 2 + 0.05;
      if (on && W.coins > 0 && paid < pad.price) {
        const rate = Math.max(pad.price / 1.3, 30);
        const n = Math.min(W.coins, pad.price - paid, Math.max(1, Math.round(rate * dt)));
        W.coins -= n; paid += n; W.paid[pad.id] = paid;
        if (billT <= 0) { billT = 0.09; audio.play('coin'); }
      }
      if (paid >= pad.price) {
        delete W.paid[pad.id]; W.build(pad.builds); audio.play('build');
        onBuilt(pad.builds); close(pad.id);
        continue;
      }
      const frac = paid / pad.price;
      if (Math.abs(frac - L.frac) > 0.004) { L.frac = frac; drawPad(L.tex, frac); }
      L.ghost.traverse(o => { if (o.isMesh) o.material.opacity = on ? 0.5 : 0.3; });
      S.worldToScreen(rect.x, LABEL_Y, rect.z, scr);
      L.label.style.display = scr.on ? '' : 'none';
      L.label.style.transform = `translate(${scr.x | 0}px,${scr.y | 0}px)`;
      L.label.querySelector('b').textContent = String(pad.price - paid);
      const showBoost = !L.boosted && platform.rewardedAvailable() && W.coins < pad.price - paid && frac < 0.5;
      L.boost.style.display = showBoost ? '' : 'none';
      L.label.classList.toggle('afford', W.coins >= pad.price - paid);
    }
  }

  return { update, live };
}
