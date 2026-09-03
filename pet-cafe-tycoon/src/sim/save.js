// src/sim/save.js — pure save/restore helper shared by game.js and node tests.
import { createDay } from './day.js';
import { chooseGoal } from './economy.js';

export function applySave(state, save) {
  if (!save || typeof save !== 'object') return;
  state.coins = save.coins | 0;
  Object.assign(state.up, save.upgrades);
  Object.assign(state.staff, save.staff);
  Object.assign(state.stats, save.stats);
  Object.assign(state.settings, save.settings);

  const sl = (save.staffLevels && typeof save.staffLevels === 'object') ? save.staffLevels : {};
  state.staffLevels = {
    runner: { speed: (sl.runner && sl.runner.speed) | 0, carry: (sl.runner && sl.runner.carry) | 0 },
    cashier: { speed: (sl.cashier && sl.cashier.speed) | 0 },
    cleaner: { speed: (sl.cleaner && sl.cleaner.speed) | 0 },
  };
  const ml = (save.machineLevels && typeof save.machineLevels === 'object') ? save.machineLevels : {};
  state.machineLevels = { oven: ml.oven | 0, coffee: ml.coffee | 0, display: ml.display | 0 };

  state.intro = (save.intro && typeof save.intro === 'object') ? { ...save.intro } : {};

  const meta = (save.meta && typeof save.meta === 'object') ? save.meta : {};
  state.meta = {
    completedDays: meta.completedDays | 0,
    rewardedDays: (meta.rewardedDays && typeof meta.rewardedDays === 'object') ? { ...meta.rewardedDays } : {},
  };

  state.dayState = (save.dayState && typeof save.dayState === 'object') ? { ...save.dayState } : createDay();
  state.stars = (save.stars && typeof save.stars === 'object') ? { ...save.stars } : {};
  state.goal = (save.goal && typeof save.goal === 'object') ? { ...save.goal } : chooseGoal(state.dayState.day);
  state.dayStats = (save.dayStats && typeof save.dayStats === 'object') ? { ...save.dayStats } : { served: 0, lost: 0, earned: 0 };
}
