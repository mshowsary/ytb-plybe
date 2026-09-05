import { restoreRushCrewBoost, RUSH_CREW_ROLES } from './rushCrew.js';
import { restorePetPlayBreakBoost, PET_PLAY_BREAK_SECONDS, PET_PLAY_BREAK_SLOTS } from './petPlayBreak.js';
import { ROOMBA_SWEEP_SECONDS } from './petMess.js';

export const TEMPORARY_HELP_VERSION = 1;
const PENDING_KINDS = new Set(['crew', 'petBreak', 'roomba']);
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function compactBreak(raw, dayState) {
  const restored = restorePetPlayBreakBoost(raw, dayState);
  return restored ? { day: restored.day | 0, remaining: restored.remaining, slots: restored.slots | 0 } : null;
}

function normalizeRoomba(raw, dayState) {
  if (!isRecord(raw) || !dayState) return null;
  const day = raw.day | 0;
  const remaining = Number(raw.remaining);
  // Roomba is purchased during Rush but promises a fixed active-simulation duration. Preserve the
  // remainder through a same-day phase transition; only a different day makes it stale.
  if (day !== (dayState.day | 0) || !(remaining > 0)) return null;
  return { day, remaining: clamp(remaining, 0, ROOMBA_SWEEP_SECONDS) };
}

function normalizePending(raw, dayState) {
  if (!isRecord(raw) || !dayState || !PENDING_KINDS.has(raw.kind)) return null;
  const earnedDay = raw.earnedDay | 0;
  const currentDay = dayState.day | 0;
  // Pending means the ad was already completed but the promised operational benefit could not be
  // applied. It is not an active boost, so do not silently expire it just because a calendar day
  // changed; keep it until a genuinely useful rush. A save claiming it was earned in the future is
  // invalid and is dropped.
  if (earnedDay < 1 || currentDay < earnedDay) return null;
  if (raw.kind === 'crew') {
    if (!RUSH_CREW_ROLES.includes(raw.role)) return null;
    return { kind: 'crew', role: raw.role, earnedDay };
  }
  if (raw.kind === 'petBreak') {
    const duration = finite(raw.duration) ? clamp(raw.duration, 1, PET_PLAY_BREAK_SECONDS) : PET_PLAY_BREAK_SECONDS;
    const slots = clamp(raw.slots | 0 || PET_PLAY_BREAK_SLOTS, 1, PET_PLAY_BREAK_SLOTS);
    return { kind: 'petBreak', duration, slots, earnedDay };
  }
  const duration = finite(raw.duration) ? clamp(raw.duration, 1, ROOMBA_SWEEP_SECONDS) : ROOMBA_SWEEP_SECONDS;
  return { kind: 'roomba', duration, earnedDay };
}

export function normalizeTemporaryHelp(raw, legacyBoosts, dayState) {
  if (raw == null) {
    // Task 12 migrates the two pre-existing ad-help records into one versioned payload.
    return {
      ok: true,
      legacy: true,
      data: {
        v: TEMPORARY_HELP_VERSION,
        rushCrew: restoreRushCrewBoost(legacyBoosts && legacyBoosts.rushCrew, dayState),
        petPlayBreak: compactBreak(legacyBoosts && legacyBoosts.petPlayBreak, dayState),
        roomba: null,
        pending: null,
      },
    };
  }
  if (!isRecord(raw)) return { ok: false, reason: 'shape' };
  if (raw.v !== TEMPORARY_HELP_VERSION) return { ok: false, reason: 'version' };
  for (const key of ['rushCrew', 'petPlayBreak', 'roomba', 'pending']) {
    if (raw[key] != null && !isRecord(raw[key])) return { ok: false, reason: key };
  }
  return {
    ok: true,
    legacy: false,
    data: {
      v: TEMPORARY_HELP_VERSION,
      rushCrew: restoreRushCrewBoost(raw.rushCrew, dayState),
      petPlayBreak: compactBreak(raw.petPlayBreak, dayState),
      roomba: normalizeRoomba(raw.roomba, dayState),
      pending: normalizePending(raw.pending, dayState),
    },
  };
}

export function makePendingEntitlement(offer, earnedDay) {
  if (!offer || !PENDING_KINDS.has(offer.mode) || (earnedDay | 0) < 1) return null;
  if (offer.mode === 'crew') {
    return RUSH_CREW_ROLES.includes(offer.role) ? { kind: 'crew', role: offer.role, earnedDay: earnedDay | 0 } : null;
  }
  if (offer.mode === 'petBreak') {
    return {
      kind: 'petBreak', earnedDay: earnedDay | 0,
      duration: clamp(Number(offer.duration) || PET_PLAY_BREAK_SECONDS, 1, PET_PLAY_BREAK_SECONDS),
      slots: clamp(offer.slots | 0 || PET_PLAY_BREAK_SLOTS, 1, PET_PLAY_BREAK_SLOTS),
    };
  }
  return {
    kind: 'roomba', earnedDay: earnedDay | 0,
    duration: clamp(Number(offer.duration) || ROOMBA_SWEEP_SECONDS, 1, ROOMBA_SWEEP_SECONDS),
  };
}

export function snapshotTemporaryHelp(G) {
  const d = G && G.dayState;
  const rushCrew = restoreRushCrewBoost(G && G.boosts && G.boosts.rushCrew, d);
  const petPlayBreak = compactBreak(G && G.boosts && G.boosts.petPlayBreak, d);
  const mess = G && G.petMess;
  const roombaRemaining = mess && finite(mess.roombaRemaining) ? mess.roombaRemaining : 0;
  const roomba = d && roombaRemaining > 0
    ? { day: d.day | 0, remaining: clamp(roombaRemaining, 0, ROOMBA_SWEEP_SECONDS) }
    : null;
  const pending = normalizePending(G && G.temporaryHelp && G.temporaryHelp.pending, d);
  return { v: TEMPORARY_HELP_VERSION, rushCrew, petPlayBreak, roomba, pending };
}
