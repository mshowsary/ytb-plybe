// Pure save/restore helper shared by game.js and node tests.
import { createDay } from './day.js';
import { ensureReputation } from './reputation.js';
import { ensurePetBook } from './petBook.js';
import { ensureCareer, chooseCareerGoal } from './career.js';
import { ensurePartyOrders } from './partyOrders.js';
import { restoreRushCrewBoost } from './rushCrew.js';

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
  const savedParty = (meta.partyOrders && typeof meta.partyOrders === 'object') ? meta.partyOrders : {};
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
      renovationLevel: savedCareer.renovationLevel | 0,
    },
    partyOrders: {
      nextId: savedParty.nextId | 0,
      completed: savedParty.completed | 0,
      lastOfferDay: savedParty.lastOfferDay | 0,
      active: savedParty.active && typeof savedParty.active === 'object' ? {
        ...savedParty.active,
        requirements: Array.isArray(savedParty.active.requirements) ? savedParty.active.requirements.map(r => ({ ...r })) : [],
      } : null,
    },
  };
  ensureReputation(state.meta);
  ensurePetBook(state.meta);
  ensureCareer(state.meta);
  ensurePartyOrders(state.meta);

  state.dayState = (save.dayState && typeof save.dayState === 'object') ? { ...save.dayState } : createDay();
  state.stars = (save.stars && typeof save.stars === 'object') ? { ...save.stars } : {};

  // A completed rewarded Rush Crew must survive a legitimate reload DURING that same rush, or the
  // player could lose the reward while its once-per-day claim remains consumed. Stale/malformed
  // boosts are never restored: a different day/phase automatically drops them.
  if (!state.boosts || typeof state.boosts !== 'object') state.boosts = {};
  const savedBoosts = (save.boosts && typeof save.boosts === 'object') ? save.boosts : {};
  const rushCrew = restoreRushCrewBoost(savedBoosts.rushCrew, state.dayState);
  if (rushCrew) state.boosts.rushCrew = rushCrew;
  else delete state.boosts.rushCrew;

  // Regenerate the live adaptive contract so old saves cannot preserve retired Serve-110 style goals.
  state.goal = chooseCareerGoal(state.dayState.day, state.meta);
  state.dayStats = (save.dayStats && typeof save.dayStats === 'object')
    ? { serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 0, ...save.dayStats }
    : { served: 0, lost: 0, earned: 0, serviceFees: 0, serviceMisses: 0, wasteFees: 0, bestStreak: 0 };
}

function structuredCloneSafe(value) {
  const out = {};
  for (const [k, v] of Object.entries(value || {})) out[k] = (v && typeof v === 'object') ? { ...v } : v;
  return out;
}
