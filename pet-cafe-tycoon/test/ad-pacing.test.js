import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform } from '../src/platform/youtube.js';
import { installAdLaunchPolicy } from '../src/platform/adLaunchPolicy.js';
import {
  AD_PACING, interstitialDueAfterShift, interstitialGapSatisfied, bootInterstitialDue,
  markRewardedClaim, purchaseBridgeEnabled, rewardedClaimedForShift,
  summaryClaimedForShift, inShiftClaimedForShift,
  SPEED_BUILD_MIN_PAID_RATIO, speedBuildEligible, speedBuildRewardKey,
} from '../src/sim/adPacing.js';

function host(calls, { rewardedResult = true, interstitialFails = false } = {}) {
  return {
    ytgame: {
      IN_PLAYABLES_ENV: true,
      game: { firstFrameReady(){}, gameReady(){}, async loadData(){ return ''; }, async saveData(){ return true; } },
      system: { isAudioEnabled(){ return true; }, onAudioEnabledChange(){}, onPause(){}, onResume(){}, getLanguage(){ return 'en'; } },
      engagement: { sendScore(){} },
      ads: {
        async requestRewardedAd(id) { calls.push(['rewarded', id]); return rewardedResult; },
        async requestInterstitialAd() { calls.push(['interstitial']); if (interstitialFails) throw new Error('host failed'); return true; },
      },
    },
  };
}

test('rewarded ad blocks an immediate interstitial instead of stacking ads', async () => {
  const calls = [], realNow = Date.now; let now = 1_000_000;
  Date.now = () => now;
  try {
    const P = createYouTubePlatform(host(calls));
    assert.equal(await P.requestRewardedAd('rush-help'), true);
    now += 60_000;
    assert.equal(await P.requestInterstitialAd(), false);
    assert.deepEqual(calls, [['rewarded', 'rush-help']]);
  } finally { Date.now = realNow; }
});

test('interstitial becomes eligible again only after the four-minute ad gap', async () => {
  const calls = [], realNow = Date.now; let now = 5_000_000;
  Date.now = () => now;
  try {
    const P = createYouTubePlatform(host(calls));
    await P.requestRewardedAd('day-bonus');
    now += 4 * 60 * 1000 - 1;
    assert.equal(await P.requestInterstitialAd(), false);
    now += 1;
    assert.equal(await P.requestInterstitialAd(), true);
    assert.deepEqual(calls.map(x => x[0]), ['rewarded', 'interstitial']);
  } finally { Date.now = realNow; }
});

test('two interstitial requests inside the spacing window cannot double-fire', async () => {
  const calls = [], realNow = Date.now; let now = 10_000_000;
  Date.now = () => now;
  try {
    const P = createYouTubePlatform(host(calls));
    assert.equal(await P.requestInterstitialAd(0), true);
    now += 1000;
    assert.equal(await P.requestInterstitialAd(), false);
    assert.equal(calls.filter(x => x[0] === 'interstitial').length, 1);
  } finally { Date.now = realNow; }
});

test('preview mode never fabricates an interstitial but keeps rewarded testing usable', async () => {
  const P = createYouTubePlatform({});
  assert.equal(P.inPlayables, false);
  assert.equal(await P.requestRewardedAd('preview-reward'), true);
  assert.equal(await P.requestInterstitialAd(0), false);
});

test('placement model: each placement claims once per shift, independently of the others', () => {
  // Summary and in-shift budgets are independent: taking the summary reward never silences the
  // in-shift helper, and each placement still refuses a second claim.
  const s = { rewardedDays: {} };
  assert.equal(markRewardedClaim(s, 4, 'summary'), true);
  assert.equal(summaryClaimedForShift(s, 4), true);
  assert.equal(inShiftClaimedForShift(s, 4), false);
  assert.equal(markRewardedClaim(s, 4, 'summary'), false, 'summary cannot double-claim');
  assert.equal(markRewardedClaim(s, 4, 'relief'), true, 'in-shift budget is independent of summary');

  const g = { rewardedDays: {} };
  assert.equal(markRewardedClaim(g, 5, 'relief'), true);
  assert.equal(markRewardedClaim(g, 5, 'gift'), false, 'relief and mystery gift share the in-shift budget');
  assert.equal(markRewardedClaim(g, 5, 'gift'), false);
  assert.equal(rewardedClaimedForShift(g, 5), true);

  const gift = { rewardedDays: {} };
  assert.equal(markRewardedClaim(gift, 6, 'gift'), true);
  assert.equal(markRewardedClaim(gift, 6, 'relief'), false, 'gift claim occupies the in-shift budget');
  assert.equal(summaryClaimedForShift(gift, 6), false);
  assert.equal(markRewardedClaim(gift, 6, 'summary'), true, 'summary stays available after a gift claim');
});

test('Task 1.7: speed-build is unavailable below 40% paid and available at/above it', () => {
  assert.equal(SPEED_BUILD_MIN_PAID_RATIO, 0.4);
  assert.equal(speedBuildEligible(0, 20000), false);
  assert.equal(speedBuildEligible(7999, 20000), false, 'just under 40% is not eligible');
  assert.equal(speedBuildEligible(8000, 20000), true, 'exactly 40% is eligible');
  assert.equal(speedBuildEligible(8001, 20000), true);
  assert.equal(speedBuildEligible(20000, 20000), true, 'fully paid (already built) still reads eligible');
  assert.equal(speedBuildEligible(5000, 0), false, 'a non-positive price is never eligible');
  assert.equal(speedBuildEligible(-100, 20000), false, 'negative paid clamps to 0, not negative ratio');
});

test('Task 1.7: speed-build claims once per shift and shares the in-shift budget with relief/gift', () => {
  const s = { rewardedDays: {} };
  assert.equal(inShiftClaimedForShift(s, 14), false);
  assert.equal(markRewardedClaim(s, 14, 'speed-build'), true);
  assert.equal(inShiftClaimedForShift(s, 14), true);
  assert.equal(markRewardedClaim(s, 14, 'speed-build'), false, 'speed-build cannot double-claim');
  assert.equal(rewardedClaimedForShift(s, 14), true);
  // Sharing the budget: a speed-build claim occupies relief and gift too, and vice versa.
  assert.equal(markRewardedClaim(s, 14, 'relief'), false, 'speed-build claim occupies the in-shift budget');
  assert.equal(markRewardedClaim(s, 14, 'gift'), false, 'speed-build claim occupies the in-shift budget');
  // Summary stays independent of the in-shift budget in either direction.
  assert.equal(summaryClaimedForShift(s, 14), false);
  assert.equal(markRewardedClaim(s, 14, 'summary'), true, 'summary stays available after a speed-build claim');

  const r = { rewardedDays: {} };
  assert.equal(markRewardedClaim(r, 9, 'relief'), true);
  assert.equal(markRewardedClaim(r, 9, 'speed-build'), false, 'relief claim occupies speed-build too');

  const g = { rewardedDays: {} };
  assert.equal(markRewardedClaim(g, 9, 'gift'), true);
  assert.equal(markRewardedClaim(g, 9, 'speed-build'), false, 'gift claim occupies speed-build too');

  // A new shift resets the budget independently of the previous day.
  const fresh = { rewardedDays: { [speedBuildRewardKey(14)]: 1 } };
  assert.equal(inShiftClaimedForShift(fresh, 14), true);
  assert.equal(inShiftClaimedForShift(fresh, 15), false, 'speed-build claim is per-shift, not global');
  assert.equal(markRewardedClaim(fresh, 15, 'speed-build'), true);
});

test('Task 39: legacy numeric and relief claims are both recognized without save migration', () => {
  assert.equal(rewardedClaimedForShift({ rewardedDays: { 3: 1 } }, 3), true);
  assert.equal(rewardedClaimedForShift({ rewardedDays: { 'relief:3': 1 } }, 3), true);
  assert.equal(rewardedClaimedForShift({ rewardedDays: { 3: 1 } }, 4), false);
  assert.equal(inShiftClaimedForShift({ rewardedDays: { 'gift:3': 1 } }, 3), true, 'gift key recognized');
});

test('launch cadence: continue-transition interstitials every second shift, boot spot for returning players', () => {
  assert.equal(AD_PACING.rewardedClaimsPerShift, 1);
  assert.equal(purchaseBridgeEnabled(), false);
  assert.equal(AD_PACING.interstitialMinGapMs, 4 * 60 * 1000);
  for (const day of [1, 3, 5, 7, 9]) assert.equal(interstitialDueAfterShift(day), false, `day ${day}`);
  for (const day of [2, 4, 6, 8, 12]) assert.equal(interstitialDueAfterShift(day), true, `day ${day}`);
  assert.equal(bootInterstitialDue(0), false, 'new players get a clean first session');
  assert.equal(bootInterstitialDue(2), false);
  assert.equal(bootInterstitialDue(3), true, 'returning players get one boot spot');
  assert.equal(bootInterstitialDue(30), true);
});

test('Task 39: interstitial gap arithmetic is boundary exact', () => {
  const gap = AD_PACING.interstitialMinGapMs;
  assert.equal(interstitialGapSatisfied(1000, 1000 + gap - 1), false);
  assert.equal(interstitialGapSatisfied(1000, 1000 + gap), true);
});

test('Task 39: host report separates eligible, requested and earned; decline does not invent reward', async () => {
  const calls = [], realNow = Date.now; let now = 15_000_000;
  Date.now = () => now;
  try {
    const P = createYouTubePlatform(host(calls, { rewardedResult: false }));
    assert.equal(P.noteAdEligible('rewarded', 'rush:3:cashier'), true);
    assert.equal(P.noteAdEligible('rewarded', 'rush:3:cashier'), false, 'same surfaced decision counts once');
    assert.equal(await P.requestRewardedAd('rush-cashier'), false);
    const report = P.getAdReport();
    assert.deepEqual(report.rewarded, { eligible: 1, requested: 1, earned: 0 });
    assert.equal('impressions' in report.rewarded, false);
    assert.equal('impression' in report.rewarded, false);
  } finally { Date.now = realNow; }
});

test('Task 39: failed interstitial remains non-blocking and is reported as requested but not shown', async () => {
  const calls = [], realNow = Date.now; let now = 20_000_000;
  Date.now = () => now;
  try {
    const P = createYouTubePlatform(host(calls, { interstitialFails: true }));
    P.noteAdEligible('interstitial', 'continue:3');
    assert.equal(await P.requestInterstitialAd(), false);
    assert.equal(P.adBusy, false);
    assert.deepEqual(P.getAdReport().interstitial, { eligible: 1, requested: 1, shown: 0 });
  } finally { Date.now = realNow; }
});

test('Task 39: standalone launch wrapper is idempotent and never double-wraps requests', async () => {
  let calls = 0;
  const p = {
    inPlayables: true, rewardedAvailable: true, interstitialAvailable: false,
    paused: false, adBusy: false,
    async requestRewardedAd() { calls++; return true; },
    async requestInterstitialAd() { return false; },
  };
  const a = installAdLaunchPolicy(p, { now: () => 1_000_000 });
  const b = installAdLaunchPolicy(p, { now: () => 2_000_000 });
  assert.equal(a, b);
  assert.equal(await p.requestRewardedAd('one'), true);
  assert.equal(calls, 1);
  assert.deepEqual(p.getAdReport().rewarded, { eligible: 0, requested: 1, earned: 1 });
});

test('rewarded ads are user-initiated and allowed after an interstitial', async () => {
  let now=1_000_000; const calls=[];
  const p=createYouTubePlatform(host(calls),{now:()=>now});
  assert.equal(await p.requestInterstitialAd(0),true);
  // Rewarded ads are user-initiated so they are not blocked by the interstitial gap
  assert.equal(p.canRequestAd('rewarded'),true);
  assert.equal(await p.requestRewardedAd('ready'),true);
  assert.deepEqual(calls.map(x=>x[0]),['interstitial','rewarded']);
  // An interstitial right after IS blocked by the recent ad gap
  assert.equal(p.canRequestAd('interstitial'),false);
  assert.equal(await p.requestInterstitialAd(0),false);
});

test('rewarded requests allow successive user-initiated calls unless adBusy', async () => {
  let now=0,calls=0;
  const p={rewardedAvailable:true,inPlayables:true,adBusy:false,async requestRewardedAd(){calls++;return true;}};
  installAdLaunchPolicy(p,{now:()=>now});
  assert.equal(await p.requestRewardedAd('first'),true);
  assert.equal(await p.requestRewardedAd('second'),true);
  assert.equal(calls,2);
  p.adBusy = true;
  assert.equal(await p.requestRewardedAd('busy'),false);
  assert.equal(calls,2);
});

