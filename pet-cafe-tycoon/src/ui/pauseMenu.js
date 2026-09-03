const STYLE_ID = 'pet-cafe-pause-menu-style';

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .pause-btn{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));top:calc(12px + env(safe-area-inset-top,0px));z-index:24;width:48px;height:48px;border:0;border-radius:16px;background:#fffdf8ed;color:#3b2e2a;box-shadow:0 4px 0 #0001,0 8px 18px #0002;font:900 19px/1 system-ui,sans-serif;display:grid;place-items:center;cursor:pointer;pointer-events:auto}
    .pause-btn:focus-visible,.pause-action:focus-visible,.pause-toggle:focus-visible{outline:3px solid #8b7cf6;outline-offset:2px}
    .pause-root{position:fixed;inset:0;z-index:75;display:grid;place-items:center;padding:16px max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));box-sizing:border-box;background:#251d1a66;backdrop-filter:blur(5px)}
    .pause-root.hidden{display:none}.pause-card{width:min(390px,100%);max-height:min(560px,90vh);overflow:auto;box-sizing:border-box;border-radius:26px;background:#fff4e6;color:#3b2e2a;padding:22px;box-shadow:0 20px 60px #0005;font-family:system-ui,sans-serif}
    .pause-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}.pause-paw{font-size:28px}.pause-title{font:900 25px/1 system-ui,sans-serif}.pause-sub{font:700 12px/1.25 system-ui,sans-serif;opacity:.58;margin-top:4px}
    .pause-row{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:64px;padding:10px 12px;box-sizing:border-box;border-radius:17px;background:#ffffffa8;margin-bottom:10px}.pause-copy{min-width:0}.pause-label{font:900 15px/1.1 system-ui,sans-serif}.pause-desc{font:700 11px/1.25 system-ui,sans-serif;opacity:.58;margin-top:4px}
    .pause-toggle{flex:none;min-width:78px;min-height:44px;border:0;border-radius:999px;padding:0 12px;background:#d9d3cd;color:#615550;font:900 12px/1 system-ui,sans-serif;cursor:pointer}.pause-toggle.on{background:#8b7cf6;color:#fff}.pause-toggle.host{opacity:.5;cursor:default}
    .pause-actions{display:grid;gap:9px;margin-top:16px}.pause-action{min-height:52px;border:0;border-radius:16px;background:#ff8a80;color:#3b2e2a;font:900 15px/1 system-ui,sans-serif;cursor:pointer}.pause-action.secondary{background:#ffffffaa}.pause-note{margin-top:12px;font:700 10px/1.35 system-ui,sans-serif;opacity:.5;text-align:center}
    body.meta-summary-open .pause-btn{opacity:0;pointer-events:none}
    @media(max-width:380px){.pause-btn{right:calc(8px + env(safe-area-inset-right,0px));top:calc(8px + env(safe-area-inset-top,0px))}.pause-card{padding:17px;border-radius:22px}.pause-title{font-size:21px}.pause-row{min-height:58px}.pause-action{min-height:48px}}
    @media(orientation:landscape) and (max-height:520px){.pause-card{max-height:92vh;padding:15px}.pause-head{margin-bottom:10px}.pause-row{min-height:52px;margin-bottom:7px;padding:7px 10px}.pause-actions{margin-top:10px}.pause-note{display:none}}
  `;
  document.head.appendChild(s);
}

export function createPauseMenu(G, platform) {
  installStyle();
  const audio = G.audio;
  if (!G.settings || typeof G.settings !== 'object') G.settings = {};
  if (typeof G.settings.sfx !== 'boolean') G.settings.sfx = true;
  if (typeof G.settings.music !== 'boolean') G.settings.music = true;
  G.userPaused = false;

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'pause-btn'; button.textContent = 'Ⅱ';
  button.setAttribute('aria-label', 'Pause and settings'); button.title = 'Pause / settings';
  document.body.appendChild(button);

  const root = document.createElement('div'); root.className = 'pause-root hidden';
  root.innerHTML = `
    <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
      <div class="pause-head"><div class="pause-paw">🐾</div><div><div class="pause-title" id="pauseTitle">Café paused</div><div class="pause-sub">Take a break. Nothing in the café moves while this menu is open.</div></div></div>
      <div class="pause-row"><div class="pause-copy"><div class="pause-label">Music</div><div class="pause-desc">Cozy adaptive café soundtrack</div></div><button type="button" class="pause-toggle" data-setting="music"></button></div>
      <div class="pause-row"><div class="pause-copy"><div class="pause-label">Sound effects</div><div class="pause-desc">Coins, machines, pets and interaction cues</div></div><button type="button" class="pause-toggle" data-setting="sfx"></button></div>
      <div class="pause-actions"><button type="button" class="pause-action" data-action="resume">RESUME</button></div>
      <div class="pause-note">YouTube's own mute setting always takes priority over these preferences.</div>
    </div>`;
  document.body.appendChild(root);

  const musicBtn = root.querySelector('[data-setting="music"]');
  const sfxBtn = root.querySelector('[data-setting="sfx"]');
  const resumeBtn = root.querySelector('[data-action="resume"]');

  function savePrefs() {
    if (platform && G.snapshot) platform.save(G.snapshot());
  }
  function sync() {
    audio.setSfx(G.settings.sfx !== false);
    audio.setMusic(G.settings.music !== false);
    for (const [btn, key] of [[musicBtn, 'music'], [sfxBtn, 'sfx']]) {
      const on = G.settings[key] !== false;
      btn.classList.toggle('on', on); btn.textContent = on ? 'ON' : 'OFF';
      btn.setAttribute('aria-pressed', String(on));
    }
  }
  function open() {
    if (!root.classList.contains('hidden')) return;
    G.userPaused = true; root.classList.remove('hidden');
    sync(); requestAnimationFrame(() => resumeBtn.focus({ preventScroll: true }));
  }
  function close() {
    if (root.classList.contains('hidden')) return;
    root.classList.add('hidden'); G.userPaused = false; button.focus({ preventScroll: true });
  }
  function toggleSetting(key) {
    G.settings[key] = !(G.settings[key] !== false);
    sync(); audio.play('tap'); savePrefs();
  }

  button.addEventListener('click', open);
  resumeBtn.addEventListener('click', close);
  musicBtn.addEventListener('click', () => toggleSetting('music'));
  sfxBtn.addEventListener('click', () => toggleSetting('sfx'));
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyP' && !e.repeat) { e.preventDefault(); root.classList.contains('hidden') ? open() : close(); }
    else if (e.key === 'Escape' && !root.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);

  sync();
  return { open, close, sync, get isOpen() { return !root.classList.contains('hidden'); } };
}
