export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
export const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = t => { t = clamp(t, 0, 1); const c = 1.70158, k = c + 1; return 1 + k * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export class Spring {
  constructor(value = 0, stiffness = 140, damping = 16) { this.value = value; this.target = value; this.vel = 0; this.k = stiffness; this.d = damping; }
  step(dt) { const a = (this.target - this.value) * this.k - this.vel * this.d; this.vel += a * dt; this.value += this.vel * dt; return this.value; }
  kick(v) { this.vel = v; }
  set(v) { this.value = this.target = v; this.vel = 0; }
}
