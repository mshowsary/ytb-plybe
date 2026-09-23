// src/game/deliveries.js — delivery orders: the owner's own job once the staff run the café.
//
// Every minute or two the café van pulls into the side alley beside the delivery hatch (a window in
// the right wall). Its order is one product in a quantity — "🧁 ×8" — and only the owner fills it:
// fetch from the machine (you may carry past what the counter could take while an order needs it),
// then drop the goods into the hatch crate. Deliveries pay double. When one is done, a ▶ ×2 button
// offers to double that reward for a video. Ignore the van and it simply leaves; anything already
// handed in is still paid. Nothing is ever lost.
import * as THREE from 'three';
import { part, mesh } from '../render/geo.js';
import { PRODUCTS } from './layout.js';
import { shelfSlot } from '../render/items.js';

export const HATCH = { x: 3.36, z: 0.1, spot: { x: 2.7, z: 0.1 } };
const VAN_PARK = { x: 5.2, z: 0.4 }, VAN_ROAD = { x: 5.2, z: 13 };
const WAIT = 110, FIRST = 70;

export function createDeliveries(ctx) {
  const { W, scene, items, bubbles, fx, audio, hud, layer, platform, S, hotspots } = ctx;
  const beach = ctx.theme === 'beach', mall = ctx.theme === 'mall';

  // the hatch: a little counter under a window in the right wall, with a crate on it
  const hatch = mesh([
    part('box', [0.45, 0.9, 1.1], beach ? '#2E4A78' : mall ? '#FBF8F3' : '#7FC8B6', { y: 0.45 }),
    part('box', [0.5, 0.06, 1.18], beach ? '#9C7A55' : '#B9834A', { y: 0.92, tex: 'wood' }),
    part('box', [0.38, 0.2, 0.8], '#C99A5B', { y: 1.05, tex: 'wood' }),
    part('box', [0.04, 0.9, 1.3], '#FFFFFF', { x: 0.3, y: 1.8 }),
    part('box', [0.06, 0.1, 1.4], beach ? '#EE7F5F' : mall ? '#D9A93F' : '#FF8A80', { x: 0.3, y: 2.3 }),
  ]);
  hatch.position.set(HATCH.x, 0, HATCH.z); scene.add(hatch);

  // the van
  const van = mesh([
    part('rbox', [1.6, 1.3, 2.9, 0.2], '#FFFFFF', { y: 0.95 }),
    part('rbox', [1.62, 0.3, 2.92, 0.1], beach ? '#2E4A78' : mall ? '#7FD1B9' : '#FF6F61', { y: 0.55 }),
    part('rbox', [1.5, 0.8, 0.9, 0.18], '#FFFFFF', { y: 0.9, z: -1.7 }),
    part('box', [1.3, 0.45, 0.05], '#BFE4F5', { y: 1.15, z: -2.16 }),
    ...[[-0.8, -1.4], [0.8, -1.4], [-0.8, 0.9], [0.8, 0.9]].map(([x, z]) => part('cyl', [0.3, 0.3, 0.2, 12], '#2B2B2B', { x, y: 0.3, z, rz: Math.PI / 2 })),
    part('cyl', [0.34, 0.34, 0.03, 16], beach ? '#EE7F5F' : mall ? '#F47B6B' : '#FF6F61', { x: -0.81, y: 1.2, z: 0.2, rz: Math.PI / 2 }),
    part('sph', [0.1, 8], '#FFFFFF', { x: -0.83, y: 1.18, z: 0.2, sx: 0.3 }),
    part('box', [0.05, 0.1, 0.25], '#FFF3B0', { x: 0.55, y: 0.7, z: -2.16 }), part('box', [0.05, 0.1, 0.25], '#FFF3B0', { x: -0.55, y: 0.7, z: -2.16 }),
  ]);
  van.visible = false; scene.add(van);

  const claimBtn = document.createElement('button');
  claimBtn.className = 'dealbtn ui hidden'; layer.appendChild(claimBtn);
  let bonus = 0, claimT = 0;
  claimBtn.addEventListener('click', async e => {
    e.stopPropagation(); claimBtn.disabled = true;
    const ok = await platform.rewarded('pet-cafe-delivery-double');
    claimBtn.disabled = false; claimBtn.classList.add('hidden'); claimT = 0;
    if (ok && bonus > 0) { W.earn(bonus, HATCH.x, HATCH.z); audio.play('fanfare'); fx.confetti(HATCH.x, HATCH.z, 1.2, 30); }
  });

  let state = 'off', t = FIRST, order = null, drive = 0, tick = 0, hop = 0, honks = 0;
  // reminder honks while an order waits untouched: after 12 s, 30 s and 55 s, and a last call before it goes
  const REMIND = [WAIT - 12, WAIT - 30, WAIT - 55, 14];
  function honk(soft) { audio.play(soft ? 'hornSoft' : 'horn'); hop = 1; }
  const scr = { x: 0, y: 0, on: true };
  const menu = () => W.built('machine').map(m => m.product).filter(p => W.counterFor(p)?.built);

  function start() {
    const products = menu(); if (!products.length) return;
    const product = products[(Math.random() * products.length) | 0];
    const qty = 5 + ((Math.random() * 5) | 0) + Math.min(3, W.lvl('carry'));
    order = { product, qty, got: 0 };
    state = 'arrive'; drive = 0; van.visible = true;
    honks = 0;
  }
  function finish(done) {
    if (order && order.got > 0) {
      const pay = W.price(order.product) * order.got * 2;
      W.earn(pay, HATCH.x, HATCH.z);
      if (done) { W.events.push({ type: 'delivered' }); hud.banner(`🚚 Delivery done! +${pay}`, 2200); audio.play('fanfare'); fx.confetti(HATCH.x, HATCH.z, 1.4, 40); bonus = pay; claimT = 8; }
    }
    order = null; state = 'leave'; drive = 0;
  }

  return {
    get order() { return state === 'wait' ? order : null; },
    need: product => (state === 'wait' && order && order.product === product) ? order.qty - order.got : 0,
    hatchSpot: HATCH.spot,
    // called every frame; `owner` is the owner's state (for hand-ins)
    update(dt, owner, carry, setCarry) {
      if (state === 'off') {
        if (W.isBuilt('staff:runner')) { t -= dt; if (t <= 0) start(); }
      } else if (state === 'arrive' || state === 'leave') {
        drive = Math.min(1, drive + dt / 3);
        const k = state === 'arrive' ? drive : 1 - drive, e = k * k * (3 - 2 * k);
        van.position.set(VAN_PARK.x, Math.abs(Math.sin(drive * 30)) * 0.02 * (1 - Math.abs(e - 0.5) * 2), VAN_ROAD.z + (VAN_PARK.z - VAN_ROAD.z) * e);
        van.rotation.y = 0;
        if (drive >= 1) {
          if (state === 'arrive') { state = 'wait'; t = WAIT; S.shake(0.04); honk(false); }
          else { state = 'off'; van.visible = false; t = 60 + Math.random() * 40; }
        }
      } else if (state === 'wait') {
        t -= dt;
        // nobody has come yet: honk again, gently, so a busy owner remembers the van mid-rush
        if (honks < REMIND.length && t <= REMIND[honks]) {
          const near = Math.hypot(owner.x - HATCH.spot.x, owner.z - HATCH.spot.z) < 2.5;
          if (order.got === 0 && !near) honk(true);
          honks++;
        }
        // hand-ins: stand at the hatch holding the ordered product
        const at = Math.hypot(owner.x - HATCH.spot.x, owner.z - HATCH.spot.z) < 0.7;
        tick -= dt;
        if (at && carry.kind === order.product && carry.n > 0 && tick <= 0) {
          tick = 0.12; setCarry(carry.kind, carry.n - 1); order.got++; audio.play('drop');
          if (order.got >= order.qty) finish(true);
        }
        if (state === 'wait' && t <= 0) finish(false);
      }
      // the van bounces on its springs with every honk
      if (hop > 0 && van.visible) {
        hop = Math.max(0, hop - dt * 2.2);
        const b = Math.sin((1 - hop) * Math.PI * 3) * hop;
        van.position.y = Math.max(0, b * 0.12); van.scale.set(1 + b * 0.03, 1 - b * 0.05, 1 + b * 0.03);
      } else if (van.visible) van.scale.set(1, 1, 1);
      // what the crate holds, and the order bubble
      if (order && state === 'wait') {
        for (let i = 0; i < Math.min(order.got, 8); i++) { const s = shelfSlot(i, 4, 0.1, 0.18); items.add(order.product, HATCH.x + s.z, 1.16, HATCH.z + s.x * 2, 0, 0.8); }
        // a blue ring where you hand in, and the order as a picture with a fill bar over the hatch
        hotspots?.show(HATCH.spot.x, HATCH.spot.z, '#5BA7E8', 0.95, 1.1);
        bubbles.show('deliv', HATCH.x, 2.6, HATCH.z, `🚚 ${PRODUCTS[order.product].emoji}<i class="meter"><i style="width:${Math.round(100 * order.got / order.qty)}%"></i></i><b>${order.qty - order.got}</b>`, hop > 0.2 ? 'need order honk' : 'need order');
      }
      if (claimT > 0) {
        claimT -= dt;
        S.worldToScreen(HATCH.x, 2.2, HATCH.z, scr);
        claimBtn.innerHTML = `<i class="play"></i><b>×2</b> <span class="coin"></span>+${bonus}`;
        claimBtn.style.transform = `translate(${scr.x | 0}px,${scr.y | 0}px)`;
        claimBtn.classList.toggle('hidden', !scr.on || !platform.rewardedAvailable());
        if (claimT <= 0) claimBtn.classList.add('hidden');
      }
    },
    teardown() { claimBtn.remove(); },
  };
}
