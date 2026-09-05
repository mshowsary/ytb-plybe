import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubePlatform, LOAD_STATUS } from '../src/platform/youtube.js';

function playableHost(loadData, saveData = async () => {}) {
  return {
    ytgame: {
      IN_PLAYABLES_ENV: true,
      game: { loadData, saveData },
    },
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('local preview persists state in-memory and grants the dev reward path', async () => {
  const p = createYouTubePlatform({});
  assert.equal(p.inPlayables, false);
  assert.deepEqual(await p.load(), { status: LOAD_STATUS.EMPTY });
  assert.equal(await p.save({ coins: 123, meta: { completedDays: 2 } }), true);
  assert.deepEqual(await p.load(), {
    status: LOAD_STATUS.LOADED,
    data: { coins: 123, meta: { completedDays: 2 } },
  });
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
  assert.deepEqual(await p.load(), { status: LOAD_STATUS.LOADED, data: { coins: 42 } });
  assert.equal(p.saveProtected, false);

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

test('true empty cloud data is distinct and unlocks writes', async () => {
  const writes = [];
  const p = createYouTubePlatform(playableHost(async () => '', async raw => writes.push(raw)));
  assert.deepEqual(await p.load(), { status: LOAD_STATUS.EMPTY });
  assert.equal(p.saveProtected, false);
  assert.equal(await p.save({ fresh: true }), true);
  assert.deepEqual(writes, [JSON.stringify({ fresh: true })]);
});

test('slow cloud success stays write-protected after timeout and is retained', async () => {
  const load = deferred();
  const writes = [];
  const p = createYouTubePlatform(
    playableHost(() => load.promise, async raw => writes.push(raw)),
    { loadTimeoutMs: 5 },
  );

  assert.deepEqual(await p.load(), { status: LOAD_STATUS.PENDING });
  assert.equal(p.saveProtected, true);
  assert.equal(await p.save({ coins: 1 }), false);
  assert.deepEqual(writes, []);

  load.resolve(JSON.stringify({ coins: 900, day: 7 }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(p.loadOutcome, {
    status: LOAD_STATUS.LOADED,
    data: { coins: 900, day: 7 },
  });

  // A late success is not permission for the already-running fresh state to save over it.
  assert.equal(p.saveProtected, true);
  assert.equal(await p.save({ coins: 2 }), false);
  assert.deepEqual(writes, []);

  // A later explicit load receives the retained authoritative save and opens the write gate.
  assert.deepEqual(await p.load(), {
    status: LOAD_STATUS.LOADED,
    data: { coins: 900, day: 7 },
  });
  assert.equal(p.saveProtected, false);
  assert.equal(await p.save({ coins: 901, day: 7 }), true);
  assert.deepEqual(writes, [JSON.stringify({ coins: 901, day: 7 })]);
});

test('load rejection is distinct and cannot become a writable new-player session', async () => {
  let writes = 0;
  const p = createYouTubePlatform(playableHost(
    async () => { throw new Error('load unavailable'); },
    async () => { writes++; },
  ));

  assert.deepEqual(await p.load(), { status: LOAD_STATUS.ERROR });
  assert.equal(p.saveProtected, true);
  assert.equal(await p.save({ coins: 5 }), false);
  assert.equal(writes, 0);
});

test('malformed or unusable cloud data is invalid and remains write-protected', async () => {
  for (const raw of ['{bad json', 'null', '123', '[]']) {
    let writes = 0;
    const p = createYouTubePlatform(playableHost(
      async () => raw,
      async () => { writes++; },
    ));
    assert.deepEqual(await p.load(), { status: LOAD_STATUS.INVALID });
    assert.equal(p.saveProtected, true);
    assert.equal(await p.save({ coins: 5 }), false);
    assert.equal(writes, 0);
  }
});

test('save reports SDK write failure after a valid load', async () => {
  const p = createYouTubePlatform(playableHost(
    async () => JSON.stringify({ coins: 10 }),
    async () => { throw new Error('save rejected'); },
  ));
  assert.equal((await p.load()).status, LOAD_STATUS.LOADED);
  assert.equal(await p.save({ coins: 11 }), false);
});
