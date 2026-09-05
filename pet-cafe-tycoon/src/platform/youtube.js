// YouTube Playables host boundary. Local preview intentionally keeps persistence in-memory only.
export const LOAD_STATUS = Object.freeze({
  LOADED: 'loaded',
  EMPTY: 'empty',
  PENDING: 'pending',
  ERROR: 'error',
  INVALID: 'invalid',
});

const LOAD_TIMEOUT_MS = 2200;
const INTERSTITIAL_GAP_MS = 4 * 60 * 1000;

function loadResult(status, data) {
  return data === undefined ? { status } : { status, data };
}

function classifyLoad(raw) {
  if (raw == null) return loadResult(LOAD_STATUS.EMPTY);
  if (typeof raw !== 'string') return loadResult(LOAD_STATUS.INVALID);
  if (!raw.trim()) return loadResult(LOAD_STATUS.EMPTY);
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return loadResult(LOAD_STATUS.INVALID);
    }
    return loadResult(LOAD_STATUS.LOADED, data);
  } catch (_) {
    return loadResult(LOAD_STATUS.INVALID);
  }
}

function waitForLoadOrTimeout(promise, ms, onTimeout) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      onTimeout();
      resolve(loadResult(LOAD_STATUS.PENDING));
    }, ms);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

export function createYouTubePlatform(host = globalThis, options = {}) {
  const yt = host.ytgame && host.ytgame.IN_PLAYABLES_ENV ? host.ytgame : null;
  const configuredTimeout = Number(options.loadTimeoutMs);
  const loadTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 0
    ? configuredTimeout
    : LOAD_TIMEOUT_MS;

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
  let loadRequest = null;
  let currentLoadOutcome = yt ? loadResult(LOAD_STATUS.PENDING) : null;
  let loadTimedOut = false;
  let writesAllowed = !yt;
  const pauseListeners = new Set();

  const P = {
    inPlayables: !!yt,
    rewardedAvailable: !!(yt && yt.ads && typeof yt.ads.requestRewardedAd === 'function'),
    interstitialAvailable: !!(yt && yt.ads && typeof yt.ads.requestInterstitialAd === 'function'),
    language: 'en',
    get paused() { return paused; },
    get loadOutcome() { return currentLoadOutcome; },
    get saveProtected() { return !!yt && !writesAllowed; },
  };

  function setHostPaused(next) {
    const value = !!next;
    if (value === paused) return;
    paused = value;
    for (const fn of pauseListeners) {
      try { fn(paused); } catch (_) {}
    }
  }

  P.onPauseChange = fn => {
    if (typeof fn !== 'function') return () => {};
    pauseListeners.add(fn);
    return () => pauseListeners.delete(fn);
  };

  P.firstFrameReady = () => {
    try { yt && yt.game && yt.game.firstFrameReady(); } catch (_) {}
  };

  P.gameReady = () => {
    try { yt && yt.game && yt.game.gameReady(); } catch (_) {}
  };

  function authorizeDeliveredLoad(result) {
    if (result.status === LOAD_STATUS.LOADED || result.status === LOAD_STATUS.EMPTY) {
      writesAllowed = true;
    }
    return result;
  }

  function startPlayablesLoad() {
    if (loadRequest) return loadRequest;
    currentLoadOutcome = loadResult(LOAD_STATUS.PENDING);
    loadRequest = (async () => {
      try {
        const raw = await yt.game.loadData();
        const result = classifyLoad(raw);
        currentLoadOutcome = result;
        // If the UI already timed out, retain the late result but keep writes locked until
        // a later load() call explicitly receives that authoritative result.
        if (!loadTimedOut) authorizeDeliveredLoad(result);
        return result;
      } catch (_) {
        const result = loadResult(LOAD_STATUS.ERROR);
        currentLoadOutcome = result;
        return result;
      }
    })();
    return loadRequest;
  }

  P.load = async () => {
    if (!yt) {
      const result = previewSave == null
        ? loadResult(LOAD_STATUS.EMPTY)
        : classifyLoad(previewSave);
      currentLoadOutcome = result;
      return authorizeDeliveredLoad(result);
    }

    if (!yt.game || typeof yt.game.loadData !== 'function') {
      currentLoadOutcome = loadResult(LOAD_STATUS.ERROR);
      return currentLoadOutcome;
    }

    const request = startPlayablesLoad();
    if (currentLoadOutcome.status !== LOAD_STATUS.PENDING) {
      return authorizeDeliveredLoad(currentLoadOutcome);
    }

    const result = await waitForLoadOrTimeout(request, loadTimeoutMs, () => {
      loadTimedOut = true;
    });
    return result.status === LOAD_STATUS.PENDING ? result : authorizeDeliveredLoad(result);
  };

  async function writeSave(data) {
    let raw;
    try { raw = JSON.stringify(data); } catch (_) { return false; }

    if (yt && yt.game && typeof yt.game.saveData === 'function') {
      try { await yt.game.saveData(raw); return true; } catch (_) { return false; }
    }
    if (yt) return false;
    previewSave = raw;
    return true;
  }

  P.save = data => {
    // YouTube explicitly rejects saveData before a successful loadData. More importantly,
    // keeping this gate closed prevents a timed-out fresh session from overwriting a late save.
    if (yt && !writesAllowed) return Promise.resolve(false);

    pendingSave = data;
    if (saveInFlight) return saveInFlight;
    saveInFlight = (async () => {
      let ok = true;
      while (pendingSave) {
        const next = pendingSave;
        pendingSave = null;
        if (!(await writeSave(next))) {
          ok = false;
          break;
        }
      }
      return ok;
    })().finally(() => {
      saveInFlight = null;
    });
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
        // Save first while state is still coherent, then notify the frame owner to stop scheduling.
        if (game && game.snapshot) P.save(game.snapshot());
        setHostPaused(true);
      });
    } catch (_) {}
    try { yt.system.onResume(() => { setHostPaused(false); }); } catch (_) {}
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
