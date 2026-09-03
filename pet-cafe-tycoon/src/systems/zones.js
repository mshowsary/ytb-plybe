// src/systems/zones.js — build-zone dashed outlines + price bubbles, payment (cash bills flying
// from the wallet), gate opening, end card, hint sequencing. M3 T5: replaces the purple disc ring
// + .zlabel with a dashed footprint outline, a cream ghost slab, and a coin+number price bubble;
// zoneRing() itself is kept exported from render/props.js only for the dirty-seat cleaning ring.
import { payZone } from '../sim/world.js';
import { buildOutline, buildGhost } from '../render/props.js';
import { pendingJobs } from '../sim/jobs.js';
import { insideBuildFootprint, stepBuildIntent } from '../sim/buildIntent.js';
import { Spring } from '../core/tween.js';

const COIN_SVG = '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#FFD84D" stroke="#C98A00" stroke-width="1.5"/></svg>';
const fmt = n => Math.round(n).toLocaleString('en-US');
const BILL_INTERVAL = 0.15;

export function createZones(G, S, ctx) {
  const { area, world, scene, hud, fx, audio, hints, els, P } = ctx;
  const zonesMap = new Map();
  for (const z of area.zones) {
    // Match the build interaction to the actual first station footprint and rotation. The visible
    // dashed rectangle is now also the gameplay hit area — no hidden circular trigger.
    const stDef = area.stations.find(s => s.id === z.adds[0]);
    const fw = (stDef && stDef.fw) || 1.6, fd = (stDef && stDef.fd) || 1.6, rot = (stDef && stDef.rot) || 0;
    const outline = buildOutline(fw, fd); outline.position.set(z.x, 0, z.z); outline.rotation.y = rot; outline.visible = false; scene.add(outline);
    const ghost = buildGhost(fw, fd); ghost.position.set(z.x, 0, z.z); ghost.rotation.y = rot; ghost.visible = false; scene.add(ghost);
    const price = document.createElement('div'); price.className = 'zprice'; price.style.display = 'none';
    price.innerHTML = COIN_SVG + '<span></span>';
    const arm = document.createElement('div');
    arm.textContent = 'Stop here to build';
    arm.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);padding:5px 10px;border-radius:999px;background:#3B2E2A;color:#FFF4E6;font:800 12px/1 system-ui,sans-serif;white-space:nowrap;box-shadow:0 3px 8px #0003;pointer-events:none';
    els.fx.append(price, arm);
    zonesMap.set(z.id, {
      outline, ghost, price, priceSpan: price.querySelector('span'), arm,
      z, fw, fd, rot, intent: { t: 0 }, pulse: new Spring(1, 120, 10), billT: 0, _lastRemaining: -1,
    });
  }
  const tmp = { sx: 0, sy: 0, visible: true };
  let kioskHintT = 0, hireHintT = 0, regHintT = 0, beansHintT = 0;
  let regHintShown = false, beansHintShown = false;
  const HINT_CHECK_INTERVAL = 0.25;
  let hintCheckCd = 0;

  function onBuilt(e) {
    const zv = zonesMap.get(e.zoneId); if (!zv) return;
    zv.outline.visible = false; zv.ghost.visible = false; zv.price.remove(); zv.arm.remove();
    fx.burst(zv.z.x, 0.5, zv.z.z, '#FFF4E6', 30); audio.play('build'); S.shake(0.08);
    if (e.zoneId === 'z_kiosk') kioskHintT = 4;
    if (e.zoneId === 'z_hire') hireHintT = 4;
  }

  function syncAll() {
    for (const zv of zonesMap.values()) {
      zv.intent.t = 0;
      if (world.built.has(zv.z.id)) {
        zv.outline.visible = false; zv.ghost.visible = false; zv.price.style.display = 'none'; zv.arm.style.display = 'none';
        zv.price.remove(); zv.arm.remove();
      }
    }
    for (const z of world.activeZoneList) {
      const zv = zonesMap.get(z.id); if (!zv) continue;
      zv.outline.visible = true; zv.ghost.visible = true;
      if (!zv.price.isConnected) els.fx.appendChild(zv.price);
      if (!zv.arm.isConnected) els.fx.appendChild(zv.arm);
      zv.price.style.display = '';
    }
  }

  return {
    syncAll,
    update(dt) {
      const speed = Math.hypot(P.vx || 0, P.vz || 0);
      for (const z of world.activeZoneList) {
        const zv = zonesMap.get(z.id); if (!zv) continue;
        zv.outline.visible = true; zv.ghost.visible = true;
        zv.pulse.target = 1; const s = zv.pulse.step(dt); zv.outline.scale.setScalar(s); zv.ghost.scale.setScalar(s);

        const inside = insideBuildFootprint(P, z, zv.fw, zv.fd, zv.rot);
        const intent = stepBuildIntent(zv.intent, inside, speed, dt);
        let paid = world.partial[z.id] || 0;

        if (inside) {
          hints.zone = 1;
          if (!intent.armed) {
            const pct = Math.round(intent.progress * 100);
            zv.arm.textContent = speed > 0.45 ? 'Stop here to build' : `Hold still · ${pct}%`;
          }
        }

        if (intent.armed && G.coins > 0) {
          const r = payZone(world, z.id, G.coins, dt); G.coins -= r.spent; hud.setCoins(G.coins);
          paid = world.partial[z.id] || 0;
          if (r.spent > 0) {
            zv.pulse.kick(1.5);
            zv.billT -= dt;
            if (zv.billT <= 0) { zv.billT = BILL_INTERVAL; fx.billFly(z.x, 0.6, z.z); }
          }
        }

        fx.project(z.x, 0.6, z.z, tmp);
        zv.price.style.left = tmp.sx + 'px'; zv.price.style.top = tmp.sy + 'px';
        zv.arm.style.left = tmp.sx + 'px'; zv.arm.style.top = (tmp.sy + 36) + 'px';
        const remaining = Math.max(0, z.price - paid);
        if (zv._lastRemaining !== remaining) { zv.priceSpan.textContent = fmt(remaining); zv._lastRemaining = remaining; }
        zv.price.style.display = tmp.visible ? '' : 'none';
        zv.arm.style.display = tmp.visible && inside && !intent.armed ? '' : 'none';
      }
      for (const e of world.events) if (e.type === 'built') onBuilt(e);

      if (kioskHintT > 0) kioskHintT -= dt;
      if (hireHintT > 0) hireHintT -= dt;

      hintCheckCd -= dt;
      if (hintCheckCd <= 0) {
        hintCheckCd = HINT_CHECK_INTERVAL;
        if (!regHintShown) {
          const j = pendingJobs(world, G);
          if (j.registerWaiting > 0) { regHintShown = true; regHintT = 4; }
        }
        if (!beansHintShown) {
          for (const st of world.stations.values()) {
            if (st.type === 'coffee' && st.active && st.beans === 0) { beansHintShown = true; beansHintT = 4; break; }
          }
        }
      }
      if (regHintT > 0) regHintT -= dt;
      if (beansHintT > 0) beansHintT -= dt;

      const chain = !hints.oven ? 'Walk to the oven' : !hints.counter ? 'Bring the treats to the display' : !hints.cash ? 'Collect cash from the register tray' : !hints.zone ? 'Stop inside the build area' : null;
      const override = kioskHintT > 0 ? 'Buy upgrades at the kiosk' : hireHintT > 0 ? 'Hire staff at the desk'
        : regHintT > 0 ? 'Stand at the register to serve the queue' : beansHintT > 0 ? 'Refill the coffee machine from the pantry' : null;
      if (ctx.firstHint.t > 0) ctx.firstHint.t = Math.max(0, ctx.firstHint.t - dt);
      const firstHint = ctx.firstHint.t > 0 ? ctx.firstHint.msg : null;
      hud.hint(firstHint || override || chain);
    },
  };
}
