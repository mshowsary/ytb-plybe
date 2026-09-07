import { normalizeServicePolicy } from './servicePolicy.js';
import { normalizeSocials } from './petSocials.js';
// Pure save/restore helper shared by game.js and node tests.
import { ensureReputation } from './reputation.js';
import { ensurePetBook, normalizePetKeepsake } from './petBook.js';
import { ensureCareer, chooseCareerGoal } from './career.js';
import { ensurePartyOrders } from './partyOrders.js';
import {
  CURRENT_SAVE_VERSION, SAVE_LIMITS, validateAndMigrateSave as validateCoreSave,
} from './saveSchema.js';
import { normalizeStationState } from './stationState.js';
import { normalizeOwnerState } from './ownerState.js';
import { normalizeStaffState } from './staffState.js';
import { normalizeTemporaryHelp } from './temporaryHelp.js';
import { normalizeMechanicLearning } from './mechanicLearning.js';

export { CURRENT_SAVE_VERSION, SAVE_LIMITS } from './saveSchema.js';
export { STATION_STATE_VERSION } from './stationState.js';
export { OWNER_STATE_VERSION } from './ownerState.js';
export { STAFF_STATE_VERSION } from './staffState.js';
export { TEMPORARY_HELP_VERSION } from './temporaryHelp.js';

const LEGACY_STAFF_DESK_PRICE = 480;

function preserveLegacyDeskInvestment(result, raw, area, areaId) {
  if (!area || !Array.isArray(area.zones) || !result || !result.data) return;
  const desk = area.zones.find(z => z.id === 'z_hire');
  const oldPartial = raw && raw.partial && typeof raw.partial === 'object' && !Array.isArray(raw.partial)
    ? raw.partial.z_hire
    : null;
  if (!desk || !(desk.price < LEGACY_STAFF_DESK_PRICE) || !Number.isFinite(oldPartial)) return;
  const amount = Math.trunc(oldPartial);
  // A valid pre-Task-25 Desk partial was necessarily below 480 and could only exist after the old
  // second-register prerequisite. If that already-invested amount now reaches the supported 300
  // Desk price, promote it to a completed Desk instead of letting the core validator discard the
  // over-complete partial. This preserves player value without turning malformed orphan progress
  // into a free unlock. Smaller valid partials are already preserved unchanged by saveSchema.js.
  if (amount < desk.price || amount >= LEGACY_STAFF_DESK_PRICE) return;
  const built = new Set(result.data.builds && result.data.builds[areaId] || []);
  if (built.has('z_hire') || !built.has('z_oven2') || !built.has('z_register2')) return;
  built.add('z_hire');
  result.data.builds[areaId] = area.zones.filter(z => built.has(z.id)).map(z => z.id);
  if (result.data.partial && typeof result.data.partial === 'object') delete result.data.partial.z_hire;
}

// Tasks 10–12, 29 and 36 extend the certified root-v4 schema through versioned nested payloads.
// Keeping these wrappers here means the YouTube load gate and applySave canonicalize every extension
// before cloud writes unlock, without destabilizing the historical root migration contract.
export function validateAndMigrateSave(raw, area = null) {
  const result = validateCoreSave(raw, area);
  if (!result.ok) return result;
  const areaId = area && typeof area.id === 'string' ? area.id : 'a1';
  // Task 25 changes a prerequisite and lowers the Desk price; migrate economic value before nested
  // station/staff state is validated so every downstream normalizer sees the promoted build.
  preserveLegacyDeskInvestment(result, raw, area, areaId);
  const builtSet = new Set(result.data.builds && result.data.builds[areaId] || []);
  const station = normalizeStationState(
    raw && raw.stationState,
    area,
    builtSet,
    result.data.stars,
    SAVE_LIMITS.maxCoins,
  );
  if (!station.ok) return { ok: false, reason: `stationState:${station.reason}` };
  result.data.stationState = station.data;

  const owner = normalizeOwnerState(raw && raw.ownerState, area, result.data.upgrades);
  if (!owner.ok) return { ok: false, reason: `ownerState:${owner.reason}` };
  result.data.ownerState = owner.data;

  const staffState = normalizeStaffState(raw && raw.staffState, area, builtSet, result.data.staff);
  if (!staffState.ok) return { ok: false, reason: `staffState:${staffState.reason}` };
  result.data.staffState = staffState.data;

  const help = normalizeTemporaryHelp(raw && raw.temporaryHelp, result.data.boosts, result.data.dayState);
  if (!help.ok) return { ok: false, reason: `temporaryHelp:${help.reason}` };
  result.data.temporaryHelp = help.data;

  // Task 29: preserve only known demonstrated mechanic IDs. UI-copy, shown-only hints and arbitrary
  // unknown fields never cross the canonical host boundary. Legacy saves infer only conservative
  // proof from progression that could not exist without the corresponding mechanic being used.
  result.data.learning = normalizeMechanicLearning(raw && raw.learning, result.data);

  // Task 36: one cosmetic ID only. An older legitimate save that already has a Bestie but predates
  // the keepsake field deterministically receives its first authored Bestie; malformed arbitrary IDs
  // can never create render content. This has no economy or progression meaning.
  result.data.petKeepsake = normalizePetKeepsake(raw && raw.petKeepsake, result.data.meta);

  // Task 20: ledger data is observational only and cannot alter canonical wallet/progression data.
  // Preserve an object-shaped payload through the load validator; sim/ledger.js performs the
  // transaction-level sanitization when the runtime restores it. Invalid/missing ledgers simply
  // start a fresh reconciliation baseline from the already validated wallet.
  result.data.ledger = raw && raw.ledger && typeof raw.ledger === 'object' && !Array.isArray(raw.ledger)
    ? raw.ledger
    : null;
  return result;
}

export function normalizeSave(raw, area = null) {
  const result = validateAndMigrateSave(raw, area);
  return result.ok ? result.data : null;
}

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
  state.staffState = {
    v: canonical.staffState.v,
    runnerAssignments: [...canonical.staffState.runnerAssignments],
  };
  state.petKeepsake = canonical.petKeepsake ? { ...canonical.petKeepsake } : null;

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
      ...(meta.career.currentContract ? { currentContract: structuredCloneSafe(meta.career.currentContract) } : {}),
      weeklyCups: structuredCloneSafe(meta.career.weeklyCups),
      trophies: { ...meta.career.trophies },
      recipeSales: { ...meta.career.recipeSales },
      contractStreak: meta.career.contractStreak,
      bestContractStreak: meta.career.bestContractStreak,
      bestWeekPoints: meta.career.bestWeekPoints,
      renovationLevel: meta.career.renovationLevel,
    },
    socials: normalizeSocials(meta.socials),
    servicePolicy: normalizeServicePolicy(meta.servicePolicy),
    partyOrders: {
      nextId: meta.partyOrders.nextId,
      completed: meta.partyOrders.completed,
      lastOfferDay: meta.partyOrders.lastOfferDay,
      active: meta.partyOrders.active ? {
        ...meta.partyOrders.active,
        requirements: meta.partyOrders.active.requirements.map(r => ({ ...r })),
      } : null,
    },
    ...(meta.rewards && meta.rewards.calendar ? { rewards: { calendar: { ...meta.rewards.calendar } } } : {}),
  };
  ensureReputation(state.meta);
  ensurePetBook(state.meta);
  ensureCareer(state.meta);
  ensurePartyOrders(state.meta);

  state.dayState = { ...canonical.dayState };
  state.stars = { ...canonical.stars };

  // Task 12 owns one canonical temporary-help record. Active Crew/Break instances are restored only
  // into their legitimate rush; Roomba is consumed later by systems/petMess after that runtime is
  // constructed; pending earned entitlement remains available for the next useful moment.
  if (!state.boosts || typeof state.boosts !== 'object') state.boosts = {};
  if (canonical.temporaryHelp.rushCrew) state.boosts.rushCrew = { ...canonical.temporaryHelp.rushCrew };
  else delete state.boosts.rushCrew;
  if (canonical.temporaryHelp.petPlayBreak) state.boosts.petPlayBreak = { ...canonical.temporaryHelp.petPlayBreak, recipientIds: [], needsRecipients: true };
  else delete state.boosts.petPlayBreak;
  state.temporaryHelp = {
    v: canonical.temporaryHelp.v,
    roomba: canonical.temporaryHelp.roomba ? { ...canonical.temporaryHelp.roomba } : null,
    pending: canonical.temporaryHelp.pending ? { ...canonical.temporaryHelp.pending } : null,
  };

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
