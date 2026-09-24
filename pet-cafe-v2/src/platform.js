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

  const pauseFns = [];
  P.onPause = fn => { pauseFns.push(fn); try { yt?.system?.onPause?.(() => fn(true)); yt?.system?.onResume?.(() => fn(false)); } catch (_) {} };
  P.audioEnabled = () => { try { return inPlayables ? !!yt.system.isAudioEnabled() : true; } catch (_) { return true; } };
  P.onAudioChange = fn => { try { yt?.system?.onAudioEnabledChange?.(fn); } catch (_) {} };
  P.sendScore = v => { try { yt?.engagement?.sendScore?.({ value: Math.max(0, Math.floor(v)) }); } catch (_) {} };

  // Rewarded ad. Outside Playables a stand-in plays instead: the game pauses behind a ten-second
  // "video", as it will for a real ad, so testing on the web feels the true cost of every reward (it
  // used to grant instantly, which made every ▶ offer free and the whole economy feel twice as fast).
  // Tests can skip it with ?fastads or localStorage 'pc-fastads' = '1'.
  const fastAds = (() => { try { return /[?&]fastads/.test(location.search) || localStorage.getItem('pc-fastads') === '1'; } catch (_) { return false; } })();
  function standInAd() {
    if (fastAds) return Promise.resolve(true);
    adBusy = true; pauseFns.forEach(f => f(true));
    return new Promise(res => {
      const el = document.createElement('div'); el.className = 'fakead';
      el.innerHTML = '<div class="fa-card"><div class="fa-tv">📺</div><b>Video ad</b><small>test build · a real ad plays here on YouTube</small><div class="fa-ring"><span>10</span></div><button class="fa-close hidden">✕</button></div>';
      document.body.appendChild(el);
      const num = el.querySelector('span'), btn = el.querySelector('.fa-close');
      let left = 10;
      const tick = setInterval(() => { left--; num.textContent = Math.max(0, left); if (left <= 0) { clearInterval(tick); btn.classList.remove('hidden'); } }, 1000);
      btn.addEventListener('click', () => { el.remove(); adBusy = false; pauseFns.forEach(f => f(false)); res(true); });
    });
  }
  P.rewardedAvailable = () => !inPlayables || !!(yt && yt.ads && typeof yt.ads.requestRewardedAd === 'function');
  P.rewarded = async id => {
    if (adBusy) return false;
    if (!inPlayables) return standInAd();
    if (!P.rewardedAvailable()) return false;
    adBusy = true;
    try { return !!(await yt.ads.requestRewardedAd(id)); } catch (_) { return false; } finally { adBusy = false; }
  };
  return P;
}
