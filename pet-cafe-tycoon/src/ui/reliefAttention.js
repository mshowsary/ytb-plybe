// A short, one-shot attention beat for newly surfaced contextual Rush Help.
// It never pauses gameplay and never changes ad eligibility/rewards: it merely slows simulation
// for ~1.2 real seconds so an overwhelmed player can notice the already-earned help surface.
export const RELIEF_ATTENTION_SECONDS = 1.2;
export const RELIEF_ATTENTION_SCALE = 0.55;

export function reliefAttentionScale(remainingSeconds, reducedMotion = false) {
  return !reducedMotion && remainingSeconds > 0 ? RELIEF_ATTENTION_SCALE : 1;
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
  if (!G || typeof G.update !== 'function' || typeof document === 'undefined') return { destroy() {}, get active() { return false; } };
  installStyle();
  const root = document.querySelector('.relief-root');
  if (!root) return { destroy() {}, get active() { return false; } };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const baseUpdate = G.update;
  const seen = new Set();
  let remaining = 0;
  let visibleBefore = !root.classList.contains('hidden');
  let day = G.dayState && G.dayState.day || 1;
  let beatTimer = 0;

  function signature() {
    const title = root.querySelector('.relief-pill-title');
    return `${day}:${title && title.textContent || root.textContent || 'relief'}`;
  }
  function trigger() {
    const key = signature();
    if (seen.has(key)) return;
    seen.add(key);
    remaining = reducedMotion ? 0 : RELIEF_ATTENTION_SECONDS;
    root.classList.add('attention-beat');
    if (beatTimer) clearTimeout(beatTimer);
    beatTimer = setTimeout(() => root.classList.remove('attention-beat'), 850);
  }

  const wrappedUpdate = function reliefAttentionUpdate(dt) {
    const realDt = Math.max(0, Number(dt) || 0);
    const scale = reliefAttentionScale(remaining, reducedMotion);
    G.presentationTimeScale = scale;
    const result = baseUpdate(realDt * scale);
    remaining = Math.max(0, remaining - realDt);

    const nowDay = G.dayState && G.dayState.day || day;
    if (nowDay !== day) { day = nowDay; seen.clear(); remaining = 0; }
    const visible = !root.classList.contains('hidden');
    if (visible && !visibleBefore) trigger();
    visibleBefore = visible;
    return result;
  };
  G.update = wrappedUpdate;

  return {
    get active() { return remaining > 0; },
    destroy() {
      if (beatTimer) clearTimeout(beatTimer);
      root.classList.remove('attention-beat');
      if (G.update === wrappedUpdate) G.update = baseUpdate;
      G.presentationTimeScale = 1;
    },
  };
}
