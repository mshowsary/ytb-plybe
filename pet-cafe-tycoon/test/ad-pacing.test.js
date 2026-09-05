import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform } from '../src/platform/youtube.js';

function host(calls) {
  return {
    ytgame: {
      IN_PLAYABLES_ENV: true,
      game: { firstFrameReady(){}, gameReady(){}, async loadData(){ return ''; }, async saveData(){ return true; } },
      system: { isAudioEnabled(){ return true; }, onAudioEnabledChange(){}, onPause(){}, onResume(){}, getLanguage(){ return 'en'; } },
      engagement: { sendScore(){} },
      ads: {
        async requestRewardedAd(id) { calls.push(['rewarded', id]); return true; },
        async requestInterstitialAd() { calls.push(['interstitial']); return true; },
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
