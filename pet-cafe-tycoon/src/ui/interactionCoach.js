// Low-noise, world-native coaching for explicit and proximity/dwell station actions.
//
// Task 29: only demonstrated mechanics persist. Hint presentation is session-local, mechanic IDs are
// stable domain IDs, and localization/UI copy cannot change the learning contract.
//
// Task 30: interaction gestures and the world objective share one priority lane and one escalation
// policy: natural state first, subtle pulse after ~3s of real hesitation, route/gesture after ~7s.
// Material movement toward the target resets escalation so a player who is already acting is never
// redirected or nagged.
//
// Task 0.8 (the "pantry demo flickers until you open it once" report): the refill lesson used to
// start the instant a machine hit 0 and could only ever end at holdCompleted(). While it ran, the
// hand alternated between the pantry-sheet TAP and the world ROUTE, and every alternation reset the
// dwell (hide -> dwell -> show), while PROGRESS_RESET_METERS hid the hand again each time the player
// walked toward the target. Three rules fix it, all of them coach-local (the simulation gains no
// state, so authored balance and bot replays are untouched):
//   1. A lesson may only START once the machine has been empty for REFILL_EMPTY_SECONDS *and* a
//      guest is genuinely waiting on that product family.
//   2. Half credit: taking the right sack marks `${key}:sack` and the hand drops to route-only;
//      holdCompleted still proves the lesson, and REFILLS_TO_MASTER player refills of any supply
//      prove every refill lesson.
//   3. Hysteresis: a visible mode owns the hand for MODE_HOLD_SECONDS before another may replace
//      it, mode changes cross-fade over MODE_FADE_SECONDS instead of hiding, and closing on a
//      target inside CLOSING_GRACE_METERS never hides the hand.
import * as THREE from 'three';
import { carryCap, familyOf } from '../sim/economy.js';
import { beanIcon, kibbleIcon, sackIcon, coffeeIcon, treatIcon } from './icons.js';
// Batch 1 (task E1): the ice cream lane's coach lesson needs a cream glyph. Agent D owns icons.js
// and is landing `creamIcon` in this same batch — a namespace import (unlike a named one) never
// fails to LINK if the export isn't there yet at whatever moment this file runs, it just reads back
// `undefined`, so this file works whether it runs before or after that lands. sackIcon is the
// fallback both before it lands and for any future supply that never gets its own glyph.
import * as ICONS_NS from './icons.js';
const creamIcon = () => (typeof ICONS_NS.creamIcon === 'function' ? ICONS_NS.creamIcon() : sackIcon());
import {
  MECHANIC_LEARNING_VERSION,
  REFRESH_AFTER_FAILURES,
  REFILLS_TO_MASTER,
  REFILL_LESSON_KEYS,
  mechanicIsKnown,
  normalizeMechanicLearning,
  normalizeRefillProgress,
  coachEscalationStage,
  selectCoachPriority,
  stableContextAction,
} from '../sim/mechanicLearning.js';

export {
  MECHANIC_LEARNING_VERSION,
  REFRESH_AFTER_FAILURES,
  REFILLS_TO_MASTER,
  REFILL_LESSON_KEYS,
  normalizeMechanicLearning,
  normalizeRefillProgress,
  selectCoachPriority,
  stableContextAction,
} from '../sim/mechanicLearning.js';

const STYLE_ID = 'pet-cafe-interaction-coach-style';
const HOLD_RADIUS = 1.75;
const PROGRESS_RESET_METERS = 0.18;

/** A dry machine is a lesson only after this long, and only with a guest waiting on it. */
export const REFILL_EMPTY_SECONDS = 6;
/** A visible mode owns the hand for at least this long before another mode may take it. */
export const MODE_HOLD_SECONDS = 0.8;
/** Mode changes cross-fade for this long instead of hiding and re-dwelling. */
export const MODE_FADE_SECONDS = 0.15;
/** Inside this radius, closing on the target is the player DOING the lesson: never hide. */
export const CLOSING_GRACE_METERS = 4;
// REFILLS_TO_MASTER and REFILL_LESSON_KEYS are re-exported above from sim/mechanicLearning.js, which
// is where the save boundary bounds them too: one definition, one bound, both sides agreeing.

// Batch 1 (task E1): icecream mirrors coffee exactly (cream instead of beans — same shape as
// world.js's ALT_PRODUCT/stepMachines contract), so it only needs one more entry per map, not a
// parallel code path. 'refillIce' is a NEW mechanic id that src/sim/mechanicLearning.js's frozen
// MECHANIC_IDS/REFILL_LESSON_KEYS whitelist does not know (that file belongs to another task this
// batch, and the hard rule is edit only files listed as mine) — see the `mark`/`recordFailure`
// notes below for exactly how this file works around that without touching it.
const REFILL_SUPPLY = Object.freeze({ coffee: 'beans', bowl: 'kibble', icecream: 'cream' });
const REFILL_KEY_BY_TYPE = Object.freeze({ coffee: 'refillCoffee', bowl: 'refillBowl', icecream: 'refillIce' });
const REFILL_KEY_BY_SUPPLY = Object.freeze({ beans: 'refillCoffee', kibble: 'refillBowl', cream: 'refillIce' });
const REFILL_LABEL = Object.freeze({ coffee: 'COFFEE', bowl: 'PET TREATS', icecream: 'ICE CREAM' });
// Every refill lesson this file knows about, whether or not mechanicLearning.js's whitelist does.
export const ALL_REFILL_KEYS = Object.freeze([...REFILL_LESSON_KEYS, 'refillIce']);

function refillStationLevel(st) {
  if (!st) return 0;
  if (st.type === 'coffee') return st.beans | 0;
  if (st.type === 'icecream') return st.cream | 0;
  return st.stock | 0;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .interaction-coach{position:fixed;left:0;top:0;width:38px;height:38px;z-index:24;pointer-events:none;transform:translate(-50%,-50%);opacity:.72;filter:drop-shadow(0 3px 5px #0003);transition:opacity .15s ease,filter .15s ease}
    .interaction-coach.hidden{display:none}.interaction-coach svg{width:100%;height:100%;overflow:visible;display:block}
    .interaction-coach .coach-caption{position:absolute;left:50%;top:37px;transform:translateX(-50%);width:30px;height:30px;padding:4px;box-sizing:border-box;border-radius:50%;background:#FFF8EFF2;box-shadow:0 3px 9px #00000026;opacity:0;transition:opacity .15s ease}
    .interaction-coach .coach-caption svg{width:100%;height:100%;display:block}
    .interaction-coach.has-caption .coach-caption{opacity:.94}
    .interaction-coach .coach-ring{fill:none;stroke:#fff;stroke-width:2.3;opacity:.68;transform-origin:19px 19px}
    .interaction-coach .coach-hand{fill:#fff8ef;stroke:#6c554c;stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round;transform-origin:20px 23px}
    .interaction-coach .coach-hold-dots{display:none}.interaction-coach .coach-hold-dot{fill:#fff;opacity:.8}
    .interaction-coach.route-mode{opacity:.9;filter:drop-shadow(0 4px 7px #0004)}
    .interaction-coach.route-mode .coach-ring{stroke-width:2.8}
    .interaction-coach.coach-demo .coach-ring{animation:coachTapRing 1.4s ease-out 1}
    .interaction-coach.coach-demo .coach-hand{animation:coachTapHand 1.4s ease-in-out 1}
    @keyframes coachTapRing{0%{transform:scale(.72);opacity:.85}72%{transform:scale(1.16);opacity:.18}100%{transform:scale(1);opacity:.68}}
    @keyframes coachTapHand{0%,100%{transform:translateY(0)}48%{transform:translateY(-3px)}}
    .interaction-coach.hold-mode{opacity:.64}
    .interaction-coach.hold-mode.coach-demo .coach-ring{animation:coachHoldRing 1.4s ease-in-out 1}
    .interaction-coach.hold-mode.coach-demo .coach-hand{animation:coachHoldHand 1.4s ease-in-out 1}
    .interaction-coach.hold-mode .coach-hold-dots{display:block}
    .interaction-coach.hold-mode.coach-demo .coach-hold-dot:nth-child(1){animation:coachDot 1.2s ease-in-out 1}
    .interaction-coach.hold-mode.coach-demo .coach-hold-dot:nth-child(2){animation:coachDot 1.2s .16s ease-in-out 1}
    .interaction-coach.hold-mode.coach-demo .coach-hold-dot:nth-child(3){animation:coachDot 1.2s .32s ease-in-out 1}
    @keyframes coachHoldRing{0%,100%{transform:scale(.78);opacity:.48}50%{transform:scale(1.02);opacity:.88}}
    @keyframes coachHoldHand{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1.5px) scale(.98)}}
    @keyframes coachDot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:.9;transform:translateY(-1px)}}
    .interaction-coach.coach-fade,.interaction-coach.coach-fade.route-mode,.interaction-coach.coach-fade.hold-mode{opacity:0}
    .interaction-coach.coach-fade .coach-caption{opacity:0}
    body.game-paused .interaction-coach,body.host-paused .interaction-coach,body.meta-summary-open .interaction-coach{display:none!important}
    @media(max-width:200px){.interaction-coach{width:32px;height:32px;opacity:.66}.interaction-coach .coach-caption{top:33px;font-size:8px}}
    @media(prefers-reduced-motion:reduce){.interaction-coach .coach-ring,.interaction-coach .coach-hand,.interaction-coach .coach-hold-dot{animation:none!important}.interaction-coach .coach-ring{opacity:.58;transform:scale(.82)}}
  `;
  document.head.appendChild(s);
}

function overlayOpen() {
  return !!document.querySelector(
    '.sheet-root:not(.hidden),.career-root:not(.hidden),.meta-book-root:not(.hidden),.party-root:not(.hidden),.pause-root:not(.hidden),.host-pause:not(.hidden)'
  );
}

function buttonVisible(btn) {
  if (!btn || btn.classList.contains('hidden')) return false;
  const cs = getComputedStyle(btn);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
}

function placeBeside(root, btn) {
  const r = btn.getBoundingClientRect();
  const margin = innerWidth <= 200 ? 18 : 22;
  let x = r.right + margin, y = r.top + r.height * 0.5;
  if (x + 20 > innerWidth) x = r.left - margin;
  if (x - 20 < 0) { x = r.left + r.width * 0.5; y = r.bottom + margin; }
  x = Math.max(18, Math.min(innerWidth - 18, x));
  y = Math.max(18, Math.min(innerHeight - 50, y));
  root.style.left = `${x}px`; root.style.top = `${y}px`;
}

const projectTmp = new THREE.Vector3();
function placeAtWorld(root, S, target, layout) {
  projectTmp.set(target.x, target.y || 1.15, target.z).project(S.camera);
  if (projectTmp.z < -1 || projectTmp.z > 1) return false;
  let x = (projectTmp.x * 0.5 + 0.5) * innerWidth;
  let y = (-projectTmp.y * 0.5 + 0.5) * innerHeight;
  y -= 18;
  // The coach is a 38px puck with a caption hanging below it (top:39px, up to 150px wide), so the
  // footprint it must keep clear is far larger than the puck itself.
  if (layout && layout.avoid) [x, y] = layout.avoid(x, y + 20, 156, 84), y -= 20;
  x = Math.max(18, Math.min(innerWidth - 18, x));
  y = Math.max(18, Math.min(innerHeight - 52, y));
  root.style.left = `${x}px`; root.style.top = `${y}px`;
  return true;
}

function d2(a, b) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }
function distanceTo(G, target) {
  if (!G?.P || !target) return null;
  return Math.hypot(G.P.x - target.x, G.P.z - target.z);
}
function reducedMotion() {
  try { return document.body.classList.contains('reduced-motion') || !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function urgentCustomerNeed(G) {
  return !!(G?.customers || []).find(c => c && !c.done && c.state !== 'leave' && Number.isFinite(c.patience) && c.patience <= 4);
}

/**
 * Is a guest actually waiting on what this machine produces right now? A guest counts while it has
 * not received the goods: for a machine, until its order is in hand; for the treat bowl, until a
 * treat is in that order. Structural only - no UI copy participates.
 */
export function guestWaitingForStation(G, st) {
  if (!st) return false;
  const wantsTreat = st.type === 'bowl';
  const family = wantsTreat ? null : familyOf(st.product || 'coffee');
  for (const c of (G?.customers || [])) {
    if (!c || c.done || c.state === 'leave' || !c.wish) continue;
    const order = Array.isArray(c.order) ? c.order : null;
    if (wantsTreat) {
      if (c.wish.treat === true && !(order && order.includes('treat'))) return true;
    } else if (familyOf(c.wish.product) === family && !(order && order.length)) return true;
  }
  return false;
}

/**
 * Coach-local emptiness clock. The simulation never learns that the coach is watching, so authored
 * balance and deterministic bot replays are untouched.
 */
export function createRefillReadiness({ seconds = REFILL_EMPTY_SECONDS } = {}) {
  const emptyFor = new Map();
  const api = {
    seconds,
    update(G, dt = 0) {
      const step = Math.max(0, Number(dt) || 0);
      const stations = G && G.world && G.world.stations;
      if (!stations || typeof stations.values !== 'function') { emptyFor.clear(); return; }
      const seen = new Set();
      for (const st of stations.values()) {
        if (!st || !REFILL_SUPPLY[st.type]) continue;
        seen.add(st.id);
        if (!st.active || refillStationLevel(st) > 0) { emptyFor.set(st.id, 0); continue; }
        emptyFor.set(st.id, (emptyFor.get(st.id) || 0) + step);
      }
      for (const id of [...emptyFor.keys()]) if (!seen.has(id)) emptyFor.delete(id);
    },
    emptySeconds(id) { return emptyFor.get(id) || 0; },
    ready(st, G) {
      return !!st && (emptyFor.get(st.id) || 0) >= seconds && guestWaitingForStation(G, st);
    },
    filter(G) { return st => api.ready(st, G); },
    reset() { emptyFor.clear(); },
  };
  return api;
}

/**
 * Half credit and mastery, read from observable world state so a lesson that is already suppressed
 * still counts the player's refills. Rides along in the coach learning payload.
 */
export function createRefillProgress() {
  const sacks = new Set();
  const levels = new Map();
  let refills = 0, lastSack = null, lastSackLeft = 0, primed = false;

  function creditSack(key) {
    if (ALL_REFILL_KEYS.includes(key)) sacks.add(`${key}:sack`);
  }
  function creditRefill(key) {
    if (!ALL_REFILL_KEYS.includes(key)) return;
    creditSack(key);
    refills = Math.min(REFILLS_TO_MASTER, refills + 1);
  }
  function observe(G) {
    const carry = G && G.carry ? G.carry : null;
    const sack = carry ? carry.sack : null;
    const sackLeft = carry ? (carry.sackLeft | 0) : 0;
    // Taking the right sack out of the pantry is half of the lesson.
    if (sack && sack !== lastSack && REFILL_KEY_BY_SUPPLY[sack]) creditSack(REFILL_KEY_BY_SUPPLY[sack]);
    const stations = G && G.world && G.world.stations;
    if (stations && typeof stations.values === 'function') {
      const seen = new Set();
      for (const st of stations.values()) {
        if (!st || !REFILL_SUPPLY[st.type]) continue;
        seen.add(st.id);
        const level = refillStationLevel(st);
        const prev = levels.get(st.id);
        levels.set(st.id, level);
        // Only the player's own pour proves anything: the machine rose, their sack shrank in the
        // same step, and they were standing at that machine. Staff restocks teach nothing.
        if (!primed || prev == null || level <= prev) continue;
        if (lastSack !== REFILL_SUPPLY[st.type] || sackLeft >= lastSackLeft) continue;
        if (!G.P || !st.front || d2(G.P, st.front) > HOLD_RADIUS * HOLD_RADIUS) continue;
        creditRefill(REFILL_KEY_BY_TYPE[st.type]);
      }
      for (const id of [...levels.keys()]) if (!seen.has(id)) levels.delete(id);
    }
    lastSack = sack; lastSackLeft = sackLeft; primed = true;
  }
  return {
    observe, creditSack, creditRefill,
    get refills() { return refills; },
    hasSack(key) { return sacks.has(`${key}:sack`); },
    sackKeys() { return [...sacks].sort(); },
    // "Two successful refills of any supply mark all refill lessons proven" (plan 3.2's coach note)
    // generalises to every supply this file knows, ice cream included.
    masteredKeys() { return refills >= REFILLS_TO_MASTER ? [...ALL_REFILL_KEYS] : []; },
    snapshot() { return { sack: [...sacks].sort(), refills }; },
    restore(raw) {
      sacks.clear(); levels.clear();
      refills = 0; lastSack = null; lastSackLeft = 0; primed = false;
      // The same bounding the save boundary applies, so a hand-edited payload buys nothing here.
      // NOTE: normalizeRefillProgress's SACK_MARKS whitelist (src/sim/mechanicLearning.js) only
      // knows REFILL_LESSON_KEYS (refillCoffee/refillBowl) — that file is owned by another task
      // this batch, so a `refillIce:sack` half-credit mark does not survive a real save/reload
      // round trip yet (see snapshotLearning/restoreLearning below for the same limit on mastery
      // itself). In-session play is unaffected: this object's own live `sacks`/`refills` state
      // credits ice refills exactly like beans/kibble the whole time the game stays open.
      const half = normalizeRefillProgress(raw);
      for (const entry of half.sack) sacks.add(entry);
      refills = half.refills;
    },
  };
}

// Exported pure detector so the refill lesson can be tested without DOM/camera machinery.
// `ready` (optional) is the Task-0.8 start gate: a predicate on the station. Omitting it keeps the
// original "empty right now" contract the pure detector tests assert.
export function refillLessonNeed(G, suppressed = new Set(), ready = null) {
  if (!G || !G.world || !G.carry) return null;
  let best = null;
  for (const st of G.world.stations.values()) {
    if (!st.active || !st.front) continue;
    const supply = REFILL_SUPPLY[st.type];
    if (!supply) continue;
    const key = REFILL_KEY_BY_TYPE[st.type];
    if (suppressed.has(key) || refillStationLevel(st) > 0) continue;
    if (typeof ready === 'function' && !ready(st)) continue;
    const dist = G.P ? d2(G.P, st.front) : 0;
    if (!best || dist < best.dist) best = {
      key, supply, label: REFILL_LABEL[st.type], stationId: st.id,
      x: st.front.x, y: st.type === 'bowl' ? .9 : 1.3, z: st.front.z, dist,
    };
  }
  return best;
}

/**
 * Which hand the refill lesson wants this frame. Pure, so the half-credit rule is testable:
 * 'tap' = press this button, 'route' = walk there, 'fall' = the generic lanes own the frame (that
 * is where the hold cue lives), 'none' = show nothing.
 */
export function refillCueMode({
  half = false, sheetChoice = false, overlay = false, carryingSupply = false,
  pantryTapReady = false, hasPantry = true, nearMachine = false,
} = {}) {
  if (!half && sheetChoice) return 'tap';
  if (overlay) return 'none';
  if (!carryingSupply) {
    if (!half && pantryTapReady) return 'tap';
    return hasPantry ? 'route' : 'fall';
  }
  return nearMachine ? 'fall' : 'route';
}

/**
 * Would a PROGRESS_RESET hide the hand? Only for a target still far away: dropping the cue while
 * the player closes the last few metres is exactly the flicker Task 0.8 removes.
 */
export function progressResetHides(distance, best, grace = CLOSING_GRACE_METERS) {
  if (distance == null || best == null) return false;
  if (!(distance < best - PROGRESS_RESET_METERS)) return false;
  return distance > grace;
}

/**
 * Mode hysteresis + cross-fade. A live mode owns the hand for `hold` seconds; replacing it fades
 * the puck out over `fade` seconds and brings the new one back in the same slot, so the player
 * never sees hide -> dwell -> show.
 */
export function createCoachModeGate({ hold = MODE_HOLD_SECONDS, fade = MODE_FADE_SECONDS } = {}) {
  let mode = null, key = null, modeT = 0, fadeT = 0, pending = null, pendingKey = null, switches = 0;
  function adopt(nextMode, nextKey) {
    mode = nextMode; key = nextKey; modeT = 0; fadeT = 0; pending = null; pendingKey = null;
    if (nextMode) switches++;
  }
  return {
    get mode() { return mode; },
    get key() { return key; },
    get modeSeconds() { return modeT; },
    get fading() { return fadeT > 0; },
    get switches() { return switches; },
    request(nextMode = null, nextKey = null, dt = 0) {
      const step = Math.max(0, Number(dt) || 0);
      modeT += step;
      if (mode === null) {
        if (nextMode) adopt(nextMode, nextKey);
        return { mode, key, live: mode !== null && mode === nextMode, fading: false };
      }
      if (fadeT > 0) {
        // A cross-fade is in flight. Re-requesting what is already on screen cancels it outright:
        // a one-frame blip in the world state must never cost the player their cue.
        if (nextMode === mode && nextKey === key) { pending = null; pendingKey = null; fadeT = 0; }
        else {
          if (nextMode !== pending || nextKey !== pendingKey) { pending = nextMode; pendingKey = nextKey; }
          fadeT -= step;
          if (fadeT <= 0) adopt(pending, pendingKey);
        }
        return { mode, key, live: fadeT <= 0 && mode === nextMode && key === nextKey, fading: fadeT > 0 };
      }
      if (nextMode === mode && nextKey === key) return { mode, key, live: true, fading: false };
      if (modeT < hold) return { mode, key, live: false, fading: false };
      pending = nextMode; pendingKey = nextKey; fadeT = fade;
      return { mode, key, live: false, fading: true };
    },
    clear() { mode = null; key = null; modeT = 0; fadeT = 0; pending = null; pendingKey = null; },
  };
}

// A pantry "supports" a supply if its DATA says so explicitly (coldPantry1's `supplies: ['cream']`,
// data/area1.js) or, for the original interior pantry with no `supplies` field at all, if the
// supply is one of the two classic ones. Batch 1 (task E1): coldPantry1 stocks cream only, so
// picking the FIRST active pantry (the old contract) would route a thirsty ice cream refill to the
// wrong building entirely.
//
// Reads `G.world.area.stations` (the original authored data, kept on the sim world as `.area`)
// rather than the runtime station object: createWorld (src/sim/world.js, not owned by this task)
// copies only a fixed field list onto each runtime station and `supplies` is not among them, so
// `st.supplies` is always undefined at runtime no matter what data/area1.js says (verified against
// the real AREA1 data — see test/bot-decide-icecream.test.js's botDecide.js-side coverage of the
// identical gap). Rather than touch world.js, this reads the one place the real data still lives.
function pantrySupports(G, st, supply) {
  if (!st) return false;
  const stations = G && G.world && G.world.area && G.world.area.stations;
  const data = stations && stations.find(s => s.id === st.id);
  if (data && Array.isArray(data.supplies)) return data.supplies.includes(supply);
  return supply === 'beans' || supply === 'kibble';
}
function pantryStation(G, supply = null) {
  if (!G?.world) return null;
  let fallback = null;
  for (const st of G.world.stations.values()) {
    if (!st.active || st.type !== 'pantry') continue;
    if (!fallback) fallback = st;
    if (supply && pantrySupports(G, st, supply)) return st;
  }
  return supply ? null : fallback;
}

// Structural lookup only: each pantry choice button carries its own supply id in `data-supply`
// (src/ui/sheets.js renderPantry), so this reads that instead of trusting a fixed button count/
// order. That makes it correct for a pantry sheet with ONE choice (coldPantry1 offers cream only)
// exactly as much as for one with two (or, once agent D's third row lands on the interior pantry
// sheet, three) — no English title or button copy participates in mechanic recognition either way,
// so localization cannot change Task-29 learning.
function pantryChoiceButton(supply) {
  const sheets = [...document.querySelectorAll('.sheet')];
  const sheet = sheets.find(el => !el.querySelector('.stabs') && el.querySelector('.srows > .sbtn.buy[data-supply]'));
  if (!sheet) return null;
  return sheet.querySelector(`.srows > .sbtn.buy[data-supply="${supply}"]`) || null;
}

function holdTarget(G, suppressed) {
  if (!G?.world || !G?.P || !G?.carry) return null;
  let best = null;
  const cap = carryCap(G.up || {});
  for (const st of G.world.stations.values()) {
    if (!st.active || !st.front || d2(G.P, st.front) > HOLD_RADIUS * HOLD_RADIUS) continue;
    let key = null, y = 1.15;
    if (st.type === 'coffee' && !suppressed.has('refillCoffee') && G.carry.sack === 'beans' && G.carry.sackLeft > 0 && st.beans < 20) {
      key = 'refillCoffee'; y = 1.3;
    } else if (st.type === 'icecream' && !suppressed.has('refillIce') && G.carry.sack === 'cream' && G.carry.sackLeft > 0 && st.cream < 20) {
      key = 'refillIce'; y = 1.3;
    } else if (st.type === 'blender' && !suppressed.has('blend') && G.carry.fruit > 0 && st.fruit < 9) {
      key = 'blend'; y = 1.25;
    } else if (st.type === 'bowl' && !suppressed.has('refillBowl') && G.carry.sack === 'kibble' && G.carry.sackLeft > 0 && st.stock < st.capacity) {
      key = 'refillBowl'; y = .9;
    } else if (st.type === 'bush' && !suppressed.has('harvest') && st.stage === 3 && !G.carry.sack && (G.owner?.items?.length || 0) === 0 && G.carry.fruit < cap) {
      key = 'harvest'; y = 1;
    }
    if (!key) continue;
    const dist = d2(G.P, st.front);
    if (!best || dist < best.dist) best = { key, stationId: st.id, x: st.front.x, y, z: st.front.z, dist };
  }
  return best;
}

function snapshotHold(G, target) {
  const st = target && G.world.stations.get(target.stationId);
  if (!st) return null;
  return {
    beans: st.beans || 0,
    cream: st.cream || 0,
    machineFruit: st.fruit || 0,
    stock: st.stock || 0,
    stage: st.stage || 0,
    sackLeft: G.carry.sackLeft || 0,
    fruit: G.carry.fruit || 0,
  };
}
function holdCompleted(G, target, snap) {
  if (!target || !snap) return false;
  const st = G.world.stations.get(target.stationId); if (!st) return false;
  if (target.key === 'refillCoffee') return (st.beans || 0) > snap.beans || (G.carry.sackLeft || 0) < snap.sackLeft;
  if (target.key === 'refillIce') return (st.cream || 0) > snap.cream || (G.carry.sackLeft || 0) < snap.sackLeft;
  if (target.key === 'blend') return (st.fruit || 0) > snap.machineFruit || (G.carry.fruit || 0) < snap.fruit;
  if (target.key === 'refillBowl') return (st.stock || 0) > snap.stock || (G.carry.sackLeft || 0) < snap.sackLeft;
  if (target.key === 'harvest') return (st.stage || 0) < snap.stage || (G.carry.fruit || 0) > snap.fruit;
  return false;
}

export function createInteractionCoach(G = null, S = null, layout = null) {
  injectStyle();
  const root = document.createElement('div'); root.className = 'interaction-coach hidden'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<svg viewBox="0 0 38 38" aria-hidden="true"><g class="coach-hold-dots"><circle class="coach-hold-dot" cx="13" cy="5" r="1.4"/><circle class="coach-hold-dot" cx="19" cy="5" r="1.4"/><circle class="coach-hold-dot" cx="25" cy="5" r="1.4"/></g><circle class="coach-ring" cx="19" cy="19" r="10"/><path class="coach-hand" d="M17.2 26.8v-12c0-2.5 3.6-2.5 3.6 0v6.2-3.4c0-2.2 3.2-2.2 3.2 0v3.8-2.6c0-2 3-2 3 0v3.4-1.8c0-1.9 2.9-1.9 2.9 0v5.4c0 5-3.2 8.1-7.8 8.1h-1.3c-2.9 0-5.1-1.2-6.9-3.7l-2.4-3.4c-1.4-2.1 1.7-4 3.1-2.1l2.6 3.1z"/></svg><div class="coach-caption"></div>`;
  document.body.appendChild(root);
  const caption = root.querySelector('.coach-caption');

  const proven = new Set();
  const shown = new Set();
  const failures = new Map();
  const readiness = createRefillReadiness();
  const progress = createRefillProgress();
  const modeGate = createCoachModeGate();
  let currentKey = null, candidateKey = null, candidateT = 0, candidateDistance = null;
  let activeHold = null, activeHoldSnap = null, lessonLatch = null;

  // One canonical serializer for the live snapshot and for the host save alike: whatever this writes
  // is exactly what normalizeMechanicLearning() hands back on the next load, half credit included.
  function snapshotLearning() {
    return normalizeMechanicLearning({
      v: MECHANIC_LEARNING_VERSION, proven: [...proven], ...progress.snapshot(),
    });
  }
  function restoreLearning(raw) {
    proven.clear(); shown.clear(); failures.clear();
    const normalized = normalizeMechanicLearning(raw, G);
    for (const key of normalized.proven) proven.add(key);
    // Half credit and the refill tally are part of the canonical Task-29 payload itself, so they
    // survive sim/save.js and a real host round trip, not only an in-memory snapshot. Restoring from
    // `normalized` means this untrusted input is version-gated and bounded exactly once, on the way in.
    progress.restore(normalized);
    for (const key of progress.masteredKeys()) proven.add(key);
    readiness.reset(); lessonLatch = null;
    resetCandidate(); hide();
  }
  function shouldSuppress(key) { return proven.has(key) && (failures.get(key) || 0) < REFRESH_AFTER_FAILURES; }
  function suppressionSet() {
    const out = new Set();
    for (const key of proven) if (shouldSuppress(key)) out.add(key);
    return out;
  }
  function recordFailure(key) {
    if ((!mechanicIsKnown(key) && !isRefillIceKey(key)) || !proven.has(key)) return 0;
    const n = Math.min(REFRESH_AFTER_FAILURES, (failures.get(key) || 0) + 1);
    failures.set(key, n);
    return n;
  }

  function setCaption(iconHtml = '') {
    if (caption.dataset.icon !== iconHtml) {
      caption.dataset.icon = iconHtml;
      caption.innerHTML = iconHtml;
    }
    root.classList.toggle('has-caption', !!iconHtml);
  }
  // Route hints name one of five things. Each has a glyph already drawn in ui/icons.js.
  const SUPPLY_ICON = { beans: beanIcon, kibble: kibbleIcon, cream: creamIcon };
  const STATION_ICON = { COFFEE: coffeeIcon, 'PET TREATS': treatIcon, 'ICE CREAM': creamIcon };
  const supplyIcon = supply => (SUPPLY_ICON[supply] || sackIcon)();
  const stationIcon = label => (STATION_ICON[label] || sackIcon)();
  function resetCandidate() {
    candidateKey = null; candidateT = 0; candidateDistance = null;
    activeHold = null; activeHoldSnap = null;
  }
  function hide() {
    root.classList.add('hidden'); root.classList.remove('hold-mode', 'route-mode', 'coach-fade', 'coach-demo');
    root.dataset.mode = ''; setCaption(''); currentKey = null;
    modeGate.clear();
    if (G) G.coachCueVisible = false;
  }
  function reveal(key, stage) {
    shown.add(key);
    root.classList.toggle('route-mode', stage === 'route');
    root.classList.toggle('coach-demo', stage === 'demo');
    if (G) G.coachCueVisible = true;
    root.classList.remove('hidden');
  }
  // 'refillIce' is not in mechanicLearning.js's MECHANIC_IDS whitelist (that file is owned by
  // another task this batch — see the ALL_REFILL_KEYS comment above), so `mechanicIsKnown` alone
  // would silently refuse to ever mark it proven, leaving the lesson nagging forever. Recognise it
  // here explicitly instead of touching that shared file.
  function isRefillIceKey(key) { return key === 'refillIce'; }
  function mark(key) {
    if (!key || (!mechanicIsKnown(key) && !isRefillIceKey(key))) return;
    proven.add(key); failures.delete(key); resetCandidate(); hide();
  }

  function advanceCandidate(key, dt, distance = null) {
    if (key !== candidateKey) {
      candidateKey = key; candidateT = 0; candidateDistance = distance;
      activeHold = null; activeHoldSnap = null;
      return 'natural';
    }
    if (progressResetHides(distance, candidateDistance)) {
      candidateT = 0; candidateDistance = distance;
      hide();
      return 'natural';
    }
    candidateT += Math.max(0, dt);
    if (distance != null && (candidateDistance == null || distance < candidateDistance)) candidateDistance = distance;
    return coachEscalationStage(candidateT, reducedMotion());
  }

  // Install before platform restore. Cloud load validation now preserves the same canonical learning
  // payload through sim/save.js, so this wrapper round-trips through both live snapshots and host IO.
  if (G && typeof G.snapshot === 'function' && typeof G.restore === 'function' && !G.__coachPersistenceWrapped) {
    const baseSnapshot = G.snapshot.bind(G);
    const baseRestore = G.restore.bind(G);
    G.snapshot = () => ({ ...baseSnapshot(), learning: snapshotLearning() });
    G.restore = data => {
      const ok = baseRestore(data);
      if (ok) restoreLearning(data && typeof data === 'object' ? data.learning : null);
      return ok;
    };
    G.__coachPersistenceWrapped = true;
  }
  restoreLearning(null);

  // Stable world action IDs are sampled in capture phase while the real .fbtn still exists. The
  // visible label may be translated, restyled or changed without affecting persistence.
  const onAction = e => {
    const btn = e.target && e.target.closest && e.target.closest('.fbtn');
    if (!buttonVisible(btn)) return;
    mark(stableContextAction(G));
  };
  document.addEventListener('click', onAction, true);

  function tapPlan(btn, key, icon, dwell = 0.35) {
    return {
      mode: 'tap', key, candidate: `tap:${key}`, dwell, distance: null,
      render() {
        currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'tap';
        setCaption(icon && candidateT >= 3.0 ? icon : '');
        placeBeside(root, btn); reveal(key, candidateT >= 8 && candidateT < 9.5 ? 'demo' : 'static'); return true;
      },
    };
  }

  function routePlan(target, key, icon) {
    const station = target.stationId || target.id || '';
    return {
      mode: 'route', key, candidate: `route:${key}:${station}`, dwell: 0.4, distance: distanceTo(G, target),
      render() {
        if (!placeAtWorld(root, S, target, layout)) return false;
        currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'route';
        setCaption(icon); reveal(key, candidateT >= 8 && candidateT < 9.5 ? 'demo' : 'route'); return true;
      },
    };
  }

  function holdPlan(hold, candidate) {
    return {
      mode: 'hold', key: hold.key, candidate, dwell: 0.08, distance: null,
      render() {
        if (!placeAtWorld(root, S, hold, layout)) return false;
        currentKey = hold.key; root.classList.add('hold-mode'); root.dataset.mode = 'hold';
        // The animated hold-dots above the puck already say "hold"; the caption only needs to say
        // WHAT is being refilled. A plain stay-put hold needs no caption at all.
        setCaption(candidateT >= 1.5
          ? (hold.key === 'refillCoffee' ? beanIcon() : hold.key === 'refillBowl' ? kibbleIcon()
            : hold.key === 'refillIce' ? creamIcon() : '')
          : '');
        reveal(hold.key, candidateT >= 8 && candidateT < 9.5 ? 'demo' : 'static'); return true;
      },
    };
  }

  function lessonReady(st) {
    return readiness.ready(st, G) || !!(lessonLatch && lessonLatch.stationId === st.id);
  }

  // What the coach WANTS on screen this frame, before dwell and hysteresis have their say.
  function planCue() {
    const suppressed = suppressionSet();
    // The latch keeps a lesson that legitimately started from evaporating the moment its guest is
    // served; emptiness and suppression still end it.
    const lesson = refillLessonNeed(G, suppressed, lessonReady);
    lessonLatch = lesson ? { key: lesson.key, stationId: lesson.stationId } : null;

    if (lesson && G && S) {
      const half = progress.hasSack(lesson.key);
      const carrying = G.carry.sack === lesson.supply && (G.carry.sackLeft | 0) > 0;
      if (carrying) progress.creditSack(lesson.key);
      const choice = half ? null : pantryChoiceButton(lesson.supply);
      const pantry = pantryStation(G, lesson.supply);
      const fbtn = document.querySelector('.fbtn');
      const pantryTapReady = !!(pantry && !half && buttonVisible(fbtn) && stableContextAction(G) === 'pantry'
        && G.P && d2(G.P, pantry.front) < HOLD_RADIUS * HOLD_RADIUS);
      const mode = refillCueMode({
        half, sheetChoice: !!choice, overlay: overlayOpen(), carryingSupply: carrying,
        pantryTapReady, hasPantry: !!pantry,
        nearMachine: !!(G.P && d2(G.P, { x: lesson.x, z: lesson.z }) <= HOLD_RADIUS * HOLD_RADIUS),
      });
      if (mode === 'tap') {
        return choice
          ? tapPlan(choice, lesson.key, supplyIcon(lesson.supply), 0.22)
          : tapPlan(fbtn, lesson.key, sackIcon(), 0.22);
      }
      if (mode === 'route') {
        return carrying
          ? routePlan(lesson, lesson.key, stationIcon(lesson.label))
          : routePlan({ ...pantry.front, stationId: pantry.id, y: 1.15 }, lesson.key, supplyIcon(lesson.supply));
      }
      if (mode === 'none') return null;
      // 'fall': the generic lanes below own this frame - that is where the hold cue lives.
    } else if (overlayOpen()) return null;

    // Stock/build world work outranks kiosk/staff/pantry prompts even while its visual is still in
    // the natural stage. The refill lesson above is the richer version of that same single cue.
    const objectiveKind = G?.objectiveCueKind || null;
    const objectiveStock = ['restock', 'refill', 'supplies', 'stock'].includes(objectiveKind);
    const suppressTap = objectiveStock || objectiveKind === 'build';

    const btn = document.querySelector('.fbtn');
    const tapKey = buttonVisible(btn) ? stableContextAction(G) : null;
    if (tapKey && !shouldSuppress(tapKey) && !suppressTap) return tapPlan(btn, tapKey, '', 0.35);

    const hold = G && S ? holdTarget(G, suppressed) : null;
    if (!hold) return null;
    const candidate = `hold:${hold.key}:${hold.stationId}`;
    if (candidate !== candidateKey || !activeHoldSnap) activeHoldSnap = snapshotHold(G, hold);
    activeHold = hold;
    return holdPlan(hold, candidate);
  }

  // Dwell and progress bookkeeping. Returns whether this plan may be on screen this frame.
  // `live` (a cue is already up) skips the dwell entirely: that is what turns the old
  // hide -> dwell -> show alternation into a cross-fade.
  function stepCandidate(plan, dt, live) {
    if (plan.candidate !== candidateKey) {
      candidateKey = plan.candidate; candidateT = 0; candidateDistance = plan.distance;
      if (plan.mode !== 'hold') { activeHold = null; activeHoldSnap = null; }
      return live;
    }
    const dist = plan.distance;
    if (progressResetHides(dist, candidateDistance)) {
      candidateT = 0; candidateDistance = dist;
      return false;
    }
    if (dist != null && (candidateDistance == null || dist < candidateDistance)) candidateDistance = dist;
    candidateT += Math.max(0, dt);
    const quietDwell = plan.mode === 'hold' ? 1 : 4;
    return live || candidateT >= Math.max(plan.dwell, quietDwell);
  }

  const coach = {
    update(dt = 0) {
      const step = Math.max(0, Number(dt) || 0);
      readiness.update(G, step);
      progress.observe(G);
      for (const key of progress.masteredKeys()) proven.add(key);

      if (activeHold && holdCompleted(G, activeHold, activeHoldSnap)) mark(activeHold.key);

      // Urgent guests own the world lane. Never stack a kiosk/construction/refill hand on top.
      if (urgentCustomerNeed(G)) { resetCandidate(); lessonLatch = null; hide(); return; }

      const live = modeGate.mode !== null;
      const plan = planCue();
      let ready = false;
      if (plan) ready = stepCandidate(plan, step, live);
      else resetCandidate();

      const gate = modeGate.request(ready ? plan.mode : null, ready ? plan.key : null, step);
      if (gate.mode === null) { hide(); return; }
      root.classList.toggle('coach-fade', gate.fading);
      // Hysteresis, or a cross-fade in flight: leave the hand exactly where and how it is.
      if (!gate.live) return;
      if (plan.render() === false) hide();
    },
    mark,
    fail: recordFailure,
    hasSeen(key) { return shown.has(key) || proven.has(key); },
    hasShown(key) { return shown.has(key); },
    hasProven(key) { return proven.has(key); },
    snapshotLearning,
    restoreLearning,
    priorityState() {
      const stock = !!refillLessonNeed(G, suppressionSet(), lessonReady);
      const construction = G?.objectiveCueKind === 'build';
      return selectCoachPriority({
        urgent: urgentCustomerNeed(G), stock, construction,
        contextual: !!stableContextAction(G),
      });
    },
    hide,
    destroy() { document.removeEventListener('click', onAction, true); hide(); root.remove(); },
  };
  if (G) G.interactionCoach = coach;
  return coach;
}
