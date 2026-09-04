// Pure transient worker tuning for contextual Rush Help.
//
// Important balance contract: rewarded Rush Crew never invents an ad-only super-stat. It borrows
// exactly ONE existing worker-upgrade tier for the current rush, so permanent upgrades retain the
// same meaning and the effect disappears automatically when the phase/day no longer matches.
export const RUSH_CREW_ROLES = Object.freeze(['runner', 'cashier', 'cleaner']);

export function makeRushCrewBoost(role, day) {
  if (!RUSH_CREW_ROLES.includes(role)) return null;
  return { role, day: Math.max(1, day | 0) };
}

export function rushCrewActive(boosts, dayState) {
  const b = boosts && boosts.rushCrew;
  return !!(
    b && RUSH_CREW_ROLES.includes(b.role) && dayState && dayState.phase === 'rush' &&
    (b.day | 0) === (dayState.day | 0)
  );
}

export function restoreRushCrewBoost(raw, dayState) {
  const b = raw && typeof raw === 'object' ? makeRushCrewBoost(raw.role, raw.day) : null;
  return b && rushCrewActive({ rushCrew: b }, dayState) ? b : null;
}

export function rushCrewHasBenefit(levels, role) {
  const L = levels || {};
  if (role === 'runner') {
    const r = L.runner || {};
    return (r.speed | 0) < 3 || (r.carry | 0) < 3;
  }
  if (role === 'cashier') return (((L.cashier || {}).speed) | 0) < 3;
  if (role === 'cleaner') return (((L.cleaner || {}).speed) | 0) < 3;
  return false;
}

function tier(n) { return Math.max(0, Math.min(3, n | 0)); }

// `out` is supplied by the browser staff system as a reusable scratch object. Returning `base`
// when inactive means the normal 60fps path allocates nothing and remains byte-for-behaviour the
// same as before this feature existed.
export function staffLevelsWithRushCrew(base, boosts, dayState, out) {
  if (!rushCrewActive(boosts, dayState)) return base;
  const b = boosts.rushCrew;
  const target = out || {
    runner: { speed: 0, carry: 0 }, cashier: { speed: 0 }, cleaner: { speed: 0 },
  };
  const src = base || {};
  const runner = src.runner || {}, cashier = src.cashier || {}, cleaner = src.cleaner || {};
  target.runner.speed = tier(runner.speed);
  target.runner.carry = tier(runner.carry);
  target.cashier.speed = tier(cashier.speed);
  target.cleaner.speed = tier(cleaner.speed);

  if (b.role === 'runner') {
    target.runner.speed = tier(target.runner.speed + 1);
    target.runner.carry = tier(target.runner.carry + 1);
  } else if (b.role === 'cashier') {
    target.cashier.speed = tier(target.cashier.speed + 1);
  } else if (b.role === 'cleaner') {
    target.cleaner.speed = tier(target.cleaner.speed + 1);
  }
  return target;
}
