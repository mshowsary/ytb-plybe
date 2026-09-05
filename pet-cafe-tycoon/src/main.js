// Host-aware boot: paint recovery shell → resolve cloud save → create playable runtime → game ready.
import { createScene } from './render/scene.js';
import { createGame } from './game.js';
import { createYouTubePlatform, LOAD_STATUS } from './platform/youtube.js';
import { createMachineJuice } from './systems/machineJuice.js';
import { installPetFriendship } from './systems/petFriendship.js';
import { installServiceFriction } from './systems/serviceFriction.js';
import { createPetMess } from './systems/petMess.js';
import { createBaristaWorker } from './systems/baristaWorker.js';
import { createResponsivePolish } from './ui/responsive.js';
import { createPlayablesShell } from './ui/playablesShell.js';
import { installCleanHud } from './ui/cleanHud.js';
import { installCertificationPolish } from './ui/certificationPolish.js';
import { createInteractionCoach } from './ui/interactionCoach.js';
import { installReliefAttention } from './ui/reliefAttention.js';
import { installServiceSummary } from './ui/serviceSummary.js';
import { createPauseMenu } from './ui/pauseMenu.js';
import { createCashTrays } from './render/cashTrays.js';
import { createCoffeePolish } from './render/coffeePolish.js';
import { AREA1 } from '../data/area1.js';

const $ = id => document.getElementById(id);
const platform = createYouTubePlatform(window);
window.__platform = platform;

function makeBootRecovery() {
  const root = $('loading');
  const spin = root.querySelector('.spin');
  const label = root.querySelector('.lbl');
  let detail = root.querySelector('.boot-detail');
  let action = root.querySelector('.boot-retry');

  if (!detail) {
    detail = document.createElement('div');
    detail.className = 'boot-detail hidden';
    root.appendChild(detail);
  }
  if (!action) {
    action = document.createElement('button');
    action.type = 'button';
    action.className = 'boot-retry hidden';
    root.appendChild(action);
  }
  if (!document.getElementById('boot-recovery-style')) {
    const style = document.createElement('style');
    style.id = 'boot-recovery-style';
    style.textContent = `
      #loading .boot-detail{max-width:min(360px,calc(100vw - 36px));box-sizing:border-box;text-align:center;letter-spacing:0;font-size:14px;line-height:1.45;font-weight:650;opacity:.72}
      #loading .boot-retry{min-height:48px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:0 24px;border:0;border-radius:999px;background:var(--coral);color:#fff;font:850 14px/1 system-ui,sans-serif;letter-spacing:.06em;box-shadow:0 5px 0 #0001,0 9px 22px #0002;cursor:pointer;touch-action:manipulation}
      #loading .boot-retry:disabled{opacity:.55;cursor:default}
      #loading[data-state="renderer-unavailable"] .spin,#loading[data-state="load-error"] .spin,#loading[data-state="invalid-save"] .spin,#loading[data-state="startup-error"] .spin{display:none}
      @media(max-width:240px),(max-height:240px){#loading{gap:9px}#loading .boot-detail{font-size:11px;line-height:1.3;max-width:calc(100vw - 20px)}#loading .boot-retry{min-height:44px;padding:0 16px;font-size:12px}}
    `;
    document.head.appendChild(style);
  }

  function show(state, title, message = '', actionLabel = '', onAction = null) {
    root.dataset.state = state;
    root.classList.remove('hidden');
    label.textContent = title;
    detail.textContent = message;
    detail.classList.toggle('hidden', !message);
    action.classList.toggle('hidden', !onAction);
    action.disabled = false;
    action.textContent = actionLabel;
    action.onclick = onAction ? () => {
      action.disabled = true;
      try {
        const result = onAction();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (_) {}
    } : null;
  }

  return {
    busy(title = 'LOADING', message = '') {
      show('loading', title, message);
    },
    loadFailure(status, retry) {
      if (status === LOAD_STATUS.PENDING) {
        show(
          'load-pending',
          'STILL CONNECTING',
          "Your saved café is taking longer than expected. We won't start or save over it until it arrives.",
          'TRY AGAIN',
          retry,
        );
      } else if (status === LOAD_STATUS.INVALID) {
        show(
          'invalid-save',
          'SAVE NEEDS RETRY',
          "The cloud save couldn't be read safely. We won't replace it with a new game.",
          'RETRY',
          retry,
        );
      } else {
        show(
          'load-error',
          "CAN'T LOAD SAVE",
          "We couldn't reach your saved café. Your progress has not been reset or overwritten.",
          'RETRY',
          retry,
        );
      }
    },
    rendererFailure(reload) {
      show(
        'renderer-unavailable',
        'GRAPHICS UNAVAILABLE',
        "Pet Café couldn't start the 3D renderer on this device. Reloading may recover the graphics context.",
        'RELOAD',
        reload,
      );
    },
    startupFailure(reload) {
      show(
        'startup-error',
        'STARTUP INTERRUPTED',
        "The café couldn't finish starting. Reload to try again without changing your saved progress.",
        'RELOAD',
        reload,
      );
    },
    hide() {
      root.dataset.state = 'ready';
      root.classList.add('hidden');
    },
  };
}

function makePauseOverlay() {
  const el = document.createElement('div');
  el.className = 'host-pause hidden';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<div class="host-pause-card"><div class="host-pause-paw">🐾</div><strong>PAUSED</strong><span>Your café is waiting for you</span></div>';
  const style = document.createElement('style');
  style.textContent = `
    .host-pause{position:absolute;inset:0;z-index:80;display:grid;place-items:center;pointer-events:auto;touch-action:none;background:#2b201f42;backdrop-filter:blur(2px)}
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
  const bootUi = makeBootRecovery();
  bootUi.busy('LOADING', 'Checking your saved café…');

  // The static loading shell has already survived a full paint before this nested RAF runs.
  // Report that first visible frame promptly; gameReady remains reserved for actual playable state.
  platform.firstFrameReady();

  try { installCleanHud(); }
  catch (error) {
    console.error('[Pet Café] HUD boot failed', error);
    bootUi.startupFailure(() => location.reload());
    return;
  }

  let S;
  try {
    S = createScene($('c'));
    // Force one real renderer submission now so context/setup failures are surfaced here instead
    // of becoming an unexplained spinner later in the frame loop.
    S.render();
  } catch (error) {
    console.error('[Pet Café] renderer unavailable', error);
    bootUi.rendererFailure(() => location.reload());
    return;
  }

  let gameStarted = false;
  let loadAttemptBusy = false;

  const startPlayable = load => {
    if (gameStarted) return;
    gameStarted = true;
    bootUi.busy(
      'OPENING CAFÉ',
      load.status === LOAD_STATUS.LOADED ? 'Restoring your progress…' : 'Preparing a new café…',
    );
    try {
      startGame(S, load, bootUi);
    } catch (error) {
      console.error('[Pet Café] runtime startup failed', error);
      bootUi.startupFailure(() => location.reload());
    }
  };

  const handleLoadOutcome = load => {
    if (load && (load.status === LOAD_STATUS.LOADED || load.status === LOAD_STATUS.EMPTY)) {
      startPlayable(load);
      return;
    }
    const status = load && load.status ? load.status : LOAD_STATUS.ERROR;
    bootUi.loadFailure(status, () => attemptLoad(true));
  };

  const attemptLoad = async retry => {
    if (loadAttemptBusy || gameStarted) return;
    loadAttemptBusy = true;
    bootUi.busy(retry ? 'RETRYING' : 'LOADING', retry ? 'Checking your cloud save again…' : 'Checking your saved café…');
    let load;
    try {
      load = retry ? await platform.retryLoad() : await platform.load();
    } catch (error) {
      console.error('[Pet Café] save load failed', error);
      load = { status: LOAD_STATUS.ERROR };
    }
    loadAttemptBusy = false;
    handleLoadOutcome(load);
  };

  await attemptLoad(false);
}

function startGame(S, load, bootUi) {
  const G = createGame(
    S,
    AREA1,
    { fx: $('fx'), wallet: $('wallet'), joy: $('joy'), joyKnob: $('joyKnob') },
    platform,
  );
  const machineJuice = createMachineJuice(G.world, S.scene);
  const coffeePolish = createCoffeePolish(G.world, S.scene, G.owner);
  const petFriendship = installPetFriendship(G, platform);
  const serviceFriction = installServiceFriction(G);
  const petMess = createPetMess(G, S.scene);
  const baristaWorker = createBaristaWorker(G, S.scene);
  const reliefAttention = installReliefAttention(G);
  const serviceSummary = installServiceSummary(G);
  const responsive = createResponsivePolish(G);
  const shell = createPlayablesShell();
  installCertificationPolish();
  const interactionCoach = createInteractionCoach(G, S);
  const cashTrays = createCashTrays(G.world, S.scene);
  const pauseOverlay = makePauseOverlay();
  platform.bindGame(G);

  if (load.status === LOAD_STATUS.LOADED) G.restore(load.data);
  petFriendship.refresh();
  coffeePolish.update();
  const pauseMenu = createPauseMenu(G, platform);
  platform.sendScore(G.meta && G.meta.reputation);
  responsive.update(); shell.refresh();

  window.__game = G;
  window.__scene = S;
  window.__audio = G.audio;
  window.__pauseMenu = pauseMenu;
  window.__playablesShell = shell;
  window.__interactionCoach = interactionCoach;
  window.__petFriendship = petFriendship;
  window.__serviceFriction = serviceFriction;
  window.__petMess = petMess;
  window.__baristaWorker = baristaWorker;
  window.__reliefAttention = reliefAttention;
  window.__serviceSummary = serviceSummary;
  window.__coffeePolish = coffeePolish;

  S.render();

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

  const blockHostInteraction = e => {
    if (!platform.paused) return;
    e.stopImmediatePropagation();
  };
  for (const type of ['pointerdown','pointerup','click','touchstart','touchend','keydown','keyup']) {
    document.addEventListener(type, blockHostInteraction, true);
  }

  function scheduleFrame() {
    if (!frameId && !platform.paused) frameId = requestAnimationFrame(frame);
  }

  platform.onPauseChange(hostPaused => {
    pauseOverlay.classList.toggle('hidden', !hostPaused);
    document.body.classList.toggle('host-paused', hostPaused);
    applyPauseState();
    if (hostPaused) {
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
      baristaWorker.update(dt);
      petMess.update(dt);
      machineJuice.update(dt);
      coffeePolish.update();
      cashTrays.update(dt);
      responsive.update();
      shell.update();
      interactionCoach.update(dt);
      G.audio.setMusicPhase(G.dayState.phase);
      G.audio.musicUpdate(dt);
      const rep = (G.meta && G.meta.reputation) | 0;
      if (rep !== lastRep) { lastRep = rep; platform.sendScore(rep); }
      if (S.noteFrame) S.noteFrame(dt);
      S.render();
    } else interactionCoach.hide();

    if (first) {
      first = false;
      bootUi.hide();
      platform.gameReady();
    }
    scheduleFrame();
  }

  pauseOverlay.classList.toggle('hidden', !platform.paused);
  document.body.classList.toggle('host-paused', platform.paused);
  applyPauseState();
  scheduleFrame();
}
