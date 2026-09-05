// Low-noise first-use coaching for explicit and proximity/dwell station actions. The coach is
// deliberately visual rather than another tutorial wall: explicit buttons get a small tap hand;
// harvest/refill/blend interactions get the same hand with a slower "stay here" pulse. Coffee and
// pet-bowl refills additionally get ONE complete route lesson: empty -> Pantry -> correct supply ->
// return to station -> hold to refill. Once completed, that lesson never appears again this session.
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
// Ordinary station buttons should never flash while the player is simply crossing their trigger.
// The complete refill lesson is already highly contextual (the machine is actually empty), so its
// Pantry taps can remain a little more responsive without making every kiosk/staff/return button
// feel tutorial-heavy.
const TAP_DWELL = 0.35;
const LESSON_TAP_DWELL = 0.22;

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

// Exported pure detector so this first-use route can be unit tested without DOM/camera machinery.
export function refillLessonNeed(G, seen = new Set()) {
  if (!G || !G.world || !G.carry) return null;
  let best = null;
  for (const st of G.world.stations.values()) {
    if (!st.active || !st.front) continue;
    let key = null, supply = null, label = null;
    if (st.type === 'coffee' && !seen.has('refillCoffee') && (st.beans | 0) <= 0) {
      key = 'refillCoffee'; supply = 'beans'; label = 'COFFEE';
    } else if (st.type === 'bowl' && !seen.has('refillBowl') && (st.stock | 0) <= 0) {
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

function holdTarget(G, seen) {
  if (!G || !G.world || !G.P || !G.carry) return null;
  let best = null;
  const cap = carryCap(G.up || {});
  for (const st of G.world.stations.values()) {
    if (!st.active || !st.front || d2(G.P, st.front) > HOLD_RADIUS * HOLD_RADIUS) continue;
    let key = null, y = 1.15;
    if (st.type === 'coffee' && !seen.has('refillCoffee') && G.carry.sack === 'beans' && G.carry.sackLeft > 0 && st.beans < 20) {
      key = 'refillCoffee'; y = 1.3;
    } else if (st.type === 'blender' && !seen.has('blend') && G.carry.fruit > 0 && st.fruit < 9) {
      key = 'blend'; y = 1.25;
    } else if (st.type === 'bowl' && !seen.has('refillBowl') && G.carry.sack === 'kibble' && G.carry.sackLeft > 0 && st.stock < st.capacity) {
      key = 'refillBowl'; y = .9;
    } else if (st.type === 'bush' && !seen.has('harvest') && st.stage === 3 && !G.carry.sack && (G.owner?.items?.length || 0) === 0 && G.carry.fruit < cap) {
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

  const seen = new Set();
  let currentKey = null, candidateKey = null, candidateT = 0, activeHold = null, activeHoldSnap = null;

  function setCaption(text = '') { caption.textContent = text; root.classList.toggle('has-caption', !!text); }
  function resetCandidate() { candidateKey = null; candidateT = 0; activeHold = null; activeHoldSnap = null; }
  function hide() { root.classList.add('hidden'); root.classList.remove('hold-mode'); root.dataset.mode = ''; setCaption(''); currentKey = null; }
  function mark(key) { if (!key) return; seen.add(key); resetCandidate(); hide(); }

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
    currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'tap'; setCaption(text); placeBeside(root, btn); root.classList.remove('hidden'); return true;
  }

  function showRoute(target, key, text, dt) {
    const candidate = `route:${key}:${target.stationId || target.id}:${text}`;
    if (candidate !== candidateKey) { candidateKey = candidate; candidateT = 0; activeHold = null; activeHoldSnap = null; hide(); return true; }
    candidateT += Math.max(0, dt);
    if (candidateT < 0.4 || !placeAtWorld(root, S, target)) { hide(); return true; }
    currentKey = key; root.classList.remove('hold-mode'); root.dataset.mode = 'route'; setCaption(text); root.classList.remove('hidden'); return true;
  }

  return {
    update(dt = 0) {
      if (activeHold && holdCompleted(G, activeHold, activeHoldSnap)) mark(activeHold.key);

      // Full refill lesson gets priority because it spans an overlay (Pantry sheet) by design.
      const lesson = refillLessonNeed(G, seen);
      if (lesson && G && S) {
        const choice = pantryChoiceButton(lesson.supply);
        if (choice) {
          showTap(choice, lesson.key, `PICK ${lesson.supply}`, dt, LESSON_TAP_DWELL); return;
        }
        // Any unrelated sheet still suppresses coaching; only the Pantry choice is coachable over UI.
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
        // Correct supply + at destination falls through to the existing hold gesture below.
      } else if (overlayOpen()) { resetCandidate(); hide(); return; }

      const btn = document.querySelector('.fbtn');
      const tapKey = actionKey(btn);
      if (tapKey && !seen.has(tapKey)) {
        if (showTap(btn, tapKey, '', dt)) return;
      }

      const hold = G && S ? holdTarget(G, seen) : null;
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
      root.classList.remove('hidden');
    },
    mark,
    hasSeen(key) { return seen.has(key); },
    hide,
    destroy() { document.removeEventListener('click', onAction, true); root.remove(); },
  };
}
