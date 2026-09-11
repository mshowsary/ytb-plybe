// Task 32 presentation contract. Kept pure so timing can be certified without a renderer.
export const BUILD_ANTICIPATION_SECONDS = 0.15;
export const BUILD_REVEAL_SECONDS = 0.35;
export const BUILD_SETTLE_SECONDS = 0.20;
export const BUILD_REVEAL_TOTAL_SECONDS = BUILD_ANTICIPATION_SECONDS + BUILD_REVEAL_SECONDS + BUILD_SETTLE_SECONDS;

const clamp01 = n => Math.max(0, Math.min(1, n));
const easeOutCubic = t => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = t => {
  const x = clamp01(t);
  return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};

export function buildRevealPhase(elapsed) {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (t < BUILD_ANTICIPATION_SECONDS) return 'anticipation';
  if (t < BUILD_ANTICIPATION_SECONDS + BUILD_REVEAL_SECONDS) return 'reveal';
  if (t < BUILD_REVEAL_TOTAL_SECONDS) return 'settle';
  return 'done';
}

export function buildRevealScale(elapsed, reducedMotion = false) {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const phase = buildRevealPhase(t);
  if (phase === 'anticipation') return 0;
  if (reducedMotion) return 1;
  if (phase === 'reveal') {
    const p = (t - BUILD_ANTICIPATION_SECONDS) / BUILD_REVEAL_SECONDS;
    // Quick readable materialization with a restrained premium overshoot.
    return 0.04 + easeOutCubic(p) * 1.04;
  }
  if (phase === 'settle') {
    const p = (t - BUILD_ANTICIPATION_SECONDS - BUILD_REVEAL_SECONDS) / BUILD_SETTLE_SECONDS;
    return 1.08 - easeInOut(p) * 0.08;
  }
  return 1;
}
