// Temporary rewarded relief for broad Rush pressure. This never moves customers, changes queue
// ownership, changes base patience, or grants economy value; it only holds the selected guests'
// patience at the level they had when the break began while the normal simulation keeps running.
export const PET_PLAY_BREAK_SECONDS = 15;
export const PET_PLAY_BREAK_SLOTS = 2;
const MIN_SAFE_PATIENCE = 1;
const WAIT_STATES = new Set(['queue', 'atBowl', 'atRegister']);

export function petPlayBreakEligible(c) {
  return !!c && !c.done && c.mood === 'wait' && WAIT_STATES.has(c.state) && Number.isFinite(c.patience) && c.patience > 0;
}

export function selectPetPlayBreakCustomers(customers, slots = PET_PLAY_BREAK_SLOTS) {
  return (customers || [])
    .filter(petPlayBreakEligible)
    .sort((a, b) => a.patience - b.patience || (a.id | 0) - (b.id | 0))
    .slice(0, Math.max(0, slots | 0));
}

export function makePetPlayBreakBoost(day, seconds = PET_PLAY_BREAK_SECONDS, slots = PET_PLAY_BREAK_SLOTS) {
  if ((day | 0) < 1 || !(seconds > 0) || (slots | 0) < 1) return null;
  return { day: day | 0, remaining: Math.min(PET_PLAY_BREAK_SECONDS, seconds), slots: slots | 0, recipientIds: [], needsRecipients: true };
}

export function petPlayBreakActive(boosts, dayState) {
  const b = boosts && boosts.petPlayBreak;
  return !!b && !!dayState && dayState.phase === 'rush' && (dayState.day | 0) === (b.day | 0) && b.remaining > 0;
}

export function restorePetPlayBreakBoost(saved, dayState) {
  if (!saved || typeof saved !== 'object' || !dayState || dayState.phase !== 'rush') return null;
  const day = saved.day | 0;
  const remaining = Number(saved.remaining);
  const slots = Math.max(1, Math.min(PET_PLAY_BREAK_SLOTS, saved.slots | 0 || PET_PLAY_BREAK_SLOTS));
  if (day !== (dayState.day | 0) || !(remaining > 0)) return null;
  return { day, remaining: Math.min(PET_PLAY_BREAK_SECONDS, remaining), slots, recipientIds: [], needsRecipients: true };
}

function attachRecipients(G, b) {
  const picked = selectPetPlayBreakCustomers(G.customers, b.slots);
  if (picked.length < b.slots) return [];
  b.recipientIds = picked.map(c => c.id);
  b.needsRecipients = false;
  for (const c of picked) {
    // A guest can be only a few hundredths of a second from leaving when the ad resolves. A tiny
    // one-second safety floor ensures the very next simulation tick cannot expire before this
    // post-sim controller gets to restore patience. This is not a stacking top-up: it is captured
    // once, then held flat for the break's duration.
    const floor = Math.max(MIN_SAFE_PATIENCE, c.patience);
    c.patience = floor;
    c._petBreakFloor = floor;
  }
  return picked;
}

export function startPetPlayBreak(G, dayState, seconds = PET_PLAY_BREAK_SECONDS, slots = PET_PLAY_BREAK_SLOTS) {
  if (!G || !dayState || dayState.phase !== 'rush') return [];
  const boost = makePetPlayBreakBoost(dayState.day, seconds, slots);
  if (!boost) return [];
  const picked = attachRecipients(G, boost);
  if (picked.length < boost.slots) return [];
  if (!G.boosts || typeof G.boosts !== 'object') G.boosts = {};
  G.boosts.petPlayBreak = boost;
  return picked;
}

function clearRecipientFields(customers, ids) {
  if (!ids || !ids.length) return;
  const set = new Set(ids);
  for (const c of customers || []) if (c && set.has(c.id)) delete c._petBreakFloor;
}

// Called AFTER customer + staff simulation each frame. Any ordinary counter/bowl/register patience
// drain (including world.js's stuck-register watchdog) has already happened, so restoring the held
// floor here covers every drain path without teaching those core systems about monetization.
export function stepPetPlayBreak(G, dayState, dt) {
  const b = G && G.boosts && G.boosts.petPlayBreak;
  if (!b) return { active: false, assigned: [] };
  if (!petPlayBreakActive(G.boosts, dayState)) {
    clearRecipientFields(G.customers, b.recipientIds);
    delete G.boosts.petPlayBreak;
    return { active: false, assigned: [], expired: true };
  }

  let assigned = [];
  if (b.needsRecipients || !Array.isArray(b.recipientIds) || b.recipientIds.length === 0) {
    assigned = attachRecipients(G, b);
    // On reload the live customer list intentionally starts empty. Preserve the remaining reward
    // until two genuinely stressed guests exist again instead of burning rewarded time in vacuum.
    if (assigned.length < b.slots) return { active: true, assigned: [] };
  }

  const idSet = new Set(b.recipientIds);
  for (const c of G.customers || []) {
    if (!c || !idSet.has(c.id)) continue;
    if (c.done || c.state === 'leave') { delete c._petBreakFloor; continue; }
    const floor = Number.isFinite(c._petBreakFloor) ? c._petBreakFloor : Math.max(MIN_SAFE_PATIENCE, c.patience || 0);
    c._petBreakFloor = floor;
    c.patience = Math.max(c.patience || 0, floor);
  }

  b.remaining = Math.max(0, b.remaining - Math.max(0, dt || 0));
  if (b.remaining <= 0) {
    clearRecipientFields(G.customers, b.recipientIds);
    delete G.boosts.petPlayBreak;
    return { active: false, assigned, expired: true };
  }
  return { active: true, assigned };
}
