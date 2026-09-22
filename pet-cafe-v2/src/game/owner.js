// src/game/owner.js — the player's café owner: walking, and every hands-free interaction.
// Stand at a spot and things move one at a time: pick up from an oven, restock a counter, load
// flour, serve at the till, wipe a table. You never pick up more than the counter still has room
// for (rule 3), and anything extra goes back on the oven tray or the pantry shelf.
import { createHuman } from '../render/human.js';
import { OWNER, OVEN_FLOUR, SACK_FLOUR } from './layout.js';
import { drawStack } from './actors.js';

const YAW = 0.36, STEP = 0.11, REACH = 0.72, TABLE_REACH = 1.25, WIPE = 0.6;

export function createOwner(ctx) {
  const { W, nav, scene, items, bubbles, audio, fx } = ctx;
  const H = createHuman({ shirt: '#FF8A80', hair: 0, skin: 0 }, 'owner');
  scene.add(H.group);
  const o = { x: OWNER.start.x, z: OWNER.start.z, vx: 0, vz: 0, carry: { kind: null, n: 0 }, tick: 0, wipeT: 0, wiping: null, atTill: false, idle: 0 };
  H.onStep = () => audio.play('step');

  const near = (p, r = REACH) => p && Math.hypot(p.x - o.x, p.z - o.z) < r;
  const counterRoom = product => {        // room on the counter, not counting what the owner holds
    const c = W.counterFor(product);
    return c && c.built ? Math.max(0, c.cap - c.stock - c.reserved) : 0;
  };
  const setCarry = (kind, n) => { o.carry.kind = n > 0 ? kind : null; o.carry.n = n; W.ownerHold.kind = o.carry.kind; W.ownerHold.n = n; };

  // The spot you are standing at: the nearest one within reach (an oven's spot and its counter's
  // spot are only a step apart across the kitchen aisle, so "first match" would pick wrong).
  function zoneHere() {
    let best = null, bd = REACH;
    const consider = (kind, st, p, r = REACH) => { if (!p) return; const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < Math.min(bd, r)) { bd = d; best = { kind, st }; } };
    const till = W.stations.get('till1');
    consider('till', till, till.spots.staff, 0.8);
    for (const ct of W.built('counter')) consider('counter', ct, ct.spots.staff);
    for (const ov of W.built('oven')) consider('oven', ov, ov.spots.work);
    const pantry = W.stations.get('pantry1'); consider('pantry', pantry, pantry.spots.work);
    return best;
  }

  function interact(dt) {
    o.atTill = false;
    const c = o.carry;
    const z = zoneHere();
    if (z && z.kind === 'till') { o.atTill = true; return 'till'; }
    if (z && z.kind === 'counter') {
      const ct = z.st;
      if (c.kind === ct.product && c.n > 0 && o.tick <= 0 && W.placeOnCounter(ct)) {
        setCarry(c.kind, c.n - 1); o.tick = STEP; audio.play('drop'); H.tap();
      }
      return 'counter';
    }
    if (z && z.kind === 'oven') {
      const ov = z.st;
      if (o.tick > 0) return 'oven';
      if (c.kind === 'flour') {
        if (W.loadFlour(ov)) { setCarry('flour', c.n - 1); o.tick = 0.3; audio.play('pop'); fx.dust(ov.x - 0.48, ov.z, 8, '#FFFFFF'); H.tap(); }
      } else if (!c.kind || c.kind === ov.product) {
        const room = counterRoom(ov.product);
        if (c.n > room && W.returnToOven(ov)) { setCarry(ov.product, c.n - 1); o.tick = STEP; audio.play('drop'); }
        else if (c.n < OWNER.carry && c.n < room && W.takeFromOven(ov)) { setCarry(ov.product, c.n + 1); o.tick = STEP; audio.play('drop'); H.tap(); }
        else if (room === 0 && ov.tray > 0 && !c.n) { const ct = W.counterFor(ov.product); bubbles.show('full' + ov.id, ct.x, 1.9, ct.z, '✅', 'mood small'); }
      }
      return 'oven';
    }
    if (z && z.kind === 'pantry') {
      if (o.tick <= 0 && (!c.kind || c.kind === 'flour')) {
        const wanted = W.flourWanted();
        if (c.n < Math.min(2, wanted)) { setCarry('flour', c.n + 1); o.tick = 0.3; audio.play('pop'); H.tap(); }
        else if (c.kind === 'flour' && c.n > wanted) { setCarry('flour', c.n - 1); o.tick = 0.3; audio.play('pop'); }
      }
      return 'pantry';
    }
    // tables: wipe a used one from any side
    let dirty = null;
    for (const t of W.built('table')) if (t.dirty && t.claimed !== 'cleaner' && near(t, TABLE_REACH)) { dirty = t; break; }
    if (dirty) {
      if (o.wiping !== dirty) { o.wiping = dirty; o.wipeT = 0; }
      o.wipeT += dt; H.wipe(0.25);
      bubbles.show('wipe', dirty.x, 1.7, dirty.z, `<i class="ring" style="--p:${Math.min(1, o.wipeT / WIPE)}"></i>`, 'prog');
      if (o.wipeT >= WIPE) { const tip = W.cleanTable(dirty); if (tip) W.earn(tip, dirty.x, dirty.z); audio.play('clean'); o.wiping = null; }
      return 'table';
    }
    o.wiping = null;
    return null;
  }

  function update(dt, move) {
    // camera-relative movement: screen right and screen up, turned into the floor's axes
    const rx = Math.cos(YAW), rz = -Math.sin(YAW), fx0 = -Math.sin(YAW), fz0 = -Math.cos(YAW);
    const mx = rx * move.x + fx0 * -move.y, mz = rz * move.x + fz0 * -move.y;
    const sp = OWNER.speed;
    o.vx = mx * sp; o.vz = mz * sp;
    const p = nav.collide(o.x + o.vx * dt, o.z + o.vz * dt);
    const realVx = (p.x - o.x) / Math.max(dt, 1e-4), realVz = (p.z - o.z) / Math.max(dt, 1e-4);
    o.x = p.x; o.z = p.z;
    o.tick -= dt;
    const moving = Math.hypot(move.x, move.y) > 0.05;
    o.idle = moving ? 0 : o.idle + dt;
    o.zone = interact(dt);
    H.group.position.set(o.x, 0, o.z);
    H.update(dt, moving ? realVx : 0, moving ? realVz : 0);
    H.setCarry(o.carry.n);
    drawStack(items, H, o.carry);
  }

  return { o, H, update, setCarry };
}
