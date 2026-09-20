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

// Zones the catalogue no longer sells. The core validator keeps only ids that are still in
// area.zones (and drops their partial payments and station rows the same way), so without this a
// save that bought one would silently lose every coin it spent there. Each row is {id, price,
// requires, stations} exactly as the zone was last authored, except that `stations` lists only the
// stations that went with it (their trays are refunded too); rows are in chain order, so a row's
// `requires` is either live or an earlier row. Later batches add the zones they retire.
export const RETIRED_ZONES = Object.freeze([
  // The Ice cream garden's cuts, 2026-09-19 (docs/SHIP-PLAN-2026-09-19.md §1.1-1.2). z_icecream's
  // machine and counter moved into z_terrace, so only its cold pantry and crate left with it.
  // First, because the spa chain below hangs off z_splash.
  { id: 'z_icecream', price: 3600, requires: 'z_terrace', stations: ['coldPantry1', 'return2'] },
  { id: 'z_register3', price: 4000, requires: 'z_icecream', stations: ['register3'] },
  { id: 'z_restroom', price: 3500, requires: 'z_terraceSeats', stations: ['wc1'] },
  { id: 'z_splash', price: 4000, requires: 'z_photo', stations: ['splash1'] },
  // The Pet Spa, retired 2026-09-19 (docs/SHIP-PLAN-2026-09-19.md §1.1).
  { id: 'z_spa', price: 9000, requires: 'z_splash', stations: ['gate2', 'spaSeat1', 'spaSeat2', 'spaSeat3', 'planters'] },
  { id: 'z_groom', price: 6000, requires: 'z_spa', stations: ['groom1'] },
  { id: 'z_bath', price: 7000, requires: 'z_groom', stations: ['bath1', 'waterTank1'] },
  { id: 'z_boutique', price: 6500, requires: 'z_bath', stations: ['boutique1'] },
  { id: 'z_photographer', price: 8000, requires: 'z_boutique', stations: ['photoDesk1'] },
].map(z => Object.freeze({ ...z, stations: Object.freeze([...z.stations]) })));

// Coins owed back for retired zones this raw save built: each zone's price, any cash left on its
// stations' trays, and any partial payment on one it had not finished. The same chain rule as
// saveSchema's normalizeBuildState applies (a zone counts only if its `requires` is built), so a
// forged orphan id earns nothing. A zone that is still authored is skipped, which keeps the table
// inert until its data row is actually removed. It pays once: the canonical save this produces
// never contains a retired id, partial or station row, so re-validating it refunds 0.
export function retiredZoneRefund(raw, area, builtIds, areaId = 'a1') {
  if (!raw || typeof raw !== 'object' || !area || !Array.isArray(area.zones)) return 0;
  const live = new Set(area.zones.map(z => z.id));
  let source = [];
  if (raw.builds != null) {
    if (raw.builds && typeof raw.builds === 'object' && Array.isArray(raw.builds[areaId])) source = raw.builds[areaId];
  } else if (Array.isArray(raw.built)) source = raw.built;
  const requested = new Set(source.slice(0, 128).filter(id => typeof id === 'string' && id.length <= 80));
  const partial = raw.partial && typeof raw.partial === 'object' && !Array.isArray(raw.partial) ? raw.partial : {};
  const byId = raw.stationState && raw.stationState.byId && typeof raw.stationState.byId === 'object' ? raw.stationState.byId : {};
  const have = new Set(builtIds || []);
  let refund = 0;
  for (const z of RETIRED_ZONES) {
    if (live.has(z.id) || !have.has(z.requires)) continue;
    if (requested.has(z.id)) {
      have.add(z.id);
      refund += z.price;
      for (const sid of z.stations) {
        const pile = byId[sid] && byId[sid].pile;
        if (Number.isFinite(pile) && pile > 0 && pile <= SAVE_LIMITS.maxCoins) refund += Math.trunc(pile);
      }
    } else if (Number.isFinite(partial[z.id])) {
      const paid = Math.trunc(partial[z.id]);
      // A complete/over-complete partial is corruption, exactly as normalizePartial treats it.
      if (paid > 0 && paid < z.price) refund += paid;
    }
  }
  return Math.min(refund, SAVE_LIMITS.maxCoins);
}

// Zones whose prerequisite moved. The core validator drops a built zone whose `requires` is not
// built, so a save that bought one under its OLD prerequisite would lose it and everything that
// hangs off it. Instead the zones between the old prerequisite and the new one are completed for
// that save: they are exactly what the player would otherwise have to rebuild to get back a room
// they already own. A part-payment on such a zone that the save can no longer see (its new
// prerequisite is not built) comes back as coins (rechainedPartialRefund below).
export const RECHAINED_ZONES = Object.freeze([
  // 2026-09-19: the Ice cream garden follows the pet lounge instead of the smoothie bar.
  Object.freeze({ id: 'z_terrace', oldRequires: 'z_blender', grants: Object.freeze(['z_garden', 'z_seats2']) }),
]);

function requestedBuilds(raw, areaId) {
  if (raw.builds != null) return raw.builds && typeof raw.builds === 'object' && Array.isArray(raw.builds[areaId]) ? raw.builds[areaId] : [];
  return Array.isArray(raw.built) ? raw.built : [];
}

// A copy of `raw` with the granted zones added to its build list, or `raw` itself when nothing
// applies. Never mutates the caller's save.
export function withRechainedGrants(raw, area, areaId = 'a1') {
  if (!raw || typeof raw !== 'object' || !area || !Array.isArray(area.zones)) return raw;
  const source = requestedBuilds(raw, areaId);
  const have = new Set(source.filter(id => typeof id === 'string'));
  const add = [];
  for (const r of RECHAINED_ZONES) {
    const zone = area.zones.find(z => z.id === r.id);
    if (!zone || !have.has(r.id) || !have.has(r.oldRequires) || have.has(zone.requires)) continue;
    for (const id of r.grants) if (!have.has(id)) { have.add(id); add.push(id); }
  }
  if (!add.length) return raw;
  const list = [...source, ...add];
  return raw.builds != null ? { ...raw, builds: { ...raw.builds, [areaId]: list } } : { ...raw, built: list };
}

// Coins for a part-payment on a re-chained zone whose NEW prerequisite this save has not built: the
// validator drops such a partial (the plot is not offered yet), so it is paid back instead.
export function rechainedPartialRefund(raw, area, builtIds) {
  if (!raw || typeof raw !== 'object' || !area || !Array.isArray(area.zones)) return 0;
  const partial = raw.partial && typeof raw.partial === 'object' && !Array.isArray(raw.partial) ? raw.partial : {};
  const have = new Set(builtIds || []);
  let refund = 0;
  for (const r of RECHAINED_ZONES) {
    const zone = area.zones.find(z => z.id === r.id);
    if (!zone || have.has(r.id) || have.has(zone.requires) || !have.has(r.oldRequires) || !Number.isFinite(partial[r.id])) continue;
    const paid = Math.trunc(partial[r.id]);
    if (paid > 0 && paid < zone.price) refund += paid;
  }
  return Math.min(refund, SAVE_LIMITS.maxCoins);
}

// Tasks 10–12, 29 and 36 extend the certified root-v4 schema through versioned nested payloads.
// Keeping these wrappers here means the YouTube load gate and applySave canonicalize every extension
// before cloud writes unlock, without destabilizing the historical root migration contract.
export function validateAndMigrateSave(raw, area = null) {
  const areaId = area && typeof area.id === 'string' ? area.id : 'a1';
  // Before the core validator reads the build list: a re-chained zone must survive its chain check.
  raw = withRechainedGrants(raw, area, areaId);
  const result = validateCoreSave(raw, area);
  if (!result.ok) return result;
  // Task 25 changes a prerequisite and lowers the Desk price; migrate economic value before nested
  // station/staff state is validated so every downstream normalizer sees the promoted build.
  preserveLegacyDeskInvestment(result, raw, area, areaId);
  // Retired zones come back as coins, on top of the validated wallet and never past its cap.
  const builtIds = result.data.builds && result.data.builds[areaId];
  const retiredRefund = retiredZoneRefund(raw, area, builtIds, areaId) + rechainedPartialRefund(raw, area, builtIds);
  if (retiredRefund > 0) result.data.coins = Math.min(SAVE_LIMITS.maxCoins, result.data.coins + retiredRefund);
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
  // start a fresh reconciliation baseline from the already validated wallet. A retired-zone refund
  // moved the wallet outside any recorded transaction, so it starts a fresh baseline too.
  result.data.ledger = retiredRefund <= 0 && raw && raw.ledger && typeof raw.ledger === 'object' && !Array.isArray(raw.ledger)
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
    decor: [...meta.decor],
    followers: meta.followers,
    album: { ...meta.album },
    equipped: { ...meta.equipped },
    // Every bought accessory was dropped here on each reload until 2026-09-19: the field was
    // validated, then never copied onto the live meta.
    accessoriesBought: [...(meta.accessoriesBought || [])],
    residents: [...meta.residents],
    goldenPaw: meta.goldenPaw,
    pawBest: meta.pawBest,
    // REPLACED, never aliased: the window's day rows are nested objects, and applySave's result is
    // handed straight to a live G whose next snapshot spreads meta one level deep.
    pawSeatWindow: meta.pawSeatWindow
      ? { days: (meta.pawSeatWindow.days || []).map(r => ({ ...r })), best: meta.pawSeatWindow.best }
      : null,
    season: { ...meta.season },
    franchise: { ...meta.franchise },
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
