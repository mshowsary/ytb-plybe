// Build-zone outlines + price bubbles + deliberate stand-to-build payment.
// Gameplay communication is visual-first: the zone shows price + hold progress, not instructions.
import { payZone } from '../sim/world.js';
import { crossedBuildPaymentMilestone } from '../sim/checkpoint.js';
import { buildOutline } from '../render/props.js';
import { semanticBuildGhost } from '../render/buildPreview.js';
import { insideBuildFootprint, stepBuildIntent } from '../sim/buildIntent.js';
import { Spring } from '../core/tween.js';
import { pickSavingTarget } from '../ui/hud.js';

const COIN_SVG = '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#FFD84D" stroke="#C98A00" stroke-width="1.5"/></svg>';
const fmt = n => Math.round(n).toLocaleString('en-US');
const BILL_INTERVAL = 0.15;
export const BUILD_ANTICIPATION_SECONDS = 0.15;

function reducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function createZones(G, S, ctx) {
  const { area, world, scene, hud, fx, audio, hints, els, P } = ctx;
  const zonesMap = new Map();
  for (const z of area.zones) {
    const stDef = area.stations.find(s => s.id === z.adds[0]);
    const fw = (stDef && stDef.fw) || 1.6, fd = (stDef && stDef.fd) || 1.6, rot = (stDef && stDef.rot) || 0;
    const outline = buildOutline(fw, fd); outline.position.set(z.x, 0, z.z); outline.rotation.y = rot; outline.visible = false; scene.add(outline);
    // Task 32: the construction ghost uses the real future station silhouette. A player can read
    // oven/table/counter/Staff Desk from the world before spending a coin.
    const ghost = semanticBuildGhost(stDef, fw, fd); ghost.position.set(z.x, 0.025, z.z); ghost.rotation.y = rot; ghost.visible = false; scene.add(ghost);

    const price = document.createElement('div'); price.className = 'zprice'; price.style.display = 'none';
    // Program's one-word-verb rule for action controls: BUILD is the pill's first child so it reads
    // left of the coin, and it exists only while the owner is standing in THIS footprint -- the one
    // plot they could actually commit coins to right now. Empty + display:none the rest of the time,
    // set only on change below (see zv.lastWord).
    const zword = document.createElement('span'); zword.className = 'zword';
    zword.style.cssText = 'font-weight:900;font-size:11px;letter-spacing:.06em;margin-right:4px;display:none';
    price.appendChild(zword);
    price.insertAdjacentHTML('beforeend', COIN_SVG + '<span class="zamount"></span>');

    const arm = document.createElement('div');
    arm.className = 'build-intent-progress';
    arm.style.cssText = 'position:absolute;display:none;transform:translate(-50%,-50%);width:48px;height:7px;padding:2px;border-radius:999px;background:#3B2E2ACC;box-shadow:0 3px 8px #0003;pointer-events:none;overflow:hidden';
    const armFill = document.createElement('span');
    armFill.style.cssText = 'display:block;width:100%;height:100%;border-radius:999px;background:#FFD84D;transform-origin:left center;transform:scaleX(0)';
    arm.appendChild(armFill);

    els.fx.append(price, arm);
    const initialPaid = world.built.has(z.id) ? z.price : (world.partial[z.id] || 0);
    zonesMap.set(z.id, {
      outline, ghost, price, priceSpan: price.querySelector('.zamount'), zword, arm, armFill,
      z, fw, fd, rot, intent: { t: 0 }, pulse: new Spring(1, 120, 10), billT: 0, _lastRemaining: -1,
      checkpointPaid: initialPaid, paymentChanged: false,
      revealAnticipation: -1, lastWord: '',
    });
  }
  const tmp = { sx: 0, sy: 0, visible: true };
  const markCheckpoint = reason => { if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint(reason); };

  function onBuilt(e) {
    const zv = zonesMap.get(e.zoneId); if (!zv) return;
    zv.checkpointPaid = zv.z.price; zv.paymentChanged = false;
    markCheckpoint('build-complete');
    zv.outline.visible = false;
    // Keep the recognizable blueprint silhouette for the exact anticipation beat. visuals.js reveals
    // the real station on the same 150ms boundary, so there is no ambiguous blank frame.
    zv.ghost.visible = true; zv.ghost.scale.setScalar(1); zv.revealAnticipation = 0;
    zv.price.remove(); zv.arm.remove();
    audio.play('build');
  }

  function syncAll() {
    for (const zv of zonesMap.values()) {
      zv.intent.t = 0;
      zv.paymentChanged = false;
      zv.revealAnticipation = -1;
      zv.checkpointPaid = world.built.has(zv.z.id) ? zv.z.price : (world.partial[zv.z.id] || 0);
      zv.armFill.style.transform = 'scaleX(0)';
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
      // Recomputed at most once per frame, not per zone: world.activeZoneList tops out around two
      // dozen reachable plots, so re-deriving "which one the wallet ring is already saving toward"
      // here is cheap, and it is the one plot besides wherever the owner is standing that still
      // earns a price pill below.
      const savingTarget = pickSavingTarget(area.zones, world.built);
      for (const z of world.activeZoneList) {
        const zv = zonesMap.get(z.id); if (!zv) continue;
        zv.outline.visible = true; zv.ghost.visible = true;
        zv.pulse.target = 1; const s = zv.pulse.step(dt); zv.outline.scale.setScalar(s); zv.ghost.scale.setScalar(s);

        const inside = insideBuildFootprint(P, z, zv.fw, zv.fd, zv.rot);
        const intent = stepBuildIntent(zv.intent, inside, speed, dt);
        let paid = world.partial[z.id] || 0;

        if (inside) hints.zone = 1;
        zv.armFill.style.transform = `scaleX(${Math.max(0, Math.min(1, intent.progress))})`;

        if (intent.armed && G.coins > 0) {
          const r = payZone(world, z.id, G.coins, dt); G.coins -= r.spent; hud.setCoins(G.coins);
          paid = r.done ? z.price : (world.partial[z.id] || 0);
          if (r.spent > 0) {
            zv.paymentChanged = true;
            zv.pulse.kick(1.5);
            zv.billT -= dt;
            if (zv.billT <= 0) { zv.billT = BILL_INTERVAL; fx.billFly(z.x, 0.6, z.z); }

            if (
              crossedBuildPaymentMilestone(zv.checkpointPaid, paid, z.price)
              || G.coins <= 0
              || r.done
            ) {
              markCheckpoint(r.done ? 'build-complete' : 'build-payment');
              zv.checkpointPaid = paid;
              zv.paymentChanged = false;
            }
          }
        }

        if (!intent.armed && zv.paymentChanged) {
          markCheckpoint('build-payment-stop');
          zv.checkpointPaid = paid;
          zv.paymentChanged = false;
        }

        fx.project(z.x, 0.6, z.z, tmp);
        zv.price.style.left = tmp.sx + 'px'; zv.price.style.top = tmp.sy + 'px';
        zv.arm.style.left = tmp.sx + 'px'; zv.arm.style.top = (tmp.sy + 34) + 'px';
        const remaining = Math.max(0, z.price - paid);
        if (zv._lastRemaining !== remaining) { zv.priceSpan.textContent = fmt(remaining); zv._lastRemaining = remaining; }
        // A price pill on every reachable plot was the other half of the owner's "icon soup"
        // report: a column of coin glyphs down whichever screen edge held the far side of the map.
        // It now shows for exactly two kinds of plot -- the one the wallet ring is already saving
        // toward, or one the owner is standing in or genuinely close to (its footprint, or within
        // 3 m of its centre) -- everywhere else keeps its ghost outline with no pill at all.
        const near = inside || ((P.x - z.x) ** 2 + (P.z - z.z) ** 2 <= 9);
        const isSavingTarget = !!savingTarget && savingTarget.id === z.id;
        zv.price.style.display = tmp.visible && (near || isSavingTarget) ? '' : 'none';
        const word = inside ? 'BUILD' : '';
        if (zv.lastWord !== word) { zv.zword.textContent = word; zv.zword.style.display = word ? '' : 'none'; zv.lastWord = word; }
        zv.arm.style.display = tmp.visible && inside && !intent.armed ? '' : 'none';
      }
      for (const e of world.events) if (e.type === 'built') onBuilt(e);

      // The committed build gets a short semantic-ghost anticipation, not a camera takeover. With
      // reduced motion the silhouette simply holds steady for the same information beat.
      for (const zv of zonesMap.values()) {
        if (zv.revealAnticipation < 0) continue;
        zv.revealAnticipation += Math.max(0, dt);
        if (zv.revealAnticipation >= BUILD_ANTICIPATION_SECONDS) {
          zv.revealAnticipation = -1; zv.ghost.visible = false; zv.ghost.scale.setScalar(1);
        } else if (!reducedMotion()) {
          const p = zv.revealAnticipation / BUILD_ANTICIPATION_SECONDS;
          zv.ghost.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.055);
        }
      }

      hud.hint(null);
      if (ctx.firstHint.t > 0) ctx.firstHint.t = Math.max(0, ctx.firstHint.t - dt);
    },
  };
}
