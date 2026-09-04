// Host-aware boot: create → restore cloud save → first frame → game ready.
import { createScene } from './render/scene.js';
import { createGame } from './game.js';
import { createYouTubePlatform } from './platform/youtube.js';
import { createMachineJuice } from './systems/machineJuice.js';
import { createResponsivePolish } from './ui/responsive.js';
import { createPlayablesShell } from './ui/playablesShell.js';
import { installCleanHud } from './ui/cleanHud.js';
import { installCertificationPolish } from './ui/certificationPolish.js';
import { createPauseMenu } from './ui/pauseMenu.js';
import { createCashTrays } from './render/cashTrays.js';
import { AREA1 } from '../data/area1.js';

const $ = id => document.getElementById(id);
const platform = createYouTubePlatform(window);

function makePauseOverlay() {
  const el = document.createElement('div');
  el.className = 'host-pause hidden';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="host-pause-card"><div class="host-pause-paw">🐾</div><strong>PAUSED</strong><span>Your café is waiting for you</span></div>';
  const style = document.createElement('style');
  style.textContent = `
    .host-pause{position:absolute;inset:0;z-index:80;display:grid;place-items:center;pointer-events:none;background:#2b201f42;backdrop-filter:blur(2px)}
    .host-pause.hidden{display:none}.host-pause-card{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:180px;padding:18px 22px;border-radius:22px;background:#fff8efed;color:#3f332e;border:1px solid #fff;box-shadow:0 10px 35px #0003;font:800 13px/1.2 system-ui,sans-serif;text-align:center}
    .host-pause-card strong{font-size:22px;letter-spacing:.08em}.host-pause-card span{opacity:.68}.host-pause-paw{font-size:25px}
    @media(max-width:380px){.host-pause-card{min-width:150px;padding:14px 18px}.host-pause-card strong{font-size:19px}}
    @media(max-width:240px),(max-height:240px){.host-pause-card{min-width:0;max-width:calc(100vw - 18px);padding:10px 12px;border-radius:16px}.host-pause-card strong{font-size:16px}.host-pause-card span{display:none}.host-pause-paw{font-size:20px}}
  `;
  document.head.appendChild(style); document.body.appendChild(el);
  return el;
}

requestAnimationFrame(() => requestAnimationFrame(boot));

async function boot() {
  installCleanHud();
  const S = createScene($('c'));
  const G = createGame(
    S,
    AREA1,
    { fx: $('fx'), wallet: $('wallet'), joy: $('joy'), joyKnob: $('joyKnob') },
    platform,
  );
  const machineJuice = createMachineJuice(G.world, S.scene);
  const responsive = createResponsivePolish(G);
  const shell = createPlayablesShell();
  installCertificationPolish();
  const cashTrays = createCashTrays(G.world, S.scene);
  const pauseOverlay = makePauseOverlay();
  platform.bindGame(G);

  const save = await platform.load();
  if (save) G.restore(save);
  const pauseMenu = createPauseMenu(G, platform);
  platform.sendScore(G.meta && G.meta.reputation);
  responsive.update(); shell.refresh();

  window.__game = G;
  window.__scene = S;
  window.__audio = G.audio;
  window.__platform = platform;
  window.__pauseMenu = pauseMenu;
  window.__playablesShell = shell;

  S.render();
  platform.firstFrameReady();

  let last = performance.now(), first = true, lastRep = (G.meta && G.meta.reputation) | 0;
  let frameId = 0, wasPaused = false;

  function applyPauseState() {
    const paused = platform.paused || G.userPaused;
    if (paused === wasPaused) return paused;
    wasPaused = paused;
    document.body.classList.toggle('game-paused', paused);
    if (G.audio && G.audio.setPaused) G.audio.setPaused(paused);
    return paused;
  }

  function scheduleFrame() {
    if (!frameId && !platform.paused) frameId = requestAnimationFrame(frame);
  }

  platform.onPauseChange(hostPaused => {
    pauseOverlay.classList.toggle('hidden', !hostPaused);
    applyPauseState();
    if (hostPaused) {
      // Certification requirement: no game-frame execution keeps ticking in the background.
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    } else {
      last = performance.now();
      scheduleFrame();
    }
  });

  function frame(now) {
    frameId = 0;
    if (platform.paused) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const paused = applyPauseState();

    if (!paused) {
      G.update(dt);
      machineJuice.update(dt);
      cashTrays.update(dt);
      responsive.update();
      shell.update();
      G.audio.setMusicPhase(G.dayState.phase);
      G.audio.musicUpdate(dt);
      const rep = (G.meta && G.meta.reputation) | 0;
      if (rep !== lastRep) { lastRep = rep; platform.sendScore(rep); }
      if (S.noteFrame) S.noteFrame(dt);
      S.render();
    }

    if (first) {
      first = false;
      $('loading').classList.add('hidden');
      platform.gameReady();
    }
    scheduleFrame();
  }

  pauseOverlay.classList.toggle('hidden', !platform.paused);
  applyPauseState();
  scheduleFrame();
}
