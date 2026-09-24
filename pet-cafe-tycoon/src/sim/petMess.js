// Pet-floor mess rules are deliberately cosmetic/operational: no coin loss, patience damage,
// navigation blocking or economy multiplier. Pawprints exist to make the pet-cafe fantasy visible;
// the owner wipes one by standing over it. Roomba Assist, the rewarded offer they used to justify,
// went with the rest of the dead placements in Batch E2 (ship plan 1.7 "Cut").
export const PET_MESS_MIN_DAY = 2;
export const PET_MESS_MAX = 4;
export const PET_MESS_SPAWN_COOLDOWN = 7;
export const PET_MESS_CLEAN_SECONDS = 0.42;

export function shouldSpawnPetMess(day, customerId, currentCount, secondsSinceLast = Infinity) {
  if ((day | 0) < PET_MESS_MIN_DAY) return false;
  if ((currentCount | 0) >= PET_MESS_MAX) return false;
  if (Number(secondsSinceLast) < PET_MESS_SPAWN_COOLDOWN) return false;
  // Deterministic one-in-three cadence: stable for tests/replays and never tied to spending/ad state.
  return (Math.abs((customerId | 0) * 5 + (day | 0) * 7) % 3) === 0;
}

export function petMessOffset(customerId) {
  const i = Math.abs(customerId | 0);
  const angle = ((i * 137.5) % 360) * Math.PI / 180;
  const radius = 0.34 + (i % 3) * 0.09;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}
