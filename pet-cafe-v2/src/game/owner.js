// src/game/owner.js — the player's café owner: walking, and every hands-free interaction.
// Stand at a spot and things move one at a time: pick up from a machine, restock a counter, load a
// sack into a hopper, serve at the till, wipe a table. You never pick up more than the counter still
// has room for (rule 3), and anything extra goes back on the machine tray or the pantry shelf.
import * as THREE from 'three';
import { createHuman } from '../render/human.js';
import { OWNER, SUPPLIES } from './layout.js';
import { drawStack } from './actors.js';

const YAW = 0.36, STEP = 0.11, REACH = 0.72, TABLE_REACH = 1.25, WIPE = 0.6;

export function createOwner(ctx) {
  const { W, nav, scene, items, bubbles, audio, fx } = ctx;
  const H = createHuman({ shirt: '#FF8A80', hair: 0, skin: 0 }, 'owner');
  scene.add(H.group);
  // WHERE AM I: a warm ring on the floor under the owner, and a small arrow above the head that shows
  // through the crowd (drawn last, no depth test), so a glance at a busy café finds you at once.
  const ringMat = new THREE.MeshBasicMaterial({ color: '#FF8A3D', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.56, 40), ringMat);
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.62, 40), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.44, 40), new THREE.MeshBasicMaterial({ color: '#FFD9A8', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }));
  for (const m of [ring, rim, disc]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 3; }
  // the arrow: a bold down-pointing marker drawn on a canvas, always facing the camera
  const ac = document.createElement('canvas'); ac.width = ac.height = 128;
  { const g = ac.getContext('2d'); g.beginPath(); g.moveTo(16, 22); g.lineTo(112, 22); g.lineTo(64, 110); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#FFFFFF'; g.stroke(); g.fillStyle = '#FF8A3D'; g.fill(); }
  const arrowTex = new THREE.CanvasTexture(ac); arrowTex.colorSpace = THREE.SRGBColorSpace;
  const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTex, depthTest: false, depthWrite: false, toneMapped: false }));
  arrow.scale.set(0.5, 0.5, 1); arrow.renderOrder = 11;
  const arrowRim = { position: { y: 0 }, scale: { setScalar() {} } };   // (kept for the update code below)
  const marker = new THREE.Group(); marker.add(disc, ring, rim, arrow); scene.add(marker);
  let markT = 0;
  const o = { x: OWNER.start.x, z: OWNER.start.z, vx: 0, vz: 0, carry: { kind: null, n: 0 }, tick: 0, wipeT: 0, wiping: null, atTill: false, idle: 0, zone: null };
  let stepT = 0;
  H.onStep = () => { if ((stepT += 1) % 2 === 0) audio.play('step'); };

  const near = (p, r = REACH) => p && Math.hypot(p.x - o.x, p.z - o.z) < r;
  const counterRoom = product => {        // room on the counter, not counting what the owner holds
    const c = W.counterFor(product);
    return c && c.built ? Math.max(0, c.cap - c.stock - c.reserved) : 0;
  };
  const setCarry = (kind, n) => { o.carry.kind = n > 0 ? kind : null; o.carry.n = n; W.ownerHold.kind = o.carry.kind; W.ownerHold.n = n; };
  const isSack = k => !!SUPPLIES[k];

  // The spot you are standing at: the nearest one within reach (a machine's spot and its counter's
  // spot are only a step apart across the kitchen aisle, so "first match" would pick wrong).
  function zoneHere() {
    let best = null, bd = REACH;
    const consider = (kind, st, p, r = REACH) => { if (!p) return; const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < Math.min(bd, r)) { bd = d; best = { kind, st }; } };
    const till = W.stations.get('till1');
    consider('till', till, till.spots.staff, 0.8);
    for (const ct of W.built('counter')) consider('counter', ct, ct.spots.staff);
    for (const m of W.built('machine')) consider('machine', m, m.spots.work);
    const pantry = W.stations.get('pantry1'); consider('pantry', pantry, pantry.spots.work);
    return best;
  }

  function interact(dt) {
    o.atTill = false;
    const c = o.carry;
    const z = zoneHere();
    if (z && z.kind === 'till') { o.atTill = true; return z; }
    if (z && z.kind === 'counter') {
      const ct = z.st;
      if (c.kind === ct.product && c.n > 0 && o.tick <= 0 && W.placeOnCounter(ct)) {
        setCarry(c.kind, c.n - 1); o.tick = STEP; audio.play('drop'); H.tap();
      }
      return z;
    }
    if (z && z.kind === 'machine') {
      const m = z.st;
      if (o.tick > 0) return z;
      if (isSack(c.kind)) {
        // only its own sack goes in a hopper (the band colours match)
        if (c.kind === m.supply && W.loadSack(m)) { setCarry(c.kind, c.n - 1); o.tick = 0.3; audio.play('pop'); fx.dust(m.x - 0.48, m.z, 8, '#FFFFFF'); H.tap(); }
      } else if (!c.kind || c.kind === m.product) {
        // room on the counter, plus whatever a waiting delivery still needs of this product
        const room = counterRoom(m.product) + (ctx.deliveries ? ctx.deliveries.need(m.product) : 0) + Math.max(0, W.requests[m.product] | 0);
        if (c.n > room && W.returnToMachine(m)) { setCarry(m.product, c.n - 1); o.tick = STEP; audio.play('drop'); }
        else if (c.n < OWNER.carry + W.carryBonus() && c.n < room && W.takeFromMachine(m)) { setCarry(m.product, c.n + 1); o.tick = STEP; audio.play('drop'); H.tap(); }
        else if (room === 0 && m.tray > 0 && !c.n) { const ct = W.counterFor(m.product); if (ct.built) bubbles.show('full' + m.id, ct.x, 1.9, ct.z, '✅', 'mood small'); }
      }
      return z;
    }
    if (z && z.kind === 'pantry') {
      if (o.tick <= 0 && (!c.kind || isSack(c.kind))) {
        const kind = c.kind || (W.neediest() || {}).supply;
        if (kind) {
          const wanted = W.sacksWanted(kind);
          if (c.n < Math.min(2, wanted)) { setCarry(kind, c.n + 1); o.tick = 0.3; audio.play('pop'); H.tap(); }
          else if (c.n > wanted) { setCarry(kind, c.n - 1); o.tick = 0.3; audio.play('pop'); }   // put the spare one back
        }
      }
      return z;
    }
    // tables: wipe a used one from any side
    let dirty = null;
    for (const t of W.built('table')) if (t.dirty && t.claimed !== 'cleaner' && near(t, TABLE_REACH)) { dirty = t; break; }
    if (dirty) {
      if (o.wiping !== dirty) { o.wiping = dirty; o.wipeT = 0; }
      o.wipeT += dt; H.wipe(0.25);
      bubbles.show('wipe', dirty.x, 1.7, dirty.z, `<i class="ring" style="--p:${Math.min(1, o.wipeT / WIPE)}"></i>`, 'prog');
      if (o.wipeT >= WIPE) { W.events.push({ type: 'wiped' }); const tip = W.cleanTable(dirty); if (tip) W.earn(tip, dirty.x, dirty.z); audio.play('clean'); fx.burst(dirty.x, 0.9, dirty.z, '#BFEFFF', 10, 0.6); o.wiping = null; }
      return { kind: 'table', st: dirty };
    }
    o.wiping = null;
    return null;
  }

  function update(dt, move) {
    // camera-relative movement: screen right and screen up, turned into the floor's axes
    const rx = Math.cos(YAW), rz = -Math.sin(YAW), fx0 = -Math.sin(YAW), fz0 = -Math.cos(YAW);
    const mx = rx * move.x + fx0 * -move.y, mz = rz * move.x + fz0 * -move.y;
    o.vx = mx * OWNER.speed * W.speedMult(); o.vz = mz * OWNER.speed * W.speedMult();
    const p = nav.collide(o.x + o.vx * dt, o.z + o.vz * dt);
    const realVx = (p.x - o.x) / Math.max(dt, 1e-4), realVz = (p.z - o.z) / Math.max(dt, 1e-4);
    o.x = p.x; o.z = p.z;
    o.tick -= dt;
    const moving = Math.hypot(move.x, move.y) > 0.05;
    o.idle = moving ? 0 : o.idle + dt;
    o.zone = interact(dt);
    H.group.position.set(o.x, 0, o.z);
    markT += dt;
    marker.position.set(o.x, 0.07, o.z);
    const pulse = 1 + Math.sin(markT * 4) * 0.05;
    ring.scale.set(pulse, pulse, 1); disc.scale.set(pulse, pulse, 1); rim.scale.set(pulse, pulse, 1);
    const ay = 3.3 + Math.sin(markT * 3.2) * 0.1;
    arrow.position.y = ay; arrowRim.position.y = ay;
    // in a crowd the arrow matters most: it grows a little when guests are close around you
    const busy = ctx.crowd ? ctx.crowd(o.x, o.z) : 0;
    const k = 0.85 + Math.min(0.45, busy * 0.12);
    arrow.scale.set(0.66 * k, 0.66 * k, 1);
    // standing at a station, face it: machines and the pantry are behind you (the back wall),
    // counters and the till are in front of you
    let face = null;
    if (!moving && o.zone && o.zone.st) {
      const k = o.zone.kind;
      face = (k === 'machine' || k === 'pantry') ? Math.PI : (k === 'counter' || k === 'till') ? 0 : Math.atan2(o.zone.st.x - o.x, o.zone.st.z - o.z);
    }
    if (face != null) { let d = face - H.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); H.group.rotation.y += d * Math.min(1, dt * 12); H._face = H.group.rotation.y; }
    H.update(dt, moving ? realVx : 0, moving ? realVz : 0);
    H.setCarry(o.carry.n);
    drawStack(items, H, o.carry);
    // at the pantry with empty hands, show which sack you are about to take
    if (o.zone && o.zone.kind === 'pantry' && !o.carry.kind) {
      const need = W.neediest();
      if (need) bubbles.show('pantrypick', o.x, 2.5, o.z, SUPPLIES[need.supply].emoji, 'want');
    }
  }

  // hand one carried item to a guest at a table
  o.give = kind => { if (o.carry.kind === kind && o.carry.n > 0) { setCarry(kind, o.carry.n - 1); audio.play('drop'); H.tap(); } };
  return { o, H, update, setCarry };
}
