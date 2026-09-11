// src/systems/visuals.js — builds a mesh per station, keeps physical stock props in sync, owns the
// Task-31 glanceable stock truth, and runs Task-32's one-shot construction reveal.
import * as THREE from 'three';
import { ovenMesh, counterMesh, checkoutMesh, tableMesh, hireDeskMesh, kioskMesh, bowlMesh, bushMesh, coffeeMesh, pantryMesh, crateMesh, blenderMesh, chalkboardMesh, itemFor, cashPile, dirtyMesh, zoneRing, icecreamMesh, coldPantryMesh, groomTableMesh, bathTubMesh, waterTankMesh, boutiqueRackMesh, planterClusterMesh, spaLoungeMesh, photoBoothMesh, restroomMesh, fountainMesh, splashPoolMesh } from '../render/props.js';
import { C } from '../render/palette.js';
import { buildRevealPhase, buildRevealScale } from '../render/buildReveal.js';
import { iconFor, treatIcon, coinIcon, sackIcon, returnIcon, leafIcon, gearIcon, personIcon, beanIcon, creamIcon, broomIcon } from '../ui/icons.js';
import { STAR_IDS } from '../sim/economy.js';

const DISPLAY_POOL = 16;
const DEMAND_DETAIL_RADIUS = 1.7;

// Batch 1 terrace (plan 3.1/7.2): icecream/photo/restroom mirror the type-keyed lookup every other
// station uses. `decor` covers fountain1 (the only decor station this batch) and `splash` covers
// splash1, which occupies fountain1's exact spot once z_splash is built -- see the active-visibility
// sync in update() below for how the swap actually happens on screen. `gate` renders nothing: it is
// a non-blocking fence-gap marker (props.js's fence arch/gate-open animation is the actual visual),
// so an empty group keeps it out of the generic reveal/pulse machinery's way without a special case.
const MESH_FOR = {
  oven: ovenMesh, display: counterMesh, checkout: checkoutMesh, seat: tableMesh, hire: hireDeskMesh, kiosk: kioskMesh,
  bowl: bowlMesh, bush: bushMesh, coffee: coffeeMesh, pantry: pantryMesh, return: crateMesh, blender: blenderMesh,
  icecream: icecreamMesh, photo: photoBoothMesh, restroom: restroomMesh, decor: fountainMesh, splash: splashPoolMesh,
  gate: () => new THREE.Group(),
  // Batch 4b (plan §3.9). Without these three arms the new types fell through to tableMesh and the
  // grooming table, the tub and the shop rack all rendered as café tables.
  groom: groomTableMesh, bath: bathTubMesh, boutique: boutiqueRackMesh,
};
// coldPantry1 shares the generic 'pantry' type (so it keeps sheets.js/interactionCoach's pantry
// plumbing for free) but wants the icy-toned mesh props.js built specifically for it; every other
// pantry keeps the warm one. Keyed by station id, checked before the type map.
const MESH_ID_OVERRIDE = {
  coldPantry1: coldPantryMesh,
  // Spa pieces that reuse a generic TYPE (pantry / decor / seat) for their sim plumbing but want
  // their own look — the same arrangement coldPantry1 has had since Batch 1.
  waterTank1: waterTankMesh, planters: planterClusterMesh,
  spaSeat1: spaLoungeMesh, spaSeat2: spaLoungeMesh, spaSeat3: spaLoungeMesh,
};
// Program §5.5. Every chalkboard used to carry an English caption -- "OVEN · cupcakes",
// "COFFEE · needs beans", "PANTRY" -- and with one board per station that made words the most
// repeated thing in the 3D frame. The board now says the same two things without any: WHAT it is
// (the icon it already had) and WHETHER it has anything (a stock dot: green stocked, amber low,
// red empty). "Needs beans" is not a sentence any more, it is the bean glyph with a red dot; the
// interaction coach still points at whichever station actually wants the player.
// Batch 1 terrace: icecream1 mirrors coffee1 exactly (§3.1), so it gets the same dot semantics --
// empty when its supply (cream, not beans) runs out.
const CHALK_DOT_TYPES = new Set(['oven', 'display', 'bowl', 'coffee', 'blender', 'bush', 'icecream']);
const CHALK_LOW_FRACTION = 0.34;

// Split key/html so the per-frame update can compare a short string instead of re-serialising an
// SVG: only a family flip (oven/display) or the coffee/icecream machine running out of its input
// changes it.
function chalkIconKey(st) {
  switch (st.type) {
    case 'oven': case 'display': return st.product;
    case 'coffee': return (st.beans | 0) > 0 ? 'coffee' : 'beans';
    case 'icecream': return (st.cream | 0) > 0 ? 'icecream' : 'cream';
    case 'blender': return 'smoothie';
    case 'pantry': return 'sack';
    case 'return': return 'return';
    case 'bush': return 'leaf';
    case 'bowl': return 'treat';
    case 'checkout': return 'coin';
    case 'kiosk': return 'gear';
    case 'hire': return 'person';
    default: return null;
  }
}
function chalkIconHtml(key) {
  switch (key) {
    case 'beans': return beanIcon();
    case 'cream': return creamIcon();
    case 'sack': return sackIcon();
    case 'return': return returnIcon();
    case 'leaf': return leafIcon();
    case 'treat': return treatIcon();
    case 'coin': return coinIcon();
    case 'gear': return gearIcon();
    case 'person': return personIcon();
    default: return iconFor(key);
  }
}
// Three states, not five: the demand pill above the station already carries the full Task-31
// truth, so the board only has to answer "can I take something here right now?" at a glance. A
// machine with no input (no beans, no fruit) reads empty, which is exactly what it is.
export function chalkDotState(st) {
  if (!st || !CHALK_DOT_TYPES.has(st.type)) return null;
  if (st.type === 'coffee' && (st.beans | 0) <= 0) return 'empty';
  if (st.type === 'icecream' && (st.cream | 0) <= 0) return 'empty';
  if (st.type === 'blender' && (st.fruit | 0) <= 0) return 'empty';
  const { n, cap } = stockAmountAndCap(st);
  if (n <= 0) return 'empty';
  return n / cap <= CHALK_LOW_FRACTION ? 'low' : 'stocked';
}

// Program §6.2, Batch 7: the wait-for-a-wipe bubble a paid guest holds up while dirty tables block
// every seat. Batch 6's crossed-table icon is gone (it is now src/ui/icons.js's tableDirtyIcon,
// shared with the day summary's chip) -- Batch 7 draws the owner's own broom instead: the guest is
// not being told the table is dirty (it already knows -- that's why it's standing there), it is
// waiting for the thing that fixes it.
const NO_SEAT_POOL = 4;
const NO_SEAT_BUBBLE_Y = 1.3;

// Program §6.2 escalation on a seat nobody has wiped. Crumbs land the moment it goes dirty (the
// dirtyMesh below); flies join after DIRTY_FLIES_AT seconds and a stink wisp after DIRTY_STINK_AT,
// so a table left alone through a rush is visibly worse than one left alone for a moment. Both are
// built lazily -- a cafe that is kept clean never allocates them. Batch 7: pushed later (12->20,
// 25->40) now that DIRTY_EVERY=1 (src/sim/customers.js) means every finished meal leaves a full,
// readable "bussed table" prop (props.js's dirtyMesh) the instant it's dirtied -- the escalation is
// for a table that has genuinely been ignored, not for the ordinary look every seat now carries
// between uses.
const DIRTY_FLIES_AT = 20;
const DIRTY_STINK_AT = 40;
function fliesMesh() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.035, 6, 4);
  const mat = new THREE.MeshBasicMaterial({ color: '#2E2A26' });
  for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(geo, mat));
  return g;
}
function stinkMesh() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.09, 6, 5);
  for (let i = 0; i < 3; i++) {
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: '#A6BF6A', transparent: true, opacity: 0.3, depthWrite: false,
    })));
  }
  return g;
}
// Program §6.3. One wipe presentation, shared by the owner and the cleaner. WIPE_MIN_SECONDS is
// the floor on the ring sweep so the owner's instantaneous wipe still reads as a stroke instead of
// a one-frame flash; WIPE_TAIL_SECONDS is how long the full ring is held while the crumbs shrink
// away, and DIRTY_FADE_SECONDS is that shrink. The crumbs cannot cross-fade: render/palette.js's
// toonMaterial() is a shared singleton, so touching its opacity would fade every prop in the café.
const WIPE_MIN_SECONDS = 0.3;
const WIPE_TAIL_SECONDS = 0.25;
const DIRTY_FADE_SECONDS = 0.25;
const CLEAN_POP_SECONDS = 0.26;
const CLEAN_SPARKLE = '#BFEFFF';
// Resting height of the crumb prop on the table top — the fade above lifts it from here.
const DIRTY_PROP_Y = 0.77;
const CHALK_Y = 1.05;
function rotateLocal(rot, right, forward) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return { x: right * c + forward * s, z: -right * s + forward * c };
}
const DEMAND_Y = { display: 2.1, oven: 2.3, coffee: 1.55, blender: 1.55, bowl: 0.85, bush: 1.55, icecream: 1.55 };

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
  // icecream1's pips mirror coffee1's exactly (10, filled by cream/2) but style.css only tints
  // '.dpip.bean'/'.dpip.fruit' (a file another task owns this batch); rather than add a class there,
  // the cream tint below is set inline per-pip so this stays self-contained to visuals.js.
  if (type === 'coffee' || type === 'blender' || type === 'icecream') {
    pips = document.createElement('div'); pips.className = 'dpips';
    const n = type === 'coffee' ? 10 : type === 'icecream' ? 10 : 9;
    const cls = type === 'coffee' ? 'dpip bean' : type === 'icecream' ? 'dpip' : 'dpip fruit';
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
  if (st.type === 'oven' || st.type === 'coffee' || st.type === 'blender' || st.type === 'icecream') return { n: Math.max(0, st.stock | 0), cap: Math.max(1, st.buffer | 0) };
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
  if (st.type === 'icecream') return (st.cream | 0) > 0 ? 'producing' : 'blocked';
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
  if (state === 'blocked' && st.type === 'icecream') {
    return creamIcon().replace('<svg ', '<svg width="12" height="12" ');
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
    blocked: { title: st.type === 'coffee' ? 'Needs beans' : st.type === 'icecream' ? 'Needs cream' : st.type === 'blender' ? 'Needs fruit' : 'Blocked', bg: '#eee8e2', fg: '#554b46', border: '1px solid #b9aaa0', opacity: '.94' },
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
  const audio = ctx.audio;
  const demandTmp = { sx: 0, sy: 0, visible: true };
  // The wipe currently on screen: { seatId, by, t, tail, dur }. One at a time, exactly like the
  // ring it drives (there is a single cleanRing mesh) — with at most two cleaners on the floor the
  // odds of two simultaneous wipes are small, and the loser still gets its sparkle, pop and fade.
  let activeWipe = null;
  for (const st of world.stations.values()) {
    const build = MESH_ID_OVERRIDE[st.id] || MESH_FOR[st.type] || tableMesh;
    const g = build();
    g.position.set(st.x, 0, st.z); g.rotation.y = st.rot; g.visible = st.active;
    scene.add(g);
    const v = { g, items: [], reveal: null };
    if (st.type === 'display') { for (let i = 0; i < DISPLAY_POOL; i++) { const m = itemFor(st.product); m.position.copy(g.slots[i]); m.visible = false; g.add(m); v.items.push(m); } g.setProduct(st.product); }
    if (st.type === 'oven') for (let i = 0; i < 6; i++) { const m = itemFor(st.product); m.position.copy(g.outSlot); m.position.y += i * 0.17; m.visible = false; g.add(m); v.items.push(m); }
    if (st.type === 'checkout') { v.pile = cashPile(); v.pile.position.set(st.cash.x, 0, st.cash.z); scene.add(v.pile); }
    if (st.type === 'seat') { const d = dirtyMesh(); d.position.set(0.15, DIRTY_PROP_Y, -0.1); d.visible = false; g.add(d); v.dirtyProp = d; }
    if (DEMAND_Y[st.type] != null) { v.demand = makeDemandEl(st.type); els.fx.appendChild(v.demand.el); }
    const chalkKey = chalkIconKey(st);
    if (chalkKey) {
      const board = chalkboardMesh();
      const halfW = (st.fw || 1.2) / 2, halfD = (st.fd || 1.2) / 2;
      const lx = -(halfW + 0.15), lz = halfD - 0.08;
      board.position.set(lx, 0, lz);
      g.add(board);
      const off = rotateLocal(st.rot, lx, lz);
      const el = document.createElement('div'); el.className = 'chalk hidden';
      const icon = document.createElement('span'); icon.className = 'chalkIcon'; icon.innerHTML = chalkIconHtml(chalkKey);
      el.appendChild(icon);
      let dot = null;
      if (CHALK_DOT_TYPES.has(st.type)) { dot = document.createElement('span'); dot.className = 'chalkDot'; el.appendChild(dot); }
      if (STAR_IDS.includes(st.id)) {
        el.classList.add('tappable');
        el.addEventListener('click', () => ctx.openKioskFocused && ctx.openKioskFocused(st.id));
      }
      els.fx.appendChild(el);
      v.chalk = { el, icon, dot, key: chalkKey, dotState: null, wx: st.x + off.x, wz: st.z + off.z, lastVisible: false };
    }
    vis.set(st.id, v);
  }
  const cleanRing = zoneRing(); cleanRing.scale.setScalar(0.6); cleanRing.visible = false; scene.add(cleanRing);

  // Program §6.2. A small fixed pool of broom bubbles, kept at its historical size (Batch 7 didn't
  // grow it even though guests in 'waitSeat' now hold for up to WAIT_SEAT_GRACE (12 s) rather than
  // the old 1.2 s 'noSeat' hold -- the owner's "icon soup" batch spent real effort capping how many
  // floating chips can be on screen at once, and a bigger pool would undo exactly that; any waiter
  // beyond the first NO_SEAT_POOL simply goes unbubbled). They carry the .wish class deliberately:
  // that is the class src/ui/labelLayout.js already anchors and arbitrates for guest bubbles, so
  // these are decluttered by the same pass and cannot be the thing that breaks the 0-violation audit.
  const noSeatPool = [];
  function noSeatSlot() {
    const el = document.createElement('div'); el.className = 'wish noseat hidden';
    const icon = document.createElement('span'); icon.className = 'wishIcon'; icon.innerHTML = broomIcon();
    el.appendChild(icon); els.fx.appendChild(el);
    return { el, visible: false };
  }

  function syncAll() {
    for (const st of world.stations.values()) {
      const v = vis.get(st.id); if (!v) continue;
      v.reveal = null; v.g.visible = st.active; v.g.scale.setScalar(1);
      // Program §6.3: a restore or a day flip is not a wipe. Drop any pop or crumb fade in flight
      // so a loaded save never plays half of someone else's cleaning animation.
      v.popT = null; v.dirtyFade = null;
      if (v.dirtyProp) { v.dirtyProp.scale.setScalar(1); v.dirtyProp.position.y = DIRTY_PROP_Y; v.dirtyProp.visible = !!st.dirty; }
    }
    activeWipe = null;
  }

  return {
    syncAll,
    update(dt) {
      const still = reducedMotion() || !!(G.settings && G.settings.reducedMotion);
      // Program §6.2's seat-miss loss is applied by the sim-facing event loop in src/game.js, which
      // runs after this layer in the same frame. Read the rank ahead of that mutation and count it
      // down locally, so two misses in one frame never draw a numeral the floored-at-0 reputation
      // will not actually pay.
      let repHeadroom = Math.max(0, (G.meta ? G.meta.reputation : 0) | 0);
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
        } else if (e.type === 'cleaning') {
          // Program §6.3: whoever is wiping — owner or cleaner — gets the same ring, filled over
          // the duration the simulation actually committed to.
          activeWipe = {
            seatId: e.seatId, by: e.by || null, t: 0, tail: 0,
            dur: Math.max(WIPE_MIN_SECONDS, Number(e.seconds) > 0 ? Number(e.seconds) : 0),
          };
        } else if (e.type === 'cleaned') {
          const st = world.stations.get(e.seatId);
          if (st) {
            // The finish is one rule for both actors now: sparkle over the table top, a short pop
            // of the table itself, the crumb fade below, and the chime the owner's wipe used to
            // play from systems/stations.js.
            fx.burst(st.x, 0.85, st.z, CLEAN_SPARKLE, 8);
            const v = vis.get(e.seatId);
            if (v && !still) v.popT = 0;
            if (audio && typeof audio.play === 'function') audio.play('clean');
          }
        } else if (e.type === 'seatMissed') {
          // Program §6.2: the guest paid and never got a clean table. This layer adds nothing but
          // the single floating numeral that tells the owner it just happened -- the stat and the
          // reputation point belong to src/game.js, applied and checkpointed exactly once per
          // event. The numeral is drawn only when the rank will actually move (reputation is
          // floored at 0, so a fresh save shows no phantom loss).
          const c = G.customers && G.customers.find(cc => cc.id === e.id);
          if (c && repHeadroom > 0) { repHeadroom--; fx.number(c.x, 1.75, c.z, '−1★', 'lost'); }
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

        // Batch 1 terrace (D2): fountain1 goes inactive the instant z_splash completes (world.js's
        // payZone), with no 'built' event of its own to hide it -- z_splash's event is for splash1,
        // the new station occupying the same spot. Every other station's active flag has only ever
        // gone true (via the reveal above), so this sync was previously a no-op everywhere; now it
        // is what actually swaps the fountain mesh out for the splash pool on screen. Skipped while
        // a reveal is in flight, since that already owns visibility/scale for its own duration.
        if (!v.reveal && v.g.visible !== !!st.active) v.g.visible = !!st.active;

        // Program §6.3: the table acknowledges the wipe with a short squash-and-stretch pop (the
        // group-level twin of render/human.js's H.pop), started by the 'cleaned' event above. The
        // build reveal owns this group's scale while it runs, so the pop always yields to it.
        if (v.popT != null) {
          if (v.reveal) v.popT = null;
          else {
            v.popT += Math.max(0, dt);
            const k = v.popT / CLEAN_POP_SECONDS;
            if (k >= 1) { v.popT = null; v.g.scale.setScalar(1); }
            else { const b = Math.sin(k * Math.PI) * 0.09; v.g.scale.set(1 - b * 0.5, 1 + b, 1 - b * 0.5); }
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
        if (st.type === 'seat' && v.dirtyProp) {
          // Program §6.3: the crumbs used to be switched off between two frames, which is what
          // made a staff-cleaned table look like a bug rather than an event. They now shrink and
          // lift away over DIRTY_FADE_SECONDS under the sparkle. Scale, not opacity — see the note
          // beside DIRTY_FADE_SECONDS about the shared toon material.
          if (st.dirty) {
            v.dirtyProp.visible = true; v.dirtyProp.scale.setScalar(1);
            v.dirtyProp.position.y = DIRTY_PROP_Y; v.dirtyFade = 0;
          } else if (v.dirtyFade != null && v.dirtyFade < DIRTY_FADE_SECONDS) {
            v.dirtyFade += Math.max(0, dt);
            const k = Math.min(1, v.dirtyFade / DIRTY_FADE_SECONDS);
            v.dirtyProp.visible = k < 1;
            v.dirtyProp.scale.setScalar(Math.max(0.001, 1 - k));
            v.dirtyProp.position.y = DIRTY_PROP_Y + (still ? 0 : k * 0.1);
          } else if (v.dirtyProp.visible) {
            v.dirtyProp.visible = false; v.dirtyProp.position.y = DIRTY_PROP_Y;
          }
          // One clock per seat, render-side only: it never feeds the sim, so it cannot affect the
          // deterministic replay tools/bot.js depends on.
          v.dirtyT = st.dirty ? (v.dirtyT || 0) + Math.max(0, dt) : 0;
          if (st.dirty && v.dirtyT >= DIRTY_FLIES_AT && !v.flies) { v.flies = fliesMesh(); v.g.add(v.flies); }
          if (st.dirty && v.dirtyT >= DIRTY_STINK_AT && !v.stink) { v.stink = stinkMesh(); v.g.add(v.stink); }
          if (v.flies) {
            const on = st.dirty && v.dirtyT >= DIRTY_FLIES_AT;
            v.flies.visible = on;
            // Reduced motion keeps the flies (the information) and drops the orbit (the motion).
            if (on) for (let i = 0; i < 3; i++) {
              const a = still ? i * 2.1 : v.dirtyT * (2.2 + i * 0.45) + i * 2.1;
              v.flies.children[i].position.set(
                0.15 + Math.cos(a) * (0.24 + i * 0.05),
                1.04 + (still ? 0 : Math.sin(a * 1.7 + i) * 0.07),
                -0.1 + Math.sin(a) * (0.22 + i * 0.05),
              );
            }
          }
          if (v.stink) {
            const on = st.dirty && v.dirtyT >= DIRTY_STINK_AT;
            v.stink.visible = on;
            if (on) for (let i = 0; i < v.stink.children.length; i++) {
              const p = still ? (i + 0.5) / v.stink.children.length : (v.dirtyT * 0.5 + i / v.stink.children.length) % 1;
              const m = v.stink.children[i];
              m.position.set(0.15 + Math.sin(p * 5 + i) * 0.06, 0.88 + p * 0.62, -0.1 + Math.cos(p * 4 + i) * 0.05);
              m.scale.setScalar(0.55 + p * 0.85);
              m.material.opacity = 0.3 * (1 - p);
            }
          }
        }
        if (st.type === 'coffee' && st.active && st.beans > 0 && st.stock < st.buffer) {
          v._steamT = (v._steamT || 0) + dt;
          if (v._steamT > 0.5) { v._steamT = 0; fx.burst(st.x, 1.0, st.z, '#FFFFFF', 2); }
        }
        // D2 — fountain particle ring: reuse fx.burst on a timer rather than a new particle system.
        // Stops as soon as st.active flips false (the z_splash swap above), so it never runs behind
        // the splash pool that replaces it.
        if (st.type === 'decor' && st.active) {
          v._fxT = (v._fxT || 0) + dt;
          if (v._fxT > 1.1) { v._fxT = 0; fx.burst(st.x, 1.0, st.z, '#A8DCEF', 6); }
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
              else if (st.type === 'icecream') {
                // No '.dpip.filled.cream' rule exists in style.css (owned elsewhere this batch), so
                // the fill is painted directly rather than via a class the stylesheet won't pick up.
                const filled = Math.round(st.cream / 2);
                for (let i = 0; i < dv.pips.children.length; i++) dv.pips.children[i].style.background = i < filled ? '#F5C9DA' : '';
              }
              else if (st.type === 'blender') { for (let i = 0; i < dv.pips.children.length; i++) dv.pips.children[i].classList.toggle('filled', i < st.fruit); }
              else if (st.type === 'bush') { for (let i = 0; i < dv.pips.children.length; i++) dv.pips.children[i].classList.toggle('filled', i < st.stage); }
            }
            fx.project(st.x, DEMAND_Y[st.type], st.z, demandTmp);
            dv.el.style.left = demandTmp.sx + 'px'; dv.el.style.top = demandTmp.sy + 'px';
            // The owner's "icon soup" report: a chip over EVERY active station, on screen or not,
            // piled little ◆/● glyphs at the frame edge once fx.project started respecting the
            // viewport. A ready/full/producing shelf already shows its truth as physical stock, so
            // the chip earns its pixels only when there's something to say a glance can't see:
            // the owner is close enough to read the count, a guest is waiting on empty stock, or
            // the state itself (empty/blocked) is the thing that needs fixing.
            const visible = demandTmp.visible && (showDetail || attention || state === 'empty' || state === 'blocked');
            if (dv.lastVisible !== visible) { dv.el.classList.toggle('hidden', !visible); dv.lastVisible = visible; }
          }
        }
        if (v.chalk) {
          const ch = v.chalk;
          if (!st.active) {
            if (ch.lastVisible !== false) { ch.el.classList.add('hidden'); ch.lastVisible = false; }
          } else {
            const key = chalkIconKey(st);
            if (key && key !== ch.key) { ch.key = key; ch.icon.innerHTML = chalkIconHtml(key); }
            if (ch.dot) {
              const dotState = chalkDotState(st);
              if (dotState !== ch.dotState) { ch.dotState = dotState; ch.dot.dataset.stock = dotState || 'empty'; }
            }
            fx.project(ch.wx, CHALK_Y, ch.wz, demandTmp);
            ch.el.style.left = demandTmp.sx + 'px'; ch.el.style.top = demandTmp.sy + 'px';
            // Same "icon soup" fix as the demand pill, for the menu-board chip: every kiosk/pantry/
            // etc. used to carry one all the time, which is exactly the far-edge glyph column the
            // owner flagged. A chalkboard is only worth reading from up close (5 m), including the
            // tappable stars -- the floating action button already handles the near-field tap.
            const near = !!G.P && (G.P.x - ch.wx) ** 2 + (G.P.z - ch.wz) ** 2 <= 25;
            const visible = demandTmp.visible && near;
            if (ch.lastVisible !== visible) { ch.el.classList.toggle('hidden', !visible); ch.lastVisible = visible; }
          }
        }
      }
      // Program §6.2, Batch 7: one broom bubble per guest currently waiting for a wipe.
      let noSeatUsed = 0;
      if (G.customers) for (const c of G.customers) {
        if (c.done || c.state !== 'waitSeat' || noSeatUsed >= NO_SEAT_POOL) continue;
        const slot = noSeatPool[noSeatUsed] || (noSeatPool[noSeatUsed] = noSeatSlot());
        noSeatUsed++;
        fx.project(c.x, NO_SEAT_BUBBLE_Y, c.z, demandTmp);
        slot.el.style.left = demandTmp.sx + 'px'; slot.el.style.top = demandTmp.sy + 'px';
        if (slot.visible !== demandTmp.visible) { slot.el.classList.toggle('hidden', !demandTmp.visible); slot.visible = demandTmp.visible; }
      }
      for (let i = noSeatUsed; i < noSeatPool.length; i++) {
        const slot = noSeatPool[i];
        if (slot.visible) { slot.el.classList.add('hidden'); slot.visible = false; }
      }

      // Program §6.3: one ring, either actor. ctx.cleanProg is the owner-hold map systems/
      // stations.js still owns; it wins whenever it has an entry because that is a live,
      // frame-by-frame progress. It is empty in today's build (the owner's wipe is instantaneous),
      // so in practice every ring below is the event-driven one — which is the whole point: the
      // cleaner's 1.6 s finally has a visible clock, drawn by the same code as the owner's.
      const cleanProg = ctx.cleanProg;
      let ringSeat = null, ringT = 0;
      if (cleanProg && cleanProg.size) {
        for (const [seatId, t] of cleanProg) { ringSeat = seatId; ringT = Math.min(1, t / 1.0); break; }
      } else if (activeWipe) {
        activeWipe.t += Math.max(0, dt);
        const seat = world.stations.get(activeWipe.seatId);
        const finished = !seat || !seat.dirty;   // 'cleaned' already landed (same frame, for the owner)
        if (finished) activeWipe.tail += Math.max(0, dt);
        // Three ways out, so a ring can never be stranded: the tail elapsed, the seat vanished, or
        // the wipe was abandoned (a cleaner pulled off a seat someone else wiped) and simply ran
        // long. The last is the safety net, never the normal path.
        if (!seat || activeWipe.tail >= WIPE_TAIL_SECONDS || activeWipe.t > activeWipe.dur + 2) activeWipe = null;
        else { ringSeat = activeWipe.seatId; ringT = finished ? 1 : Math.min(1, activeWipe.t / activeWipe.dur); }
      }
      const ringStation = ringSeat ? world.stations.get(ringSeat) : null;
      if (ringStation) {
        cleanRing.position.set(ringStation.x, 0, ringStation.z);
        cleanRing.visible = true; cleanRing.setProgress(ringT);
      } else cleanRing.visible = false;
    },
  };
}
