// src/systems/intro.js — scripted first-minute onboarding.
// A fresh game walks the owner through five short steps — bake, stock, serve, collect, build —
// each using the world-space objective arrow. The old persistent SKIP pill was deliberately removed:
// it sat in the middle of Day 1 after the player had already learned the controls and looked like
// leftover debug/tutorial UI. The sequence is short, non-modal, and completes itself through play.
export function createIntro(G, S, ctx) {
  const { world, owner, fx } = ctx;

  function stepTarget(step) {
    if (step === 0) { const st = world.stations.get('oven1'); return st ? { x: st.x, z: st.z, kind: 'bake' } : null; }
    if (step === 1) { const st = world.stations.get('dispCookie'); return st ? { x: st.x, z: st.z, kind: 'stock' } : null; }
    if (step === 2) { const st = world.stations.get('register1'); return st ? { x: st.x, z: st.z, kind: 'serve' } : null; }
    if (step === 3) { const st = world.stations.get('register1'); return st && st.cash ? { x: st.cash.x, z: st.cash.z, kind: 'collect' } : null; }
    if (step === 4) { const z = world.area.zones[0]; return z ? { x: z.x, z: z.z, kind: 'build' } : null; }
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
