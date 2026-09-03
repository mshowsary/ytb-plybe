// src/systems/visuals.js — builds a mesh per station, animates build pop-in, and keeps the
// counter item pool / oven trays / cash piles in sync with sim state. Also owns the M3 T5 demand
// counters (n/cap DOM labels over every counter/oven/coffee/blender/bowl/bush).
import { ovenMesh, counterMesh, checkoutMesh, tableMesh, hireDeskMesh, kioskMesh, bowlMesh, bushMesh, coffeeMesh, pantryMesh, crateMesh, blenderMesh, chalkboardMesh, itemFor, cashPile, dirtyMesh, zoneRing } from '../render/props.js';
import { C } from '../render/palette.js';
import { iconFor, treatIcon, coinIcon, sackIcon, returnIcon, leafIcon, gearIcon, personIcon } from '../ui/icons.js';
import { STAR_IDS } from '../sim/economy.js';

// Loop v2 Task 1: a display's item-mesh pool — capacity is a flat 8 for now (Task 3 adds star
// levels up to 16, per the design doc), sized with headroom so a future cap bump doesn't need a
// pool resize too.
const DISPLAY_POOL = 16;

const MESH_FOR = {
  oven: ovenMesh, display: counterMesh, checkout: checkoutMesh, seat: tableMesh, hire: hireDeskMesh, kiosk: kioskMesh,
  bowl: bowlMesh, bush: bushMesh, coffee: coffeeMesh, pantry: pantryMesh, return: crateMesh, blender: blenderMesh,
};
// Loop v2 Task 2: chalkboards (design section 4) — a name + product icon on every station except
// seats (a dirty table gets no chalkboard, per the task brief's name list). Icons come from
// src/ui/icons.js — the SAME product icon set the wish bubbles use for oven/display/coffee/blender,
// plus five new ones (bone/coin/sack/down-arrow/leaf/gear/person) added for this task.
const DISPLAY_CHALK_LABEL = { cookie: 'COOKIES', cupcake: 'CUPCAKES', coffee: 'COFFEE BAR', smoothie: 'SMOOTHIES' };
function chalkInfo(st) {
  switch (st.type) {
    case 'oven': return { label: st.product === 'cookie' ? 'OVEN · cookies' : 'OVEN · cupcakes', icon: iconFor(st.product) };
    case 'coffee': return { label: 'COFFEE · needs beans', icon: iconFor('coffee') };
    case 'blender': return { label: 'BLENDER · needs fruit', icon: iconFor('smoothie') };
    case 'pantry': return { label: 'PANTRY', icon: sackIcon() };
    case 'return': return { label: 'RETURN', icon: returnIcon() };
    case 'bush': return { label: 'GARDEN', icon: leafIcon() };
    case 'display': return { label: DISPLAY_CHALK_LABEL[st.product] || st.product.toUpperCase(), icon: iconFor(st.product) };
    case 'bowl': return { label: 'TREATS', icon: treatIcon() };
    case 'checkout': return { label: 'REGISTER', icon: coinIcon() };
    case 'kiosk': return { label: 'UPGRADES', icon: gearIcon() };
    case 'hire': return { label: 'STAFF', icon: personIcon() };
    default: return null; // seats get no chalkboard
  }
}
const CHALK_Y = 1.05; // well below every DEMAND_Y (1.55-2.3) so the two never overlap on screen
// Local (unrotated) rotate helper, same convention as data/area1.js's own private rotateOffset —
// duplicated here (that file doesn't export it) rather than threading a shared import through for
// one call site.
function rotateLocal(rot, right, forward) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return { x: right * c + forward * s, z: -right * s + forward * c };
}
// M3 T5: which station types get a demand counter, and the DOM height (world y) each hovers at.
const DEMAND_Y = { display: 2.1, oven: 2.3, coffee: 1.55, blender: 1.55, bowl: 0.85, bush: 1.55 };
function makeDemandEl(type) {
  const el = document.createElement('div'); el.className = 'demand hidden';
  const main = document.createElement('div'); main.className = 'dmain';
  el.appendChild(main);
  let pips = null;
  if (type === 'coffee' || type === 'blender') {
    pips = document.createElement('div'); pips.className = 'dpips';
    const n = type === 'coffee' ? 10 : 9; // 10 pips = beans/20 (2 each); 9 pips = fruit/9 (1 each)
    const cls = type === 'coffee' ? 'dpip bean' : 'dpip fruit';
    for (let i = 0; i < n; i++) { const p = document.createElement('div'); p.className = cls; pips.appendChild(p); }
    el.appendChild(pips);
  } else if (type === 'bush') {
    pips = document.createElement('div'); pips.className = 'dpips';
    for (let i = 0; i < 3; i++) { const p = document.createElement('div'); p.className = 'dstage'; pips.appendChild(p); }
    el.appendChild(pips);
  }
  return { el, main, pips, lastText: null, lastZero: null, lastPulse: null, lastVisible: null };
}
// True while a customer is genuinely waiting ON this specific station (a queued customer at slot
// 0 whose display lacks its wish, or someone at an empty bowl) — the only two demand-counter kinds
// the task brief calls out for the pulsing-coral treatment.
function stationHasWaiter(st, customers) {
  if (st.type === 'display') {
    for (const c of customers) if (!c.done && c.state === 'queue' && c.slot === 0 && c.mood === 'wait' && c.counterId === st.id) return true;
  } else if (st.type === 'bowl') {
    for (const c of customers) if (!c.done && c.state === 'atBowl' && c.mood === 'wait') return true;
  }
  return false;
}

export function createVisuals(G, S, ctx) {
  const { area, world, scene, vis, fx, els } = ctx;
  const demandTmp = { sx: 0, sy: 0, visible: true };
  for (const st of world.stations.values()) {
    const build = MESH_FOR[st.type] || tableMesh;
    const g = build();
    g.position.set(st.x, 0, st.z); g.rotation.y = st.rot; g.visible = st.active;
    scene.add(g);
    const v = { g, pop: st.active ? 1 : 0, items: [] };
    // Loop v2 Task 1: a display holds exactly one product (st.product, fixed) — its item pool is
    // all the same geometry, built once, unlike the old shared counter's per-slot mixed items.
    if (st.type === 'display') { for (let i = 0; i < DISPLAY_POOL; i++) { const m = itemFor(st.product); m.position.copy(g.slots[i]); m.visible = false; g.add(m); v.items.push(m); } g.setProduct(st.product); }
    if (st.type === 'oven') for (let i = 0; i < 6; i++) { const m = itemFor(st.product); m.position.copy(g.outSlot); m.position.y += i * 0.17; m.visible = false; g.add(m); v.items.push(m); }
    if (st.type === 'checkout') { v.pile = cashPile(); v.pile.position.set(st.cash.x, 0, st.cash.z); scene.add(v.pile); }
    // Task 4: dirty seat prop (plate + crumbs) sits on the tabletop, toggled by st.dirty below.
    if (st.type === 'seat') { const d = dirtyMesh(); d.position.set(0.15, 0.77, -0.1); d.visible = false; g.add(d); v.dirtyProp = d; }
    // M3 T5: a demand counter for every display/oven/coffee/blender/bowl/bush.
    if (DEMAND_Y[st.type] != null) { v.demand = makeDemandEl(st.type); els.fx.appendChild(v.demand.el); }
    // Loop v2 Task 2: the chalkboard — a local (front-left corner) child of this station's own
    // render group `g`, so it inherits g's build pop-in/rotation/visible-when-active for free.
    // World x/z for the DOM label's fx.project call is precomputed once here (stations never move).
    const chalk = chalkInfo(st);
    if (chalk) {
      const board = chalkboardMesh();
      const halfW = (st.fw || 1.2) / 2, halfD = (st.fd || 1.2) / 2;
      const lx = -(halfW + 0.15), lz = halfD - 0.08; // front-left corner of the footprint
      board.position.set(lx, 0, lz);
      g.add(board);
      const off = rotateLocal(st.rot, lx, lz);
      const el = document.createElement('div'); el.className = 'chalk hidden';
      const icon = document.createElement('span'); icon.className = 'chalkIcon'; icon.innerHTML = chalk.icon;
      const label = document.createElement('span'); label.className = 'chalkLabel'; label.textContent = chalk.label; // text set once
      el.append(icon, label);
      // Loop v2 Task 3: a star-eligible station's chalkboard (ovens/coffee/blender/displays — the
      // same set economy.js's STAR_IDS lists) opens the kiosk straight on its own Machines row.
      // ctx.openKioskFocused is wired by systems/stations.js, which runs before this system.
      if (STAR_IDS.includes(st.id)) {
        el.classList.add('tappable');
        el.addEventListener('click', () => ctx.openKioskFocused && ctx.openKioskFocused(st.id));
      }
      els.fx.appendChild(el);
      v.chalk = { el, wx: st.x + off.x, wz: st.z + off.z, lastVisible: false };
    }
    vis.set(st.id, v);
  }
  // Task 4: the owner's dirty-seat cleaning progress ring — one shared instance (only the owner
  // drives cleanProg; a hired cleaner has no player-facing progress to show), reusing zoneRing()
  // per the task brief, scaled down to 0.6 and hidden whenever nobody's mid-clean.
  const cleanRing = zoneRing(); cleanRing.scale.setScalar(0.6); cleanRing.visible = false; scene.add(cleanRing);

  // C2: called from G.restore, after the world's active set is rebuilt from a save, to bring every
  // station render group (visible/pop/scale) back in sync in one pass instead of waiting on the
  // 'built' event (which only fires for zones paid off live, never for a restored save).
  function syncAll() {
    for (const st of world.stations.values()) {
      const v = vis.get(st.id); if (!v) continue;
      v.g.visible = st.active; v.pop = 1; v.g.scale.setScalar(1);
    }
  }

  return {
    syncAll,
    update(dt) {
      for (const e of world.events) {
        if (e.type === 'built') {
          const z = area.zones.find(z => z.id === e.zoneId); if (!z) continue;
          for (const id of z.adds) { const v = vis.get(id); if (v) { v.g.visible = true; v.pop = 0; } }
        } else if (e.type === 'cleaned') {
          // Task 4: sparkle burst on a table going clean, wherever it was cleaned from (owner or cleaner).
          const st = world.stations.get(e.seatId); if (st) fx.burst(st.x, 0.85, st.z, C.cream, 10);
        }
      }
      for (const v of vis.values()) if (v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt * 2); const t = v.pop, s = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
        v.g.scale.setScalar(Math.max(0.001, s));
      }
      for (const st of world.stations.values()) {
        const v = vis.get(st.id);
        if (st.type === 'display') {
          // I8: indexed for loop instead of a per-frame forEach closure allocation. Loop v2 Task
          // 1: every slot is already the fixed st.product's geometry (built once, above) — no
          // per-slot itemGeoFor swap needed any more, just how many of the pool are visible.
          for (let i = 0; i < v.items.length; i++) {
            const m = v.items[i]; const on = i < st.stock;
            if (on && !m.visible) m.scale.setScalar(0.01); m.visible = on;
            if (on && m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 8));
          }
        }
        if (st.type === 'oven') { for (let i = 0; i < v.items.length; i++) v.items[i].visible = i < Math.min(st.stock, 6); }
        if (st.type === 'checkout') v.pile.setCount(Math.ceil(st.pile / 5));
        if (st.type === 'bush') v.g.setStage(st.stage);
        if (st.type === 'seat' && v.dirtyProp) v.dirtyProp.visible = st.dirty;
        // Task 4: a light steam puff while the coffee machine is actively brewing.
        if (st.type === 'coffee' && st.active && st.beans > 0 && st.stock < st.buffer) {
          v._steamT = (v._steamT || 0) + dt;
          if (v._steamT > 0.5) { v._steamT = 0; fx.burst(st.x, 1.0, st.z, '#FFFFFF', 2); }
        }
        // M3 T5: demand counters — n/cap label, projected every frame, text/state touched only
        // on change. Coral when the primary number is 0; pulsing coral additionally while a
        // customer is genuinely waiting on this station (counters/bowl only — see stationHasWaiter).
        if (v.demand) {
          const dv = v.demand;
          if (!st.active) {
            if (dv.lastVisible !== false) { dv.el.classList.add('hidden'); dv.lastVisible = false; }
          } else {
            let n = 0, cap = 1, text = '0/0';
            if (st.type === 'display') { n = st.stock; cap = st.capacity; text = n + '/' + cap; }
            else if (st.type === 'oven') { n = st.stock; cap = st.buffer; text = n + '/' + cap; }
            else if (st.type === 'coffee') { n = st.stock; cap = st.buffer; text = n + '/' + cap; }
            else if (st.type === 'blender') { n = st.stock; cap = st.buffer; text = n + '/' + cap; }
            else if (st.type === 'bowl') { n = st.stock; cap = st.capacity; text = n + '/' + cap; }
            else if (st.type === 'bush') { n = st.stage; cap = 3; text = st.stage + '/3'; }
            const zero = n === 0;
            const pulse = stationHasWaiter(st, G.customers);
            if (dv.lastText !== text) { dv.main.textContent = text; dv.lastText = text; }
            if (dv.lastZero !== zero) { dv.el.classList.toggle('zero', zero); dv.lastZero = zero; }
            if (dv.lastPulse !== pulse) { dv.el.classList.toggle('pulse', pulse); dv.lastPulse = pulse; }
            if (dv.pips) {
              if (st.type === 'coffee') { const filled = Math.round(st.beans / 2); for (let i = 0; i < dv.pips.children.length; i++) dv.pips.children[i].classList.toggle('filled', i < filled); }
              else if (st.type === 'blender') { for (let i = 0; i < dv.pips.children.length; i++) dv.pips.children[i].classList.toggle('filled', i < st.fruit); }
              else if (st.type === 'bush') { for (let i = 0; i < dv.pips.children.length; i++) dv.pips.children[i].classList.toggle('filled', i < st.stage); }
            }
            fx.project(st.x, DEMAND_Y[st.type], st.z, demandTmp);
            dv.el.style.left = demandTmp.sx + 'px'; dv.el.style.top = demandTmp.sy + 'px';
            const visible = demandTmp.visible;
            if (dv.lastVisible !== visible) { dv.el.classList.toggle('hidden', !visible); dv.lastVisible = visible; }
          }
        }
        // Loop v2 Task 2: the chalkboard's DOM label — position updated every frame (the board
        // itself never moves, only the projected screen point does), hidden off-screen or while
        // its station is inactive, exactly like the demand counters above.
        if (v.chalk) {
          const ch = v.chalk;
          if (!st.active) {
            if (ch.lastVisible !== false) { ch.el.classList.add('hidden'); ch.lastVisible = false; }
          } else {
            fx.project(ch.wx, CHALK_Y, ch.wz, demandTmp);
            ch.el.style.left = demandTmp.sx + 'px'; ch.el.style.top = demandTmp.sy + 'px';
            if (ch.lastVisible !== demandTmp.visible) { ch.el.classList.toggle('hidden', !demandTmp.visible); ch.lastVisible = demandTmp.visible; }
          }
        }
      }
      // Task 4: drive the owner's dirty-seat cleaning progress ring off ctx.cleanProg
      // (systems/stations.js exposes it — only ever one entry mid-progress at a time, since only
      // the owner has this visible progress).
      const cleanProg = ctx.cleanProg;
      let cleaning = null;
      if (cleanProg) for (const [seatId, t] of cleanProg) { cleaning = { seatId, t }; break; }
      if (cleaning) {
        const st = world.stations.get(cleaning.seatId);
        if (st) { cleanRing.position.set(st.x, 0, st.z); cleanRing.visible = true; cleanRing.setProgress(cleaning.t / 1.0); }
      } else cleanRing.visible = false;
    },
  };
}
