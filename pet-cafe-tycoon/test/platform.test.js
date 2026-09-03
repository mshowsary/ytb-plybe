import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform } from '../src/platform/youtube.js';

test('local preview persists state in-memory and grants the dev reward path', async () => {
  const p = createYouTubePlatform({});
  assert.equal(p.inPlayables, false);
  await p.save({ coins: 123, meta: { completedDays: 2 } });
  assert.deepEqual(await p.load(), { coins: 123, meta: { completedDays: 2 } });
  assert.equal(await p.requestRewardedAd(), true);
  assert.equal(p.sendScore(12), false);
});

test('Playables bridge wires lifecycle, audio, pause save, engagement and ads', async () => {
  let first = 0, ready = 0, saved = null, audioCb = null, pauseCb = null, resumeCb = null;
  const scores = [];
  const host = {
    ytgame: {
      IN_PLAYABLES_ENV: true,
      game: {
        firstFrameReady: () => first++,
        gameReady: () => ready++,
        loadData: async () => JSON.stringify({ coins: 42 }),
        saveData: async raw => { saved = raw; },
      },
      system: {
        isAudioEnabled: () => false,
        onAudioEnabledChange: cb => { audioCb = cb; },
        onPause: cb => { pauseCb = cb; },
        onResume: cb => { resumeCb = cb; },
        getLanguage: () => 'fr',
      },
      engagement: {
        sendScore: model => scores.push(model.value),
      },
      ads: {
        requestRewardedAd: async id => id === 'pet-cafe-day-bonus-coins',
        requestInterstitialAd: async () => {},
      },
    },
  };

  const p = createYouTubePlatform(host);
  p.firstFrameReady(); p.gameReady();
  assert.equal(first, 1); assert.equal(ready, 1);
  assert.deepEqual(await p.load(), { coins: 42 });

  const mute = [];
  let snapshots = 0;
  p.bindGame({ audio: { setHostMute: v => mute.push(v) }, snapshot: () => ({ n: ++snapshots }) });
  assert.deepEqual(mute, [true]);
  audioCb(true); assert.deepEqual(mute, [true, false]);

  pauseCb();
  assert.equal(p.paused, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(saved, JSON.stringify({ n: 1 }));
  resumeCb(); assert.equal(p.paused, false);
  assert.equal(p.language, 'fr');

  assert.equal(p.sendScore(9.8), true);
  assert.equal(p.sendScore(9.2), false); // floors to same value, no duplicate platform call
  assert.equal(p.sendScore(12), true);
  assert.deepEqual(scores, [9, 12]);
  assert.equal(await p.requestRewardedAd('pet-cafe-day-bonus-coins'), true);
});
