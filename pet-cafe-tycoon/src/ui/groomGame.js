// src/ui/groomGame.js — Batch 4b (plan 3.9): the brush-hold mini-game overlay for the grooming
// table (groom1). Structurally this mirrors src/ui/photoGame.js exactly -- read that file's own
// header first -- a world-projected element over the pet, a real DOM tap/hold target, and a pure
// timing model shared with the sim so nothing here can make automation stall on it. The MECHANIC
// itself, once src/sim/world.js's groom mechanics landed (this file was authored in parallel with
// that work -- see the git-log note below), turned out to be photo's own ring-shrink judged THREE
// times in a row rather than something bespoke:
//   - groomPulseScale(t)/groomJudgeQuality(scale)/GROOM_PULSE_START/GROOM_PULSE_END/
//     GROOM_TARGET_SCALE/GROOM_PERFECT_BAND/GROOM_GOOD_BAND (src/sim/world.js) are byte-for-byte
//     the same shape as photoRingScale/photoJudgeQuality/PHOTO_RING_START/PHOTO_RING_END/
//     PHOTO_TARGET_SCALE/PHOTO_PERFECT_BAND/PHOTO_GOOD_BAND, down to the identical band widths
//     (0.08/0.22) -- a real value, sampled from groomPulseScale(st.session.t), IS the "phase"
//     resolveGroomBeat(world, stationId, phase) expects (world.js's own comment: "with a real scale
//     sampled from groomPulseScale"). This file therefore reads st.session.t straight off the WORLD
//     station every frame rather than keeping a second, parallel local clock -- there is only ever
//     one clock to desync from, and it is the same one the sim's own per-beat auto-resolve
//     (GROOM_AUTO_RESOLVE) already uses.
//   - The plan's "3 beats" is st.session.beat/st.session.beatScores, already tracked by
//     stepGroomTable/pushGroomBeat on the world station -- this file reads those directly for the
//     three pips (groomPipState below) rather than keeping its own beat counter.
// The one thing genuinely local to this file is the PRESS/HOLD/RELEASE gesture itself (world.js's
// session has no notion of "armed" -- resolveGroomBeat scores whatever scale it's given the instant
// it's called) and the prefers-reduced-motion substitution.
//
// Divergence from the photo template, restated per program rule 8's "say where it differs": photo
// judges a single TAP against the ring's CURRENT scale and sends a precomputed quality STRING
// (photoJudgeQuality's result) to resolvePhotoShot. This is a hold/release game instead -- the
// player arms a beat with pointerdown and commits it with pointerup -- and it sends the RAW SCALE,
// not a string, letting the sim (which already exposes groomJudgeQuality) be the one true judge.
// There is also no polaroid-equivalent artifact: a groom visit produces no memento, so this file's
// resolved branch just hides, it never flies anything.
//
// No English prose on the play field (program rule 4/5): the paw is icons.js's pawIcon()
// pictogram, the pulse is pure shape, and the three beat pips are undecorated dots.
import { pawIcon } from './icons.js';
import {
  groomPulseScale, groomJudgeQuality, GROOM_BEATS, GROOM_BEAT_SECONDS,
  GROOM_PULSE_START, GROOM_TARGET_SCALE,
} from '../sim/world.js';

export { GROOM_BEATS, GROOM_BEAT_SECONDS };
// Program rule for this overlay: a >= 80x80 tap target. Exported (not just a local const inside the
// DOM factory below) so a test can assert the requirement without constructing any DOM.
export const GROOM_HIT_SIZE = 80;

// ---- pure parts (no DOM) -------------------------------------------------------------------------
// Kept separate from the DOM factory below so they -- "the beat scoring bands, the overlay's model",
// this task's own verify step's exact words -- are testable with a bare `node --test`.

// prefers-reduced-motion substitute for scaling the paw icon: an opacity in [0.4, 1] that peaks
// exactly when the shrinking pulse crosses GROOM_TARGET_SCALE (the beat itself), so a motion-
// sensitive player still gets a rise/fall cue timed to the same instant a moving player would judge
// the ring by. `maxD` is the full possible distance from the target (start scale to target scale),
// so the floor (0.4) is only ever reached at the very top of the shrink, never mid-window.
export function groomPulseOpacity(t) {
  const scale = groomPulseScale(t);
  const maxD = Math.abs(GROOM_PULSE_START - GROOM_TARGET_SCALE) || 1;
  const d = Math.abs(scale - GROOM_TARGET_SCALE);
  return 1 - Math.min(1, d / maxD) * 0.6;
}

// What one beat pip should show, given the world's own session shape ({ beat, beatScores, resolved }
// or null/undefined for no live session). `beatScores[i]` is already the authoritative
// 'perfect'|'good'|'ok' string pushGroomBeat recorded for that beat -- painting from it directly
// (rather than re-deriving a quality here) guarantees the pip can never show a colour the sim
// itself didn't actually award. Returns 'pending' (not yet reached), 'active' (the live beat,
// unresolved), or the recorded quality string for an already-scored beat.
export function groomPipState(pipIndex, session) {
  const scores = (session && session.beatScores) || [];
  if (pipIndex < scores.length) return scores[pipIndex];
  if (session && !session.resolved && pipIndex === scores.length) return 'active';
  return 'pending';
}

// ---- the DOM presentation -------------------------------------------------------------------
// `project(x, y, z, tmp)` and `els.fx` are the exact same helpers src/ui/photoGame.js already uses.
export function createGroomGame({ project, els, onResolve, avoid, reducedMotion } = {}) {
  const layer = (els && els.fx) || document.body;

  const root = document.createElement('div');
  root.className = 'groomRing hidden';
  const glow = document.createElement('div'); glow.className = 'groomPulse';
  const paw = document.createElement('div'); paw.className = 'groomPaw';
  paw.innerHTML = pawIcon();
  const hit = document.createElement('div'); hit.className = 'groomRingHit';
  const pips = document.createElement('div'); pips.className = 'groomPips';
  const pipEls = [];
  for (let i = 0; i < GROOM_BEATS; i++) {
    const pip = document.createElement('span'); pip.className = 'groomPip'; pips.appendChild(pip); pipEls.push(pip);
  }
  root.append(glow, paw, hit, pips);
  layer.appendChild(root);

  const HIT_SIZE = GROOM_HIT_SIZE;
  let session = null;      // { stationId } -- which station's session this overlay is currently showing
  let currentStation = null; // the real world station object handed to the latest update()/start() call
  let armed = false;       // pointerdown seen since the CURRENT beat opened
  let lastBeat = -1;       // st.session.beat as of last frame -- a change (release OR auto-timeout) disarms
  const tmp = { sx: 0, sy: 0, visible: true };

  function reducedMotionActive() {
    if (typeof reducedMotion === 'function') { try { return !!reducedMotion(); } catch (_) { return false; } }
    if (typeof reducedMotion === 'boolean') return reducedMotion;
    try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }

  function place(st) {
    if (typeof project !== 'function') return;
    project(st.x, 1.35, st.z, tmp);
    // A TIMING game, not a targeting one -- none of the paw/pulse/pips carries positional
    // information, so unlike .photoRing this element is always run through avoid() with no
    // special-casing (this file's own header explains why at more length).
    let sx = tmp.sx, sy = tmp.sy;
    if (typeof avoid === 'function') {
      const moved = avoid(sx, sy, HIT_SIZE, HIT_SIZE);
      if (Array.isArray(moved)) { sx = moved[0]; sy = moved[1]; }
    }
    root.style.left = sx + 'px';
    root.style.top = sy + 'px';
    root.classList.toggle('hidden', !tmp.visible);
  }

  function paintPips(st) {
    const s = st && st.session;
    for (let i = 0; i < pipEls.length; i++) {
      const state = groomPipState(i, s);
      pipEls[i].className = 'groomPip' + (state === 'pending' ? '' : state === 'active' ? ' active' : ' done ' + state);
    }
  }

  function onPointerDown(e) {
    if (!session) return;
    e.preventDefault();
    armed = true;
  }
  function onPointerUp(e) {
    if (!session || !armed || !currentStation || !currentStation.session || currentStation.session.resolved) return;
    armed = false;
    e.preventDefault();
    const scale = groomPulseScale(currentStation.session.t);
    if (typeof onResolve === 'function') onResolve(session.stationId, scale);
  }
  hit.addEventListener('pointerdown', onPointerDown);
  hit.addEventListener('pointerup', onPointerUp);
  // A hold that drifts off the 80x80 target (a dragged finger) should disarm rather than leave
  // `armed` stuck true, which could otherwise let a LATER, unrelated pointerup on the same element
  // score a beat the player never actually intended to release.
  hit.addEventListener('pointercancel', () => { armed = false; });

  return {
    start(st) {
      session = { stationId: st.id };
      currentStation = st;
      armed = false;
      lastBeat = st.session ? st.session.beat : 0;
      paintPips(st);
      place(st);
      root.classList.remove('hidden');
    },
    update(dt, st) {
      if (!session || session.stationId !== st.id) return;
      currentStation = st;
      if (st.session && !st.session.resolved) {
        place(st);
        paintPips(st);
        // A beat that just resolved -- by a real release above OR the sim's own per-beat
        // GROOM_AUTO_RESOLVE timeout -- requires a fresh press before the NEXT beat can be
        // released; otherwise a held-down finger from beat 1 would silently auto-score beat 2 the
        // instant its pulse happened to cross the target.
        if (st.session.beat !== lastBeat) { armed = false; lastBeat = st.session.beat; }
        const t = st.session.t;
        if (reducedMotionActive()) {
          paw.style.transform = 'scale(1)';
          paw.style.opacity = String(groomPulseOpacity(t));
        } else {
          paw.style.opacity = '1';
          paw.style.transform = `scale(${groomPulseScale(t)})`;
        }
        glow.style.background = groomJudgeQuality(groomPulseScale(t)) === 'perfect' ? '#ffd76688'
          : groomJudgeQuality(groomPulseScale(t)) === 'good' ? '#ffffff66' : '#ffffff2a';
        return;
      }
      // Resolved (the sim's third beat, or its own auto-timeout past three untouched beats) or the
      // session vanished from under us. Unlike photo there is no physical memento to fly -- this
      // just hides and waits for stop().
      root.classList.add('hidden');
    },
    stop() {
      session = null; currentStation = null; armed = false; lastBeat = -1;
      root.classList.add('hidden');
    },
    destroy() {
      hit.removeEventListener('pointerdown', onPointerDown);
      hit.removeEventListener('pointerup', onPointerUp);
      root.remove();
    },
  };
}
