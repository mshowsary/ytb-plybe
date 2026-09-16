import { resetActiveInputs } from '../core/input.js';
import { presentationScheduler } from '../core/presentationScheduler.js';

const STYLE_ID = 'pet-cafe-pause-menu-style';
const cafeMark = () => '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 14h16v6a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" fill="#DDB986" stroke="#3E302B" stroke-width="1.8"/><path d="M23 16h2a3 3 0 0 1 0 6h-2" fill="none" stroke="#3E302B" stroke-width="1.8"/><circle cx="11" cy="10" r="2.1" fill="#D98C82"/><circle cx="20" cy="10" r="2.1" fill="#D98C82"/><circle cx="15.5" cy="7" r="2.2" fill="#D98C82"/><path d="M12 13c1-2.7 6-2.7 7 0-1 2.3-6 2.3-7 0z" fill="#D98C82"/></svg>';

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .pause-btn{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));top:calc(12px + env(safe-area-inset-top,0px));z-index:24;width:48px;height:48px;border:0;border-radius:15px;background:#FFF9F1;color:#3E302B;box-shadow:0 4px 14px #271b1524;display:grid;place-items:center;cursor:pointer;pointer-events:auto}
    .pause-btn:focus-visible,.pause-action:focus-visible,.pause-toggle:focus-visible,.cafe-nav:focus-visible,.cafe-link:focus-visible,.cafe-back:focus-visible{outline:3px solid #80977C;outline-offset:2px}
    .pause-root{position:fixed;inset:0;z-index:75;display:grid;place-items:center;padding:max(10px,env(safe-area-inset-top,0px)) max(10px,env(safe-area-inset-right,0px)) max(10px,env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px));box-sizing:border-box;background:#251d1a66;backdrop-filter:blur(4px);overflow:hidden}
    .pause-root.hidden{display:none}.pause-card{width:min(410px,100%);max-height:min(620px,calc(100svh - 20px));overflow:auto;box-sizing:border-box;border-radius:22px;background:#FFF9F1;color:#3E302B;padding:18px;box-shadow:0 20px 60px #0005;border:1px solid #ffffff;font-family:ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif}
    .pause-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;margin-bottom:13px}.pause-brand{display:flex;align-items:center;gap:10px;min-width:0}.pause-paw{width:34px;height:34px;flex:none}.pause-paw svg{display:block;width:100%;height:100%}.pause-title{font:900 22px/1 system-ui,sans-serif}.pause-sub{font:650 12px/1.3 system-ui,sans-serif;opacity:.62;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pause-actions{display:grid;gap:8px;margin-top:12px}.pause-action,.cafe-nav,.cafe-link,.cafe-back{min-height:48px;border:1px solid #3e302b14;border-radius:14px;background:#fff;color:#3E302B;font:850 14px/1 system-ui,sans-serif;cursor:pointer}.pause-action{width:100%;background:#D98C82;color:#2f2420;border-color:#c97970}.pause-action.secondary{background:#fff}
    .cafe-home{display:grid;grid-template-columns:1fr 1fr;gap:9px}.cafe-nav{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:10px 13px;text-align:left;background:#fff}.cafe-nav strong{font-size:15px}.cafe-nav span{font-size:10px;opacity:.55;margin-top:4px}.cafe-nav[data-page="pets"]{background:#fff1e8}.cafe-nav[data-page="cafe"]{background:#f4efe4}.cafe-nav[data-page="journey"]{background:#eef4e9}.cafe-nav[data-page="settings"]{background:#f1eff8}
    .pause-view.hidden{display:none}.cafe-page-head{display:flex;align-items:center;gap:9px;margin-bottom:10px}.cafe-back{width:48px;min-width:48px;padding:0;font-size:23px;background:#00000008}.cafe-page-title{font:900 18px/1 system-ui,sans-serif}.cafe-links{display:grid;gap:8px}.cafe-link{display:flex;align-items:center;justify-content:space-between;padding:0 14px;text-align:left}.cafe-link span{opacity:.55;font-size:11px}.cafe-link[disabled]{opacity:.42;cursor:default}.cafe-note{padding:11px 13px;border-radius:13px;background:#80977c16;font:650 12px/1.4 system-ui,sans-serif;color:#554842}
    .pause-settings{display:grid;gap:8px}.pause-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:58px;padding:5px 9px;box-sizing:border-box;border-radius:14px;background:#fff}.pause-label{font:850 14px/1.1 system-ui,sans-serif}.pause-toggle{flex:none;min-width:72px;min-height:48px;border:0;border-radius:13px;padding:0 11px;background:#ddd8d3;color:#615550;font:850 12px/1 system-ui,sans-serif;cursor:pointer}.pause-toggle.on{background:#80977C;color:#fff}
    body.meta-summary-open .pause-btn{opacity:0;pointer-events:none}
    @media(max-width:359px){.pause-card{padding:13px;border-radius:18px}.pause-title{font-size:19px}.pause-sub{max-width:190px}.cafe-home{grid-template-columns:1fr}.cafe-nav{min-height:48px;padding:7px 12px}.cafe-nav span{display:none}}
    @media(max-height:419px){.pause-root{place-items:center end}.pause-card{width:min(430px,calc(100vw - 20px));max-height:calc(100svh - 10px);padding:10px 12px;border-radius:17px}.pause-head{margin-bottom:7px}.pause-paw{display:none}.pause-sub{display:none}.cafe-home{grid-template-columns:1fr 1fr;gap:6px}.cafe-nav{min-height:48px;padding:7px 10px}.cafe-nav span{display:none}.pause-actions{margin-top:7px}}
    @media(max-height:240px){.pause-card{display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:8px}.pause-head{display:none}.cafe-home{grid-template-columns:1fr 1fr}.pause-actions{margin:0}.pause-view:not(.hidden){grid-column:1}.pause-action{height:48px}}
  `;
  document.head.appendChild(s);
}

export function createPauseMenu(G, platform, routes = {}) {
  installStyle();
  const audio = G.audio;
  if (!G.settings || typeof G.settings !== 'object') G.settings = {};
  if (typeof G.settings.sfx !== 'boolean') G.settings.sfx = true;
  if (typeof G.settings.music !== 'boolean') G.settings.music = true;
  if (typeof G.settings.reducedMotion !== 'boolean') G.settings.reducedMotion = false;
  G.userPaused = false;

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'pause-btn'; button.innerHTML = cafeMark();
  button.setAttribute('aria-label', 'Café menu'); button.title = 'Café menu';
  document.body.appendChild(button);

  const root = document.createElement('div'); root.className = 'pause-root hidden'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
      <div class="pause-head"><div class="pause-brand"><div class="pause-paw">${cafeMark()}</div><div><div class="pause-title" id="pauseTitle">Pet Café</div><div class="pause-sub"></div></div></div></div>
      <div class="pause-view" data-view="home"><div class="cafe-home">
        <button type="button" class="cafe-nav" data-page="pets"><strong>Pets</strong><span>Visitors, album and outfits</span></button>
        <button type="button" class="cafe-nav" data-page="cafe"><strong>Café</strong><span>Orders and station management</span></button>
        <button type="button" class="cafe-nav" data-page="journey"><strong>Journey</strong><span>Rating, rewards and progress</span></button>
        <button type="button" class="cafe-nav" data-page="settings"><strong>Settings</strong><span>Sound and comfort</span></button>
      </div></div>
      <div class="pause-view hidden" data-view="pets"><div class="cafe-page-head"><button class="cafe-back" type="button" aria-label="Back">‹</button><div class="cafe-page-title">Pets</div></div><div class="cafe-links"><button class="cafe-link" type="button" data-route="pets">Pet Visitor Book <span>Collection & album</span></button></div></div>
      <div class="pause-view hidden" data-view="cafe"><div class="cafe-page-head"><button class="cafe-back" type="button" aria-label="Back">‹</button><div class="cafe-page-title">Café</div></div><div class="cafe-links"><button class="cafe-link" type="button" data-route="party">Party order <span class="party-route-state">No active order</span></button><div class="cafe-note">Walk up to a station or build marker to manage it in the café.</div></div></div>
      <div class="pause-view hidden" data-view="journey"><div class="cafe-page-head"><button class="cafe-back" type="button" aria-label="Back">‹</button><div class="cafe-page-title">Journey</div></div><div class="cafe-links"><button class="cafe-link" type="button" data-route="journey">Café Journey <span>Days & mastery</span></button><button class="cafe-link" type="button" data-route="paw">Paw Rating <span>Next milestone</span></button><button class="cafe-link" type="button" data-route="calendar">Daily rewards <span>Calendar</span></button><button class="cafe-link" type="button" data-route="bonus">Available bonus <span class="bonus-route-state">None waiting</span></button></div></div>
      <div class="pause-view hidden" data-view="settings"><div class="cafe-page-head"><button class="cafe-back" type="button" aria-label="Back">‹</button><div class="cafe-page-title">Settings</div></div><div class="pause-settings"><div class="pause-row"><div class="pause-label">Music</div><button type="button" class="pause-toggle" data-setting="music"></button></div><div class="pause-row"><div class="pause-label">SFX</div><button type="button" class="pause-toggle" data-setting="sfx"></button></div><div class="pause-row"><div class="pause-label">Reduced motion</div><button type="button" class="pause-toggle" data-setting="reducedMotion"></button></div></div></div>
      <div class="pause-actions"><button type="button" class="pause-action" data-action="resume">RESUME</button></div>
    </div>`;
  document.body.appendChild(root);

  const resumeBtn = root.querySelector('[data-action="resume"]');
  const sub = root.querySelector('.pause-sub');
  const musicBtn = root.querySelector('[data-setting="music"]');
  const sfxBtn = root.querySelector('[data-setting="sfx"]');
  const motionBtn = root.querySelector('[data-setting="reducedMotion"]');
  let childObserver = null;

  function clearMovement() {
    resetActiveInputs();
    if (G.P) { G.P.vx = 0; G.P.vz = 0; }
    G._force = null;
  }
  function savePrefs() { if (platform && G.snapshot) platform.save(G.snapshot()); }
  function showView(name = 'home') {
    for (const view of root.querySelectorAll('.pause-view')) view.classList.toggle('hidden', view.dataset.view !== name);
    const focus = root.querySelector(`[data-view="${name}"] button:not([disabled])`) || resumeBtn;
    presentationScheduler.afterFrames(() => focus.focus({ preventScroll: true }), 1);
  }
  function sync() {
    audio.setSfx(G.settings.sfx !== false); audio.setMusic(G.settings.music !== false);
    for (const [btn, key] of [[musicBtn, 'music'], [sfxBtn, 'sfx']]) {
      const on = G.settings[key] !== false;
      btn.classList.toggle('on', on); btn.textContent = on ? 'ON' : 'OFF'; btn.setAttribute('aria-pressed', String(on));
    }
    motionBtn.classList.toggle('on', G.settings.reducedMotion === true);
    motionBtn.textContent = G.settings.reducedMotion ? 'ON' : 'OFF';
    motionBtn.setAttribute('aria-pressed', String(G.settings.reducedMotion === true));
    document.body.classList.toggle('reduced-motion', G.settings.reducedMotion === true);
    sub.textContent = `Day ${G.dayState?.day || 1} · ${Math.round(G.coins || 0).toLocaleString('en-US')} coins`;
    const party = root.querySelector('[data-route="party"]');
    const partyAvailable = routes.party?.available?.() === true;
    party.disabled = !partyAvailable;
    root.querySelector('.party-route-state').textContent = partyAvailable ? 'View progress' : 'No active order';
    const bonus = root.querySelector('[data-route="bonus"]');
    const bonusAvailable = routes.bonus?.available?.() === true;
    bonus.disabled = !bonusAvailable;
    root.querySelector('.bonus-route-state').textContent = bonusAvailable ? 'Ready to use' : 'None waiting';
  }
  function open() {
    if (childObserver) return;
    if (!root.classList.contains('hidden')) return;
    clearMovement(); G.userPaused = true; presentationScheduler.setPaused('user', true);
    root.classList.remove('hidden'); root.setAttribute('aria-hidden', 'false'); sync(); showView('home');
  }
  function close() {
    if (root.classList.contains('hidden')) return;
    clearMovement(); root.classList.add('hidden'); root.setAttribute('aria-hidden', 'true');
    G.userPaused = false; presentationScheduler.setPaused('user', false); button.focus({ preventScroll: true });
  }
  function openRoute(name) {
    const route = routes[name];
    if (!route || typeof route.open !== 'function' || route.available?.() === false) return;
    if (childObserver) { childObserver.disconnect(); childObserver = null; }
    root.classList.add('hidden'); root.setAttribute('aria-hidden', 'true');
    route.open();
    if (!route.root) { root.classList.remove('hidden'); root.setAttribute('aria-hidden', 'false'); sync(); return; }
    const child = document.querySelector(route.root);
    if (!child || child.classList.contains('hidden')) { root.classList.remove('hidden'); root.setAttribute('aria-hidden', 'false'); return; }
    childObserver = new MutationObserver(() => {
      if (!child.classList.contains('hidden')) return;
      childObserver.disconnect(); childObserver = null;
      root.classList.remove('hidden'); root.setAttribute('aria-hidden', 'false'); sync(); showView(name === 'pets' ? 'pets' : name === 'party' ? 'cafe' : 'journey');
    });
    childObserver.observe(child, { attributes: true, attributeFilter: ['class'] });
  }
  function toggleSetting(key) { G.settings[key] = !(G.settings[key] !== false); sync(); audio.play('tap'); savePrefs(); }

  button.addEventListener('click', open); resumeBtn.addEventListener('click', close);
  musicBtn.addEventListener('click', () => toggleSetting('music')); sfxBtn.addEventListener('click', () => toggleSetting('sfx'));
  motionBtn.addEventListener('click', () => toggleSetting('reducedMotion'));
  for (const nav of root.querySelectorAll('.cafe-nav')) nav.addEventListener('click', () => showView(nav.dataset.page));
  for (const back of root.querySelectorAll('.cafe-back')) back.addEventListener('click', () => showView('home'));
  for (const link of root.querySelectorAll('[data-route]')) link.addEventListener('click', () => openRoute(link.dataset.route));
  document.addEventListener('keydown', e => {
    if (e.code === 'KeyP' && !e.repeat) { e.preventDefault(); root.classList.contains('hidden') ? open() : close(); }
    else if (e.key === 'Escape' && !root.classList.contains('hidden')) { e.stopPropagation(); close(); }
  }, true);

  sync();
  return { open, close, sync, get isOpen() { return !root.classList.contains('hidden'); } };
}
