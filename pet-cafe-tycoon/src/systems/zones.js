// src/systems/zones.js — build-zone dashed outlines + price bubbles, payment (cash bills flying
// from the wallet), gate opening, end card, hint sequencing. M3 T5: replaces the purple disc ring
// + .zlabel with a dashed footprint outline, a cream ghost slab, and a coin+number price bubble;
// zoneRing() itself is kept exported from render/props.js only for the dirty-seat cleaning ring.
import { payZone } from '../sim/world.js';
import { buildOutline, buildGhost } from '../render/props.js';
import { pendingJobs } from '../sim/jobs.js';
import { Spring } from '../core/tween.js';

const near = (a, b, r) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r;
const COIN_SVG = '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#FFD84D" stroke="#C98A00" stroke-width="1.5"/></svg>';
const fmt = n => Math.round(n).toLocaleString('en-US');
const BILL_INTERVAL = 0.15;

export function createZones(G, S, ctx) {
  const { area, world, scene, hud, fx, audio, sheets, vis, hints, els, P } = ctx;
  const zonesMap = new Map();
  for (const z of area.zones) {
    // M3 T5 fix round 1: match visuals.js's own station-mesh rotation (g.rotation.y = st.rot) so a
    // rotated station's build outline/ghost reads as the actual footprint shape, not an
    // axis-aligned box — use the FIRST id in zone.adds (not just any station.find match) so a
    // multi-station zone still keys off a deterministic station's fw/fd/rot.
    const stDef = area.stations.find(s => s.id === z.adds[0]);
    const fw = (stDef && stDef.fw) || 1.6, fd = (stDef && stDef.fd) || 1.6, rot = (stDef && stDef.rot) || 0;
    const outline = buildOutline(fw, fd); outline.position.set(z.x, 0, z.z); outline.rotation.y = rot; outline.visible = false; scene.add(outline);
    const ghost = buildGhost(fw, fd); ghost.position.set(z.x, 0, z.z); ghost.rotation.y = rot; ghost.visible = false; scene.add(ghost);
    const price = document.createElement('div'); price.className = 'zprice'; price.style.display = 'none';
    price.innerHTML = COIN_SVG + '<span></span>';
    els.fx.appendChild(price);
    zonesMap.set(z.id, { outline, ghost, price, priceSpan: price.querySelector('span'), z, pulse: new Spring(1, 120, 10), billT: 0, _lastRemaining: -1 });
  }
  const tmp = { sx: 0, sy: 0, visible: true };
  let kioskHintT = 0, hireHintT = 0, regHintT = 0, beansHintT = 0;
  let regHintShown = false, beansHintShown = false;
  // M3 T5 fix round 1: regHintShown/beansHintShown used to re-scan pendingJobs/every station on
  // every single frame; throttle to 4x/second, the same RECOMPUTE_INTERVAL objective.js already
  // uses for its own per-frame jobTarget recompute.
  const HINT_CHECK_INTERVAL = 0.25;
  let hintCheckCd = 0;

  function onBuilt(e) {
    const zv = zonesMap.get(e.zoneId); zv.outline.visible = false; zv.ghost.visible = false; zv.price.remove();
    fx.burst(zv.z.x, 0.5, zv.z.z, '#FFF4E6', 30); audio.play('build'); S.shake(0.08);
    // Loop v2 Task 1 removed the gate/terrace zone entirely (area 2 is a later milestone) — no
    // 'z_kiosk' zone exists any more either (the kiosk is free from the start), so kioskHintT is
    // dead in practice but harmless to leave wired for whenever a kiosk-unlock zone returns.
    if (e.zoneId === 'z_kiosk') kioskHintT = 4;
    if (e.zoneId === 'z_hire') hireHintT = 4;
  }

  // C2: called from G.restore, right after visuals.syncAll(), so a loaded save doesn't leave a
  // built zone's outline/ghost/price lingering on stage (never hidden, since onBuilt only fires
  // for zones paid off live in this session) or an active zone's outline missing (never shown,
  // since the per-frame loop below only iterates world.activeZoneList, which restore just rebuilt).
  function syncAll() {
    for (const zv of zonesMap.values()) {
      if (world.built.has(zv.z.id)) { zv.outline.visible = false; zv.ghost.visible = false; zv.price.style.display = 'none'; zv.price.remove(); }
    }
    for (const z of world.activeZoneList) {
      const zv = zonesMap.get(z.id); if (!zv) continue;
      zv.outline.visible = true; zv.ghost.visible = true;
      if (!zv.price.isConnected) els.fx.appendChild(zv.price); // re-attach if a prior build() had removed it
      zv.price.style.display = '';
    }
  }

  return {
    syncAll,
    update(dt) {
      // I8: w.activeZoneList is a cache rebuilt only in refreshActive (i.e. only when the built
      // set changes), instead of re-filtering all 13 zones against the built set every frame.
      for (const z of world.activeZoneList) {
        const zv = zonesMap.get(z.id);
        zv.outline.visible = true; zv.ghost.visible = true;
        zv.pulse.target = 1; const s = zv.pulse.step(dt); zv.outline.scale.setScalar(s); zv.ghost.scale.setScalar(s);
        const paid = world.partial[z.id] || 0;
        if (near(P, z, 1.1) && G.coins > 0) {
          const r = payZone(world, z.id, G.coins, dt); G.coins -= r.spent; hud.setCoins(G.coins);
          if (r.spent > 0) {
            zv.pulse.kick(1.5);
            zv.billT -= dt;
            if (zv.billT <= 0) { zv.billT = BILL_INTERVAL; fx.billFly(z.x, 0.6, z.z); }
          }
          hints.zone = 1;
        }
        fx.project(z.x, 0.6, z.z, tmp); zv.price.style.left = tmp.sx + 'px'; zv.price.style.top = tmp.sy + 'px';
        const remaining = Math.max(0, z.price - paid);
        if (zv._lastRemaining !== remaining) { zv.priceSpan.textContent = fmt(remaining); zv._lastRemaining = remaining; }
        zv.price.style.display = tmp.visible ? '' : 'none';
      }
      for (const e of world.events) if (e.type === 'built') onBuilt(e);

      if (kioskHintT > 0) kioskHintT -= dt;
      if (hireHintT > 0) hireHintT -= dt;

      // M3 T5: two one-time hints, gated by a real trigger and shown once (not re-armed): a
      // customer waiting unserved at a register, and the coffee machine running dry.
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

      const chain = !hints.oven ? 'Walk to the oven' : !hints.counter ? 'Bring the treats to the display' : !hints.cash ? 'Collect the cash' : !hints.zone ? 'Stand on the circle to build' : null;
      const override = kioskHintT > 0 ? 'Buy upgrades at the kiosk' : hireHintT > 0 ? 'Hire staff at the desk'
        : regHintT > 0 ? 'Stand at the register to take payment' : beansHintT > 0 ? 'Refill the coffee machine from the pantry' : null;
      // Loop v2 Task 2: the first-approach hint (systems/stations.js's noteFirstHint, shown once
      // per station TYPE on first genuine dwell) outranks both the progress chain above and the
      // one-time zone-built overrides — it's the most specific, most immediately-relevant thing to
      // tell the player right now. ctx.firstHint is the shared mailbox (game.js wires it into both
      // systems' ctx) since stations.js's per-frame loop runs before this one but hud.hint() is
      // only ever called from here, so this file is the single writer.
      if (ctx.firstHint.t > 0) ctx.firstHint.t = Math.max(0, ctx.firstHint.t - dt);
      const firstHint = ctx.firstHint.t > 0 ? ctx.firstHint.msg : null;
      hud.hint(firstHint || override || chain);
    },
  };
}
