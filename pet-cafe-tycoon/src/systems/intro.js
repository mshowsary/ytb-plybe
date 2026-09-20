// src/systems/intro.js — the FIRST MINUTE, and the host of First Look.
//
// WHAT WAS HERE. Five scripted steps: bake, stock, serve, collect, build. Step 3 (collect) completed
// instantly, because cash auto-collects from the serving spot, and step 4 ("build the Tables plot,
// 90 coins") ran from 13 s to 97 s of day 1 — introBuildGuidance chained bake → stock → serve → cash
// targets for as long as the player was short of 90 coins, and systems/objective.js forced a full
// walkthrough (floor trail + beacon + stand ring + edge arrow + caption) for every one of them. That
// is why the research run measured the trail on screen for 25% of day 1 and the beacon for 36%, with
// the whole production loop replayed three times before the player was allowed to buy anything. Then
// the intro ENDED without marking any of it learned, so systems/objective.js immediately re-taught
// "serve at the register" (98 s), "restock the display" (119 s) and "build here" (211 s) as fresh
// first-time walkthroughs. (research/onboarding, fresh save at 380x670, 2026-09-19.)
//
// WHAT IS HERE NOW. Three steps and nothing else: bake → stock → serve, about twenty-five seconds,
// each one a real thing the player does with the objective arrow pointing at it. Every step MARKS
// WHAT IT TAUGHT the moment it completes (sim/mechanicLearning.js's proven set, the same set the
// interaction coach reads), so nothing re-teaches it minutes later. Collecting the cash is not a
// step because it is not an action. Building is not a step because it is not an errand: First Look
// opens the build lesson the first time a plot is genuinely affordable, which is an invitation
// rather than a chain of chores standing between the player and their first purchase.
//
// The step NUMBERS are unchanged where they matter: `G.intro.step` still counts 0, 1, 2 and still
// finishes at 5, which is what sim/saveSchema.js clamps, what systems/customers.js reads to cap the
// opening crowd, and what ~20 headless tools set to skip the opening.
//
// This module is also where First Look is constructed and stepped — one guidance lane, created and
// driven from the one system game.js already creates and steps for the opening lesson, so there is
// exactly one place in the frame where teaching happens.
import { createFirstLook } from './firstLook.js';

const STEP_BAKE = 0, STEP_STOCK = 1, STEP_SERVE = 2, STEP_DONE = 5;

// What each step proves, in the coach's stable mechanic IDs. Marking here is the whole fix for
// "the intro never marks what it taught as learned": a step is not finished until the game knows
// the player has done it.
const STEP_PROVES = {
  [STEP_BAKE]: ['move', 'pickup'],
  [STEP_STOCK]: ['pickup', 'deliver'],
  [STEP_SERVE]: ['serve', 'cash'],
};

function stationTarget(st, kind) {
  return st ? { x: st.x, z: st.z, kind } : null;
}

export function createIntro(G, S, ctx) {
  const { world, owner, fx } = ctx;
  const firstLook = createFirstLook(G, S, ctx);

  function stepTarget(step) {
    if (step === STEP_BAKE) return stationTarget(world.stations.get('oven1'), 'bake');
    if (step === STEP_STOCK) return stationTarget(world.stations.get('dispCookie'), 'stock');
    if (step === STEP_SERVE) return stationTarget(world.stations.get('register1'), 'serve');
    return null;
  }

  function stepDone(step) {
    if (step === STEP_BAKE) return owner.items.some(m => m.userData.product === 'cookie');
    if (step === STEP_STOCK) { const st = world.stations.get('dispCookie'); return !!(st && st.stock >= 1); }
    if (step === STEP_SERVE) { for (const e of world.events) if (e.type === 'processed') return true; return false; }
    return true;
  }

  function celebrateStep(step) {
    const target = stepTarget(step);
    const last = step === STEP_SERVE;
    if (target && fx) fx.burst(target.x, 1.05, target.z, last ? '#7FD69A' : '#FFD36A', last ? 10 : 6);
    if (ctx.audio) ctx.audio.play(last ? 'chime' : 'ding');
  }

  function markStep(step) {
    if (typeof G.markMechanic !== 'function') return;
    for (const key of STEP_PROVES[step] || []) G.markMechanic(key);
  }

  return {
    firstLook,
    update(dt) {
      if (G.intro.step === undefined) { G.intro.step = 0; G.intro.active = true; }
      let step = G.intro.step;
      if (step < STEP_DONE) {
        // A save written by the five-step opening can be sitting on the collect or build step. Both
        // are gone, and both were already past the three things this teaches, so it lands on done.
        if (step > STEP_SERVE) step = STEP_DONE;
        else if (stepDone(step)) {
          celebrateStep(step);
          markStep(step);
          step = step === STEP_SERVE ? STEP_DONE : step + 1;
        }
      }
      G.intro.step = step;
      G.intro.active = step < STEP_DONE;
      G.intro.target = G.intro.active ? stepTarget(step) : null;
      // After the opening, in the same frame, so the two lanes can never both own the screen.
      firstLook.update(dt);
    },
  };
}
