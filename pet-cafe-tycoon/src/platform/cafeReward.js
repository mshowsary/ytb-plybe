// Preview buttons explicitly say "Try bonus". In YouTube only the host's earned result grants it.
export async function requestCafeReward(platform, id) {
  if (platform?.paused || platform?.adBusy) return false;
  if (!platform?.inPlayables && !platform?.rewardedAvailable) return true;
  if (!platform?.rewardedAvailable || typeof platform.requestRewardedAd !== 'function') return false;
  try { return (await platform.requestRewardedAd(id)) === true; }
  catch { return false; }
}
