// test/ad-pacing.test.js — the placement model and the host boundary.
//
// BATCH E2 REWROTE THE PLACEMENTS, so the cases below that pinned the retired ones were rewritten
// with them (ship plan §1.7 "Cut: mystery gift, the old rare visitor, golden shot, rush crew, play
// break, roomba, smart relief, boot interstitial, the dead speed-build wiring"). What changed, and
// why each old assertion could not simply be kept:
//
//   * `relief` / `gift` / `rare-visitor` / `golden-shot` / `speed-build` keys and the single shared
//     "in-shift budget" are gone. There are four placements now — dayend, guest, service, calendar —
//     and the first three are INDEPENDENT one-per-day slots, so "a gift claim occupies relief too"
//     describes a rule the plan deliberately replaced.
//   * `bootInterstitialDue` was never called by anything; §1.7 deletes it.
//   * the interstitial cadence moved from "every second completed day from day 2" to "days 3, 5,
//     7 …", and now refuses on a day the player already watched a rewarded ad.
//   * `speedBuildEligible` survives, renamed `buildBoostEligible`, as the Build Boost threshold —
//     and it now also refuses a pad with nothing left to pay, which the old one did not.
//
// Every host-boundary case (pause lock, the 4-minute gap, eligible/requested/earned reporting, no
// fabricated preview interstitial) is UNCHANGED: that layer was already compliant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform } from '../src/platform/youtube.js';
import { installAdLaunchPolicy } from '../src/platform/adLaunchPolicy.js';
import {
  AD_PACING, SHIFT_PLACEMENTS, interstitialDueAfterShift, interstitialGapSatisfied,
  markRewardedClaim, rewardedClaimedForShift, placementClaimedForShift,
  summaryClaimedForShift, guestClaimedForShift, serviceClaimedForShift,
  guestRewardKey, serviceRewardKey,
  BUILD_BOOST_MIN_PAID_RATIO, buildBoostEligible, buildBoostAmount,
  SPECIAL_GUEST_MIN_DAY, specialGuestEligible,
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
    assert.equal(await P.requestRewardedAd('helper-pup'), true);
    now += 60_000;
    assert.equal(await P.requestInterstitialAd(), false);
    assert.deepEqual(calls, [['rewarded', 'helper-pup']]);
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

test('Batch E2: four placements, each one claim a day, each independent of the others', () => {
  assert.deepEqual(SHIFT_PLACEMENTS, ['dayend', 'guest', 'service']);
  assert.equal(AD_PACING.rewardedClaimsPerShift, 1);

  const m = { rewardedDays: {} };
  for (const placement of SHIFT_PLACEMENTS) {
    assert.equal(placementClaimedForShift(m, placement, 4), false, `${placement} starts free`);
  }
  assert.equal(markRewardedClaim(m, 4, 'dayend'), true);
  assert.equal(summaryClaimedForShift(m, 4), true);
  assert.equal(markRewardedClaim(m, 4, 'dayend'), false, 'the day-summary ×2 cannot double-claim');
  // ...and taking it silences NOTHING else. This is the whole point of the rewrite: three offers a
  // day (§1.7: "At most 3 rewarded offers per game day"), not one shared slot.
  assert.equal(guestClaimedForShift(m, 4), false);
  assert.equal(serviceClaimedForShift(m, 4), false);
  assert.equal(markRewardedClaim(m, 4, 'guest'), true);
  assert.equal(markRewardedClaim(m, 4, 'guest'), false, 'the Special Guest cannot double-claim');
  assert.equal(markRewardedClaim(m, 4, 'service'), true);
  assert.equal(markRewardedClaim(m, 4, 'service'), false, 'the service slot cannot double-claim');
  assert.equal(rewardedClaimedForShift(m, 4), true);

  // Per shift, not global.
  assert.equal(rewardedClaimedForShift(m, 5), false);
  for (const placement of SHIFT_PLACEMENTS) assert.equal(markRewardedClaim(m, 5, placement), true);
});

test('Batch E2: the Helper Pup and the Build Boost SHARE one service slot', () => {
  // §1.7a lists both against "shares the service slot, 1/day": whichever the player meets first is
  // the one they get. One key, so taking either spends the other.
  const pup = { rewardedDays: {} };
  assert.equal(markRewardedClaim(pup, 6, 'service'), true, 'Helper Pup takes the service slot');
  assert.equal(markRewardedClaim(pup, 6, 'service'), false, 'Build Boost then finds it spent');
  assert.equal(serviceClaimedForShift(pup, 6), true);
});

test('Batch E2: an unknown placement is refused rather than silently written', () => {
  const m = { rewardedDays: {} };
  // The five retired keys must not come back through the front door.
  for (const dead of ['relief', 'gift', 'speed-build', 'rare-visitor', 'golden-shot', 'summary']) {
    assert.equal(markRewardedClaim(m, 3, dead), false, `${dead} is not a placement any more`);
  }
  assert.deepEqual(m.rewardedDays, {}, 'nothing was written for a retired placement');
});

test('legacy saves: the bare numeric day key still reads as the day-summary claim', () => {
  // The old summary placement wrote `rewardedDays[day] = 1`; `dayend` keeps that exact key so a
  // save that already took today's bonus cannot take it twice after the update.
  assert.equal(summaryClaimedForShift({ rewardedDays: { 3: 1 } }, 3), true);
  assert.equal(summaryClaimedForShift({ rewardedDays: { 3: 1 } }, 4), false);
  assert.equal(markRewardedClaim({ rewardedDays: { 3: 1 } }, 3, 'dayend'), false);
  // A retired key in an old save is inert: it claims nothing and blocks nothing.
  const legacy = { rewardedDays: { 'relief:3': 1, 'gift:3': 1, 'speed-build:3': 1 } };
  assert.equal(rewardedClaimedForShift(legacy, 3), false, 'a retired key grants no claim');
  for (const placement of SHIFT_PLACEMENTS) assert.equal(markRewardedClaim(legacy, 3, placement), true);
  // ...and the new keys are the ones that stick.
  assert.equal(legacy.rewardedDays[guestRewardKey(3)], 1);
  assert.equal(legacy.rewardedDays[serviceRewardKey(3)], 1);
});

test('Batch E2: Build Boost needs a pad 40% paid that still owes something', () => {
  assert.equal(BUILD_BOOST_MIN_PAID_RATIO, 0.4);
  assert.equal(buildBoostEligible(0, 20000), false);
  assert.equal(buildBoostEligible(7999, 20000), false, 'just under 40% is not eligible');
  assert.equal(buildBoostEligible(8000, 20000), true, 'exactly 40% is eligible');
  assert.equal(buildBoostEligible(8001, 20000), true);
  // CHANGED, deliberately: the old speedBuildEligible read a fully-paid pad as eligible, which was
  // harmless only because nothing ever called it. A pad with nothing left to pay is not an offer.
  assert.equal(buildBoostEligible(20000, 20000), false, 'a fully paid pad has nothing to boost');
  assert.equal(buildBoostEligible(5000, 0), false, 'a non-positive price is never eligible');
  assert.equal(buildBoostEligible(-100, 20000), false, 'negative paid clamps to 0, not a negative ratio');
});

test('Batch E2: the Build Boost pays up to half the pad, never more than is owed', () => {
  assert.equal(buildBoostAmount(8000, 20000), 10000, 'half the PRICE, not half the remainder');
  assert.equal(buildBoostAmount(16000, 20000), 4000, 'capped by what is still owed');
  assert.equal(buildBoostAmount(20000, 20000), 0);
  assert.equal(buildBoostAmount(400, 900), 450);
  assert.equal(buildBoostAmount(0, 0), 0);
});

test('Batch E2: the Special Guest is a morning offer from day 3', () => {
  assert.equal(SPECIAL_GUEST_MIN_DAY, 3);
  assert.equal(specialGuestEligible(2, 'morning'), false, 'too early to miss a pet');
  assert.equal(specialGuestEligible(3, 'morning'), true);
  assert.equal(specialGuestEligible(20, 'morning'), true);
  for (const phase of ['rush', 'afternoon', 'closing']) {
    assert.equal(specialGuestEligible(9, phase), false, `${phase} is not the morning`);
  }
});

test('Batch E2: interstitials start after completed day 3 and run 3, 5, 7 …', () => {
  assert.equal(AD_PACING.interstitialMinGapMs, 4 * 60 * 1000);
  assert.equal(AD_PACING.interstitialFirstCompletedDay, 3);
  for (const day of [1, 2, 4, 6, 8, 10]) assert.equal(interstitialDueAfterShift(day), false, `day ${day}`);
  for (const day of [3, 5, 7, 9, 21]) assert.equal(interstitialDueAfterShift(day), true, `day ${day}`);
});

test('Batch E2: an interstitial is skipped on a day the player already watched a rewarded ad', () => {
  assert.equal(interstitialDueAfterShift(5, false), true);
  assert.equal(interstitialDueAfterShift(5, true), false, 'never right after a rewarded ad');
  // The rule reads the same predicate the day summary writes, so taking the ×2 suppresses it.
  const meta = { rewardedDays: {} };
  assert.equal(interstitialDueAfterShift(5, rewardedClaimedForShift(meta, 5)), true);
  markRewardedClaim(meta, 5, 'dayend');
  assert.equal(interstitialDueAfterShift(5, rewardedClaimedForShift(meta, 5)), false);
});

test('the interstitial gap arithmetic is boundary exact', () => {
  const gap = AD_PACING.interstitialMinGapMs;
  assert.equal(interstitialGapSatisfied(1000, 1000 + gap - 1), false);
  assert.equal(interstitialGapSatisfied(1000, 1000 + gap), true);
});

test('host report separates eligible, requested and earned; a decline does not invent a reward', async () => {
  const calls = [], realNow = Date.now; let now = 15_000_000;
  Date.now = () => now;
  try {
    const P = createYouTubePlatform(host(calls, { rewardedResult: false }));
    assert.equal(P.noteAdEligible('rewarded', 'service:3:pup'), true);
    assert.equal(P.noteAdEligible('rewarded', 'service:3:pup'), false, 'same surfaced decision counts once');
    assert.equal(await P.requestRewardedAd('pet-cafe-helper-pup'), false);
    const report = P.getAdReport();
    assert.deepEqual(report.rewarded, { eligible: 1, requested: 1, earned: 0 });
    assert.equal('impressions' in report.rewarded, false);
    assert.equal('impression' in report.rewarded, false);
  } finally { Date.now = realNow; }
});

test('a failed interstitial remains non-blocking and is reported as requested but not shown', async () => {
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

test('the standalone launch wrapper is idempotent and never double-wraps requests', async () => {
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
  assert.equal(p.canRequestAd('rewarded'),true);
  assert.equal(await p.requestRewardedAd('ready'),true);
  assert.deepEqual(calls.map(x=>x[0]),['interstitial','rewarded']);
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
