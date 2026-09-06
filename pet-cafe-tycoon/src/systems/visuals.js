// src/systems/visuals.js — builds a mesh per station, keeps physical stock props in sync, owns the
// Task-31 glanceable stock truth, and runs Task-32's one-shot construction reveal.
import { ovenMesh, counterMesh, checkoutMesh, tableMesh, hireDeskMesh, kioskMesh, bowlMesh, bushMesh, coffeeMesh, pantryMesh, crateMesh, blenderMesh, chalkboardMesh, itemFor, cashPile, dirtyMesh, zoneRing } from '../render/props.js';
import { C } from '../render/palette.js';
import { buildRevealPhase, buildRevealScale } from '../render/buildReveal.js';
import { iconFor, treatIcon, coinIcon, sackIcon, returnIcon, leafIcon, gearIcon, personIcon, beanIcon } from '../ui/icons.js';
import { STAR_IDS } from '../sim/economy.js';

const DISPLAY_POOL = 16;
const DEMAND_DETAIL_RADIUS = 1.7;

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
  // Task 31 five-state truth: empty / producing / ready / full / blocked. Guest urgency is an
  // attention overlay, never a fabricated sixth inventory state.
  const state = document.createElement('span');
  state.className = 'dstate';
  state.style.cssText = 'display:flex;align-items:center;justify-content:center;min-width:13px;height:13px;font-size:11px;font-weight:1000;line-height:1;opacity:.82;pointer-events:none';
  const main = document.createElement('div'); main.className = 'dmain'; main.style.display = 'none';
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
  return { el, main, state, pips, lastText: null, lastState: null, lastAttention: null, lastDetail: null, lastPulse: null, lastVisible: null };
}

function stationHasWaiter(st, customers) {
  if (st.type === 'display') {
    for (const c of customers) if (!c.done && c.state === 'queue' && c.slot === 0 && c.mood === 'wait' && c.counterId === st.id) return true;
  } else if (st.type === 'bowl') {
    for (const c of customers) if (!c.done && c.state === 'atBowl' && c.mood === 'wait') return true;
  }
  return false;
}

function stockAmountAndCap(st) {
  if (!st) return { n: 0, cap: 1 };
  if (st.type === 'display' || st.type === 'bowl') return { n: Math.max(0, st.stock | 0), cap: Math.max(1, st.capacity | 0) };
  if (st.type === 'oven' || st.type === 'coffee' || st.type === 'blender') return { n: Math.max(0, st.stock | 0), cap: Math.max(1, st.buffer | 0) };
  if (st.type === 'bush') return { n: Math.max(0, st.stage | 0), cap: 3 };
  return { n: 0, cap: 1 };
}

// Exact Task-31 semantic model. Availability outranks production: if something can be taken now it
// reads ready/full, even if the machine is also continuing to produce behind it.
export function demandVisualState(st) {
  if (!st || st.active === false) return 'hidden';
  const { n, cap } = stockAmountAndCap(st);
  if (st.type === 'bush') return n >= 3 ? 'full' : 'producing';
  if (n >= cap) return 'full';
  if (n > 0) return 'ready';
  if (st.type === 'coffee') return (st.beans | 0) > 0 ? 'producing' : 'blocked';
  if (st.type === 'blender') return (st.fruit | 0) > 0 ? 'producing' : 'blocked';
  if (st.type === 'oven') return Number(st.timer) > 0 ? 'producing' : 'empty';
  return 'empty';
}

export function demandDetailVisible(st, player = null, waiter = false, state = demandVisualState(st)) {
  if (!st || st.active === false) return false;
  if (waiter || state === 'blocked') return true;
  if (!player || !st.front) return false;
  return (player.x - st.front.x) ** 2 + (player.z - st.front.z) ** 2 <= DEMAND_DETAIL_RADIUS ** 2;
}

function stateGlyph(state, st) {
  if (state === 'blocked' && st.type === 'coffee') {
    return beanIcon().replace('<svg ', '<svg width="12" height="12" ');
  }
  return {
    empty: '○', producing: '◌', ready: '●', full: '◆', blocked: '×',
  }[state] || '';
}

function applyDemandState(dv, state, st, attention) {
  const stateKey = `${state}:${attention ? 1 : 0}:${st.type}`;
  if (dv.lastState === stateKey) return;
  dv.lastState = stateKey;
  const spec = {
    empty: { title: 'Empty', bg: '#fffdf9', fg: 'var(--ink)', border: '1px dashed #d7aaa3', opacity: '.88' },
    producing: { title: 'Producing', bg: '#f3f0ff', fg: '#6256b9', border: '1px solid #d7d0ff', opacity: '.9' },
    ready: { title: 'Ready', bg: 'var(--cream)', fg: 'var(--ink)', border: '1px solid transparent', opacity: '1' },
    full: { title: 'Full', bg: '#eef8ef', fg: '#417b49', border: '1px solid #b9dfbf', opacity: '1' },
    blocked: { title: st.type === 'coffee' ? 'Needs beans' : st.type === 'blender' ? 'Needs fruit' : 'Blocked', bg: '#eee8e2', fg: '#554b46', border: '1px solid #b9aaa0', opacity: '.94' },
  }[state] || { title: '', bg: 'var(--cream)', fg: 'var(--ink)', border: '1px solid transparent', opacity: '1' };
  dv.state.innerHTML = stateGlyph(state, st);
  dv.state.title = spec.title;
  dv.el.dataset.stockState = state;
  dv.el.dataset.attention = attention ? 'guest' : '';
  dv.el.style.background = attention ? 'var(--coral)' : spec.bg;
  dv.el.style.color = attention ? '#fff' : spec.fg;
  dv.el.style.border = attention ? '1px solid transparent' : spec.border;
  dv.el.style.opacity = spec.opacity;
  dv.el.classList.remove('zero');
}

function reducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function createVisuals(G, S, ctx) {
  const { area, world, scene, vis, fx, els } = ctx;
  const demandTmp = { sx: 0, sy: 0, visible: true };
  for (const st of world.stations.values()) {
    const build = MESH_FOR[st.type] || tableMesh;
    const g = build();
    g.position.set(st.x, 0, st.z); g.rotation.y = st.rot; g.visible = st.active;
    scene.add(g);
    const v = { g, items: [], reveal: null };
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
      v.reveal = null; v.g.visible = st.active; v.g.scale.setScalar(1);
    }
  }

  return {
    syncAll,
    update(dt) {
      for (const e of world.events) {
        if (e.type === 'built') {
          const z = area.zones.find(z => z.id === e.zoneId); if (!z) continue;
          // One committed build creates exactly one reveal record per station. Restore/sync never
          // replays it, so a load cannot repeatedly celebrate an old purchase.
          for (const id of z.adds) {
            const v = vis.get(id); if (!v) continue;
            v.reveal = { t: 0, pulsed: false };
            v.g.visible = false; v.g.scale.setScalar(0.001);
          }
        } else if (e.type === 'cleaned') {
          const st = world.stations.get(e.seatId); if (st) fx.burst(st.x, 0.85, st.z, C.cream, 10);
        }
      }

      for (const st of world.stations.values()) {
        const v = vis.get(st.id); if (!v) continue;

        if (v.reveal) {
          v.reveal.t += Math.max(0, dt);
          const phase = buildRevealPhase(v.reveal.t);
          if (phase === 'anticipation') {
            v.g.visible = false;
          } else {
            v.g.visible = true;
            v.g.scale.setScalar(buildRevealScale(v.reveal.t, reducedMotion()));
          }
          if (phase === 'done') {
            v.g.scale.setScalar(1);
            if (!v.reveal.pulsed) {
              v.reveal.pulsed = true;
              // The pulse lands at the actual interaction/output side of the new station, teaching
              // where future work happens without text, collision changes, or camera control.
              const p = st.front || st;
              fx.burst(p.x, st.type === 'bowl' ? 0.45 : 0.75, p.z, C.accent, 10);
            }
            v.reveal = null;
          }
        }

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

        if (v.demand) {
          const dv = v.demand;
          if (!st.active) {
            if (dv.lastVisible !== false) { dv.el.classList.add('hidden'); dv.lastVisible = false; }
          } else {
            const { n, cap } = stockAmountAndCap(st);
            const text = `${n}/${cap}`;
            const waiter = stationHasWaiter(st, G.customers);
            const state = demandVisualState(st);
            const attention = waiter && n === 0;
            const showDetail = demandDetailVisible(st, G.P, waiter, state);
            if (dv.lastText !== text) { dv.main.textContent = text; dv.lastText = text; }
            if (dv.lastDetail !== showDetail) { dv.main.style.display = showDetail ? '' : 'none'; dv.lastDetail = showDetail; }
            applyDemandState(dv, state, st, attention);
            if (dv.lastPulse !== attention) { dv.el.classList.toggle('pulse', attention); dv.lastPulse = attention; }
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
