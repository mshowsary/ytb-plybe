// src/game/world.js — the café's state and its rules. No three.js, no DOM.
import {
  STATIONS, PADS, PRODUCTS, OVEN_TRAY, OVEN_FLOUR, SACK_FLOUR, COUNTER_CAP, TABLE_TIP, spotsFor,
} from './layout.js';

export function createWorld() {
  const stations = new Map();
  for (const def of STATIONS) {
    const st = { ...def, built: !!def.built, spots: spotsFor(def) };
    if (st.type === 'oven') Object.assign(st, { tray: 0, flour: OVEN_FLOUR, t: 0 });
    if (st.type === 'counter') Object.assign(st, { stock: 0, reserved: 0, cap: COUNTER_CAP, guests: [null, null] });
    if (st.type === 'table') Object.assign(st, { dirty: false, tip: 0, guest: null, claimed: null });
    stations.set(st.id, st);
  }
  const W = {
    stations,
    coins: 0,
    staff: new Set(),            // 'runner', 'cashier', 'cleaner'
    paid: {},                    // pad id -> coins already paid in
    served: 0,
    events: [],                  // { type, ... } for the presentation layer, cleared every frame
    ownerHold: { kind: null, n: 0 },
  };

  W.list = type => [...stations.values()].filter(s => s.type === type);
  W.built = type => [...stations.values()].filter(s => s.built && (!type || s.type === type));
  W.isBuilt = id => id.startsWith('staff:') ? W.staff.has(id.slice(6)) : !!stations.get(id)?.built;
  W.ovenFor = product => [...stations.values()].find(s => s.type === 'oven' && s.product === product);
  W.counterFor = product => [...stations.values()].find(s => s.type === 'counter' && s.product === product);

  // ---- rule 3: nobody overfills a counter -------------------------------------------------
  // Slots already spoken for: what Runners are carrying toward it, plus what the owner holds of it.
  W.freeFor = product => {
    const c = W.counterFor(product);
    if (!c || !c.built) return 0;
    const ownerHolds = W.ownerHold.kind === product ? W.ownerHold.n : 0;
    return Math.max(0, c.cap - c.stock - c.reserved - ownerHolds);
  };
  // How many flour sacks the café could use right now (every oven's empty room, in whole sacks).
  W.flourWanted = () => {
    let n = 0;
    for (const o of W.built('oven')) n += Math.floor((OVEN_FLOUR - o.flour) / SACK_FLOUR);
    return n;
  };

  // ---- machines -----------------------------------------------------------------------------
  W.step = dt => {
    for (const o of W.built('oven')) {
      o.baking = o.flour > 0 && o.tray < OVEN_TRAY;
      if (!o.baking) { o.t = 0; continue; }
      o.t += dt;
      if (o.t >= PRODUCTS[o.product].bake) { o.t = 0; o.tray++; o.flour--; W.events.push({ type: 'baked', id: o.id }); }
    }
  };

  // ---- transfers (one item at a time; callers pace them) --------------------------------------
  W.takeFromOven = oven => { if (oven.tray <= 0) return false; oven.tray--; return true; };
  W.returnToOven = oven => { if (oven.tray >= OVEN_TRAY) return false; oven.tray++; return true; };
  W.loadFlour = oven => { if (oven.flour > OVEN_FLOUR - SACK_FLOUR) return false; oven.flour += SACK_FLOUR; return true; };
  W.placeOnCounter = counter => { if (counter.stock >= counter.cap) return false; counter.stock++; return true; };
  W.takeFromCounter = counter => { if (counter.stock <= 0) return false; counter.stock--; return true; };

  W.dirtyTable = table => {
    table.dirty = true; table.guest = null;
    table.tip += TABLE_TIP[0] + Math.floor(Math.random() * (TABLE_TIP[1] - TABLE_TIP[0] + 1));
  };
  W.cleanTable = table => {
    const tip = table.tip; table.dirty = false; table.tip = 0; table.claimed = null;
    W.events.push({ type: 'cleaned', id: table.id, tip });
    return tip;
  };
  W.earn = (n, x, z) => { W.coins += n; W.events.push({ type: 'earn', n, x, z }); };

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
    else { const st = stations.get(id); st.built = true; if (st.type === 'oven') st.flour = OVEN_FLOUR; }
    W.events.push({ type: 'built', id });
  };

  // ---- save / load ----------------------------------------------------------------------------
  W.snapshot = () => ({
    v: 2, coins: Math.floor(W.coins), served: W.served,
    built: [...stations.values()].filter(s => s.built && !STATIONS.find(d => d.id === s.id).built).map(s => s.id),
    staff: [...W.staff], paid: W.paid,
    ovens: W.built('oven').map(o => [o.id, o.tray, o.flour]),
    counters: W.built('counter').map(c => [c.id, c.stock]),
  });
  W.restore = s => {
    if (!s || s.v !== 2) return false;
    W.coins = Math.max(0, s.coins | 0); W.served = s.served | 0;
    for (const id of s.built || []) { const st = stations.get(id); if (st) st.built = true; }
    for (const r of s.staff || []) if (['runner', 'cashier', 'cleaner'].includes(r)) W.staff.add(r);
    W.paid = s.paid && typeof s.paid === 'object' ? s.paid : {};
    for (const [id, tray, flour] of s.ovens || []) { const o = stations.get(id); if (o) { o.tray = Math.min(OVEN_TRAY, tray | 0); o.flour = Math.min(OVEN_FLOUR, flour | 0); } }
    for (const [id, stock] of s.counters || []) { const c = stations.get(id); if (c) c.stock = Math.min(c.cap, stock | 0); }
    return true;
  };
  return W;
}
