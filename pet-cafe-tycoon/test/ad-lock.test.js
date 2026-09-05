import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform } from '../src/platform/youtube.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function hostWithAds(rewardRequest, interstitialRequest = async () => {}) {
  let pauseCb = null, resumeCb = null;
  const host = {
    ytgame: {
      IN_PLAYABLES_ENV: true,
      game: { loadData: async () => '', saveData: async () => {} },
      system: {
        isAudioEnabled: () => true,
        onAudioEnabledChange() {},
        onPause(cb) { pauseCb = cb; },
        onResume(cb) { resumeCb = cb; },
        getLanguage: () => 'en',
      },
      ads: { requestRewardedAd: rewardRequest, requestInterstitialAd: interstitialRequest },
    },
  };
  return { host, pause: () => pauseCb && pauseCb(), resume: () => resumeCb && resumeCb() };
}

test('rewarded and interstitial formats share one transaction lock', async () => {
  const reward = deferred();
  let rewardedCalls = 0, interstitialCalls = 0;
  const h = hostWithAds(
    () => { rewardedCalls++; return reward.promise; },
    async () => { interstitialCalls++; },
  );
  const p = createYouTubePlatform(h.host);
  p.bindGame({ P:{ vx:0, vz:0 }, snapshot:() => ({ v:4 }) });

  const rewarded = p.requestRewardedAd('immutable-offer');
  assert.equal(p.adBusy, true);
  assert.equal(p.adKind, 'rewarded');
  assert.equal(await p.requestInterstitialAd(0), false);
  assert.equal(interstitialCalls, 0, 'interstitial must not overlap a rewarded transaction');

  reward.resolve(true);
  assert.equal(await rewarded, true);
  assert.equal(rewardedCalls, 1);
  assert.equal(p.adBusy, false);

  assert.equal(await p.requestInterstitialAd(0), true);
  assert.equal(interstitialCalls, 1);
});

test('earned reward stays locked and unresolved until host resume', async () => {
  const reward = deferred();
  const h = hostWithAds(() => reward.promise);
  const p = createYouTubePlatform(h.host);
  const game = { P:{ vx:3, vz:-2 }, _force:{ x:1, z:1 }, snapshot:() => ({ v:4 }) };
  p.bindGame(game);

  const claim = p.requestRewardedAd('crew:runner');
  h.pause();
  assert.equal(p.paused, true);
  assert.equal(game.P.vx, 0);
  assert.equal(game.P.vz, 0);
  assert.equal(game._force, null);
  reward.resolve(true);

  let settled = false;
  claim.then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false, 'gameplay caller must not receive earned reward under host pause');
  assert.equal(p.adBusy, true, 'transaction lock must remain held while host is paused');
  assert.equal(await p.requestInterstitialAd(0), false);

  h.resume();
  assert.equal(await claim, true);
  assert.equal(settled, true);
  assert.equal(p.adBusy, false);
});

test('failed ad request also holds the shared lock until resume, then releases cleanly', async () => {
  const reward = deferred();
  const h = hostWithAds(() => reward.promise);
  const p = createYouTubePlatform(h.host);
  p.bindGame({ P:{ vx:0, vz:0 }, snapshot:() => ({ v:4 }) });

  const claim = p.requestRewardedAd('pet-break');
  h.pause();
  reward.reject(new Error('sdk unavailable'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(p.adBusy, true);
  h.resume();
  assert.equal(await claim, false);
  assert.equal(p.adBusy, false);
});

test('no ad format can begin while host-paused', async () => {
  let rewardedCalls = 0, interstitialCalls = 0;
  const h = hostWithAds(
    async () => { rewardedCalls++; return true; },
    async () => { interstitialCalls++; },
  );
  const p = createYouTubePlatform(h.host);
  p.bindGame({ P:{ vx:0, vz:0 }, snapshot:() => ({ v:4 }) });
  h.pause();
  assert.equal(await p.requestRewardedAd('x'), false);
  assert.equal(await p.requestInterstitialAd(0), false);
  assert.equal(rewardedCalls, 0);
  assert.equal(interstitialCalls, 0);
  h.resume();
});
