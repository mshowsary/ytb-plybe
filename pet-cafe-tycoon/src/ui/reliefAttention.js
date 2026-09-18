// A short, one-shot attention beat for a newly surfaced rewarded Rush Help offer: the pill scales in
// once with a soft glow. Presentation only.
//
// It used to also slow the whole simulation to 0.55x for 1.2 real seconds whenever an offer appeared,
// "so an overwhelmed player can notice the help". Bending game time to put a rewarded-ad prompt in
// front of someone mid-rush reads as a stutter on a phone and, once noticed, as the game working an
// angle on the player. The beat alone is enough to be seen, and the offer already waits until the
// player has stood still for five seconds (systems/economyExperience.js). (2026-09-17.)
//
// `reliefAttentionScale` stays exported, always 1, so nothing that reads it can slow the café again.
export const RELIEF_ATTENTION_SECONDS = 0.85;

export function reliefAttentionScale() {
  return 1;
}

function installStyle() {
  if (typeof document === 'undefined' || document.getElementById('pet-cafe-relief-attention-style')) return;
  const s = document.createElement('style'); s.id = 'pet-cafe-relief-attention-style';
  s.textContent = `
    .relief-root.attention-beat .relief-pill,.relief-root.attention-beat .relief-card{animation:relief-attention-beat .72s cubic-bezier(.2,.8,.2,1) 1;box-shadow:0 10px 34px #8b7cf655,0 0 0 3px #fff5}
    @keyframes relief-attention-beat{0%{transform:scale(.96)}45%{transform:scale(1.035)}100%{transform:scale(1)}}
    @media(prefers-reduced-motion:reduce){.relief-root.attention-beat .relief-pill,.relief-root.attention-beat .relief-card{animation:none}}
  `;
  document.head.appendChild(s);
}

export function installReliefAttention(G) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return { destroy() {}, get active() { return false; } };
  installStyle();
  const root = document.querySelector('.relief-root');
  if (!root) return { destroy() {}, get active() { return false; } };
  // Once per offer per day, keyed by what the pill says, exactly as before.
  const seen = new Set();
  let day = (G && G.dayState && G.dayState.day) || 1;
  let visibleBefore = !root.classList.contains('hidden');
  let beatTimer = 0, beating = false;

  function signature() {
    const label = root.querySelector('.relief-pill-label');
    return `${day}:${(label && label.textContent) || root.textContent || 'relief'}`;
  }
  function trigger() {
    const nowDay = (G && G.dayState && G.dayState.day) || day;
    if (nowDay !== day) { day = nowDay; seen.clear(); }
    const key = signature();
    if (seen.has(key)) return;
    seen.add(key);
    beating = true;
    root.classList.add('attention-beat');
    if (beatTimer) clearTimeout(beatTimer);
    beatTimer = setTimeout(() => { root.classList.remove('attention-beat'); beating = false; }, RELIEF_ATTENTION_SECONDS * 1000);
  }
  const observer = new MutationObserver(() => {
    const visible = !root.classList.contains('hidden');
    if (visible && !visibleBefore) trigger();
    visibleBefore = visible;
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });

  return {
    get active() { return beating; },
    destroy() {
      observer.disconnect();
      if (beatTimer) clearTimeout(beatTimer);
      root.classList.remove('attention-beat');
    },
  };
}
