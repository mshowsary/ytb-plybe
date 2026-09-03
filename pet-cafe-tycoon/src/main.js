// Host-aware boot: create → restore cloud save → first frame → game ready.
import { createScene } from './render/scene.js';
import { createGame } from './game.js';
import { createYouTubePlatform } from './platform/youtube.js';
import { createMachineJuice } from './systems/machineJuice.js';
import { AREA1 } from '../data/area1.js';

const $ = id => document.getElementById(id);
const platform = createYouTubePlatform(window);

requestAnimationFrame(() => requestAnimationFrame(boot));

async function boot() {
  const S = createScene($('c'));
  const G = createGame(
    S,
    AREA1,
    { fx: $('fx'), wallet: $('wallet'), joy: $('joy'), joyKnob: $('joyKnob') },
    platform,
  );
  const machineJuice = createMachineJuice(G.world, S.scene);
  platform.bindGame(G);

  // Restore before exposing the café so a returning player never watches a fresh café pop into
  // their real progression state. A platform timeout prevents a broken cloud call from blocking boot.
  const save = await platform.load();
  if (save) G.restore(save);

  window.__game = G;
  window.__scene = S;
  window.__audio = G.audio;
  window.__platform = platform;

  // Paint one complete restored frame before releasing YouTube's loading screen.
  S.render();
  platform.firstFrameReady();

  let last = performance.now(), first = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!platform.paused) {
      G.update(dt);
      machineJuice.update(dt);
    }
    if (S.noteFrame) S.noteFrame(dt);
    S.render();

    if (first) {
      first = false;
      $('loading').classList.add('hidden');
      platform.gameReady();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
