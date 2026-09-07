import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform } from '../src/platform/youtube.js';
import { installAdLaunchPolicy } from '../src/platform/adLaunchPolicy.js';
import {
  AD_PACING, interstitialDueAfterShift, interstitialGapSatisfied, bootInterstitialDue,
  markRewardedClaim, purchaseBridgeEnabled, rewardedClaimedForShift,
  summaryClaimedForShift, inShiftClaimedForShift,
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

test('launch spacing applies from interstitial to rewarded as well', async () => {
  let now=1_000_000; const calls=[];
  const p=createYouTubePlatform(host(calls),{now:()=>now});
  assert.equal(await p.requestInterstitialAd(0),true);
  assert.equal(p.canRequestAd('rewarded'),false);
  assert.equal(await p.requestRewardedAd('too-soon'),false);
  now+=AD_PACING.interstitialMinGapMs;
  assert.equal(p.canRequestAd('rewarded'),true);
  assert.equal(await p.requestRewardedAd('ready'),true);
  assert.deepEqual(calls.map(x=>x[0]),['interstitial','rewarded']);
});

test('a request at clock zero still starts the shared cooldown',async()=>{
 let now=0,calls=0;
 const p={rewardedAvailable:true,inPlayables:true,async requestRewardedAd(){calls++;return true;}};
 installAdLaunchPolicy(p,{now:()=>now});
 assert.equal(await p.requestRewardedAd('first'),true);now=1;
 assert.equal(await p.requestRewardedAd('second'),false);assert.equal(calls,1);
});
