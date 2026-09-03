// src/systems/intro.js — Loop v2 Task 2: the scripted first-minute onboarding (design section 4,
// "Intro (first 60 s)"). On a fresh game (G.intro.step === undefined) starts at step 0 and walks
// the owner through five short steps — bake, stock, serve, collect, build — each with its own
// target station/zone and completion condition; step 5 is "done" (free play). While active,
// src/systems/objective.js reads G.intro.target/G.intro.active and forces the objective arrow to
// this step's target instead of the normal jobTarget() pick, with the caption showing the step's
// verb (CAPTION in objective.js). src/systems/customers.js reads G.intro.step to cap spawns at 2
// until step 3 (design: "spawns locked to 2 customers until step 3") so the café stays calm enough
// to actually demonstrate bake -> stock -> serve before a crowd shows up. A "SKIP" pill appears
// under the hint pill from step 3 onward (design: "skippable with a tap after step 3") — tapping it
// jumps straight to done.
export function createIntro(G, S, ctx) {
  const { world, owner } = ctx;

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button'; skipBtn.className = 'pill skipPill hidden'; skipBtn.textContent = 'SKIP';
  document.body.appendChild(skipBtn);
  skipBtn.addEventListener('click', () => {
    ctx.audio && ctx.audio.play('tap');
    G.intro.step = 5; G.intro.active = false; G.intro.target = null;
    skipBtn.classList.add('hidden');
  });

  function stepTarget(step) {
    if (step === 0) { const st = world.stations.get('oven1'); return st ? { x: st.x, z: st.z, kind: 'bake' } : null; }
    if (step === 1) { const st = world.stations.get('dispCookie'); return st ? { x: st.x, z: st.z, kind: 'stock' } : null; }
    if (step === 2) { const st = world.stations.get('register1'); return st ? { x: st.x, z: st.z, kind: 'serve' } : null; }
    if (step === 3) { const st = world.stations.get('register1'); return st && st.cash ? { x: st.cash.x, z: st.cash.z, kind: 'collect' } : null; }
    if (step === 4) { const z = world.area.zones[0]; return z ? { x: z.x, z: z.z, kind: 'build' } : null; }
    return null;
  }
  // Each step's own completion condition — read from live sim/render state, exactly what the arrow
  // is asking the player to go do.
  function stepDone(step) {
    if (step === 0) return owner.items.some(m => m.userData.product === 'cookie'); // holds >= 1 cookie
    if (step === 1) { const st = world.stations.get('dispCookie'); return !!(st && st.stock >= 1); }
    if (step === 2) { for (const e of world.events) if (e.type === 'processed') return true; return false; } // one register sale
    if (step === 3) return (G.coins || 0) > 0;
    if (step === 4) { const z = world.area.zones[0]; return !!(z && world.built.has(z.id)); }
    return true;
  }

  return {
    update() {
      if (G.intro.step === undefined) { G.intro.step = 0; G.intro.active = true; }
      let step = G.intro.step;
      if (step < 5 && stepDone(step)) step += 1;
      G.intro.step = step;
      G.intro.active = step < 5;
      G.intro.target = G.intro.active ? stepTarget(step) : null;
      skipBtn.classList.toggle('hidden', !(G.intro.active && step >= 3));
    },
  };
}
