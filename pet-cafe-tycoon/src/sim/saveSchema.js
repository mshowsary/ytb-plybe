import { normalizeServicePolicy } from './servicePolicy.js';
import { normalizeSocials } from './petSocials.js';
import { normalizeCalendar } from './rewards.js';
// Canonical save validation/migration for cloud persistence.
// The host boundary uses this BEFORE a load becomes writable; applySave uses it again defensively.
import { DAY_LENGTH, createDay, phaseOf } from './day.js';
import {
  UPGRADES, STAFF, WORKER_UPGRADES, MACHINE_UPGRADES, STAR_IDS,
} from './economy.js';
import { MASTERY, RENOVATIONS, CUP_REWARDS } from './career.js';
import { PET_PROFILES, PET_SPECIES, petKey } from './petBook.js';
import { DECOR_IDS, DECOR_ID_SET, DECOR_BY_ID, decorUnlocked } from '../../data/decor.js';
import { restoreSettlement } from './settlement.js';

export const CURRENT_SAVE_VERSION = 5;
export const SAVE_LIMITS = Object.freeze({
  maxDay: 10_000,
  maxCoins: 100_000_000,
  maxCounter: 1_000_000_000,
  maxShiftOutcomes: 500,
  maxShiftEarned: 2_000_000,

  // Progression ceilings for restore. These used to be the authored array lengths, which was fine
  // while the ladders ended there -- but the ladders now continue, so clamping to the array length
  // would silently demote a player's real progress on every load: a ★5 oven would come back as ★3
  // and the coins spent on it would be gone. That is a trust-destroying data-loss bug, not a test
  // detail.
  //
  // They remain BOUNDED because restore is an untrusted input: a tampered save must not be able to
  // invent unlimited power. The numbers are far above anything reachable in play -- the cost curves
  // are geometric, so a tier-20 speed upgrade already prices at roughly 2e8 coins, or ~100,000 days
  // of income -- which makes these a safety rail rather than a design limit.
  maxUpgradeTier: 50,
  maxStaffPerRole: 12,
  maxWorkerTier: 50,
  maxMachineTier: 50,
  maxStarTier: 30,

  // v5 meta ceilings. Followers/franchise/season/residents are progression the player can only
  // earn one shift at a time; a tampered save must not be able to hand itself a finished account.
  maxFollowers: 1_000_000,
  maxResidents: 12,
  maxAlbumShots: 999,
  maxSeasonIndex: 3,
  maxFranchiseLevel: 50,
});

const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const PARTY_KEYS = new Set(['cookie', 'cupcake', 'coffee', 'smoothie', 'treat']);
const CUP_TIERS = new Set(Object.keys(CUP_REWARDS));
const PET_KEYS = new Set(
  PET_SPECIES.flatMap(species => PET_PROFILES[species].map((_, variant) => petKey(species, variant))),
);
const STAT_KEYS = ['served', 'lifetimeEarned', 'serviceFees', 'wasteFees', 'rewardedReliefCoins', 'partyOrderCoins'];
// dayStats keys persisted across a reload. applySave replaces state.dayStats with EXACTLY this
// set, so a live counter that is missing here is silently zeroed on every save/load -- which is why
// 'missedSeats' (task 0.6, dirty tables), 'specialServed' (special-day progress, game.js) and
// 'returnActions' (systems/serviceFriction.js, read back by ui/serviceSummary.js) all have to be
// listed: a player who reloads mid-shift keeps the shift they actually played.
const SHIFT_STAT_KEYS = ['served', 'lost', 'earned', 'serviceFees', 'serviceMisses', 'wasteFees', 'bestStreak', 'missedSeats', 'specialServed', 'returnActions'];
// A settlement record is authored by sim/settlement.js snapshotStats(); restore must reproduce
// EXACTLY those fields or a reloaded end-of-shift summary stops deep-equalling the live one it is
// supposed to be. So the settlement key list is pinned separately from the live dayStats list.
const SETTLEMENT_STAT_KEYS = ['served', 'lost', 'earned', 'serviceFees', 'serviceMisses', 'wasteFees', 'bestStreak'];

const ok = (data, migratedFrom) => ({ ok: true, data, migratedFrom });
const bad = reason => ({ ok: false, reason });
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const clampInt = (value, min, max, fallback = min) => finiteNumber(value)
  ? clamp(Math.trunc(value), min, max)
  : fallback;
const safeString = (value, fallback = '', max = 160) => typeof value === 'string'
  ? value.slice(0, max)
  : fallback;

function optionalRecord(parent, key) {
  if (!has(parent, key) || parent[key] == null) return { ok: true, value: {} };
  return isRecord(parent[key]) ? { ok: true, value: parent[key] } : { ok: false, reason: key };
}

function readVersion(raw) {
  if (!has(raw, 'v') || raw.v == null) return { ok: true, version: 0 }; // pre-version / early saves
  if (!Number.isInteger(raw.v) || raw.v < 1 || raw.v > CURRENT_SAVE_VERSION) return { ok: false };
  return { ok: true, version: raw.v };
}

function normalizeBuildState(raw, area) {
  const areaId = area && typeof area.id === 'string' ? area.id : 'a1';
  let source = [];

  if (has(raw, 'builds') && raw.builds != null) {
    if (!isRecord(raw.builds)) return { ok: false, reason: 'builds' };
    if (has(raw.builds, areaId) && raw.builds[areaId] != null) {
      if (!Array.isArray(raw.builds[areaId])) return { ok: false, reason: `builds.${areaId}` };
      source = raw.builds[areaId];
    }
  } else if (has(raw, 'built') && raw.built != null) {
    // Earliest snapshots/world fixtures used a flat `built` array.
    if (!Array.isArray(raw.built)) return { ok: false, reason: 'built' };
    source = raw.built;
  }

  const requested = new Set();
  for (const id of source.slice(0, 128)) if (typeof id === 'string' && id.length <= 80) requested.add(id);

  if (!area || !Array.isArray(area.zones)) {
    return { ok: true, areaId, built: [...requested].slice(0, 64), builtSet: requested };
  }

  // Build dependencies are authoritative. An orphaned advanced-zone id cannot invent an unlock.
  const built = [];
  const builtSet = new Set();
  for (const zone of area.zones) {
    if (!requested.has(zone.id)) continue;
    if (zone.requires && !builtSet.has(zone.requires)) continue;
    built.push(zone.id);
    builtSet.add(zone.id);
  }
  return { ok: true, areaId, built, builtSet };
}

function normalizePartial(raw, area, builtSet) {
  if (has(raw, 'partial') && raw.partial != null && !isRecord(raw.partial)) return { ok: false, reason: 'partial' };
  const source = isRecord(raw.partial) ? raw.partial : {};
  const out = {};

  if (!area || !Array.isArray(area.zones)) {
    for (const [id, value] of Object.entries(source).slice(0, 64)) {
      if (BAD_KEYS.has(id) || typeof id !== 'string' || id.length > 80 || !finiteNumber(value)) continue;
      const amount = Math.trunc(value);
      if (amount > 0 && amount <= SAVE_LIMITS.maxCoins) out[id] = amount;
    }
    return { ok: true, partial: out };
  }

  const zoneById = new Map(area.zones.map(zone => [zone.id, zone]));
  for (const [id, value] of Object.entries(source).slice(0, 64)) {
    const zone = zoneById.get(id);
    if (!zone || builtSet.has(id) || !finiteNumber(value)) continue;
    if (zone.requires && !builtSet.has(zone.requires)) continue;
    const amount = Math.trunc(value);
    // A complete/over-complete partial is corruption, not "almost free" progress. Drop it rather
    // than clamping it to price-1, which would manufacture value from an oversized save number.
    if (amount <= 0 || amount >= zone.price) continue;
    out[id] = amount;
  }
  return { ok: true, partial: out };
}

function normalizeDay(raw) {
  if (has(raw, 'dayState') && raw.dayState != null && !isRecord(raw.dayState)) return { ok: false, reason: 'dayState' };
  const src = isRecord(raw.dayState) ? raw.dayState : createDay();
  const day = clampInt(src.day, 1, SAVE_LIMITS.maxDay, 1);
  const t = finiteNumber(src.t) ? clamp(src.t, 0, DAY_LENGTH) : 0;
  // t is the source of truth. A forged phase cannot unlock rush-only behavior, and a terminal
  // timestamp is always terminal so reloading cannot replay settlement from a half-ended shape.
  const ended = t >= DAY_LENGTH;
  const phase = phaseOf(t);
  return { ok: true, dayState: ended ? { day, t: DAY_LENGTH, phase, _ended: true } : { day, t, phase } };
}

function normalizeUpgrades(raw) {
  const source = isRecord(raw.upgrades) ? raw.upgrades : (isRecord(raw.up) ? raw.up : {});
  const out = {};
  for (const key of Object.keys(UPGRADES)) out[key] = clampInt(source[key], 0, SAVE_LIMITS.maxUpgradeTier, 0);
  return out;
}

function normalizeStaff(raw) {
  const source = isRecord(raw.staff) ? raw.staff : {};
  const out = {};
  for (const key of Object.keys(STAFF)) out[key] = clampInt(source[key], 0, SAVE_LIMITS.maxStaffPerRole, 0);
  return out;
}

function normalizeLevels(raw) {
  const sl = isRecord(raw.staffLevels) ? raw.staffLevels : {};
  const runner = isRecord(sl.runner) ? sl.runner : {};
  const cashier = isRecord(sl.cashier) ? sl.cashier : {};
  const cleaner = isRecord(sl.cleaner) ? sl.cleaner : {};
  const ml = isRecord(raw.machineLevels) ? raw.machineLevels : {};
  return {
    staffLevels: {
      runner: {
        speed: clampInt(runner.speed, 0, SAVE_LIMITS.maxWorkerTier, 0),
        carry: clampInt(runner.carry, 0, SAVE_LIMITS.maxWorkerTier, 0),
      },
      cashier: { speed: clampInt(cashier.speed, 0, SAVE_LIMITS.maxWorkerTier, 0) },
      cleaner: { speed: clampInt(cleaner.speed, 0, SAVE_LIMITS.maxWorkerTier, 0) },
    },
    machineLevels: {
      oven: clampInt(ml.oven, 0, SAVE_LIMITS.maxMachineTier, 0),
      coffee: clampInt(ml.coffee, 0, SAVE_LIMITS.maxMachineTier, 0),
      display: clampInt(ml.display, 0, SAVE_LIMITS.maxMachineTier, 0),
    },
  };
}

function normalizeStats(raw) {
  const src = isRecord(raw.stats) ? raw.stats : {};
  const out = {};
  for (const key of STAT_KEYS) out[key] = clampInt(src[key], 0, SAVE_LIMITS.maxCounter, 0);
  // Migrate the old top-level lifetimeEarned field when stats did not yet carry it.
  if (!has(src, 'lifetimeEarned') && finiteNumber(raw.lifetimeEarned)) {
    out.lifetimeEarned = clampInt(raw.lifetimeEarned, 0, SAVE_LIMITS.maxCounter, 0);
  }
  return out;
}

function normalizeSettings(raw) {
  const src = isRecord(raw.settings) ? raw.settings : {};
  return {
    sfx: typeof src.sfx === 'boolean' ? src.sfx : true,
    music: typeof src.music === 'boolean' ? src.music : true,
  };
}

function normalizeIntro(raw) {
  const src = isRecord(raw.intro) ? raw.intro : {};
  const step = clampInt(src.step, 0, 5, 0);
  return { step, active: step < 5 };
}

function normalizeStars(raw, area, builtSet) {
  const src = isRecord(raw.stars) ? raw.stars : {};
  const stationById = area && Array.isArray(area.stations)
    ? new Map(area.stations.map(st => [st.id, st]))
    : null;
  const out = {};
  for (const id of STAR_IDS) {
    if (!has(src, id)) continue;
    if (stationById) {
      const st = stationById.get(id);
      if (!st || (st.builtBy && !builtSet.has(st.builtBy))) continue;
    }
    out[id] = clampInt(src[id], 1, SAVE_LIMITS.maxStarTier, 1);
  }
  return out;
}

function normalizeShiftStats(raw) {
  const src = isRecord(raw.dayStats) ? raw.dayStats : {};
  const out = {};
  for (const key of SHIFT_STAT_KEYS) {
    const max = key === 'earned' ? SAVE_LIMITS.maxShiftEarned : SAVE_LIMITS.maxShiftOutcomes;
    out[key] = clampInt(src[key], 0, max, 0);
  }
  out.bestStreak = Math.min(out.bestStreak, out.served);
  return out;
}

function normalizeRewardedDays(raw, maxDay) {
  if (!isRecord(raw)) return {};
  const out = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (count >= Math.min(20_000, maxDay * 3 + 32)) break;
    if (BAD_KEYS.has(key) || !value || key.length > 40) continue;
    const match = /^(?:(?:relief|gift):)?(\d+)$/.exec(key);
    if (!match) continue;
    const day = Number(match[1]);
    if (!Number.isInteger(day) || day < 1 || day > maxDay) continue;
    out[key] = 1; count++;
  }
  return out;
}

function normalizeRewards(raw) {
  if (!isRecord(raw)) return { calendar: { lastKey: null, streak: 0 } };
  return {
    calendar: normalizeCalendar(raw.calendar),
  };
}

function normalizeShiftRatings(raw, maxDay) {
  if (!isRecord(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw).slice(0, SAVE_LIMITS.maxDay)) {
    if (!/^\d+$/.test(key)) continue;
    const day = Number(key);
    if (!Number.isInteger(day) || day < 1 || day > maxDay || !finiteNumber(value)) continue;
    out[String(day)] = clampInt(value, 1, 3, 1);
  }
  return out;
}

function normalizePetBook(raw) {
  if (!isRecord(raw)) return {};
  const out = {};
  for (const key of PET_KEYS) if (raw[key]) out[key] = 1;
  return out;
}

function normalizePetFriendship(raw) {
  if (!isRecord(raw)) return {};
  const out = {};
  for (const key of PET_KEYS) {
    const visits = clampInt(raw[key], 0, 9999, 0);
    if (visits > 0) out[key] = visits;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// v5 meta fields (plan 7.3). Restore is UNTRUSTED INPUT: everything below is validated against an
// authored catalogue or clamped to a bound, and anything that does not match is DROPPED rather
// than coerced, so a hand-edited save can never hand itself progress it did not play for.

// Owned decor. Unknown ids vanish; duplicates collapse; the result is emitted in catalogue order
// so re-validating an already canonical save produces a byte-identical array.
function normalizeDecor(raw, builtSet = null) {
  if (!Array.isArray(raw)) return [];
  const wanted = new Set();
  for (const id of raw.slice(0, 128)) if (typeof id === 'string' && DECOR_ID_SET.has(id)) wanted.add(id);
  // Zone gate, matching normalizePartial (skips a zone whose `requires` is not built) and
  // normalizeStars (skips a station whose builtBy is not built). economy.buyDecor refuses to sell a
  // locked row, so a save that holds one is hand-edited -- and it must not keep the item OR the +1
  // reputation of headroom the item would otherwise buy below.
  return DECOR_IDS.filter(id => wanted.has(id) && decorUnlocked(DECOR_BY_ID.get(id), builtSet));
}

// Album shot counts, keyed by the same PET_PROFILES-derived keys as the Pet Book.
function normalizeAlbum(raw) {
  if (!isRecord(raw)) return {};
  const out = {};
  for (const key of PET_KEYS) {
    const shots = clampInt(raw[key], 0, SAVE_LIMITS.maxAlbumShots, 0);
    if (shots > 0) out[key] = shots;
  }
  return out;
}

// Equipped cosmetics: pet key -> catalogue id. The accessory catalogue does not exist yet, so the
// only ids this can accept today are decor ids; Batch 2 widens EQUIPPABLE_IDS when accessories
// land. Anything unrecognised is dropped, which is why a forged "equipped" cannot render content.
const EQUIPPABLE_IDS = new Set(DECOR_IDS);
function normalizeEquipped(raw) {
  if (!isRecord(raw)) return {};
  const out = {};
  for (const key of PET_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && EQUIPPABLE_IDS.has(value)) out[key] = value;
  }
  return out;
}

// Resident pets: valid keys only, deduped, capped at the resident slot count.
function normalizeResidents(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const key of raw.slice(0, 64)) {
    if (typeof key !== 'string' || !PET_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (seen.size >= SAVE_LIMITS.maxResidents) break;
  }
  return [...PET_KEYS].filter(key => seen.has(key));
}

// A season cannot have started on a day the player has not reached.
function normalizeSeason(raw, day) {
  const src = isRecord(raw) ? raw : {};
  return {
    index: clampInt(src.index, 0, SAVE_LIMITS.maxSeasonIndex, 0),
    dayStart: clampInt(src.dayStart, 1, Math.max(1, day), 1),
  };
}

function normalizeFranchise(raw) {
  const src = isRecord(raw) ? raw : {};
  return { level: clampInt(src.level, 0, SAVE_LIMITS.maxFranchiseLevel, 0) };
}

function normalizeCareer(raw, completedDays, repEntitlement) {
  const src = isRecord(raw) ? raw : {};
  const historySrc = isRecord(src.history) ? src.history : {};
  const history = {};
  const maxHistoryDay = Math.max(0, completedDays);
  for (const [key, value] of Object.entries(historySrc).slice(0, SAVE_LIMITS.maxDay)) {
    if (!/^\d+$/.test(key) || !isRecord(value)) continue;
    const day = Number(key);
    if (day < 1 || day > maxHistoryDay) continue;
    const served = clampInt(value.served, 0, SAVE_LIMITS.maxShiftOutcomes, 0);
    const lost = clampInt(value.lost, 0, SAVE_LIMITS.maxShiftOutcomes, 0);
    const earned = clampInt(value.earned, 0, SAVE_LIMITS.maxShiftEarned, 0);
    const bestStreak = Math.min(served, clampInt(value.bestStreak, 0, SAVE_LIMITS.maxShiftOutcomes, 0));
    const rating = clampInt(value.rating, 1, 3, 1);
    const contractMet = !!value.contractMet;
    history[String(day)] = { served, lost, earned, bestStreak, rating, contractMet, points: rating + (contractMet ? 1 : 0) };
  }

  const cupsSrc = isRecord(src.weeklyCups) ? src.weeklyCups : {};
  const weeklyCups = {};
  const trophies = { bronze: 0, silver: 0, gold: 0 };
  const maxWeek = Math.ceil(completedDays / 7);
  for (const [key, value] of Object.entries(cupsSrc).slice(0, maxWeek || 0)) {
    if (!/^\d+$/.test(key) || !isRecord(value)) continue;
    const week = Number(key);
    const tier = typeof value.tier === 'string' ? value.tier : '';
    if (week < 1 || week > maxWeek || !CUP_TIERS.has(tier)) continue;
    const points = clampInt(value.points, 0, 28, 0);
    weeklyCups[String(week)] = { tier, reward: CUP_REWARDS[tier], points };
    trophies[tier]++;
  }

  const recipeSrc = isRecord(src.recipeSales) ? src.recipeSales : {};
  const recipeSales = {};
  for (const key of Object.keys(MASTERY)) recipeSales[key] = clampInt(recipeSrc[key], 0, SAVE_LIMITS.maxCounter, 0);

  // A renovation is a PURCHASE (career.buyRenovation spends coins), not a live readout of the
  // reputation meter. serviceQuality.applySeatMiss can now DECREMENT meta.reputation, so clamping
  // the owned tier against the CURRENT value would silently revoke a renovation the player already
  // paid for the first time a bad shift pushed them back under the gate.
  //
  // Clamp against the reputation ENTITLEMENT instead: the same bounded expression the reputation
  // clamp itself enforces (3 per settled shift + 1 per owned decor piece). It only ever grows, so
  // it can never drop below the reputation the player held when they bought the tier. It is no
  // weaker against a tampered save than the old check: a forged reputation was already clamped to
  // exactly this ceiling before it arrived here, so any save that could forge the tier could
  // already forge the reputation that unlocked it.
  let renovationLevel = clampInt(src.renovationLevel, 0, RENOVATIONS.length, 0);
  while (renovationLevel > 0 && repEntitlement < RENOVATIONS[renovationLevel - 1].rep) renovationLevel--;

  const contractStreak = clampInt(src.contractStreak, 0, completedDays, 0);
  const cached = src.currentContract;
  const g = cached?.goal;
  const validContract = isRecord(cached) && isRecord(g)
    && Number.isInteger(cached.day) && cached.day >= 1 && cached.day <= SAVE_LIMITS.maxDay
    && ['serve', 'earn', 'streak'].includes(g.kind)
    && Number.isInteger(g.target) && g.target > 0 && g.target <= SAVE_LIMITS.maxShiftEarned
    && Number.isInteger(g.reward) && g.reward >= 0 && g.reward <= SAVE_LIMITS.maxShiftEarned;
  const contractFields = new Set(['kind', 'target', 'reward', 'rival', 'cupDay', 'eyebrow']);
  return {
    history,
    ...(validContract ? { currentContract: {
      day: cached.day, tier: clampInt(cached.tier, 0, 3, 0),
      goal: Object.fromEntries(Object.entries(g).filter(([key, value]) => contractFields.has(key)
        && (key === 'eyebrow' ? typeof value === 'string' && value.length <= 80
          : ['rival', 'cupDay'].includes(key) ? typeof value === 'boolean' : true))),
    } } : {}),
    weeklyCups,
    trophies,
    recipeSales,
    contractStreak,
    bestContractStreak: clampInt(src.bestContractStreak, contractStreak, completedDays, contractStreak),
    bestWeekPoints: clampInt(src.bestWeekPoints, 0, 28, 0),
    renovationLevel,
  };
}

function normalizePartyOrders(raw, day) {
  const src = isRecord(raw) ? raw : {};
  let active = null;
  if (isRecord(src.active) && !src.active.claimed) {
    const a = src.active;
    const requirements = [];
    const seen = new Set();
    if (Array.isArray(a.requirements)) {
      for (const row of a.requirements.slice(0, 3)) {
        if (!isRecord(row) || typeof row.key !== 'string' || !PARTY_KEYS.has(row.key) || seen.has(row.key)) continue;
        seen.add(row.key);
        const target = clampInt(row.target, 1, 10, 1);
        requirements.push({ key: row.key, target, count: clampInt(row.count, 0, target, 0) });
      }
    }
    const createdDay = clampInt(a.createdDay, 1, day, day);
    if (requirements.length) {
      active = {
        id: clampInt(a.id, 1, SAVE_LIMITS.maxCounter, 1),
        title: safeString(a.title, 'Pet Party Order', 80),
        subtitle: safeString(a.subtitle, '', 180),
        createdDay,
        expiresDay: clampInt(a.expiresDay, createdDay, Math.min(SAVE_LIMITS.maxDay, createdDay + 2), createdDay + 1),
        reward: clampInt(a.reward, 0, 320, 0),
        claimed: false,
        requirements,
      };
    }
  }
  return {
    nextId: clampInt(src.nextId, 1, SAVE_LIMITS.maxCounter, 1),
    completed: clampInt(src.completed, 0, day, 0),
    lastOfferDay: clampInt(src.lastOfferDay, 0, day, 0),
    active,
  };
}

function normalizeSettlement(raw, dayState) {
  if (!isRecord(raw) || !dayState._ended) return null;
  const restored = restoreSettlement(raw);
  if (!restored || restored.day !== dayState.day) return null;
  const stats = {};
  for (const key of SETTLEMENT_STAT_KEYS) {
    const max = key === 'earned' ? SAVE_LIMITS.maxShiftEarned : SAVE_LIMITS.maxShiftOutcomes;
    stats[key] = clampInt(restored.stats && restored.stats[key], 0, max, 0);
  }
  stats.bestStreak = Math.min(stats.bestStreak, stats.served);
  const rating = clampInt(restored.rating, 1, 3, 1);
  const goal = {
    kind: ['serve', 'earn', 'streak'].includes(restored.goal && restored.goal.kind) ? restored.goal.kind : 'serve',
    target: clampInt(restored.goal && restored.goal.target, 0, SAVE_LIMITS.maxShiftEarned, 0),
    reward: clampInt(restored.goal && restored.goal.reward, 0, 100_000, 0),
    previous: restored.goal && restored.goal.previous == null ? null : clampInt(restored.goal.previous, 0, SAVE_LIMITS.maxShiftEarned, 0),
    rival: !!(restored.goal && restored.goal.rival),
    cupDay: !!(restored.goal && restored.goal.cupDay),
    progress: clampInt(restored.goal && restored.goal.progress, 0, SAVE_LIMITS.maxShiftEarned, 0),
    met: !!(restored.goal && restored.goal.met),
  };
  const cupTier = restored.cup && CUP_TIERS.has(restored.cup.tier) ? restored.cup.tier : null;
  const cup = cupTier ? {
    awarded: !!restored.cup.awarded,
    tier: cupTier,
    reward: CUP_REWARDS[cupTier],
    points: clampInt(restored.cup.points, 0, 28, 0),
    week: clampInt(restored.cup.week, 1, Math.ceil(dayState.day / 7), 1),
  } : null;
  const contractReward = goal.met ? goal.reward : 0;
  const cupReward = cup ? cup.reward : 0;
  return {
    v: 1,
    committed: true,
    day: dayState.day,
    legacy: !!restored.legacy,
    rating,
    goal,
    stats,
    rewards: { contract: contractReward, cup: cupReward, total: contractReward + cupReward },
    reputation: {
      awarded: clampInt(restored.reputation && restored.reputation.awarded, 0, 3, 0),
      rating: clampInt(restored.reputation && restored.reputation.rating, 1, 3, rating),
      levelUp: !!(restored.reputation && restored.reputation.levelUp),
      level: clampInt(restored.reputation && restored.reputation.level, 0, 10, 0),
    },
    cup,
    coinsBefore: clampInt(restored.coinsBefore, 0, SAVE_LIMITS.maxCoins, 0),
    coinsAfter: clampInt(restored.coinsAfter, 0, SAVE_LIMITS.maxCoins, 0),
  };
}

function normalizeBoosts(raw) {
  if (!isRecord(raw)) return {};
  const out = {};
  // Existing restore helpers do the semantic day/phase validation. Keep only the two known records
  // and bounded primitive fields so a save cannot smuggle an arbitrary object graph into state.
  for (const key of ['rushCrew', 'petPlayBreak']) {
    if (!isRecord(raw[key])) continue;
    const clean = {};
    for (const [field, value] of Object.entries(raw[key]).slice(0, 16)) {
      if (BAD_KEYS.has(field) || field.length > 40) continue;
      if (typeof value === 'boolean' || typeof value === 'string') clean[field] = typeof value === 'string' ? value.slice(0, 80) : value;
      else if (finiteNumber(value)) clean[field] = clamp(value, -SAVE_LIMITS.maxCounter, SAVE_LIMITS.maxCounter);
    }
    out[key] = clean;
  }
  return out;
}

export function validateAndMigrateSave(raw, area = null) {
  if (!isRecord(raw)) return bad('root');
  const version = readVersion(raw);
  if (!version.ok) return bad('version');

  // Wrong container types are treated as invalid cloud data rather than silently becoming a fresh
  // game. Missing containers are legitimate legacy omissions and migrate to safe defaults.
  for (const key of ['upgrades', 'staff', 'stats', 'settings', 'staffLevels', 'machineLevels', 'intro', 'meta', 'stars', 'dayStats', 'boosts']) {
    const checked = optionalRecord(raw, key);
    if (!checked.ok) return bad(`shape:${checked.reason}`);
  }
  if (has(raw, 'up') && raw.up != null && !isRecord(raw.up)) return bad('shape:up');
  if (has(raw, 'coins')) {
    if (!finiteNumber(raw.coins) || raw.coins < 0 || raw.coins > SAVE_LIMITS.maxCoins) return bad('coins');
  }
  if (has(raw, 'lifetimeEarned') && raw.lifetimeEarned != null && !finiteNumber(raw.lifetimeEarned)) return bad('lifetimeEarned');

  const buildState = normalizeBuildState(raw, area);
  if (!buildState.ok) return bad(`shape:${buildState.reason}`);
  const partialState = normalizePartial(raw, area, buildState.builtSet);
  if (!partialState.ok) return bad(`shape:${partialState.reason}`);
  const day = normalizeDay(raw);
  if (!day.ok) return bad(`shape:${day.reason}`);

  const metaRaw = isRecord(raw.meta) ? raw.meta : {};
  for (const key of ['rewardedDays', 'shiftRatings', 'petBook', 'petFriendship', 'career', 'partyOrders', 'settlement', 'rewards']) {
    if (has(metaRaw, key) && metaRaw[key] != null && !isRecord(metaRaw[key])) return bad(`shape:meta.${key}`);
  }
  const maxCompleted = day.dayState._ended ? day.dayState.day : Math.max(0, day.dayState.day - 1);
  const completedDays = clampInt(metaRaw.completedDays, 0, maxCompleted, 0);
  const hasCompletedDays = finiteNumber(metaRaw.completedDays);
  const decor = normalizeDecor(metaRaw.decor, buildState.builtSet);
  const rawRep = clampInt(metaRaw.reputation, 0, SAVE_LIMITS.maxDay * 3, 0);
  // When completedDays exists (all modern saves), reputation cannot exceed 3 points per settled
  // shift PLUS one point per owned decor item (economy.js buyDecor grants +1 each). The decor term
  // is what stops a legitimately bought decoration's reputation from being clamped away on reload;
  // it is still bounded, because the decor list itself was just validated against the catalogue.
  // Unversioned legacy saves without completedDays keep their historical reputation instead.
  const reputation = hasCompletedDays ? Math.min(rawRep, completedDays * 3 + decor.length) : rawRep;
  // The lifetime reputation ENTITLEMENT: the ceiling the clamp above enforces, never below what the
  // save actually holds. Monotonic in completedDays/decor, so a seat-miss decrement cannot shrink
  // it -- which is what keeps a bought renovation bought. An unversioned legacy save has no
  // completedDays to bound it with, so it keeps the historical current-reputation behaviour.
  const repEntitlement = hasCompletedDays
    ? Math.max(reputation, completedDays * 3 + decor.length)
    : reputation;
  const shiftRatings = normalizeShiftRatings(metaRaw.shiftRatings, Math.max(completedDays, day.dayState._ended ? day.dayState.day : 0));
  const petBook = normalizePetBook(metaRaw.petBook);
  const petFriendship = normalizePetFriendship(metaRaw.petFriendship);
  const career = normalizeCareer(metaRaw.career, completedDays, repEntitlement);
  const partyOrders = normalizePartyOrders(metaRaw.partyOrders, day.dayState.day);

  const levels = normalizeLevels(raw);
  const stats = normalizeStats(raw);
  const dayStats = normalizeShiftStats(raw);
  const normalized = {
    v: CURRENT_SAVE_VERSION,
    coins: clampInt(raw.coins, 0, SAVE_LIMITS.maxCoins, 0),
    lifetimeEarned: stats.lifetimeEarned,
    builds: { [buildState.areaId]: buildState.built },
    partial: partialState.partial,
    upgrades: normalizeUpgrades(raw),
    staff: normalizeStaff(raw),
    stats,
    settings: normalizeSettings(raw),
    staffLevels: levels.staffLevels,
    machineLevels: levels.machineLevels,
    intro: normalizeIntro(raw),
    meta: {
      completedDays,
      rewardedDays: normalizeRewardedDays(metaRaw.rewardedDays, day.dayState.day),
      reputation,
      perfectShifts: clampInt(metaRaw.perfectShifts, 0, completedDays, 0),
      bestServiceStreak: clampInt(metaRaw.bestServiceStreak, 0, SAVE_LIMITS.maxShiftOutcomes, 0),
      shiftRatings,
      petBook,
      petFriendship,
      petDiscoveries: Object.keys(petBook).length,
      settlement: normalizeSettlement(metaRaw.settlement, day.dayState),
      career,
      partyOrders,
      socials: normalizeSocials(metaRaw.socials),
      servicePolicy: normalizeServicePolicy(metaRaw.servicePolicy),
      // --- v5 ---
      followers: clampInt(metaRaw.followers, 0, SAVE_LIMITS.maxFollowers, 0),
      album: normalizeAlbum(metaRaw.album),
      equipped: normalizeEquipped(metaRaw.equipped),
      residents: normalizeResidents(metaRaw.residents),
      decor,
      goldenPaw: metaRaw.goldenPaw === true,
      season: normalizeSeason(metaRaw.season, day.dayState.day),
      franchise: normalizeFranchise(metaRaw.franchise),
      ...(metaRaw.rewards && isRecord(metaRaw.rewards) ? { rewards: normalizeRewards(metaRaw.rewards) } : {}),
    },
    dayState: day.dayState,
    stars: normalizeStars(raw, area, buildState.builtSet),
    boosts: normalizeBoosts(raw.boosts),
    dayStats,
  };
  return ok(normalized, version.version);
}

export function normalizeSave(raw, area = null) {
  const result = validateAndMigrateSave(raw, area);
  return result.ok ? result.data : null;
}
