// src/platform.js — the YouTube Playables host, or a local stand-in when the game runs on its own.
// SDK calls used: game.firstFrameReady / gameReady / loadData / saveData, system.onPause / onResume /
// isAudioEnabled / onAudioEnabledChange, engagement.sendScore, ads.requestRewardedAd.
const LOCAL_KEY = 'pet-cafe-v2-save';

export function createPlatform() {
  const yt = globalThis.ytgame && globalThis.ytgame.IN_PLAYABLES_ENV ? globalThis.ytgame : null;
  const inPlayables = !!yt;
  // Never write a save until the host has actually handed us the player's data: a slow load that
  // timed out into a fresh café must not overwrite their real progress.
  let firstFrame = false, ready = false, adBusy = false, lastSave = '', writesAllowed = !inPlayables;
  const P = { inPlayables };

  P.firstFrameReady = () => { if (firstFrame) return; firstFrame = true; try { yt?.game?.firstFrameReady?.(); } catch (_) {} };
  P.gameReady = () => { if (ready) return; ready = true; try { yt?.game?.gameReady?.(); } catch (_) {} };

  P.load = async () => {
    try {
      if (inPlayables) {
        // If the load is too slow we start a fresh café but keep writes locked for this session, so
        // the late real save is never overwritten by it.
        let timedOut = false;
        const real = yt.game.loadData().then(raw => { if (!timedOut) writesAllowed = true; return raw; });
        const raw = await Promise.race([real, new Promise(r => setTimeout(() => { timedOut = true; r(null); }, 2500))]);
        return raw ? JSON.parse(raw) : null;
      }
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  };
  P.save = data => {
    if (!writesAllowed) return;
    let raw; try { raw = JSON.stringify(data); } catch (_) { return; }
    if (raw === lastSave) return; lastSave = raw;
    try {
      if (inPlayables) yt.game.saveData(raw).catch?.(() => {});
      else localStorage.setItem(LOCAL_KEY, raw);
    } catch (_) {}
  };
  P.reset = () => { try { localStorage.removeItem(LOCAL_KEY); } catch (_) {} };

  P.onPause = fn => { try { yt?.system?.onPause?.(() => fn(true)); yt?.system?.onResume?.(() => fn(false)); } catch (_) {} };
  P.audioEnabled = () => { try { return inPlayables ? !!yt.system.isAudioEnabled() : true; } catch (_) { return true; } };
  P.onAudioChange = fn => { try { yt?.system?.onAudioEnabledChange?.(fn); } catch (_) {} };
  P.sendScore = v => { try { yt?.engagement?.sendScore?.({ value: Math.max(0, Math.floor(v)) }); } catch (_) {} };

  // Rewarded ad. Outside Playables it simply grants (so the reward can be seen during development).
  P.rewardedAvailable = () => !inPlayables || !!(yt && yt.ads && typeof yt.ads.requestRewardedAd === 'function');
  P.rewarded = async id => {
    if (adBusy) return false;
    if (!inPlayables) return true;
    if (!P.rewardedAvailable()) return false;
    adBusy = true;
    try { return !!(await yt.ads.requestRewardedAd(id)); } catch (_) { return false; } finally { adBusy = false; }
  };
  return P;
}
