// Pure build-intent gate. Walking across a build footprint must never spend coins.
export const BUILD_ARM_SECONDS = 0.55;
export const BUILD_MAX_SPEED = 0.45;

export function insideBuildFootprint(p, zone, fw, fd, rot = 0, margin = 0.12) {
  const dx = p.x - zone.x, dz = p.z - zone.z;
  const s = Math.sin(rot), c = Math.cos(rot);
  // Inverse-rotate the player into the zone's local right/forward axes.
  const right = dx * c - dz * s;
  const forward = dx * s + dz * c;
  return Math.abs(right) <= fw / 2 + margin && Math.abs(forward) <= fd / 2 + margin;
}

export function stepBuildIntent(state, inside, speed, dt) {
  const s = state || { t: 0 };
  if (!inside || speed > BUILD_MAX_SPEED) s.t = 0;
  else s.t = Math.min(BUILD_ARM_SECONDS, s.t + Math.max(0, dt));
  return {
    state: s,
    armed: s.t >= BUILD_ARM_SECONDS,
    progress: BUILD_ARM_SECONDS ? s.t / BUILD_ARM_SECONDS : 1,
  };
}
