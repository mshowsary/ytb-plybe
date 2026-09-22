// src/game/staff.js — the Runner, the Cashier and the Cleaner. Each is visibly doing their one job.
//
// Runner: carries baked goods from an oven to its counter, reserving the counter slots before it
//   picks anything up (world.freeFor), so it can never arrive to a full counter with its arms full.
//   Between runs it brings flour from the pantry to any oven running low.
// Cashier: stands at the till and serves whoever is at the front of the queue.
// Cleaner: wipes used tables and brings the tip in.
import { createHuman } from '../render/human.js';
import { STAFF, OVEN_FLOUR, SACK_FLOUR } from './layout.js';
import { makeWalker, syncHuman, drawStack, faceTo } from './actors.js';

const STEP = 0.16;       // seconds per item moved

export function createStaff(ctx) {
  const { W, nav, scene, items, bubbles, fx, audio } = ctx;
  const crew = new Map();

  function hire(role, pop = true) {
    if (crew.has(role)) return;
    const cfg = STAFF[role];
    const H = createHuman({ shirt: cfg.shirt, hair: role === 'cashier' ? 2 : role === 'cleaner' ? 3 : 1, skin: role === 'runner' ? 1 : 0 }, role === 'cashier' ? 'cashier' : 'runner');
    scene.add(H.group);
    const w = makeWalker(nav, cfg.home.x, cfg.home.z, cfg.speed, 'staff');
    const s = { role, H, w, carry: { kind: null, n: 0 }, state: 'idle', t: 0, job: null };
    crew.set(role, s);
    syncHuman(H, w, 0.016);
    if (pop) { H.pop(0.5); fx.burst(w.x, 1.2, w.z, '#FFD84D', 18); fx.dust(w.x, w.z, 12); }
  }

  // ---- the Runner ---------------------------------------------------------------------------
  function runnerThink(s) {
    // 1. the emptiest counter whose oven has something on its tray
    let best = null, bestFill = Infinity;
    for (const c of W.built('counter')) {
      const oven = W.ovenFor(c.product);
      if (!oven || !oven.built || oven.tray <= 0) continue;
      const free = W.freeFor(c.product);
      if (free <= 0) continue;
      const fill = (c.stock + c.reserved) / c.cap;
      if (fill < bestFill) { bestFill = fill; best = { counter: c, oven }; }
    }
    if (best) { s.job = { type: 'restock', ...best, reserved: 0 }; s.state = 'toOven'; s.w.go(best.oven.spots.work.x, best.oven.spots.work.z); return; }
    // 2. an oven running low on flour
    const pantry = W.stations.get('pantry1');
    let low = null;
    for (const o of W.built('oven')) if (o.flour <= OVEN_FLOUR - SACK_FLOUR && !o.flourClaimed && (!low || o.flour < low.flour)) low = o;
    if (low) { low.flourClaimed = true; s.job = { type: 'flour', oven: low }; s.state = 'toPantry'; s.w.go(pantry.spots.work.x, pantry.spots.work.z); return; }
    s.state = 'idle'; s.w.go(STAFF.runner.home.x, STAFF.runner.home.z);
  }

  function runnerStep(s, dt) {
    const j = s.job;
    s.t += dt;
    switch (s.state) {
      case 'idle':
        if (s.t > 0.4) { s.t = 0; runnerThink(s); }
        return null;
      case 'toOven':
        if (!s.w.path.length) { s.state = 'pickup'; s.t = 0; }
        return Math.PI;
      case 'pickup': {
        // take what the counter still has room for, reserving each slot as it is picked up
        if (s.t >= STEP) {
          s.t = 0;
          const room = W.freeFor(j.counter.product);
          if (s.carry.n < STAFF.runner.carry && room > 0 && W.takeFromOven(j.oven)) {
            s.carry.kind = j.counter.product; s.carry.n++; j.counter.reserved++; j.reserved++; audio.play('drop');
          } else if (s.carry.n > 0) { s.state = 'toCounter'; s.w.go(j.counter.spots.staff.x, j.counter.spots.staff.z); }
          else { s.job = null; s.state = 'idle'; }
        }
        return Math.PI;
      }
      case 'toCounter':
        if (!s.w.path.length) { s.state = 'place'; s.t = 0; }
        return 0;
      case 'place':
        if (s.t >= STEP) {
          s.t = 0;
          if (s.carry.n > 0 && W.placeOnCounter(j.counter)) { s.carry.n--; j.counter.reserved--; j.reserved--; audio.play('drop'); }
          else if (s.carry.n > 0) {  // cannot happen with reservations, but never stand stuck: take it back
            j.counter.reserved -= j.reserved; j.reserved = 0;
            s.state = 'return'; s.w.go(j.oven.spots.work.x, j.oven.spots.work.z);
          }
          if (s.carry.n === 0) { s.carry.kind = null; s.job = null; s.state = 'idle'; s.t = 0.3; }
        }
        return 0;
      case 'return':
        if (!s.w.path.length && s.t >= STEP) {
          s.t = 0;
          if (s.carry.n > 0 && W.returnToOven(j.oven)) s.carry.n--;
          if (s.carry.n === 0 || j.oven.tray >= 8) { s.carry = { kind: null, n: 0 }; s.job = null; s.state = 'idle'; }
        }
        return Math.PI;
      case 'toPantry':
        if (!s.w.path.length) {
          const sacks = Math.min(2, Math.max(1, Math.floor((OVEN_FLOUR - j.oven.flour) / SACK_FLOUR)));
          s.carry = { kind: 'flour', n: sacks }; audio.play('pop');
          s.state = 'toOvenFlour'; s.w.go(j.oven.spots.work.x, j.oven.spots.work.z);
        }
        return Math.PI;
      case 'toOvenFlour':
        if (!s.w.path.length && s.t >= 0.3) {
          s.t = 0;
          if (s.carry.n > 0 && W.loadFlour(j.oven)) { s.carry.n--; audio.play('pop'); fx.dust(j.oven.x, j.oven.z + 0.6, 6, '#FFFFFF'); }
          else { s.carry = { kind: null, n: 0 }; j.oven.flourClaimed = false; s.job = null; s.state = 'idle'; }
          if (s.carry.n === 0) { s.carry.kind = null; j.oven.flourClaimed = false; s.job = null; s.state = 'idle'; }
        }
        return Math.PI;
    }
    return null;
  }

  // ---- the Cleaner ----------------------------------------------------------------------------
  function cleanerStep(s, dt) {
    s.t += dt;
    if (s.state === 'idle') {
      const dirty = W.built('table').filter(t => t.dirty && !t.claimed);
      if (dirty.length) {
        const t = dirty.sort((a, b) => Math.hypot(a.x - s.w.x, a.z - s.w.z) - Math.hypot(b.x - s.w.x, b.z - s.w.z))[0];
        t.claimed = 'cleaner'; s.job = t; s.state = 'toTable';
        // stand at whichever side of the table is nearest (tables are wiped from any side)
        const a = Math.atan2(s.w.z - t.z, s.w.x - t.x);
        s.w.go(t.x + Math.cos(a) * 0.95, t.z + Math.sin(a) * 0.95);
      } else s.w.go(STAFF.cleaner.home.x, STAFF.cleaner.home.z);
      return null;
    }
    const t = s.job;
    if (s.state === 'toTable') { if (!s.w.path.length) { s.state = 'wipe'; s.t = 0; } return faceTo(s.w.x, s.w.z, t.x, t.z); }
    if (s.state === 'wipe') {
      s.H.wipe(0.3);
      if (s.t > 1.1) {
        if (t.dirty) { const tip = W.cleanTable(t); if (tip) W.earn(tip, t.x, t.z); audio.play('clean'); }
        t.claimed = null; s.job = null; s.state = 'idle';
      }
      return faceTo(s.w.x, s.w.z, t.x, t.z);
    }
    return null;
  }

  function update(dt) {
    for (const s of crew.values()) {
      s.w.step(dt);
      let face = null;
      if (s.role === 'runner') face = runnerStep(s, dt);
      else if (s.role === 'cleaner') face = cleanerStep(s, dt);
      else if (s.role === 'cashier') { const sp = STAFF.cashier.home; s.w.go(sp.x, sp.z); face = 0; }
      syncHuman(s.H, s.w, dt, face);
      s.H.setCarry(s.carry.n);
      drawStack(items, s.H, s.carry);
    }
  }

  const cashierAtTill = () => { const c = crew.get('cashier'); return !!(c && c.w.at(STAFF.cashier.home.x, STAFF.cashier.home.z, 0.3)); };
  return { hire, update, cashierAtTill, crew };
}
