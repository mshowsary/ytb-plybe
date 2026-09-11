// Caps render-side position changes without altering simulation/navigation state.
// Normal movement below maxSpeed is copied exactly; discontinuities (e.g. a navigation rescue)
// are caught up over several frames so visible characters never appear to teleport.
export function cappedVisualStep(x, z, targetX, targetZ, maxSpeed, dt) {
  const dx = targetX - x, dz = targetZ - z;
  const d = Math.hypot(dx, dz);
  if (d <= 1e-6) return { x: targetX, z: targetZ, speed: 0, lag: 0 };
  const maxStep = Math.max(0, maxSpeed) * Math.max(0, dt);
  if (d <= maxStep || maxStep <= 0) {
    return maxStep <= 0
      ? { x, z, speed: 0, lag: d }
      : { x: targetX, z: targetZ, speed: d / Math.max(dt, 1e-6), lag: 0 };
  }
  const t = maxStep / d;
  return {
    x: x + dx * t,
    z: z + dz * t,
    speed: maxSpeed,
    lag: d - maxStep,
  };
}
