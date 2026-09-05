// YouTube Playables host boundary. Local preview intentionally keeps persistence in-memory only.
import { resetActiveInputs } from '../core/input.js';
import { presentationScheduler } from '../core/presentationScheduler.js';

export const LOAD_STATUS = Object.freeze({
  LOADED: 'loaded',
  EMPTY: 'empty',
  PENDING: 'pending',
  ERROR: 'error',
  INVALID: 'invalid',
});

const LOAD_TIMEOUT_MS = 2200;
const SAVE_RETRY_LIMIT = 2;
const SAVE_RETRY_DELAY_MS = 120;
const INTERSTITIAL_GAP_MS = 4 * 60 * 1000;

function loadResult(status, data) {
  return data === undefined ? { status } : { status, data };
}

function classifyLoad(raw, validateLoadedData = null) {
  if (raw == null) return loadResult(LOAD_STATUS.EMPTY);
  if (typeof raw !== 'string') return loadResult(LOAD_STATUS.INVALID);
  if (!raw.trim()) return loadResult(LOAD_STATUS.EMPTY);
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return loadResult(LOAD_STATUS.INVALID);
    }

    let normalized = data;
    if (typeof validateLoadedData === 'function') {
      let checked;
      try { checked = validateLoadedData(data); }
      catch (_) { return loadResult(LOAD_STATUS.INVALID); }

      if (checked && checked.ok === true) normalized = checked.data;
      else if (checked && checked.ok === false) return loadResult(LOAD_STATUS.INVALID);
      else normalized = checked;

      if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
        return loadResult(LOAD_STATUS.INVALID);
      }
    }
    return loadResult(LOAD_STATUS.LOADED, normalized);
  } catch (_) {
    return loadResult(LOAD_STATUS.INVALID);
  }
}

function serializeSave(data) {
  try {
    const raw = JSON.stringify(data);
    return typeof raw === 'string' ? raw : null;
  } catch (_) {
    return null;
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

function wait(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

export function createYouTubePlatform(host = globalThis, options = {}) {
  const yt = host.ytgame && host.ytgame.IN_PLAYABLES_ENV ? host.ytgame : null;
  const validateLoadedData = typeof options.validateLoadedData === 'function' ? options.validateLoadedData : null;
  const configuredTimeout = Number(options.loadTimeoutMs);
  const loadTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 0
    ? configuredTimeout
    : LOAD_TIMEOUT_MS;
  const configuredRetryLimit = Number(options.saveRetryLimit);
  const saveRetryLimit = Number.isInteger(configuredRetryLimit) && configuredRetryLimit >= 0
    ? configuredRetryLimit
    : SAVE_RETRY_LIMIT;
  const configuredRetryDelay = Number(options.saveRetryDelayMs);
  const saveRetryDelayMs = Number.isFinite(configuredRetryDelay) && configuredRetryDelay >= 0
    ? configuredRetryDelay
    : SAVE_RETRY_DELAY_MS;

  let game = null;
  let audio = null;
  let paused = false;
  let previewSave = null;
  let saveInFlight = null;
  let latestSave = null;
  let saveSequence = 0;
  let savedSequence = 0;
  let adBusy = null;
  let lastAdAt = 0;
  let lastScore = -1;
  let scoreSequence = 0;
  let acknowledgedScoreSequence = 0;
  const scoreInFlight = new Map();
  let loadRequest = null;
  let currentLoadOutcome = yt ? loadResult(LOAD_STATUS.PENDING) : null;
  let loadTimedOut = false;
  let writesAllowed = !yt;
  let firstFrameReported = false;
  let gameReadyReported = false;
  const pauseListeners = new Set();

  const P = {
    inPlayables: !!yt,
    rewardedAvailable: !!(yt && yt.ads && typeof yt.ads.requestRewardedAd === 'function'),
    interstitialAvailable: !!(yt && yt.ads && typeof yt.ads.requestInterstitialAd === 'function'),
    language: 'en',
    get paused() { return paused; },
    get adBusy() { return !!adBusy; },
    get adKind() { return adBusy && adBusy.kind || null; },
    get loadOutcome() { return currentLoadOutcome; },
    get saveProtected() { return !!yt && !writesAllowed; },
    get saveDirty() { return !!latestSave && latestSave.sequence > savedSequence; },
  };

  function clearHeldMovement() {
    resetActiveInputs();
    if (game && game.P) { game.P.vx = 0; game.P.vz = 0; }
    if (game) game._force = null;
  }

  function setHostPaused(next) {
    const value = !!next;
    if (value === paused) return;
    paused = value;
    clearHeldMovement();
    presentationScheduler.setPaused('host', paused);
    for (const fn of pauseListeners) {
      try { fn(paused); } catch (_) {}
    }
  }

  function waitForHostResume() {
    if (!paused) return Promise.resolve();
    return new Promise(resolve => {
      const off = P.onPauseChange(value => {
        if (value) return;
        off();
        resolve();
      });
    });
  }

  P.onPauseChange = fn => {
    if (typeof fn !== 'function') return () => {};
    pauseListeners.add(fn);
    return () => pauseListeners.delete(fn);
  };

  P.firstFrameReady = () => {
    if (firstFrameReported) return;
    firstFrameReported = true;
    try { yt && yt.game && yt.game.firstFrameReady(); } catch (_) {}
  };

  P.gameReady = () => {
    if (gameReadyReported) return;
    gameReadyReported = true;
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
        const result = classifyLoad(raw, validateLoadedData);
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
        : classifyLoad(previewSave, validateLoadedData);
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

  P.retryLoad = async () => {
    if (!yt) return P.load();
    if (!yt.game || typeof yt.game.loadData !== 'function') {
      currentLoadOutcome = loadResult(LOAD_STATUS.ERROR);
      return currentLoadOutcome;
    }

    // A late success/empty result is already authoritative; explicitly delivering it through
    // load() is what opens the write gate after a previous timeout.
    if (currentLoadOutcome && (
      currentLoadOutcome.status === LOAD_STATUS.LOADED
      || currentLoadOutcome.status === LOAD_STATUS.EMPTY
    )) {
      return P.load();
    }

    // Never race a still-live loadData call. Retry simply waits another bounded window for the
    // same official request, preserving any late result from Task 05.
    if (currentLoadOutcome && currentLoadOutcome.status === LOAD_STATUS.PENDING && loadRequest) {
      return P.load();
    }

    // Rejection or unusable data may be transient. A user-directed retry starts one fresh SDK
    // request, but the write gate remains closed until that request is authoritatively delivered.
    loadRequest = null;
    loadTimedOut = false;
    writesAllowed = false;
    currentLoadOutcome = loadResult(LOAD_STATUS.PENDING);
    return P.load();
  };

  async function writeSaveRaw(raw) {
    if (yt && yt.game && typeof yt.game.saveData === 'function') {
      try { await yt.game.saveData(raw); return true; } catch (_) { return false; }
    }
    if (yt) return false;
    previewSave = raw;
    return true;
  }

  async function drainSaveQueue() {
    let failures = 0;
    while (latestSave && latestSave.sequence > savedSequence) {
      const target = latestSave;
      if (await writeSaveRaw(target.raw)) {
        savedSequence = Math.max(savedSequence, target.sequence);
        failures = 0;
        if (latestSave && latestSave.sequence <= savedSequence) latestSave = null;
        continue;
      }

      failures++;
      if (failures > saveRetryLimit) return false;
      // Retry the newest snapshot, not necessarily the failed one. If another material change
      // arrived while the SDK write was pending, the newer immutable snapshot subsumes it.
      await wait(saveRetryDelayMs * failures);
    }
    return true;
  }

  function ensureSaveDrain() {
    if (saveInFlight) return saveInFlight;
    saveInFlight = drainSaveQueue().finally(() => {
      saveInFlight = null;
    });
    return saveInFlight;
  }

  P.save = data => {
    // YouTube explicitly rejects saveData before a successful loadData. More importantly,
    // keeping this gate closed prevents a timed-out fresh session from overwriting a late save.
    if (yt && !writesAllowed) return Promise.resolve(false);

    // Serialize at the call boundary. The game can keep mutating its live snapshot object while
    // an SDK write is pending without silently changing what this save request means.
    const raw = serializeSave(data);
    if (raw == null) return Promise.resolve(false);

    latestSave = { sequence: ++saveSequence, raw };
    return ensureSaveDrain();
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
        // Save first while state is still coherent, then clear held motion and notify the frame owner.
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
    if (score === lastScore) return Promise.resolve(false);
    if (!yt || !yt.engagement || typeof yt.engagement.sendScore !== 'function') {
      return Promise.resolve(false);
    }

    const existing = scoreInFlight.get(score);
    if (existing) return existing;

    const sequence = ++scoreSequence;
    let dispatch;
    try { dispatch = Promise.resolve(yt.engagement.sendScore({ value: score })); }
    catch (_) { return Promise.resolve(false); }

    let tracked = null;
    tracked = dispatch.then(() => {
      // Async score requests can finish out of order. Only the newest successful request may
      // become the acknowledged score used for duplicate suppression.
      if (sequence >= acknowledgedScoreSequence) {
        acknowledgedScoreSequence = sequence;
        lastScore = score;
      }
      return true;
    }, () => false).finally(() => {
      if (scoreInFlight.get(score) === tracked) scoreInFlight.delete(score);
    });
    scoreInFlight.set(score, tracked);
    return tracked;
  };

  P.requestRewardedAd = async (rewardId = 'pet-cafe-day-bonus-coins') => {
    if (paused || adBusy) return false;
    if (!P.rewardedAvailable) return !P.inPlayables;
    const tx = { kind: 'rewarded', rewardId: String(rewardId) };
    adBusy = tx;
    lastAdAt = Date.now();
    let earned = false;
    try { earned = !!(await yt.ads.requestRewardedAd(tx.rewardId)); }
    catch (_) { earned = false; }
    // Host pause can arrive while the SDK promise is resolving. Keep the shared ad lock and do not
    // return to gameplay callers until resume, so reward application cannot mutate paused play.
    if (paused) await waitForHostResume();
    if (adBusy === tx) adBusy = null;
    return earned;
  };

  P.requestInterstitialAd = async (minGapMs = INTERSTITIAL_GAP_MS) => {
    if (paused || adBusy || !P.interstitialAvailable) return false;
    const now = Date.now();
    if (now - lastAdAt < minGapMs) return false;
    const tx = { kind: 'interstitial' };
    adBusy = tx;
    lastAdAt = now;
    let shown = false;
    try { await yt.ads.requestInterstitialAd(); shown = true; }
    catch (_) { shown = false; }
    // Even a failed SDK request keeps the transaction lock until host resume if the host paused
    // during the request. Continue therefore cannot race another ad format or become stranded.
    if (paused) await waitForHostResume();
    if (adBusy === tx) adBusy = null;
    return shown;
  };

  return P;
}
