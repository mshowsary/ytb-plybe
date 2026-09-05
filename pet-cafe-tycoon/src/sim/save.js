// Pure save/restore helper shared by game.js and node tests.
import { ensureReputation } from './reputation.js';
import { ensurePetBook } from './petBook.js';
import { ensureCareer, chooseCareerGoal } from './career.js';
import { ensurePartyOrders } from './partyOrders.js';
import { restoreRushCrewBoost } from './rushCrew.js';
import { restorePetPlayBreakBoost } from './petPlayBreak.js';
import { normalizeSave } from './saveSchema.js';

export { CURRENT_SAVE_VERSION, SAVE_LIMITS, validateAndMigrateSave, normalizeSave } from './saveSchema.js';

export function applySave(state, save, area = state && state.world && state.world.area) {
  if (!state || typeof state !== 'object') return null;
  const canonical = normalizeSave(save, area);
  if (!canonical) return null;

  state.coins = canonical.coins;
  if (!state.up || typeof state.up !== 'object') state.up = {};
  Object.assign(state.up, canonical.upgrades);
  if (!state.staff || typeof state.staff !== 'object') state.staff = {};
  Object.assign(state.staff, canonical.staff);
  if (!state.stats || typeof state.stats !== 'object') state.stats = {};
  Object.assign(state.stats, canonical.stats);
  if (!state.settings || typeof state.settings !== 'object') state.settings = {};
  Object.assign(state.settings, canonical.settings);

  state.staffLevels = {
    runner: { ...canonical.staffLevels.runner },
    cashier: { ...canonical.staffLevels.cashier },
    cleaner: { ...canonical.staffLevels.cleaner },
  };
  state.machineLevels = { ...canonical.machineLevels };
  state.intro = { ...canonical.intro };

  const meta = canonical.meta;
  state.meta = {
    completedDays: meta.completedDays,
    rewardedDays: { ...meta.rewardedDays },
    reputation: meta.reputation,
    perfectShifts: meta.perfectShifts,
    bestServiceStreak: meta.bestServiceStreak,
    shiftRatings: { ...meta.shiftRatings },
    petBook: { ...meta.petBook },
    petFriendship: { ...meta.petFriendship },
    petDiscoveries: meta.petDiscoveries,
    settlement: meta.settlement ? {
      ...meta.settlement,
      goal: { ...meta.settlement.goal },
      stats: { ...meta.settlement.stats },
      rewards: { ...meta.settlement.rewards },
      reputation: { ...meta.settlement.reputation },
      cup: meta.settlement.cup ? { ...meta.settlement.cup } : null,
    } : null,
    career: {
      history: structuredCloneSafe(meta.career.history),
      weeklyCups: structuredCloneSafe(meta.career.weeklyCups),
      trophies: { ...meta.career.trophies },
      recipeSales: { ...meta.career.recipeSales },
      contractStreak: meta.career.contractStreak,
      bestContractStreak: meta.career.bestContractStreak,
      bestWeekPoints: meta.career.bestWeekPoints,
      renovationLevel: meta.career.renovationLevel,
    },
    partyOrders: {
      nextId: meta.partyOrders.nextId,
      completed: meta.partyOrders.completed,
      lastOfferDay: meta.partyOrders.lastOfferDay,
      active: meta.partyOrders.active ? {
        ...meta.partyOrders.active,
        requirements: meta.partyOrders.active.requirements.map(r => ({ ...r })),
      } : null,
    },
  };
  ensureReputation(state.meta);
  ensurePetBook(state.meta);
  ensureCareer(state.meta);
  ensurePartyOrders(state.meta);

  state.dayState = { ...canonical.dayState };
  state.stars = { ...canonical.stars };

  // Rewarded Rush Help must survive a legitimate reload DURING that same rush, or the player can
  // lose the benefit while its once-per-day claim remains consumed. Stale/malformed boosts are
  // never restored: a different day/phase automatically drops them. Pet Play Break intentionally
  // restores without recipient ids because live customers are not persisted; its runtime reattaches
  // the remaining break to the next two genuinely stressed guests after reload.
  if (!state.boosts || typeof state.boosts !== 'object') state.boosts = {};
  const rushCrew = restoreRushCrewBoost(canonical.boosts.rushCrew, state.dayState);
  if (rushCrew) state.boosts.rushCrew = rushCrew;
  else delete state.boosts.rushCrew;
  const petPlayBreak = restorePetPlayBreakBoost(canonical.boosts.petPlayBreak, state.dayState);
  if (petPlayBreak) state.boosts.petPlayBreak = petPlayBreak;
  else delete state.boosts.petPlayBreak;

  // Regenerate the live adaptive contract so old saves cannot preserve retired Serve-110 style goals.
  state.goal = chooseCareerGoal(state.dayState.day, state.meta);
  state.dayStats = { ...canonical.dayStats };
  return canonical;
}

function structuredCloneSafe(value) {
  const out = {};
  for (const [k, v] of Object.entries(value || {})) out[k] = (v && typeof v === 'object') ? { ...v } : v;
  return out;
}
