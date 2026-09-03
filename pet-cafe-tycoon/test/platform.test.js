import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform } from '../src/platform/youtube.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => m.set(k, String(v)),
  };
}

test('local preview persists state and grants the dev reward path', async () => {
  const host = { localStorage: memoryStorage() };
  const p = createYouTubePlatform(host);
  assert.equal(p.inPlayables, false);
  await p.save({ coins: 123, meta: { completedDays: 2 } });
  assert.deepEqual(await p.load(), { coins: 123, meta: { completedDays: 2 } });
  assert.equal(await p.requestRewardedAd(), true);
});

test('Playables bridge wires lifecycle, host audio, pause save and rewarded ads', async () => {
  let first = 0, ready = 0, saved = null, audioCb = null, pauseCb = null, resumeCb = null;
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
  assert.equal(await p.requestRewardedAd('pet-cafe-day-bonus-coins'), true);
});
