// src/main.js — boot: loading paint → firstFrameReady → world → gameReady
import { createScene } from './render/scene.js';
import { createGame } from './game.js';
import { AREA1 } from '../data/area1.js';
const yt = (typeof ytgame !== 'undefined' && ytgame && ytgame.IN_PLAYABLES_ENV) ? ytgame : null;
const $ = id => document.getElementById(id);
requestAnimationFrame(() => requestAnimationFrame(boot));
function boot() {
  try { if (yt) yt.game.firstFrameReady(); } catch (e) {}
  const S = createScene($('c'));
  const G = createGame(S, AREA1, { fx: $('fx'), wallet: $('wallet'), joy: $('joy'), joyKnob: $('joyKnob') });
  window.__game = G; window.__scene = S; window.__audio = G.audio;
  let last = performance.now(), first = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    G.update(dt); S.render();
    if (first) { first = false; $('loading').classList.add('hidden'); try { if (yt) yt.game.gameReady(); } catch (e) {} }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
