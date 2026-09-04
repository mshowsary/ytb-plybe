// Low-noise first-use coaching for explicit station actions. This is deliberately visual rather
// than another tutorial sentence: a small translucent hand appears beside the existing 48px action
// button after the player lingers near an unfamiliar station, then disappears for the session once
// that action is used.
const STYLE_ID = 'pet-cafe-interaction-coach-style';
const ACTION_KEYS = {
  RETURN: 'return',
  UPGRADES: 'kiosk',
  STAFF: 'hire',
  SUPPLIES: 'pantry',
};

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .interaction-coach{position:fixed;left:0;top:0;width:38px;height:38px;z-index:24;pointer-events:none;transform:translate(-50%,-50%);opacity:.72;filter:drop-shadow(0 3px 5px #0003);transition:opacity .16s ease,transform .16s ease}
    .interaction-coach.hidden{display:none}.interaction-coach svg{width:100%;height:100%;overflow:visible;display:block}
    .interaction-coach .coach-ring{fill:none;stroke:#fff;stroke-width:2.3;opacity:.82;transform-origin:19px 19px;animation:coachTapRing 1.05s ease-out infinite}
    .interaction-coach .coach-hand{fill:#fff8ef;stroke:#6c554c;stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round;animation:coachTapHand 1.05s ease-in-out infinite;transform-origin:20px 23px}
    @keyframes coachTapRing{0%{transform:scale(.55);opacity:.9}70%,100%{transform:scale(1.25);opacity:0}}
    @keyframes coachTapHand{0%,100%{transform:translateY(1px) scale(.98)}45%{transform:translateY(-2px) scale(1.03)}}
    body.game-paused .interaction-coach,body.host-paused .interaction-coach,body.meta-summary-open .interaction-coach{display:none!important}
    @media(max-width:200px){.interaction-coach{width:32px;height:32px;opacity:.66}}
    @media(prefers-reduced-motion:reduce){.interaction-coach .coach-ring,.interaction-coach .coach-hand{animation:none!important}.interaction-coach .coach-ring{opacity:.58;transform:scale(.82)}}
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
  y = Math.max(18, Math.min(innerHeight - 18, y));
  root.style.left = `${x}px`; root.style.top = `${y}px`;
}

export function createInteractionCoach() {
  injectStyle();
  const root = document.createElement('div'); root.className = 'interaction-coach hidden'; root.setAttribute('aria-hidden', 'true');
  // Original minimal pointer silhouette: no platform emoji/font dependency.
  root.innerHTML = `<svg viewBox="0 0 38 38" aria-hidden="true"><circle class="coach-ring" cx="19" cy="19" r="10"/><path class="coach-hand" d="M17.2 26.8v-12c0-2.5 3.6-2.5 3.6 0v6.2-3.4c0-2.2 3.2-2.2 3.2 0v3.8-2.6c0-2 3-2 3 0v3.4-1.8c0-1.9 2.9-1.9 2.9 0v5.4c0 5-3.2 8.1-7.8 8.1h-1.3c-2.9 0-5.1-1.2-6.9-3.7l-2.4-3.4c-1.4-2.1 1.7-4 3.1-2.1l2.6 3.1z"/></svg>`;
  document.body.appendChild(root);

  const seen = new Set();
  let currentKey = null, candidateKey = null, candidateT = 0;

  function hide() { root.classList.add('hidden'); currentKey = null; }
  function mark(key) { if (!key) return; seen.add(key); if (currentKey === key) hide(); }

  // Capture the action while its label still exists; station click handlers hide/relabel the button.
  const onAction = e => {
    const btn = e.target && e.target.closest && e.target.closest('.fbtn');
    if (!btn) return;
    mark(actionKey(btn));
  };
  document.addEventListener('click', onAction, true);

  return {
    update(dt = 0) {
      const btn = document.querySelector('.fbtn');
      const key = !overlayOpen() ? actionKey(btn) : null;
      if (!key || seen.has(key)) {
        candidateKey = null; candidateT = 0; hide(); return;
      }
      if (key !== candidateKey) { candidateKey = key; candidateT = 0; hide(); return; }
      candidateT += Math.max(0, dt);
      // A short dwell prevents the coach from flashing while merely crossing a station trigger.
      if (candidateT < 0.35) { hide(); return; }
      currentKey = key; placeBeside(root, btn); root.classList.remove('hidden');
    },
    mark,
    hasSeen(key) { return seen.has(key); },
    hide,
    destroy() { document.removeEventListener('click', onAction, true); root.remove(); },
  };
}
