// src/game/world.js — the cafés' state and their rules. No three.js, no DOM.
//
// Two kinds of state. Per café (reset by `enter()` when you travel): which stations stand, what is on
// every tray and counter, who is hired, what the pads have been paid. Carried everywhere: coins,
// upgrades, the Pet Book and friendships, which cafés are open.
import {
  PRODUCTS, TRAY, MACHINE_CAP, SACK, COUNTER_CAP, TABLE_TIP, spotsFor, STAFF, UPGRADES, upgradeCost,
  LOCATIONS, LOCATION_ORDER, setLocation,
} from './layout.js';
import * as L from './layout.js';
import { PET_SPECIES, PET_PROFILES } from '../sim/petBook.js';

export function createWorld() {
  const W = {
    stations: new Map(),
    loc: 'town',
    coins: 0,
    staff: new Set(),            // 'runner', 'runner2', 'cashier', 'cleaner' (this café)
    paid: {},                    // pad id -> coins already paid in (this café)
    served: 0,
    met: new Set(),              // pet book: 'species:variant'
    friends: {},                 // 'species:variant' -> times petted
    up: {},                      // upgrade id -> level
    open: new Set(['town']),     // cafés the player owns
    done: new Set(),             // cafés completed
    saved: {},                   // loc id -> that café's saved state while you are elsewhere
    events: [],
    ownerHold: { kind: null, n: 0 },
    priceMult: 1,
    requests: {},
    tips: new Set(),             // one-time tips already shown
    ratings: {},                 // loc id -> { stars, count, reviews } once a café is finished                // product -> open table requests (only the owner fills them)
  };

  // ---- entering a café: rebuild its stations from the live layout, then its saved state -------
  W.enter = id => {
    setLocation(id); W.loc = L.LOC.id;
    W.stations.clear(); W.staff.clear(); W.paid = {}; W.served = 0; W.priceMult = 1; W.requests = {};
    W.ownerHold.kind = null; W.ownerHold.n = 0;
    for (const def of L.STATIONS) {
      const st = { ...def, built: !!def.built, spots: spotsFor(def) };
      if (st.type === 'machine') Object.assign(st, { model: PRODUCTS[st.product].model, supply: PRODUCTS[st.product].supply, tray: 0, level: MACHINE_CAP, t: 0 });
      if (st.type === 'counter') Object.assign(st, { stock: 0, reserved: 0, cap: W.counterCap(), guests: [null, null] });
      if (st.type === 'table') Object.assign(st, { dirty: false, tip: 0, guest: null, claimed: null });
      W.stations.set(st.id, st);
    }
    const s = W.saved[W.loc];
    if (s) {
      W.served = s.served | 0;
      for (const sid of s.built || []) { const st = W.stations.get(sid); if (st) st.built = true; }
      for (const r of s.staff || []) if (STAFF[r]) W.staff.add(r);
      W.paid = s.paid && typeof s.paid === 'object' ? { ...s.paid } : {};
      for (const [sid, tray, level] of s.machines || []) { const m = W.stations.get(sid); if (m && m.type === 'machine') { m.tray = Math.min(TRAY, tray | 0); m.level = Math.min(MACHINE_CAP, level | 0); } }
      for (const [sid, stock] of s.counters || []) { const c = W.stations.get(sid); if (c) c.stock = Math.min(c.cap, stock | 0); }
    } else {
      // a café that is already working at the first second: goods on the tray and the shelf
      W.stations.get('oven1').tray = 4; W.stations.get('counter1').stock = 3;
    }
  };
  W.stashHere = () => {
    W.saved[W.loc] = {
      served: W.served,
      built: [...W.stations.values()].filter(s => s.built && !L.STATIONS.find(d => d.id === s.id).built).map(s => s.id),
      staff: [...W.staff], paid: { ...W.paid },
      machines: W.built('machine').map(m => [m.id, m.tray, m.level]),
      counters: W.built('counter').map(c => [c.id, c.stock]),
    };
  };

  // ---- upgrades (carried to every café) -------------------------------------------------------
  W.lvl = id => W.up[id] | 0;
  W.speedMult = () => 1 + 0.1 * W.lvl('speed');
  W.carryBonus = () => W.lvl('carry');
  W.makeMult = () => Math.pow(0.9, W.lvl('machines'));
  W.counterCap = () => COUNTER_CAP + 2 * W.lvl('counters');
  W.price = product => Math.round(PRODUCTS[product].price * (1 + 0.1 * W.lvl('prices')) * (W.priceMult || 1));
  W.buyUpgrade = id => {
    const u = UPGRADES.find(x => x.id === id), l = W.lvl(id);
    if (!u || l >= u.max) return false;
    const cost = upgradeCost(u, l);
    if (W.coins < cost) return false;
    W.coins -= cost; W.up[id] = l + 1;
    if (id === 'counters') for (const c of W.built('counter')) c.cap = W.counterCap();
    W.events.push({ type: 'upgrade', id, level: l + 1 });
    return true;
  };
  W.canUpgrade = () => UPGRADES.some(u => W.lvl(u.id) < u.max && W.coins >= upgradeCost(u, W.lvl(u.id)));

  W.built = type => [...W.stations.values()].filter(s => s.built && (!type || s.type === type));
  W.isBuilt = id => id.startsWith('staff:') ? W.staff.has(id.slice(6)) : !!W.stations.get(id)?.built;
  W.machineFor = product => [...W.stations.values()].find(s => s.type === 'machine' && s.product === product);
  W.counterFor = product => [...W.stations.values()].find(s => s.type === 'counter' && s.product === product);

  // ---- rule 3: nobody overfills a counter -------------------------------------------------
  W.freeFor = product => {
    const c = W.counterFor(product);
    if (!c || !c.built) return 0;
    const ownerHolds = W.ownerHold.kind === product ? W.ownerHold.n : 0;
    return Math.max(0, c.cap - c.stock - c.reserved - ownerHolds);
  };
  W.sacksWanted = kind => {
    let n = 0;
    for (const m of W.built('machine')) if (m.supply === kind) n += Math.floor((MACHINE_CAP - m.level - (m.incoming || 0) * SACK) / SACK);
    return Math.max(0, n);
  };
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
      if (m.t >= PRODUCTS[m.product].make * W.makeMult()) { m.t = 0; m.tray++; m.level--; W.events.push({ type: 'made', id: m.id }); }
    }
  };

  W.takeFromMachine = m => { if (m.tray <= 0) return false; m.tray--; return true; };
  W.returnToMachine = m => { if (m.tray >= TRAY) return false; m.tray++; return true; };
  W.loadSack = m => { if (m.level > MACHINE_CAP - SACK) return false; m.level += SACK; return true; };
  W.placeOnCounter = c => { if (c.stock >= c.cap) return false; c.stock++; return true; };
  W.takeFromCounter = c => { if (c.stock <= 0) return false; c.stock--; return true; };

  W.dirtyTable = t => {
    t.dirty = true; t.guest = null;
    t.tip += Math.round((TABLE_TIP[0] + Math.floor(Math.random() * (TABLE_TIP[1] - TABLE_TIP[0] + 1)) + 2 * W.lvl('tips')) * L.LOC.priceScale);
  };
  W.cleanTable = t => {
    const tip = t.tip; t.dirty = false; t.tip = 0; t.claimed = null;
    W.events.push({ type: 'cleaned', id: t.id, tip });
    return tip;
  };
  W.earn = (n, x, z, bonus = false) => { W.coins += n; W.events.push({ type: 'earn', n, x, z, bonus }); };

  // ---- pets --------------------------------------------------------------------------------
  W.complete = () => L.PADS.every(p => W.isBuilt(p.builds));
  W.speciesOpen = () => PET_SPECIES.filter(s => !L.PET_UNLOCKS[s] || W.isBuilt(L.PET_UNLOCKS[s]));
  // the Pet Book counts every pet in every café you own (legendaries once any café is complete)
  W.bookSize = () => {
    let n = 0;
    for (const id of LOCATION_ORDER) if (W.open.has(id)) n += PET_SPECIES.length * LOCATIONS[id].variants.length;
    if (W.done.size || W.complete()) n += PET_SPECIES.length;
    return n;
  };
  // Who walks in next: mostly the usual regulars, but a pet nobody has met yet about one visit in six.
  W.pickPet = () => {
    const open = W.speciesOpen(), variants = [...L.LOC.variants, ...((W.done.size || W.complete()) ? [4] : [])];
    const unmet = [];
    for (const s of open) for (const v of variants) if (!W.met.has(s + ':' + v)) unmet.push([s, v]);
    if (unmet.length && Math.random() < 0.17) return unmet[(Math.random() * unmet.length) | 0];
    const bag = [0, 0, 0, 1, 1, 1, 2, 2, 3];
    return [open[(Math.random() * open.length) | 0], L.LOC.variants[bag[(Math.random() * bag.length) | 0]]];
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
    for (const p of L.PADS) {
      if (W.isBuilt(p.builds)) continue;
      if (!p.after.every(W.isBuilt)) continue;
      open.push(p);
      if (open.length >= 2) break;
    }
    return open;
  };
  W.build = id => {
    if (id.startsWith('staff:')) W.staff.add(id.slice(6));
    else { const st = W.stations.get(id); st.built = true; if (st.type === 'machine') st.level = MACHINE_CAP; if (st.type === 'counter') st.cap = W.counterCap(); }
    W.events.push({ type: 'built', id });
  };

  // ---- save / load ----------------------------------------------------------------------------
  W.snapshot = () => {
    W.stashHere();
    if (W.complete()) W.done.add(W.loc);
    return { v: 3, loc: W.loc, coins: Math.floor(W.coins), met: [...W.met], friends: W.friends, up: W.up,
      open: [...W.open], done: [...W.done], cafes: W.saved, tips: [...W.tips], ratings: W.ratings };
  };
  W.restore = s => {
    if (!s) return false;
    if (s.v === 2) {         // the first v2 saves held a single café: it becomes the town café
      s = { v: 3, loc: 'town', coins: s.coins, met: s.met, friends: s.friends, up: s.up, open: ['town'], done: [],
        cafes: { town: { served: s.served, built: s.built, staff: s.staff, paid: s.paid, machines: s.machines || s.ovens, counters: s.counters } } };
    }
    if (s.v !== 3) return false;
    W.coins = Math.max(0, s.coins | 0);
    for (const k of s.met || []) if (typeof k === 'string') W.met.add(k);
    if (s.friends && typeof s.friends === 'object') for (const k in s.friends) W.friends[k] = s.friends[k] | 0;
    for (const u of UPGRADES) { const l = s.up && s.up[u.id]; if (l) W.up[u.id] = Math.min(u.max, l | 0); }
    for (const id of s.open || []) if (LOCATIONS[id]) W.open.add(id);
    for (const id of s.done || []) if (LOCATIONS[id]) W.done.add(id);
    W.saved = s.cafes && typeof s.cafes === 'object' ? s.cafes : {};
    for (const k of s.tips || []) if (typeof k === 'string') W.tips.add(k);
    if (s.ratings && typeof s.ratings === 'object') W.ratings = s.ratings;
    W.loc = LOCATIONS[s.loc] && W.open.has(s.loc) ? s.loc : 'town';
    return true;
  };
  return W;
}
