import { AD_PACING } from '../sim/adPacing.js';

function blankReport() {
  return {
    rewarded: { eligible: 0, requested: 0, earned: 0 },
    interstitial: { eligible: 0, requested: 0, shown: 0 },
  };
}
function cloneReport(report) {
  return {
    rewarded: { ...report.rewarded },
    interstitial: { ...report.interstitial },
  };
}

// Runtime-only observability. These counters are intentionally NOT saved as player progress and do
// not claim SDK impressions. "Eligible" is a game decision, "requested" is a call we actually make,
// and "earned/shown" is the result returned by the host boundary.
export function installAdLaunchPolicy(platform, { now = () => Date.now() } = {}) {
  if (!platform || typeof platform !== 'object') return null;
  if (platform.__petCafeAdLaunchPolicy) return platform.__petCafeAdLaunchPolicy;

  const report = blankReport();
  const eligibilityTokens = new Set();
  let lastAnyAdRequestAt = null;
  // The minimum wall-clock gap guards HOST-PACED ads (interstitials). Rewarded offers are
  // user-initiated: a player who just watched the gift-calendar ad may still choose the summary
  // reward minutes later without being silently refused by a hidden timer.
  let lastInterstitialRequestAt = null;
  const interstitialGapReady = () => lastInterstitialRequestAt === null
    || Number(now()) - lastInterstitialRequestAt >= AD_PACING.interstitialMinGapMs;
  const baseRewarded = typeof platform.requestRewardedAd === 'function'
    ? platform.requestRewardedAd.bind(platform) : null;
  const baseInterstitial = typeof platform.requestInterstitialAd === 'function'
    ? platform.requestInterstitialAd.bind(platform) : null;

  function noteEligible(format, token) {
    const kind = format === 'interstitial' ? 'interstitial' : 'rewarded';
    const key = `${kind}:${String(token || 'untagged')}`;
    if (eligibilityTokens.has(key)) return false;
    eligibilityTokens.add(key);
    report[kind].eligible++;
    return true;
  }

  if (baseRewarded) {
    platform.requestRewardedAd = async rewardId => {
      if (platform.paused || platform.adBusy) return false;
      if (!platform.rewardedAvailable && platform.inPlayables) return false;
      report.rewarded.requested++;
      lastAnyAdRequestAt = Number(now()) || 0;
      let earned = false;
      try { earned = !!(await baseRewarded(rewardId)); }
      catch (_) { earned = false; }
      if (earned) report.rewarded.earned++;
      return earned;
    };
  }

  if (baseInterstitial) {
    platform.requestInterstitialAd = async requestedGapMs => {
      if (platform.paused || platform.adBusy || !platform.interstitialAvailable) return false;
      const at = Number(now()) || 0;
      const minGap = Math.max(
        AD_PACING.interstitialMinGapMs,
        Number.isFinite(Number(requestedGapMs)) ? Math.max(0, Number(requestedGapMs)) : 0,
      );
      if (lastAnyAdRequestAt !== null && at - lastAnyAdRequestAt < minGap) return false;
      if (!interstitialGapReady()) return false;
      report.interstitial.requested++;
      lastAnyAdRequestAt = at;
      lastInterstitialRequestAt = at;
      let shown = false;
      try { shown = !!(await baseInterstitial(minGap)); }
      catch (_) { shown = false; }
      if (shown) report.interstitial.shown++;
      return shown;
    };
  }

  const api = {
    noteEligible,
    report: () => cloneReport(report),
    get lastAnyAdRequestAt() { return lastAnyAdRequestAt; },
  };
  Object.defineProperty(platform, '__petCafeAdLaunchPolicy', { value: api, configurable: false });
  platform.canRequestAd = format => {
    if (platform.paused || platform.adBusy) return false;
    if (format === 'interstitial') return !!platform.interstitialAvailable && interstitialGapReady();
    return !!platform.rewardedAvailable || !platform.inPlayables;
  };
  platform.noteAdEligible = noteEligible;
  platform.getAdReport = api.report;
  return api;
}
