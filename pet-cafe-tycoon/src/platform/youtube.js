// YouTube Playables host boundary. Local preview intentionally keeps persistence in-memory only.
const LOAD_TIMEOUT_MS = 2200;
const INTERSTITIAL_GAP_MS = 4 * 60 * 1000;

function withTimeout(promise, ms = LOAD_TIMEOUT_MS) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(null); }
    }, ms);
    Promise.resolve(promise).then(value => {
      if (done) return;
      done = true; clearTimeout(timer); resolve(value);
    }).catch(() => {
      if (done) return;
      done = true; clearTimeout(timer); resolve(null);
    });
  });
}

function safeParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (_) {
    return null;
  }
}

export function createYouTubePlatform(host = globalThis) {
  const yt = host.ytgame && host.ytgame.IN_PLAYABLES_ENV ? host.ytgame : null;

  let game = null;
  let audio = null;
  let paused = false;
  let previewSave = null;
  let saveInFlight = null;
  let pendingSave = null;
  let rewardedBusy = false;
  let interstitialBusy = false;
  let lastAdAt = 0;
  let lastScore = -1;

  const P = {
    inPlayables: !!yt,
    rewardedAvailable: !!(yt && yt.ads && typeof yt.ads.requestRewardedAd === 'function'),
    interstitialAvailable: !!(yt && yt.ads && typeof yt.ads.requestInterstitialAd === 'function'),
    language: 'en',
    get paused() { return paused; },
  };

  P.firstFrameReady = () => {
    try { yt && yt.game && yt.game.firstFrameReady(); } catch (_) {}
  };

  P.gameReady = () => {
    try { yt && yt.game && yt.game.gameReady(); } catch (_) {}
  };

  P.load = async () => {
    if (yt && yt.game && typeof yt.game.loadData === 'function') {
      const raw = await withTimeout(yt.game.loadData());
      return safeParse(raw);
    }
    return previewSave ? JSON.parse(previewSave) : null;
  };

  async function writeSave(data) {
    let raw;
    try { raw = JSON.stringify(data); } catch (_) { return false; }

    if (yt && yt.game && typeof yt.game.saveData === 'function') {
      try { await yt.game.saveData(raw); return true; } catch (_) { return false; }
    }
    previewSave = raw;
    return true;
  }

  P.save = data => {
    pendingSave = data;
    if (saveInFlight) return saveInFlight;
    saveInFlight = (async () => {
      while (pendingSave) {
        const next = pendingSave;
        pendingSave = null;
        await writeSave(next);
      }
      saveInFlight = null;
      return true;
    })();
    return saveInFlight;
  };

  P.bindAudio = a => {
    audio = a;
    if (!audio || !yt || !yt.system) return;
    try { audio.setHostMute(!yt.system.isAudioEnabled()); } catch (_) {}
    try {
      yt.system.onAudioEnabledChange(enabled => {
        if (audio) audio.setHostMute(!enabled);
      });
    } catch (_) {}
  };

  P.bindGame = g => {
    game = g;
    if (g && g.audio) P.bindAudio(g.audio);
    if (!yt || !yt.system) return;

    try {
      yt.system.onPause(() => {
        paused = true;
        if (game && game.snapshot) P.save(game.snapshot());
      });
    } catch (_) {}
    try { yt.system.onResume(() => { paused = false; }); } catch (_) {}
    try {
      const lang = yt.system.getLanguage && yt.system.getLanguage();
      if (lang && typeof lang.then === 'function') {
        lang.then(v => { if (typeof v === 'string' && v) P.language = v; }).catch(() => {});
      } else if (typeof lang === 'string' && lang) {
        P.language = lang;
      }
    } catch (_) {}
  };

  // Reputation is the stable player-skill/progression signal. Avoids tying platform score to ads
  // or raw coins, both of which can distort the meaning of an engagement score.
  P.sendScore = value => {
    const score = Math.max(0, Math.floor(Number(value) || 0));
    if (score === lastScore) return false;
    lastScore = score;
    if (!yt || !yt.engagement || typeof yt.engagement.sendScore !== 'function') return false;
    try { yt.engagement.sendScore({ value: score }); return true; } catch (_) { return false; }
  };

  P.requestRewardedAd = async (rewardId = 'pet-cafe-day-bonus-coins') => {
    if (rewardedBusy) return false;
    if (!P.rewardedAvailable) return !P.inPlayables;
    rewardedBusy = true;
    lastAdAt = Date.now();
    try { return !!(await yt.ads.requestRewardedAd(rewardId)); }
    catch (_) { return false; }
    finally { rewardedBusy = false; }
  };

  P.requestInterstitialAd = async (minGapMs = INTERSTITIAL_GAP_MS) => {
    if (!P.interstitialAvailable || interstitialBusy) return false;
    const now = Date.now();
    if (now - lastAdAt < minGapMs) return false;
    interstitialBusy = true;
    lastAdAt = now;
    try { await yt.ads.requestInterstitialAd(); return true; }
    catch (_) { return false; }
    finally { interstitialBusy = false; }
  };

  return P;
}
