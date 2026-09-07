// Low-noise, world-native coaching for explicit and proximity/dwell station actions.
//
// Task 29: only demonstrated mechanics persist. Hint presentation is session-local, mechanic IDs are
// stable domain IDs, and localization/UI copy cannot change the learning contract.
//
// Task 30: interaction gestures and the world objective share one priority lane and one escalation
// policy: natural state first, subtle pulse after ~3s of real hesitation, route/gesture after ~7s.
// Material movement toward the target resets escalation so a player who is already acting is never
// redirected or nagged.
import * as THREE from 'three';
import { carryCap } from '../sim/economy.js';
import { beanIcon, kibbleIcon, sackIcon, coffeeIcon, treatIcon } from './icons.js';
import {
  MECHANIC_LEARNING_VERSION,
  REFRESH_AFTER_FAILURES,
  mechanicIsKnown,
  normalizeMechanicLearning,
  coachEscalationStage,
  selectCoachPriority,
  stableContextAction,
} from '../sim/mechanicLearning.js';

export {
  MECHANIC_LEARNING_VERSION,
  REFRESH_AFTER_FAILURES,
  normalizeMechanicLearning,
  selectCoachPriority,
  stableContextAction,
} from '../sim/mechanicLearning.js';

const STYLE_ID = 'pet-cafe-interaction-coach-style';
const HOLD_RADIUS = 1.75;
const PROGRESS_RESET_METERS = 0.18;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .interaction-coach{position:fixed;left:0;top:0;width:38px;height:38px;z-index:24;pointer-events:none;transform:translate(-50%,-50%);opacity:.72;filter:drop-shadow(0 3px 5px #0003);transition:opacity .16s ease,filter .16s ease}
    .interaction-coach.hidden{display:none}.interaction-coach svg{width:100%;height:100%;overflow:visible;display:block}
    .interaction-coach .coach-caption{position:absolute;left:50%;top:37px;transform:translateX(-50%);width:30px;height:30px;padding:4px;box-sizing:border-box;border-radius:50%;background:#FFF8EFF2;box-shadow:0 3px 9px #00000026;opacity:0;transition:opacity .15s ease}
    .interaction-coach .coach-caption svg{width:100%;height:100%;display:block}
    .interaction-coach.has-caption .coach-caption{opacity:.94}
    .interaction-coach .coach-ring{fill:none;stroke:#fff;stroke-width:2.3;opacity:.82;transform-origin:19px 19px;animation:coachTapRing 1.05s ease-out infinite}
    .interaction-coach .coach-hand{fill:#fff8ef;stroke:#6c554c;stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round;animation:coachTapHand 1.05s ease-in-out infinite;transform-origin:20px 23px}
    .interaction-coach .coach-hold-dots{display:none}.interaction-coach .coach-hold-dot{fill:#fff;opacity:.8}
    .interaction-coach.route-mode{opacity:.9;filter:drop-shadow(0 4px 7px #0004)}
    .interaction-coach.route-mode .coach-ring{stroke-width:2.8}
    @keyframes coachTapRing{0%{transform:scale(.55);opacity:.9}70%,100%{transform:scale(1.25);opacity:0}}
    @keyframes coachTapHand{0%,100%{transform:translateY(1px) scale(.98)}45%{transform:translateY(-2px) scale(1.03)}}
    .interaction-coach.hold-mode{opacity:.64}
    .interaction-coach.hold-mode .coach-ring{animation:coachHoldRing 1.3s ease-in-out infinite}
    .interaction-coach.hold-mode .coach-hand{animation:coachHoldHand 1.3s ease-in-out infinite}
    .interaction-coach.hold-mode .coach-hold-dots{display:block}
    .interaction-coach.hold-mode .coach-hold-dot:nth-child(1){animation:coachDot 1.2s ease-in-out infinite}
    .interaction-coach.hold-mode .coach-hold-dot:nth-child(2){animation:coachDot 1.2s .16s ease-in-out infinite}
    .interaction-coach.hold-mode .coach-hold-dot:nth-child(3){animation:coachDot 1.2s .32s ease-in-out infinite}
    @keyframes coachHoldRing{0%,100%{transform:scale(.78);opacity:.48}50%{transform:scale(1.02);opacity:.88}}
    @keyframes coachHoldHand{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1.5px) scale(.98)}}
    @keyframes coachDot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:.9;transform:translateY(-1px)}}
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
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function urgentCustomerNeed(G) {
  return !!(G?.customers || []).find(c => c && !c.done && c.state !== 'leave' && Number.isFinite(c.patience) && c.patience <= 4);
}

// Exported pure detector so the refill lesson can be tested without DOM/camera machinery.
export function refillLessonNeed(G, suppressed = new Set()) {
  if (!G || !G.world || !G.carry) return null;
  let best = null;
  for (const st of G.world.stations.values()) {
    if (!st.active || !st.front) continue;
    let key = null, supply = null, label = null;
    if (st.type === 'coffee' && !suppressed.has('refillCoffee') && (st.beans | 0) <= 0) {
      key = 'refillCoffee'; supply = 'beans'; label = 'COFFEE';
    } else if (st.type === 'bowl' && !suppressed.has('refillBowl') && (st.stock | 0) <= 0) {
      key = 'refillBowl'; supply = 'kibble'; label = 'PET TREATS';
    }
    if (!key) continue;
    const dist = G.P ? d2(G.P, st.front) : 0;
    if (!best || dist < best.dist) best = {
      key, supply, label, stationId: st.id,
      x: st.front.x, y: st.type === 'bowl' ? .9 : 1.3, z: st.front.z, dist,
    };
  }
  return best;
}

function pantryStation(G) {
  if (!G?.world) return null;
  for (const st of G.world.stations.values()) if (st.active && st.type === 'pantry') return st;
  return null;
}

// Structural lookup only: Beans is the first pantry choice, Kibble the second. No English title or
// button copy participates in mechanic recognition, so localization cannot change Task-29 learning.
function pantryChoiceButton(supply) {
  const sheets = [...document.querySelectorAll('.sheet')];
  const sheet = sheets.find(el => !el.querySelector('.stabs') && el.querySelectorAll('.srows > .sbtn.buy').length === 2);
  if (!sheet) return null;
  const buttons = [...sheet.querySelectorAll('.srows > .sbtn.buy')];
  return supply === 'beans' ? buttons[0] || null : buttons[1] || null;
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
  let currentKey = null, candidateKey = null, candidateT = 0, candidateDistance = null;
  let activeHold = null, activeHoldSnap = null;

  function snapshotLearning() { return { v: MECHANIC_LEARNING_VERSION, proven: [...proven].sort() }; }
  function restoreLearning(raw) {
    proven.clear(); shown.clear(); failures.clear();
    const normalized = normalizeMechanicLearning(raw, G);
    for (const key of normalized.proven) proven.add(key);
    resetCandidate(); hide();
  }
  function shouldSuppress(key) { return proven.has(key) && (failures.get(key) || 0) < REFRESH_AFTER_FAILURES; }
  function suppressionSet() {
    const out = new Set();
    for (const key of proven) if (shouldSuppress(key)) out.add(key);
    return out;
  }
  function recordFailure(key) {
    if (!mechanicIsKnown(key) || !proven.has(key)) return 0;
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
  const SUPPLY_ICON = { beans: beanIcon, kibble: kibbleIcon };
  const STATION_ICON = { COFFEE: coffeeIcon, 'PET TREATS': treatIcon };
  const supplyIcon = supply => (SUPPLY_ICON[supply] || sackIcon)();
  const stationIcon = label => (STATION_ICON[label] || sackIcon)();
  function resetCandidate() {
    candidateKey = null; candidateT = 0; candidateDistance = null;
    activeHold = null; activeHoldSnap = null;
  }
  function hide() {
    root.classList.add('hidden'); root.classList.remove('hold-mode', 'route-mode');
    root.dataset.mode = ''; setCaption(''); currentKey = null;
    if (G) G.coachCueVisible = false;
  }
  function reveal(key, stage) {
    shown.add(key);
    root.classList.toggle('route-mode', stage === 'route');
    if (G) G.coachCueVisible = true;
    root.classList.remove('hidden');
  }
  function mark(key) {
    if (!key || !mechanicIsKnown(key)) return;
    proven.add(key); failures.delete(key); resetCandidate(); hide();
  }

  function advanceCandidate(key, dt, distance = null) {
    if (key !== candidateKey) {
      candidateKey = key; candidateT = 0; candidateDistance = distance;
      activeHold = null; activeHoldSnap = null;
      return 'natural';
    }
    if (distance != null && candidateDistance != null && distance < candidateDistance - PROGRESS_RESET_METERS) {
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

  function showTap(btn, key, routeText, dt, dwell = 0.35) {
    const candidate = `tap:${key}`;
    if (candidate !== candidateKey) {
      candidateKey = candidate; candidateT = 0;
      activeHold = null; activeHoldSnap = null;
      hide(); return true;
    }
    candidateT += Math.max(0, dt);
    if (candidateT < dwell) { hide(); return true; }
    currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'tap';
    setCaption(candidateT >= 3.0 ? routeText : '');
    placeBeside(root, btn); reveal(key, 'pulse'); return true;
  }

  function showRoute(target, key, routeText, dt) {
    const station = target.stationId || target.id || '';
    const candidate = `route:${key}:${station}`;
    if (candidate !== candidateKey) {
      candidateKey = candidate; candidateT = 0; candidateDistance = distanceTo(G, target);
      activeHold = null; activeHoldSnap = null;
      hide(); return true;
    }
    const dist = distanceTo(G, target);
    if (dist != null && candidateDistance != null && dist < candidateDistance - PROGRESS_RESET_METERS) {
      candidateT = 0; candidateDistance = dist;
      hide(); return true;
    }
    candidateT += Math.max(0, dt);
    if (dist != null && (candidateDistance == null || dist < candidateDistance)) candidateDistance = dist;
    if (candidateT < 0.4 || !placeAtWorld(root, S, target, layout)) { hide(); return true; }
    currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'route';
    setCaption(routeText); reveal(key, 'route'); return true;
  }

  const coach = {
    update(dt = 0) {
      if (activeHold && holdCompleted(G, activeHold, activeHoldSnap)) mark(activeHold.key);

      // Urgent guests own the world lane. Never stack a kiosk/construction/refill hand on top.
      if (urgentCustomerNeed(G)) { resetCandidate(); hide(); return; }

      const suppressed = suppressionSet();
      const lesson = refillLessonNeed(G, suppressed);
      if (lesson && G && S) {
        const choice = pantryChoiceButton(lesson.supply);
        if (choice) { showTap(choice, lesson.key, supplyIcon(lesson.supply), dt, 0.22); return; }
        if (overlayOpen()) { resetCandidate(); hide(); return; }
        const carryingRightSupply = G.carry.sack === lesson.supply && (G.carry.sackLeft | 0) > 0;
        if (!carryingRightSupply) {
          const pantry = pantryStation(G);
          const btn = document.querySelector('.fbtn');
          if (pantry && buttonVisible(btn) && stableContextAction(G) === 'pantry' && G.P && d2(G.P, pantry.front) < HOLD_RADIUS * HOLD_RADIUS) {
            showTap(btn, lesson.key, sackIcon(), dt, 0.22); return;
          }
          if (pantry) { showRoute({ ...pantry.front, stationId: pantry.id, y: 1.15 }, lesson.key, supplyIcon(lesson.supply), dt); return; }
        } else if (G.P && d2(G.P, { x: lesson.x, z: lesson.z }) > HOLD_RADIUS * HOLD_RADIUS) {
          showRoute(lesson, lesson.key, stationIcon(lesson.label), dt); return;
        }
      } else if (overlayOpen()) { resetCandidate(); hide(); return; }

      // Stock/build world work outranks kiosk/staff/pantry prompts even while its visual is still in
      // the natural stage. The refill lesson above is the richer version of that same single cue.
      const objectiveKind = G?.objectiveCueKind || null;
      const objectiveStock = ['restock', 'refill', 'supplies', 'stock'].includes(objectiveKind);
      const suppressTap = objectiveStock || objectiveKind === 'build';

      const btn = document.querySelector('.fbtn');
      const tapKey = buttonVisible(btn) ? stableContextAction(G) : null;
      if (tapKey && !shouldSuppress(tapKey) && !suppressTap) {
        if (showTap(btn, tapKey, '', dt)) return;
      }

      const hold = G && S ? holdTarget(G, suppressed) : null;
      if (!hold) { resetCandidate(); hide(); return; }
      const candidate = `hold:${hold.key}:${hold.stationId}`;
      if (candidate !== candidateKey) {
        candidateKey = candidate; candidateT = 0; candidateDistance = distanceTo(G, hold);
        activeHold = hold; activeHoldSnap = snapshotHold(G, hold); hide(); return;
      }
      activeHold = hold;
      candidateT += Math.max(0, dt);
      if (!activeHoldSnap) activeHoldSnap = snapshotHold(G, hold);
      if (candidateT < 0.08 || !placeAtWorld(root, S, hold, layout)) { hide(); return; }
      currentKey = hold.key; root.classList.add('hold-mode'); root.dataset.mode = 'hold';
      // The animated hold-dots above the puck already say "hold"; the caption only needs to say
      // WHAT is being refilled. A plain stay-put hold needs no caption at all.
      setCaption(candidateT >= 1.5
        ? (hold.key === 'refillCoffee' ? beanIcon() : hold.key === 'refillBowl' ? kibbleIcon() : '')
        : '');
      reveal(hold.key, 'pulse');
    },
    mark,
    fail: recordFailure,
    hasSeen(key) { return shown.has(key) || proven.has(key); },
    hasShown(key) { return shown.has(key); },
    hasProven(key) { return proven.has(key); },
    snapshotLearning,
    restoreLearning,
    priorityState() {
      const stock = !!refillLessonNeed(G, suppressionSet());
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
