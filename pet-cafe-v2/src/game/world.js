// src/game/world.js — the café's state and its rules. No three.js, no DOM.
import {
  STATIONS, PADS, PRODUCTS, TRAY, MACHINE_CAP, SACK, COUNTER_CAP, TABLE_TIP, spotsFor, STAFF, PET_UNLOCKS,
} from './layout.js';
import { PET_SPECIES, PET_PROFILES } from '../sim/petBook.js';

export function createWorld() {
  const stations = new Map();
  for (const def of STATIONS) {
    const st = { ...def, built: !!def.built, spots: spotsFor(def) };
    if (st.type === 'machine') Object.assign(st, { supply: PRODUCTS[st.product].supply, tray: 0, level: MACHINE_CAP, t: 0 });
    if (st.type === 'counter') Object.assign(st, { stock: 0, reserved: 0, cap: COUNTER_CAP, guests: [null, null] });
    if (st.type === 'table') Object.assign(st, { dirty: false, tip: 0, guest: null, claimed: null });
    stations.set(st.id, st);
  }
  const W = {
    stations,
    coins: 0,
    staff: new Set(),            // 'runner', 'runner2', 'cashier', 'cleaner'
    paid: {},                    // pad id -> coins already paid in
    served: 0,
    met: new Set(),              // pet book: 'species:variant'
    events: [],                  // { type, ... } for the presentation layer, cleared every frame
    ownerHold: { kind: null, n: 0 },
    priceMult: 1,
  };

  W.built = type => [...stations.values()].filter(s => s.built && (!type || s.type === type));
  W.isBuilt = id => id.startsWith('staff:') ? W.staff.has(id.slice(6)) : !!stations.get(id)?.built;
  W.machineFor = product => [...stations.values()].find(s => s.type === 'machine' && s.product === product);
  W.counterFor = product => [...stations.values()].find(s => s.type === 'counter' && s.product === product);

  // ---- rule 3: nobody overfills a counter -------------------------------------------------
  // Slots already spoken for: what Runners are carrying toward it, plus what the owner holds of it.
  W.freeFor = product => {
    const c = W.counterFor(product);
    if (!c || !c.built) return 0;
    const ownerHolds = W.ownerHold.kind === product ? W.ownerHold.n : 0;
    return Math.max(0, c.cap - c.stock - c.reserved - ownerHolds);
  };
  // Whole sacks of `kind` the built machines could take right now (minus what is on its way).
  W.sacksWanted = kind => {
    let n = 0;
    for (const m of W.built('machine')) if (m.supply === kind) n += Math.floor((MACHINE_CAP - m.level - (m.incoming || 0) * SACK) / SACK);
    return Math.max(0, n);
  };
  // The supply the café needs most (the machine with the emptiest hopper), or null.
  W.neediest = () => {
    let best = null, bf = 1;
    for (const m of W.built('machine')) {
      const f = (m.level + (m.incoming || 0) * SACK) / MACHINE_CAP;
      if (f <= 0.5 && f < bf) { bf = f; best = m; }
    }
    return best;
  };

  // ---- machines -----------------------------------------------------------------------------
  W.step = dt => {
    for (const m of W.built('machine')) {
      m.busy = m.level > 0 && m.tray < TRAY;
      if (!m.busy) { m.t = 0; continue; }
      m.t += dt;
      if (m.t >= PRODUCTS[m.product].make) { m.t = 0; m.tray++; m.level--; W.events.push({ type: 'made', id: m.id }); }
    }
  };

  // ---- transfers (one item at a time; callers pace them) --------------------------------------
  W.takeFromMachine = m => { if (m.tray <= 0) return false; m.tray--; return true; };
  W.returnToMachine = m => { if (m.tray >= TRAY) return false; m.tray++; return true; };
  W.loadSack = m => { if (m.level > MACHINE_CAP - SACK) return false; m.level += SACK; return true; };
  W.placeOnCounter = c => { if (c.stock >= c.cap) return false; c.stock++; return true; };
  W.takeFromCounter = c => { if (c.stock <= 0) return false; c.stock--; return true; };

  W.dirtyTable = t => {
    t.dirty = true; t.guest = null;
    t.tip += TABLE_TIP[0] + Math.floor(Math.random() * (TABLE_TIP[1] - TABLE_TIP[0] + 1));
  };
  W.cleanTable = t => {
    const tip = t.tip; t.dirty = false; t.tip = 0; t.claimed = null;
    W.events.push({ type: 'cleaned', id: t.id, tip });
    return tip;
  };
  W.earn = (n, x, z) => { W.coins += n; W.events.push({ type: 'earn', n, x, z }); };

  // ---- pets --------------------------------------------------------------------------------
  W.complete = () => PADS.every(p => W.isBuilt(p.builds));
  W.speciesOpen = () => PET_SPECIES.filter(s => !PET_UNLOCKS[s] || W.isBuilt(PET_UNLOCKS[s]));
  W.bookSize = () => W.speciesOpen().length * 4 + (W.complete() ? PET_SPECIES.length : 0);
  // Who walks in next: mostly the usual regulars, but a pet nobody has met yet about one visit in six.
  W.pickPet = () => {
    const open = W.speciesOpen(), variants = W.complete() ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
    const unmet = [];
    for (const s of open) for (const v of variants) if (!W.met.has(s + ':' + v)) unmet.push([s, v]);
    if (unmet.length && Math.random() < 0.17) return unmet[(Math.random() * unmet.length) | 0];
    const bag = [0, 0, 0, 1, 1, 1, 2, 2, 3];
    return [open[(Math.random() * open.length) | 0], bag[(Math.random() * bag.length) | 0]];
  };
  W.meet = (species, variant) => {
    const k = species + ':' + variant;
    if (W.met.has(k)) return false;
    W.met.add(k);
    W.events.push({ type: 'newpet', species, variant, profile: PET_PROFILES[species][variant] });
    return true;
  };

  // ---- build pads -------------------------------------------------------------------------------
  W.padsOpen = () => {
    const open = [];
    for (const p of PADS) {
      if (W.isBuilt(p.builds)) continue;
      if (!p.after.every(W.isBuilt)) continue;
      open.push(p);
      if (open.length >= 2) break;
    }
    return open;
  };
  W.build = id => {
    if (id.startsWith('staff:')) W.staff.add(id.slice(6));
    else { const st = stations.get(id); st.built = true; if (st.type === 'machine') st.level = MACHINE_CAP; }
    W.events.push({ type: 'built', id });
  };

  // ---- save / load ----------------------------------------------------------------------------
  W.snapshot = () => ({
    v: 2, coins: Math.floor(W.coins), served: W.served,
    built: [...stations.values()].filter(s => s.built && !STATIONS.find(d => d.id === s.id).built).map(s => s.id),
    staff: [...W.staff], paid: W.paid, met: [...W.met],
    machines: W.built('machine').map(m => [m.id, m.tray, m.level]),
    counters: W.built('counter').map(c => [c.id, c.stock]),
  });
  W.restore = s => {
    if (!s || s.v !== 2) return false;
    W.coins = Math.max(0, s.coins | 0); W.served = s.served | 0;
    for (const id of s.built || []) { const st = stations.get(id); if (st) st.built = true; }
    for (const r of s.staff || []) if (STAFF[r]) W.staff.add(r);
    W.paid = s.paid && typeof s.paid === 'object' ? s.paid : {};
    for (const k of s.met || []) if (typeof k === 'string') W.met.add(k);
    for (const [id, tray, level] of s.machines || s.ovens || []) { const m = stations.get(id); if (m && m.type === 'machine') { m.tray = Math.min(TRAY, tray | 0); m.level = Math.min(MACHINE_CAP, level | 0); } }
    for (const [id, stock] of s.counters || []) { const c = stations.get(id); if (c) c.stock = Math.min(c.cap, stock | 0); }
    return true;
  };
  return W;
}
