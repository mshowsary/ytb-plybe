// src/sim/save.js — pure save/restore helper shared by game.js's G.restore and its own tests
// (T2). Handles only the flat G-shaped fields (coins/upgrades/staff/stats/settings); world
// built/partial/active reconstruction stays in createWorld(area, save) / world.js, which already
// understands the { built, partial } save shape on its own.
import { createDay } from './day.js';
import { chooseGoal } from './economy.js';
export function applySave(state, save) {
  if (!save || typeof save !== 'object') return;
  state.coins = save.coins | 0;
  Object.assign(state.up, save.upgrades);
  Object.assign(state.staff, save.staff);
  Object.assign(state.stats, save.stats);
  Object.assign(state.settings, save.settings);
  // M3 T5 fix round 1: worker Speed/Carry and machine Oven/Coffee-speed/Display-capacity tiers —
  // an M2 save has neither field, so every level defaults to 0 (not undefined, which upgradeCost/
  // workerSpeedMult etc. already treat as 0 via `| 0`, but a live G.staffLevels object needs real
  // numbers for the UI's tier-dot rendering to work).
  const sl = (save.staffLevels && typeof save.staffLevels === 'object') ? save.staffLevels : {};
  state.staffLevels = {
    runner: { speed: (sl.runner && sl.runner.speed) | 0, carry: (sl.runner && sl.runner.carry) | 0 },
    cashier: { speed: (sl.cashier && sl.cashier.speed) | 0 },
    cleaner: { speed: (sl.cleaner && sl.cleaner.speed) | 0 },
  };
  const ml = (save.machineLevels && typeof save.machineLevels === 'object') ? save.machineLevels : {};
  state.machineLevels = { oven: ml.oven | 0, coffee: ml.coffee | 0, display: ml.display | 0 };
  // Loop v2 Task 2: the intro's own progress (src/systems/intro.js). An M3 save (no `intro` field
  // at all) restores to `{}` — intro.js's own `step === undefined` check then replays it from step
  // 0, same as a genuinely fresh game.
  state.intro = (save.intro && typeof save.intro === 'object') ? { ...save.intro } : {};
  // Loop v2 Task 3: the day clock, station stars, and today's goal/running stats. A pre-Task-3 save
  // (no `dayState` field at all) restores to a fresh day 1 — createDay()'s own shape — rather than
  // crashing on a missing field, same fallback pattern every other field on this page uses.
  state.dayState = (save.dayState && typeof save.dayState === 'object') ? { ...save.dayState } : createDay();
  state.stars = (save.stars && typeof save.stars === 'object') ? { ...save.stars } : {};
  state.goal = (save.goal && typeof save.goal === 'object') ? { ...save.goal } : chooseGoal(state.dayState.day);
  state.dayStats = (save.dayStats && typeof save.dayStats === 'object') ? { ...save.dayStats } : { served: 0, lost: 0, earned: 0 };
}
