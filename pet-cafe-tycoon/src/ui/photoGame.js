// src/ui/photoGame.js — Task 2.1: the shot mini-game's on-screen presentation (plan 3.2). A ring
// shrinks over the pet from 2.2x to 0.6x over 1.4s; a tap (pointerdown) inside that window judges
// Perfect/Good/Ok from the ring's CURRENT scale — photoJudgeQuality (src/sim/world.js), the exact
// same pure function a real tap and the sim's own bot-facing timeout both read, so a player's tap
// and the auto-resolve can never disagree about what a given ring position is worth. Left
// untouched, world.js's stepPhotoBooth auto-resolves the shot as Ok at PHOTO_AUTO_RESOLVE (1.6s)
// regardless of anything in this file — the mini-game is player SKILL, never a requirement, and
// nothing here can make automation stall on it.
//
// CSS lives in src/style.css (.photoRing*/.polaroid*) so both classes follow the same
// "anchor via CSS transform, position via JS left/top" split every other labelLayout-managed
// element in this game already uses; this file only ever sets style.left/top in raw px on the
// elements it owns, per this batch's hard rule for new floating/projected DOM.
//
// No English prose on the play field (program rule 5): the ring is pure shape — two concentric
// guide rings (the Perfect/Good bands) plus the shrinking shot ring itself. The polaroid's only
// "text" is its tip amount, rendered the same way every other coin float in this game is (a
// numeral), never a caption.
import {
  photoRingScale, photoJudgeQuality, PHOTO_TARGET_SCALE, PHOTO_PERFECT_BAND, PHOTO_GOOD_BAND,
} from '../sim/world.js';

// `project(x, y, z, tmp)` writes a world point's screen {sx, sy, visible} into `tmp` — the same
// helper src/render/fx.js already exposes and src/systems/stations.js's own floating button uses
// (see that file's `fbtn`/`fx.project` pattern). `els.fx` is the same floating-DOM layer every
// other world-projected element in this game mounts into.
export function createPhotoGame({ project, els, onResolve, renderPortrait, avoid } = {}) {
  const layer = (els && els.fx) || document.body;

  const root = document.createElement('div');
  root.className = 'photoRing hidden';
  const hit = document.createElement('div'); hit.className = 'photoRingHit';
  const good = document.createElement('div'); good.className = 'photoRingBand good';
  const perfect = document.createElement('div'); perfect.className = 'photoRingBand perfect';
  const shot = document.createElement('div'); shot.className = 'photoRingShot';
  root.append(hit, good, perfect, shot);
  layer.appendChild(root);

  // Matches .photoRingHit's 80x80 box in style.css — the actual tap target, which is what has to
  // stay clear of HUD furniture (the .photoRing root itself is a 0x0 positioning anchor).
  const HIT_SIZE = 80;

  let session = null; // { stationId, t, flown }
  const tmp = { sx: 0, sy: 0, visible: true };

  function place(st) {
    if (typeof project !== 'function') return;
    project(st.x, 1.35, st.z, tmp);
    // This file originally pinned the ring to the pet unconditionally, on the reasoning that
    // detaching it would "break the tap-timing skill". That reasoning does not hold: the player
    // judges WHEN to tap from the shrinking ring against the fixed guide bands, and those three
    // circles are concentric siblings that move together — the pair's screen position carries no
    // information the player uses. Being trapped under the pause button, by contrast, costs the
    // shot outright, which is exactly what a MediaCube reviewer looks for when they drag the frame
    // to its smallest size. So the ring yields. avoid() returns the point unchanged when nothing
    // collides, so in ordinary play it still sits exactly on the pet.
    let sx = tmp.sx, sy = tmp.sy;
    if (typeof avoid === 'function') {
      const moved = avoid(sx, sy, HIT_SIZE, HIT_SIZE);
      if (Array.isArray(moved)) { sx = moved[0]; sy = moved[1]; }
    }
    root.style.left = sx + 'px';
    root.style.top = sy + 'px';
    root.classList.toggle('hidden', !tmp.visible);
  }

  function onPointerDown(e) {
    if (!session || session.flown) return;
    e.preventDefault();
    const quality = photoJudgeQuality(photoRingScale(session.t));
    if (typeof onResolve === 'function') onResolve(session.stationId, quality);
  }
  hit.addEventListener('pointerdown', onPointerDown);

  // The card starts at the booth (world position) and eases toward the Pet Book button —
  // `.meta-pawbook` (src/ui/meta.js) already exists whether or not this file's own wiring has
  // landed, so a missing button just leaves the card drifting straight up and fading in place
  // rather than throwing. `renderPortrait`, when supplied, turns the frame from a blank card into
  // the guest's actual pet (src/render/portrait.js's renderPetPortrait) — optional, so this file
  // never depends on that module directly (see systems/photo.js's own comment on why).
  function flyPolaroid(st, poseId, petKeyStr) {
    const card = document.createElement('div');
    card.className = 'polaroid';
    const frame = document.createElement('div'); frame.className = 'polaroidFrame';
    if (typeof renderPortrait === 'function' && petKeyStr) {
      const dataUrl = renderPortrait(petKeyStr, poseId);
      if (dataUrl) frame.style.backgroundImage = `url(${dataUrl})`;
    }
    card.appendChild(frame);
    layer.appendChild(card);
    if (typeof project === 'function') {
      project(st.x, 1.35, st.z, tmp);
      card.style.left = tmp.sx + 'px';
      card.style.top = tmp.sy + 'px';
    }
    requestAnimationFrame(() => {
      const target = document.querySelector('.meta-pawbook');
      const rect = target && target.getBoundingClientRect();
      if (rect) {
        card.style.left = (rect.left + rect.width / 2) + 'px';
        card.style.top = (rect.top + rect.height / 2) + 'px';
      } else {
        card.style.top = (parseFloat(card.style.top) || 0) - 90 + 'px';
      }
      frame.classList.add('shrink');
      card.classList.add('flying');
    });
    setTimeout(() => card.remove(), 1300);
  }

  return {
    // `poseId` (cats loaf, dogs sit-tilt, bunnies ear-up, hamsters cheeks — plan 3.2) and
    // `petKeyStr` are captured now (while the sim session that named them is still fresh) rather
    // than re-read later from st.session, which may already be cleared by the time the polaroid
    // flies — see update()'s own comment.
    start(st, poseId, petKeyStr) {
      session = { stationId: st.id, t: 0, flown: false, poseId: poseId || null, petKeyStr: petKeyStr || null };
      shot.style.transform = 'scale(' + photoRingScale(0) + ')';
      place(st);
      root.classList.remove('hidden');
    },
    update(dt, st) {
      if (!session || session.stationId !== st.id) return;
      if (st.session && !st.session.resolved) {
        session.t += dt;
        place(st);
        const scale = photoRingScale(session.t);
        shot.style.transform = `scale(${scale})`;
        const d = Math.abs(scale - PHOTO_TARGET_SCALE);
        shot.style.borderColor = d <= PHOTO_PERFECT_BAND ? '#ffd766' : d <= PHOTO_GOOD_BAND ? '#ffffff' : '#ffffffaa';
        return;
      }
      // Resolved — by a tap (onResolve already fired above) or the sim's own auto-timeout. Fly the
      // polaroid exactly once, then just wait for stop() (systems/photo.js calls it once the
      // guest's own FSM has cleared st.session and freed the booth for the next customer).
      if (!session.flown) {
        session.flown = true;
        flyPolaroid(st, session.poseId, session.petKeyStr);
        root.classList.add('hidden');
      }
    },
    stop() {
      session = null;
      root.classList.add('hidden');
    },
    destroy() {
      hit.removeEventListener('pointerdown', onPointerDown);
      root.remove();
    },
  };
}
