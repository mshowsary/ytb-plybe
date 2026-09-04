// src/sim/save.js — pure save/restore helper shared by game.js and node tests.
import { createDay } from './day.js';
import { ensureReputation } from './reputation.js';
import { ensurePetBook } from './petBook.js';
import { ensureCareer, chooseCareerGoal } from './career.js';

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
  const savedCareer = (meta.career && typeof meta.career === 'object') ? meta.career : {};
  state.meta = {
    completedDays: meta.completedDays | 0,
    rewardedDays: (meta.rewardedDays && typeof meta.rewardedDays === 'object') ? { ...meta.rewardedDays } : {},
    reputation: meta.reputation | 0,
    perfectShifts: meta.perfectShifts | 0,
    bestServiceStreak: meta.bestServiceStreak | 0,
    shiftRatings: (meta.shiftRatings && typeof meta.shiftRatings === 'object') ? { ...meta.shiftRatings } : {},
    petBook: (meta.petBook && typeof meta.petBook === 'object') ? { ...meta.petBook } : {},
    petDiscoveries: meta.petDiscoveries | 0,
    career: {
      history: (savedCareer.history && typeof savedCareer.history === 'object') ? structuredCloneSafe(savedCareer.history) : {},
      weeklyCups: (savedCareer.weeklyCups && typeof savedCareer.weeklyCups === 'object') ? structuredCloneSafe(savedCareer.weeklyCups) : {},
      trophies: (savedCareer.trophies && typeof savedCareer.trophies === 'object') ? { ...savedCareer.trophies } : { bronze: 0, silver: 0, gold: 0 },
      recipeSales: (savedCareer.recipeSales && typeof savedCareer.recipeSales === 'object') ? { ...savedCareer.recipeSales } : {},
      contractStreak: savedCareer.contractStreak | 0,
      bestContractStreak: savedCareer.bestContractStreak | 0,
      bestWeekPoints: savedCareer.bestWeekPoints | 0,
    },
  };
  ensureReputation(state.meta);
  ensurePetBook(state.meta);
  ensureCareer(state.meta);

  state.dayState = (save.dayState && typeof save.dayState === 'object') ? { ...save.dayState } : createDay();
  state.stars = (save.stars && typeof save.stars === 'object') ? { ...save.stars } : {};
  // Deliberately regenerate the contract. This migrates old Day 8+ saves away from legacy goals
  // like "Serve 110" and keeps rival targets deterministic from the persisted career history.
  state.goal = chooseCareerGoal(state.dayState.day, state.meta);
  state.dayStats = (save.dayStats && typeof save.dayStats === 'object')
    ? { serviceFees: 0, serviceMisses: 0, bestStreak: 0, ...save.dayStats }
    : { served: 0, lost: 0, earned: 0, serviceFees: 0, serviceMisses: 0, bestStreak: 0 };
}

function structuredCloneSafe(value) {
  const out = {};
  for (const [k, v] of Object.entries(value || {})) out[k] = (v && typeof v === 'object') ? { ...v } : v;
  return out;
}
