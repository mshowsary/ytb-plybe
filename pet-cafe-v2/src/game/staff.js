// src/game/staff.js — Runners, the Cashier and the Cleaner. Each is visibly doing their one job.
//
// Runner: carries finished goods from a machine to its counter, reserving the counter slots as it
//   picks them up (world.freeFor), so it can never arrive at a full counter with its arms full.
//   Between runs it brings the right sack from the pantry to any machine whose hopper is low
//   (marking the sacks as on their way, so two carriers never fetch for the same hopper).
// Cashier: stands at the till and serves whoever is at the front of the queue.
// Cleaner: wipes used tables and brings the tip in.
import { createHuman } from '../render/human.js';
import { STAFF, MACHINE_CAP, SACK, TRAY } from './layout.js';
import { makeWalker, syncHuman, drawStack, faceTo } from './actors.js';

const STEP = 0.16;       // seconds per item moved

export function createStaff(ctx) {
  const { W, nav, scene, items, fx, audio } = ctx;
  const crew = new Map();

  function hire(role, pop = true) {
    if (crew.has(role) || !STAFF[role]) return;
    const cfg = STAFF[role];
    const H = createHuman({ shirt: cfg.shirt, hair: role === 'cashier' ? 2 : role === 'cleaner' ? 3 : role === 'runner2' ? 0 : 1, skin: role === 'runner' ? 1 : role === 'runner2' ? 2 : 0 }, cfg.look);
    scene.add(H.group);
    const w = makeWalker(nav, cfg.home.x, cfg.home.z, cfg.speed, 'staff');
    const s = { role, cfg, H, w, carry: { kind: null, n: 0 }, state: 'idle', t: 0, job: null };
    crew.set(role, s);
    syncHuman(H, w, 0.016);
    if (pop) { H.pop(0.5); fx.burst(w.x, 1.2, w.z, '#FFD84D', 18); fx.dust(w.x, w.z, 12); }
  }

  // ---- Runners ------------------------------------------------------------------------------
  function runnerThink(s) {
    // 1. the emptiest counter whose machine has something on its tray and that nobody else is serving
    let best = null, bestFill = Infinity;
    for (const c of W.built('counter')) {
      const m = W.machineFor(c.product);
      if (!m || !m.built || m.tray <= 0 || c.runner) continue;
      if (W.freeFor(c.product) <= 0) continue;
      const fill = (c.stock + c.reserved) / c.cap;
      if (fill < bestFill) { bestFill = fill; best = { counter: c, machine: m }; }
    }
    if (best && bestFill < 0.75) {
      best.counter.runner = s.role;
      s.job = { type: 'restock', ...best, reserved: 0 }; s.state = 'toMachine';
      s.w.go(best.machine.spots.work.x, best.machine.spots.work.z); return;
    }
    // 2. a hopper running low: fetch its sacks
    const m = W.neediest();
    if (m) {
      const sacks = Math.min(2, Math.max(1, W.sacksWanted(m.supply)));
      m.incoming = (m.incoming || 0) + sacks;
      s.job = { type: 'supply', machine: m, sacks }; s.state = 'toPantry';
      const p = W.stations.get('pantry1').spots.work; s.w.go(p.x, p.z); return;
    }
    // 3. nothing urgent: top up a counter that is merely not full
    if (best) {
      best.counter.runner = s.role;
      s.job = { type: 'restock', ...best, reserved: 0 }; s.state = 'toMachine';
      s.w.go(best.machine.spots.work.x, best.machine.spots.work.z); return;
    }
    s.state = 'idle'; s.w.go(s.cfg.home.x, s.cfg.home.z);
  }

  function endJob(s) {
    const j = s.job;
    if (j && j.counter && j.counter.runner === s.role) j.counter.runner = null;
    if (j && j.type === 'supply') j.machine.incoming = Math.max(0, (j.machine.incoming || 0) - (j.sacks || 0));
    s.job = null; s.state = 'idle'; s.t = 0.2;
  }

  function runnerStep(s, dt) {
    const j = s.job;
    s.t += dt;
    switch (s.state) {
      case 'idle':
        if (s.t > 0.4) { s.t = 0; runnerThink(s); }
        return null;
      case 'toMachine':
        if (!s.w.path.length) { s.state = 'pickup'; s.t = 0; }
        return Math.PI;
      case 'pickup':
        if (s.t >= STEP) {
          s.t = 0;
          if (s.carry.n < s.cfg.carry && W.freeFor(j.counter.product) > 0 && W.takeFromMachine(j.machine)) {
            s.carry.kind = j.counter.product; s.carry.n++; j.counter.reserved++; j.reserved++; audio.play('drop');
          } else if (s.carry.n > 0) { s.state = 'toCounter'; s.w.go(j.counter.spots.staff.x, j.counter.spots.staff.z); }
          else endJob(s);
        }
        return Math.PI;
      case 'toCounter':
        if (!s.w.path.length) { s.state = 'place'; s.t = 0; }
        return 0;
      case 'place':
        if (s.t >= STEP) {
          s.t = 0;
          if (s.carry.n > 0 && W.placeOnCounter(j.counter)) { s.carry.n--; j.counter.reserved--; j.reserved--; audio.play('drop'); }
          else if (s.carry.n > 0) {  // cannot happen with reservations, but never stand stuck: take it back
            j.counter.reserved -= j.reserved; j.reserved = 0;
            s.state = 'return'; s.w.go(j.machine.spots.work.x, j.machine.spots.work.z);
          }
          if (s.carry.n === 0) { s.carry.kind = null; endJob(s); }
        }
        return 0;
      case 'return':
        if (!s.w.path.length && s.t >= STEP) {
          s.t = 0;
          if (s.carry.n > 0 && W.returnToMachine(j.machine)) s.carry.n--;
          if (s.carry.n === 0 || j.machine.tray >= TRAY) { s.carry = { kind: null, n: 0 }; endJob(s); }
        }
        return Math.PI;
      case 'toPantry':
        if (!s.w.path.length) {
          s.carry = { kind: j.machine.supply, n: j.sacks }; audio.play('pop');
          s.state = 'toMachineSupply'; s.w.go(j.machine.spots.work.x, j.machine.spots.work.z);
        }
        return Math.PI;
      case 'toMachineSupply':
        if (!s.w.path.length && s.t >= 0.3) {
          s.t = 0;
          if (s.carry.n > 0 && W.loadSack(j.machine)) {
            s.carry.n--; j.sacks--; j.machine.incoming = Math.max(0, (j.machine.incoming || 0) - 1);
            audio.play('pop'); fx.dust(j.machine.x - 0.48, j.machine.z, 6, '#FFFFFF');
          } else { s.carry = { kind: null, n: 0 }; }       // hopper full: the spare goes back, unseen
          if (s.carry.n === 0) { s.carry.kind = null; endJob(s); }
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
      } else s.w.go(s.cfg.home.x, s.cfg.home.z);
      return null;
    }
    const t = s.job;
    if (s.state === 'toTable') { if (!s.w.path.length) { s.state = 'wipe'; s.t = 0; } return faceTo(s.w.x, s.w.z, t.x, t.z); }
    if (s.state === 'wipe') {
      s.H.wipe(0.3);
      if (s.t > 1.1) {
        if (t.dirty) { const tip = W.cleanTable(t); if (tip) W.earn(tip, t.x, t.z); audio.play('clean'); fx.burst(t.x, 0.9, t.z, '#BFEFFF', 10, 0.6); }
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
      if (s.role.startsWith('runner')) face = runnerStep(s, dt);
      else if (s.role === 'cleaner') face = cleanerStep(s, dt);
      else if (s.role === 'cashier') { s.w.go(s.cfg.home.x, s.cfg.home.z); face = 0; }
      syncHuman(s.H, s.w, dt, face);
      s.H.setCarry(s.carry.n);
      drawStack(items, s.H, s.carry);
    }
  }

  const cashierAtTill = () => { const c = crew.get('cashier'); return !!(c && c.w.at(c.cfg.home.x, c.cfg.home.z, 0.3)); };
  const hasRunner = () => [...crew.keys()].some(r => r.startsWith('runner'));
  return { hire, update, cashierAtTill, hasRunner, crew };
}
