// Host-aware boot: create → restore cloud save → first frame → game ready.
import { createScene } from './render/scene.js';
import { createGame } from './game.js';
import { createYouTubePlatform } from './platform/youtube.js';
import { createMachineJuice } from './systems/machineJuice.js';
import { createResponsivePolish } from './ui/responsive.js';
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
  const responsive = createResponsivePolish(G);
  platform.bindGame(G);

  const save = await platform.load();
  if (save) G.restore(save);
  platform.sendScore(G.meta && G.meta.reputation);
  responsive.update();

  window.__game = G;
  window.__scene = S;
  window.__audio = G.audio;
  window.__platform = platform;

  S.render();
  platform.firstFrameReady();

  let last = performance.now(), first = true, lastRep = (G.meta && G.meta.reputation) | 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!platform.paused) {
      G.update(dt);
      machineJuice.update(dt);
      responsive.update();
      G.audio.setMusicPhase(G.dayState.phase);
      G.audio.musicUpdate(dt);
      const rep = (G.meta && G.meta.reputation) | 0;
      if (rep !== lastRep) { lastRep = rep; platform.sendScore(rep); }
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
