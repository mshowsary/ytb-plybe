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
    default: return null;
  }
}
const CHALK_Y = 1.05;
function rotateLocal(rot, right, forward) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return { x: right * c + forward * s, z: -right * s + forward * c };
}
const DEMAND_Y = { display: 2.1, oven: 2.3, coffee: 1.55, blender: 1.55, bowl: 0.85, bush: 1.55 };

function makeDemandEl(type) {
  const el = document.createElement('div'); el.className = 'demand hidden';
  // Task 31: tiny purely-visual state badge. It intentionally does not replace the stock count:
  // ● healthy, ○ empty, Ⅱ waiting/processing, × blocked, ! customer-actionable shortage.
  const state = document.createElement('span');
  state.className = 'dstate';
  state.style.cssText = 'position:absolute;right:5px;top:3px;font-size:9px;font-weight:1000;line-height:1;opacity:.72;pointer-events:none';
  const main = document.createElement('div'); main.className = 'dmain';
  el.append(state, main);
  let pips = null;
  if (type === 'coffee' || type === 'blender') {
    pips = document.createElement('div'); pips.className = 'dpips';
    const n = type === 'coffee' ? 10 : 9;
    const cls = type === 'coffee' ? 'dpip bean' : 'dpip fruit';
    for (let i = 0; i < n; i++) { const p = document.createElement('div'); p.className = cls; pips.appendChild(p); }
    el.appendChild(pips);
  } else if (type === 'bush') {
    pips = document.createElement('div'); pips.className = 'dpips';
    for (let i = 0; i < 3; i++) { const p = document.createElement('div'); p.className = 'dstage'; pips.appendChild(p); }
    el.appendChild(pips);
  }
  return { el, main, state, pips, lastText: null, lastState: null, lastPulse: null, lastVisible: null };
}

function stationHasWaiter(st, customers) {
  if (st.type === 'display') {
    for (const c of customers) if (!c.done && c.state === 'queue' && c.slot === 0 && c.mood === 'wait' && c.counterId === st.id) return true;
  } else if (st.type === 'bowl') {
    for (const c of customers) if (!c.done && c.state === 'atBowl' && c.mood === 'wait') return true;
  }
  return false;
}

// Task 31 pure truth model. Strong warning is reserved for a shortage that has a guest actively
// blocked by THIS station; merely reading zero is information, not an alarm. Machines with usable
// input but no output are 'paused' (working/recovering), while missing required input is 'blocked'.
export function demandVisualState(st, waiter = false) {
  if (!st || st.active === false) return 'hidden';
  let n = 0;
  if (st.type === 'display' || st.type === 'oven' || st.type === 'coffee' || st.type === 'blender' || st.type === 'bowl') n = Math.max(0, st.stock | 0);
  else if (st.type === 'bush') n = Math.max(0, st.stage | 0);
  if (waiter && n === 0) return 'actionable';
  if (n > 0) return 'healthy';
  if (st.type === 'coffee') return (st.beans | 0) > 0 ? 'paused' : 'blocked';
  if (st.type === 'blender') return (st.fruit | 0) > 0 ? 'paused' : 'blocked';
  if (st.type === 'bowl') return 'blocked';
  if (st.type === 'bush') return (st.stage | 0) < 3 ? 'paused' : 'healthy';
  if (st.type === 'oven' && Number(st.timer) > 0) return 'paused';
  return 'empty';
}

function applyDemandState(dv, state) {
  if (dv.lastState === state) return;
  dv.lastState = state;
  const spec = {
    healthy: { glyph: '●', title: 'Stock healthy', bg: 'var(--cream)', fg: 'var(--ink)', border: '1px solid transparent', opacity: '1' },
    empty: { glyph: '○', title: 'Empty', bg: '#fffdf9', fg: 'var(--ink)', border: '1px dashed #d7aaa3', opacity: '.9' },
    paused: { glyph: 'Ⅱ', title: 'Recovering', bg: '#f3eee8', fg: '#625650', border: '1px solid #d9cec5', opacity: '.86' },
    blocked: { glyph: '×', title: 'Needs input', bg: '#e9e2dc', fg: '#554b46', border: '1px solid #b9aaa0', opacity: '.9' },
    actionable: { glyph: '!', title: 'Guest waiting', bg: 'var(--coral)', fg: '#fff', border: '1px solid transparent', opacity: '1' },
  }[state] || { glyph: '', title: '', bg: 'var(--cream)', fg: 'var(--ink)', border: '1px solid transparent', opacity: '1' };
  dv.state.textContent = spec.glyph;
  dv.state.title = spec.title;
  dv.el.dataset.stockState = state;
  dv.el.style.background = spec.bg;
  dv.el.style.color = spec.fg;
  dv.el.style.border = spec.border;
  dv.el.style.opacity = spec.opacity;
  // M3's old `.zero` class painted every zero coral. Task 31 deliberately retires that alarm.
  dv.el.classList.remove('zero');
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
    if (st.type === 'display') { for (let i = 0; i < DISPLAY_POOL; i++) { const m = itemFor(st.product); m.position.copy(g.slots[i]); m.visible = false; g.add(m); v.items.push(m); } g.setProduct(st.product); }
    if (st.type === 'oven') for (let i = 0; i < 6; i++) { const m = itemFor(st.product); m.position.copy(g.outSlot); m.position.y += i * 0.17; m.visible = false; g.add(m); v.items.push(m); }
    if (st.type === 'checkout') { v.pile = cashPile(); v.pile.position.set(st.cash.x, 0, st.cash.z); scene.add(v.pile); }
    if (st.type === 'seat') { const d = dirtyMesh(); d.position.set(0.15, 0.77, -0.1); d.visible = false; g.add(d); v.dirtyProp = d; }
    if (DEMAND_Y[st.type] != null) { v.demand = makeDemandEl(st.type); els.fx.appendChild(v.demand.el); }
    const chalk = chalkInfo(st);
    if (chalk) {
      const board = chalkboardMesh();
      const halfW = (st.fw || 1.2) / 2, halfD = (st.fd || 1.2) / 2;
      const lx = -(halfW + 0.15), lz = halfD - 0.08;
      board.position.set(lx, 0, lz);
      g.add(board);
      const off = rotateLocal(st.rot, lx, lz);
      const el = document.createElement('div'); el.className = 'chalk hidden';
      const icon = document.createElement('span'); icon.className = 'chalkIcon'; icon.innerHTML = chalk.icon;
      const label = document.createElement('span'); label.className = 'chalkLabel'; label.textContent = chalk.label;
      el.append(icon, label);
      if (STAR_IDS.includes(st.id)) {
        el.classList.add('tappable');
        el.addEventListener('click', () => ctx.openKioskFocused && ctx.openKioskFocused(st.id));
      }
      els.fx.appendChild(el);
      v.chalk = { el, wx: st.x + off.x, wz: st.z + off.z, lastVisible: false };
    }
    vis.set(st.id, v);
  }
  const cleanRing = zoneRing(); cleanRing.scale.setScalar(0.6); cleanRing.visible = false; scene.add(cleanRing);

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
        if (st.type === 'coffee' && st.active && st.beans > 0 && st.stock < st.buffer) {
          v._steamT = (v._steamT || 0) + dt;
          if (v._steamT > 0.5) { v._steamT = 0; fx.burst(st.x, 1.0, st.z, '#FFFFFF', 2); }
        }
        // Task 31: stock truth is glanceable without turning every zero into an emergency.
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
            const waiter = stationHasWaiter(st, G.customers);
            const state = demandVisualState(st, waiter);
            const pulse = state === 'actionable';
            if (dv.lastText !== text) { dv.main.textContent = text; dv.lastText = text; }
            applyDemandState(dv, state);
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
