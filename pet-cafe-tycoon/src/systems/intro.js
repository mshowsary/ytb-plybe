// src/systems/intro.js — scripted first-minute onboarding.
// A fresh game walks the owner through five short steps — bake, stock, serve, collect, build —
// each using the world-space objective arrow. The old persistent SKIP pill was deliberately removed:
// it sat in the middle of Day 1 after the player had already learned the controls and looked like
// leftover debug/tutorial UI. The sequence is short, non-modal, and completes itself through play.
import { jobTarget } from '../sim/jobs.js';
import { refillGuideTarget } from '../sim/refillGuide.js';

function stationTarget(st, kind) {
  return st ? { x: st.x, z: st.z, kind } : null;
}

export function introBuildGuidance(G, world) {
  const z = world && world.area && world.area.zones && world.area.zones[0];
  if (!z) return null;
  const paid = Math.max(0, Number(world.partial && world.partial[z.id]) || 0);
  const remaining = Math.max(0, z.price - paid);
  const coins = Math.max(0, Number(G && G.coins) || 0);
  if (remaining <= coins) return { x: z.x, z: z.z, kind: 'build', remaining };

  // Do not strand a literal-following beginner on a 90-coin outline after the first small payout.
  // Prefer a genuine currently pending job; if nothing is urgent between customer waves, point back
  // through the production loop so the player naturally earns the missing build contribution.
  let next = jobTarget(world, G);
  if (next && next.kind === 'refill') next = refillGuideTarget(world, G) || next;
  if (next && next.kind !== 'build') return { ...next, remaining };

  const register = world.stations.get('register1');
  if (register && register.active && (register.money || register.cashAmount || 0) > 0 && register.cash) {
    return { x: register.cash.x, z: register.cash.z, kind: 'collect', remaining };
  }

  const held = G && G.owner && Array.isArray(G.owner.items) ? G.owner.items : [];
  const hasCookie = held.some(m => m && m.userData && (m.userData.product === 'cookie' || m.userData.product === 'brownie'));
  const display = world.stations.get('dispCookie');
  if (hasCookie && display && display.active) return { x: display.x, z: display.z, kind: 'stock', remaining };

  const oven = world.stations.get('oven1');
  if (oven && oven.active) return { x: oven.x, z: oven.z, kind: 'bake', remaining };
  return null;
}

export function createIntro(G, S, ctx) {
  const { world, owner, fx } = ctx;

  function stepTarget(step) {
    if (step === 0) return stationTarget(world.stations.get('oven1'), 'bake');
    if (step === 1) return stationTarget(world.stations.get('dispCookie'), 'stock');
    if (step === 2) return stationTarget(world.stations.get('register1'), 'serve');
    if (step === 3) { const st = world.stations.get('register1'); return st && st.cash ? { x: st.cash.x, z: st.cash.z, kind: 'collect' } : null; }
    if (step === 4) return introBuildGuidance(G, world);
    return null;
  }

  function stepDone(step) {
    if (step === 0) return owner.items.some(m => m.userData.product === 'cookie');
    if (step === 1) { const st = world.stations.get('dispCookie'); return !!(st && st.stock >= 1); }
    if (step === 2) { for (const e of world.events) if (e.type === 'processed') return true; return false; }
    if (step === 3) return (G.coins || 0) > 0;
    if (step === 4) { const z = world.area.zones[0]; return !!(z && world.built.has(z.id)); }
    return true;
  }

  function celebrateStep(step) {
    const target = stepTarget(step);
    if (target && fx) fx.burst(target.x, 1.05, target.z, step === 4 ? '#7FD69A' : '#FFD36A', step === 4 ? 10 : 6);
    if (ctx.audio) ctx.audio.play(step === 4 ? 'chime' : 'ding');
  }

  return {
    update() {
      if (G.intro.step === undefined) { G.intro.step = 0; G.intro.active = true; }
      let step = G.intro.step;
      if (step < 5 && stepDone(step)) {
        celebrateStep(step);
        step += 1;
      }
      G.intro.step = step;
      G.intro.active = step < 5;
      G.intro.target = G.intro.active ? stepTarget(step) : null;
    },
  };
}
