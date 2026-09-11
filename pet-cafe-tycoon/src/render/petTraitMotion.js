// Pure timing/pose policy for Task 35's three silent pet personality clips.
// Rendering applies these offsets after normal locomotion; this module never owns world position.
export const PET_TRAIT_CLIPS = Object.freeze({
  Marmalade: Object.freeze({ idleDelay: 1.05, duration: 1.65, cooldown: 6.4 }),
  Biscuit: Object.freeze({ idleDelay: 0.55, duration: 1.2, cooldown: 5.4 }),
  Snowdrop: Object.freeze({ idleDelay: 1.0, duration: 1.75, cooldown: 7.1 }),
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createPetTraitMotionState(seed = 0) {
  const stagger = Math.abs(Number(seed) || 0) % 0.9;
  return { name: null, idle: 0, elapsed: 0, cooldown: stagger, active: false };
}

export function petTraitContextActive(name, target, distance = Infinity) {
  if (!target || target.active === false || !PET_TRAIT_CLIPS[name]) return false;
  if (name === 'Biscuit') return Number.isFinite(distance) && distance <= 3.6;
  if (name === 'Marmalade') {
    // Warmth should have a visible cause: a live batch or ready bakery stock.
    return Number(target.timer) > 0 || Number(target.stock) > 0;
  }
  if (name === 'Snowdrop') {
    // The garden clip belongs to visible growth/ready produce, not an inert locked bush.
    return Number(target.stage) > 0;
  }
  return false;
}

export function stepPetTraitMotion(state, name, dt, {
  idle = false,
  context = false,
  reducedMotion = false,
} = {}) {
  const cfg = PET_TRAIT_CLIPS[name];
  const step = clamp(Number(dt) || 0, 0, 0.12);
  if (!cfg) {
    state.name = null; state.idle = 0; state.elapsed = 0; state.cooldown = 0; state.active = false;
    return { active: false, progress: 0, interrupted: false };
  }
  if (state.name !== name) {
    state.name = name; state.idle = 0; state.elapsed = 0; state.active = false;
    state.cooldown = Math.min(state.cooldown || 0, cfg.cooldown);
  }
  state.cooldown = Math.max(0, (state.cooldown || 0) - step);

  if (reducedMotion || !idle || !context) {
    const interrupted = !!state.active;
    state.idle = 0; state.elapsed = 0; state.active = false;
    // A movement interruption should not immediately restart the clip the instant the pet stops.
    if (interrupted && !reducedMotion) state.cooldown = Math.max(state.cooldown, 0.8);
    return { active: false, progress: 0, interrupted };
  }

  if (!state.active) {
    if (state.cooldown > 0) return { active: false, progress: 0, interrupted: false };
    state.idle += step;
    if (state.idle < cfg.idleDelay) return { active: false, progress: 0, interrupted: false };
    state.idle = 0; state.elapsed = 0; state.active = true;
  }

  state.elapsed += step;
  const progress = clamp(state.elapsed / cfg.duration, 0, 1);
  if (progress >= 1) {
    state.active = false; state.elapsed = 0; state.cooldown = cfg.cooldown;
    return { active: false, progress: 1, completed: true, interrupted: false };
  }
  return { active: true, progress, interrupted: false };
}

export function petTraitPose(name, progress, gaze = 0) {
  const p = clamp(Number(progress) || 0, 0, 1);
  const e = Math.sin(p * Math.PI) ** 2;
  const look = clamp(Number(gaze) || 0, -0.65, 0.65);
  if (name === 'Marmalade') {
    // Slow, contented lean toward bakery warmth; the tail deliberately quiets while focused.
    return {
      headY: look * 0.92 * e,
      headX: -0.17 * e,
      headZ: Math.sin(p * Math.PI) * 0.025 * e,
      tailY: null,
      tailScale: 1 - 0.72 * e,
      bodyZ: -0.014 * e,
    };
  }
  if (name === 'Biscuit') {
    // Social double-beat: eager gaze + asymmetric head cock + fast wag. The small forward/social
    // lean is centre-weighted so the greeting has a readable body silhouette, not only a tail cue.
    const tiltBeat = Math.sin(p * Math.PI * 2.1);
    return {
      headY: look * e,
      headX: -0.035 * e,
      headZ: tiltBeat * 0.2 * e,
      tailY: Math.sin(p * Math.PI * 9) * 0.92 * e,
      tailScale: 1,
      bodyZ: (0.022 + Math.sin(p * Math.PI * 4) * 0.014) * e,
    };
  }
  if (name === 'Snowdrop') {
    // Alert garden-watch scan: the garden target anchors the pose, but the slower searching sweep
    // is deliberately dominant so the bunny reads as surveying growth instead of merely gazing.
    const scan = Math.sin(p * Math.PI * 2.6) * 0.42;
    return {
      headY: clamp(look * 0.5 + scan, -0.65, 0.65) * e,
      headX: -0.085 * e,
      headZ: Math.sin(p * Math.PI * 1.3) * 0.035 * e,
      tailY: null,
      tailScale: 1,
      bodyZ: Math.sin(p * Math.PI) * 0.012 * e,
    };
  }
  return null;
}
