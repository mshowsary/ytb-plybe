// Low-noise, world-native coaching for explicit and proximity/dwell station actions.
//
// Task 29: a mechanic is persisted only after the player DEMONSTRATES it. Merely showing a hand
// does not teach the mechanic. Proven mechanics survive reload; malformed/legacy payloads fall back
// to conservative evidence already present in the save. A proven mechanic can be refreshed only
// after explicit repeated failures during the current session.
//
// Task 30: the interaction hand and the world objective arrow are one coaching system. Urgent guest
// need -> stock recovery -> construction -> contextual kiosk/worker/supply affordance. The hand sets
// G.coachCueVisible while it owns the cue so objective.js can suppress its arrow instead of drawing
// two simultaneous instructions over the cafe.
import * as THREE from 'three';
import { carryCap } from '../sim/economy.js';

const STYLE_ID = 'pet-cafe-interaction-coach-style';
const ACTION_KEYS = {
  RETURN: 'return',
  UPGRADES: 'kiosk',
  STAFF: 'hire',
  SUPPLIES: 'pantry',
};
const HOLD_RADIUS = 1.75;
const TAP_DWELL = 0.35;
const LESSON_TAP_DWELL = 0.22;
export const MECHANIC_LEARNING_VERSION = 1;
export const REFRESH_AFTER_FAILURES = 2;
const KNOWN_MECHANICS = new Set([
  'move', 'build', 'pickup', 'serve', 'cash',
  'return', 'kiosk', 'hire', 'pantry',
  'refillCoffee', 'refillBowl', 'blend', 'harvest',
]);

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .interaction-coach{position:fixed;left:0;top:0;width:38px;height:38px;z-index:24;pointer-events:none;transform:translate(-50%,-50%);opacity:.72;filter:drop-shadow(0 3px 5px #0003);transition:opacity .16s ease,transform .16s ease}
    .interaction-coach.hidden{display:none}.interaction-coach svg{width:100%;height:100%;overflow:visible;display:block}
    .interaction-coach .coach-caption{position:absolute;left:50%;top:39px;transform:translateX(-50%);max-width:150px;padding:5px 8px;border-radius:999px;background:#3b2e2ae8;color:#fff8ef;box-shadow:0 3px 9px #0002;font:900 9px/1 system-ui,sans-serif;letter-spacing:.045em;white-space:nowrap;text-transform:uppercase;opacity:0;transition:opacity .15s ease}
    .interaction-coach.has-caption .coach-caption{opacity:.94}
    .interaction-coach .coach-ring{fill:none;stroke:#fff;stroke-width:2.3;opacity:.82;transform-origin:19px 19px;animation:coachTapRing 1.05s ease-out infinite}
    .interaction-coach .coach-hand{fill:#fff8ef;stroke:#6c554c;stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round;animation:coachTapHand 1.05s ease-in-out infinite;transform-origin:20px 23px}
    .interaction-coach .coach-hold-dots{display:none}.interaction-coach .coach-hold-dot{fill:#fff;opacity:.8}
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

function actionKey(btn) {
  if (!btn || btn.classList.contains('hidden')) return null;
  const cs = getComputedStyle(btn);
  if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) <= 0.01) return null;
  return ACTION_KEYS[String(btn.textContent || '').trim().toUpperCase()] || null;
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
function placeAtWorld(root, S, target) {
  projectTmp.set(target.x, target.y || 1.15, target.z).project(S.camera);
  if (projectTmp.z < -1 || projectTmp.z > 1) return false;
  let x = (projectTmp.x * 0.5 + 0.5) * innerWidth;
  let y = (-projectTmp.y * 0.5 + 0.5) * innerHeight;
  x = Math.max(18, Math.min(innerWidth - 18, x));
  y = Math.max(18, Math.min(innerHeight - 52, y - 18));
  root.style.left = `${x}px`; root.style.top = `${y}px`;
  return true;
}

function d2(a, b) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }

function addEvidence(proven, evidence) {
  const step = Math.max(0, evidence?.intro?.step | 0);
  if (step >= 1) proven.add('move');
  if (step >= 2) proven.add('build');
  if (step >= 3) proven.add('pickup');
  if (step >= 4) proven.add('serve');
  if (step >= 5) proven.add('cash');
  if ((evidence?.stats?.served | 0) > 0) { proven.add('pickup'); proven.add('serve'); }
  if (Object.values(evidence?.staff || {}).some(n => (n | 0) > 0)) proven.add('hire');
  if (Object.values(evidence?.upgrades || evidence?.up || {}).some(n => Number(n) > 0)) proven.add('kiosk');
}

// Public pure normalizer: useful for migration tests and intentionally accepts both the shipped
// array form and a defensive object-of-booleans form. Unknown mechanics are discarded.
export function normalizeMechanicLearning(raw, evidence = null) {
  const proven = new Set();
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.v === MECHANIC_LEARNING_VERSION) {
    if (Array.isArray(raw.proven)) {
      for (const key of raw.proven) if (KNOWN_MECHANICS.has(key)) proven.add(key);
    } else if (raw.proven && typeof raw.proven === 'object' && !Array.isArray(raw.proven)) {
      for (const [key, value] of Object.entries(raw.proven)) if (value === true && KNOWN_MECHANICS.has(key)) proven.add(key);
    }
  }
  addEvidence(proven, evidence);
  return { v: MECHANIC_LEARNING_VERSION, proven: [...proven].sort() };
}

export function urgentCustomerNeed(G) {
  return !!(G?.customers || []).find(c => c && !c.done && c.state !== 'leave' && Number.isFinite(c.patience) && c.patience <= 4);
}

// Pure priority contract for Task 30. Contextual includes kiosk/staff/pantry/return affordances.
export function selectCoachPriority({ urgent = false, stock = false, construction = false, contextual = false } = {}) {
  if (urgent) return 'urgent';
  if (stock) return 'stock';
  if (construction) return 'construction';
  if (contextual) return 'contextual';
  return null;
}

// Exported pure detector so this first-use route can be unit tested without DOM/camera machinery.
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
    if (!best || dist < best.dist) best = { key, supply, label, stationId: st.id, x: st.front.x, y: st.type === 'bowl' ? .9 : 1.3, z: st.front.z, dist };
  }
  return best;
}

function pantryStation(G) {
  if (!G || !G.world) return null;
  for (const st of G.world.stations.values()) if (st.active && st.type === 'pantry') return st;
  return null;
}
function pantryChoiceButton(supply) {
  const sheet = [...document.querySelectorAll('.sheet')].find(el => el.querySelector('.stitle')?.textContent.trim().toUpperCase() === 'PANTRY');
  if (!sheet) return null;
  const wanted = supply === 'beans' ? 'BEANS' : 'KIBBLE';
  return [...sheet.querySelectorAll('.sbtn.buy')].find(b => String(b.textContent || '').trim().toUpperCase().includes(wanted)) || null;
}

function holdTarget(G, suppressed) {
  if (!G || !G.world || !G.P || !G.carry) return null;
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

export function createInteractionCoach(G = null, S = null) {
  injectStyle();
  const root = document.createElement('div'); root.className = 'interaction-coach hidden'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<svg viewBox="0 0 38 38" aria-hidden="true"><g class="coach-hold-dots"><circle class="coach-hold-dot" cx="13" cy="5" r="1.4"/><circle class="coach-hold-dot" cx="19" cy="5" r="1.4"/><circle class="coach-hold-dot" cx="25" cy="5" r="1.4"/></g><circle class="coach-ring" cx="19" cy="19" r="10"/><path class="coach-hand" d="M17.2 26.8v-12c0-2.5 3.6-2.5 3.6 0v6.2-3.4c0-2.2 3.2-2.2 3.2 0v3.8-2.6c0-2 3-2 3 0v3.4-1.8c0-1.9 2.9-1.9 2.9 0v5.4c0 5-3.2 8.1-7.8 8.1h-1.3c-2.9 0-5.1-1.2-6.9-3.7l-2.4-3.4c-1.4-2.1 1.7-4 3.1-2.1l2.6 3.1z"/></svg><div class="coach-caption"></div>`;
  document.body.appendChild(root);
  const caption = root.querySelector('.coach-caption');

  const proven = new Set();
  const shown = new Set();
  const failures = new Map();
  let currentKey = null, candidateKey = null, candidateT = 0, activeHold = null, activeHoldSnap = null;

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
    if (!KNOWN_MECHANICS.has(key) || !proven.has(key)) return 0;
    const n = Math.min(REFRESH_AFTER_FAILURES, (failures.get(key) || 0) + 1);
    failures.set(key, n);
    return n;
  }

  function setCaption(text = '') { caption.textContent = text; root.classList.toggle('has-caption', !!text); }
  function resetCandidate() { candidateKey = null; candidateT = 0; activeHold = null; activeHoldSnap = null; }
  function hide() {
    root.classList.add('hidden'); root.classList.remove('hold-mode'); root.dataset.mode = ''; setCaption(''); currentKey = null;
    if (G) G.coachCueVisible = false;
  }
  function reveal(key) { shown.add(key); if (G) G.coachCueVisible = true; root.classList.remove('hidden'); }
  function mark(key) {
    if (!key || !KNOWN_MECHANICS.has(key)) return;
    proven.add(key); failures.delete(key); resetCandidate(); hide();
  }

  // Feature-owned persistence wrapper. The canonical save validator may ignore fields it does not
  // own; this coach deliberately preserves/loads its small payload at the game boundary without
  // changing unrelated save-schema semantics. The wrapper is installed before platform restore.
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
  // Fresh sessions still inherit proof from already-demonstrated intro/runtime evidence.
  restoreLearning(null);

  // Capture the action while its label still exists; station click handlers hide/relabel the button.
  const onAction = e => {
    const btn = e.target && e.target.closest && e.target.closest('.fbtn');
    if (!btn) return;
    mark(actionKey(btn));
  };
  document.addEventListener('click', onAction, true);

  function showTap(btn, key, text, dt, dwell = TAP_DWELL) {
    const candidate = `tap:${key}:${text || ''}`;
    if (candidate !== candidateKey) { candidateKey = candidate; candidateT = 0; activeHold = null; activeHoldSnap = null; hide(); return true; }
    candidateT += Math.max(0, dt);
    if (candidateT < dwell) { hide(); return true; }
    currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'tap'; setCaption(text); placeBeside(root, btn); reveal(key); return true;
  }

  function showRoute(target, key, text, dt) {
    const candidate = `route:${key}:${target.stationId || target.id}:${text}`;
    if (candidate !== candidateKey) { candidateKey = candidate; candidateT = 0; activeHold = null; activeHoldSnap = null; hide(); return true; }
    candidateT += Math.max(0, dt);
    if (candidateT < 0.4 || !placeAtWorld(root, S, target)) { hide(); return true; }
    currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'route'; setCaption(text); reveal(key); return true;
  }

  const coach = {
    update(dt = 0) {
      if (activeHold && holdCompleted(G, activeHold, activeHoldSnap)) mark(activeHold.key);

      // Highest class belongs to the world objective: a guest at <=4s patience must never compete
      // with a construction/kiosk/refill hint. objective.js remains visible while the hand hides.
      if (urgentCustomerNeed(G)) { resetCandidate(); hide(); return; }

      const suppressed = suppressionSet();
      // Stock recovery is the highest interaction-hand class. It may temporarily replace the
      // objective arrow; G.coachCueVisible tells objective.js which surface currently owns the cue.
      const lesson = refillLessonNeed(G, suppressed);
      if (lesson && G && S) {
        const choice = pantryChoiceButton(lesson.supply);
        if (choice) { showTap(choice, lesson.key, `PICK ${lesson.supply}`, dt, LESSON_TAP_DWELL); return; }
        if (overlayOpen()) { resetCandidate(); hide(); return; }
        const carryingRightSupply = G.carry.sack === lesson.supply && (G.carry.sackLeft | 0) > 0;
        if (!carryingRightSupply) {
          const pantry = pantryStation(G);
          const btn = document.querySelector('.fbtn');
          if (pantry && btn && actionKey(btn) === 'pantry' && G.P && d2(G.P, pantry.front) < HOLD_RADIUS * HOLD_RADIUS) {
            showTap(btn, lesson.key, 'OPEN SUPPLIES', dt, LESSON_TAP_DWELL); return;
          }
          if (pantry) { showRoute({ ...pantry.front, stationId: pantry.id, y: 1.15 }, lesson.key, `GET ${lesson.supply}`, dt); return; }
        } else if (G.P && d2(G.P, { x: lesson.x, z: lesson.z }) > HOLD_RADIUS * HOLD_RADIUS) {
          showRoute(lesson, lesson.key, `RETURN TO ${lesson.label}`, dt); return;
        }
      } else if (overlayOpen()) { resetCandidate(); hide(); return; }

      // If the world objective currently owns a stock or build problem, that outranks contextual
      // kiosk/staff/pantry prompts. Refill lesson above is the sole exception because it replaces
      // the arrow with a richer first-use route rather than adding another concurrent cue.
      const objectiveKind = G?.objectiveCueKind || null;
      const objectiveStock = objectiveKind === 'restock' || objectiveKind === 'refill' || objectiveKind === 'supplies' || objectiveKind === 'stock';
      if (objectiveStock || objectiveKind === 'build') { resetCandidate(); hide(); return; }

      const btn = document.querySelector('.fbtn');
      const tapKey = actionKey(btn);
      if (tapKey && !shouldSuppress(tapKey)) {
        if (showTap(btn, tapKey, '', dt)) return;
      }

      const hold = G && S ? holdTarget(G, suppressed) : null;
      if (!hold) { resetCandidate(); hide(); return; }
      const candidate = `hold:${hold.key}:${hold.stationId}`;
      if (candidate !== candidateKey) {
        candidateKey = candidate; candidateT = 0; activeHold = hold; activeHoldSnap = snapshotHold(G, hold); hide(); return;
      }
      activeHold = hold;
      candidateT += Math.max(0, dt);
      if (candidateT < 0.08) { hide(); return; }
      if (!placeAtWorld(root, S, hold)) { hide(); return; }
      currentKey = hold.key; root.classList.add('hold-mode'); root.dataset.mode = 'hold';
      setCaption(hold.key === 'refillCoffee' || hold.key === 'refillBowl' ? 'HOLD TO REFILL' : 'STAY HERE');
      reveal(hold.key);
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
      return selectCoachPriority({ urgent: urgentCustomerNeed(G), stock, construction, contextual: !!actionKey(document.querySelector('.fbtn')) });
    },
    hide,
    destroy() { document.removeEventListener('click', onAction, true); hide(); root.remove(); },
  };
  if (G) G.interactionCoach = coach;
  return coach;
}
